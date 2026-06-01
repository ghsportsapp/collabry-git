import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { z } from "zod";
import { requireCreator } from "../middleware/requireCreator";
import { uploadPrivate } from "../lib/storage";

const router: IRouter = Router();

const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    cb(null, ALLOWED_MIMES.has(file.mimetype));
  },
});

const PREFIX_ALLOWLIST = new Set([
  "kyc",
  "product-issue",
  "deal-evidence",
]);

const BodySchema = z.object({
  prefix: z.string().min(1).max(40),
});

function extFor(mimetype: string): string {
  if (mimetype === "application/pdf") return "pdf";
  if (mimetype === "image/png") return "png";
  if (mimetype === "image/webp") return "webp";
  return "jpg";
}

/**
 * Private file upload — images or PDFs to the private bucket.
 * Returns `{ objectPath }` where objectPath is `/api/storage/private/<key>`,
 * a URL that the storage route resolves to a short-lived signed URL on each
 * request. Caller stores objectPath in the DB and uses it as a plain URL.
 */
router.post(
  "/uploads/private",
  requireCreator,
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Missing or invalid 'prefix'" });
      return;
    }
    const prefix = parsed.data.prefix;
    if (!PREFIX_ALLOWLIST.has(prefix)) {
      res.status(400).json({ error: "Invalid prefix" });
      return;
    }

    try {
      const ext = extFor(req.file.mimetype);
      const objectPath = await uploadPrivate({
        key: `${prefix}/${randomUUID()}.${ext}`,
        body: req.file.buffer,
        contentType: req.file.mimetype,
      });
      res.json({ objectPath });
    } catch (error) {
      req.log.error({ err: error }, "Private file upload failed");
      res.status(500).json({ error: "Upload failed" });
    }
  }
);

export default router;
