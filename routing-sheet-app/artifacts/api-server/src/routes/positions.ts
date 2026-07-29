import { Router } from "express";
import { db, positionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { CreatePositionBody, UpdatePositionBody } from "@workspace/api-zod";

export const positionsRouter = Router();

positionsRouter.get("/positions", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(positionsTable);
  res.json(rows);
});

positionsRouter.post("/positions", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreatePositionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }
  const [pos] = await db.insert(positionsTable).values(parsed.data).returning();
  res.status(201).json(pos);
});

positionsRouter.patch("/positions/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = UpdatePositionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }
  const [pos] = await db.update(positionsTable).set(parsed.data).where(eq(positionsTable.id, id)).returning();
  if (!pos) { res.status(404).json({ error: "Not found" }); return; }
  res.json(pos);
});

positionsRouter.delete("/positions/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  await db.delete(positionsTable).where(eq(positionsTable.id, id));
  res.status(204).send();
});
