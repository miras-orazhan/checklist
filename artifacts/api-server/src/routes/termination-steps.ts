import { Router } from "express";
import { db, terminationStepsTable, terminationSheetsTable, branchesTable, positionsTable } from "@workspace/db";
import { eq, and, SQL } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { checkAndCloseTerminationSheet } from "../lib/terminationSheet";
import { logAudit } from "../lib/audit";
import { notifyTerminationCompleted, notifyTerminationRejected } from "../lib/notifications";

export const terminationStepsRouter = Router();

const MANAGEMENT_ROLES = ["admin", "hr", "recruiter"];
const OFFBOARDING_ROLES = [
  "admin", "hr", "recruiter", "chief_physician", "it", "marketing",
  "accounting", "security", "hr_adaptation", "medical_engineer", "account_manager",
];

function enrichStep(step: typeof terminationStepsTable.$inferSelect) {
  return {
    id: step.id,
    terminationSheetId: step.terminationSheetId,
    stepType: step.stepType,
    assignedRole: step.assignedRole,
    status: step.status,
    isBlocking: step.isBlocking,
    comment: step.comment ?? null,
    exitInterviewNotes: step.exitInterviewNotes ?? null,
    completedById: step.completedById ?? null,
    completedByName: step.completedByName ?? null,
    completedAt: step.completedAt ?? null,
    updatedAt: step.updatedAt,
    createdAt: step.createdAt,
  };
}

