// Notification type -> AiSensy WhatsApp campaign resolver.
//
// Campaign names come from Navneet's export of the 82 campaigns created in the
// AiSensy dashboard (Collabry_WhatsApp_Campaign_Codes, gitignored — every file
// in it embeds the live API key). They must match the dashboard exactly.
//
// SAFETY — same two layers as brevoTemplates.ts:
//  1) Only types that map to ONE campaign unambiguously are resolved here.
//     Context-dependent types (see the block at the bottom) stay unmapped
//     until the call site can say which variant applies. Unmapped = no
//     WhatsApp, exactly as an unmapped type today means no email.
//  2) `param2` says what fills {{2}} on the two-param templates. The export
//     was no help here — it filled BOTH slots with the placeholder
//     "$FirstName" — but Navneet confirmed the rule (2026-07-31):
//
//       deal messages     -> {{2}} is the OTHER party's name: the creator's
//                            name on brand-facing campaigns, the brand's on
//                            creator-facing ones. Encoded as "counterparty"
//                            and resolved per recipient at dispatch.
//       campaign messages -> {{2}} is the campaign name.
//
//     Anything still carrying `param2: null` is one we haven't confirmed; it
//     never sends, so a wrong guess can't reach a user.
//
// Convention:
//   param2 absent          -> single-param template
//   param2: null           -> two-param, {{2}} unconfirmed, never sends
//   param2: "counterparty" -> {{2}} = creator_name (to brand) / brand_name (to creator)
//   param2: "key"          -> {{2}} = params[key]

/** Sentinel for "the other party's name" — see the rule above. */
export const COUNTERPARTY = "counterparty";

export interface WhatsAppCampaign {
  campaign: string;
  param2?: string | null;
}

type UserType = "BRAND" | "CREATOR";

