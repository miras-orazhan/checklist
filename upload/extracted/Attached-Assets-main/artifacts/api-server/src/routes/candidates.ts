import { Router } from "express";
import { db, candidatesTable, routingSheetsTable, branchesTable, positionsTable, routingStepsTable, usersTable } from "@workspace/db";
import { eq, ilike, and, SQL } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { CreateCandidateBody, UpdateCandidateBody } from "@workspace/api-zod";

export const candidatesRouter = Router();

/** Build a RoutingSheet object (no steps, matches RoutingSheet schema) */
async function getRoutingSheetForCandidate(candidateId: number) {
  const [sheet] = await db.select().from(routingSheetsTable).where(eq(routingSheetsTable.candidateId, candidateId));
  if (!sheet) return null;
  const [branch] = await db.select().from(branchesTable).where(eq(branchesTable.id, sheet.branchId));
  const [position] = await db.select().from(positionsTable).where(eq(positionsTable.id, sheet.positionId));
  return {
    id: sheet.id,
    candidateId: sheet.candidateId,
    candidateName: "",
    branchId: sheet.branchId,
    branchName: branch?.name ?? "",
    positionId: sheet.positionId,
    positionName: position?.name ?? "",
    isDoctor: sheet.isDoctor,
    status: sheet.status,
    statusToken: sheet.statusToken,
    completedAt: sheet.completedAt ?? null,
    createdAt: sheet.createdAt,
  };
}

/** Build enriched steps matching RoutingStep schema */
async function enrichSteps(sheetId: number) {
  const steps = await db.select().from(routingStepsTable).where(eq(routingStepsTable.routingSheetId, sheetId));
  return Promise.all(steps.map(async (step) => {
    let completedByName: string | null = null;
    if (step.completedById) {
      const [u] = await db.select().from(usersTable).where(eq(usersTable.id, step.completedById));
      completedByName = u?.fullName ?? null;
    }
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
      completedByName,
      isOverride: step.isOverride,
      stepData: step.stepData ?? null,
      completedAt: step.completedAt ?? null,
      updatedAt: step.updatedAt,
      createdAt: step.createdAt,
    };
  }));
}

// GET /candidates — supports branchId, positionId, status (spec), plus search/offerStatus for UI convenience
candidatesRouter.get("/candidates", requireAuth, async (req, res): Promise<void> => {
  const { branchId, positionId, status, search, offerStatus } = req.query as Record<string, string | undefined>;

  let rows = await db.select().from(candidatesTable);

  // Text search filter
  if (search) {
    rows = rows.filter(c =>
      c.fullName.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase())
    );
  }

  // offerStatus (UI convenience alias for status)
  const statusFilter = offerStatus ?? status;
  if (statusFilter) rows = rows.filter(c => c.offerStatus === statusFilter);

  // branchId / positionId — filter by routing sheet
  const needsSheetFilter = branchId || positionId;
  if (needsSheetFilter) {
    const sheetConditions: SQL[] = [];
    if (branchId) sheetConditions.push(eq(routingSheetsTable.branchId, Number(branchId)));
    if (positionId) sheetConditions.push(eq(routingSheetsTable.positionId, Number(positionId)));
    const sheets = await db.select({ candidateId: routingSheetsTable.candidateId })
      .from(routingSheetsTable)
      .where(and(...sheetConditions));
    const candidateIds = new Set(sheets.map(s => s.candidateId));
    rows = rows.filter(c => candidateIds.has(c.id));
  }

  // Enrich each candidate with their routing sheet (no steps needed for list)
  const result = await Promise.all(rows.map(async (c) => ({
    id: c.id,
    fullName: c.fullName,
    email: c.email,
    phone: c.phone,
    experience: c.experience ?? null,
    education: c.education ?? null,
    certifications: c.certifications ?? null,
    offerStatus: c.offerStatus,
    createdById: c.createdById ?? null,
    createdAt: c.createdAt,
    routingSheet: await getRoutingSheetForCandidate(c.id),
  })));

  res.json(result);
});

candidatesRouter.post("/candidates", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateCandidateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }
  const [candidate] = await db.insert(candidatesTable).values({
    ...parsed.data,
    createdById: req.user!.id,
  }).returning();
  res.status(201).json({
    id: candidate.id,
    fullName: candidate.fullName,
    email: candidate.email,
    phone: candidate.phone,
    experience: candidate.experience ?? null,
    education: candidate.education ?? null,
    certifications: candidate.certifications ?? null,
    offerStatus: candidate.offerStatus,
    createdById: candidate.createdById ?? null,
    createdAt: candidate.createdAt,
  });
});

candidatesRouter.get("/candidates/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [candidate] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, id));
  if (!candidate) { res.status(404).json({ error: "Not found" }); return; }

  const [sheet] = await db.select().from(routingSheetsTable).where(eq(routingSheetsTable.candidateId, id));
  let routingSheet = null;
  if (sheet) {
    const [branch] = await db.select().from(branchesTable).where(eq(branchesTable.id, sheet.branchId));
    const [position] = await db.select().from(positionsTable).where(eq(positionsTable.id, sheet.positionId));
    const steps = await enrichSteps(sheet.id);
    routingSheet = {
      id: sheet.id,
      candidateId: sheet.candidateId,
      candidateName: candidate.fullName,
      branchId: sheet.branchId,
      branchName: branch?.name ?? "",
      positionId: sheet.positionId,
      positionName: position?.name ?? "",
      isDoctor: sheet.isDoctor,
      status: sheet.status,
      steps,
      completedAt: sheet.completedAt ?? null,
      createdAt: sheet.createdAt,
    };
  }

  res.json({
    id: candidate.id,
    fullName: candidate.fullName,
    email: candidate.email,
    phone: candidate.phone,
    experience: candidate.experience ?? null,
    education: candidate.education ?? null,
    certifications: candidate.certifications ?? null,
    offerStatus: candidate.offerStatus,
    createdById: candidate.createdById ?? null,
    createdAt: candidate.createdAt,
    routingSheet,
  });
});

candidatesRouter.patch("/candidates/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = UpdateCandidateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }
  const [candidate] = await db.update(candidatesTable).set(parsed.data).where(eq(candidatesTable.id, id)).returning();
  if (!candidate) { res.status(404).json({ error: "Not found" }); return; }
  res.json({
    id: candidate.id,
    fullName: candidate.fullName,
    email: candidate.email,
    phone: candidate.phone,
    experience: candidate.experience ?? null,
    education: candidate.education ?? null,
    certifications: candidate.certifications ?? null,
    offerStatus: candidate.offerStatus,
    createdById: candidate.createdById ?? null,
    createdAt: candidate.createdAt,
  });
});
