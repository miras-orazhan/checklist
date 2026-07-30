import { pgTable, serial, text, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const OFFER_STATUSES = ["draft", "sent", "accepted", "expired"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const GENDERS = ["male", "female"] as const;
export type Gender = (typeof GENDERS)[number];

export const candidatesTable = pgTable("candidates", {
  id: serial("id").primaryKey(),
  // Name is stored as three separate fields (Russian HR convention) so that
  // forms can collect them individually. `fullName` is derived as
  // "lastName firstName middleName" for backward-compat with existing reports
  // and notification templates.
  lastName: text("last_name").notNull(),
  firstName: text("first_name").notNull(),
  middleName: text("middle_name"),
  fullName: text("full_name").notNull(), // derived: "lastName firstName middleName"

  email: text("email").notNull(),
  phone: text("phone").notNull(),

  // Kazakhstan IIN (ИИН — Индивидуальный идентификационный номер, 12 digits).
  // From it we derive birth date (digits 1-6 = YYMMDD) and gender (digit 7:
  //   odd  → male,   even → female; the leading century digit also tells the
  //   century: 1/2 = 1800s, 3/4 = 1900s, 5/6 = 2000s).
  iin: text("iin").notNull().unique(),
  birthDate: date("birth_date"), // derived from IIN, stored for fast filtering
  gender: text("gender").$type<Gender>(), // derived from IIN

  // Recruiter enters these; chief physician and account manager see them
  // when filling out the doctor profile.
  experience: text("experience"),
  education: text("education"),
  certifications: text("certifications"),

  offerStatus: text("offer_status").notNull().default("draft").$type<OfferStatus>(),
  createdById: integer("created_by_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCandidateSchema = createInsertSchema(candidatesTable).omit({
  id: true,
  createdAt: true,
  offerStatus: true,
  // Server-derived from IIN — clients don't send them
  fullName: true,
  birthDate: true,
  gender: true,
});
export type InsertCandidate = z.infer<typeof insertCandidateSchema>;
export type Candidate = typeof candidatesTable.$inferSelect;
