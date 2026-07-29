import { db, notificationLogTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

export interface LogNotificationOpts {
  channel: "email" | "sms" | "messenger";
  recipient: string;
  subject?: string;
  status: "sent" | "failed";
  errorMessage?: string;
  objectType?: string;
  objectId?: number;
}

export async function logNotification(opts: LogNotificationOpts): Promise<void> {
  try {
    await db.insert(notificationLogTable).values({
      channel: opts.channel,
      recipient: opts.recipient,
      subject: opts.subject,
      status: opts.status,
      errorMessage: opts.errorMessage,
      objectType: opts.objectType,
      objectId: opts.objectId,
    });
  } catch {
    // Never fail the primary operation because of logging
  }
}

/**
 * Returns true if a notification with this subject was already sent for the given object.
 * Used by the SLA scheduler to prevent duplicate reminders.
 */
export async function notificationAlreadySent(
  objectType: string,
  objectId: number,
  subject: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: notificationLogTable.id })
    .from(notificationLogTable)
    .where(
      and(
        eq(notificationLogTable.objectType, objectType),
        eq(notificationLogTable.objectId, objectId),
        eq(notificationLogTable.subject, subject),
        eq(notificationLogTable.status, "sent"),
      ),
    );
  return !!row;
}
