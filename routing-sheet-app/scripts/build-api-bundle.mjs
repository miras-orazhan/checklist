/**
 * Build script for Vercel deployment.
 *
 * Bundles the Express API server into a single ESM file at api/_app.mjs
 * using esbuild. This avoids Vercel's TypeScript compilation issues with
 * workspace dependencies and top-level await.
 *
 * The Vercel serverless function (api/index.ts) imports this bundle.
 *
 * Run: node scripts/build-api-bundle.mjs
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import { rm } from "node:fs/promises";

globalThis.require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

async function buildApiBundle() {
  const outFile = path.resolve(rootDir, "api", "_app.mjs");

  console.log("Building API bundle for Vercel...");

  await esbuild({
    entryPoints: [path.resolve(rootDir, "artifacts/api-server/src/app.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outfile: outFile,
    logLevel: "info",
    // External packages that shouldn't be bundled (native, optional, or
    // runtime-provided by Vercel)
    external: [
      "*.node",
      "sharp",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "lightningcss",
      "pg-native",
      "@electric-sql/pglite",
      "@vercel/blob",
      // Node built-ins
      "fs",
      "path",
      "crypto",
      "stream",
      "http",
      "https",
      "url",
      "os",
      "util",
      "querystring",
      "zlib",
    ],
    sourcemap: false,
    banner: {
      js: `import { createRequire as __crReq } from 'node:module';
import __path from 'node:path';
import __url from 'node:url';
globalThis.require = __crReq(import.meta.url);
globalThis.__filename = __url.fileURLToPath(import.meta.url);
globalThis.__dirname = __path.dirname(globalThis.__filename);
`,
    },
  });

  console.log("✓ API bundle built at api/_app.mjs");
}

buildApiBundle().catch((err) => {
  console.error(err);
  process.exit(1);
});
