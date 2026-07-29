import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const integrationConfigsTable = pgTable("integration_configs", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value"),
  description: text("description"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type IntegrationConfig = typeof integrationConfigsTable.$inferSelect;
