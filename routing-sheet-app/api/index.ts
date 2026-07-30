/**
 * Vercel serverless function — catches all /api/* routes and forwards them
 * to the Express app.
 *
 * Vercel automatically deploys files in /api as serverless functions.
 * The [...path] catch-all syntax matches any path under /api.
 *
 * The Express app (from artifacts/api-server/src/app.ts) is imported and
 * wrapped as a Vercel handler. Express 5 works natively with the
 * (req, res) signature that Vercel expects.
 *
 * Note: Express app.listen() is NOT called here — Vercel manages the HTTP
 * server. We only export the app's request handler.
 */

// Load env first — Vercel injects env vars, but for local dev with .env file
// we need to load it manually. In production Vercel this is a no-op.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import app from "../artifacts/api-server/src/app";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Express 5 app is a function that takes (req, res) — exactly what Vercel
  // expects. We just pass through.
  return app(req as any, res as any);
}
