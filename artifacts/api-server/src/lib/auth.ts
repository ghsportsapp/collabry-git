import crypto from "crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import bcryptjs from "bcryptjs";

export enum UserType {
  CREATOR = "CREATOR",
  BRAND = "BRAND",
  ADMIN = "ADMIN",
}

export interface TokenPayload {
  userId: string;
  userType: UserType;
  /** Set to "preauth" on the short-lived admin step-1 token. A preauth token is
   *  only accepted by the admin OTP step — never by requireAdminAuth. */
  scope?: string;
  iat?: number;
  exp?: number;
}

function getAccessSecret(): string {
  const s = process.env["JWT_ACCESS_SECRET"];
  if (!s) throw new Error("JWT_ACCESS_SECRET is not set");
  return s;
}

function getAdminSecret(): string {
  const s = process.env["JWT_ADMIN_SECRET"];
  if (!s) throw new Error("JWT_ADMIN_SECRET is not set");
  return s;
}

export function generateAccessToken(
  userId: string,
  userType: UserType,
  secret: string
): string {
  const payload: Omit<TokenPayload, "iat" | "exp"> = { userId, userType };
  const options: SignOptions = { expiresIn: "15m" };
  return jwt.sign(payload, secret, options);
}

/** Short-lived admin step-1 token: proves email+password were verified, so the
 *  OTP step can't be skipped. Carries scope "preauth" and is rejected by
 *  requireAdminAuth (it only grants access to the OTP step). */
export function generateAdminPreAuthToken(userId: string): string {
  return jwt.sign(
    { userId, userType: UserType.ADMIN, scope: "preauth" },
    getAdminSecret(),
    { expiresIn: "5m" } as SignOptions
  );
}

export function generateRefreshToken(
  userId: string,
  userType: UserType
): string {
  const secret =
    userType === UserType.ADMIN ? getAdminSecret() : getAccessSecret();
  const expiresIn: string =
    userType === UserType.ADMIN ? "8h" : "30d";
  const payload = { userId, userType, jti: crypto.randomUUID() };
  return jwt.sign(payload, secret, { expiresIn } as SignOptions);
}

export function verifyToken(token: string, secret: string): TokenPayload {
  return jwt.verify(token, secret) as TokenPayload;
}

export async function hashPassword(password: string): Promise<string> {
  return bcryptjs.hash(password, 12);
}

export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcryptjs.compare(password, hash);
}

export { getAccessSecret, getAdminSecret };
