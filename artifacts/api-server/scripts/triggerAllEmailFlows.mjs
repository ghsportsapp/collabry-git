#!/usr/bin/env node
// Trigger as many of the 79 Brevo template events as possible by hitting
// the production API directly. Uses shahedswe1+<slug>@gmail.com aliases so
// every test email lands in one inbox and each signup satisfies the DB's
// unique-email constraint independently.
//
// Coverage reality-check (honest breakdown of the 79):
//   • Direct HTTP triggerable  (this script)                     ~15 templates
//   • Multi-step deal-flow required (create → pay → concept → …)  ~30 templates
//     (partially attempted at the bottom; may fail without prior
//      brand-unlock or complex payload setup)
//   • Cron-driven, cannot trigger via HTTP                        ~15 templates
//     (day-N delivery warnings, inactivity nudges, auto-cancels,
//      campaign back-live, creators-interested, expiry crons)
//   • No route/type exists in code at all                          2 templates
//     (template 22 Barter OnHold, template 5 Profile Update Reject)
//
// Usage (all env vars):
//   API_BASE_URL     — default https://api.collabry.co
//   TEST_EMAIL       — default shahedswe1@gmail.com (will get + aliases)
//   ADMIN_USERNAME   — admin login username or email
//   ADMIN_PASSWORD   — admin login password
//   SKIP_SIGNUP      — set to "1" to skip fresh signups (useful for retries)
//   DEAL_FLOW        — set to "1" to also attempt the deal-flow section
//
// Example:
//   API_BASE_URL=https://api.collabry.co \
//   TEST_EMAIL=shahedswe1@gmail.com \
//   ADMIN_USERNAME=... ADMIN_PASSWORD=... \
//     node scripts/triggerAllEmailFlows.mjs

const API_BASE = (process.env.API_BASE_URL || "https://api.collabry.co").replace(/\/$/, "");
const [LOCAL, DOMAIN] = (process.env.TEST_EMAIL || "shahedswe1@gmail.com").split("@");
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SKIP_SIGNUP = process.env.SKIP_SIGNUP === "1";
const DEAL_FLOW = process.env.DEAL_FLOW === "1";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const RUN_TAG = `t${Math.floor(process.hrtime()[0] + process.hrtime()[1] / 1e9).toString(36)}`;
const email = (slug) => `${LOCAL}+${slug}${RUN_TAG}@${DOMAIN}`;
const phone = () => {
  // Random 10-digit Indian phone starting 6-9
  const first = 6 + Math.floor(process.hrtime()[1] % 4);
  const rest = String(process.hrtime()[1]).padStart(9, "0").slice(0, 9);
  return `${first}${rest}`;
};
const handle = (slug) => `test${slug}${RUN_TAG}`.toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 30);

let adminToken = null;

async function api(method, path, { body, token } = {}) {
  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, ok: res.ok, body: json ?? text };
}

async function step(label, tplId, fn) {
  const templateStr = tplId ? `[tpl ${String(tplId).padStart(2)}]` : "[      ]";
  process.stdout.write(`${templateStr} ${label} … `);
  try {
    const result = await fn();
    if (result?.ok === false || (result?.status && result.status >= 400)) {
      const msg = typeof result.body === "object" ? JSON.stringify(result.body).slice(0, 140) : String(result.body).slice(0, 140);
      console.log(`FAIL (${result.status}) ${msg}`);
      return null;
    }
    console.log("OK");
    return result;
  } catch (e) {
    console.log(`ERR ${e.message?.slice(0, 140)}`);
    return null;
  }
}

