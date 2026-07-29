import { Router } from "express";
import crypto from "crypto";
import { db, offersTable, candidatesTable, routingSheetsTable, routingStepsTable, positionsTable, branchesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { createRoutingSteps } from "../lib/routingSheet";
import { logAudit } from "../lib/audit";
import { notifyOfferSent, notifyOtpGenerated, notifyOfferAccepted } from "../lib/notifications";
import {
  CreateOfferBody,
  AcceptOfferBody,
  VerifyOfferOtpBody,
} from "@workspace/api-zod";

export const offersRouter = Router();

// POST /offers — Create offer + routing sheet in a single DB transaction
offersRouter.post("/offers", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateOfferBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }
  const { candidateId, branchId, positionId, message } = parsed.data as any;

  const [candidate] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, candidateId));
  if (!candidate) { res.status(404).json({ error: "Candidate not found" }); return; }

  const [position] = await db.select().from(positionsTable).where(eq(positionsTable.id, positionId));
  if (!position) { res.status(404).json({ error: "Position not found" }); return; }

  const token = crypto.randomUUID();
  const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const statusToken = crypto.randomUUID();
  const actorId = req.user!.id;
  const actorName = req.user!.fullName;

  // Wrap ALL writes in a single DB transaction — offer, sheet, steps, candidate status, and audit
  const { offer, sheet } = await db.transaction(async (tx) => {
    const [offer] = await tx.insert(offersTable).values({
      candidateId,
      sentById: actorId,
      status: "sent",
      token,
      tokenExpiresAt,
      message: message ?? null,
    }).returning();

    const [sheet] = await tx.insert(routingSheetsTable).values({
      candidateId,
      branchId,
      positionId,
      isDoctor: position.isDoctor,
      status: "in_progress",
      statusToken,
    }).returning();

    // Pass tx so step inserts are within the same transaction
    await createRoutingSteps(sheet.id, position.isDoctor, tx);

    await tx.update(candidatesTable).set({ offerStatus: "sent" }).where(eq(candidatesTable.id, candidateId));

    // Audit is also transactional — rolls back with everything else on failure
    await logAudit({ actorId, actorName, action: "create_offer", objectType: "offer", objectId: offer.id }, tx);

    return { offer, sheet };
  });

  // Notify candidate (fire-and-forget — never blocks the response)
  const [branch] = await db.select().from(branchesTable).where(eq(branchesTable.id, branchId));
  notifyOfferSent({
    candidateId,
    offerId: offer.id,
    offerToken: token,
    companyName: branch?.name ?? "Клиника",
    message: message ?? null,
  });

  res.status(201).json({
    id: offer.id,
    candidateId: offer.candidateId,
    status: offer.status,
    token: offer.token,
    statusToken,
    routingSheetId: sheet.id,
    createdAt: offer.createdAt,
  });
});

// GET /offers/by-token/:token — Get offer by token (public)
offersRouter.get("/offers/by-token/:token", async (req, res): Promise<void> => {
  const { token } = req.params;
  const [offer] = await db.select().from(offersTable).where(eq(offersTable.token, token));
  if (!offer) { res.status(404).json({ error: "Offer not found" }); return; }
  if (offer.tokenExpiresAt && offer.tokenExpiresAt < new Date()) {
    res.status(410).json({ error: "Offer expired" }); return;
  }
  const [candidate] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, offer.candidateId));
  const [sheet] = await db.select().from(routingSheetsTable).where(eq(routingSheetsTable.candidateId, offer.candidateId));
  const [branch] = sheet ? await db.select().from(branchesTable).where(eq(branchesTable.id, sheet.branchId)) : [null];

  res.json({
    id: offer.id,
    candidateName: candidate?.fullName ?? "",
    companyName: branch?.name ?? "Клиника",
    status: offer.status,
    message: offer.message ?? null,
    expiresAt: offer.tokenExpiresAt ?? null,
  });
});

