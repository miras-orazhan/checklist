import { Router } from "express";
import {
  db,
  candidatesTable,
  routingSheetsTable,
  terminationSheetsTable,
  branchesTable,
  positionsTable,
  offersTable,
} from "@workspace/db";
import { eq, and, desc, SQL, or, ilike } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

export const employeesRouter = Router();

/**
 * Employee registry — read-only view that aggregates every person who has ever
 * been processed by the HR system.
 *
 * Sources:
 *   1. Candidates with a routing sheet (hiring/onboarding)
 *      - status "in_progress" → "Оформляется" (currently being onboarded)
 *      - status "completed"   → "Работает" (active employee)
 *      - status "cancelled"   → "Найм отменён"
 *   2. Termination sheets (offboarding)
 *      - status "in_progress" → "Увольняется"
 *      - status "completed"   → "Уволен"
 *      - status "rejected"/"stopped" → "Увольнение остановлено"
 *
 * A person can appear twice if they were hired and then later terminated —
 * we present them as two rows so HR can see both lifecycle events.
 *
 * Access: admin, hr, recruiter, chief_physician, account_manager.
 */

const ALLOWED_ROLES = ["admin", "hr", "recruiter", "chief_physician", "account_manager"];

/** Unified row shape returned by the API. */
interface EmployeeRow {
  id: number;             // synthetic: positive = routing sheet ID, negative = termination sheet ID
  personKind: "hired" | "terminated";
  sheetId: number;        // routing sheet ID or termination sheet ID
  sheetStatus: string;
  employeeStatus: string; // human-readable RU label
  employeeStatusCode: string; // machine code for filtering
  lastName: string;
  firstName: string;
  middleName: string | null;
  fullName: string;
  email: string;
  phone: string;
  iin: string;
  birthDate: string | null;
  gender: string | null;
  branchId: number;
  branchName: string;
  positionId: number;
  positionName: string;
  isDoctor: boolean;
  hireDate: string | null;     // when they accepted the offer / sheet was created
  terminationDate: string | null; // only for terminated employees
  createdAt: string;
}

const HIRE_STATUS_MAP: Record<string, { code: string; label: string }> = {
  in_progress: { code: "onboarding", label: "Оформляется" },
  completed:   { code: "active",     label: "Работает" },
  cancelled:   { code: "hire_cancelled", label: "Найм отменён" },
};

const TERM_STATUS_MAP: Record<string, { code: string; label: string }> = {
  in_progress: { code: "terminating",  label: "Увольняется" },
  completed:   { code: "terminated",   label: "Уволен" },
  rejected:    { code: "term_stopped", label: "Увольнение остановлено" },
  stopped:     { code: "term_stopped", label: "Увольнение остановлено" },
};

