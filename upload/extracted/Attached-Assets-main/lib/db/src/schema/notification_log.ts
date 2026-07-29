import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * Tracks every outbound notification attempt (email, SMS, messenger).
 * Used for:
 * - Deduplication: prevent sending duplicate SLA reminders
 * - Audit trail: admin can review all notifications sent
 * - Failure surfacing: admin can see failed delivery attempts
 */
export const notificationLogTable = pgTable("notification_log", {
  id: serial("id").primaryKey(),
  channel: text("channel").notNull(), // 'email' | 'sms' | 'messenger'
  recipient: text("recipient").notNull(), // email address or phone
  subject: text("subject"), // for email; also used as event type key for dedup
  status: text("status").notNull().default("sent"), // 'sent' | 'failed'
  errorMessage: text("error_message"),
  objectType: text("object_type"), // e.g. 'routing_step', 'offer', 'termination_step'
  objectId: integer("object_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type NotificationLog = typeof notificationLogTable.$inferSelect;
