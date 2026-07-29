/**
 * Migrate script — creates all tables in the database (PGlite or real Postgres)
 * using raw SQL DDL generated to match the Drizzle schema.
 *
 * Usage:
 *   pnpm --filter @workspace/api-server tsx src/migrate.ts
 *
 * This is the PGlite-friendly replacement for `drizzle-kit push` (which only
 * works against a live Postgres server).
 */
import { db, getPglite, isUsingPglite } from "@workspace/db";
import { sql } from "drizzle-orm";

// Single DDL statement (idempotent — uses CREATE TABLE IF NOT EXISTS).
const DDL = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  branch_id INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS branches (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  chief_physician_id INTEGER,
  deputy_chief_physician_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS positions (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  is_doctor BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS candidates (
  id SERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  experience TEXT,
  education TEXT,
  certifications TEXT,
  offer_status TEXT NOT NULL DEFAULT 'draft',
  created_by_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS offers (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL,
  sent_by_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  token TEXT UNIQUE,
  token_expires_at TIMESTAMPTZ,
  otp_code TEXT,
  otp_expires_at TIMESTAMPTZ,
  otp_attempts INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS routing_sheets (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL,
  branch_id INTEGER NOT NULL,
  position_id INTEGER NOT NULL,
  is_doctor BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'in_progress',
  status_token TEXT UNIQUE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS routing_steps (
  id SERIAL PRIMARY KEY,
  routing_sheet_id INTEGER NOT NULL,
  step_type TEXT NOT NULL,
  assigned_role TEXT NOT NULL,
  assigned_user_id INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  is_background BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  photo_url TEXT,
  completed_by_id INTEGER,
  is_override BOOLEAN NOT NULL DEFAULT FALSE,
  step_data JSONB,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  actor_id INTEGER,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id INTEGER,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS doctor_profiles (
  id SERIAL PRIMARY KEY,
  routing_sheet_id INTEGER NOT NULL UNIQUE,
  experience INTEGER,
  specialty TEXT,
  age_restrictions TEXT,
  site_discounts TEXT,
  about TEXT,
  procedures JSONB,
  photo_url TEXT,
  created_by_id INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS termination_sheets (
  id SERIAL PRIMARY KEY,
  employee_full_name TEXT NOT NULL,
  branch_id INTEGER NOT NULL,
  position_id INTEGER NOT NULL,
  is_doctor BOOLEAN NOT NULL DEFAULT FALSE,
  termination_date TIMESTAMPTZ NOT NULL,
  initiator_id INTEGER NOT NULL,
  initiator_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',
  status_token TEXT NOT NULL UNIQUE,
  rejected_by_id INTEGER,
  rejected_by_name TEXT,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  stopped_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS termination_steps (
  id SERIAL PRIMARY KEY,
  termination_sheet_id INTEGER NOT NULL,
  step_type TEXT NOT NULL,
  assigned_role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  is_blocking BOOLEAN NOT NULL DEFAULT TRUE,
  comment TEXT,
  exit_interview_notes TEXT,
  completed_by_id INTEGER,
  completed_by_name TEXT,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integration_configs (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sla_configs (
  id SERIAL PRIMARY KEY,
  step_type TEXT NOT NULL UNIQUE,
  sheet_kind TEXT NOT NULL DEFAULT 'routing',
  sla_hours INTEGER NOT NULL DEFAULT 24,
  escalation_hours INTEGER NOT NULL DEFAULT 48,
  supervisor_role TEXT DEFAULT 'admin',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_log (
  id SERIAL PRIMARY KEY,
  channel TEXT NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  error_message TEXT,
  object_type TEXT,
  object_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_templates (
  id SERIAL PRIMARY KEY,
  template_type TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

-- Helpful indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_offers_token ON offers(token);
CREATE INDEX IF NOT EXISTS idx_routing_sheets_status_token ON routing_sheets(status_token);
CREATE INDEX IF NOT EXISTS idx_termination_sheets_status_token ON termination_sheets(status_token);
CREATE INDEX IF NOT EXISTS idx_routing_steps_sheet ON routing_steps(routing_sheet_id);
CREATE INDEX IF NOT EXISTS idx_termination_steps_sheet ON termination_steps(termination_sheet_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_object ON audit_log(object_type, object_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_object ON notification_log(object_type, object_id);
`;

async function migrate() {
  console.log(
    `Migrating database (${isUsingPglite ? "PGlite" : "node-postgres"})…`,
  );

  // For PGlite, execute the DDL directly against the underlying instance.
  if (isUsingPglite) {
    const pglite = await getPglite();
    await pglite.exec(DDL);
    console.log("PGlite schema applied.");
  } else {
    // For node-postgres, execute via drizzle's sql helper.
    await (db as never as { execute: (q: unknown) => Promise<unknown> })
      .execute(sql.raw(DDL));
    console.log("Postgres schema applied.");
  }

  console.log("Migration complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
