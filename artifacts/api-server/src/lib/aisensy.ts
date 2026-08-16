import { logger } from "./logger";

// AiSensy WhatsApp Business API — campaign sends.
//
// Mirrors brevoEmail.ts: a thin transport that throws on failure, invoked
// fire-and-forget from notifications.ts so a WhatsApp problem can never block
// or break the notification itself.
//
// Every campaign must already exist in the AiSensy dashboard and be in "Live"
// status; `campaignName` is the only thing that varies between sends. The
// approved WhatsApp template behind each campaign fixes how many params it
// takes — see whatsappCampaigns.ts.

const API_URL = "https://backend.aisensy.com/campaign/t1/api/v2";
const TIMEOUT_MS = 10_000;
const DEFAULT_DIAL_CODE = "91";

function apiKey(): string | undefined {
  return process.env["AISENSY_API_KEY"];
}

/**
 * Sends require BOTH the key and an explicit opt-in flag. Two switches, so a
 * deploy that merely carries the key in its env can't start messaging real
 * users before the campaigns have been verified end-to-end.
 */
export function isWhatsAppEnabled(): boolean {
  return process.env["AISENSY_ENABLED"] === "true" && !!apiKey();
}

/**
 * Signup stores bare 10-digit numbers — creatorAuth.ts strips a leading 91 or
 * 0 before insert — but AiSensy wants the dial code included. Anything that
 * isn't plausibly dialable returns null so we skip the send rather than
 * message a mangled number.
 */
export function toWhatsAppNumber(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 10) return DEFAULT_DIAL_CODE + digits;
  if (digits.length === 11 && digits.startsWith("0")) return DEFAULT_DIAL_CODE + digits.slice(1);
  if (digits.length === 12 && digits.startsWith(DEFAULT_DIAL_CODE)) return digits;
  // Already carries some other dial code.
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

export interface WhatsAppSend {
  /** Must match a Live campaign in AiSensy exactly — sends fail if it drifts. */
  campaignName: string;
  /** Dial code + number, no "+". Use toWhatsAppNumber(). */
  destination: string;
  userName: string;
  /** Length must equal the approved template's param count. */
  templateParams: string[];
  source?: string;
}

/**
 * Send one campaign message. Returns AiSensy's submitted_message_id for
 * tracing, or null if the API key isn't configured.
 *
 * Throws on any failure so the caller's `.catch` logs it — callers MUST invoke
 * this fire-and-forget (void + catch).
 */
export async function sendWhatsApp(input: WhatsAppSend): Promise<string | null> {
  const key = apiKey();
  if (!key) {
    logger.warn({ campaignName: input.campaignName }, "AISENSY_API_KEY not set — skipping WhatsApp");
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: key,
        campaignName: input.campaignName,
        destination: input.destination,
        userName: input.userName,
        templateParams: input.templateParams,
        source: input.source ?? "collabry-backend",
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`AiSensy send failed (${res.status}) campaign ${input.campaignName}: ${text}`);
  }

  // A rejected send still comes back 200 — the verdict is in the body, and
  // `success` is the STRING "true", not a boolean, so compare it as one.
  let body: { success?: unknown; submitted_message_id?: unknown } = {};
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    throw new Error(`AiSensy returned non-JSON for campaign ${input.campaignName}: ${text}`);
  }
  if (String(body.success) !== "true") {
    throw new Error(`AiSensy rejected campaign ${input.campaignName}: ${text}`);
  }
  return typeof body.submitted_message_id === "string" ? body.submitted_message_id : null;
}