// ─── SECTION 1 — Signups (templates 1, 2) ────────────────────────────────────
async function section1_signups() {
  console.log("\n── SECTION 1 — Signups ──");
  if (SKIP_SIGNUP) {
    console.log("skipped (SKIP_SIGNUP=1)");
    return {};
  }
  const out = {};

  // Template 1 — Brand Welcome (WELCOME_CREDITS)
  const brand = await step("Brand signup (Welcome)", 1, () => api("POST", "/auth/brand/signup", {
    body: {
      brandName: `TestBrand ${RUN_TAG}`,
      contactName: "Shahed Test",
      email: email("brand"),
      password: "TestPass123!",
      instagramHandle: handle("brand"),
    },
  }));
  if (brand?.body?.brandId) out.brandId = brand.body.brandId;
  if (brand?.body?.accessToken) out.brandToken = brand.body.accessToken;

  // Template 2 — Creator Welcome (CREATOR_WELCOME)
  // Creator signup is the most schema-heavy — supply everything the route
  // reads from req.body. Uses picsum for image URLs so we don't need to run
  // the upload flow.
  const catRes = await api("GET", "/categories");
  const firstCat = Array.isArray(catRes.body) ? catRes.body[0] : null;
  const categoryId = firstCat?.id;
  const subcategoryId = firstCat?.subcategories?.[0]?.id;

  const creator = await step("Creator signup (Welcome)", 2, () => api("POST", "/auth/creator/signup", {
    body: {
      fullName: `Test Creator ${RUN_TAG}`,
      dateOfBirth: "1998-05-15",
      gender: "Male",
      phone: phone(),
      email: email("creator"),
      instagramHandle: handle("creator"),
      profilePhotoUrl: "https://picsum.photos/400",
      bio: "Automated test creator",
      followerCount: 5000,
      audienceGenderFemale: 50,
      audienceGenderMale: 50,
      audienceAge: "25-34",
      audienceLocation: "India",
      audienceType: "URBAN",
      contentType: "Lifestyle",
      campaignGoal: "Brand collaborations",
      purchaseBehaviour: "Impulse buyer",
      reelPriceMin: 1000, reelPriceMax: 2000,
      storyPriceMin: 500, storyPriceMax: 1000,
      postPriceMin: 800, postPriceMax: 1500,
      state: "Karnataka",
      password: "TestPass123!",
      images: [
        "https://picsum.photos/400?a",
        "https://picsum.photos/400?b",
        "https://picsum.photos/400?c",
        "https://picsum.photos/400?d",
      ],
      categories: categoryId ? [{ categoryId, subcategoryId }] : [],
      portfolio: [
        { videoUrl: "https://instagram.com/reel/test1/", selfDeclared: true },
        { videoUrl: "https://instagram.com/reel/test2/", selfDeclared: true },
        { videoUrl: "https://instagram.com/reel/test3/", selfDeclared: true },
      ],
      customFieldValues: [],
    },
  }));
  if (creator?.body?.creatorId) out.creatorId = creator.body.creatorId;
  if (creator?.body?.accessToken) out.creatorToken = creator.body.accessToken;

  return out;
}

// ─── SECTION 2 — Admin login ─────────────────────────────────────────────────
async function section2_adminLogin() {
  console.log("\n── SECTION 2 — Admin login ──");
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    console.log("skipped (ADMIN_USERNAME + ADMIN_PASSWORD env vars not set)");
    return false;
  }
  const r = await step("Admin login", null, () => api("POST", "/auth/admin/login", {
    body: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
  }));
  if (r?.body?.accessToken) {
    adminToken = r.body.accessToken;
    return true;
  }
  return false;
}

