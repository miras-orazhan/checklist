import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const doctorProfilesTable = pgTable("doctor_profiles", {
  id: serial("id").primaryKey(),
  routingSheetId: integer("routing_sheet_id").notNull().unique(),
  experience: integer("experience"),               // years of experience
  specialty: text("specialty"),                    // doctor specialty
  ageRestrictions: text("age_restrictions"),       // e.g. "18+"
  siteDiscounts: text("site_discounts"),           // discount info for site
  about: text("about"),                            // bio text
  procedures: jsonb("procedures").$type<string[]>(), // list of procedures
  photoUrl: text("photo_url"),
  createdById: integer("created_by_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDoctorProfileSchema = createInsertSchema(doctorProfilesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDoctorProfile = z.infer<typeof insertDoctorProfileSchema>;
export type DoctorProfile = typeof doctorProfilesTable.$inferSelect;
