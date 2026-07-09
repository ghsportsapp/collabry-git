// Notification type -> Brevo template resolver.
//
// Brevo template ids are 1..79, matching the file numbering in Navneet's set
// (see resources/brevo_template_ids.json). Subjects come from the Brevo Params
// Reference and override the placeholder subject set at upload.
//
// SAFETY (two layers):
//  1) Only types that map to ONE template unambiguously are auto-resolved here
//     (optionally split by recipient userType). Context-dependent types must be
//     wired at the call site via createNotification({ emailTemplateId, ... }) —
//     see CONTEXT-DEPENDENT below. An unhandled type = in-app only.
//  2) `requiredParams` lists the {{ params.* }} values the template needs. The
//     email is only sent once the call site supplies them (via emailParams);
//     until then the notification stays in-app only. This prevents shipping
//     half-filled emails (e.g. "rejected: ___") before a call site is wired.
//     FIRSTNAME is synced onto the Brevo contact automatically (brevoEmail.ts).

export interface ResolvedTemplate {
  templateId: number;
  subject: string;
  requiredParams: string[];
}

type UserType = "BRAND" | "CREATOR";

// Unambiguous single-template, single-recipient types.
const SIMPLE: Record<string, ResolvedTemplate> = {
  // Creator profile approval — the actual notification type strings emitted from
  // adminCreators.ts (CREATOR_APPROVED / CREATOR_REJECTED). PROFILE_* kept as
  // aliases for anywhere else that might still emit them.
  CREATOR_APPROVED: { templateId: 3, subject: "You're live on Collabry!", requiredParams: [] },
  CREATOR_REJECTED: { templateId: 4, subject: "Profile not approved", requiredParams: ["reason"] },
  // Distinct from CREATOR_REJECTED (which fires on full-profile rejection at
  // signup) — this fires when an admin rejects a follower-count or pricing
  // update on an already-active profile. Maps to template 5.
  CREATOR_PROFILE_UPDATE_REJECTED: { templateId: 5, subject: "Update not approved", requiredParams: [] },
  PROFILE_APPROVED: { templateId: 3, subject: "You're live on Collabry!", requiredParams: [] },
  PROFILE_REJECTED: { templateId: 4, subject: "Profile not approved", requiredParams: ["reason"] },
  // Creator suspend/unsuspend uses CREATOR_SUSPENDED / CREATOR_UNSUSPENDED types
  // in code; brand suspend/unsuspend uses ACCOUNT_SUSPENDED / ACCOUNT_UNSUSPENDED
  // (see BY_USER_TYPE below for those).
  CREATOR_SUSPENDED: { templateId: 6, subject: "Account suspended", requiredParams: ["reason"] },
  CREATOR_UNSUSPENDED: { templateId: 7, subject: "Welcome back!", requiredParams: [] },
  KYC_APPROVED: { templateId: 8, subject: "KYC verified!", requiredParams: [] },
  KYC_REJECTED: { templateId: 9, subject: "KYC needs attention", requiredParams: ["reason"] },
  FIELD_REQUIRED: { templateId: 10, subject: "Action needed — update profile", requiredParams: ["field_name"] },

  CREATOR_WELCOME: { templateId: 2, subject: "Welcome to Collabry!", requiredParams: [] },
  WELCOME_CREDITS: { templateId: 1, subject: "Welcome to Collabry!", requiredParams: ["credits"] },

  // REQUEST_COUNTERED moved to BY_USER_TYPE below — brand-side uses 28 (creator
  // countered brand's offer), creator-side uses 93 (brand countered creator's).

  DEAL_CONCEPT_SUBMITTED: { templateId: 33, subject: "Concept submitted — review needed", requiredParams: ["creator_name", "campaign_name"] },
  DEAL_CONCEPT_RESUBMITTED: { templateId: 34, subject: "Concept resubmitted", requiredParams: ["creator_name", "campaign_name"] },
  DEAL_CONCEPT_REVISION_REQUESTED: { templateId: 35, subject: "Concept revision requested", requiredParams: ["campaign_name", "brand_name"] },

  PRODUCT_ISSUE_RAISED: { templateId: 45, subject: "Product issue reported", requiredParams: ["creator_name", "campaign_name", "issue"] },
  PRODUCT_RESHIPPED: { templateId: 46, subject: "New product on its way!", requiredParams: ["campaign_name", "awb"] },
  MAKE_IT_REQUEST: { templateId: 47, subject: "Brand says make it work!", requiredParams: ["campaign_name"] },
  CREATOR_CANNOT_PROCEED: { templateId: 48, subject: "Creator can't proceed", requiredParams: ["creator_name", "campaign_name"] },
  AWB_WRONG_RAISED: { templateId: 51, subject: "AWB number disputed", requiredParams: ["creator_name", "awb"] },
  AWB_UPDATED: { templateId: 52, subject: "AWB updated", requiredParams: ["campaign_name", "awb"] },

  DEAL_DISPUTE_RAISED: { templateId: 59, subject: "Dispute raised — payout paused", requiredParams: ["campaign_name"] },
  DEAL_COMPLETED: { templateId: 66, subject: "Deal completed — payout coming!", requiredParams: ["campaign_name", "amount"] },
  PAYOUT_PENDING_KYC: { templateId: 67, subject: "Complete KYC to get paid!", requiredParams: ["amount", "campaign_name"] },
  PAYOUT_RELEASED: { templateId: 68, subject: "You've been paid!", requiredParams: ["amount", "campaign_name", "reference"] },

  TIMELINE_EXTENSION_REQUESTED: { templateId: 73, subject: "Extension requested", requiredParams: ["creator_name", "campaign_name", "extension_days"] },
  TIMELINE_EXTENSION_REJECTED: { templateId: 74, subject: "Extension declined", requiredParams: ["campaign_name", "deadline"] },
  TIMELINE_EXTENSION_APPROVED: { templateId: 75, subject: "Extension auto-approved", requiredParams: ["creator_name", "campaign_name", "new_deadline"] },

  ADMIN_GIFT_RECEIVED: { templateId: 76, subject: "Credits added!", requiredParams: ["credits", "admin_message"] },
  ADMIN_CREDIT_REMOVED: { templateId: 77, subject: "Credits adjustment", requiredParams: ["credits", "admin_message"] },

  // Fresh Emails batch 19 (Navneet, 2026-07-08). N-templates for events that
  // previously had no branded email or an in-app-only notification.
  PRODUCT_SHIPPED: { templateId: 100, subject: "Your product is on the way!", requiredParams: ["awb", "courier"] },
  AWB_CONFIRMED: { templateId: 101, subject: "Tracking confirmed", requiredParams: ["awb"] },
  PRODUCT_RECEIVED: { templateId: 102, subject: "Content underway", requiredParams: ["final_due"] },
  ISSUE_RESOLVED_PROCEED: { templateId: 103, subject: "Content underway", requiredParams: ["final_due"] },
  CAMPAIGN_SELECTED: { templateId: 94, subject: "You're selected!", requiredParams: [] },
  REQUEST_RECEIVED: { templateId: 97, subject: "New deal request!", requiredParams: ["product_description", "script"] },
  DEAL_CONCEPT_APPROVED: { templateId: 98, subject: "Concept approved!", requiredParams: ["final_due"] },
  DELIVERY_ADDRESS_UPDATED: { templateId: 99, subject: "Ship the product", requiredParams: ["address"] },
  DEAL_CONTENT_SUBMITTED: { templateId: 104, subject: "Final video is in", requiredParams: ["review_hours"] },
  DEAL_CONTENT_REVISION_REQUESTED: { templateId: 105, subject: "Revision requested", requiredParams: ["reason"] },
  DEAL_CONTENT_RESUBMITTED: { templateId: 106, subject: "Final video resubmitted", requiredParams: ["review_hours"] },
  BARTER_CREATOR_CONFIRMED_PAID: { templateId: 95, subject: "Creator confirmed!", requiredParams: [] },
  PAYMENT_DONE_DEAL_STARTED: { templateId: 96, subject: "Deal is live!", requiredParams: [] },
};