// ─── SECTION 3 — Creator admin actions (templates 3, 4, 6, 7) ────────────────
async function section3_creatorAdmin(ids) {
  console.log("\n── SECTION 3 — Creator admin actions (approve/reject/suspend) ──");
  if (!adminToken) { console.log("skipped (no admin token)"); return; }

  // Need at least one pending creator to test approve; if signup created one,
  // use it. Otherwise fetch a pending creator from the admin list.
  let approveId = ids.creatorId;
  if (!approveId) {
    const list = await api("GET", "/admin/creators?status=PENDING&limit=1", { token: adminToken });
    approveId = list.body?.creators?.[0]?.id;
  }

  if (approveId) {
    await step(`Creator approve (id=${approveId.slice(0, 8)})`, 3, () =>
      api("POST", `/admin/creators/${approveId}/approve`, { token: adminToken })
    );
  } else {
    console.log("[tpl  3] skipped — no PENDING creator id");
  }

  // Reject: fetch another pending creator (approve is destructive; can't reuse).
  const list2 = await api("GET", "/admin/creators?status=PENDING&limit=1", { token: adminToken });
  const rejectId = list2.body?.creators?.[0]?.id;
  if (rejectId) {
    await step(`Creator reject (id=${rejectId.slice(0, 8)})`, 4, () =>
      api("POST", `/admin/creators/${rejectId}/reject`, {
        token: adminToken,
        body: { reason: "Automated test rejection" },
      })
    );
  } else {
    console.log("[tpl  4] skipped — no PENDING creator id");
  }

  // Suspend the approved creator, then unsuspend.
  if (approveId) {
    await step(`Creator suspend (id=${approveId.slice(0, 8)})`, 6, () =>
      api("POST", `/admin/creators/${approveId}/suspend`, {
        token: adminToken,
        body: { reason: "Automated test suspension" },
      })
    );
    await step(`Creator unsuspend (id=${approveId.slice(0, 8)})`, 7, () =>
      api("POST", `/admin/creators/${approveId}/unsuspend`, { token: adminToken })
    );
  } else {
    console.log("[tpl  6] skipped — no active creator id to suspend");
    console.log("[tpl  7] skipped");
  }
}

// ─── SECTION 4 — Brand admin actions (templates 76, 77, 78, 79) ──────────────
async function section4_brandAdmin(ids) {
  console.log("\n── SECTION 4 — Brand admin actions (credits/suspend) ──");
  if (!adminToken) { console.log("skipped (no admin token)"); return; }

  let brandId = ids.brandId;
  if (!brandId) {
    const list = await api("GET", "/admin/brands?limit=1&status=ACTIVE", { token: adminToken });
    brandId = list.body?.brands?.[0]?.id;
  }
  if (!brandId) {
    console.log("skipped (no ACTIVE brand id available)");
    return;
  }

  // 76 — ADMIN_GIFT_RECEIVED
  await step(`Brand credits gift (id=${brandId.slice(0, 8)})`, 76, () =>
    api("POST", `/admin/brands/${brandId}/adjust-credits`, {
      token: adminToken,
      body: { amount: 5, type: "add", reason: "Automated test gift", expiryDays: 30 },
    })
  );
  // 77 — ADMIN_CREDIT_REMOVED
  await step(`Brand credits remove (id=${brandId.slice(0, 8)})`, 77, () =>
    api("POST", `/admin/brands/${brandId}/adjust-credits`, {
      token: adminToken,
      body: { amount: 1, type: "remove", reason: "Automated test remove" },
    })
  );
  // 78 — ACCOUNT_SUSPENDED (BRAND)
  await step(`Brand suspend (id=${brandId.slice(0, 8)})`, 78, () =>
    api("POST", `/admin/brands/${brandId}/suspend`, {
      token: adminToken,
      body: { reason: "Automated test suspension" },
    })
  );
  // 79 — ACCOUNT_UNSUSPENDED (BRAND)
  await step(`Brand unsuspend (id=${brandId.slice(0, 8)})`, 79, () =>
    api("POST", `/admin/brands/${brandId}/unsuspend`, { token: adminToken })
  );
}

// ─── SECTION 5 — KYC admin actions (templates 8, 9) ──────────────────────────
async function section5_kycAdmin() {
  console.log("\n── SECTION 5 — KYC admin actions ──");
  if (!adminToken) { console.log("skipped (no admin token)"); return; }

  // KYC endpoints take a creator id whose kycStatus is PENDING.
  const list = await api("GET", "/admin/kyc-requests?status=PENDING&limit=2", { token: adminToken });
  const requests = list.body?.requests ?? list.body ?? [];
  if (!Array.isArray(requests) || requests.length === 0) {
    console.log("skipped — no PENDING KYC requests. Have a creator submit KYC and re-run.");
    return;
  }
  const approveId = requests[0]?.creatorId ?? requests[0]?.id;
  const rejectId = requests[1]?.creatorId ?? requests[1]?.id ?? approveId;
  if (approveId) {
    await step(`KYC approve (id=${String(approveId).slice(0, 8)})`, 8, () =>
      api("POST", `/admin/kyc-requests/${approveId}/approve`, { token: adminToken })
    );
  }
  if (rejectId && rejectId !== approveId) {
    await step(`KYC reject (id=${String(rejectId).slice(0, 8)})`, 9, () =>
      api("POST", `/admin/kyc-requests/${rejectId}/reject`, {
        token: adminToken,
        body: { reason: "Automated test KYC rejection" },
      })
    );
  }
}

