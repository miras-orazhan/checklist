/**
 * Database layer — supports two backends:
 *
 *   1. Real Postgres (production) — Neon, Supabase, or any postgres:// URL
 *      Uses node-postgres (pg) + drizzle-orm/node-postgres.
 *      Connection pooling via pg.Pool with SSL support for Neon.
 *
 *   2. PGlite (development) — in-process Postgres via WASM
 *      Used when DATABASE_URL is empty or starts with "file:"
 *      No external server needed — perfect for local dev.
 *
 * The `db` export uses top-level await to initialize eagerly. This works in:
 *   - Node.js 18+ with ESM (dev mode)
 *   - Vercel serverless functions (Node 18+ ESM)
 *   - esbuild bundles (with banner plugin)
 */

import { drizzle } from "drizzle-orm/node-postgres";
import type { drizzle as DrizzlePgliteFn } from "drizzle-orm/pglite";
import type { PGlite } from "@electric-sql/pglite";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL ?? "";

/**
 * Use PGlite (in-process Postgres via WASM) when DATABASE_URL is empty OR when
 * it points to a local file (file: scheme). Real Postgres URLs use
 * postgres:// / postgresql://.
 */
export function shouldUsePglite(url: string): boolean {
  if (!url) return true;
  if (url.startsWith("file:")) return true;
  if (url.startsWith("postgres:") || url.startsWith("postgresql:")) return false;
  return true; // bare path → PGlite
}

function resolvePglitePath(url: string): string | undefined {
  if (!url) return undefined; // in-memory
  if (url.startsWith("file:")) return url.slice("file:".length);
  return url;
}

// ─── PGlite singleton (dev) ──────────────────────────────────────────────────
let _pglite: PGlite | null = null;
let _drizzlePglite: typeof drizzlePglite | null = null;

export async function getPglite(): Promise<PGlite> {
  if (_pglite) return _pglite;
  const path = resolvePglitePath(databaseUrl);
  const { PGlite: PGliteClass } = await import("@electric-sql/pglite");
  _pglite = path
    ? await PGliteClass.create({ dataDir: path })
    : await PGliteClass.create();
  return _pglite;
}

async function getDrizzlePglite() {
  if (_drizzlePglite) return _drizzlePglite;
  _drizzlePglite = (await import("drizzle-orm/pglite")).drizzle;
  return _drizzlePglite;
}

// ─── Postgres pool singleton (production) ────────────────────────────────────
// Use global to survive hot-reloads and cold starts
const globalForDb = globalThis as unknown as {
  __pgPool?: pg.Pool;
};

function getPool(): pg.Pool {
  if (!globalForDb.__pgPool) {
    globalForDb.__pgPool = new Pool({
      connectionString: databaseUrl,
      // Neon and most managed Postgres require SSL
      ssl: databaseUrl.includes("neon.tech") ||
           databaseUrl.includes("supabase") ||
           databaseUrl.includes("sslmode=require") ||
           databaseUrl.includes("ssl=true")
        ? { rejectUnauthorized: false }
        : undefined,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
  return globalForDb.__pgPool;
}

// ─── Unified types ───────────────────────────────────────────────────────────
// Use a loose type that works for both node-postgres and PGlite drizzle
// instances. The runtime API is identical for our use case.
export type AppDb = NodePgDatabase<typeof schema>;

let _db: AppDb | null = null;

/**
 * Returns the (eventually-resolved) drizzle DB instance.
 * - Production (postgres:// URL): synchronous Pool creation
 * - Development (PGlite): async WASM init (~500ms first call)
 */
export async function getDb(): Promise<AppDb> {
  if (_db) return _db;
  if (shouldUsePglite(databaseUrl)) {
    const pglite = await getPglite();
    const drizzlePgliteFn = await getDrizzlePglite();
    // Cast through unknown — PGlite and node-postgres drizzle instances have
    // incompatible TypeScript types but identical runtime API for our usage.
    _db = drizzlePgliteFn(pglite, { schema }) as unknown as AppDb;
  } else {
    _db = drizzle(getPool(), { schema }) as AppDb;
  }
  return _db;
}

// Eagerly initialize on module load. For production (postgres://) this is
// synchronous Pool creation. For PGlite this loads WASM (~500ms).
_db = await getDb();

export const db: AppDb = _db;

export const isUsingPglite = shouldUsePglite(databaseUrl);

export * from "./schema";
