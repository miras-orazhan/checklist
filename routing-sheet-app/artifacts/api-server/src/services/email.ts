/**
 * EmailService — sends transactional email via a Google Apps Script web app endpoint.
 *
 * Configuration keys (stored in integration_configs):
 *   gas_webhook_url   — the deployed GAS web app URL  (required to actually send)
 *   gas_webhook_secret — shared secret passed in every request
 *   app_base_url      — public base URL of this app (for links in emails)
 *
 * When gas_webhook_url is not set, emails are logged at INFO level instead of being sent.
 * This allows the server to start and run locally without credentials configured.
 *
 * Retry policy: up to 3 attempts with exponential backoff (1 s → 2 s → 4 s).
 */

import { db, emailTemplatesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getConfig } from "../lib/config";
import { logNotification } from "../lib/notificationLog";
import { logger } from "../lib/logger";
import { registerEmailTemplateCacheInvalidator } from "../lib/emailTemplateCache";

// ─── Retry helper ────────────────────────────────────────────────────────────

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  body: object,
  maxAttempts = 3,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        throw new Error(`GAS returned HTTP ${res.status}`);
      }
      return; // success
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await sleep(1_000 * Math.pow(2, attempt - 1)); // 1 s, 2 s, 4 s
      }
    }
  }
  throw lastError;
}

// ─── Core send ───────────────────────────────────────────────────────────────

export interface SendEmailOpts {
  to: string;
  subject: string;
  htmlBody: string;
  /** For notification_log deduplication context */
  objectType?: string;
  objectId?: number;
}

export async function sendEmail(opts: SendEmailOpts): Promise<void> {
  const webhookUrl = await getConfig("gas_webhook_url");
  const secret = await getConfig("gas_webhook_secret");

  if (!webhookUrl) {
    logger.info(
      { to: opts.to, subject: opts.subject },
      "[email] GAS webhook not configured — email not sent (dev mode)",
    );
    await logNotification({
      channel: "email",
      recipient: opts.to,
      subject: opts.subject,
      status: "sent", // treat dev-mode as "sent" to avoid false alerts
      objectType: opts.objectType,
      objectId: opts.objectId,
    });
    return;
  }

  try {
    await fetchWithRetry(webhookUrl, {
      to: opts.to,
      subject: opts.subject,
      htmlBody: opts.htmlBody,
      secret: secret ?? "",
    });

    await logNotification({
      channel: "email",
      recipient: opts.to,
      subject: opts.subject,
      status: "sent",
      objectType: opts.objectType,
      objectId: opts.objectId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ to: opts.to, subject: opts.subject, err: message }, "[email] Failed to send after retries");

    await logNotification({
      channel: "email",
      recipient: opts.to,
      subject: opts.subject,
      status: "failed",
      errorMessage: message,
      objectType: opts.objectType,
      objectId: opts.objectId,
    });
    // Don't rethrow — notifications must never block the primary operation
  }
}

// ─── App base URL helper ─────────────────────────────────────────────────────

export async function getAppBaseUrl(): Promise<string> {
  const configured = await getConfig("app_base_url");
  if (configured) return configured.replace(/\/$/, "");
  const dev = process.env["REPLIT_DEV_DOMAIN"];
  if (dev) return `https://${dev}`;
  return "http://localhost:" + (process.env["PORT"] ?? "8080");
}

// ─── DB-driven template cache ─────────────────────────────────────────────────

const _tmplCache = new Map<string, { data: { subject: string; bodyHtml: string }; expiresAt: number }>();
const TMPL_TTL = 60_000; // 60 s

// Register cache invalidation so the email-templates route can clear stale entries
registerEmailTemplateCacheInvalidator((type: string) => _tmplCache.delete(type));

async function loadDbTemplate(type: string): Promise<{ subject: string; bodyHtml: string } | null> {
  const cached = _tmplCache.get(type);
  if (cached && Date.now() < cached.expiresAt) return cached.data;
  try {
    const [row] = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.templateType, type));
    if (row) {
      const data = { subject: row.subject, bodyHtml: row.bodyHtml };
      _tmplCache.set(type, { data, expiresAt: Date.now() + TMPL_TTL });
      return data;
    }
  } catch (err) {
    logger.warn({ err }, "[email] Failed to load DB template, using hardcoded fallback");
  }
  return null;
}

/**
 * Substitute `{{varName}}` placeholders in a template string.
 * Missing keys are replaced with an empty string.
 */
export function substituteVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

// ─── Email templates ─────────────────────────────────────────────────────────

const brandColor = "#10B981"; // emerald-500
const fontStack = "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;";