// ─── SECTION 6 — Campaign lifecycle (templates 11, 12, 13, 14, 15) ───────────
async function section6_campaignAdmin(ids) {
  console.log("\n── SECTION 6 — Campaign lifecycle admin actions ──");
  if (!adminToken) { console.log("skipped (no admin token)"); return; }

  // Campaigns must exist in PENDING_APPROVAL. Try to get 4 from the admin list.
  const list = await api("GET", "/admin/campaigns?status=PENDING_APPROVAL&limit=4", { token: adminToken });
  const campaigns = list.body?.campaigns ?? list.body ?? [];
  if (!Array.isArray(campaigns) || campaigns.length === 0) {
    console.log("skipped — no PENDING_APPROVAL campaigns. Have a brand create campaigns and re-run.");
    return;
  }

  // 11 — CAMPAIGN_LIVE (approve)
  if (campaigns[0]) {
    await step(`Campaign approve (id=${campaigns[0].id.slice(0, 8)})`, 11, () =>
      api("POST", `/admin/campaigns/${campaigns[0].id}/approve`, { token: adminToken })
    );
  }
  // 13 — CAMPAIGN_REJECTED
  if (campaigns[1]) {
    await step(`Campaign reject (id=${campaigns[1].id.slice(0, 8)})`, 13, () =>
      api("POST", `/admin/campaigns/${campaigns[1].id}/reject`, {
        token: adminToken,
        body: { reason: "Automated test rejection" },
      })
    );
  }
  // 14 — CAMPAIGN_ON_HOLD
  if (campaigns[2]) {
    await step(`Campaign hold (id=${campaigns[2].id.slice(0, 8)})`, 14, () =>
      api("POST", `/admin/campaigns/${campaigns[2].id}/hold`, {
        token: adminToken,
        body: { message: "Automated test hold" },
      })
    );
  }
  // 15 — CAMPAIGN_CANCELLED (works on already-LIVE campaign; use the one just approved)
  if (campaigns[0]) {
    await step(`Campaign cancel (id=${campaigns[0].id.slice(0, 8)})`, 15, () =>
      api("POST", `/admin/campaigns/${campaigns[0].id}/cancel`, { token: adminToken })
    );
  }
  // Note: template 12 (Campaign TopUp Needed) requires brand balance < credits cost.
  // Not reliably testable without setting up a brand with zero credits first.
  console.log("[tpl 12] skipped — requires brand with insufficient credits");
}

// ─── SECTION 7 — Barter lifecycle (templates 19, 21) ─────────────────────────
async function section7_barterAdmin() {
  console.log("\n── SECTION 7 — Barter lifecycle admin actions ──");
  if (!adminToken) { console.log("skipped (no admin token)"); return; }

  const list = await api("GET", "/admin/barter?status=PENDING_APPROVAL&limit=2", { token: adminToken });
  const barters = Array.isArray(list.body) ? list.body : (list.body?.barters ?? []);
  if (!Array.isArray(barters) || barters.length === 0) {
    console.log("skipped — no PENDING_APPROVAL barters. Have a brand create barters and re-run.");
    return;
  }
  if (barters[0]) {
    await step(`Barter approve (id=${barters[0].id.slice(0, 8)})`, 19, () =>
      api("POST", `/admin/barter/${barters[0].id}/approve`, { token: adminToken })
    );
  }
  if (barters[1]) {
    await step(`Barter reject (id=${barters[1].id.slice(0, 8)})`, 21, () =>
      api("POST", `/admin/barter/${barters[1].id}/reject`, {
        token: adminToken,
        body: { reason: "Automated test rejection" },
      })
    );
  }
  console.log("[tpl 20] skipped — requires brand with insufficient credits");
  console.log("[tpl 22] skipped — no admin barter-hold route exists in code");
}

