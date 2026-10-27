import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { uploadPublic, getSignedUploadUrl, tryDeleteByStoredPath } from "../lib/storage";

const router: IRouter = Router();

const ALLOWED_IMAGE = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const ALLOWED_MEDIA = new Set([
  ...ALLOWED_IMAGE,
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

// Images only — 5 MB cap
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED_IMAGE.has(file.mimetype)),
});

// Images + short videos — 25 MB cap (hero media cards, etc.)
const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED_MEDIA.has(file.mimetype)),
});

function extFor(mimetype: string): string {
  switch (mimetype) {
    case "image/png": return "png";
    case "image/webp": return "webp";
    case "video/mp4": return "mp4";
    case "video/webm": return "webm";
    case "video/quicktime": return "mov";
    default: return "jpg";
  }
}

router.post(
  "/uploads/image",
  imageUpload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }
    try {
      const objectPath = await uploadPublic({
        key: `uploads-image/${randomUUID()}.${extFor(req.file.mimetype)}`,
        body: req.file.buffer,
        contentType: req.file.mimetype,
      });
      res.json({ objectPath });
    } catch (error) {
      req.log.error({ err: error }, "Image upload failed");
      res.status(500).json({ error: "Upload failed" });
    }
  }
);

router.post(
  "/uploads/media",
  mediaUpload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }
    try {
      const isVideo = req.file.mimetype.startsWith("video/");
      const folder = isVideo ? "uploads-video" : "uploads-image";
      const objectPath = await uploadPublic({
        key: `${folder}/${randomUUID()}.${extFor(req.file.mimetype)}`,
        body: req.file.buffer,
        contentType: req.file.mimetype,
      });
      res.json({ objectPath });
    } catch (error) {
      req.log.error({ err: error }, "Media upload failed");
      res.status(500).json({ error: "Upload failed" });
    }
  }
);

// ── Hero-banner VIDEO: direct-to-storage, zero VPS load ──────────────────────
// Videos never flow through Node. The browser asks for a short-lived presigned
// PUT and streams the file STRAIGHT to object storage; playback later streams
// straight from storage too. We only hand out the URL here, after guarding the
// type (MP4/H.264) and the 50 MB cap so the VPS carries nothing heavy.
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const ALLOWED_VIDEO = new Set(["video/mp4"]);

router.post(
  "/uploads/banner-video-url",
  async (req: Request, res: Response): Promise<void> => {
    const contentType = String(req.body?.contentType ?? "");
    const size = Number(req.body?.size);
    if (!ALLOWED_VIDEO.has(contentType)) {
      res.status(400).json({ error: "Only MP4 (H.264) video is allowed" });
      return;
    }
    if (!Number.isFinite(size) || size <= 0 || size > MAX_VIDEO_BYTES) {
      res.status(400).json({ error: "Video must be 50 MB or smaller" });
      return;
    }
    try {
      const { uploadURL, objectPath } = await getSignedUploadUrl({
        key: `banner-video/${randomUUID()}.mp4`,
        contentType,
        visibility: "public",
      });
      res.json({ uploadURL, objectPath });
    } catch (error) {
      req.log.error({ err: error }, "Banner video presign failed");
      res.status(500).json({ error: "Could not start the upload" });
    }
  }
);

// Best-effort purge of a replaced/removed banner video + its poster, so storage
// never accumulates orphans. Scoped to banner-media key prefixes so this open
// endpoint can't be used to delete arbitrary public objects. Fire-and-forget,
// exactly like the ad-delete purge — the caller never needs the outcome.
const PURGEABLE_PREFIXES = ["banner-video/", "uploads-image/"];

router.post(
  "/uploads/banner-media/purge",
  (req: Request, res: Response): void => {
    const raw = Array.isArray(req.body?.urls) ? req.body.urls : [];
    for (const entry of raw.slice(0, 10)) {
      const url = typeof entry === "string" ? entry : "";
      if (!url) continue;
      // Derive the object key (strip scheme + host) and only purge banner media.
      const key = url.split("/").slice(3).join("/");
      if (!PURGEABLE_PREFIXES.some((p) => key.startsWith(p))) continue;
      void tryDeleteByStoredPath(url);
    }
    res.json({ ok: true });
  }
);

export default router;