// Types whose template differs by recipient userType.
const BY_USER_TYPE: Record<string, Partial<Record<UserType, ResolvedTemplate>>> = {
  ACCOUNT_SUSPENDED: {
    CREATOR: { templateId: 6, subject: "Account suspended", requiredParams: ["reason"] },
    BRAND: { templateId: 78, subject: "Account suspended", requiredParams: ["admin_message"] },
  },
  ACCOUNT_UNSUSPENDED: {
    CREATOR: { templateId: 7, subject: "Welcome back!", requiredParams: [] },
    BRAND: { templateId: 79, subject: "Welcome back!", requiredParams: ["admin_message"] },
  },
  // Sent to brand when creator accepts brand's offer (template 27), or to
  // creator when brand accepts creator's counter (template 29).
  REQUEST_ACCEPTED: {
    BRAND: { templateId: 27, subject: "Creator accepted your offer", requiredParams: [] },
    CREATOR: { templateId: 29, subject: "Brand accepted your counter", requiredParams: [] },
  },
  // "New message in your deal" nudges — templates 91 (brand) / 92 (creator).
  DEAL_CHAT_MESSAGE: {
    BRAND: { templateId: 91, subject: "New message", requiredParams: [] },
    CREATOR: { templateId: 92, subject: "New message", requiredParams: [] },
  },
  // Counter-offer received — brand-side (creator countered) uses template 28,
  // creator-side (brand countered) uses template 93 with different copy.
  REQUEST_COUNTERED: {
    BRAND: { templateId: 28, subject: "Counter-offer received", requiredParams: ["creator_name", "counter_amount"] },
    CREATOR: { templateId: 93, subject: "Brand responded to your offer", requiredParams: ["amount", "brand_name"] },
  },
};

