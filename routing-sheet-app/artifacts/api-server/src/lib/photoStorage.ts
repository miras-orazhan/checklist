/**
 * Local file-based photo storage — replaces the Replit Google Cloud Storage
 * objectStorageService in environments where the Replit sidecar isn't
 * available.
 *
 * Photos are stored as JPEG files under PHOTOS_DIR (default:
 * /home/z/my-project/db/photos) and served publicly via
 *   GET /api/photos/:filename
 *
 * Upload is restricted to authenticated users (any role) — see routes/photos.ts.
 * Read is fully public so that:
 *   - candidate photos are visible to all staff on the candidate detail page
 *   - doctor photos are visible to chief_physician + account_manager on the
 *     doctor-profile page
 *   - photos can be embedded directly in <img src="..."> tags without bearer
 *     tokens
 */
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

const PHOTOS_DIR = process.env.PHOTOS_DIR ?? "/home/z/my-project/db/photos";

/** Ensure the photos directory exists. Safe to call multiple times. */
export async function ensurePhotosDir(): Promise<void> {
  await fs.mkdir(PHOTOS_DIR, { recursive: true });
}

/**
 * Persist a raw photo buffer to disk under a random filename.
 * Returns the public path that can be stored in `photoUrl` columns and used
 * directly in <img src="..."> — clients prepend their API base URL themselves.
 *
 * @returns e.g. "/api/photos/abc123.jpg"
 */
export async function savePhoto(
  buffer: Buffer,
  extension: string = ".jpg",
): Promise<string> {
  await ensurePhotosDir();
  const filename = `${crypto.randomUUID()}${extension}`;
  const fullPath = path.join(PHOTOS_DIR, filename);
  await fs.writeFile(fullPath, buffer);
  // Return the public URL path (NOT the filesystem path) — this is what gets
  // stored in DB columns like routing_steps.photo_url and doctor_profiles.photo_url.
  return `/api/photos/${filename}`;
}

/** Read a photo file from disk. Returns null if it doesn't exist. */
export async function readPhoto(
  filename: string,
): Promise<{ buffer: Buffer; fullPath: string } | null> {
  // Sanitize the filename — only allow alphanumeric + dash + dot to prevent
  // path traversal attacks (e.g. "../../etc/passwd")
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

/** Delete a photo file from disk. Silently succeeds if it doesn't exist. */
export async function deletePhoto(photoUrl: string): Promise<void> {
  // photoUrl looks like "/api/photos/abc123.jpg" — extract the filename
  const filename = photoUrl.split("/").pop();
  if (!filename || !/^[a-zA-Z0-9._-]+$/.test(filename)) return;
  const fullPath = path.join(PHOTOS_DIR, filename);
  try {
    await fs.unlink(fullPath);
  } catch {
    // ignore — file may not exist
  }
}
