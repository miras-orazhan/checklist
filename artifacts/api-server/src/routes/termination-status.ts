import { Router } from "express";
import { db, terminationSheetsTable, terminationStepsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { TERMINATION_STEP_LABELS } from "../lib/terminationSheet";
import { loadTerminationStepMeta, TERMINATION_PUBLIC_STEP_ORDER } from "../lib/terminationStepMeta";

export const terminationStatusRouter = Router();

// GET /termination-status/:token — public tokenized status page
terminationStatusRouter.get("/termination-status/:token", async (req, res): Promise<void> => {
  const { token } = req.params;
  const [sheet] = await db.select().from(terminationSheetsTable)
    .where(eq(terminationSheetsTable.statusToken, token));

  if (!sheet) { res.status(404).json({ error: "Not found" }); return; }

  const steps = await db.select().from(terminationStepsTable)
    .where(eq(terminationStepsTable.terminationSheetId, sheet.id));

  // Load merged step metadata (defaults + admin overrides from step_meta table)
  const metaMap = await loadTerminationStepMeta();

  // Build a map stepType → step (DB row) for ordering lookup
  const byType = new Map(steps.map(s => [s.stepType, s]));

  // Output steps in the canonical public order — only step types that actually
  // exist on this sheet (e.g. account_manager_delete_profile only for doctors).
  const publicSteps = TERMINATION_PUBLIC_STEP_ORDER
    .filter(stepType => byType.has(stepType))
    .map(stepType => {
      const s = byType.get(stepType)!;
      const meta = metaMap[stepType];
      return {
        stepType,
        label: meta?.label ?? TERMINATION_STEP_LABELS[stepType] ?? stepType,
        cabinet: meta?.cabinet ?? "",
        instructions: meta?.instructions ?? "",
        status: s.status,
      };
    });

  res.json({
    employeeFullName: sheet.employeeFullName,
    status: sheet.status,
    steps: publicSteps,
  });
});