function emailShell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;${fontStack}">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.08);">
        <tr>
          <td style="background:${brandColor};padding:24px 32px;">
            <span style="color:#fff;font-size:20px;font-weight:700;">Цифровой обходной лист</span>
          </td>
        </tr>
        <tr><td style="padding:32px;">${body}</td></tr>
        <tr>
          <td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;color:#9ca3af;font-size:12px;">
              Это автоматическое письмо. Отвечать на него не нужно.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function btn(href: string, label: string): string {
  return `<a href="${href}"
     style="display:inline-block;background:${brandColor};color:#fff;padding:12px 28px;
            border-radius:8px;text-decoration:none;font-weight:600;margin-top:20px;"
  >${label}</a>`;
}

/** 1 — Offer invitation */
export function buildOfferInvitationEmail(opts: {
  candidateName: string;
  offerLink: string;
  companyName: string;
  message?: string | null;
}): { subject: string; htmlBody: string } {
  const subject = `Приглашение на оффер — ${opts.companyName}`;
  const htmlBody = emailShell(
    subject,
    `<h2 style="margin:0 0 16px;font-size:22px;color:#111827;">Здравствуйте, ${opts.candidateName}!</h2>
     <p style="color:#374151;line-height:1.6;">
       Компания <strong>${opts.companyName}</strong> направляет вам предложение о работе.
       ${opts.message ? `<br><br><em>${opts.message}</em>` : ""}
     </p>
     <p style="color:#374151;">Нажмите кнопку ниже, чтобы ознакомиться с оффером и принять его:</p>
     ${btn(opts.offerLink, "Открыть оффер")}
     <p style="color:#6b7280;font-size:13px;margin-top:24px;">Ссылка действительна 7 дней.</p>`,
  );
  return { subject, htmlBody };
}

/** 2 — OTP code */
export function buildOtpEmail(opts: {
  candidateName: string;
  otpCode: string;
}): { subject: string; htmlBody: string } {
  const subject = "Код подтверждения";
  const htmlBody = emailShell(
    subject,
    `<h2 style="margin:0 0 16px;font-size:22px;color:#111827;">Код подтверждения</h2>
     <p style="color:#374151;">Здравствуйте, ${opts.candidateName}!</p>
     <p style="color:#374151;">Для подтверждения вашего согласия с оффером введите код:</p>
     <div style="text-align:center;margin:28px 0;">
       <span style="display:inline-block;background:#f3f4f6;border:2px dashed ${brandColor};
                    border-radius:12px;padding:18px 40px;font-size:36px;font-weight:700;
                    letter-spacing:12px;color:#111827;">${opts.otpCode}</span>
     </div>
     <p style="color:#6b7280;font-size:13px;">Код действителен 10 минут. Не передавайте его третьим лицам.</p>`,
  );
  return { subject, htmlBody };
}

/** 3 — Routing sheet confirmation (post OTP) */
export function buildSheetConfirmationEmail(opts: {
  candidateName: string;
  statusLink: string;
}): { subject: string; htmlBody: string } {
  const subject = "Оффер принят — обходной лист создан";
  const htmlBody = emailShell(
    subject,
    `<h2 style="margin:0 0 16px;font-size:22px;color:#111827;">Оффер принят!</h2>
     <p style="color:#374151;">Здравствуйте, ${opts.candidateName}!</p>
     <p style="color:#374151;">
       Ваш оффер успешно подтверждён. Обходной лист сформирован и передан в работу.
       Вы можете отслеживать статус по ссылке ниже:
     </p>
     ${btn(opts.statusLink, "Проверить статус")}`,
  );
  return { subject, htmlBody };
}

/** 4 — Task assigned to a role (onboarding step) */
export function buildTaskAssignedEmail(opts: {
  stepLabel: string;
  employeeName: string;
  taskLink: string;
}): { subject: string; htmlBody: string } {
  const subject = `Новая задача: ${opts.stepLabel}`;
  const htmlBody = emailShell(
    subject,
    `<h2 style="margin:0 0 16px;font-size:22px;color:#111827;">Вам назначена задача</h2>
     <p style="color:#374151;">
       Для кандидата <strong>${opts.employeeName}</strong> требуется выполнить шаг:
     </p>
     <div style="background:#f0fdf4;border-left:4px solid ${brandColor};padding:12px 16px;
                 border-radius:4px;margin:16px 0;">
       <strong style="color:#065f46;">${opts.stepLabel}</strong>
     </div>
     ${btn(opts.taskLink, "Перейти к задаче")}`,
  );
  return { subject, htmlBody };
}

