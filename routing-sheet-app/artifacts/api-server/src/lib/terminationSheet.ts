import { db, terminationStepsTable, terminationSheetsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { TerminationStepType } from "@workspace/db";

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

// Step labels for display
export const TERMINATION_STEP_LABELS: Record<TerminationStepType, string> = {
  chief_physician_off: "Согласование главного врача",
  it_revocation: "Отзыв IT-доступов",
  marketing_off: "Маркетинговое оформление",
  accounting_off: "Финансовый расчёт",
  security_off: "Проверка безопасности",
  hr_exit_interview: "Интервью HR-адаптации",
  hr_close: "Закрытие HR-специалистом",
  medical_equipment_off: "Медтехника и оборудование",
  account_manager_delete_profile: "Удаление профиля с сайтов",
};

// Role assigned to each step type
export const TERMINATION_STEP_ROLES: Record<TerminationStepType, string> = {
  chief_physician_off: "chief_physician",
  it_revocation: "it",
  marketing_off: "marketing",
  accounting_off: "accounting",
  security_off: "security",
  hr_exit_interview: "hr_adaptation",
  hr_close: "hr",
  medical_equipment_off: "medical_engineer",
  account_manager_delete_profile: "account_manager",
};

// Base steps for all employees
const BASE_STEPS: TerminationStepType[] = [
  "chief_physician_off",
  "it_revocation",
  "marketing_off",
  "accounting_off",
  "security_off",
  "hr_exit_interview",
  "hr_close",
  "medical_equipment_off",
];

// Doctor-only step (blocking)
const DOCTOR_STEPS: TerminationStepType[] = [
  "account_manager_delete_profile",
];

export async function createTerminationSteps(
  terminationSheetId: number,
  isDoctor: boolean,
  client: DbOrTx = db,
): Promise<void> {
  const steps = BASE_STEPS.map((stepType) => ({
    terminationSheetId,
    stepType,
    assignedRole: TERMINATION_STEP_ROLES[stepType],
    isBlocking: true as boolean,
  }));

  if (isDoctor) {
    DOCTOR_STEPS.forEach((stepType) => {
      steps.push({
        terminationSheetId,
        stepType,
        assignedRole: TERMINATION_STEP_ROLES[stepType],
        isBlocking: true as boolean, // doctor profile deletion is blocking
      });
    });
  }

  await client.insert(terminationStepsTable).values(steps);
}

export async function checkAndCloseTerminationSheet(terminationSheetId: number): Promise<void> {
  // Only auto-close if the sheet is currently in_progress (guard against invalid transitions)
  const [sheet] = await db.select().from(terminationSheetsTable)
    .where(eq(terminationSheetsTable.id, terminationSheetId));
  if (!sheet || sheet.status !== "in_progress") return;

  const steps = await db.select().from(terminationStepsTable)
    .where(eq(terminationStepsTable.terminationSheetId, terminationSheetId));

  const blockingSteps = steps.filter((s) => s.isBlocking);
  const allApproved = blockingSteps.every(
    (s) => s.status === "approved" || s.status === "skipped"
  );

  if (allApproved) {
    await db.update(terminationSheetsTable)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(terminationSheetsTable.id, terminationSheetId));
  }
}
