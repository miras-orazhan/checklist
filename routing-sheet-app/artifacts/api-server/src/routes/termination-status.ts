import { Router } from "express";
import { db, terminationSheetsTable, terminationStepsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { TERMINATION_STEP_LABELS } from "../lib/terminationSheet";

export const terminationStatusRouter = Router();

// GET /termination-status/:token — public tokenized status page
terminationStatusRouter.get("/termination-status/:token", async (req, res): Promise<void> => {
  const { token } = req.params;
  const [sheet] = await db.select().from(terminationSheetsTable)
    .where(eq(terminationSheetsTable.statusToken, token));

  if (!sheet) { res.status(404).json({ error: "Not found" }); return; }

  const steps = await db.select().from(terminationStepsTable)
    .where(eq(terminationStepsTable.terminationSheetId, sheet.id));

  const publicSteps = steps.map(s => ({
    stepType: s.stepType,
    label: TERMINATION_STEP_LABELS[s.stepType] ?? s.stepType,
    status: s.status,
  }));

  res.json({
    employeeFullName: sheet.employeeFullName,
    status: sheet.status,
    steps: publicSteps,
  });
});
