import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "crypto";
import { pool } from "@workspace/db";

/**
 * Scripted (menu/decision-tree) chatbot configs — one per audience (brand /
 * creator) — stored as JSON in PlatformConfig (keys chatbot_brand / chatbot_creator).
 *
 *   GET/PUT /admin/chatbot/:audience  — admin, gated by adminGuard (section "chatbot")
 *   GET     /chatbot/:audience        — PUBLIC, returns the safe display config
 *
 * No AI: the widget only renders admin-authored questions/answers/options. Answers
 * never contain links — URLs are stripped server-side on save.
 */

const router: IRouter = Router();

export interface ChatNode {
  id: string;
  question: string;   // the button label
  answer: string;     // the bot's reply
  children: ChatNode[];
}
export interface ChatbotConfig {
  enabled: boolean;
  botName: string;
  welcomeMessage: string;
  tree: ChatNode[];
}

const DEFAULTS: ChatbotConfig = {
  enabled: false,
  botName: "Radhika from Collabry",
  welcomeMessage: "Hi! 👋 I'm Radhika from Collabry. What can I help you with today?",
  tree: [],
};

const MAX_DEPTH = 12;

function isAudience(v: string): v is "brand" | "creator" {
  return v === "brand" || v === "creator";
}
const keyFor = (a: "brand" | "creator") => `chatbot_${a}`;

/** Remove anything that reads as a link; keep the visible text of markdown links. */
function stripLinks(s: unknown): string {
  if (typeof s !== "string") return "";
  return s
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/www\.\S+/gi, "")
    .replace(/\b[a-z0-9.-]+\.(?:com|in|co|org|net|io|app|dev)\b\S*/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function sanitizeNode(n: any, depth: number): ChatNode | null {
  if (!n || typeof n !== "object" || depth > MAX_DEPTH) return null;
  const question = stripLinks(n.question).slice(0, 200);
  if (!question) return null; // a menu option must have a label
  const answer = stripLinks(n.answer).slice(0, 2000);
  const id = typeof n.id === "string" && n.id.trim() ? n.id.trim().slice(0, 64) : crypto.randomUUID();
  const children = Array.isArray(n.children)
    ? (n.children.map((c: any) => sanitizeNode(c, depth + 1)).filter(Boolean) as ChatNode[])
    : [];
  return { id, question, answer, children };
}

function sanitizeConfig(raw: any): ChatbotConfig {
  const r = raw && typeof raw === "object" ? raw : {};
  const botName = (typeof r.botName === "string" && r.botName.trim() ? r.botName : DEFAULTS.botName).slice(0, 80);
  const welcomeMessage = (stripLinks(r.welcomeMessage) || DEFAULTS.welcomeMessage).slice(0, 2000);
  const tree = Array.isArray(r.tree)
    ? (r.tree.map((n: any) => sanitizeNode(n, 0)).filter(Boolean) as ChatNode[])
    : [];
  return { enabled: !!r.enabled, botName, welcomeMessage, tree };
}

async function getConfig(audience: "brand" | "creator"): Promise<ChatbotConfig> {
  const r = await pool.query(`SELECT value FROM "PlatformConfig" WHERE key=$1`, [keyFor(audience)]);
  if (r.rows.length === 0) return { ...DEFAULTS };
  try {
    return sanitizeConfig(JSON.parse(r.rows[0].value));
  } catch {
    return { ...DEFAULTS };
  }
}

// ── Admin: read config (gated by adminGuard → section "chatbot") ──
router.get("/admin/chatbot/:audience", async (req: Request, res: Response): Promise<void> => {
  const a = String(req.params["audience"]);
  if (!isAudience(a)) { res.status(400).json({ error: "audience must be brand or creator" }); return; }
  res.json(await getConfig(a));
});

// ── Admin: save config ──
router.put("/admin/chatbot/:audience", async (req: Request, res: Response): Promise<void> => {
  const a = String(req.params["audience"]);
  if (!isAudience(a)) { res.status(400).json({ error: "audience must be brand or creator" }); return; }
  const clean = sanitizeConfig(req.body);
  await pool.query(
    `INSERT INTO "PlatformConfig" (id,key,value,description,"updatedAt")
     VALUES (gen_random_uuid(),$1,$2,''::text,NOW())
     ON CONFLICT (key) DO UPDATE SET value=$2,"updatedAt"=NOW()`,
    [keyFor(a), JSON.stringify(clean)]
  );
  res.json({ ok: true, config: clean });
});

// ── Public: safe display config for the widget (unauthenticated) ──
router.get("/chatbot/:audience", async (req: Request, res: Response): Promise<void> => {
  const a = String(req.params["audience"]);
  if (!isAudience(a)) { res.status(400).json({ error: "audience must be brand or creator" }); return; }
  const cfg = await getConfig(a);
  res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
  // Only the display fields — exactly the ChatbotConfig shape, nothing sensitive.
  res.json({ enabled: cfg.enabled, botName: cfg.botName, welcomeMessage: cfg.welcomeMessage, tree: cfg.tree });
});

export default router;
