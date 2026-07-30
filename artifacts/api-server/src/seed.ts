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
import { generateIin } from "./lib/iin-generator";

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
  // Each gets a valid Kazakhstan IIN (passes parseIin check-digit validation)
  // so the new-candidate form accepts them.
  const candidates = [
    {
      lastName: "Фёдорова", firstName: "Татьяна", middleName: "Игоревна",
      email: "t.fedorova@mail.ru", phone: "+7 900 111 22 33",
      birthDate: new Date(Date.UTC(1990, 4, 15)), gender: "female" as const,
      positionId: posNurse.id, isDoctor: false,
      education: "Медицинский колледж, «Сестринское дело», 2011",
      experience: "8 лет в терапевтическом отделении",
      certifications: "Сертификат «Организация сестринского дела» (2020)",
      serial: 1,
    },
    {
      lastName: "Громов", firstName: "Илья", middleName: "Сергеевич",
      email: "i.gromov@mail.ru", phone: "+7 900 222 33 44",
      birthDate: new Date(Date.UTC(1982, 8, 23)), gender: "male" as const,
      positionId: posDoctor.id, isDoctor: true,
      education: "КазНМУ, «Лечебное дело», 2006; ординатура по терапии, 2008",
      experience: "15 лет врачом-терапевтом, из них 5 — заведующий отделением",
      certifications: "Высшая категория по терапии (2018); ACLS (2021)",
      serial: 2,
    },
    {
      lastName: "Ким", firstName: "Светлана", middleName: "Олеговна",
      email: "s.kim@mail.ru", phone: "+7 900 333 44 55",
      birthDate: new Date(Date.UTC(1995, 0, 7)), gender: "female" as const,
      positionId: posAdmin.id, isDoctor: false,
      education: "КазУЭФМТ, «Менеджмент в здравоохранении», 2017",
      experience: "3 года администратором медицинского центра",
      certifications: "Курс «Медицинский CRM» (2022)",
      serial: 3,
    },
  ];

  for (const c of candidates) {
    const iin = generateIin({
      birthDate: c.birthDate,
      gender: c.gender,
      serial: c.serial,
    });

    const [candidate] = await db.insert(candidatesTable).values({
      lastName: c.lastName,
      firstName: c.firstName,
      middleName: c.middleName,
      fullName: `${c.lastName} ${c.firstName} ${c.middleName}`.trim(),
      email: c.email,
      phone: c.phone,
      iin,
      birthDate: c.birthDate,
      gender: c.gender,
      education: c.education,
      experience: c.experience,
      certifications: c.certifications,
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
    console.log(`  Created candidate: ${candidate.fullName} (ИИН ${iin}) → sheet #${sheet.id} (statusToken: ${statusToken})`);
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
