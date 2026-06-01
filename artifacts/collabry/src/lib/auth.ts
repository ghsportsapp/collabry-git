import { UserType } from "../types";

export interface TokenPayload {
  userId: string;
  userType: UserType;
  iat?: number;
  exp?: number;
}

/** Base64-decodes the JWT payload without verifying the signature.
 *  Safe to run in the browser; the server is the source of truth for trust. */
export function decodeTokenPayload(token: string): TokenPayload | null {
  try {
    const base64 = token.split(".")[1];
    if (!base64) return null;
    return JSON.parse(atob(base64)) as TokenPayload;
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const payload = decodeTokenPayload(token);
  if (!payload?.exp) return true;
  return Date.now() >= payload.exp * 1000;
}
