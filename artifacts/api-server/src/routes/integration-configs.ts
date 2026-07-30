/**
 * Admin API for integration configuration and SLA settings.
 * All endpoints require admin role.
 *
 * GET  /integration-configs          — list all config key-value pairs
 * PATCH /integration-configs/:key    — update a single config value
 * GET  /sla-configs                  — list all SLA configs
 * PATCH /sla-configs/:stepType       — update SLA config for a step type
 * GET  /notification-log             — view recent notification log (admin only)
 */

import { Router } from "express";
import { db, integrationConfigsTable, slaConfigsTable, notificationLogTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { setConfig, clearConfigCache } from "../lib/config";

export const integrationConfigsRouter = Router();

function requireAdmin(req: any, res: any, next: any) {
  if (req.user?.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return;
  }
  next();
}

// GET /integration-configs
integrationConfigsRouter.get(
  "/integration-configs",
  requireAuth,
  requireAdmin,
  async (_req, res): Promise<void> => {
    const rows = await db.select().from(integrationConfigsTable);
    // Never expose gas_webhook_secret value in responses
    const sanitized = rows.map((r) => ({
      ...r,
      value: r.key === "gas_webhook_secret" && r.value ? "••••••••" : r.value,
    }));
    res.json(sanitized);
  },
);

// PATCH /integration-configs/:key
integrationConfigsRouter.patch(
  "/integration-configs/:key",
  requireAuth,
  requireAdmin,
  async (req, res): Promise<void> => {
    const key = req.params["key"] as string;
    const { value } = req.body as { value: string | null };
    if (value !== null && typeof value !== "string") {
      res.status(400).json({ error: "value must be a string or null" });
      return;
    }
    // Reject attempts to persist the masked placeholder for secret fields
    const SECRET_KEYS = ["gas_webhook_secret"];
    if (SECRET_KEYS.includes(key) && typeof value === "string" && value.startsWith("••")) {
      res.status(400).json({ error: "Cannot save a masked placeholder as a secret value. Enter the real secret or leave it unchanged." });
      return;
    }
    // null means "clear the value"; non-null non-empty string means set it
    await setConfig(key, value ?? null);
    clearConfigCache();
    const [updated] = await db
      .select()
      .from(integrationConfigsTable)
      .where(eq(integrationConfigsTable.key, key));
    const sanitized = {
      ...updated,
      value: key === "gas_webhook_secret" && updated?.value ? "••••••••" : updated?.value ?? null,
    };
    res.json(sanitized);
  },
);

// GET /sla-configs
integrationConfigsRouter.get(
  "/sla-configs",
  requireAuth,
  requireAdmin,
  async (_req, res): Promise<void> => {
    const rows = await db.select().from(slaConfigsTable);
    res.json(rows);
  },
);

// PATCH /sla-configs/:stepType
integrationConfigsRouter.patch(
  "/sla-configs/:stepType",
  requireAuth,
  requireAdmin,
  async (req, res): Promise<void> => {
    const stepType = req.params["stepType"] as string;
    const { slaHours, escalationHours, supervisorRole } = req.body as {
      slaHours?: number;
      escalationHours?: number;
      supervisorRole?: string;
    };

    const [existing] = await db
      .select()
      .from(slaConfigsTable)
      .where(eq(slaConfigsTable.stepType, stepType));
    if (!existing) {
      res.status(404).json({ error: "SLA config not found for step type" });
      return;
    }

    const [updated] = await db
      .update(slaConfigsTable)
      .set({
        slaHours: slaHours ?? existing.slaHours,
        escalationHours: escalationHours ?? existing.escalationHours,
        supervisorRole: supervisorRole ?? existing.supervisorRole,
        updatedAt: new Date(),
      })
      .where(eq(slaConfigsTable.stepType, stepType))
      .returning();

    res.json(updated);
  },
);

// GET /notification-log?limit=50
integrationConfigsRouter.get(
  "/notification-log",
  requireAuth,
  requireAdmin,
  async (req, res): Promise<void> => {
    const limit = Math.min(Number(req.query["limit"] ?? 50), 200);
    const rows = await db
      .select()
      .from(notificationLogTable)
      .orderBy(desc(notificationLogTable.createdAt))
      .limit(limit);
    res.json(rows);
  },
);
