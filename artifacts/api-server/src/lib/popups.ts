import { pool } from "@workspace/db";
import { sendToCreator, sendToBrand } from "./sseManager";

export interface CreatePopupInput {
  userId: string;
  userType: "CREATOR" | "BRAND";
  type: string;
  title: string;
  body: string;
  ctaText: string;
  ctaPath: string;
  isCelebration?: boolean;
  relatedEntityId?: string;
  externalNote?: string;
  secondCtaText?: string;
  secondCtaPath?: string;
}

export async function createPopup(input: CreatePopupInput): Promise<void> {
  const { rows } = await pool.query(
    `INSERT INTO "Popup" (id,"userId","userType",type,title,body,"ctaText","ctaPath","isCelebration",status,"relatedEntityId","externalNote","expiresAt","secondCtaText","secondCtaPath")
     VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,'PENDING',$9,$10,NOW()+INTERVAL '7 days',$11,$12)
     RETURNING id,title,body,"ctaText","ctaPath","isCelebration","secondCtaText","secondCtaPath"`,
    [
      input.userId, input.userType, input.type,
      input.title, input.body, input.ctaText, input.ctaPath,
      input.isCelebration ?? false,
      input.relatedEntityId ?? null, input.externalNote ?? null,
      input.secondCtaText ?? null, input.secondCtaPath ?? null,
    ],
  );
  const popup = rows[0];
  if (!popup) return;

  const ssePayload = {
    id: popup.id,
    type: input.type,
    title: popup.title,
    body: popup.body,
    ctaText: popup.ctaText,
    ctaPath: popup.ctaPath,
    isCelebration: popup.isCelebration,
    secondCtaText: popup.secondCtaText ?? null,
    secondCtaPath: popup.secondCtaPath ?? null,
  };

  if (input.userType === "CREATOR") {
    sendToCreator(input.userId, "popup", ssePayload);
  } else {
    sendToBrand(input.userId, "popup", ssePayload);
  }
}
