import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { CreateUserBody, UpdateUserBody } from "@workspace/api-zod";

export const usersRouter = Router();

usersRouter.get("/users", requireAuth, requireRole("admin", "recruiter", "hr"), async (req, res): Promise<void> => {
  const rows = await db.select({
    id: usersTable.id,
    fullName: usersTable.fullName,
    email: usersTable.email,
    role: usersTable.role,
    branchId: usersTable.branchId,
    isActive: usersTable.isActive,
    createdAt: usersTable.createdAt,
  }).from(usersTable);
  res.json(rows);
});

usersRouter.post("/users", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }
  const { password, ...rest } = parsed.data as any;
  const passwordHash = await bcrypt.hash(password ?? "changeme123", 10);
  const [user] = await db.insert(usersTable).values({ ...rest, passwordHash }).returning({
    id: usersTable.id, fullName: usersTable.fullName, email: usersTable.email,
    role: usersTable.role, branchId: usersTable.branchId, isActive: usersTable.isActive, createdAt: usersTable.createdAt,
  });
  res.status(201).json(user);
});

usersRouter.get("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [user] = await db.select({
    id: usersTable.id, fullName: usersTable.fullName, email: usersTable.email,
    role: usersTable.role, branchId: usersTable.branchId, isActive: usersTable.isActive, createdAt: usersTable.createdAt,
  }).from(usersTable).where(eq(usersTable.id, id));
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  res.json(user);
});

usersRouter.patch("/users/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }
  const data = parsed.data as any;
  if (data.password) { data.passwordHash = await bcrypt.hash(data.password, 10); delete data.password; }
  const [user] = await db.update(usersTable).set(data).where(eq(usersTable.id, id)).returning({
    id: usersTable.id, fullName: usersTable.fullName, email: usersTable.email,
    role: usersTable.role, branchId: usersTable.branchId, isActive: usersTable.isActive, createdAt: usersTable.createdAt,
  });
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  res.json(user);
});
