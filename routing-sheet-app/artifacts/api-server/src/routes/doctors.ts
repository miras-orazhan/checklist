/**
 * Doctor registry — list of all candidates whose routing sheet has
 * is_doctor=true. Used by marketing (and other roles) to view and update
 * doctor information, including uploading/replacing the doctor's photo.
 *
 * Endpoints:
 *   GET  /api/doctors                — list all doctors
 *   GET  /api/doctors/:id            — get one doctor's full details
 *   PUT  /api/doctors/:id/photo      — upload/replace the doctor's photo
 *   PUT  /api/doctors/:id            — update editable fields (photo URL,
 *                                       education, experience, certifications,
 *                                       specialty, about, procedures, etc.)
 *
 * Access:
 *   - admin, hr, recruiter — full access (read + edit all fields)
 *   - chief_physician — can edit doctor profile fields (specialty, about, etc.)
 *   - account_manager — can edit photo + site-publication-related fields
 *   - marketing — can edit photo only (their main responsibility)
 *
 * Each role sees the doctor's data; only the relevant fields are editable
 * per the role matrix above. The frontend hides/disables the rest.
 */

import { Router, type Request, type Response } from "express";
import {
  db,
  candidatesTable,
  routingSheetsTable,
  routingStepsTable,
  branchesTable,
  positionsTable,
  doctorProfilesTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logAudit } from "../lib/audit";
import { savePhoto } from "../lib/photoStorage";

export const doctorsRouter: Router = Router();

const ALLOWED_ROLES = [
  "admin", "hr", "recruiter", "chief_physician", "account_manager", "marketing",
];

interface DoctorRow {
  id: number;                  // routing sheet ID
  candidateId: number;
  routingSheetStatus: string;  // in_progress | completed | cancelled
  // Candidate fields (entered by recruiter)
  lastName: string;
  firstName: string;
  middleName: string | null;
  fullName: string;
  email: string;
  phone: string;
  iin: string;
  birthDate: string | null;
  gender: string | null;
  education: string | null;
  experience: string | null;
  certifications: string | null;
  // Routing sheet context
  branchId: number;
  branchName: string;
  positionId: number;
  positionName: string;
  // Photo — prefer doctor_profiles.photo_url, fall back to marketing step photo
  photoUrl: string | null;
  marketingPhotoUrl: string | null;
  // Doctor profile fields (filled by chief physician)
  doctorProfileId: number | null;
  yearsExperience: number | null;
  specialty: string | null;
  ageRestrictions: string | null;
  siteDiscounts: string | null;
  about: string | null;
  procedures: string[] | null;
  createdAt: string;
}

async function buildDoctorRow(
  sheet: typeof routingSheetsTable.$inferSelect,
): Promise<DoctorRow | null> {
  const [candidate] = await db.select().from(candidatesTable)
    .where(eq(candidatesTable.id, sheet.candidateId));
  if (!candidate) return null;

  const [branch] = await db.select().from(branchesTable)
    .where(eq(branchesTable.id, sheet.branchId));
  const [position] = await db.select().from(positionsTable)
    .where(eq(positionsTable.id, sheet.positionId));

  // Doctor profile (filled by chief physician) — may not exist yet
  const [profile] = await db.select().from(doctorProfilesTable)
    .where(eq(doctorProfilesTable.routingSheetId, sheet.id));

  // Marketing photo (uploaded on the marketing_photo step)
  const [marketingStep] = await db.select().from(routingStepsTable)
    .where(and(
      eq(routingStepsTable.routingSheetId, sheet.id),
      eq(routingStepsTable.stepType, "marketing_photo"),
    ));
  const marketingPhotoUrl = marketingStep?.photoUrl ?? null;

  return {
    id: sheet.id,
    candidateId: candidate.id,
    routingSheetStatus: sheet.status,
    lastName: candidate.lastName,
    firstName: candidate.firstName,
    middleName: candidate.middleName ?? null,
    fullName: candidate.fullName,
    email: candidate.email,
    phone: candidate.phone,
    iin: candidate.iin,
    birthDate: candidate.birthDate ?? null,
    gender: candidate.gender ?? null,
    education: candidate.education ?? null,
    experience: candidate.experience ?? null,
    certifications: candidate.certifications ?? null,
    branchId: sheet.branchId,
    branchName: branch?.name ?? "",
    positionId: sheet.positionId,
    positionName: position?.name ?? "",
    photoUrl: profile?.photoUrl ?? marketingPhotoUrl,
    marketingPhotoUrl,
    doctorProfileId: profile?.id ?? null,
    yearsExperience: profile?.experience ?? null,
    specialty: profile?.specialty ?? null,
    ageRestrictions: profile?.ageRestrictions ?? null,
    siteDiscounts: profile?.siteDiscounts ?? null,
    about: profile?.about ?? null,
    procedures: (profile?.procedures as string[] | null) ?? null,
    createdAt: sheet.createdAt.toISOString(),
  };
}

