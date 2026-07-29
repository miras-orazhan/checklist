/**
 * Bitrix24Service — creates tasks via Bitrix24 REST API.
 *
 * Configuration keys:
 *   bitrix24_rest_url   — Bitrix24 REST endpoint base, e.g.
 *                         https://mycompany.bitrix24.ru/rest/1/secret_token
 *   bitrix24_responsible_id — numeric user ID in Bitrix24 assigned to new tasks
 *
 * When not configured, calls are silently no-oped and logged.
 * Failures are retried up to 3 times with exponential backoff and logged to audit_log.
 */

import { getConfig } from "../lib/config";
import { logAudit } from "../lib/audit";
import { logger } from "../lib/logger";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface Bitrix24Task {
  TITLE: string;
  DESCRIPTION: string;
  RESPONSIBLE_ID: number;
  [key: string]: unknown;
}

async function callBitrix24(method: string, fields: Bitrix24Task): Promise<unknown> {
  const baseUrl = await getConfig("bitrix24_rest_url");
  if (!baseUrl) {
    logger.info({ method, title: fields.TITLE }, "[bitrix24] REST URL not configured — skipping");
    return null;
  }

  const url = `${baseUrl.replace(/\/$/, "")}/${method}.json`;
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Bitrix24 HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      if (attempt < 3) await sleep(1_000 * Math.pow(2, attempt - 1));
    }
  }

  throw lastError;
}

async function getResponsibleId(): Promise<number> {
  const id = await getConfig("bitrix24_responsible_id");
  return id ? Number(id) : 1;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Called when HR completes the "hr_registration" onboarding step.
 * Creates an "IT account creation" task in Bitrix24.
 */
export async function createAccountCreationTask(opts: {
  employeeName: string;
  email: string;
  position: string;
  branch: string;
  routingSheetId: number;
}): Promise<void> {
  try {
    const responsibleId = await getResponsibleId();
    await callBitrix24("tasks.task.add", {
      TITLE: `Создать учётные записи — ${opts.employeeName}`,
      DESCRIPTION: [
        `Новый сотрудник: ${opts.employeeName}`,
        `Email: ${opts.email}`,
        `Должность: ${opts.position}`,
        `Филиал: ${opts.branch}`,
        `Обходной лист #${opts.routingSheetId}`,
      ].join("\n"),
      RESPONSIBLE_ID: responsibleId,
    });
    logger.info({ routingSheetId: opts.routingSheetId }, "[bitrix24] Account creation task created");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg, routingSheetId: opts.routingSheetId }, "[bitrix24] Failed to create account-creation task");
    await logAudit({
      actorName: "system",
      action: "bitrix24_error",
      objectType: "routing_sheet",
      objectId: opts.routingSheetId,
      details: `Account creation task failed: ${msg}`,
    }).catch(() => {});
  }
}

/**
 * Called when a termination sheet is created (for offboarding IT revocation).
 */
export async function createAccountRevocationTask(opts: {
  employeeName: string;
  email: string;
  position: string;
  branch: string;
  terminationSheetId: number;
  terminationDate: Date;
}): Promise<void> {
  try {
    const responsibleId = await getResponsibleId();
    await callBitrix24("tasks.task.add", {
      TITLE: `Отозвать учётные записи — ${opts.employeeName}`,
      DESCRIPTION: [
        `Увольняемый сотрудник: ${opts.employeeName}`,
        `Email: ${opts.email}`,
        `Должность: ${opts.position}`,
        `Филиал: ${opts.branch}`,
        `Дата увольнения: ${opts.terminationDate.toLocaleDateString("ru-RU")}`,
        `Лист увольнения #${opts.terminationSheetId}`,
      ].join("\n"),
      RESPONSIBLE_ID: responsibleId,
    });
    logger.info({ terminationSheetId: opts.terminationSheetId }, "[bitrix24] Account revocation task created");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg, terminationSheetId: opts.terminationSheetId }, "[bitrix24] Failed to create account-revocation task");
    await logAudit({
      actorName: "system",
      action: "bitrix24_error",
      objectType: "termination_sheet",
      objectId: opts.terminationSheetId,
      details: `Account revocation task failed: ${msg}`,
    }).catch(() => {});
  }
}
