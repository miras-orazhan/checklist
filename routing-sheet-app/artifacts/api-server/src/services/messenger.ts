/**
 * Pluggable messenger adapter (WhatsApp / Telegram / etc.)
 *
 * Interface: MessengerAdapter
 * Default: StubMessengerAdapter — logs to console, no external call
 *
 * To swap in a real provider:
 *   1. Implement MessengerAdapter (e.g. TwilioWhatsAppAdapter)
 *   2. Replace `export const messenger` below with your implementation
 *   3. Wire any credentials through integration_configs (see lib/config.ts)
 *
 * The adapter is intentionally kept separate from the email adapter so each
 * can be swapped independently.
 */

import { logger } from "../lib/logger";
import { logNotification } from "../lib/notificationLog";

export interface MessengerAdapter {
  sendMessage(opts: {
    to: string; // phone number or chat ID
    text: string;
    objectType?: string;
    objectId?: number;
  }): Promise<void>;
}

// ─── Stub implementation ─────────────────────────────────────────────────────

class StubMessengerAdapter implements MessengerAdapter {
  async sendMessage(opts: {
    to: string;
    text: string;
    objectType?: string;
    objectId?: number;
  }): Promise<void> {
    logger.info({ to: opts.to, preview: opts.text.slice(0, 80) }, "[messenger:stub] Message not sent (no adapter configured)");
    await logNotification({
      channel: "messenger",
      recipient: opts.to,
      subject: opts.text.slice(0, 120),
      status: "sent", // stub always "succeeds"
      objectType: opts.objectType,
      objectId: opts.objectId,
    });
  }
}

export const messenger: MessengerAdapter = new StubMessengerAdapter();

// ─── Convenience: send offer link via messenger ───────────────────────────────

export async function sendOfferLinkMessage(opts: {
  phone: string;
  candidateName: string;
  offerLink: string;
  companyName: string;
  objectId?: number;
}): Promise<void> {
  const text = `Здравствуйте, ${opts.candidateName}! Компания ${opts.companyName} направила вам предложение о работе. Откройте ссылку: ${opts.offerLink}`;
  await messenger.sendMessage({
    to: opts.phone,
    text,
    objectType: "offer",
    objectId: opts.objectId,
  });
}
