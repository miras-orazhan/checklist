import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * SLA configuration per step type.
 * sheetKind: 'routing' | 'termination'
 * slaHours: hours before a reminder is sent (first breach)
 * escalationHours: hours before escalation email to supervisor (second breach)
 * supervisorRole: role that receives escalation emails
 */
export const slaConfigsTable = pgTable("sla_configs", {
  id: serial("id").primaryKey(),
  stepType: text("step_type").notNull().unique(),
  sheetKind: text("sheet_kind").notNull().default("routing"), // 'routing' | 'termination'
  slaHours: integer("sla_hours").notNull().default(24),
  escalationHours: integer("escalation_hours").notNull().default(48),
  supervisorRole: text("supervisor_role").default("admin"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type SlaConfig = typeof slaConfigsTable.$inferSelect;
