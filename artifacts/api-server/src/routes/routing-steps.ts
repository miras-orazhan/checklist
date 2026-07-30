import { Router } from "express";
import { db, routingStepsTable, routingSheetsTable, candidatesTable, branchesTable, positionsTable, usersTable } from "@workspace/db";
import { eq, and, SQL } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { checkAndCloseSheet } from "../lib/routingSheet";
import { logAudit } from "../lib/audit";
import { CompleteRoutingStepBody, OverrideRoutingStepBody } from "@workspace/api-zod";
import { notifyRoutingSheetCompleted } from "../lib/notifications";
import { createAccountCreationTask } from "../services/bitrix24";

export const routingStepsRouter = Router();

function enrichStep(step: typeof routingStepsTable.$inferSelect) {
  return {
    id: step.id,
    routingSheetId: step.routingSheetId,
    stepType: step.stepType,
    assignedRole: step.assignedRole,
    assignedUserId: step.assignedUserId ?? null,
    status: step.status,
    isBackground: step.isBackground,
    notes: step.notes ?? null,
    photoUrl: step.photoUrl ?? null,
    completedById: step.completedById ?? null,
    completedByName: null as string | null,
    isOverride: step.isOverride,
    stepData: step.stepData ?? null,
    completedAt: step.completedAt ?? null,
    updatedAt: step.updatedAt,
    createdAt: step.createdAt,
  };
}

// GET /routing-steps?routingSheetId=&pending=true
// pending=true means: pending steps assigned to the current user's role
routingStepsRouter.get("/routing-steps", requireAuth, async (req, res): Promise<void> => {
  const { routingSheetId, pending } = req.query as Record<string, string | undefined>;
  const conditions: SQL[] = [];

  if (routingSheetId) conditions.push(eq(routingStepsTable.routingSheetId, Number(routingSheetId)));

  if (pending === "true") {
    // Only steps assigned to the current user's role that are still pending
    conditions.push(eq(routingStepsTable.assignedRole, req.user!.role));
    conditions.push(eq(routingStepsTable.status, "pending"));
  }

  const steps = await db.select().from(routingStepsTable)
    .where(conditions.length ? and(...conditions) : undefined);
  res.json(steps.map(enrichStep));
});

routingStepsRouter.get("/routing-steps/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [step] = await db.select().from(routingStepsTable).where(eq(routingStepsTable.id, id));
  if (!step) { res.status(404).json({ error: "Not found" }); return; }
  res.json(enrichStep(step));
});

routingStepsRouter.post("/routing-steps/:id/complete", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = CompleteRoutingStepBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const [step] = await db.select().from(routingStepsTable).where(eq(routingStepsTable.id, id));
  if (!step) { res.status(404).json({ error: "Not found" }); return; }

  const user = req.user!;
  // Role check: only the assigned role or admin can complete
  if (user.role !== "admin" && user.role !== step.assignedRole) {
    res.status(403).json({ error: "Forbidden: wrong role for this step" }); return;
  }

  const { notes, photoUrl } = parsed.data as any;
  const [updated] = await db.update(routingStepsTable).set({
    status: "completed",
    notes: notes ?? step.notes,
    photoUrl: photoUrl ?? step.photoUrl,
    completedById: user.id,
    completedAt: new Date(),
  }).where(eq(routingStepsTable.id, id)).returning();

  await logAudit({ actorId: user.id, actorName: user.fullName, action: "complete_step", objectType: "routing_step", objectId: id });
  await checkAndCloseSheet(step.routingSheetId);

  // Fire-and-forget: check if sheet just closed → notify recruiter
  (async () => {
    const [sheet] = await db.select().from(routingSheetsTable).where(eq(routingSheetsTable.id, step.routingSheetId));
    if (sheet?.status === "completed") {
      notifyRoutingSheetCompleted({ routingSheetId: sheet.id, candidateId: sheet.candidateId, branchId: sheet.branchId });
    }
    // Bitrix24: create account-creation task when HR registration step is done
    if (step.stepType === "hr_registration") {
      const [candidate] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, sheet!.candidateId));
      const [position] = await db.select().from(positionsTable).where(eq(positionsTable.id, sheet!.positionId));
      const [branch] = await db.select().from(branchesTable).where(eq(branchesTable.id, sheet!.branchId));
      if (candidate) {
        createAccountCreationTask({
          employeeName: candidate.fullName,
          email: candidate.email,
          position: position?.name ?? "",
          branch: branch?.name ?? "",
          routingSheetId: step.routingSheetId,
        });
      }
    }
  })().catch(() => {});

  res.json(enrichStep(updated));
});

routingStepsRouter.post("/routing-steps/:id/override", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = OverrideRoutingStepBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const [step] = await db.select().from(routingStepsTable).where(eq(routingStepsTable.id, id));
  if (!step) { res.status(404).json({ error: "Not found" }); return; }

  const user = req.user!;
  if (user.role !== "admin") {
    res.status(403).json({ error: "Only admins can override steps" }); return;
  }

  const { reason } = parsed.data as any;
  const [updated] = await db.update(routingStepsTable).set({
    status: "completed",
    notes: reason ?? step.notes,
    completedById: user.id,
    isOverride: true,
    completedAt: new Date(),
  }).where(eq(routingStepsTable.id, id)).returning();

  await logAudit({ actorId: user.id, actorName: user.fullName, action: "override_step", objectType: "routing_step", objectId: id, details: reason });
  await checkAndCloseSheet(step.routingSheetId);

  // Fire-and-forget: check if sheet just closed → notify recruiter
  (async () => {
    const [sheet] = await db.select().from(routingSheetsTable).where(eq(routingSheetsTable.id, step.routingSheetId));
    if (sheet?.status === "completed") {
      notifyRoutingSheetCompleted({ routingSheetId: sheet.id, candidateId: sheet.candidateId, branchId: sheet.branchId });
    }
  })().catch(() => {});

  res.json(enrichStep(updated));
});
