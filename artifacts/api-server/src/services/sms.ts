/**
 * Pluggable SMS adapter (SMS.ru / Twilio / etc.)
 *
 * NOT used for OTP — OTP codes are sent via email only.
 *
 * Interface: SmsAdapter
 * Default: StubSmsAdapter — logs to console, no external call
 *
 * To swap in a real provider:
 *   1. Implement SmsAdapter
 *   2. Replace `export const sms` below with your implementation
 *   3. Store credentials in integration_configs
 */

import { logger } from "../lib/logger";
import { logNotification } from "../lib/notificationLog";

export interface SmsAdapter {
  sendSms(opts: {
    to: string; // phone number in international format
    text: string;
    objectType?: string;
    objectId?: number;
  }): Promise<void>;
}

// ─── Stub implementation ─────────────────────────────────────────────────────

class StubSmsAdapter implements SmsAdapter {
  async sendSms(opts: {
    to: string;
    text: string;
    objectType?: string;
    objectId?: number;
  }): Promise<void> {
    logger.info({ to: opts.to, preview: opts.text.slice(0, 80) }, "[sms:stub] SMS not sent (no adapter configured)");
    await logNotification({
      channel: "sms",
      recipient: opts.to,
      subject: opts.text.slice(0, 120),
      status: "sent",
      objectType: opts.objectType,
      objectId: opts.objectId,
    });
  }
}

export const sms: SmsAdapter = new StubSmsAdapter();
