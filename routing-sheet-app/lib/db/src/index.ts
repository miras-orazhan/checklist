import { drizzle } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite, type PgDatabase } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL ?? "";

/**
 * Use PGlite (in-process Postgres via WASM) when DATABASE_URL is empty OR when
 * it points to a local file (file: scheme — common in container envs without a
 * real Postgres server). Real Postgres URLs use postgres:// / postgresql://.
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

// Shared PGlite instance (singleton) — PGlite is in-process, so the same
// instance is reused across app, migrations, and seed scripts.
let _pglite: PGlite | null = null;

export async function getPglite(): Promise<PGlite> {
  if (_pglite) return _pglite;
  const path = resolvePglitePath(databaseUrl);
  _pglite = path
    ? await PGlite.create({ dataDir: path })
    : await PGlite.create();
  return _pglite;
}

export type AppDb =
  | NodePgDatabase<typeof schema>
  | PgDatabase<typeof schema>;

/**
 * Returns the (eventually-resolved) drizzle DB instance. Callers may await
 * this at startup to ensure initialisation has completed.
 */
export async function getDb(): Promise<AppDb> {
  if (_db) return _db;
  if (shouldUsePglite(databaseUrl)) {
    const pglite = await getPglite();
    _db = drizzlePglite(pglite, { schema }) as AppDb;
  } else {
    const pool = new Pool({ connectionString: databaseUrl });
    _db = drizzle(pool, { schema }) as AppDb;
  }
  return _db;
}

let _db: AppDb | null = null;

// Eagerly initialise the DB on module load using top-level await so that
// downstream code can import `db` synchronously. For node-postgres this is
// near-instant (just constructs a Pool). For PGlite, the WASM instance is
// loaded and the data file is opened — typically <500ms.
_db = await getDb();

export const db: AppDb = _db;

export const isUsingPglite = shouldUsePglite(databaseUrl);

export * from "./schema";
