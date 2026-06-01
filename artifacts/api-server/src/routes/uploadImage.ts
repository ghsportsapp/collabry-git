import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { uploadPublic } from "../lib/storage";

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

export default router;
