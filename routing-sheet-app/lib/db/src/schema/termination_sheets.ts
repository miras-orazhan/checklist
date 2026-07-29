import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const TERMINATION_STATUSES = [
  "in_progress",
  "completed",
  "rejected",
  "stopped",
] as const;
export type TerminationStatus = (typeof TERMINATION_STATUSES)[number];

export const terminationSheetsTable = pgTable("termination_sheets", {
  id: serial("id").primaryKey(),
  employeeFullName: text("employee_full_name").notNull(),
  branchId: integer("branch_id").notNull(),
  positionId: integer("position_id").notNull(),
  isDoctor: boolean("is_doctor").notNull().default(false),
  terminationDate: timestamp("termination_date", { withTimezone: true }).notNull(),
  initiatorId: integer("initiator_id").notNull(),
  initiatorName: text("initiator_name").notNull(),
  status: text("status").notNull().default("in_progress").$type<TerminationStatus>(),
  statusToken: text("status_token").unique().notNull(),
  rejectedById: integer("rejected_by_id"),
  rejectedByName: text("rejected_by_name"),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  stoppedAt: timestamp("stopped_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTerminationSheetSchema = createInsertSchema(terminationSheetsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertTerminationSheet = z.infer<typeof insertTerminationSheetSchema>;
export type TerminationSheet = typeof terminationSheetsTable.$inferSelect;
