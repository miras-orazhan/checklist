import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const EMAIL_TEMPLATE_TYPES = [
  "offer_invitation",
  "otp_code",
  "routing_sheet_confirmation",
  "routing_sheet_step_assigned",
  "routing_sheet_completed",
  "termination_step_assigned",
  "termination_completed",
  "termination_rejected",
  "sla_reminder",
  "sla_escalation",
] as const;

export type EmailTemplateType = (typeof EMAIL_TEMPLATE_TYPES)[number];

/** Per-type variables available for {{var}} substitution */
// Variable names here MUST match what render*Email() wrappers pass to substituteVars().
export const EMAIL_TEMPLATE_VARIABLES: Record<EmailTemplateType, { name: string; description: string }[]> = {
  offer_invitation: [
    { name: "candidateName", description: "ФИО кандидата" },
    { name: "companyName", description: "Название филиала/компании" },
    { name: "offerLink", description: "Ссылка на оффер (URL)" },
    { name: "message", description: "Дополнительное сообщение от рекрутера" },
  ],
  otp_code: [
    { name: "otpCode", description: "Код подтверждения (6 цифр)" },
  ],
  routing_sheet_confirmation: [
    { name: "candidateName", description: "ФИО кандидата" },
    { name: "statusLink", description: "Ссылка на страницу статуса" },
  ],
  routing_sheet_step_assigned: [
    { name: "stepLabel", description: "Название шага обходного листа" },
    { name: "employeeName", description: "ФИО кандидата" },
    { name: "taskLink", description: "Ссылка на страницу задач" },
  ],
  routing_sheet_completed: [
    { name: "employeeName", description: "ФИО кандидата" },
    { name: "branchName", description: "Название филиала" },
    { name: "recipientName", description: "ФИО получателя" },
  ],
  termination_step_assigned: [
    { name: "stepLabel", description: "Название шага увольнения" },
    { name: "employeeName", description: "ФИО сотрудника" },
    { name: "taskLink", description: "Ссылка на страницу задач по увольнению" },
  ],
  termination_completed: [
    { name: "employeeName", description: "ФИО сотрудника" },
    { name: "recipientName", description: "ФИО получателя" },
  ],
  termination_rejected: [
    { name: "employeeName", description: "ФИО сотрудника" },
    { name: "stepLabel", description: "Шаг, на котором остановлен процесс" },
    { name: "reason", description: "Причина отклонения" },
    { name: "recipientName", description: "ФИО получателя" },
  ],
  sla_reminder: [
    { name: "stepLabel", description: "Название шага" },
    { name: "employeeName", description: "ФИО сотрудника/кандидата" },
    { name: "hoursOverdue", description: "Часов прошло с момента создания шага" },
  ],
  sla_escalation: [
    { name: "stepLabel", description: "Название шага" },
    { name: "employeeName", description: "ФИО сотрудника/кандидата" },
    { name: "hoursOverdue", description: "Часов прошло с момента создания шага" },
    { name: "assignedRole", description: "Ответственная роль" },
  ],
};

export const emailTemplatesTable = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  templateType: text("template_type").notNull().unique(),
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
});

export type EmailTemplate = typeof emailTemplatesTable.$inferSelect;