/** 5 — Onboarding sheet completed */
export function buildSheetCompletedEmail(opts: {
  employeeName: string;
  branchName: string;
  recipientName: string;
}): { subject: string; htmlBody: string } {
  const subject = `Обходной лист завершён — ${opts.employeeName}`;
  const htmlBody = emailShell(
    subject,
    `<h2 style="margin:0 0 16px;font-size:22px;color:#111827;">
       Обходной лист завершён ✓
     </h2>
     <p style="color:#374151;">Здравствуйте, ${opts.recipientName}!</p>
     <p style="color:#374151;">
       Все шаги обходного листа для кандидата <strong>${opts.employeeName}</strong>
       (Филиал: ${opts.branchName}) успешно выполнены.
     </p>`,
  );
  return { subject, htmlBody };
}

/** 6 — Termination task assigned */
export function buildTerminationTaskEmail(opts: {
  stepLabel: string;
  employeeName: string;
  taskLink: string;
}): { subject: string; htmlBody: string } {
  const subject = `Задача на увольнение: ${opts.stepLabel}`;
  const htmlBody = emailShell(
    subject,
    `<h2 style="margin:0 0 16px;font-size:22px;color:#111827;">Задача на увольнение</h2>
     <p style="color:#374151;">
       По процессу увольнения сотрудника <strong>${opts.employeeName}</strong>
       вам назначен шаг:
     </p>
     <div style="background:#fff7ed;border-left:4px solid #f97316;padding:12px 16px;
                 border-radius:4px;margin:16px 0;">
       <strong style="color:#9a3412;">${opts.stepLabel}</strong>
     </div>
     ${btn(opts.taskLink, "Перейти к задаче")}`,
  );
  return { subject, htmlBody };
}

/** 7 — Termination sheet completed */
export function buildTerminationCompletedEmail(opts: {
  employeeName: string;
  recipientName: string;
}): { subject: string; htmlBody: string } {
  const subject = `Процесс увольнения завершён — ${opts.employeeName}`;
  const htmlBody = emailShell(
    subject,
    `<h2 style="margin:0 0 16px;font-size:22px;color:#111827;">
       Увольнение завершено ✓
     </h2>
     <p style="color:#374151;">Здравствуйте, ${opts.recipientName}!</p>
     <p style="color:#374151;">
       Все шаги процесса увольнения для <strong>${opts.employeeName}</strong>
       успешно согласованы. Процесс закрыт.
     </p>`,
  );
  return { subject, htmlBody };
}

/** 8 — Termination rejected / stopped */
export function buildTerminationRejectedEmail(opts: {
  employeeName: string;
  stepLabel: string;
  reason: string;
  recipientName: string;
}): { subject: string; htmlBody: string } {
  const subject = `Процесс увольнения остановлен — ${opts.employeeName}`;
  const htmlBody = emailShell(
    subject,
    `<h2 style="margin:0 0 16px;font-size:22px;color:#dc2626;">
       Процесс увольнения остановлен
     </h2>
     <p style="color:#374151;">Здравствуйте, ${opts.recipientName}!</p>
     <p style="color:#374151;">
       Шаг «${opts.stepLabel}» был отклонён. Процесс увольнения сотрудника
       <strong>${opts.employeeName}</strong> приостановлен.
     </p>
     <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;border-radius:4px;margin:16px 0;">
       <strong style="color:#991b1b;">Причина:</strong> ${opts.reason}
     </div>`,
  );
  return { subject, htmlBody };
}

/** 9 — SLA reminder */
export function buildSlaReminderEmail(opts: {
  stepLabel: string;
  employeeName: string;
  hoursOverdue: number;
}): { subject: string; htmlBody: string } {
  const subject = `⏰ Напоминание: шаг «${opts.stepLabel}» просрочен`;
  const htmlBody = emailShell(
    subject,
    `<h2 style="margin:0 0 16px;font-size:22px;color:#d97706;">Напоминание о просроченном шаге</h2>
     <p style="color:#374151;">
       Шаг <strong>«${opts.stepLabel}»</strong> для <strong>${opts.employeeName}</strong>
       ожидает выполнения уже <strong>${opts.hoursOverdue} ч.</strong>
     </p>
     <p style="color:#374151;">Пожалуйста, обработайте задачу как можно скорее.</p>`,
  );
  return { subject, htmlBody };
}

/** 10 — SLA escalation */
export function buildSlaEscalationEmail(opts: {
  stepLabel: string;
  employeeName: string;
  hoursOverdue: number;
  assignedRole: string;
}): { subject: string; htmlBody: string } {
  const subject = `🚨 Эскалация: шаг «${opts.stepLabel}» критически просрочен`;
  const htmlBody = emailShell(
    subject,
    `<h2 style="margin:0 0 16px;font-size:22px;color:#dc2626;">Эскалация</h2>
     <p style="color:#374151;">
       Шаг <strong>«${opts.stepLabel}»</strong> для <strong>${opts.employeeName}</strong>
       не выполнен в течение <strong>${opts.hoursOverdue} ч.</strong>
     </p>
     <p style="color:#374151;">
       Ответственная роль: <strong>${opts.assignedRole}</strong>.<br>
       Требуется вмешательство руководителя.
     </p>`,
  );
  return { subject, htmlBody };
}

