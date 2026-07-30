/**
 * SLA Scheduler — runs periodically and sends reminder / escalation emails
 * for routing and termination steps that have exceeded their SLA thresholds.
 *
 * Configuration (integration_configs):
 *   scheduler_interval_minutes — how often the check runs (default: 30)
 *
 * SLA config (sla_configs table):
 *   slaHours        — hours until first reminder is sent
 *   escalationHours — hours until escalation email is sent
 *   supervisorRole  — role that receives escalation emails
 *
 * Deduplication: uses notification_log to avoid re-sending the same
 * reminder or escalation for a given step.
 */

import { db, routingStepsTable, terminationStepsTable, slaConfigsTable, usersTable, emailTemplatesTable, EMAIL_TEMPLATE_TYPES } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getConfig } from "./config";
import { sendEmail, renderSlaReminderEmail, renderSlaEscalationEmail } from "../services/email";
import { notificationAlreadySent } from "./notificationLog";
import { logAudit } from "./audit";
import { logger } from "./logger";

// Subject keys used for deduplication
const SLA_REMINDER_SUBJECT = "sla_reminder";
const SLA_ESCALATION_SUBJECT = "sla_escalation";

const DEFAULT_SLA_HOURS = 24;
const DEFAULT_ESCALATION_HOURS = 48;

interface SlaConfigRow {
  stepType: string;
  slaHours: number;
  escalationHours: number;
  supervisorRole: string | null;
}

async function loadSlaConfigs(): Promise<Map<string, SlaConfigRow>> {
  const rows = await db.select().from(slaConfigsTable);
  const map = new Map<string, SlaConfigRow>();
  for (const row of rows) {
    map.set(row.stepType, {
      stepType: row.stepType,
      slaHours: row.slaHours,
      escalationHours: row.escalationHours,
      supervisorRole: row.supervisorRole ?? "admin",
    });
  }
  return map;
}

function hoursElapsed(since: Date): number {
  return (Date.now() - since.getTime()) / (1_000 * 60 * 60);
}

async function getUserEmailsByRole(role: string): Promise<string[]> {
  const users = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.role, role as any));
  return users.map((u) => u.email);
}

async function sendSlaReminder(opts: {
  objectType: "routing_step" | "termination_step";
  objectId: number;
  stepType: string;
  assignedRole: string;
  employeeName: string;
  hoursOverdue: number;
}): Promise<void> {
  const alreadySent = await notificationAlreadySent(
    opts.objectType,
    opts.objectId,
    SLA_REMINDER_SUBJECT,
  );
  if (alreadySent) return;

  const stepLabel = opts.stepType.replace(/_/g, " ");
  const emails = await getUserEmailsByRole(opts.assignedRole);

  for (const to of emails) {
    const tpl = await renderSlaReminderEmail({
      stepLabel,
      employeeName: opts.employeeName,
      hoursOverdue: Math.round(opts.hoursOverdue),
    });
    await sendEmail({
      to,
      subject: SLA_REMINDER_SUBJECT, // used for dedup
      htmlBody: tpl.htmlBody,
      objectType: opts.objectType,
      objectId: opts.objectId,
    });
  }

  logger.info(
    { objectType: opts.objectType, objectId: opts.objectId, role: opts.assignedRole },
    "[sla] Reminder sent",
  );
}

async function sendSlaEscalation(opts: {
  objectType: "routing_step" | "termination_step";
  objectId: number;
  stepType: string;
  assignedRole: string;
  supervisorRole: string;
  employeeName: string;
  hoursOverdue: number;
}): Promise<void> {
  const alreadySent = await notificationAlreadySent(
    opts.objectType,
    opts.objectId,
    SLA_ESCALATION_SUBJECT,
  );
  if (alreadySent) return;

  const stepLabel = opts.stepType.replace(/_/g, " ");
  const emails = await getUserEmailsByRole(opts.supervisorRole);

  for (const to of emails) {
    const tpl = await renderSlaEscalationEmail({
      stepLabel,
      employeeName: opts.employeeName,
      hoursOverdue: Math.round(opts.hoursOverdue),
      assignedRole: opts.assignedRole,
    });
    await sendEmail({
      to,
      subject: SLA_ESCALATION_SUBJECT,
      htmlBody: tpl.htmlBody,
      objectType: opts.objectType,
      objectId: opts.objectId,
    });
  }

  await logAudit({
    actorName: "system",
    action: "sla_escalation",
    objectType: opts.objectType,
    objectId: opts.objectId,
    details: `Step ${opts.stepType} escalated after ${Math.round(opts.hoursOverdue)}h`,
  }).catch(() => {});

  logger.warn(
    { objectType: opts.objectType, objectId: opts.objectId, supervisor: opts.supervisorRole },
    "[sla] Escalation sent",
  );
}

