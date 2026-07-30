import { Router } from "express";
import { db, candidatesTable, routingSheetsTable, branchesTable, positionsTable, routingStepsTable, usersTable } from "@workspace/db";
import { eq, ilike, and, SQL } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { CreateCandidateBody, UpdateCandidateBody } from "@workspace/api-zod";
import { parseIin } from "../lib/iin";

export const candidatesRouter = Router();

/** Build the canonical full-name string from three parts. */
function buildFullName(lastName: string, firstName: string, middleName?: string | null): string {
  return [lastName, firstName, middleName].filter(Boolean).join(" ").trim();
}

/** Shape a candidate row for API responses. */
function serializeCandidate(c: typeof candidatesTable.$inferSelect) {
  return {
    id: c.id,
    lastName: c.lastName,
    firstName: c.firstName,
    middleName: c.middleName ?? null,
    fullName: c.fullName,
    email: c.email,
    phone: c.phone,
    iin: c.iin,
    birthDate: c.birthDate ?? null,
    gender: c.gender ?? null,
    experience: c.experience ?? null,
    education: c.education ?? null,
    certifications: c.certifications ?? null,
    offerStatus: c.offerStatus,
    createdById: c.createdById ?? null,
    createdAt: c.createdAt,
  };
}

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

  // Text search filter — matches against fullName (derived) OR email OR iin
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(c =>
      c.fullName.toLowerCase().includes(q) ||
      c.lastName.toLowerCase().includes(q) ||
      c.firstName.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.iin.includes(q)
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
    ...serializeCandidate(c),
    routingSheet: await getRoutingSheetForCandidate(c.id),
  })));

  res.json(result);
});

candidatesRouter.post("/candidates", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateCandidateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    return;
  }

  const { lastName, firstName, middleName, email, phone, iin, experience, education, certifications } = parsed.data as any;

  // Validate IIN and derive birthDate + gender
  const parsedIin = parseIin(iin);
  if (!parsedIin.valid) {
    res.status(400).json({ error: parsedIin.error ?? "Неверный ИИН" });
    return;
  }

  // Check for duplicate IIN
  const existing = await db.select({ id: candidatesTable.id }).from(candidatesTable).where(eq(candidatesTable.iin, iin));
  if (existing.length > 0) {
    res.status(409).json({ error: "Кандидат с таким ИИН уже существует" });
    return;
  }

  const [candidate] = await db.insert(candidatesTable).values({
    lastName,
    firstName,
    middleName: middleName ?? null,
    fullName: buildFullName(lastName, firstName, middleName),
    email,
    phone,
    iin,
    birthDate: parsedIin.birthDate,
    gender: parsedIin.gender,
    experience: experience ?? null,
    education: education ?? null,
    certifications: certifications ?? null,
    createdById: req.user!.id,
  }).returning();

  res.status(201).json(serializeCandidate(candidate));
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
    ...serializeCandidate(candidate),
    routingSheet,
  });
});

candidatesRouter.patch("/candidates/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = UpdateCandidateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }

  const data = parsed.data as any;
  const update: Record<string, unknown> = { ...data };

  // If any of the three name parts changed, recompute fullName
  if (data.lastName !== undefined || data.firstName !== undefined || data.middleName !== undefined) {
    // Need to fetch current row for parts we're not updating
    const [current] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, id));
    if (!current) { res.status(404).json({ error: "Not found" }); return; }
    const lastName = data.lastName ?? current.lastName;
    const firstName = data.firstName ?? current.firstName;
    const middleName = data.middleName !== undefined ? data.middleName : current.middleName;
    update.fullName = buildFullName(lastName, firstName, middleName);
  }

  // If IIN changes, re-derive birthDate + gender
  if (data.iin !== undefined) {
    const parsedIin = parseIin(data.iin);
    if (!parsedIin.valid) {
      res.status(400).json({ error: parsedIin.error ?? "Неверный ИИН" });
      return;
    }
    update.birthDate = parsedIin.birthDate;
    update.gender = parsedIin.gender;
  }

  const [candidate] = await db.update(candidatesTable).set(update).where(eq(candidatesTable.id, id)).returning();
  if (!candidate) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeCandidate(candidate));
});
