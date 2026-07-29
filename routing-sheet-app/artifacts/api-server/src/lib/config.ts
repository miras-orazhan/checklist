/**
 * Cached config reader for integration_configs table.
 * Values are re-fetched from DB at most every 60 seconds.
 */
import { db, integrationConfigsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

interface CacheEntry {
  value: string | null;
  expiresAt: number;
}

const TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

export async function getConfig(key: string): Promise<string | null> {
  const now = Date.now();
  const entry = cache.get(key);
  if (entry && entry.expiresAt > now) return entry.value;

  const [row] = await db
    .select()
    .from(integrationConfigsTable)
    .where(eq(integrationConfigsTable.key, key));

  const value = row?.value ?? null;
  cache.set(key, { value, expiresAt: now + TTL_MS });
  return value;
}

export function clearConfigCache(): void {
  cache.clear();
}

export async function setConfig(key: string, value: string | null, description?: string): Promise<void> {
  await db
    .insert(integrationConfigsTable)
    .values({ key, value, description })
    .onConflictDoUpdate({
      target: integrationConfigsTable.key,
      set: { value, updatedAt: new Date() },
    });
  cache.delete(key);
}