async function runSlaCheck(): Promise<void> {
  try {
    const slaConfigs = await loadSlaConfigs();

    // ── Routing steps ────────────────────────────────────────────────────────
    const pendingRouting = await db
      .select()
      .from(routingStepsTable)
      .where(eq(routingStepsTable.status, "pending"));

    for (const step of pendingRouting) {
      const cfg = slaConfigs.get(step.stepType);
      const slaHours = cfg?.slaHours ?? DEFAULT_SLA_HOURS;
      const escalationHours = cfg?.escalationHours ?? DEFAULT_ESCALATION_HOURS;
      const supervisorRole = cfg?.supervisorRole ?? "admin";
      const elapsed = hoursElapsed(step.createdAt);

      // We need the employee name — load the routing sheet
      // (We'll do this lazily per step since there shouldn't be many overdue)
      if (elapsed >= escalationHours) {
        const sheet = await db
          .select()
          .from(routingStepsTable)
          .where(eq(routingStepsTable.id, step.routingSheetId))
          .limit(1); // just to reuse variable name — use candidatesTable in future
        await sendSlaEscalation({
          objectType: "routing_step",
          objectId: step.id,
          stepType: step.stepType,
          assignedRole: step.assignedRole,
          supervisorRole,
          employeeName: `Обходной лист #${step.routingSheetId}`,
          hoursOverdue: elapsed,
        });
      } else if (elapsed >= slaHours) {
        await sendSlaReminder({
          objectType: "routing_step",
          objectId: step.id,
          stepType: step.stepType,
          assignedRole: step.assignedRole,
          employeeName: `Обходной лист #${step.routingSheetId}`,
          hoursOverdue: elapsed,
        });
      }
    }

    // ── Termination steps ────────────────────────────────────────────────────
    const pendingTermination = await db
      .select()
      .from(terminationStepsTable)
      .where(eq(terminationStepsTable.status, "pending"));

    for (const step of pendingTermination) {
      const cfg = slaConfigs.get(step.stepType);
      const slaHours = cfg?.slaHours ?? DEFAULT_SLA_HOURS;
      const escalationHours = cfg?.escalationHours ?? DEFAULT_ESCALATION_HOURS;
      const supervisorRole = cfg?.supervisorRole ?? "admin";
      const elapsed = hoursElapsed(step.createdAt);

      if (elapsed >= escalationHours) {
        await sendSlaEscalation({
          objectType: "termination_step",
          objectId: step.id,
          stepType: step.stepType,
          assignedRole: step.assignedRole,
          supervisorRole,
          employeeName: `Лист увольнения #${step.terminationSheetId}`,
          hoursOverdue: elapsed,
        });
      } else if (elapsed >= slaHours) {
        await sendSlaReminder({
          objectType: "termination_step",
          objectId: step.id,
          stepType: step.stepType,
          assignedRole: step.assignedRole,
          employeeName: `Лист увольнения #${step.terminationSheetId}`,
          hoursOverdue: elapsed,
        });
      }
    }
  } catch (err) {
    logger.error({ err }, "[sla] SLA check failed");
  }
}

