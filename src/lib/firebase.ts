// src/lib/firebase.ts
import admin from "firebase-admin";

/**
 * Inicializa Firebase Admin una sola vez.
 * Soporta dos formas de credenciales:
 * 1) Variable de entorno FIREBASE_SERVICE_ACCOUNT_JSON con el JSON del service account (stringificado).
 * 2) GOOGLE_APPLICATION_CREDENTIALS apuntando a un archivo .json (applicationDefault()).
 *
 * Opcional: puedes forzar el projectId con FIREBASE_PROJECT_ID.
 */

function parseServiceAccountFromEnv():
  | admin.ServiceAccount
  | undefined {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return undefined;

  try {
    // Puede venir ya como JSON o escapado
    return JSON.parse(raw);
  } catch {
    // Si está doblemente escapado, intenta una segunda pasada
    try {
      return JSON.parse(JSON.parse(raw));
    } catch (err) {
      console.warn(
        "[firebase] No se pudo parsear FIREBASE_SERVICE_ACCOUNT_JSON:",
        err
      );
      return undefined;
    }
  }
}

if (!admin.apps.length) {
  const svc = parseServiceAccountFromEnv();
  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (svc) {
    admin.initializeApp({
      credential: admin.credential.cert(svc),
      projectId, // opcional (usará el del JSON si no lo pasas)
    });
  } else {
    // Usará GOOGLE_APPLICATION_CREDENTIALS si está definida,
    // o credenciales del entorno (p.ej. en Cloud Run / GCP).
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
    });
  }

  console.log(
    `[firebase] Admin inicializado (projectId: ${
      admin.app().options.projectId ?? "desconocido"
    })`
  );
}

// Exporta los servicios que usarás en el resto del backend
export const auth = admin.auth();
export const messaging = admin.messaging();
export const firestore = admin.firestore();

export default admin;
