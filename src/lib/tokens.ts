// src/lib/tokens.ts
import { sign, verify, type Secret, type SignOptions, type JwtPayload } from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";

export type Payload = JwtPayload & { uid: number; jti?: string };

const ACCESS_SECRET: Secret = process.env.JWT_ACCESS_SECRET || "";
const REFRESH_SECRET: Secret = process.env.JWT_REFRESH_SECRET || "";

const ACCESS_EXPIRES: SignOptions["expiresIn"] =
  (process.env.JWT_ACCESS_EXPIRES as SignOptions["expiresIn"]) ?? "15m";
const REFRESH_EXPIRES: SignOptions["expiresIn"] =
  (process.env.JWT_REFRESH_EXPIRES as SignOptions["expiresIn"]) ?? "7d";

// Validación temprana (evita levantar el server sin llaves JWT)
if (!ACCESS_SECRET || !REFRESH_SECRET) {
  throw new Error("❌ Faltan JWT_ACCESS_SECRET o JWT_REFRESH_SECRET en .env");
}

/* =========================
   Generación de Tokens
   ========================= */
export function signAccessToken(userId: number) {
  const payload: Payload = { uid: userId };
  return sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES });
}

export function signRefreshToken(userId: number) {
  const payload: Payload = { uid: userId, jti: uuidv4() };
  return sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES });
}

/* =========================
   Verificación de Tokens
   ========================= */
export function verifyAccess(token: string): Payload {
  return verify(token, ACCESS_SECRET) as Payload;
}

export function verifyRefresh(token: string): Payload {
  return verify(token, REFRESH_SECRET) as Payload;
}

/* =========================
   Issue (par de tokens)
   ========================= */
export function issueTokens(userId: number) {
  return {
    accessToken: signAccessToken(userId),
    refreshToken: signRefreshToken(userId),
  };
}