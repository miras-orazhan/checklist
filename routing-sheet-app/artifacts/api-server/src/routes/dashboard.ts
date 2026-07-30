import { Router } from "express";
import { db, candidatesTable, routingSheetsTable, routingStepsTable, branchesTable, positionsTable, auditLogTable } from "@workspace/db";
import { eq, desc, count, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { ROUTING_STEP_META } from "../lib/routingStepMeta";

export const dashboardRouter = Router();

const STEP_LABELS: Record<string, string> = {
  hr_registration: "Регистрация в кадрах",
  marketing_photo: "Маркетинговое фото",
  tb_briefing: "Инструктаж по ТБ",
  it_accounts: "Создание IT аккаунтов",
  audit_training: "Обучение аудит",
  doctor_profile: "Профиль врача",
  site_publication: "Публикация на сайте",
  final_review: "Финальная проверка",
};

dashboardRouter.get("/dashboard/summary", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;

  const [totalRow] = await db.select({ count: count() }).from(candidatesTable);
  const [inProgressRow] = await db.select({ count: count() }).from(routingSheetsTable)
    .where(eq(routingSheetsTable.status, "in_progress"));
  const [completedRow] = await db.select({ count: count() }).from(routingSheetsTable)
    .where(eq(routingSheetsTable.status, "completed"));
  const [cancelledRow] = await db.select({ count: count() }).from(routingSheetsTable)
    .where(eq(routingSheetsTable.status, "cancelled"));

  const [myPendingRow] = await db.select({ count: count() }).from(routingStepsTable)
    .where(and(eq(routingStepsTable.assignedRole, user.role), eq(routingStepsTable.status, "pending")));

  // byBranch as {label, count}[]
  const branches = await db.select().from(branchesTable);
  const byBranch = await Promise.all(branches.map(async (b) => {
    const [row] = await db.select({ count: count() }).from(routingSheetsTable)
      .where(eq(routingSheetsTable.branchId, b.id));
    return { label: b.name, count: row.count };
  }));

  const byStatus = [
    { label: "В процессе", count: inProgressRow.count },
    { label: "Завершено", count: completedRow.count },
    { label: "Отменено", count: cancelledRow.count },
  ];

  const recentSheets = await db.select().from(routingSheetsTable)
    .where(eq(routingSheetsTable.status, "completed"))
    .orderBy(desc(routingSheetsTable.completedAt))
    .limit(5);

  const recentlyCompleted = await Promise.all(recentSheets.map(async (s) => {
    const [candidate] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, s.candidateId));
    const [branch] = await db.select().from(branchesTable).where(eq(branchesTable.id, s.branchId));
    const [position] = await db.select().from(positionsTable).where(eq(positionsTable.id, s.positionId));
    return {
      id: s.id,
      candidateId: s.candidateId,
      candidateName: candidate?.fullName ?? "",
      branchId: s.branchId,
      branchName: branch?.name ?? "",
      positionId: s.positionId,
      positionName: position?.name ?? "",
      isDoctor: s.isDoctor,
      status: s.status,
      completedAt: s.completedAt ?? null,
      createdAt: s.createdAt,
    };
  }));

  res.json({
    totalCandidates: totalRow.count,
    inProgress: inProgressRow.count,
    completed: completedRow.count,
    pendingMyAction: myPendingRow.count,
    byBranch,
    byStatus,
    recentlyCompleted,
  });
});

dashboardRouter.get("/dashboard/my-tasks", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const steps = await db.select().from(routingStepsTable)
    .where(and(eq(routingStepsTable.assignedRole, user.role), eq(routingStepsTable.status, "pending")))
    .orderBy(routingStepsTable.createdAt)
    .limit(50);

  const result = await Promise.all(steps.map(async (step) => {
    const [sheet] = await db.select().from(routingSheetsTable).where(eq(routingSheetsTable.id, step.routingSheetId));
    const [candidate] = sheet ? await db.select().from(candidatesTable).where(eq(candidatesTable.id, sheet.candidateId)) : [null];
    const [branch] = sheet ? await db.select().from(branchesTable).where(eq(branchesTable.id, sheet.branchId)) : [null];
    const [position] = sheet ? await db.select().from(positionsTable).where(eq(positionsTable.id, sheet.positionId)) : [null];
    return {
      id: step.id,
      routingSheetId: step.routingSheetId,
      stepType: step.stepType,
      assignedRole: step.assignedRole,
      status: step.status,
      candidateName: candidate?.fullName ?? "",
      branchName: branch?.name ?? "",
      positionName: position?.name ?? "",
      isDoctor: sheet?.isDoctor ?? false,
      notes: step.notes ?? null,
      createdAt: step.createdAt,
    };
  }));
  res.json(result);
});

dashboardRouter.get("/dashboard/recent-activity", requireAuth, async (req, res): Promise<void> => {
  const logs = await db.select().from(auditLogTable)
    .orderBy(desc(auditLogTable.createdAt))
    .limit(20);
  res.json(logs.map((l) => ({
    id: l.id,
    actorName: l.actorName,
    action: l.action,
    objectType: l.objectType,
    objectId: l.objectId ?? null,
    details: l.details ?? null,
    createdAt: l.createdAt,
  })));
});

// Candidate status page (public) — keyed by statusToken
dashboardRouter.get("/candidate-status/:token", async (req, res): Promise<void> => {
  const { token } = req.params;
  const [sheet] = await db.select().from(routingSheetsTable).where(eq(routingSheetsTable.statusToken, token));
  if (!sheet) { res.status(404).json({ error: "Not found" }); return; }
  const steps = await db.select().from(routingStepsTable).where(eq(routingStepsTable.routingSheetId, sheet.id));
  const [candidate] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, sheet.candidateId));

  // Public steps exclude background doctor tasks (doctor_profile, site_publication)
  // — the candidate never visits these explicitly.
  const publicSteps = steps
    .filter(s => !s.isBackground)
    .map(s => {
      const meta = ROUTING_STEP_META[s.stepType];
      return {
        stepType: s.stepType,
        label: meta?.label ?? STEP_LABELS[s.stepType] ?? s.stepType,
        cabinet: meta?.cabinet ?? "",
        instructions: meta?.instructions ?? "",
        status: s.status === "completed" ? "completed" : "pending",
      };
    });

  res.json({
    candidateName: candidate?.fullName ?? "",
    overallStatus: sheet.status === "completed" ? "completed" : "in_progress",
    steps: publicSteps,
  });
});
