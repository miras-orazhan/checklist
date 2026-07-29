import { Router } from "express";
import { db, routingSheetsTable, routingStepsTable, candidatesTable, branchesTable, positionsTable, usersTable } from "@workspace/db";
import { eq, and, SQL } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logAudit } from "../lib/audit";
import { CloseRoutingSheetBody } from "@workspace/api-zod";

export const routingSheetsRouter = Router();

async function enrichSheet(sheet: typeof routingSheetsTable.$inferSelect) {
  const [candidate] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, sheet.candidateId));
  const [branch] = await db.select().from(branchesTable).where(eq(branchesTable.id, sheet.branchId));
  const [position] = await db.select().from(positionsTable).where(eq(positionsTable.id, sheet.positionId));
  const steps = await db.select().from(routingStepsTable).where(eq(routingStepsTable.routingSheetId, sheet.id));

  const enrichedSteps = await Promise.all(steps.map(async (s) => {
    let completedByName: string | null = null;
    if (s.completedById) {
      const [u] = await db.select().from(usersTable).where(eq(usersTable.id, s.completedById));
      completedByName = u?.fullName ?? null;
    }
    return {
      id: s.id,
      routingSheetId: s.routingSheetId,
      stepType: s.stepType,
      assignedRole: s.assignedRole,
      assignedUserId: s.assignedUserId ?? null,
      status: s.status,
      isBackground: s.isBackground,
      notes: s.notes ?? null,
      photoUrl: s.photoUrl ?? null,
      completedById: s.completedById ?? null,
      completedByName,
      isOverride: s.isOverride,
      stepData: s.stepData ?? null,
      completedAt: s.completedAt ?? null,
      updatedAt: s.updatedAt,
      createdAt: s.createdAt,
    };
  }));

  return {
    id: sheet.id,
    candidateId: sheet.candidateId,
    candidateName: candidate?.fullName ?? "",
    branchId: sheet.branchId,
    branchName: branch?.name ?? "",
    positionId: sheet.positionId,
    positionName: position?.name ?? "",
    isDoctor: sheet.isDoctor,
    status: sheet.status,
    steps: enrichedSteps,
    completedAt: sheet.completedAt ?? null,
    createdAt: sheet.createdAt,
  };
}

routingSheetsRouter.get("/routing-sheets", requireAuth, async (req, res): Promise<void> => {
  const { branchId, positionId, status } = req.query as Record<string, string | undefined>;
  const conditions: SQL[] = [];
  if (branchId) conditions.push(eq(routingSheetsTable.branchId, Number(branchId)));
  if (positionId) conditions.push(eq(routingSheetsTable.positionId, Number(positionId)));
  if (status) conditions.push(eq(routingSheetsTable.status, status as any));
  const sheets = await db.select().from(routingSheetsTable).where(conditions.length ? and(...conditions) : undefined);
  const result = await Promise.all(sheets.map(enrichSheet));
  res.json(result);
});

routingSheetsRouter.get("/routing-sheets/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [sheet] = await db.select().from(routingSheetsTable).where(eq(routingSheetsTable.id, id));
  if (!sheet) { res.status(404).json({ error: "Not found" }); return; }
  res.json(await enrichSheet(sheet));
});

routingSheetsRouter.post("/routing-sheets/:id/close", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = CloseRoutingSheetBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }
  const [sheet] = await db.select().from(routingSheetsTable).where(eq(routingSheetsTable.id, id));
  if (!sheet) { res.status(404).json({ error: "Not found" }); return; }
  const [updated] = await db.update(routingSheetsTable)
    .set({ status: "cancelled", completedAt: new Date() })
    .where(eq(routingSheetsTable.id, id))
    .returning();
  await logAudit({ actorId: req.user!.id, actorName: req.user!.fullName, action: "close_sheet", objectType: "routing_sheet", objectId: id });
  res.json(await enrichSheet(updated));
});
