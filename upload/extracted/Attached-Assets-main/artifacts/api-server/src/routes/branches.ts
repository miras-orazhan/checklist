import { Router } from "express";
import { db, branchesTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { CreateBranchBody, UpdateBranchBody } from "@workspace/api-zod";

export const branchesRouter = Router();

branchesRouter.get("/branches", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(branchesTable);
  res.json(rows);
});

branchesRouter.post("/branches", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreateBranchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }
  const [branch] = await db.insert(branchesTable).values(parsed.data).returning();
  res.status(201).json(branch);
});

branchesRouter.get("/branches/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [branch] = await db.select().from(branchesTable).where(eq(branchesTable.id, id));
  if (!branch) { res.status(404).json({ error: "Not found" }); return; }
  res.json(branch);
});

branchesRouter.patch("/branches/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = UpdateBranchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }
  const [branch] = await db.update(branchesTable).set(parsed.data).where(eq(branchesTable.id, id)).returning();
  if (!branch) { res.status(404).json({ error: "Not found" }); return; }
  res.json(branch);
});
