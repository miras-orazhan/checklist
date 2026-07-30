import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, signToken } from "../middlewares/auth";
import { LoginBody } from "@workspace/api-zod";

export const authRouter = Router();

authRouter.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { email, password } = parsed.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email));

  if (!user || !user.isActive) {
    res.status(401).json({ error: "Неверный email или пароль" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Неверный email или пароль" });
    return;
  }

  const token = signToken({
    id: user.id,
    email: user.email,
    role: user.role,
    fullName: user.fullName,
    branchId: user.branchId ?? null,
  });

  res.json({ token, user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, branchId: user.branchId ?? null, isActive: user.isActive, createdAt: user.createdAt } });
});

authRouter.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const [row] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ id: row.id, email: row.email, fullName: row.fullName, role: row.role, branchId: row.branchId ?? null, isActive: row.isActive, createdAt: row.createdAt });
});
