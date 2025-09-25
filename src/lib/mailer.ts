// src/lib/mailer.ts
// Genera enlaces de verificación / reset usando Firebase Admin.
// NOTA: Firebase Admin **no envía** el correo automáticamente;
// solo devuelve el link. Tú decides cómo enviarlo (o solo devolverlo al cliente).

import { auth as adminAuth } from "./firebase"; // Asegúrate de que "./firebase" inicializa firebase-admin

// Opcional: configura la URL a donde quieres que redirija el link
function actionCodeSettings() {
  // Puedes ajustar estos valores o leerlos de variables de entorno
  const url = process.env.APP_PUBLIC_VERIFY_REDIRECT_URL; // p.ej. https://tu-app.com/after-verify
  return url ? { url } : undefined;
}

/**
 * Genera el enlace de verificación de email en Firebase.
 * Firma compatible: si tu controller aún pasa (email, token), el token se ignora.
 */
export async function sendVerificationEmail(email: string, _legacyToken?: string): Promise<string> {
  const link = await adminAuth.generateEmailVerificationLink(email, actionCodeSettings());
  // Aquí NO se envía correo; solo devolvemos el link.
  return link;
}

/**
 * Genera el enlace de restablecimiento de contraseña en Firebase.
 */
export async function sendPasswordResetEmail(email: string): Promise<string> {
  const link = await adminAuth.generatePasswordResetLink(email, actionCodeSettings());
  return link;
}