// Unambiguous single-recipient types.
const SIMPLE: Record<string, WhatsAppCampaign> = {
  // ── Live now (single-param templates) ──────────────────────────────────
  CREATOR_WELCOME: { campaign: "Creator Welcome-Creator" },
  WELCOME_CREDITS: { campaign: "Brand Welcome-Brand" },
  KYC_APPROVED: { campaign: "Creator KYC Verified-Creator" },
  KYC_REJECTED: { campaign: "Creator KYC Rejected-Creator" },
  CREATOR_APPROVED: { campaign: "Creator Profile Approved-Creator" },
  CREATOR_REJECTED: { campaign: "Creator Profile Rejected-Creator" },
  PROFILE_APPROVED: { campaign: "Creator Profile Approved-Creator" },
  PROFILE_REJECTED: { campaign: "Creator Profile Rejected-Creator" },
  CREATOR_PROFILE_UPDATE_REJECTED: { campaign: "Creator Profile Update Rejected-Creator" },
  CREATOR_UNSUSPENDED: { campaign: "Creator Account Reactivated-Creator" },
  CAMPAIGN_LIVE: { campaign: "Campaign Status Active-Brand" },
  BARTER_LIVE: { campaign: "Barter Status Active-Brand" },
  BARTER_EXPIRED: { campaign: "Barter Status Expired-Brand" },

  // ── Deal messages: {{2}} is the other party's name ─────────────────────
  PAYOUT_RELEASED: { campaign: "Payout Released-Creator", param2: COUNTERPARTY },
  PAYOUT_PENDING_KYC: { campaign: "Payout Pending KYC-Creator", param2: COUNTERPARTY },

  DEAL_CONCEPT_SUBMITTED: { campaign: "Concept Submitted-Brand", param2: COUNTERPARTY },
  DEAL_CONCEPT_RESUBMITTED: { campaign: "Concept Resubmitted-Brand", param2: COUNTERPARTY },
  DEAL_CONCEPT_APPROVED: { campaign: "Concept Approved-Creator", param2: COUNTERPARTY },
  DEAL_CONCEPT_REVISION_REQUESTED: { campaign: "Concept Revision-Creator", param2: COUNTERPARTY },

  DEAL_CONTENT_SUBMITTED: { campaign: "Final Video Uploaded-Brand", param2: COUNTERPARTY },
  DEAL_CONTENT_RESUBMITTED: { campaign: "Final Video Resubmitted-Brand", param2: COUNTERPARTY },
  DEAL_CONTENT_REVISION_REQUESTED: { campaign: "Final Video Revision-Creator", param2: COUNTERPARTY },

  PRODUCT_SHIPPED: { campaign: "Product Shipped-Creator", param2: COUNTERPARTY },
  PRODUCT_RECEIVED: { campaign: "Product Received-Brand", param2: COUNTERPARTY },
  PRODUCT_RESHIPPED: { campaign: "Product Reshipped-Creator", param2: COUNTERPARTY },
  PRODUCT_ISSUE_RAISED: { campaign: "Product Issue Raised-Brand", param2: COUNTERPARTY },
  CREATOR_CANNOT_PROCEED: { campaign: "Product Cannot Proceed-Brand", param2: COUNTERPARTY },
  MAKE_IT_REQUEST: { campaign: "Product Proceed Request-Creator", param2: COUNTERPARTY },
  ISSUE_RESOLVED_PROCEED: { campaign: "Product Proceed Accepted-Brand", param2: COUNTERPARTY },
  DELIVERY_ADDRESS_UPDATED: { campaign: "Address Updated-Brand", param2: COUNTERPARTY },

  AWB_CONFIRMED: { campaign: "Tracking Confirmed-Creator", param2: COUNTERPARTY },
  AWB_UPDATED: { campaign: "Tracking Updated-Creator", param2: COUNTERPARTY },
  AWB_WRONG_RAISED: { campaign: "Tracking Issue Reported-Brand", param2: COUNTERPARTY },

  TIMELINE_EXTENSION_REQUESTED: { campaign: "Timeline Extension Request-Brand", param2: COUNTERPARTY },
  TIMELINE_EXTENSION_REJECTED: { campaign: "Timeline Extension Declined-Creator", param2: COUNTERPARTY },

  // Inactivity escalation. The campaign names carry day numbers, and they line
  // up exactly with the constants driving the job in jobs/dealPipeline.ts:
  // CONCEPT_EARLY_NUDGE_DAY=2, CONCEPT_NUDGE_DAY=3, FINAL_NUDGE_DAY=5,
  // FINAL_WARN_DAY=7. The brand-side escalation fires on day 10 but its
  // campaign is named for the condition ("overdue") rather than the day.
  DEAL_INACTIVITY_EARLY_NUDGE: { campaign: "Deal Pending Day2-Creator", param2: COUNTERPARTY },
  DEAL_INACTIVITY_NUDGE: { campaign: "Deal Pending Day3-Creator", param2: COUNTERPARTY },
  DEAL_FINAL_INACTIVITY_NUDGE: { campaign: "Deal Post Pending Day5-Creator", param2: COUNTERPARTY },
  DEAL_FINAL_INACTIVITY_WARNING: { campaign: "Deal Video Pending Day7-Creator", param2: COUNTERPARTY },
  DEAL_FINAL_INACTIVITY_ESCALATED: { campaign: "Deal Overdue-Brand", param2: COUNTERPARTY },

  REQUEST_RECEIVED: { campaign: "Deal Request Received-Creator", param2: COUNTERPARTY },
  // Campaign-level, so these lost their second param too — verified live.
  BARTER_CREATOR_CONFIRMED: { campaign: "Barter Participation Confirmed-Brand" },
  BARTER_CREATOR_CONFIRMED_PAID: { campaign: "Campaign Participation Confirmed-Brand" },
  // NOTE: CAMPAIGN_SELECTED ("Campaign Application Approved-Creator") is emitted
  // via createPopup, not createNotification, so it never reaches this dispatcher.
  // Wiring it means adding a createNotification call alongside the popup.

  // ── Campaign messages: single-param ────────────────────────────────────
  // These carried a campaign-name {{2}} in the original export, but Navneet
  // dropped the second param from every campaign-level template on 2026-08-02
  // ("i will remove 2nd param in case of campaign"). Verified against the live
  // API: sending two params returns 400 "Template params does not match the
  // campaign". Keep these single-param unless the templates change again.
  CAMPAIGN_CREATORS_INTERESTED: { campaign: "Campaign New Applicants-Brand" },
  CAMPAIGN_ON_HOLD: { campaign: "Campaign On Hold-Brand" },
  CAMPAIGN_REJECTED: { campaign: "Campaign Rejected-Brand" },
  CAMPAIGN_CANCELLED: { campaign: "Campaign Cancelled-Brand" },
  CAMPAIGN_TOP_UP_NEEDED: { campaign: "Campaign Balance Low-Brand" },
  BARTER_ON_HOLD: { campaign: "Barter On Hold-Brand" },
  BARTER_REJECTED: { campaign: "Barter Rejected-Brand" },
  BARTER_TOP_UP_NEEDED: { campaign: "Barter Balance Low-Brand" },

  // A credit gift has neither a counterparty nor a campaign. `credits` is the
  // only sensible {{2}} but Navneet hasn't confirmed it — stays gated.
  ADMIN_GIFT_RECEIVED: { campaign: "Brand Credits Added-Brand", param2: null },
};

