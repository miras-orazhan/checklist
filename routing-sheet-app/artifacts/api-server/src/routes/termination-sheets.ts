import { Router } from "express";
import crypto from "crypto";
import { db, terminationSheetsTable, terminationStepsTable, branchesTable, positionsTable } from "@workspace/db";
import { eq, and, SQL } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { createTerminationSteps } from "../lib/terminationSheet";
import { logAudit } from "../lib/audit";
import { notifyTerminationCreated } from "../lib/notifications";
import { createAccountRevocationTask } from "../services/bitrix24";

export const terminationSheetsRouter = Router();

async function enrichSheet(sheet: typeof terminationSheetsTable.$inferSelect) {
  const [branch] = await db.select().from(branchesTable).where(eq(branchesTable.id, sheet.branchId));
  const [position] = await db.select().from(positionsTable).where(eq(positionsTable.id, sheet.positionId));
  const steps = await db.select().from(terminationStepsTable)
    .where(eq(terminationStepsTable.terminationSheetId, sheet.id));
  return {
    id: sheet.id,
    employeeFullName: sheet.employeeFullName,
    branchId: sheet.branchId,
    branchName: branch?.name ?? "",
    positionId: sheet.positionId,
    positionName: position?.name ?? "",
    isDoctor: sheet.isDoctor,
    email: sheet.email ?? null,
    iin: sheet.iin ?? null,
    terminationDate: sheet.terminationDate,
    initiatorId: sheet.initiatorId,
    initiatorName: sheet.initiatorName,
    status: sheet.status,
    statusToken: sheet.statusToken,
    rejectedById: sheet.rejectedById ?? null,
    rejectedByName: sheet.rejectedByName ?? null,
    rejectedAt: sheet.rejectedAt ?? null,
    rejectionReason: sheet.rejectionReason ?? null,
    stoppedAt: sheet.stoppedAt ?? null,
    completedAt: sheet.completedAt ?? null,
    steps: steps.map(s => ({
      id: s.id,
      terminationSheetId: s.terminationSheetId,
      stepType: s.stepType,
      assignedRole: s.assignedRole,
      status: s.status,
      isBlocking: s.isBlocking,
      comment: s.comment ?? null,
      exitInterviewNotes: s.exitInterviewNotes ?? null,
      completedById: s.completedById ?? null,
      completedByName: s.completedByName ?? null,
      completedAt: s.completedAt ?? null,
      updatedAt: s.updatedAt,
      createdAt: s.createdAt,
    })),
    createdAt: sheet.createdAt,
  };
}

// Roles allowed to manage/view all termination sheets
const MANAGEMENT_ROLES = ["admin", "hr", "recruiter"];
// Roles that participate as approvers in offboarding
const OFFBOARDING_ROLES = [
  "admin", "hr", "recruiter", "chief_physician", "it", "marketing",
  "accounting", "security", "hr_adaptation", "medical_engineer", "account_manager",
];

