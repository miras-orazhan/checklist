import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

// PORT is optional — defaults to 3000 for local dev.
// In production (Vercel) this is ignored — Vite just builds static files.
const rawPort = process.env.PORT ?? '3000';
const port = Number(rawPort);

const basePath = process.env.BASE_PATH ?? '/';

// Backend API URL for the dev-server proxy. The Express API server runs on
// port 5000 by default (see artifacts/api-server/src/index.ts).
// In production, /api/* is handled by Vercel serverless functions on the same
// origin, so no proxy is needed.
const apiUrl = process.env.VITE_API_URL ?? 'http://127.0.0.1:5000';

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    // Replit cartographer + dev banner only load when REPL_ID is set —
    // they're no-ops in production / local dev.
    ...(process.env.NODE_ENV !== 'production' && process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
    // Production optimizations
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-select', '@radix-ui/react-dropdown-menu'],
          'query-vendor': ['@tanstack/react-query'],
          'form-vendor': ['react-hook-form', '@hookform/resolvers', 'zod'],
        },
      },
    },
  },
  server: {
    port,
    strictPort: false,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      // Forward /api/* requests to the Express backend during development.
      '/api': {
        target: apiUrl,
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