/**
 * Resolve the Brevo template for an auto-mappable notification type, or null if
 * it must be wired explicitly at the call site (or is in-app only).
 */
export function resolveEmailTemplate(type: string, userType: UserType): ResolvedTemplate | null {
  if (BY_USER_TYPE[type]) return BY_USER_TYPE[type][userType] ?? null;
  return SIMPLE[type] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────
// CONTEXT-DEPENDENT — NOT auto-resolved. Wire at the call site by passing
// emailTemplateId/emailSubject/emailParams to createNotification, because the
// right template depends on context the `type` alone doesn't carry:
//
//   CAMPAIGN_LIVE / CAMPAIGN_APPROVED   -> 11 (campaign) vs 19 (barter); +12/20 top-up
//   CAMPAIGN_REJECTED                   -> 13 (campaign) vs 21 (barter)
//   DEAL_LIVE                           -> 30 (paid campaign) vs 31 (direct deal)
//   PAYMENT_SUCCESS                     -> 32 (direct-deal payment). NOTE: also
//                                          used for credit *purchase*, which has
//                                          NO template -> keep that in-app only.
//   OFFER_ACCEPTED / REQUEST_ACCEPTED   -> 27 (brand) vs 29 (creator-counter)
//   DEAL_FINAL_POST_CONFIRMED           -> 37 (creator) vs 38 (brand)
//   *_INACTIVITY_*                      -> 40/41/42/43/44 by stage+day
//   NON_DELIVERY_REPORTED               -> 53 (creator) vs 54 (brand)
//   AWB_WRONG_AUTO_CANCEL               -> 55 (brand) vs 56 (creator)
//   PRODUCT_ISSUE_AUTO_CANCEL           -> 57 (brand) vs 58 (creator)
//   DEAL_DISPUTE_RESOLVED               -> 60/61/62/63/64/65 by outcome+recipient
//   DEAL_CANCELLED                      -> 49/50 (shipping) / 69/70 (admin) / 71/72 (concept)
//   PROFILE_UPDATE rejected             -> 5 (no distinct type yet)
//   Barter family (19–26), CreatorsInterested cron (18/26)
// ─────────────────────────────────────────────────────────────────────────
