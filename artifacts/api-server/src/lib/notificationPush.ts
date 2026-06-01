/**
 * Notification types that should also send a push notification.
 *
 * Push is higher-friction than email — once a user has installed the PWA and
 * granted permission, every push wakes the device. Keep this list tight:
 * money/commitment/safety events only. Day-to-day workflow events stay
 * in-app only.
 */
export const PUSH_NOTIFICATION_TYPES: ReadonlySet<string> = new Set([
  "PAYMENT_SUCCESS",
  "DEAL_LIVE",
  "DEAL_COMPLETED",
  "DEAL_CANCELLED",
  "PAYOUT_RELEASED",
  "PAYOUT_PENDING_KYC",
  "DEAL_DISPUTE_RAISED",
  "DEAL_DISPUTE_RESOLVED",
  "DEAL_FLAGGED",
  "ACCOUNT_SUSPENDED",
  "CAMPAIGN_LIVE",
  "COLLAB_OFFER",
  "REQUEST_RECEIVED",
  "DEAL_CHAT_MESSAGE",
]);

export function shouldPushNotification(type: string): boolean {
  return PUSH_NOTIFICATION_TYPES.has(type);
}
