// src/lib/emailTokens.ts
import jwt, { JwtPayload } from "jsonwebtoken";
import { ENV } from "../config/env";

export type EmailPayload = JwtPayload & {
  uid: number;   // id del usuario
  email: string; // correo del usuario
};

/**
 * Genera token de verificación de correo válido 24h
 */
export function generateEmailToken(userId: number, email: string): string {
  if (!ENV.JWT_EMAIL_VERIFY_SECRET) {
    throw new Error("Falta JWT_EMAIL_VERIFY_SECRET en variables de entorno");
  }

  return jwt.sign(
    { uid: userId, email },
    ENV.JWT_EMAIL_VERIFY_SECRET,
    { expiresIn: "24h" }
  );
}

/**
 * Verifica y devuelve el payload del token de verificación
 */
export function verifyEmailToken(token: string): EmailPayload {
  if (!ENV.JWT_EMAIL_VERIFY_SECRET) {
    throw new Error("Falta JWT_EMAIL_VERIFY_SECRET en variables de entorno");
  }

  const decoded = jwt.verify(token, ENV.JWT_EMAIL_VERIFY_SECRET);
  if (typeof decoded === "string") {
    throw new Error("Formato inválido en token de verificación");
  }
  return decoded as EmailPayload;
}