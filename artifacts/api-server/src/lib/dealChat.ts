import { pool } from "@workspace/db";

export async function createSystemMessage(
  dealId: string,
  content: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO "DealMessage" (id,"dealId","senderType","messageType",content,metadata,"createdAt")
       VALUES (gen_random_uuid(),$1,'SYSTEM','SYSTEM_MESSAGE',$2,$3,NOW())`,
      [dealId, content, metadata ? JSON.stringify(metadata) : null]
    );
  } catch {
    // Never let a system message failure break the main operation
  }
}