// GET /termination-sheets
terminationSheetsRouter.get("/termination-sheets", requireAuth, async (req, res): Promise<void> => {
  const { status, branchId } = req.query as Record<string, string | undefined>;
  const user = req.user!;

  // Only offboarding roles may list sheets
  if (!OFFBOARDING_ROLES.includes(user.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const conditions: SQL[] = [];
  if (status) conditions.push(eq(terminationSheetsTable.status, status as any));
  if (branchId) conditions.push(eq(terminationSheetsTable.branchId, Number(branchId)));

  const sheets = await db.select().from(terminationSheetsTable)
    .where(conditions.length ? and(...conditions) : undefined);

  // Non-management roles only see sheets where they have an assigned step
  let visibleSheets = sheets;
  if (!MANAGEMENT_ROLES.includes(user.role)) {
    const steps = await db.select().from(terminationStepsTable)
      .where(eq(terminationStepsTable.assignedRole, user.role));
    const assignedSheetIds = new Set(steps.map(s => s.terminationSheetId));
    visibleSheets = sheets.filter(s => assignedSheetIds.has(s.id));
  }

  const isPrivileged = MANAGEMENT_ROLES.includes(user.role);

  // Return summary (no steps for list)
  const result = await Promise.all(visibleSheets.map(async (s) => {
    const [branch] = await db.select().from(branchesTable).where(eq(branchesTable.id, s.branchId));
    const [position] = await db.select().from(positionsTable).where(eq(positionsTable.id, s.positionId));
    return {
      id: s.id,
      employeeFullName: s.employeeFullName,
      branchId: s.branchId,
      branchName: branch?.name ?? "",
      positionId: s.positionId,
      positionName: position?.name ?? "",
      isDoctor: s.isDoctor,
      email: s.email ?? null,
      iin: s.iin ?? null,
      terminationDate: s.terminationDate,
      initiatorId: s.initiatorId,
      initiatorName: s.initiatorName,
      status: s.status,
      // statusToken only for management roles — it grants public page access
      statusToken: isPrivileged ? s.statusToken : null,
      rejectedAt: s.rejectedAt ?? null,
      rejectionReason: s.rejectionReason ?? null,
      completedAt: s.completedAt ?? null,
      createdAt: s.createdAt,
    };
  }));
  res.json(result);
});

// POST /termination-sheets — HR creates a termination sheet
terminationSheetsRouter.post("/termination-sheets", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  if (!["admin", "hr", "recruiter"].includes(user.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const { employeeFullName, branchId, positionId, terminationDate, email, iin } = req.body;
  if (!employeeFullName || !branchId || !positionId || !terminationDate) {
    res.status(400).json({ error: "Missing required fields" }); return;
  }

  const [position] = await db.select().from(positionsTable).where(eq(positionsTable.id, Number(positionId)));
  if (!position) { res.status(404).json({ error: "Position not found" }); return; }

  const statusToken = crypto.randomUUID();

  const result = await db.transaction(async (tx) => {
    const [sheet] = await tx.insert(terminationSheetsTable).values({
      employeeFullName: String(employeeFullName),
      branchId: Number(branchId),
      positionId: Number(positionId),
      isDoctor: position.isDoctor,
      email: email ? String(email) : null,
      iin: iin ? String(iin) : null,
      terminationDate: new Date(terminationDate),
      initiatorId: user.id,
      initiatorName: user.fullName,
      status: "in_progress",
      statusToken,
    }).returning();

    await createTerminationSteps(sheet.id, position.isDoctor, tx);
    await logAudit({ actorId: user.id, actorName: user.fullName, action: "create_termination_sheet", objectType: "termination_sheet", objectId: sheet.id }, tx);
    return sheet;
  });

  // Fire-and-forget: notify all step assignees + create Bitrix24 revocation task
  (async () => {
    const steps = await db.select().from(terminationStepsTable)
      .where(eq(terminationStepsTable.terminationSheetId, result.id));
    notifyTerminationCreated({
      terminationSheetId: result.id,
      employeeName: result.employeeFullName,
      steps: steps.map(s => ({ stepType: s.stepType, assignedRole: s.assignedRole, id: s.id })),
    });
    const [branch] = await db.select().from(branchesTable).where(eq(branchesTable.id, result.branchId));
    const [position] = await db.select().from(positionsTable).where(eq(positionsTable.id, result.positionId));
    createAccountRevocationTask({
      employeeName: result.employeeFullName,
      email: "N/A",
      position: position?.name ?? "",
      branch: branch?.name ?? "",
      terminationSheetId: result.id,
      terminationDate: result.terminationDate,
    });
  })().catch(() => {});

  res.status(201).json(await enrichSheet(result));
});

// GET /termination-sheets/:id
terminationSheetsRouter.get("/termination-sheets/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const user = req.user!;

  if (!OFFBOARDING_ROLES.includes(user.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const [sheet] = await db.select().from(terminationSheetsTable).where(eq(terminationSheetsTable.id, id));
  if (!sheet) { res.status(404).json({ error: "Not found" }); return; }

  // Non-management roles can only view sheets they have an assigned step on
  if (!MANAGEMENT_ROLES.includes(user.role)) {
    const steps = await db.select().from(terminationStepsTable)
      .where(and(
        eq(terminationStepsTable.terminationSheetId, id),
        eq(terminationStepsTable.assignedRole, user.role)
      ));
    if (!steps.length) {
      res.status(403).json({ error: "Not authorized to view this termination sheet" }); return;
    }
  }

  const detail = await enrichSheet(sheet);
  // Strip statusToken for non-management roles
  if (!MANAGEMENT_ROLES.includes(user.role)) {
    (detail as any).statusToken = null;
  }
  res.json(detail);
});

// POST /termination-sheets/:id/close — HR closes a completed sheet
terminationSheetsRouter.post("/termination-sheets/:id/close", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const user = req.user!;
  if (!["admin", "hr"].includes(user.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const [sheet] = await db.select().from(terminationSheetsTable).where(eq(terminationSheetsTable.id, id));
  if (!sheet) { res.status(404).json({ error: "Not found" }); return; }
  if (sheet.status !== "in_progress") {
    res.status(409).json({ error: `Cannot close a sheet that is '${sheet.status}'` }); return;
  }

  // Verify all blocking steps are approved or skipped
  const steps = await db.select().from(terminationStepsTable)
    .where(eq(terminationStepsTable.terminationSheetId, id));
  const blockingPending = steps.filter(
    (s) => s.isBlocking && s.status !== "approved" && s.status !== "skipped"
  );
  if (blockingPending.length > 0) {
    res.status(409).json({ error: `Cannot close: ${blockingPending.length} blocking step(s) are not yet approved` }); return;
  }

  const [updated] = await db.update(terminationSheetsTable)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(terminationSheetsTable.id, id))
    .returning();

  await logAudit({ actorId: user.id, actorName: user.fullName, action: "close_termination_sheet", objectType: "termination_sheet", objectId: id });
  res.json(await enrichSheet(updated));
});

// POST /termination-sheets/:id/restore — Admin restores a stopped/rejected sheet (1-hour window)
terminationSheetsRouter.post("/termination-sheets/:id/restore", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const user = req.user!;
  if (user.role !== "admin") {
    res.status(403).json({ error: "Only admin can restore a stopped termination sheet" }); return;
  }

  const [sheet] = await db.select().from(terminationSheetsTable).where(eq(terminationSheetsTable.id, id));
  if (!sheet) { res.status(404).json({ error: "Not found" }); return; }
  if (!["stopped", "rejected"].includes(sheet.status)) {
    res.status(400).json({ error: "Sheet is not stopped or rejected" }); return;
  }

  // 1-hour restore window from when it was stopped/rejected
  const stoppedTime = sheet.stoppedAt ?? sheet.rejectedAt ?? sheet.createdAt;
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  if (stoppedTime < oneHourAgo) {
    res.status(403).json({ error: "Restore window expired (1 hour has passed since rejection)" }); return;
  }

  // Restore: reset the rejected step back to pending
  await db.update(terminationStepsTable)
    .set({ status: "pending", completedById: null, completedByName: null, completedAt: null, comment: null })
    .where(and(
      eq(terminationStepsTable.terminationSheetId, id),
      eq(terminationStepsTable.status, "rejected")
    ));

  const [updated] = await db.update(terminationSheetsTable)
    .set({ status: "in_progress", stoppedAt: null, rejectedAt: null, rejectionReason: null, rejectedById: null, rejectedByName: null })
    .where(eq(terminationSheetsTable.id, id))
    .returning();

  await logAudit({ actorId: user.id, actorName: user.fullName, action: "restore_termination_sheet", objectType: "termination_sheet", objectId: id });
  res.json(await enrichSheet(updated));
});
