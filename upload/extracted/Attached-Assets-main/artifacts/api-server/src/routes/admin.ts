/**
 * Admin-only endpoints:
 *
 * GET  /audit-log              — paginated audit log with filters
 * POST /admin/bitrix24/test    — test Bitrix24 connection
 */

import { Router } from "express";
import { db, auditLogTable } from "@workspace/db";
import { eq, and, gte, lte, desc, SQL, ilike } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getConfig } from "../lib/config";
import { logger } from "../lib/logger";

export const adminRouter = Router();

function requireAdmin(req: any, res: any, next: any) {
  if (req.user?.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return;
  }
  next();
}

// GET /audit-log?actorId=&action=&objectType=&from=&to=&limit=50&offset=0
adminRouter.get(
  "/audit-log",
  requireAuth,
  requireAdmin,
  async (req, res): Promise<void> => {
    const { actorId, action, objectType, from, to } = req.query as Record<string, string | undefined>;
    const limit = Math.min(Number(req.query["limit"] ?? 50), 200);
    const offset = Number(req.query["offset"] ?? 0);

    const filters: SQL[] = [];
    if (actorId) filters.push(eq(auditLogTable.actorId, Number(actorId)));
    if (action) filters.push(ilike(auditLogTable.action, `%${action}%`));
    if (objectType) filters.push(eq(auditLogTable.objectType, objectType));
    if (from) filters.push(gte(auditLogTable.createdAt, new Date(from)));
    if (to) filters.push(lte(auditLogTable.createdAt, new Date(to)));

    const query = db.select().from(auditLogTable);
    const withFilters = filters.length > 0 ? query.where(and(...filters)) : query;

    const rows = await withFilters
      .orderBy(desc(auditLogTable.createdAt))
      .limit(limit)
      .offset(offset);

    // Count total for pagination (separate query, simple approach)
    const countQuery = db.select({ id: auditLogTable.id }).from(auditLogTable);
    const withCountFilters = filters.length > 0 ? countQuery.where(and(...filters)) : countQuery;
    const allIds = await withCountFilters;

    res.json({ items: rows, total: allIds.length, limit, offset });
  },
);

// POST /admin/bitrix24/test — dry-run Bitrix24 connection test
adminRouter.post(
  "/admin/bitrix24/test",
  requireAuth,
  requireAdmin,
  async (_req, res): Promise<void> => {
    const restUrl = await getConfig("bitrix24_rest_url");
    if (!restUrl) {
      res.json({ ok: false, message: "bitrix24_rest_url не настроен. Добавьте URL в разделе «Интеграции»." });
      return;
    }

    try {
      // Bitrix24 REST: GET {restUrl}/app.info returns info about the app
      const url = restUrl.endsWith("/") ? `${restUrl}app.info` : `${restUrl}/app.info`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!resp.ok) {
        res.json({ ok: false, message: `Bitrix24 вернул статус ${resp.status}` });
        return;
      }
      const data = await resp.json() as any;
      if (data?.error) {
        res.json({ ok: false, message: `Ошибка Bitrix24: ${data.error_description ?? data.error}` });
        return;
      }
      res.json({ ok: true, message: "Соединение с Bitrix24 установлено успешно" });
    } catch (err: any) {
      logger.warn({ err }, "[bitrix24/test] connection test failed");
      res.json({ ok: false, message: `Не удалось подключиться: ${err?.message ?? "неизвестная ошибка"}` });
    }
  },
);
