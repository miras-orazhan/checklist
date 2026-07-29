import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const SHEET_STATUSES = ["in_progress", "completed", "cancelled"] as const;
export type SheetStatus = (typeof SHEET_STATUSES)[number];

export const routingSheetsTable = pgTable("routing_sheets", {
  id: serial("id").primaryKey(),
  candidateId: integer("candidate_id").notNull(),
  branchId: integer("branch_id").notNull(),
  positionId: integer("position_id").notNull(),
  isDoctor: boolean("is_doctor").notNull().default(false),
  status: text("status").notNull().default("in_progress").$type<SheetStatus>(),
  statusToken: text("status_token").unique(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRoutingSheetSchema = createInsertSchema(routingSheetsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertRoutingSheet = z.infer<typeof insertRoutingSheetSchema>;
export type RoutingSheet = typeof routingSheetsTable.$inferSelect;