// GET /employees — registry of all employees (active, onboarding, terminated)
employeesRouter.get("/employees", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  if (!ALLOWED_ROLES.includes(user.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Query params for filtering
  const { branchId, positionId, status, isDoctor, search } = req.query as Record<string, string | undefined>;

  // ── 1. Hired / onboarding employees (from routing sheets + candidates) ──
  const routingSheets = await db.select().from(routingSheetsTable);
  const candidateIds = Array.from(new Set(routingSheets.map(s => s.candidateId)));
  const candidates = candidateIds.length === 0
    ? []
    : await db.select().from(candidatesTable);

  const branchIds = Array.from(new Set(routingSheets.map(s => s.branchId)));
  const branches = branchIds.length === 0
    ? []
    : await db.select().from(branchesTable);
  const positionIds = Array.from(new Set(routingSheets.map(s => s.positionId)));
  const positions = positionIds.length === 0
    ? []
    : await db.select().from(positionsTable);

  const branchMap = new Map(branches.map(b => [b.id, b]));
  const positionMap = new Map(positions.map(p => [p.id, p]));
  const candidateMap = new Map(candidates.map(c => [c.id, c]));

  const hiredRows: EmployeeRow[] = routingSheets.map(sheet => {
    const candidate = candidateMap.get(sheet.candidateId);
    const branch = branchMap.get(sheet.branchId);
    const position = positionMap.get(sheet.positionId);
    const statusInfo = HIRE_STATUS_MAP[sheet.status] ?? { code: sheet.status, label: sheet.status };
    return {
      id: sheet.id, // positive — routing sheet ID
      personKind: "hired" as const,
      sheetId: sheet.id,
      sheetStatus: sheet.status,
      employeeStatus: statusInfo.label,
      employeeStatusCode: statusInfo.code,
      lastName: candidate?.lastName ?? "",
      firstName: candidate?.firstName ?? "",
      middleName: candidate?.middleName ?? null,
      fullName: candidate?.fullName ?? sheet.candidateId.toString(),
      email: candidate?.email ?? "",
      phone: candidate?.phone ?? "",
      iin: candidate?.iin ?? "",
      birthDate: candidate?.birthDate ?? null,
      gender: candidate?.gender ?? null,
      branchId: sheet.branchId,
      branchName: branch?.name ?? "",
      positionId: sheet.positionId,
      positionName: position?.name ?? "",
      isDoctor: sheet.isDoctor,
      hireDate: sheet.createdAt.toISOString(),
      terminationDate: null,
      createdAt: sheet.createdAt.toISOString(),
    };
  });

  // ── 2. Terminated / terminating employees (from termination sheets) ──
  const termSheets = await db.select().from(terminationSheetsTable);
  // For termination sheets we don't have a candidate record — only the
  // employee_full_name, branchId, positionId. Look up branch + position.
  const termBranchIds = Array.from(new Set(termSheets.map(s => s.branchId)));
  const termBranches = termBranchIds.length === 0
    ? []
    : await db.select().from(branchesTable);
  const termPositionIds = Array.from(new Set(termSheets.map(s => s.positionId)));
  const termPositions = termPositionIds.length === 0
    ? []
    : await db.select().from(positionsTable);
  const termBranchMap = new Map(termBranches.map(b => [b.id, b]));
  const termPositionMap = new Map(termPositions.map(p => [p.id, p]));

  const terminatedRows: EmployeeRow[] = termSheets.map(sheet => {
    const branch = termBranchMap.get(sheet.branchId);
    const position = termPositionMap.get(sheet.positionId);
    const statusInfo = TERM_STATUS_MAP[sheet.status] ?? { code: sheet.status, label: sheet.status };
    // Split full name into parts for consistency — best-effort, since we only
    // stored the joined string on termination_sheets.
    const parts = sheet.employeeFullName.split(/\s+/);
    return {
      id: -sheet.id, // negative — termination sheet ID (avoids collision with hired)
      personKind: "terminated" as const,
      sheetId: sheet.id,
      sheetStatus: sheet.status,
      employeeStatus: statusInfo.label,
      employeeStatusCode: statusInfo.code,
      lastName: parts[0] ?? sheet.employeeFullName,
      firstName: parts[1] ?? "",
      middleName: parts.slice(2).join(" ") || null,
      fullName: sheet.employeeFullName,
      email: "", // not stored on termination_sheets — would need a join to candidates
      phone: "",
      iin: "",
      birthDate: null,
      gender: null,
      branchId: sheet.branchId,
      branchName: branch?.name ?? "",
      positionId: sheet.positionId,
      positionName: position?.name ?? "",
      isDoctor: sheet.isDoctor,
      hireDate: null,
      terminationDate: sheet.terminationDate.toISOString(),
      createdAt: sheet.createdAt.toISOString(),
    };
  });

  // Combine
  let allRows = [...hiredRows, ...terminatedRows];

  // ── Filters ────────────────────────────────────────────────────────────
  if (branchId) {
    allRows = allRows.filter(r => r.branchId === Number(branchId));
  }
  if (positionId) {
    allRows = allRows.filter(r => r.positionId === Number(positionId));
  }
  if (isDoctor === "true") {
    allRows = allRows.filter(r => r.isDoctor);
  } else if (isDoctor === "false") {
    allRows = allRows.filter(r => !r.isDoctor);
  }
  if (status) {
    allRows = allRows.filter(r => r.employeeStatusCode === status);
  }
  if (search) {
    const q = search.toLowerCase();
    allRows = allRows.filter(r =>
      r.fullName.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.iin.includes(q) ||
      r.phone.includes(search)
    );
  }

  // Sort: most recent first
  allRows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  res.json(allRows);
});
