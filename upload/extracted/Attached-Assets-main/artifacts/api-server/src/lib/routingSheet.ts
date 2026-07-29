import { db, routingStepsTable, routingSheetsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { StepType } from "@workspace/db";

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

// Step ordering for sequential enforcement
// HR first, then parallel, recruiter last
export const STEP_ORDER: Record<StepType, number> = {
  hr_registration: 1,
  marketing_photo: 2,
  tb_briefing: 2,
  it_accounts: 2,
  audit_training: 2,
  doctor_profile: 3,      // background, non-blocking
  site_publication: 3,    // background, non-blocking
  final_review: 4,
};

export async function createRoutingSteps(
  routingSheetId: number,
  isDoctor: boolean,
  client: DbOrTx = db,
): Promise<void> {
  const steps: Array<{
    routingSheetId: number;
    stepType: StepType;
    assignedRole: string;
    isBackground: boolean;
  }> = [
    { routingSheetId, stepType: "hr_registration", assignedRole: "hr", isBackground: false },
    { routingSheetId, stepType: "marketing_photo", assignedRole: "marketing", isBackground: false },
    { routingSheetId, stepType: "tb_briefing", assignedRole: "tb", isBackground: false },
    { routingSheetId, stepType: "it_accounts", assignedRole: "it", isBackground: false },
    { routingSheetId, stepType: "audit_training", assignedRole: "audit", isBackground: false },
    { routingSheetId, stepType: "final_review", assignedRole: "recruiter", isBackground: false },
  ];

  if (isDoctor) {
    steps.push(
      { routingSheetId, stepType: "doctor_profile", assignedRole: "chief_physician", isBackground: true },
      { routingSheetId, stepType: "site_publication", assignedRole: "account_manager", isBackground: true }
    );
  }

  await client.insert(routingStepsTable).values(steps);
}

export async function checkAndCloseSheet(routingSheetId: number): Promise<void> {
  const steps = await db
    .select()
    .from(routingStepsTable)
    .where(eq(routingStepsTable.routingSheetId, routingSheetId));

  // Blocking steps (non-background) that must all be done
  const blockingSteps = steps.filter((s) => !s.isBackground);
  const allBlockingDone = blockingSteps.every(
    (s) => s.status === "completed" || s.status === "skipped"
  );

  if (allBlockingDone) {
    await db
      .update(routingSheetsTable)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(routingSheetsTable.id, routingSheetId));
  }
}
