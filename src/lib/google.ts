// src/lib/google.ts
import { OAuth2Client } from "google-auth-library";
import { ENV } from "../config/env";

if (!ENV.GOOGLE_CLIENT_ID) {
  throw new Error("Falta GOOGLE_CLIENT_ID en variables de entorno");
}

// Reutiliza un solo cliente para evitar overhead
const googleClient = new OAuth2Client(ENV.GOOGLE_CLIENT_ID);

export type GooglePayload = {
  iss?: string;
  aud?: string;
  sub?: string;      // google user id
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
  locale?: string;
};

/**
 * Verifica el idToken de Google y devuelve el payload (email, sub, name, picture, etc.)
 * Lanza error si el token no es válido o el aud no coincide con GOOGLE_CLIENT_ID.
 */
export async function verifyGoogleToken(idToken: string): Promise<GooglePayload> {
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: ENV.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) throw new Error("Token de Google inválido");

    // Validación defensiva del 'aud' (aunque verifyIdToken ya lo hace)
    if (payload.aud !== ENV.GOOGLE_CLIENT_ID) {
      throw new Error("Google audience no coincide");
    }

    return payload as GooglePayload;
  } catch (err: any) {
    // Normaliza el error hacia arriba (router lo captura y responde 401)
    throw new Error(err?.message || "Fallo al verificar token de Google");
  }
}