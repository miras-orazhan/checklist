import { Router } from "express";
import { db, doctorProfilesTable, routingSheetsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logAudit } from "../lib/audit";

export const doctorProfilesRouter = Router();

// GET /doctor-profiles/:routingSheetId — read by chief_physician or account_manager
doctorProfilesRouter.get("/doctor-profiles/:routingSheetId", requireAuth, async (req, res): Promise<void> => {
  const routingSheetId = Number(req.params.routingSheetId);
  const user = req.user!;

  // Only chief_physician, account_manager, admin, or recruiter may read
  const allowed = ["admin", "chief_physician", "account_manager", "recruiter", "hr"];
  if (!allowed.includes(user.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const [profile] = await db.select().from(doctorProfilesTable)
    .where(eq(doctorProfilesTable.routingSheetId, routingSheetId));

  if (!profile) {
    res.status(404).json({ error: "Doctor profile not found" }); return;
  }

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

// PUT /doctor-profiles/:routingSheetId — create or update (chief_physician only)
doctorProfilesRouter.put("/doctor-profiles/:routingSheetId", requireAuth, async (req, res): Promise<void> => {
  const routingSheetId = Number(req.params.routingSheetId);
  const user = req.user!;

  if (!["admin", "chief_physician"].includes(user.role)) {
    res.status(403).json({ error: "Only chief physician can edit doctor profiles" }); return;
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
