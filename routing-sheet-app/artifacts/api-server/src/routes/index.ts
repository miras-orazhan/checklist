import { Router } from "express";
import { authRouter } from "./auth";
import { usersRouter } from "./users";
import { branchesRouter } from "./branches";
import { positionsRouter } from "./positions";
import { candidatesRouter } from "./candidates";
import { employeesRouter } from "./employees";
import { offersRouter } from "./offers";
import { routingSheetsRouter } from "./routing-sheets";
import { routingStepsRouter } from "./routing-steps";
import { dashboardRouter } from "./dashboard";
import { storageRouter } from "./storage";
import { photosRouter } from "./photos";
import { doctorProfilesRouter } from "./doctor-profiles";
import { terminationSheetsRouter } from "./termination-sheets";
import { terminationStepsRouter } from "./termination-steps";
import { terminationStatusRouter } from "./termination-status";
import { integrationConfigsRouter } from "./integration-configs";
import { emailTemplatesRouter } from "./email-templates";
import { adminRouter } from "./admin";

const router = Router();

router.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

router.use(authRouter);
router.use(usersRouter);
router.use(branchesRouter);
router.use(positionsRouter);
router.use(candidatesRouter);
router.use(employeesRouter);
router.use(offersRouter);
router.use(routingSheetsRouter);
router.use(routingStepsRouter);
router.use(dashboardRouter);
router.use(storageRouter);
router.use(photosRouter);
router.use(doctorProfilesRouter);
router.use(terminationSheetsRouter);
router.use(terminationStepsRouter);
router.use(terminationStatusRouter);
router.use(integrationConfigsRouter);
router.use(emailTemplatesRouter);
router.use(adminRouter);

export default router;
