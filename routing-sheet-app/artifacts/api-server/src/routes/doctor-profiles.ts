import { Router } from "express";
import { db, doctorProfilesTable, routingSheetsTable, candidatesTable, positionsTable, branchesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logAudit } from "../lib/audit";

export const doctorProfilesRouter = Router();

// GET /doctor-profiles/:routingSheetId
// Returns the doctor profile AND the candidate's professional data
// (education / experience / certifications entered by recruiter) so that the
// chief physician and account manager can see them when filling out the form.
//
// If no profile row exists yet, returns 200 with `profile: null` plus the
// candidate data — the chief physician can then create the profile via PUT.
doctorProfilesRouter.get("/doctor-profiles/:routingSheetId", requireAuth, async (req, res): Promise<void> => {
  const routingSheetId = Number(req.params.routingSheetId);
  const user = req.user!;

  // Only chief_physician, account_manager, admin, recruiter, hr may read
  const allowed = ["admin", "chief_physician", "account_manager", "recruiter", "hr"];
  if (!allowed.includes(user.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Load routing sheet → candidate → position + branch
  const [sheet] = await db.select().from(routingSheetsTable)
    .where(eq(routingSheetsTable.id, routingSheetId));
  if (!sheet) {
    res.status(404).json({ error: "Routing sheet not found" });
    return;
  }

  const [candidate] = await db.select().from(candidatesTable)
    .where(eq(candidatesTable.id, sheet.candidateId));
  if (!candidate) {
    res.status(404).json({ error: "Candidate not found" });
    return;
  }

  const [position] = await db.select().from(positionsTable)
    .where(eq(positionsTable.id, sheet.positionId));
  const [branch] = await db.select().from(branchesTable)
    .where(eq(branchesTable.id, sheet.branchId));

  const [profile] = await db.select().from(doctorProfilesTable)
    .where(eq(doctorProfilesTable.routingSheetId, routingSheetId));

  res.json({
    // Doctor profile (filled by chief physician) — null when not yet created
    profile: profile
      ? {
          id: profile.id,
          routingSheetId: profile.routingSheetId,
          experience: profile.experience ?? null,
          specialty: profile.specialty ?? null,
          ageRestrictions: profile.ageRestrictions ?? null,
          siteDiscounts: profile.siteDiscounts ?? null,
          about: profile.about ?? null,
          procedures: (profile.procedures as string[] | null) ?? null,
          photoUrl: profile.photoUrl ?? null,
          createdById: profile.createdById ?? null,
          updatedAt: profile.updatedAt,
          createdAt: profile.createdAt,
        }
      : null,

    // Candidate data — entered by recruiter, visible to chief physician and
    // account manager so they have full context when filling the profile.
    candidate: {
      id: candidate.id,
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
    },

    // Routing-sheet context for the UI
    routingSheet: {
      id: sheet.id,
      branchName: branch?.name ?? "",
      positionName: position?.name ?? "",
      isDoctor: sheet.isDoctor,
      status: sheet.status,
    },
  });
});

// PUT /doctor-profiles/:routingSheetId — create or update (chief_physician or admin only)
doctorProfilesRouter.put("/doctor-profiles/:routingSheetId", requireAuth, async (req, res): Promise<void> => {
  const routingSheetId = Number(req.params.routingSheetId);
  const user = req.user!;

  if (!["admin", "chief_physician"].includes(user.role)) {
    res.status(403).json({ error: "Only chief physician can edit doctor profiles" });
    return;
  }

  // Verify routing sheet exists
  const [sheet] = await db.select().from(routingSheetsTable)
    .where(eq(routingSheetsTable.id, routingSheetId));
  if (!sheet) { res.status(404).json({ error: "Routing sheet not found" }); return; }
  if (!sheet.isDoctor) { res.status(400).json({ error: "Routing sheet is not for a doctor" }); return; }

  const { experience, specialty, ageRestrictions, siteDiscounts, about, procedures, photoUrl } = req.body;

  const [existing] = await db.select().from(doctorProfilesTable)
    .where(eq(doctorProfilesTable.routingSheetId, routingSheetId));

  let profile;
  if (existing) {
    [profile] = await db.update(doctorProfilesTable).set({
      experience: experience ?? existing.experience,
      specialty: specialty ?? existing.specialty,
      ageRestrictions: ageRestrictions ?? existing.ageRestrictions,
      siteDiscounts: siteDiscounts ?? existing.siteDiscounts,
      about: about ?? existing.about,
      procedures: procedures ?? existing.procedures,
      photoUrl: photoUrl ?? existing.photoUrl,
    }).where(eq(doctorProfilesTable.routingSheetId, routingSheetId)).returning();
  } else {
    [profile] = await db.insert(doctorProfilesTable).values({
      routingSheetId,
      experience: experience ?? null,
      specialty: specialty ?? null,
      ageRestrictions: ageRestrictions ?? null,
      siteDiscounts: siteDiscounts ?? null,
      about: about ?? null,
      procedures: procedures ?? null,
      photoUrl: photoUrl ?? null,
      createdById: user.id,
    }).returning();
  }

  await logAudit({ actorId: user.id, actorName: user.fullName, action: "upsert_doctor_profile", objectType: "doctor_profile", objectId: profile.id });

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
    createdById: profile.createdById ?? null,
    updatedAt: profile.updatedAt,
    createdAt: profile.createdAt,
  });
});