// Types whose campaign differs by recipient.
const BY_USER_TYPE: Record<string, Partial<Record<UserType, WhatsAppCampaign>>> = {
  ACCOUNT_UNSUSPENDED: {
    CREATOR: { campaign: "Creator Account Reactivated-Creator" },
    BRAND: { campaign: "Brand Account Reinstated-Brand" },
  },
  INVOICE_READY: {
    CREATOR: { campaign: "Invoice Ready-Creator" },
    BRAND: { campaign: "Invoice Ready-Brand" },
  },
  // Brand side fires when the creator accepts the brand's offer; creator side
  // when the brand accepts the creator's counter — same split as templates 27/29.
  REQUEST_ACCEPTED: {
    BRAND: { campaign: "Deal Accepted-Brand", param2: COUNTERPARTY },
    CREATOR: { campaign: "Deal Counter Accepted-Creator", param2: COUNTERPARTY },
  },
  REQUEST_COUNTERED: {
    BRAND: { campaign: "Deal Counter-Brand", param2: COUNTERPARTY },
    CREATOR: { campaign: "Deal Response-Creator", param2: COUNTERPARTY },
  },
  // NON_DELIVERY_REPORTED is currently only a Deal *status* string — nothing
  // emits it as a notification type, so these two never fire today. Kept so
  // they're wired the moment that notification is added.
  NON_DELIVERY_REPORTED: {
    BRAND: { campaign: "Product Not Received-Brand", param2: COUNTERPARTY },
    CREATOR: { campaign: "Product Not Received-Creator", param2: COUNTERPARTY },
  },
  TIMELINE_EXTENSION_APPROVED: {
    BRAND: { campaign: "Timeline Extension Approved-Brand", param2: COUNTERPARTY },
    CREATOR: { campaign: "Timeline Extension Approved-Creator", param2: COUNTERPARTY },
  },
  DEAL_FINAL_POST_CONFIRMED: {
    BRAND: { campaign: "Final Video Approved-Brand", param2: COUNTERPARTY },
    CREATOR: { campaign: "Final Video Approved-Creator", param2: COUNTERPARTY },
  },
};

/**
 * Resolve the AiSensy campaign for a notification type, or null if it must be
 * wired explicitly (see CONTEXT-DEPENDENT below) or has no campaign at all.
 *
 * `dealSource` is the Deal's source ("CAMPAIGN" | "BARTER" | "DIRECT"), needed
 * only by the two families below that split on it. Pass it for deal-linked
 * notifications; omit it elsewhere.
 */
export interface CampaignContext {
  /** Deal.source — "CAMPAIGN" | "BARTER" | "DIRECT". Null when not deal-linked. */
  dealSource?: string | null;
  /** True when the notification carries a Deal relation. */
  isDealLinked?: boolean;
  /** The Brevo template the call site picked, where that identifies the variant. */
  emailTemplateId?: number | null;
}