export async function ensureDefaultSlaConfigs(): Promise<void> {
  const { slaConfigsTable: tbl } = await import("@workspace/db");

  const defaults: Array<{
    stepType: string;
    sheetKind: string;
    slaHours: number;
    escalationHours: number;
    supervisorRole: string;
  }> = [
    // Onboarding steps
    { stepType: "hr_registration",   sheetKind: "routing",     slaHours: 24, escalationHours: 48, supervisorRole: "admin" },
    { stepType: "marketing_photo",   sheetKind: "routing",     slaHours: 24, escalationHours: 48, supervisorRole: "admin" },
    { stepType: "tb_briefing",       sheetKind: "routing",     slaHours: 24, escalationHours: 48, supervisorRole: "admin" },
    { stepType: "it_accounts",       sheetKind: "routing",     slaHours: 24, escalationHours: 48, supervisorRole: "admin" },
    { stepType: "audit_training",    sheetKind: "routing",     slaHours: 24, escalationHours: 48, supervisorRole: "admin" },
    { stepType: "doctor_profile",    sheetKind: "routing",     slaHours: 48, escalationHours: 96, supervisorRole: "admin" },
    { stepType: "site_publication",  sheetKind: "routing",     slaHours: 48, escalationHours: 96, supervisorRole: "admin" },
    { stepType: "final_review",      sheetKind: "routing",     slaHours: 24, escalationHours: 48, supervisorRole: "admin" },
    // Offboarding steps
    { stepType: "chief_physician_off",          sheetKind: "termination", slaHours: 24, escalationHours: 48, supervisorRole: "admin" },
    { stepType: "it_revocation",                sheetKind: "termination", slaHours: 24, escalationHours: 48, supervisorRole: "admin" },
    { stepType: "marketing_off",                sheetKind: "termination", slaHours: 24, escalationHours: 48, supervisorRole: "admin" },
    { stepType: "accounting_off",               sheetKind: "termination", slaHours: 24, escalationHours: 48, supervisorRole: "admin" },
    { stepType: "security_off",                 sheetKind: "termination", slaHours: 24, escalationHours: 48, supervisorRole: "admin" },
    { stepType: "hr_exit_interview",            sheetKind: "termination", slaHours: 24, escalationHours: 48, supervisorRole: "admin" },
    { stepType: "hr_close",                     sheetKind: "termination", slaHours: 24, escalationHours: 48, supervisorRole: "admin" },
    { stepType: "medical_equipment_off",        sheetKind: "termination", slaHours: 24, escalationHours: 48, supervisorRole: "admin" },
    { stepType: "account_manager_delete_profile", sheetKind: "termination", slaHours: 48, escalationHours: 96, supervisorRole: "admin" },
  ];

  for (const d of defaults) {
    await db
      .insert(tbl)
      .values(d)
      .onConflictDoNothing();
  }

  // Ensure integration_config keys exist (empty — admin fills in values via UI)
  const { integrationConfigsTable } = await import("@workspace/db");
  const configDefaults = [
    { key: "gas_webhook_url",           description: "Google Apps Script web app URL для отправки email" },
    { key: "gas_webhook_secret",        description: "Shared secret для GAS webhook" },
    { key: "app_base_url",              description: "Публичный базовый URL приложения (для ссылок в письмах)" },
    { key: "bitrix24_rest_url",         description: "Bitrix24 REST API endpoint (с токеном)" },
    { key: "bitrix24_responsible_id",   description: "ID ответственного пользователя в Bitrix24" },
    { key: "scheduler_interval_minutes", description: "Интервал проверки SLA (минуты, по умолчанию 30)" },
  ];
  for (const c of configDefaults) {
    await db
      .insert(integrationConfigsTable)
      .values({ key: c.key, value: null, description: c.description })
      .onConflictDoNothing();
  }

}

const TEMPLATE_HTML_SHELL = (title: string, body: string) =>
  `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>${title}</title></head>` +
  `<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">` +
  `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">` +
  `<tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.08);">` +
  `<tr><td style="background:#10B981;padding:24px 32px;"><span style="color:#fff;font-size:20px;font-weight:700;">Цифровой обходной лист</span></td></tr>` +
  `<tr><td style="padding:32px;">${body}</td></tr>` +
  `<tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;"><p style="margin:0;color:#9ca3af;font-size:12px;">Это автоматическое письмо. Отвечать на него не нужно.</p></td></tr>` +
  `</table></td></tr></table></body></html>`;