// GET /doctors — list all doctors (candidates with is_doctor=true on their
// routing sheet). Sorted: in_progress first, then completed, then by recency.
doctorsRouter.get("/doctors", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  if (!ALLOWED_ROLES.includes(user.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Find all routing sheets where is_doctor=true
  const sheets = await db.select().from(routingSheetsTable)
    .where(eq(routingSheetsTable.isDoctor, true));

  const rows: DoctorRow[] = [];
  for (const sheet of sheets) {
    const row = await buildDoctorRow(sheet);
    if (row) rows.push(row);
  }

  // Sort: in_progress first, then completed, then by createdAt desc
  rows.sort((a, b) => {
    const order = { in_progress: 0, completed: 1, cancelled: 2 };
    const aOrder = order[a.routingSheetStatus as keyof typeof order] ?? 3;
    const bOrder = order[b.routingSheetStatus as keyof typeof order] ?? 3;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return b.createdAt.localeCompare(a.createdAt);
  });

  res.json(rows);
});

// GET /doctors/:id — single doctor's full details (id = routing sheet ID)
doctorsRouter.get("/doctors/:id", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  if (!ALLOWED_ROLES.includes(user.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const sheetId = Number(req.params.id);
  const [sheet] = await db.select().from(routingSheetsTable)
    .where(eq(routingSheetsTable.id, sheetId));
  if (!sheet || !sheet.isDoctor) {
    res.status(404).json({ error: "Doctor not found" });
    return;
  }

  const row = await buildDoctorRow(sheet);
  if (!row) {
    res.status(404).json({ error: "Candidate data not found" });
    return;
  }
  res.json(row);
});

// PUT /doctors/:id/photo — upload/replace the doctor's photo.
// Accepts the raw image bytes as the request body (Content-Type: image/jpeg).
// Stores the file via savePhoto() and updates BOTH:
//   - doctor_profiles.photo_url (if profile exists) — primary
//   - routing_steps.photo_url on the marketing_photo step — so marketing's
//     step is also updated when they replace the photo here
//
// Access: marketing, account_manager, admin, chief_physician
doctorsRouter.put("/doctors/:id/photo", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = req.user!;
  const photoRoles = ["admin", "marketing", "account_manager", "chief_physician"];
  if (!photoRoles.includes(user.role)) {
    res.status(403).json({ error: "Forbidden — only marketing/account_manager/admin/chief_physician can change photo" });
    return;
  }

  const sheetId = Number(req.params.id);
  const [sheet] = await db.select().from(routingSheetsTable)
    .where(eq(routingSheetsTable.id, sheetId));
  if (!sheet || !sheet.isDoctor) {
    res.status(404).json({ error: "Doctor not found" });
    return;
  }

  const contentType = (req.headers["content-type"] ?? "").toLowerCase();
  const EXT_BY_MIME: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
  };
  const ext = EXT_BY_MIME[contentType];
  if (!ext) {
    res.status(400).json({
      error: `Unsupported content type: ${contentType}. Use image/jpeg, image/png, image/webp, or image/gif.`,
    });
    return;
  }

  // Collect the raw body
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  const MAX = 10 * 1024 * 1024;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > MAX) {
      res.status(413).json({ error: "File too large (max 10 MB)" });
      return;
    }
    chunks.push(Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks);
  if (buffer.length === 0) {
    res.status(400).json({ error: "Empty body — no file received" });
    return;
  }

  // Save the file
  const photoUrl = await savePhoto(buffer, ext);

  // Update doctor_profiles.photo_url (upsert — create profile if missing)
  const [existing] = await db.select().from(doctorProfilesTable)
    .where(eq(doctorProfilesTable.routingSheetId, sheetId));
  if (existing) {
    await db.update(doctorProfilesTable)
      .set({ photoUrl, updatedBy: user.fullName })
      .where(eq(doctorProfilesTable.id, existing.id));
  } else {
    await db.insert(doctorProfilesTable).values({
      routingSheetId: sheetId,
      photoUrl,
      createdById: user.id,
    });
  }

  // Also update the marketing_photo step's photo_url so marketing's step
  // shows the new photo too
  const [marketingStep] = await db.select().from(routingStepsTable)
    .where(and(
      eq(routingStepsTable.routingSheetId, sheetId),
      eq(routingStepsTable.stepType, "marketing_photo"),
    ));
  if (marketingStep) {
    await db.update(routingStepsTable)
      .set({ photoUrl })
      .where(eq(routingStepsTable.id, marketingStep.id));
  }

  await logAudit({
    actorId: user.id,
    actorName: user.fullName,
    action: "update_doctor_photo",
    objectType: "doctor_profile",
    objectId: existing?.id ?? sheetId,
    details: `Photo updated for routing sheet ${sheetId}`,
  });

  res.json({ url: photoUrl });
});

