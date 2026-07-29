/**
 * High-level notification triggers — call these from route handlers.
 * All functions are fire-and-forget: they log errors but never throw,
 * so notification failures never break primary operations.
 */

import { db, usersTable, candidatesTable, branchesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  sendEmail,
  getAppBaseUrl,
  renderOfferInvitationEmail,
  renderOtpEmail,
  renderSheetConfirmationEmail,
  renderTaskAssignedEmail,
  renderSheetCompletedEmail,
  renderTerminationTaskEmail,
  renderTerminationCompletedEmail,
  renderTerminationRejectedEmail,
} from "../services/email";
import { sendOfferLinkMessage } from "../services/messenger";
import { logger } from "./logger";

/** Routing step type → human label (mirrors STEP_ORDER in routingSheet.ts) */
const ROUTING_STEP_LABELS: Record<string, string> = {
  hr_registration: "Регистрация HR",
  marketing_photo: "Фотосъёмка (Маркетинг)",
  tb_briefing: "Инструктаж по ТБ",
  it_accounts: "Создание учётных записей (IT)",
  audit_training: "Обучение (Аудит)",
  doctor_profile: "Профиль врача",
  site_publication: "Публикация на сайте",
  final_review: "Финальная проверка",
};

/** Termination step type → human label */
const TERMINATION_STEP_LABELS: Record<string, string> = {
  chief_physician_off: "Согласование главного врача",
  it_revocation: "Отзыв IT-доступов",
  marketing_off: "Маркетинговое оформление",
  accounting_off: "Финансовый расчёт",
  security_off: "Проверка безопасности",
  hr_exit_interview: "Интервью HR-адаптации",
  hr_close: "Закрытие HR-специалистом",
  medical_equipment_off: "Медтехника и оборудование",
  account_manager_delete_profile: "Удаление профиля с сайтов",
};

// ─── Helper ───────────────────────────────────────────────────────────────────

async function getUserEmailsByRole(role: string): Promise<{ email: string; fullName: string }[]> {
  return db
    .select({ email: usersTable.email, fullName: usersTable.fullName })
    .from(usersTable)
    .where(eq(usersTable.role, role as any));
}

function fireAndForget(p: Promise<unknown>): void {
  p.catch((err) => logger.error({ err }, "[notifications] Unhandled error"));
}

// ─── Offer / onboarding ───────────────────────────────────────────────────────

/**
 * Called when recruiter creates an offer.
 * Sends offer invitation email + messenger message to candidate.
 */
export function notifyOfferSent(opts: {
  candidateId: number;
  offerId: number;
  offerToken: string;
  companyName: string;
  message?: string | null;
}): void {
  fireAndForget(
    (async () => {
      const [candidate] = await db
        .select()
        .from(candidatesTable)
        .where(eq(candidatesTable.id, opts.candidateId));
      if (!candidate?.email) return;

      const baseUrl = await getAppBaseUrl();
      const offerLink = `${baseUrl}/routing-sheet/offer/${opts.offerToken}`;

      const tpl = await renderOfferInvitationEmail({
        candidateName: candidate.fullName,
        offerLink,
        companyName: opts.companyName,
        message: opts.message,
      });

      await sendEmail({
        to: candidate.email,
        subject: tpl.subject,
        htmlBody: tpl.htmlBody,
        objectType: "offer",
        objectId: opts.offerId,
      });

      // Messenger: send alongside email if phone is available
      if (candidate.phone) {
        await sendOfferLinkMessage({
          phone: candidate.phone,
          candidateName: candidate.fullName,
          offerLink,
          companyName: opts.companyName,
          objectId: opts.offerId,
        });
      }
    })(),
  );
}

/**
 * Called when candidate clicks "Accept" (OTP trigger).
 * Sends OTP email to candidate.
 */
export function notifyOtpGenerated(opts: {
  candidateId: number;
  offerId: number;
  otpCode: string;
}): void {
  fireAndForget(
    (async () => {
      const [candidate] = await db
        .select()
        .from(candidatesTable)
        .where(eq(candidatesTable.id, opts.candidateId));
      if (!candidate?.email) return;

      const tpl = await renderOtpEmail({ candidateName: candidate.fullName, otpCode: opts.otpCode });
      await sendEmail({
        to: candidate.email,
        subject: tpl.subject,
        htmlBody: tpl.htmlBody,
        objectType: "offer",
        objectId: opts.offerId,
      });
    })(),
  );
}

/**
 * Called after OTP verified (candidate accepted offer).
 * 1. Sends confirmation link email to candidate
 * 2. Sends task assignment emails to each step's assigned role
 */
