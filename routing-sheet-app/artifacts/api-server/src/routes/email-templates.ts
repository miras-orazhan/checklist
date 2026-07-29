/**
 * Admin API for email template management.
 * All endpoints require admin role.
 *
 * GET  /email-templates         — list all templates
 * GET  /email-templates/:type   — get a single template
 * PATCH /email-templates/:type  — update a template's subject and/or body
 */

import { Router } from "express";
import { db, emailTemplatesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logAudit } from "../lib/audit";
import { EMAIL_TEMPLATE_VARIABLES } from "@workspace/db";
import { invalidateEmailTemplateCache } from "../lib/emailTemplateCache";

export const emailTemplatesRouter = Router();

function requireAdmin(req: any, res: any, next: any) {
  if (req.user?.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return;
  }
  next();
}

// GET /email-templates
emailTemplatesRouter.get(
  "/email-templates",
  requireAuth,
  requireAdmin,
  async (_req, res): Promise<void> => {
    const rows = await db.select().from(emailTemplatesTable).orderBy(emailTemplatesTable.templateType);
    const withVars = rows.map(r => ({
      ...r,
      variables: EMAIL_TEMPLATE_VARIABLES[r.templateType as keyof typeof EMAIL_TEMPLATE_VARIABLES] ?? [],
    }));
    res.json(withVars);
  },
);

// GET /email-templates/:type
emailTemplatesRouter.get(
  "/email-templates/:type",
  requireAuth,
  requireAdmin,
  async (req, res): Promise<void> => {
    const type = req.params["type"] as string;
    const [row] = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.templateType, type));
    if (!row) { res.status(404).json({ error: "Template not found" }); return; }
    res.json({
      ...row,
      variables: EMAIL_TEMPLATE_VARIABLES[type as keyof typeof EMAIL_TEMPLATE_VARIABLES] ?? [],
    });
  },
);

// PATCH /email-templates/:type
emailTemplatesRouter.patch(
  "/email-templates/:type",
  requireAuth,
  requireAdmin,
  async (req, res): Promise<void> => {
    const type = req.params["type"] as string;
    const { subject, bodyHtml } = req.body as { subject?: string; bodyHtml?: string };
    const user = req.user!;

    const [existing] = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.templateType, type));
    if (!existing) { res.status(404).json({ error: "Template not found" }); return; }

    const [updated] = await db
      .update(emailTemplatesTable)
      .set({
        subject: subject ?? existing.subject,
        bodyHtml: bodyHtml ?? existing.bodyHtml,
        updatedAt: new Date(),
        updatedBy: user.fullName,
      })
      .where(eq(emailTemplatesTable.templateType, type))
      .returning();

    await logAudit({
      actorId: user.id,
      actorName: user.fullName,
      action: "update_email_template",
      objectType: "email_template",
      objectId: updated.id,
      details: type,
    });

    // Invalidate the template cache in email service
    invalidateEmailTemplateCache(type);

    res.json({
      ...updated,
      variables: EMAIL_TEMPLATE_VARIABLES[type as keyof typeof EMAIL_TEMPLATE_VARIABLES] ?? [],
    });
  },
);
