import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const TERMINATION_STEP_TYPES = [
  "chief_physician_off",
  "it_revocation",
  "marketing_off",
  "accounting_off",
  "security_off",
  "hr_exit_interview",
  "hr_close",
  "medical_equipment_off",
  "account_manager_delete_profile",
] as const;
export type TerminationStepType = (typeof TERMINATION_STEP_TYPES)[number];

export const TERMINATION_STEP_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "skipped",
] as const;
export type TerminationStepStatus = (typeof TERMINATION_STEP_STATUSES)[number];

export const terminationStepsTable = pgTable("termination_steps", {
  id: serial("id").primaryKey(),
  terminationSheetId: integer("termination_sheet_id").notNull(),
  stepType: text("step_type").notNull().$type<TerminationStepType>(),
  assignedRole: text("assigned_role").notNull(),
  status: text("status").notNull().default("pending").$type<TerminationStepStatus>(),
  isBlocking: boolean("is_blocking").notNull().default(true), // if false, non-blocking (sheet can close without it)
  comment: text("comment"),
  exitInterviewNotes: text("exit_interview_notes"), // only for hr_exit_interview
  completedById: integer("completed_by_id"),
  completedByName: text("completed_by_name"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTerminationStepSchema = createInsertSchema(terminationStepsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTerminationStep = z.infer<typeof insertTerminationStepSchema>;
export type TerminationStep = typeof terminationStepsTable.$inferSelect;
