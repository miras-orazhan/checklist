/**
 * Vercel serverless function — entry point for all /api/* requests.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

// Lazy-load the app to avoid cold-start issues
let _app: any = null;

async function getApp() {
  if (!_app) {
    // Dynamic import of the pre-built bundle
      // Dynamic import of the pre-built bundle
      // Type is unknown because the file is generated during the build.
      // @ts-ignore
    const mod = await import("./_app.mjs");
    _app = mod.default;
  }
  return _app;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const app = await getApp();
  return app(req as any, res as any);
}