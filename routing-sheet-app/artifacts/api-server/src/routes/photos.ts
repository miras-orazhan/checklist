/**
 * Photo upload + public serving.
 *
 *   POST /api/photos/upload   (auth required, multipart/form-data)
 *        Body:  file = <binary image>
 *        Returns: { url: "/api/photos/<uuid>.jpg" }
 *
 *   GET  /api/photos/:filename  (PUBLIC — no auth)
 *        Returns the image binary with correct Content-Type.
 *
 * Notes:
 *   - Photos are stored on local disk under PHOTOS_DIR (see lib/photoStorage).
 *   - The frontend compresses images BEFORE upload (see compressPhoto() in
 *     the React components) so the server just stores whatever it receives.
 *   - We still cap upload size at 10 MB as a safety net against malicious
 *     large uploads that bypassed client-side compression.
 *   - Read is public so photos can be embedded in <img src="..."> tags without
 *     bearer tokens — this is intentional: all internal staff must be able to
 *     see candidate/doctor photos, and the URLs are unguessable UUIDs.
 */
import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middlewares/auth";
import { savePhoto, readPhoto } from "../lib/photoStorage";

export const photosRouter: Router = Router();

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const MIME_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

// POST /photos/upload — accepts a single file as multipart/form-data
photosRouter.post(
  "/photos/upload",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Express doesn't parse multipart bodies by default — we read the raw
      // body and treat it as the image bytes. The Content-Type header tells
      // us the image format.
      //
      // Frontend is expected to send the file directly as the request body
      // (not as multipart form-data) with the correct Content-Type. This
      // keeps the upload code trivial on both sides.
      const contentType = (req.headers["content-type"] ?? "").toLowerCase();
      const ext = EXTENSION_BY_MIME[contentType];
      if (!ext) {
        res.status(400).json({
          error: `Unsupported content type: ${contentType}. Use image/jpeg, image/png, image/webp, or image/gif.`,
        });
        return;
      }

      // Collect the raw body into a Buffer
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      for await (const chunk of req) {
        totalBytes += chunk.length;
        if (totalBytes > MAX_UPLOAD_BYTES) {
          res.status(413).json({ error: "File too large (max 10 MB)" });
          return;
        }
        chunks.push(Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);
      if (buffer.length === 0) {
        res.status(400).json({ error: "Empty body — no file received" });
        return;
      }

      const url = await savePhoto(buffer, ext);
      res.status(201).json({ url });
    } catch (err: any) {
      req.log.error({ err }, "[photos] upload failed");
      res.status(500).json({ error: "Failed to upload photo" });
    }
  },
);

// GET /photos/:filename — PUBLIC (no auth), serves the image binary
photosRouter.get(
  "/photos/:filename",
  async (req: Request, res: Response): Promise<void> => {
    const filename = req.params.filename;
    const result = await readPhoto(filename);
    if (!result) {
      res.status(404).json({ error: "Photo not found" });
      return;
    }

    // Determine Content-Type from extension
    const ext = filename.toLowerCase().match(/\.[a-z]+$/)?.[0] ?? "";
    const mime = MIME_BY_EXTENSION[ext] ?? "application/octet-stream";

    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Length", result.buffer.length.toString());
    // Allow browser caching — photos are immutable (UUIDs never reused)
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    // Allow cross-origin image loading (in case frontend is on a different origin)
    res.setHeader("Access-Control-Allow-Origin", "*");
    // Content-Disposition: inline (so <img> tags work; for download links the
    // frontend adds ?download=1 which we honor below)
    const wantsDownload = req.query["download"] !== undefined;
    if (wantsDownload) {
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
    } else {
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    }

    res.end(result.buffer);
  },
);

export default photosRouter;