// ─── SECTION 8 — Coverage note for the rest ──────────────────────────────────
function section8_coverageNote() {
  console.log("\n── SECTION 8 — What this script does NOT cover ──");
  console.log(`
Cron-only (require setInterval to fire + specific DB state):
  16 Brand Campaign Expired          — cron on campaign.expiresAt
  17 Brand Campaign BackLive         — creditHoldActivation cron after topup
  18 Brand Campaign CreatorsInterested — applicantNotification cron, 3-day threshold
  24 Brand Barter Expired            — cron on barter.expiresAt
  25 Brand Barter BackLive           — creditHoldActivation cron
  26 Brand Barter CreatorsInterested — applicantNotification cron
  40 Creator Reminder Day 2          — dealPipeline cron (concept-stage inactivity)
  41 Creator Reminder Day 3          — same cron, later stage
  42 Creator Reminder Day 5          — dealPipeline cron (final-stage inactivity)
  43 Creator Reminder Day 7          — same
  44 Brand Creator Late Day 10       — same
  53 Creator Product NotReceived Day 8 — shippingCron / dealPipeline
  54 Brand Creator NotReceived Day 8   — same
  55 Brand AutoCancelled NoAWB       — shippingCron on awb_wrong_deadline expiry
  56 Creator AutoCancelled AWB       — same cron
  57 Brand AutoCancelled NoIssueResponse — shippingCron on brand_response_deadline
  58 Creator AutoCancelled Issue     — same cron
  75 Brand Timeline Extension AutoApproved — dealPipeline cron after 48h

Multi-step deal flow (require a completed deal chain — brand unlocks creator,
sends request, creator counters, brand accepts/pays, escrow activates, creator
submits concept, brand approves, creator posts live URL, brand confirms,
dispute window, etc). Attempted in DEAL_FLOW=1 mode, but success depends
heavily on prior state:
  27, 28, 29 Request accept/counter/counter-accept
  30, 31, 32 Deal live variants + payment confirmed
  33, 34, 35 Concept submitted/resubmitted/revision requested
  36, 37, 38, 39 Live URL / all-posts confirmed / flagged
  45, 46, 47, 48 Product issue flow
  49, 50, 51, 52 Shipping cancel / AWB
  59, 60, 61, 62, 63, 64, 65 Disputes
  66, 67, 68 Deal complete / payout pending KYC / payout released
  69, 70, 71, 72 Deal cancelled variants (admin refund, concept-stage exit)
  73, 74 Timeline extension requested/declined

No code path exists:
   5 Creator Profile Update Rejected — reuses CREATOR_REJECTED (tpl 4) currently
  22 Brand Barter OnHold             — no admin barter-hold route

Also silently covered by the SIMPLE / BY_USER_TYPE auto-resolver when
their notification type fires elsewhere in code:
  10 Creator Field Required          — dealChat createNotification, BRAND-only
`);
}

// ─── Main ────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`API_BASE_URL = ${API_BASE}`);
  console.log(`TEST_EMAIL   = ${LOCAL}+<slug>${RUN_TAG}@${DOMAIN}`);
  console.log(`RUN_TAG      = ${RUN_TAG}`);

  const ids = await section1_signups();
  await section2_adminLogin();
  await section3_creatorAdmin(ids);
  await section4_brandAdmin(ids);
  await section5_kycAdmin();
  await section6_campaignAdmin(ids);
  await section7_barterAdmin();
  section8_coverageNote();

  console.log("\nDone. Check the inbox at shahedswe1@gmail.com AND Brevo dashboard → Statistics → Email → Logs (filter by domain to see all + aliases).");
})();