// ─── DB-backed async renderers ─────────────────────────────────────────────────
// Each renderer tries the DB-stored template first, falls back to the hardcoded builder.
// Use these everywhere in the notification pipeline so template edits take effect.

async function renderTemplate(
  type: string,
  vars: Record<string, string>,
  fallback: () => { subject: string; htmlBody: string },
): Promise<{ subject: string; htmlBody: string }> {
  const tmpl = await loadDbTemplate(type);
  if (tmpl) {
    return {
      subject: substituteVars(tmpl.subject, vars),
      htmlBody: substituteVars(tmpl.bodyHtml, vars),
    };
  }
  return fallback();
}

export async function renderOfferInvitationEmail(
  opts: Parameters<typeof buildOfferInvitationEmail>[0],
): Promise<{ subject: string; htmlBody: string }> {
  return renderTemplate(
    "offer_invitation",
    { candidateName: opts.candidateName, offerLink: opts.offerLink, companyName: opts.companyName, message: opts.message ?? "" },
    () => buildOfferInvitationEmail(opts),
  );
}

export async function renderOtpEmail(
  opts: Parameters<typeof buildOtpEmail>[0],
): Promise<{ subject: string; htmlBody: string }> {
  return renderTemplate(
    "otp_code",
    { candidateName: opts.candidateName, otpCode: opts.otpCode },
    () => buildOtpEmail(opts),
  );
}

export async function renderSheetConfirmationEmail(
  opts: Parameters<typeof buildSheetConfirmationEmail>[0],
): Promise<{ subject: string; htmlBody: string }> {
  return renderTemplate(
    "routing_sheet_confirmation",
    { candidateName: opts.candidateName, statusLink: opts.statusLink },
    () => buildSheetConfirmationEmail(opts),
  );
}

export async function renderTaskAssignedEmail(
  opts: Parameters<typeof buildTaskAssignedEmail>[0],
): Promise<{ subject: string; htmlBody: string }> {
  return renderTemplate(
    "routing_sheet_step_assigned",
    { stepLabel: opts.stepLabel, employeeName: opts.employeeName, taskLink: opts.taskLink },
    () => buildTaskAssignedEmail(opts),
  );
}

export async function renderSheetCompletedEmail(
  opts: Parameters<typeof buildSheetCompletedEmail>[0],
): Promise<{ subject: string; htmlBody: string }> {
  return renderTemplate(
    "routing_sheet_completed",
    { employeeName: opts.employeeName, branchName: opts.branchName, recipientName: opts.recipientName },
    () => buildSheetCompletedEmail(opts),
  );
}

export async function renderTerminationTaskEmail(
  opts: Parameters<typeof buildTerminationTaskEmail>[0],
): Promise<{ subject: string; htmlBody: string }> {
  return renderTemplate(
    "termination_step_assigned",
    { stepLabel: opts.stepLabel, employeeName: opts.employeeName, taskLink: opts.taskLink },
    () => buildTerminationTaskEmail(opts),
  );
}

export async function renderTerminationCompletedEmail(
  opts: Parameters<typeof buildTerminationCompletedEmail>[0],
): Promise<{ subject: string; htmlBody: string }> {
  return renderTemplate(
    "termination_completed",
    { employeeName: opts.employeeName, recipientName: opts.recipientName },
    () => buildTerminationCompletedEmail(opts),
  );
}

export async function renderTerminationRejectedEmail(
  opts: Parameters<typeof buildTerminationRejectedEmail>[0],
): Promise<{ subject: string; htmlBody: string }> {
  return renderTemplate(
    "termination_rejected",
    { employeeName: opts.employeeName, stepLabel: opts.stepLabel, reason: opts.reason, recipientName: opts.recipientName },
    () => buildTerminationRejectedEmail(opts),
  );
}

export async function renderSlaReminderEmail(
  opts: Parameters<typeof buildSlaReminderEmail>[0],
): Promise<{ subject: string; htmlBody: string }> {
  return renderTemplate(
    "sla_reminder",
    { stepLabel: opts.stepLabel, employeeName: opts.employeeName, hoursOverdue: String(opts.hoursOverdue) },
    () => buildSlaReminderEmail(opts),
  );
}

export async function renderSlaEscalationEmail(
  opts: Parameters<typeof buildSlaEscalationEmail>[0],
): Promise<{ subject: string; htmlBody: string }> {
  return renderTemplate(
    "sla_escalation",
    { stepLabel: opts.stepLabel, employeeName: opts.employeeName, hoursOverdue: String(opts.hoursOverdue), assignedRole: opts.assignedRole },
    () => buildSlaEscalationEmail(opts),
  );
}
