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

globalThis.require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

/**
 * esbuild plugin to resolve pnpm workspace packages.
 *
 * pnpm workspace packages use "workspace:*" protocol in package.json which
 * esbuild doesn't understand. This plugin resolves them to their actual
 * filesystem paths.
 */
const workspaceResolver = {
  name: "workspace-resolver",
  setup(build) {
    // @workspace/db → lib/db/src/index.ts
    build.onResolve({ filter: /^@workspace\/db$/ }, () => ({
      path: path.resolve(rootDir, "lib/db/src/index.ts"),
    }));

    // @workspace/api-zod → lib/api-zod/src/index.ts
    build.onResolve({ filter: /^@workspace\/api-zod$/ }, () => ({
      path: path.resolve(rootDir, "lib/api-zod/src/index.ts"),
    }));

    // @workspace/api-client-react → lib/api-client-react/src/index.ts
    build.onResolve({ filter: /^@workspace\/api-client-react$/ }, () => ({
      path: path.resolve(rootDir, "lib/api-client-react/src/index.ts"),
    }));

    // Handle subpath imports like @workspace/db/schema
    build.onResolve({ filter: /^@workspace\/db\// }, (args) => {
      const subpath = args.path.replace(/^@workspace\/db\//, "");
      return {
        path: path.resolve(rootDir, "lib/db/src", subpath),
      };
    });

    build.onResolve({ filter: /^@workspace\/api-zod\// }, (args) => {
      const subpath = args.path.replace(/^@workspace\/api-zod\//, "");
      return {
        path: path.resolve(rootDir, "lib/api-zod/src", subpath),
      };
    });

    build.onResolve({ filter: /^@workspace\/api-client-react\// }, (args) => {
      const subpath = args.path.replace(/^@workspace\/api-client-react\//, "");
      return {
        path: path.resolve(rootDir, "lib/api-client-react/src", subpath),
      };
    });
  },
};

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
    plugins: [workspaceResolver],
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
