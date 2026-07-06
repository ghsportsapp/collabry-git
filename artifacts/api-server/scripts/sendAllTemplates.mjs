#!/usr/bin/env node
// Fire every Brevo template (IDs 1..79) at one email so you can visually QA them.
//
// Usage:
//   BREVO_API_KEY=... node scripts/sendAllTemplates.mjs <email> [firstName]
//
// Each send passes a superset params object covering every {{ params.* }}
// tag currently referenced across brevoTemplates.ts. Templates simply ignore
// keys they don't use. Subjects are overridden with "[TEST N] <label>" so
// they're easy to sort/delete afterwards.
//
// NOTE: Brevo requires the source IP to be on your account's authorised list.
// If sends 401, add this machine's IP under Brevo → SMTP & API → Authorised IPs.

const API_BASE = "https://api.brevo.com/v3";
const TO = process.argv[2];
const FIRST_NAME = process.argv[3] || "Shahed";

if (!TO) {
  console.error("Usage: node scripts/sendAllTemplates.mjs <email> [firstName]");
  process.exit(1);
}
if (!process.env.BREVO_API_KEY) {
  console.error("BREVO_API_KEY env var is required");
  process.exit(1);
}

// Superset of every params key used in brevoTemplates.ts (SIMPLE + BY_USER_TYPE)
// plus the context-dependent ones referenced in its comment block.
const PARAMS = {
  reason: "Sample reason text so the placeholder renders.",
  credits: 100,
  creator_name: "Test Creator",
  brand_name: "Test Brand",
  counter_amount: 5000,
  campaign_name: "Test Campaign",
  issue: "Product arrived damaged",
  awb: "AWB-TEST-000123",
  amount: 5000,
  reference: "PAYOUT-REF-000123",
  extension_days: 3,
  deadline: "10 Jul 2026",
  new_deadline: "13 Jul 2026",
  admin_message: "Sample admin message.",
  field_name: "Instagram handle",
  // Context-dependent (best-guess placeholders for the comment block's list)
  product_name: "Test Product",
  courier_name: "Test Courier",
  outcome: "Resolved in your favour",
  day: 3,
  link: "https://collabry.co",
};

// Titles pulled from brevoTemplates.ts so the subject makes clear which template it is.
const KNOWN_SUBJECTS = {
  1:  "Welcome to Collabry!",
  3:  "You're live on Collabry!",
  4:  "Profile not approved",
  5:  "Profile update rejected",
  6:  "Account suspended (creator)",
  7:  "Welcome back! (creator)",
  8:  "KYC verified!",
  9:  "KYC needs attention",
  10: "Action needed — update profile",
  11: "Campaign approved (campaign)",
  12: "Campaign top-up (campaign)",
  13: "Campaign rejected (campaign)",
  18: "Creators interested (cron)",
  19: "Campaign approved (barter)",
  20: "Campaign top-up (barter)",
  21: "Campaign rejected (barter)",
  26: "Creators interested (barter cron)",
  27: "Offer/request accepted (brand)",
  28: "Counter-offer received",
  29: "Request accepted (creator-counter)",
  30: "Deal live (paid campaign)",
  31: "Deal live (direct deal)",
  32: "Payment success (direct-deal)",
  33: "Concept submitted — review needed",
  34: "Concept resubmitted",
  35: "Concept revision requested",
  37: "Deal final post confirmed (creator)",
  38: "Deal final post confirmed (brand)",
  40: "Inactivity nudge 40",
  41: "Inactivity nudge 41",
  42: "Inactivity nudge 42",
  43: "Inactivity nudge 43",
  44: "Inactivity nudge 44",
  45: "Product issue reported",
  46: "New product on its way!",
  47: "Brand says make it work!",
  48: "Creator can't proceed",
  49: "Deal cancelled (shipping)",
  50: "Deal cancelled (shipping)",
  51: "AWB number disputed",
  52: "AWB updated",
  53: "Non-delivery reported (creator)",
  54: "Non-delivery reported (brand)",
  55: "AWB wrong auto-cancel (brand)",
  56: "AWB wrong auto-cancel (creator)",
  57: "Product issue auto-cancel (brand)",
  58: "Product issue auto-cancel (creator)",
  59: "Dispute raised — payout paused",
  60: "Dispute resolved 60",
  61: "Dispute resolved 61",
  62: "Dispute resolved 62",
  63: "Dispute resolved 63",
  64: "Dispute resolved 64",
  65: "Dispute resolved 65",
  66: "Deal completed — payout coming!",
  67: "Complete KYC to get paid!",
  68: "You've been paid!",
  69: "Deal cancelled (admin)",
  70: "Deal cancelled (admin)",
  71: "Deal cancelled (concept)",
  72: "Deal cancelled (concept)",
  73: "Extension requested",
  74: "Extension declined",
  75: "Extension auto-approved",
  76: "Credits added!",
  77: "Credits adjustment",
  78: "Account suspended (brand)",
  79: "Welcome back! (brand)",
};

async function ensureContact() {
  const res = await fetch(`${API_BASE}/contacts`, {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      email: TO,
      attributes: { FIRSTNAME: FIRST_NAME },
      updateEnabled: true,
    }),
  });
  if (!res.ok && res.status !== 204) {
    const txt = await res.text().catch(() => "");
    console.warn(`ensureContact non-OK ${res.status}: ${txt}`);
  }
}

async function sendTemplate(templateId) {
  const label = KNOWN_SUBJECTS[templateId] || `Template ${templateId}`;
  const subject = `[TEST ${templateId}] ${label}`;
  const body = {
    to: [{ email: TO, name: FIRST_NAME }],
    templateId,
    params: PARAMS,
    subject,
  };
  const res = await fetch(`${API_BASE}/smtp/email`, {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return { ok: false, status: res.status, error: txt };
  }
  return { ok: true };
}

async function main() {
  console.log(`Sending templates 1..79 to ${TO} (firstName=${FIRST_NAME})…\n`);
  await ensureContact();

  const successes = [];
  const failures = [];
  for (let id = 1; id <= 79; id++) {
    const result = await sendTemplate(id);
    if (result.ok) {
      console.log(`  ✓ ${String(id).padStart(2)}  ${KNOWN_SUBJECTS[id] || ""}`);
      successes.push(id);
    } else {
      console.log(`  ✗ ${String(id).padStart(2)}  ${result.status}  ${result.error?.slice(0, 120)}`);
      failures.push({ id, ...result });
    }
    // Small delay to stay under Brevo's per-second cap.
    await new Promise((r) => setTimeout(r, 150));
  }

  console.log(`\nDone. ${successes.length} sent, ${failures.length} failed.`);
  if (failures.length) {
    console.log(`Failed IDs: ${failures.map((f) => f.id).join(", ")}`);
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
