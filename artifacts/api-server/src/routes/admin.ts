/**
 * Admin-only endpoints:
 *
 * GET  /audit-log              — paginated audit log with filters
 * POST /admin/bitrix24/test    — test Bitrix24 connection
 */

import { Router } from "express";
import { db, auditLogTable, stepMetaTable } from "@workspace/db";
import { eq, and, gte, lte, desc, SQL, ilike } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getConfig } from "../lib/config";
import { logger } from "../lib/logger";
import { ROUTING_STEP_META, ROUTING_PUBLIC_STEP_ORDER } from "../lib/routingStepMeta";
import { TERMINATION_STEP_META, TERMINATION_PUBLIC_STEP_ORDER } from "../lib/terminationStepMeta";
import { logAudit } from "../lib/audit";

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

// ─── Step metadata management ────────────────────────────────────────────────
// GET  /admin/step-meta         — list all step types with current values
//                                 (defaults merged with admin overrides)
// PUT  /admin/step-meta/:kind/:stepType  — upsert cabinet + instructions
//                                          for a specific step type
// POST /admin/step-meta/:kind/:stepType/reset  — delete override, revert to default

interface StepMetaRow {
  sheetKind: "routing" | "termination";
  stepType: string;
  label: string;
  cabinet: string;
  instructions: string;
  isCustomized: boolean; // true when an admin override exists in step_meta
  updatedAt: string | null;
  updatedBy: string | null;
}

/** Build the full list of step types (defaults + DB overrides) for admin UI. */
async function buildStepMetaList(): Promise<StepMetaRow[]> {
  // Load all overrides from DB
  const overrides = await db.select().from(stepMetaTable);
  const overrideMap = new Map(overrides.map(o => [`${o.sheetKind}:${o.stepType}`, o]));

  const rows: StepMetaRow[] = [];

  // Routing steps — in canonical order
  for (const stepType of ROUTING_PUBLIC_STEP_ORDER) {
    const def = ROUTING_STEP_META[stepType];
    if (!def) continue;
    const ov = overrideMap.get(`routing:${stepType}`);
    rows.push({
      sheetKind: "routing",
      stepType,
      label: ov?.label ?? def.label,
      cabinet: ov?.cabinet ?? def.cabinet,
      instructions: ov?.instructions ?? def.instructions,
      isCustomized: !!ov,
      updatedAt: ov ? ov.updatedAt.toISOString() : null,
      updatedBy: ov?.updatedBy ?? null,
    });
  }
  // Include doctor-only routing steps too (background, but admin can still edit)
  for (const stepType of ["doctor_profile", "site_publication"]) {
    const def = ROUTING_STEP_META[stepType];
    if (!def) continue;
    const ov = overrideMap.get(`routing:${stepType}`);
    rows.push({
      sheetKind: "routing",
      stepType,
      label: ov?.label ?? def.label,
      cabinet: ov?.cabinet ?? def.cabinet,
      instructions: ov?.instructions ?? def.instructions,
      isCustomized: !!ov,
      updatedAt: ov ? ov.updatedAt.toISOString() : null,
      updatedBy: ov?.updatedBy ?? null,
    });
  }

  // Termination steps — in canonical order
  for (const stepType of TERMINATION_PUBLIC_STEP_ORDER) {
    const def = TERMINATION_STEP_META[stepType];
    if (!def) continue;
    const ov = overrideMap.get(`termination:${stepType}`);
    rows.push({
      sheetKind: "termination",
      stepType,
      label: ov?.label ?? def.label,
      cabinet: ov?.cabinet ?? def.cabinet,
      instructions: ov?.instructions ?? def.instructions,
      isCustomized: !!ov,
      updatedAt: ov ? ov.updatedAt.toISOString() : null,
      updatedBy: ov?.updatedBy ?? null,
    });
  }

  return rows;
}

// GET /admin/step-meta — list all step types
adminRouter.get(
  "/admin/step-meta",
  requireAuth,
  requireAdmin,
  async (_req, res): Promise<void> => {
    const rows = await buildStepMetaList();
    res.json(rows);
  },
);

// PUT /admin/step-meta/:kind/:stepType — create or update override
adminRouter.put(
  "/admin/step-meta/:kind/:stepType",
  requireAuth,
  requireAdmin,
  async (req, res): Promise<void> => {
    const { kind, stepType } = req.params;
    if (kind !== "routing" && kind !== "termination") {
      res.status(400).json({ error: "sheet_kind must be 'routing' or 'termination'" });
      return;
    }
    // Validate stepType exists in defaults
    const defaults = kind === "routing" ? ROUTING_STEP_META : TERMINATION_STEP_META;
    if (!defaults[stepType]) {
      res.status(404).json({ error: `Unknown step type: ${stepType}` });
      return;
    }

    const { label, cabinet, instructions } = req.body;
    if (!label || typeof label !== "string" || label.trim() === "") {
      res.status(400).json({ error: "label is required" });
      return;
    }

    const [existing] = await db.select().from(stepMetaTable)
      .where(and(eq(stepMetaTable.sheetKind, kind), eq(stepMetaTable.stepType, stepType)));

    const actor = req.user!.fullName;
    let row;
    if (existing) {
      [row] = await db.update(stepMetaTable).set({
        label: label.trim(),
        cabinet: cabinet ?? null,
        instructions: instructions ?? null,
        updatedBy: actor,
      }).where(eq(stepMetaTable.id, existing.id)).returning();
    } else {
      [row] = await db.insert(stepMetaTable).values({
        sheetKind: kind,
        stepType,
        label: label.trim(),
        cabinet: cabinet ?? null,
        instructions: instructions ?? null,
        updatedBy: actor,
      }).returning();
    }

    await logAudit({
      actorId: req.user!.id,
      actorName: actor,
      action: "update_step_meta",
      objectType: "step_meta",
      objectId: row.id,
      details: `${kind}:${stepType} → cabinet=${cabinet ?? "(null)"}`,
    });

    res.json({
      sheetKind: row.sheetKind,
      stepType: row.stepType,
      label: row.label,
      cabinet: row.cabinet,
      instructions: row.instructions,
      isCustomized: true,
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: row.updatedBy,
    });
  },
);

// POST /admin/step-meta/:kind/:stepType/reset — delete override, revert to default
adminRouter.post(
  "/admin/step-meta/:kind/:stepType/reset",
  requireAuth,
  requireAdmin,
  async (req, res): Promise<void> => {
    const { kind, stepType } = req.params;
    if (kind !== "routing" && kind !== "termination") {
      res.status(400).json({ error: "sheet_kind must be 'routing' or 'termination'" });
      return;
    }

    const [existing] = await db.select().from(stepMetaTable)
      .where(and(eq(stepMetaTable.sheetKind, kind), eq(stepMetaTable.stepType, stepType)));

    if (!existing) {
      res.status(404).json({ error: "No override to reset" });
      return;
    }

    await db.delete(stepMetaTable).where(eq(stepMetaTable.id, existing.id));

    await logAudit({
      actorId: req.user!.id,
      actorName: req.user!.fullName,
      action: "reset_step_meta",
      objectType: "step_meta",
      objectId: existing.id,
      details: `${kind}:${stepType} → reverted to default`,
    });

    // Return the default value back to the client
    const defaults = kind === "routing" ? ROUTING_STEP_META : TERMINATION_STEP_META;
    const def = defaults[stepType];
    res.json({
      sheetKind: kind,
      stepType,
      label: def.label,
      cabinet: def.cabinet,
      instructions: def.instructions,
      isCustomized: false,
      updatedAt: null,
      updatedBy: null,
    });
  },
);
