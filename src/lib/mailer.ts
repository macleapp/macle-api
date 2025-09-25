// Genera enlaces de verificación / reset usando Firebase Admin.
// Ojo: Firebase Admin **no envía** correos automáticamente;
// solo devuelve el link. El cliente (frontend) usa el link para enviar/verificar.

import { auth as adminAuth } from "./firebase";

// Opcional: personalizar la URL de redirección
function actionCodeSettings() {
  const url = process.env.APP_PUBLIC_VERIFY_REDIRECT_URL; // ej: https://macleapp.com/after-verify
  return url ? { url } : undefined;
}

/** Genera enlace de verificación de email con Firebase */
export async function sendVerificationEmail(email: string): Promise<string> {
  const link = await adminAuth.generateEmailVerificationLink(email, actionCodeSettings());
  return link;
}

/** Genera enlace de restablecimiento de contraseña con Firebase */
export async function sendPasswordResetEmail(email: string): Promise<string> {
  const link = await adminAuth.generatePasswordResetLink(email, actionCodeSettings());
  return link;
}