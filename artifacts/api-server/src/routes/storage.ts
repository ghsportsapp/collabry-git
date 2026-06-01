import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import {
  getSignedUploadUrl,
  getSignedDownloadUrl,
} from "../lib/storage";

const router: IRouter = Router();

const RequestUploadUrlBody = z.object({
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
  contentType: z.string().min(1),
  visibility: z.enum(["public", "private"]).default("public"),
  prefix: z.string().optional(),
});

router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }
  try {
    const { contentType, visibility, prefix } = parsed.data;
    const cleanPrefix = (prefix ?? "uploads").replace(/^\/+|\/+$/g, "");
    const key = `${cleanPrefix}/${randomUUID()}`;
    const { uploadURL, objectPath } = await getSignedUploadUrl({
      key,
      contentType,
      visibility,
    });
    res.json({ uploadURL, objectPath });
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

// Resolves a private object reference by issuing a short-lived signed URL
// and redirecting the browser to it. Lets us treat private files like
// regular URLs in DB rows / image tags without re-signing on every render.
router.get("/storage/private/*key", async (req: Request, res: Response) => {
  try {
    const raw = req.params.key as unknown;
    const key = Array.isArray(raw) ? raw.join("/") : (raw as string);
    if (!key) {
      res.status(400).json({ error: "Missing key" });
      return;
    }
    const url = await getSignedDownloadUrl(key, 60 * 5);
    res.redirect(302, url);
  } catch (error) {
    req.log.error({ err: error }, "Error signing private object URL");
    res.status(500).json({ error: "Failed to serve private object" });
  }
});

export default router;