export function notifyOfferAccepted(opts: {
  candidateId: number;
  routingSheetId: number;
  statusToken: string;
  steps: Array<{ stepType: string; assignedRole: string; id: number }>;
}): void {
  fireAndForget(
    (async () => {
      const [candidate] = await db
        .select()
        .from(candidatesTable)
        .where(eq(candidatesTable.id, opts.candidateId));
      if (!candidate) return;

      const baseUrl = await getAppBaseUrl();
      const statusLink = `${baseUrl}/routing-sheet/status/${opts.statusToken}`;

      // Confirmation to candidate
      const confirmTpl = await renderSheetConfirmationEmail({
        candidateName: candidate.fullName,
        statusLink,
      });
      await sendEmail({
        to: candidate.email,
        subject: confirmTpl.subject,
        htmlBody: confirmTpl.htmlBody,
        objectType: "routing_sheet",
        objectId: opts.routingSheetId,
      });

      // Task assignment to each role
      const taskLink = `${baseUrl}/routing-sheet/my-tasks`;
      for (const step of opts.steps) {
        if (step.stepType === "doctor_profile" || step.stepType === "site_publication") continue; // background, notified separately
        const stepLabel = ROUTING_STEP_LABELS[step.stepType] ?? step.stepType;
        const users = await getUserEmailsByRole(step.assignedRole);
        for (const u of users) {
          const tpl = await renderTaskAssignedEmail({
            stepLabel,
            employeeName: candidate.fullName,
            taskLink,
          });
          await sendEmail({
            to: u.email,
            subject: tpl.subject,
            htmlBody: tpl.htmlBody,
            objectType: "routing_step",
            objectId: step.id,
          });
        }
      }
    })(),
  );
}

/**
 * Called when a routing sheet is auto-closed (all steps done).
 * Sends completion email to recruiter.
 */
export function notifyRoutingSheetCompleted(opts: {
  routingSheetId: number;
  candidateId: number;
  branchId: number;
}): void {
  fireAndForget(
    (async () => {
      const [candidate] = await db
        .select()
        .from(candidatesTable)
        .where(eq(candidatesTable.id, opts.candidateId));
      if (!candidate) return;

      const [branch] = await db
        .select()
        .from(branchesTable)
        .where(eq(branchesTable.id, opts.branchId));

      const recruiters = await getUserEmailsByRole("recruiter");
      for (const r of recruiters) {
        const tpl = await renderSheetCompletedEmail({
          employeeName: candidate.fullName,
          branchName: branch?.name ?? "",
          recipientName: r.fullName,
        });
        await sendEmail({
          to: r.email,
          subject: tpl.subject,
          htmlBody: tpl.htmlBody,
          objectType: "routing_sheet",
          objectId: opts.routingSheetId,
        });
      }
    })(),
  );
}

// ─── Termination ──────────────────────────────────────────────────────────────

/**
 * Called when a termination sheet is created.
 * Sends task assignment emails to each step's assigned role.
 */
export function notifyTerminationCreated(opts: {
  terminationSheetId: number;
  employeeName: string;
  steps: Array<{ stepType: string; assignedRole: string; id: number }>;
}): void {
  fireAndForget(
    (async () => {
      const baseUrl = await getAppBaseUrl();
      const taskLink = `${baseUrl}/routing-sheet/termination-tasks`;

      for (const step of opts.steps) {
        const stepLabel = TERMINATION_STEP_LABELS[step.stepType] ?? step.stepType;
        const users = await getUserEmailsByRole(step.assignedRole);
        for (const u of users) {
          const tpl = await renderTerminationTaskEmail({
            stepLabel,
            employeeName: opts.employeeName,
            taskLink,
          });
          await sendEmail({
            to: u.email,
            subject: tpl.subject,
            htmlBody: tpl.htmlBody,
            objectType: "termination_step",
            objectId: step.id,
          });
        }
      }
    })(),
  );
}

/**
 * Called when a termination sheet is auto-closed (all steps approved).
 * Sends completion email to HR and admin users.
 */
export function notifyTerminationCompleted(opts: {
  terminationSheetId: number;
  employeeName: string;
}): void {
  fireAndForget(
    (async () => {
      const hrUsers = await getUserEmailsByRole("hr");
      for (const u of hrUsers) {
        const tpl = await renderTerminationCompletedEmail({
          employeeName: opts.employeeName,
          recipientName: u.fullName,
        });
        await sendEmail({
          to: u.email,
          subject: tpl.subject,
          htmlBody: tpl.htmlBody,
          objectType: "termination_sheet",
          objectId: opts.terminationSheetId,
        });
      }
    })(),
  );
}

/**
 * Called when a termination step is rejected (process stopped).
 * Sends rejection notification to HR users.
 */
export function notifyTerminationRejected(opts: {
  terminationSheetId: number;
  employeeName: string;
  stepType: string;
  reason: string;
}): void {
  fireAndForget(
    (async () => {
      const stepLabel = TERMINATION_STEP_LABELS[opts.stepType] ?? opts.stepType;
      const hrUsers = await getUserEmailsByRole("hr");
      for (const u of hrUsers) {
        const tpl = await renderTerminationRejectedEmail({
          employeeName: opts.employeeName,
          stepLabel,
          reason: opts.reason,
          recipientName: u.fullName,
        });
        await sendEmail({
          to: u.email,
          subject: tpl.subject,
          htmlBody: tpl.htmlBody,
          objectType: "termination_sheet",
          objectId: opts.terminationSheetId,
        });
      }
    })(),
  );
}
