/**
 * Vercel serverless function — entry point for all /api/* requests.
 *
 * Imports the pre-built Express app bundle (api/_app.mjs). The bundle is
 * created by scripts/build-api-bundle.mjs during the Vercel build step.
 *
 * This file is kept minimal to avoid Vercel's TypeScript compilation issues
 * with workspace dependencies, top-level await, and complex imports.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

// Lazy-load the app to avoid cold-start issues
let _app: any = null;

async function getApp() {
  if (!_app) {
    // Dynamic import of the pre-built bundle
    const mod = await import("./_app.mjs");
    _app = mod.default;
  }
  return _app;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const app = await getApp();
  return app(req as any, res as any);
}
