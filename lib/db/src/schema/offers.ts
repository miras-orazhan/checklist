import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const OFFER_FLOW_STATUSES = ["sent", "otp_pending", "accepted", "expired"] as const;
export type OfferFlowStatus = (typeof OFFER_FLOW_STATUSES)[number];

export const offersTable = pgTable("offers", {
  id: serial("id").primaryKey(),
  candidateId: integer("candidate_id").notNull(),
  sentById: integer("sent_by_id").notNull(),
  status: text("status").notNull().default("sent").$type<OfferFlowStatus>(),
  token: text("token").unique(),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  otpCode: text("otp_code"),
  otpExpiresAt: timestamp("otp_expires_at", { withTimezone: true }),
  otpAttempts: integer("otp_attempts").notNull().default(0),
  message: text("message"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOfferSchema = createInsertSchema(offersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertOffer = z.infer<typeof insertOfferSchema>;
export type Offer = typeof offersTable.$inferSelect;
