import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Per-step-type public metadata — what the candidate/employee sees on the
 * status page.
 *
 *   sheetKind    — "routing" (hiring/onboarding) | "termination" (offboarding)
 *   stepType     — matches the canonical step type constants in
 *                  routingStepMeta.ts / terminationStepMeta.ts
 *   label        — short title (e.g. "Оформление (HR)")
 *   cabinet      — physical office/department (e.g. "Кабинет HR, 1 этаж, каб. 102")
 *   instructions — what to bring / sign / do
 *
 * When a row is missing for a given stepType, the backend falls back to the
 * hardcoded default from lib/routingStepMeta.ts / lib/terminationStepMeta.ts.
 * So this table only needs rows that the admin has customised.
 */
export const stepMetaTable = pgTable("step_meta", {
  id: serial("id").primaryKey(),
  sheetKind: text("sheet_kind").notNull(), // 'routing' | 'termination'
  stepType: text("step_type").notNull(),
  label: text("label").notNull(),
  cabinet: text("cabinet"),
  instructions: text("instructions"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  updatedBy: text("updated_by"),
});

// Composite uniqueness: one row per (sheetKind, stepType)
// Note: PGlite doesn't enforce UNIQUE constraints the same way real Postgres
// does at the constraint level via drizzle-kit push, so we add a CREATE UNIQUE
// INDEX in migrate.ts to enforce it.
