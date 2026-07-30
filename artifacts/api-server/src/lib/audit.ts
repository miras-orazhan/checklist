import { db, auditLogTable } from "@workspace/db";
import { logger } from "./logger";

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function logAudit(
  opts: {
    actorId?: number;
    actorName: string;
    action: string;
    objectType: string;
    objectId?: number;
    details?: string;
  },
  client: DbOrTx = db,
): Promise<void> {
  await client.insert(auditLogTable).values({
    actorId: opts.actorId,
    actorName: opts.actorName,
    action: opts.action,
    objectType: opts.objectType,
    objectId: opts.objectId,
    details: opts.details,
  });
}