// DEAL_CANCELLED covers six different situations and the call sites already
// distinguish them by Brevo template, so reuse that rather than inventing a
// second discriminator. 69/70 are admin cancellations, which have no WhatsApp
// campaign; 55-58 are the auto-cancels, still blocked on Navneet confirming
// which of "No Tracking" / "No Response" is which.
const CANCELLED_BY_TEMPLATE: Record<number, string> = {
  49: "Deal Cancelled Shipping-Creator",
  50: "Deal Cancelled Shipping-Brand",
  71: "Deal Cancelled Concept-Brand",
  72: "Deal Cancelled Concept-Creator",
};

export function resolveWhatsAppCampaign(
  type: string,
  userType: UserType,
  ctx: CampaignContext = {},
): WhatsAppCampaign | null {
  const { dealSource, isDealLinked, emailTemplateId } = ctx;
  // Completion splits four ways on (recipient, barter-or-not) — the same split
  // dealCompletedTemplateId() makes for email. Campaigns 71-74.
  if (type === "DEAL_COMPLETED") {
    const barter = dealSource === "BARTER";
    return userType === "CREATOR"
      ? { campaign: barter ? "Deal Completed Barter-Creator" : "Deal Completed-Creator", param2: COUNTERPARTY }
      : { campaign: barter ? "Deal Completed Barter-Brand" : "Deal Completed-Brand", param2: COUNTERPARTY };
  }
  // Deal going live. The creator's copy differs for campaign vs direct deals;
  // the brand gets one campaign, and that one is single-param (verified live).
  if (type === "DEAL_LIVE" || type === "PAYMENT_DONE_DEAL_STARTED") {
    if (userType === "BRAND") return { campaign: "Deal Started-Brand" };
    return {
      campaign: dealSource === "DIRECT" ? "Deal Started Direct-Creator" : "Deal Started Campaign-Creator",
      param2: COUNTERPARTY,
    };
  }
  if (type === "DEAL_CANCELLED") {
    const campaign = emailTemplateId ? CANCELLED_BY_TEMPLATE[emailTemplateId] : undefined;
    return campaign ? { campaign, param2: COUNTERPARTY } : null;
  }
  // A brand pays either for a specific deal or for a credit top-up. Only the
  // former carries a Deal relation, and the credit template takes just a name.
  if (type === "PAYMENT_SUCCESS") {
    return isDealLinked
      ? { campaign: "Deal Payment Confirmed-Brand", param2: COUNTERPARTY }
      : { campaign: "Brand Credit Payment Confirmed-Brand" };
  }
  if (BY_USER_TYPE[type]) return BY_USER_TYPE[type][userType] ?? null;
  return SIMPLE[type] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────
// CONTEXT-DEPENDENT — deliberately NOT resolved here, because the campaign
// depends on context the `type` alone doesn't carry. These mirror the
// equivalent block in brevoTemplates.ts and need the same call-site wiring:
//
//   PAYMENT_SUCCESS       -> "Deal Payment Confirmed-Brand" (deal) vs
//                            "Brand Credit Payment Confirmed-Brand" (credits).
//   DEAL_CANCELLED        -> "Deal Cancelled Concept-{Brand,Creator}" vs
//                            "Deal Cancelled Shipping-{Brand,Creator}".
//   *_INACTIVITY_* /
//   DEAL_EXPIRED          -> "Deal Overdue-Brand", "Deal Pending Day2-Creator",
//                            "Deal Pending Day3-Creator",
//                            "Deal Post Pending Day5-Creator",
//                            "Deal Video Pending Day7-Creator" — by stage+day.
//   AWB_WRONG_AUTO_CANCEL /
//   PRODUCT_ISSUE_AUTO_CANCEL -> "Autocancel No Tracking-{Brand,Creator}" vs
//                            "Autocancel No Response-{Brand,Creator}". Which
//                            auto-cancel maps to which needs confirming against
//                            the approved copy before wiring.
//
// Also unmapped: "Barter Status Resumed-Brand" — no distinct notification type
// exists for resuming a barter from hold (BARTER_LIVE covers going active).
// ─────────────────────────────────────────────────────────────────────────
