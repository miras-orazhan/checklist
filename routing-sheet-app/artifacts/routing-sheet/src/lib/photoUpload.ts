/**
 * Client-side photo compression — runs before upload to keep bandwidth low
 * and ensure consistent image dimensions across the app.
 *
 * Strategy:
 *   1. Read the File into an HTMLImageElement
 *   2. Scale down to fit within MAX_DIMENSION (default 1024px) preserving
 *      aspect ratio — never upscales
 *   3. Re-encode as JPEG at the given quality (default 0.85, ~85%)
 *   4. Return a new File ready for upload
 *
 * Falls back gracefully:
 *   - If the input is already small, returns the original File unchanged
 *   - If the input is not an image or Canvas is unavailable, returns the
 *     original File (server will accept it as-is)
 *
 * Usage:
 *   const compressed = await compressPhoto(file);
 *   await fetch('/api/photos/upload', { method: 'POST', body: compressed, ... });
 */

const MAX_DIMENSION = 1024;
const JPEG_QUALITY = 0.85;

export async function compressPhoto(
  file: File,
  opts: { maxDimension?: number; quality?: number } = {},
): Promise<File> {
  const maxDimension = opts.maxDimension ?? MAX_DIMENSION;
  const quality = opts.quality ?? JPEG_QUALITY;

  // Only process image files
  if (!file.type.startsWith('image/')) {
    return file;
  }

  // For PNG/GIF/WebP we still convert to JPEG for consistent storage.
  // (PNGs with transparency will get a white background — see fillRect below.)

  try {
    // Read the file into an image element
    const dataUrl = await readFileAsDataUrl(file);
    const img = await loadImage(dataUrl);

    // If the image is already small enough AND it's already JPEG, skip compression
    if (
      img.width <= maxDimension &&
      img.height <= maxDimension &&
      file.type === 'image/jpeg'
    ) {
      return file;
    }

    // Compute target dimensions — preserve aspect ratio, never upscale
    let targetWidth = img.width;
    let targetHeight = img.height;
    if (img.width > maxDimension || img.height > maxDimension) {
      const scale = Math.min(maxDimension / img.width, maxDimension / img.height);
      targetWidth = Math.round(img.width * scale);
      targetHeight = Math.round(img.height * scale);
    }

    // Draw onto a canvas
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    // White background (in case the source has transparency)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);

    // Draw the image scaled
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    // Re-encode as JPEG
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    if (!blob) return file;

    // Generate filename — replace extension with .jpg
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
  } catch {
    // Any error → return the original file, server will handle it
    return file;
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

/**
 * Upload a photo to the server with client-side compression first.
 * Returns the public URL of the stored photo (e.g. "/api/photos/abc123.jpg").
 */
export async function uploadPhoto(
  file: File,
  authToken: string | null,
): Promise<string> {
  const compressed = await compressPhoto(file);

  const headers: Record<string, string> = {
    'Content-Type': compressed.type,
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const resp = await fetch('/api/photos/upload', {
    method: 'POST',
    headers,
    body: compressed,
  });

  if (!resp.ok) {
    let errMessage = `HTTP ${resp.status}`;
    try {
      const errBody = await resp.json();
      errMessage = errBody.error || errMessage;
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(errMessage);
  }

  const data = await resp.json();
  return data.url as string;
}
