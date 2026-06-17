import { logger } from "./logger";

// Brevo transactional email via the v3 REST API (template-based).
// Replaces inline-HTML SMTP for notification emails. Uses the numbered Brevo
// templates uploaded from Navneet's set; the dynamic values are passed as
// `params` and the recipient's first name is synced onto the Brevo contact so
// the templates' {{ contact.FIRSTNAME }} merge tag resolves.
//
// NOTE: the API enforces Brevo's authorised-IP allowlist — the production
// server IP must be allowlisted or sends return 401.

const API_BASE = "https://api.brevo.com/v3";

function apiKey(): string | undefined {
  return process.env["BREVO_API_KEY"];
}

async function brevoFetch(path: string, body: unknown): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "api-key": apiKey() as string,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
}

/**
 * Upsert a Brevo contact so {{ contact.FIRSTNAME }} resolves in templates.
 * Best-effort: never throws (createContact with updateEnabled is idempotent).
 */
async function ensureContact(email: string, firstName?: string): Promise<void> {
  if (!firstName) return;
  try {
    const res = await brevoFetch("/contacts", {
      email,
      attributes: { FIRSTNAME: firstName },
      updateEnabled: true,
    });
    if (!res.ok && res.status !== 204) {
      const txt = await res.text().catch(() => "");
      logger.debug({ status: res.status, txt }, "Brevo ensureContact non-OK");
    }
  } catch (err) {
    logger.debug({ err }, "Brevo ensureContact failed");
  }
}

export interface BrevoTemplateEmail {
  templateId: number;
  to: string;
  firstName?: string;
  /** Values for the template's {{ params.* }} tags. */
  params?: Record<string, string | number | null | undefined>;
  /** Overrides the template's stored subject (set to placeholder at upload). */
  subject?: string;
}

/**
 * Send one transactional template email. Throws on failure so the caller's
 * `.catch` can log it — callers MUST invoke this fire-and-forget (void + catch)
 * so a mail failure never blocks or breaks the notification flow.
 */
export async function sendBrevoTemplateEmail(input: BrevoTemplateEmail): Promise<void> {
  if (!apiKey()) {
    logger.warn({ templateId: input.templateId }, "BREVO_API_KEY not set — skipping email");
    return;
  }

  await ensureContact(input.to, input.firstName);

  const params: Record<string, string | number> = {};
  if (input.params) {
    for (const [k, v] of Object.entries(input.params)) {
      if (v !== undefined && v !== null) params[k] = v;
    }
  }

  const body: Record<string, unknown> = {
    to: [{ email: input.to, ...(input.firstName ? { name: input.firstName } : {}) }],
    templateId: input.templateId,
  };
  if (Object.keys(params).length) body["params"] = params;
  if (input.subject) body["subject"] = input.subject;

  const res = await brevoFetch("/smtp/email", body);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Brevo send failed (${res.status}) template ${input.templateId}: ${txt}`);
  }
}
