/**
 * Seed script — run once to populate dev data.
 * Usage: pnpm --filter @workspace/api-server tsx src/seed.ts
 */
import bcrypt from "bcryptjs";
import crypto from "crypto";
import {
  db,
  usersTable,
  branchesTable,
  positionsTable,
  candidatesTable,
  offersTable,
  routingSheetsTable,
} from "@workspace/db";
import { createRoutingSteps } from "./lib/routingSheet";

async function seed() {
  console.log("Seeding database…");

  // Branches — skip if already exist
  const existingBranches = await db.select().from(branchesTable);
  let branch1 = existingBranches.find(b => b.name === "Филиал Центр");
  let branch2 = existingBranches.find(b => b.name === "Филиал Север");
  if (!branch1 || !branch2) {
    const inserted = await db
      .insert(branchesTable)
      .values([{ name: "Филиал Центр" }, { name: "Филиал Север" }])
      .onConflictDoNothing()
      .returning();
    branch1 = branch1 ?? inserted.find(b => b.name === "Филиал Центр")!;
    branch2 = branch2 ?? inserted.find(b => b.name === "Филиал Север")!;
  }

  // Positions — skip if already exist
  const existingPositions = await db.select().from(positionsTable);
  let posNurse  = existingPositions.find(p => p.name === "Медсестра / Медбрат");
  let posDoctor = existingPositions.find(p => p.name === "Врач-терапевт");
  let posAdmin  = existingPositions.find(p => p.name === "Администратор");
  if (!posNurse || !posDoctor || !posAdmin) {
    const inserted = await db
      .insert(positionsTable)
      .values([
        { name: "Медсестра / Медбрат", isDoctor: false },
        { name: "Врач-терапевт", isDoctor: true },
        { name: "Администратор", isDoctor: false },
      ])
      .onConflictDoNothing()
      .returning();
    posNurse  = posNurse  ?? inserted.find(p => p.name === "Медсестра / Медбрат")!;
    posDoctor = posDoctor ?? inserted.find(p => p.name === "Врач-терапевт")!;
    posAdmin  = posAdmin  ?? inserted.find(p => p.name === "Администратор")!;
  }

  // Users — upsert, skip on email conflict
  const hash = await bcrypt.hash("password123", 10);
  const users = await db
    .insert(usersTable)
    .values([
      { fullName: "Алексей Иванов",   email: "admin@demo.ru",      passwordHash: hash, role: "admin",           branchId: branch1.id },
      { fullName: "Мария Петрова",    email: "recruiter@demo.ru",   passwordHash: hash, role: "recruiter",       branchId: branch1.id },
      { fullName: "Елена Смирнова",   email: "hr@demo.ru",          passwordHash: hash, role: "hr",              branchId: branch1.id },
      { fullName: "Дмитрий Козлов",   email: "marketing@demo.ru",   passwordHash: hash, role: "marketing",       branchId: branch1.id },
      { fullName: "Анна Новикова",    email: "tb@demo.ru",          passwordHash: hash, role: "tb",              branchId: branch1.id },
      { fullName: "Сергей Морозов",   email: "it@demo.ru",          passwordHash: hash, role: "it",              branchId: branch1.id },
      { fullName: "Ольга Волкова",    email: "audit@demo.ru",       passwordHash: hash, role: "audit",           branchId: branch1.id },
      { fullName: "Виктор Соколов",   email: "chief@demo.ru",       passwordHash: hash, role: "chief_physician", branchId: branch1.id },
      { fullName: "Наталья Лебедева", email: "account@demo.ru",     passwordHash: hash, role: "account_manager", branchId: branch1.id },
      { fullName: "Павел Орлов",      email: "accounting@demo.ru",  passwordHash: hash, role: "accounting",      branchId: branch1.id },
      { fullName: "Ирина Захарова",   email: "security@demo.ru",    passwordHash: hash, role: "security",        branchId: branch1.id },
      { fullName: "Борис Кузнецов",   email: "adaptation@demo.ru",  passwordHash: hash, role: "hr_adaptation",   branchId: branch1.id },
      { fullName: "Тимур Алиев",      email: "medtech@demo.ru",     passwordHash: hash, role: "medical_engineer",branchId: branch1.id },
    ])
    .onConflictDoNothing()
    .returning();

  // If some users already existed, load them all so candidates section has valid IDs
  const allUsers = users.length === 13
    ? users
    : await db.select().from(usersTable);

  // Candidates with offers and routing sheets
  const candidates = [
    { fullName: "Татьяна Фёдорова", email: "t.fedorova@mail.ru", phone: "+7 900 111 22 33", positionId: posNurse.id, isDoctor: false },
    { fullName: "Илья Громов", email: "i.gromov@mail.ru", phone: "+7 900 222 33 44", positionId: posDoctor.id, isDoctor: true },
    { fullName: "Светлана Ким", email: "s.kim@mail.ru", phone: "+7 900 333 44 55", positionId: posAdmin.id, isDoctor: false },
  ];

  for (const c of candidates) {
    const [candidate] = await db.insert(candidatesTable).values({
      fullName: c.fullName,
      email: c.email,
      phone: c.phone,
      offerStatus: "accepted",
      createdById: allUsers.find(u => u.role === "recruiter")!.id,
    }).returning();

    const token = crypto.randomUUID();
    const statusToken = crypto.randomUUID();

    await db.insert(offersTable).values({
      candidateId: candidate.id,
      sentById: allUsers.find(u => u.role === "recruiter")!.id,
      status: "accepted",
      token,
      tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      acceptedAt: new Date(),
    });

    const [sheet] = await db.insert(routingSheetsTable).values({
      candidateId: candidate.id,
      branchId: branch1.id,
      positionId: c.positionId,
      isDoctor: c.isDoctor,
      status: "in_progress",
      statusToken,
    }).returning();

    await createRoutingSteps(sheet.id, c.isDoctor);
    console.log(`  Created candidate: ${c.fullName} → sheet #${sheet.id} (statusToken: ${statusToken})`);
  }

  console.log("\nSeed complete. Login credentials (password: password123):");
  console.log("  admin@demo.ru   — Администратор");
  console.log("  recruiter@demo.ru — Рекрутер");
  console.log("  hr@demo.ru      — HR");
  console.log("  marketing@demo.ru — Маркетинг");
  console.log("  tb@demo.ru      — ТБ");
  console.log("  it@demo.ru      — IT");
  console.log("  audit@demo.ru   — Аудит");
  console.log("  chief@demo.ru   — Главный врач");
  console.log("  account@demo.ru — Аккаунт-менеджер");
}

seed().catch((e) => { console.error(e); process.exit(1); });
