import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const STEP_TYPES = [
  "hr_registration",
  "marketing_photo",
  "tb_briefing",
  "it_accounts",
  "audit_training",
  "doctor_profile",
  "site_publication",
  "final_review",
] as const;
export type StepType = (typeof STEP_TYPES)[number];

export const STEP_STATUSES = ["pending", "in_progress", "completed", "skipped"] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export const routingStepsTable = pgTable("routing_steps", {
  id: serial("id").primaryKey(),
  routingSheetId: integer("routing_sheet_id").notNull(),
  stepType: text("step_type").notNull().$type<StepType>(),
  assignedRole: text("assigned_role").notNull(),
  assignedUserId: integer("assigned_user_id"),
  status: text("status").notNull().default("pending").$type<StepStatus>(),
  isBackground: boolean("is_background").notNull().default(false),
  notes: text("notes"),
  photoUrl: text("photo_url"),
  completedById: integer("completed_by_id"),
  isOverride: boolean("is_override").notNull().default(false),
  stepData: jsonb("step_data"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRoutingStepSchema = createInsertSchema(routingStepsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRoutingStep = z.infer<typeof insertRoutingStepSchema>;
export type RoutingStep = typeof routingStepsTable.$inferSelect;