// PUT /doctors/:id — update editable fields on the doctor profile.
// Body can contain any subset of:
//   { specialty, about, procedures, ageRestrictions, siteDiscounts, experience }
//
// Access:
//   - admin, chief_physician — can edit all profile fields
//   - account_manager — can edit specialty, about, procedures (publication-related)
//   - marketing — can edit nothing here (photo only, via /photo endpoint)
//   - hr, recruiter — read-only (use admin or chief_physician account)
doctorsRouter.put("/doctors/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = req.user!;
  const sheetId = Number(req.params.id);

  const [sheet] = await db.select().from(routingSheetsTable)
    .where(eq(routingSheetsTable.id, sheetId));
  if (!sheet || !sheet.isDoctor) {
    res.status(404).json({ error: "Doctor not found" });
    return;
  }

  // Role-based field access
  const isAdmin = user.role === "admin";
  const isChief = user.role === "chief_physician";
  const isAccountManager = user.role === "account_manager";

  if (!isAdmin && !isChief && !isAccountManager) {
    res.status(403).json({ error: "Forbidden — only admin/chief_physician/account_manager can edit doctor profile" });
    return;
  }

  const { specialty, about, procedures, ageRestrictions, siteDiscounts, experience } = req.body;

  // Build the update payload based on role
  const update: Record<string, unknown> = { updatedBy: user.fullName };
  if (isAdmin || isChief) {
    if (specialty !== undefined) update.specialty = specialty;
    if (about !== undefined) update.about = about;
    if (procedures !== undefined) update.procedures = procedures;
    if (ageRestrictions !== undefined) update.ageRestrictions = ageRestrictions;
    if (siteDiscounts !== undefined) update.siteDiscounts = siteDiscounts;
    if (experience !== undefined) update.experience = experience;
  } else if (isAccountManager) {
    // Account manager can edit publication-related fields only
    if (specialty !== undefined) update.specialty = specialty;
    if (about !== undefined) update.about = about;
    if (procedures !== undefined) update.procedures = procedures;
    if (siteDiscounts !== undefined) update.siteDiscounts = siteDiscounts;
  }

  if (Object.keys(update).length <= 1) {
    res.status(400).json({ error: "No editable fields provided" });
    return;
  }

  const [existing] = await db.select().from(doctorProfilesTable)
    .where(eq(doctorProfilesTable.routingSheetId, sheetId));
  let profile;
  if (existing) {
    [profile] = await db.update(doctorProfilesTable)
      .set(update)
      .where(eq(doctorProfilesTable.id, existing.id))
      .returning();
  } else {
    // Create profile with the provided fields + chief_physician as creator
    [profile] = await db.insert(doctorProfilesTable).values({
      routingSheetId: sheetId,
      createdById: user.id,
      ...update,
    } as any).returning();
  }

  await logAudit({
    actorId: user.id,
    actorName: user.fullName,
    action: "update_doctor_profile",
    objectType: "doctor_profile",
    objectId: profile.id,
    details: `Updated fields: ${Object.keys(update).filter(k => k !== "updatedBy").join(", ")}`,
  });

  res.json({
    id: profile.id,
    routingSheetId: profile.routingSheetId,
    experience: profile.experience ?? null,
    specialty: profile.specialty ?? null,
    ageRestrictions: profile.ageRestrictions ?? null,
    siteDiscounts: profile.siteDiscounts ?? null,
    about: profile.about ?? null,
    procedures: (profile.procedures as string[] | null) ?? null,
    photoUrl: profile.photoUrl ?? null,
  });
});

export default doctorsRouter;