// GET /termination-steps?terminationSheetId=&pending=true
terminationStepsRouter.get("/termination-steps", requireAuth, async (req, res): Promise<void> => {
  const { terminationSheetId, pending } = req.query as Record<string, string | undefined>;
  const user = req.user!;

  // Only offboarding roles may access termination steps
  if (!OFFBOARDING_ROLES.includes(user.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const conditions: SQL[] = [];

  if (terminationSheetId) {
    conditions.push(eq(terminationStepsTable.terminationSheetId, Number(terminationSheetId)));
    // Non-management roles scoped to their own role's steps within a sheet
    if (!MANAGEMENT_ROLES.includes(user.role)) {
      conditions.push(eq(terminationStepsTable.assignedRole, user.role));
    }
  } else if (pending === "true") {
    // Pending task inbox: always scoped to current user's role
    conditions.push(eq(terminationStepsTable.assignedRole, user.role));
    conditions.push(eq(terminationStepsTable.status, "pending"));
  } else if (!MANAGEMENT_ROLES.includes(user.role)) {
    // Non-management with no filter: scope to their role
    conditions.push(eq(terminationStepsTable.assignedRole, user.role));
  }

  const steps = await db.select().from(terminationStepsTable)
    .where(conditions.length ? and(...conditions) : undefined);

  // Enrich with context
  const result = await Promise.all(steps.map(async (step) => {
    const [sheet] = await db.select().from(terminationSheetsTable)
      .where(eq(terminationSheetsTable.id, step.terminationSheetId));
    const [branch] = sheet ? await db.select().from(branchesTable).where(eq(branchesTable.id, sheet.branchId)) : [null];
    const [position] = sheet ? await db.select().from(positionsTable).where(eq(positionsTable.id, sheet.positionId)) : [null];
    return {
      ...enrichStep(step),
      employeeFullName: sheet?.employeeFullName ?? "",
      branchName: branch?.name ?? "",
      positionName: position?.name ?? "",
      isDoctor: sheet?.isDoctor ?? false,
    };
  }));
  res.json(result);
});

// GET /termination-steps/:id — single step with context (authorized by role)
terminationStepsRouter.get("/termination-steps/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const user = req.user!;

  if (!OFFBOARDING_ROLES.includes(user.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const [step] = await db.select().from(terminationStepsTable).where(eq(terminationStepsTable.id, id));
  if (!step) { res.status(404).json({ error: "Not found" }); return; }

  // Non-management roles can only see steps assigned to their own role
  if (!MANAGEMENT_ROLES.includes(user.role) && step.assignedRole !== user.role) {
    res.status(403).json({ error: "Not authorized to view this step" }); return;
  }

  const [sheet] = await db.select().from(terminationSheetsTable)
    .where(eq(terminationSheetsTable.id, step.terminationSheetId));
  const [branch] = sheet ? await db.select().from(branchesTable).where(eq(branchesTable.id, sheet.branchId)) : [null];
  const [position] = sheet ? await db.select().from(positionsTable).where(eq(positionsTable.id, sheet.positionId)) : [null];

  res.json({
    ...enrichStep(step),
    employeeFullName: sheet?.employeeFullName ?? "",
    branchName: branch?.name ?? "",
    positionName: position?.name ?? "",
    isDoctor: sheet?.isDoctor ?? false,
  });
});

// POST /termination-steps/:id/approve
terminationStepsRouter.post("/termination-steps/:id/approve", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const user = req.user!;
  const { comment, exitInterviewNotes } = req.body;

  const [step] = await db.select().from(terminationStepsTable).where(eq(terminationStepsTable.id, id));
  if (!step) { res.status(404).json({ error: "Not found" }); return; }
  if (step.status !== "pending") { res.status(409).json({ error: "Step already processed" }); return; }

  // Check sheet is still active
  const [sheet] = await db.select().from(terminationSheetsTable).where(eq(terminationSheetsTable.id, step.terminationSheetId));
  if (!sheet || !["in_progress"].includes(sheet.status)) {
    res.status(409).json({ error: "Termination sheet is not active" }); return;
  }

  // Role check: assigned role, admin, or HR can approve
  if (!["admin", "hr"].includes(user.role) && user.role !== step.assignedRole) {
    res.status(403).json({ error: "Forbidden: wrong role for this step" }); return;
  }

  const [updated] = await db.update(terminationStepsTable).set({
    status: "approved",
    comment: comment ?? null,
    exitInterviewNotes: exitInterviewNotes ?? null,
    completedById: user.id,
    completedByName: user.fullName,
    completedAt: new Date(),
  }).where(eq(terminationStepsTable.id, id)).returning();

  await logAudit({ actorId: user.id, actorName: user.fullName, action: "approve_termination_step", objectType: "termination_step", objectId: id });
  await checkAndCloseTerminationSheet(step.terminationSheetId);

  // Fire-and-forget: check if sheet just closed → notify HR
  (async () => {
    const [closedSheet] = await db.select().from(terminationSheetsTable).where(eq(terminationSheetsTable.id, step.terminationSheetId));
    if (closedSheet?.status === "completed") {
      notifyTerminationCompleted({ terminationSheetId: closedSheet.id, employeeName: closedSheet.employeeFullName });
    }
  })().catch(() => {});

  res.json(enrichStep(updated));
});

// POST /termination-steps/:id/reject — stops entire process
terminationStepsRouter.post("/termination-steps/:id/reject", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const user = req.user!;
  const { reason } = req.body;

  if (!reason) { res.status(400).json({ error: "Rejection reason is required" }); return; }

  const [step] = await db.select().from(terminationStepsTable).where(eq(terminationStepsTable.id, id));
  if (!step) { res.status(404).json({ error: "Not found" }); return; }
  if (step.status !== "pending") { res.status(409).json({ error: "Step already processed" }); return; }

  const [sheet] = await db.select().from(terminationSheetsTable).where(eq(terminationSheetsTable.id, step.terminationSheetId));
  if (!sheet || sheet.status !== "in_progress") {
    res.status(409).json({ error: "Termination sheet is not active" }); return;
  }

  if (!["admin", "hr"].includes(user.role) && user.role !== step.assignedRole) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  // Reject step and stop the entire sheet
  await db.transaction(async (tx) => {
    await tx.update(terminationStepsTable).set({
      status: "rejected",
      comment: reason,
      completedById: user.id,
      completedByName: user.fullName,
      completedAt: new Date(),
    }).where(eq(terminationStepsTable.id, id));

    await tx.update(terminationSheetsTable).set({
      status: "stopped",
      stoppedAt: new Date(),
      rejectedById: user.id,
      rejectedByName: user.fullName,
      rejectedAt: new Date(),
      rejectionReason: reason,
    }).where(eq(terminationSheetsTable.id, step.terminationSheetId));

    await logAudit({ actorId: user.id, actorName: user.fullName, action: "reject_termination_step", objectType: "termination_step", objectId: id, details: reason }, tx);
  });

  // Fire-and-forget: notify HR of rejection
  notifyTerminationRejected({
    terminationSheetId: step.terminationSheetId,
    employeeName: sheet.employeeFullName,
    stepType: step.stepType,
    reason,
  });

  const [updated] = await db.select().from(terminationStepsTable).where(eq(terminationStepsTable.id, id));
  res.json(enrichStep(updated));
});

// POST /termination-steps/:id/override — admin or HR manually confirms when role is absent
terminationStepsRouter.post("/termination-steps/:id/override", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const user = req.user!;
  const { reason } = req.body;

  if (!reason) { res.status(400).json({ error: "Reason is required" }); return; }
  if (!["admin", "hr"].includes(user.role)) {
    res.status(403).json({ error: "Only admin or HR can override steps" }); return;
  }

  const [step] = await db.select().from(terminationStepsTable).where(eq(terminationStepsTable.id, id));
  if (!step) { res.status(404).json({ error: "Not found" }); return; }
  if (step.status !== "pending") { res.status(409).json({ error: "Step already processed" }); return; }

  // Reject/override not allowed unless sheet is in_progress
  const [sheet] = await db.select().from(terminationSheetsTable)
    .where(eq(terminationSheetsTable.id, step.terminationSheetId));
  if (!sheet || sheet.status !== "in_progress") {
    res.status(409).json({ error: "Termination sheet is not active — restore it before overriding steps" }); return;
  }

  const [updated] = await db.update(terminationStepsTable).set({
    status: "approved",
    comment: reason,
    completedById: user.id,
    completedByName: user.fullName,
    completedAt: new Date(),
  }).where(eq(terminationStepsTable.id, id)).returning();

  await logAudit({ actorId: user.id, actorName: user.fullName, action: "override_termination_step", objectType: "termination_step", objectId: id, details: reason });
  await checkAndCloseTerminationSheet(step.terminationSheetId);

  // Fire-and-forget: check if sheet just closed
  (async () => {
    const [closedSheet] = await db.select().from(terminationSheetsTable).where(eq(terminationSheetsTable.id, step.terminationSheetId));
    if (closedSheet?.status === "completed") {
      notifyTerminationCompleted({ terminationSheetId: closedSheet.id, employeeName: closedSheet.employeeFullName });
    }
  })().catch(() => {});

  res.json(enrichStep(updated));
});