// POST /offers/:id/accept — Accept offer, trigger OTP (public)
offersRouter.post("/offers/:id/accept", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = AcceptOfferBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }
  const { token } = parsed.data;

  const [offer] = await db.select().from(offersTable).where(eq(offersTable.id, id));
  if (!offer || offer.token !== token) { res.status(404).json({ error: "Not found" }); return; }
  if (offer.status !== "sent") { res.status(409).json({ error: "Offer already processed" }); return; }

  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db.update(offersTable).set({
    status: "otp_pending",
    otpCode,
    otpExpiresAt,
    otpAttempts: 0,
  }).where(eq(offersTable.id, offer.id));

  // Send OTP email to candidate (fire-and-forget)
  notifyOtpGenerated({ candidateId: offer.candidateId, offerId: offer.id, otpCode });

  res.json({ message: "OTP sent" });
});

// POST /offers/:id/verify-otp — Verify OTP (public)
offersRouter.post("/offers/:id/verify-otp", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = VerifyOfferOtpBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }
  const { token, otp } = parsed.data;

  const [offer] = await db.select().from(offersTable).where(eq(offersTable.id, id));
  if (!offer || offer.token !== token) { res.status(404).json({ error: "Not found" }); return; }
  if (offer.status !== "otp_pending") { res.status(409).json({ error: "OTP not requested" }); return; }

  if ((offer.otpAttempts ?? 0) >= 5) { res.status(429).json({ error: "Too many attempts" }); return; }
  await db.update(offersTable).set({ otpAttempts: (offer.otpAttempts ?? 0) + 1 }).where(eq(offersTable.id, offer.id));

  if (offer.otpExpiresAt && offer.otpExpiresAt < new Date()) { res.status(410).json({ error: "OTP expired" }); return; }
  if (offer.otpCode !== otp) { res.status(422).json({ error: "Неверный код" }); return; }

  await db.update(offersTable).set({ status: "accepted", acceptedAt: new Date() }).where(eq(offersTable.id, offer.id));
  await db.update(candidatesTable).set({ offerStatus: "accepted" }).where(eq(candidatesTable.id, offer.candidateId));

  const [sheet] = await db.select().from(routingSheetsTable).where(eq(routingSheetsTable.candidateId, offer.candidateId));

  // Notify candidate (confirmation link) + all step assignees (fire-and-forget)
  if (sheet) {
    const steps = await db.select().from(routingStepsTable).where(eq(routingStepsTable.routingSheetId, sheet.id));
    notifyOfferAccepted({
      candidateId: offer.candidateId,
      routingSheetId: sheet.id,
      statusToken: sheet.statusToken ?? "",
      steps: steps.map(s => ({ stepType: s.stepType, assignedRole: s.assignedRole, id: s.id })),
    });
  }

  res.json({
    message: "Оффер принят, обходной лист создан",
    routingSheetId: sheet?.id ?? 0,
    statusToken: sheet?.statusToken ?? "",
  });
});

// POST /offers/:id/resend-token — Re-issue candidate access token + reset OTP (requires auth)
offersRouter.post("/offers/:id/resend-token", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [offer] = await db.select().from(offersTable).where(eq(offersTable.id, id));
  if (!offer) { res.status(404).json({ error: "Not found" }); return; }

  const newToken = crypto.randomUUID();
  const newTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  // New OTP pre-generated (sent out-of-band in production)
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db.update(offersTable).set({
    token: newToken,
    tokenExpiresAt: newTokenExpiresAt,
    status: "sent",
    otpCode,
    otpExpiresAt,
    otpAttempts: 0,
  }).where(eq(offersTable.id, offer.id));

  console.log(`[DEV] New access token issued for offer ${offer.id} (values redacted)`);

  const [updated] = await db.select().from(offersTable).where(eq(offersTable.id, id));
  res.json({
    id: updated.id,
    candidateId: updated.candidateId,
    sentById: updated.sentById,
    status: updated.status,
    token: updated.token ?? null,
    tokenExpiresAt: updated.tokenExpiresAt ?? null,
    acceptedAt: updated.acceptedAt ?? null,
    createdAt: updated.createdAt,
  });
});