// Canonical variable names — must match what render*Email() wrappers pass to substituteVars.
// Also used in EMAIL_TEMPLATE_VARIABLES (the admin variable-reference docs).
const DEFAULT_TEMPLATES: Record<string, { subject: string; bodyHtml: string }> = {
  offer_invitation: {
    subject: "Приглашение на оффер — {{companyName}}",
    bodyHtml: TEMPLATE_HTML_SHELL("Приглашение",
      `<h2 style="margin:0 0 16px;font-size:22px;color:#111827;">Здравствуйте, {{candidateName}}!</h2>` +
      `<p style="color:#374151;">Компания <strong>{{companyName}}</strong> направляет вам предложение о работе.</p>` +
      `<p style="color:#374151;">{{message}}</p>` +
      `<p style="color:#374151;">Нажмите кнопку ниже, чтобы ознакомиться с оффером:</p>` +
      `<a href="{{offerLink}}" style="display:inline-block;background:#10B981;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:20px;">Открыть оффер</a>` +
      `<p style="color:#6b7280;font-size:13px;margin-top:24px;">Ссылка действительна 7 дней.</p>`),
  },
  otp_code: {
    subject: "Код подтверждения",
    bodyHtml: TEMPLATE_HTML_SHELL("Код подтверждения",
      `<h2 style="margin:0 0 16px;font-size:22px;color:#111827;">Код подтверждения</h2>` +
      `<p style="color:#374151;">Здравствуйте, {{candidateName}}!</p>` +
      `<p style="color:#374151;">Для подтверждения вашего согласия с оффером введите код:</p>` +
      `<div style="text-align:center;margin:28px 0;"><span style="display:inline-block;background:#f3f4f6;border:2px dashed #10B981;border-radius:12px;padding:18px 40px;font-size:36px;font-weight:700;letter-spacing:12px;color:#111827;">{{otpCode}}</span></div>` +
      `<p style="color:#6b7280;font-size:13px;">Код действителен 10 минут. Не передавайте его третьим лицам.</p>`),
  },
  routing_sheet_confirmation: {
    subject: "Оффер принят — обходной лист создан",
    bodyHtml: TEMPLATE_HTML_SHELL("Оффер принят",
      `<h2 style="margin:0 0 16px;font-size:22px;color:#111827;">Оффер принят!</h2>` +
      `<p style="color:#374151;">Здравствуйте, {{candidateName}}!</p>` +
      `<p style="color:#374151;">Ваш оффер успешно подтверждён. Обходной лист сформирован и передан в работу.</p>` +
      `<a href="{{statusLink}}" style="display:inline-block;background:#10B981;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:20px;">Проверить статус</a>`),
  },
  // vars: stepLabel (шаг), employeeName (кандидат), taskLink
  routing_sheet_step_assigned: {
    subject: "Новая задача по найму: {{stepLabel}}",
    bodyHtml: TEMPLATE_HTML_SHELL("Новая задача",
      `<h2 style="margin:0 0 16px;font-size:22px;color:#111827;">Вам назначена задача</h2>` +
      `<p style="color:#374151;">Для кандидата <strong>{{employeeName}}</strong> требуется выполнить шаг:</p>` +
      `<div style="background:#f0fdf4;border-left:4px solid #10B981;padding:12px 16px;border-radius:4px;margin:16px 0;"><strong style="color:#065f46;">{{stepLabel}}</strong></div>` +
      `<a href="{{taskLink}}" style="display:inline-block;background:#10B981;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:20px;">Перейти к задаче</a>`),
  },
  // vars: employeeName, branchName, recipientName
  routing_sheet_completed: {
    subject: "Обходной лист завершён — {{employeeName}}",
    bodyHtml: TEMPLATE_HTML_SHELL("Лист завершён",
      `<h2 style="margin:0 0 16px;font-size:22px;color:#111827;">Обходной лист завершён ✓</h2>` +
      `<p style="color:#374151;">Здравствуйте, {{recipientName}}!</p>` +
      `<p style="color:#374151;">Все шаги обходного листа для <strong>{{employeeName}}</strong> (филиал: {{branchName}}) успешно выполнены.</p>`),
  },
  // vars: stepLabel, employeeName, taskLink
  termination_step_assigned: {
    subject: "Задача на увольнение: {{stepLabel}}",
    bodyHtml: TEMPLATE_HTML_SHELL("Задача на увольнение",
      `<h2 style="margin:0 0 16px;font-size:22px;color:#111827;">Задача на увольнение</h2>` +
      `<p style="color:#374151;">По процессу увольнения сотрудника <strong>{{employeeName}}</strong> вам назначен шаг:</p>` +
      `<div style="background:#fff7ed;border-left:4px solid #f97316;padding:12px 16px;border-radius:4px;margin:16px 0;"><strong style="color:#9a3412;">{{stepLabel}}</strong></div>` +
      `<a href="{{taskLink}}" style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:20px;">Перейти к задаче</a>`),
  },
  // vars: employeeName, recipientName
  termination_completed: {
    subject: "Процесс увольнения завершён — {{employeeName}}",
    bodyHtml: TEMPLATE_HTML_SHELL("Увольнение завершено",
      `<h2 style="margin:0 0 16px;font-size:22px;color:#111827;">Увольнение завершено ✓</h2>` +
      `<p style="color:#374151;">Здравствуйте, {{recipientName}}!</p>` +
      `<p style="color:#374151;">Все шаги процесса увольнения для <strong>{{employeeName}}</strong> успешно согласованы. Процесс закрыт.</p>`),
  },
  // vars: employeeName, stepLabel, reason, recipientName
  termination_rejected: {
    subject: "Процесс увольнения остановлен — {{employeeName}}",
    bodyHtml: TEMPLATE_HTML_SHELL("Процесс остановлен",
      `<h2 style="margin:0 0 16px;font-size:22px;color:#dc2626;">Процесс увольнения остановлен</h2>` +
      `<p style="color:#374151;">Здравствуйте, {{recipientName}}!</p>` +
      `<p style="color:#374151;">Шаг «{{stepLabel}}» был отклонён. Процесс увольнения сотрудника <strong>{{employeeName}}</strong> приостановлен.</p>` +
      `<div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;border-radius:4px;margin:16px 0;"><strong style="color:#991b1b;">Причина:</strong> {{reason}}</div>`),
  },
  // vars: stepLabel, employeeName, hoursOverdue
  sla_reminder: {
    subject: "⏰ Напоминание: шаг «{{stepLabel}}» просрочен",
    bodyHtml: TEMPLATE_HTML_SHELL("Напоминание",
      `<h2 style="margin:0 0 16px;font-size:22px;color:#d97706;">Напоминание о просроченном шаге</h2>` +
      `<p style="color:#374151;">Шаг <strong>«{{stepLabel}}»</strong> для <strong>{{employeeName}}</strong> ожидает выполнения уже <strong>{{hoursOverdue}} ч.</strong></p>` +
      `<p style="color:#374151;">Пожалуйста, обработайте задачу как можно скорее.</p>`),
  },
  // vars: stepLabel, employeeName, hoursOverdue, assignedRole
  sla_escalation: {
    subject: "🚨 Эскалация: шаг «{{stepLabel}}» критически просрочен",
    bodyHtml: TEMPLATE_HTML_SHELL("Эскалация",
      `<h2 style="margin:0 0 16px;font-size:22px;color:#dc2626;">Эскалация</h2>` +
      `<p style="color:#374151;">Шаг <strong>«{{stepLabel}}»</strong> для <strong>{{employeeName}}</strong> не выполнен в течение <strong>{{hoursOverdue}} ч.</strong></p>` +
      `<p style="color:#374151;">Ответственная роль: <strong>{{assignedRole}}</strong>. Требуется вмешательство руководителя.</p>`),
  },
};

