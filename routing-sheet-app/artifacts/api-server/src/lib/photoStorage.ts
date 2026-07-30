/**
 * Photo storage — abstracts over two backends:
 *
 *   1. Vercel Blob (production) — cloud object storage, persistent across
 *      serverless invocations. Requires BLOB_READ_WRITE_TOKEN env var.
 *      Docs: https://vercel.com/docs/storage/vercel-blob
 *
 *   2. Local filesystem (development) — photos saved to PHOTOS_DIR on disk.
 *      Used when BLOB_READ_WRITE_TOKEN is not set.
 *
 * Both backends expose the same interface:
 *   savePhoto(buffer, ext) → public URL
 *   readPhoto(filename) → { buffer, fullPath } | null  (local only)
 *
 * In production, the URL returned by savePhoto() is a Vercel Blob CDN URL
 * (https://<hash>.public.blob.vercel-storage.com/...) that can be used
 * directly in <img src="..."> tags.
 */

import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

const PHOTOS_DIR = process.env.PHOTOS_DIR ?? "/home/z/my-project/db/photos";
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

const isProduction = !!BLOB_TOKEN;

// ─── Local filesystem (development) ──────────────────────────────────────────

async function ensurePhotosDir(): Promise<void> {
  await fs.mkdir(PHOTOS_DIR, { recursive: true });
}

async function savePhotoLocal(
  buffer: Buffer,
  extension: string,
): Promise<string> {
  await ensurePhotosDir();
  const filename = `${crypto.randomUUID()}${extension}`;
  const fullPath = path.join(PHOTOS_DIR, filename);
  await fs.writeFile(fullPath, buffer);
  // Return the public URL path — served by /api/photos/:filename route
  return `/api/photos/${filename}`;
}

async function readPhotoLocal(
  filename: string,
): Promise<{ buffer: Buffer; fullPath: string } | null> {
  // Sanitize — prevent path traversal
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
    return null;
  }
  const fullPath = path.join(PHOTOS_DIR, filename);
  try {
    const buffer = await fs.readFile(fullPath);
    return { buffer, fullPath };
  } catch {
    return null;
  }
}

// ─── Vercel Blob (production) ────────────────────────────────────────────────

async function savePhotoBlob(
  buffer: Buffer,
  extension: string,
): Promise<string> {
  // Dynamic import — @vercel/blob is only available in Vercel environment
  const { put } = await import("@vercel/blob");

  const filename = `${crypto.randomUUID()}${extension}`;
  const blob = await put(`photos/${filename}`, buffer, {
    access: "public",
    token: BLOB_TOKEN,
    contentType: getContentType(extension),
  });

  // Return the Vercel Blob CDN URL — directly usable in <img src="...">
  return blob.url;
}

function getContentType(ext: string): string {
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };
  return map[ext.toLowerCase()] ?? "application/octet-stream";
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Save a photo and return a public URL that can be stored in DB columns
 * and used directly in <img src="..."> tags.
 *
 * - Production (BLOB_READ_WRITE_TOKEN set): uploads to Vercel Blob,
 *   returns https://<hash>.public.blob.vercel-storage.com/...
 * - Development: saves to local disk, returns /api/photos/<uuid>.jpg
 */
export async function savePhoto(
  buffer: Buffer,
  extension: string = ".jpg",
): Promise<string> {
  if (isProduction) {
    return savePhotoBlob(buffer, extension);
  }
  return savePhotoLocal(buffer, extension);
}

/**
 * Read a photo file from local disk (development only).
 * Returns null in production — photos are served directly by Vercel Blob CDN.
 */
export async function readPhoto(
  filename: string,
): Promise<{ buffer: Buffer; fullPath: string } | null> {
  if (isProduction) {
    // In production, photos are served directly by Vercel Blob CDN.
    // The /api/photos/:filename route should redirect to the blob URL,
    // but since we store full URLs in DB, this is rarely called.
    return null;
  }
  return readPhotoLocal(filename);
}

/** Delete a photo. In production, this would call Vercel Blob del(). */
export async function deletePhoto(photoUrl: string): Promise<void> {
  if (isProduction) {
    // Vercel Blob delete — uncomment when needed
    // const { del } = await import("@vercel/blob");
    // await del(photoUrl, { token: BLOB_TOKEN });
    return;
  }
  // Local: delete file
  const filename = photoUrl.split("/").pop();
  if (!filename || !/^[a-zA-Z0-9._-]+$/.test(filename)) return;
  const fullPath = path.join(PHOTOS_DIR, filename);
  try {
    await fs.unlink(fullPath);
  } catch {
    // ignore — file may not exist
  }
}

export { isProduction as isUsingBlobStorage };
