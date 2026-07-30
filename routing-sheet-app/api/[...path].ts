/**
 * Vercel catch-all route — forwards /api/<anything> to the Express app.
 * This is needed because Vercel's file-based routing requires explicit
 * catch-all for nested paths.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import app from "../../artifacts/api-server/src/app";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return app(req as any, res as any);
}