export async function ensureDefaultEmailTemplates(): Promise<void> {
  for (const type of EMAIL_TEMPLATE_TYPES) {
    const defaults = DEFAULT_TEMPLATES[type];
    if (!defaults) continue;
    // Insert missing templates only — never overwrite admin customisations on restart.
    await db
      .insert(emailTemplatesTable)
      .values({ templateType: type, subject: defaults.subject, bodyHtml: defaults.bodyHtml })
      .onConflictDoNothing();
  }
}

/**
 * One-time migration: fix templates that were seeded with old variable names
 * ({{stepName}}, {{hoursElapsed}}, {{sheetId}}) before the canonical names were
 * established. Only templates whose body still contains these system-internal
 * placeholders are replaced — admin-customised content is left untouched.
 */
export async function migrateEmailTemplateVariables(): Promise<void> {
  const OLD_VARS = ["{{stepName}}", "{{hoursElapsed}}", "{{sheetId}}"];
  const rows = await db.select().from(emailTemplatesTable);
  for (const row of rows) {
    const hasOldVar = OLD_VARS.some((v) => row.bodyHtml.includes(v) || row.subject.includes(v));
    if (!hasOldVar) continue; // Not affected or already customised — leave alone
    const defaults = DEFAULT_TEMPLATES[row.templateType];
    if (!defaults) continue;
    await db
      .update(emailTemplatesTable)
      .set({ subject: defaults.subject, bodyHtml: defaults.bodyHtml, updatedAt: new Date() })
      .where(eq(emailTemplatesTable.templateType, row.templateType));
    logger.info({ type: row.templateType }, "[scheduler] Migrated email template to canonical variable names");
  }
}

let schedulerHandle: NodeJS.Timeout | null = null;

export function startScheduler(): void {
  // Seed defaults and run one-time migrations on startup (non-blocking)
  ensureDefaultSlaConfigs()
    .then(() => ensureDefaultEmailTemplates())
    .then(() => migrateEmailTemplateVariables())
    .catch((err) => logger.error({ err }, "[scheduler] Failed to seed/migrate defaults"));

  // Initial run shortly after startup
  setTimeout(() => runSlaCheck(), 60_000);

  const startInterval = async () => {
    const raw = await getConfig("scheduler_interval_minutes").catch(() => null);
    const intervalMinutes = raw ? Number(raw) : 30;
    const intervalMs = Math.max(intervalMinutes, 1) * 60_000;

    if (schedulerHandle) clearInterval(schedulerHandle);
    schedulerHandle = setInterval(() => {
      runSlaCheck();
    }, intervalMs);

    logger.info({ intervalMinutes }, "[scheduler] SLA scheduler started");
  };

  startInterval().catch((err) =>
    logger.error({ err }, "[scheduler] Failed to start SLA scheduler"),
  );
}

export function stopScheduler(): void {
  if (schedulerHandle) {
    clearInterval(schedulerHandle);
    schedulerHandle = null;
  }
}
