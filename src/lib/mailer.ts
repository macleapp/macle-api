// src/lib/mailer.ts
import { auth as adminAuth } from "./firebase";

// (opcional) si quieres que el link redirija a una URL tuya
function actionCodeSettings() {
  const url = process.env.APP_PUBLIC_VERIFY_REDIRECT_URL; // ej. https://macleapp.com/verified
  return url ? { url } : undefined;
}

/** Genera el link de verificación en Firebase */
export async function sendVerificationEmail(email: string): Promise<string> {
  const link = await adminAuth.generateEmailVerificationLink(email, actionCodeSettings());
  return link; // devuélvelo y muéstralo en el front por ahora
}

/** Genera el link de reset de contraseña en Firebase */
export async function sendPasswordResetEmail(email: string): Promise<string> {
  const link = await adminAuth.generatePasswordResetLink(email, actionCodeSettings());
  return link;
}