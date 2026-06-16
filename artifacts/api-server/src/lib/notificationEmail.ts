export const EMAIL_NOTIFICATION_TYPES: ReadonlySet<string> = new Set([
  "PAYMENT_SUCCESS",
  "DEAL_LIVE",
  "DEAL_COMPLETED",
  "DEAL_CANCELLED",
  "PAYOUT_RELEASED",
  "PAYOUT_PENDING_KYC",
  "INVOICE_READY",
  "DEAL_DISPUTE_RAISED",
  "DEAL_DISPUTE_RESOLVED",
  "DEAL_FLAGGED",
  "ACCOUNT_SUSPENDED",
  "WELCOME_CREDITS",
  "CAMPAIGN_LIVE",
  "COLLAB_OFFER",
  "REQUEST_RECEIVED",
]);

export function shouldEmailNotification(type: string): boolean {
  return EMAIL_NOTIFICATION_TYPES.has(type);
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export function renderNotificationEmail(input: {
  title: string;
  body: string;
}): RenderedEmail {
  const appUrl = process.env["APP_BASE_URL"] ?? "https://collabry.co";
  const safeTitle = escapeHtml(input.title);
  const safeBody = escapeHtml(input.body).replace(/\n/g, "<br>");

  return {
    subject: input.title,
    text: `${input.title}\n\n${input.body}\n\nOpen Collabry: ${appUrl}`,
    html: `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0A0A0F;font-family:'Helvetica Neue',Arial,sans-serif;color:#ffffff;">
    <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
      <div style="font-size:24px;font-weight:700;color:#F0187A;margin-bottom:24px;letter-spacing:0.5px;">Collabry</div>
      <div style="background:#15151c;border-radius:12px;padding:28px;">
        <h1 style="font-size:20px;margin:0 0 12px;color:#ffffff;font-weight:600;">${safeTitle}</h1>
        <p style="font-size:15px;line-height:1.55;color:#cfcfd6;margin:0 0 24px;">${safeBody}</p>
        <a href="${appUrl}" style="display:inline-block;background:#F0187A;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">Open Collabry</a>
      </div>
      <p style="font-size:12px;color:#7d7d87;margin-top:24px;text-align:center;">You're receiving this because of activity on your Collabry account.</p>
    </div>
  </body>
</html>`,
  };
}

/** Password-reset email with a tap-through button to the reset page. */
export function renderPasswordResetEmail(input: {
  resetUrl: string;
  expiresMinutes: number;
}): RenderedEmail {
  const safeUrl = escapeHtml(input.resetUrl);
  const mins = input.expiresMinutes;
  let expiryLabel: string;
  if (mins % 60 === 0) {
    const hours = mins / 60;
    expiryLabel = `${hours} hour${hours > 1 ? "s" : ""}`;
  } else {
    expiryLabel = `${mins} minutes`;
  }

  return {
    subject: "Reset your Collabry password",
    text:
      `We received a request to reset your Collabry password.\n\n` +
      `Reset it here: ${input.resetUrl}\n\n` +
      `This link expires in ${expiryLabel}. If you didn't request this, you can safely ignore this email — your password won't change.`,
    html: `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0A0A0F;font-family:'Helvetica Neue',Arial,sans-serif;color:#ffffff;">
    <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
      <div style="font-size:24px;font-weight:700;color:#F0187A;margin-bottom:24px;letter-spacing:0.5px;">Collabry</div>
      <div style="background:#15151c;border-radius:12px;padding:28px;">
        <h1 style="font-size:20px;margin:0 0 12px;color:#ffffff;font-weight:600;">Reset your password</h1>
        <p style="font-size:15px;line-height:1.55;color:#cfcfd6;margin:0 0 24px;">We received a request to reset your Collabry password. Tap the button below to choose a new one.</p>
        <a href="${safeUrl}" style="display:inline-block;background:#F0187A;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">Reset password</a>
        <p style="font-size:13px;line-height:1.55;color:#7d7d87;margin:24px 0 0;">This link expires in ${expiryLabel}. If you didn't request this, you can safely ignore this email — your password won't change.</p>
      </div>
      <p style="font-size:12px;color:#7d7d87;margin-top:24px;text-align:center;">You're receiving this because a password reset was requested for your Collabry account.</p>
    </div>
  </body>
</html>`,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default:  return c;
    }
  });
}
