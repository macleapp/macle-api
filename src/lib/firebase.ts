import admin from "firebase-admin";

/**
 * Inicializa Firebase Admin una sola vez.
 * Usa:
 * - FIREBASE_SERVICE_ACCOUNT_JSON (contenido del JSON como string) o
 * - GOOGLE_APPLICATION_CREDENTIALS apuntando a un archivo .json.
 */

function parseServiceAccountFromEnv():
  | admin.ServiceAccount
  | undefined {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return undefined;

  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(JSON.parse(raw));
    } catch (err) {
      console.warn("[firebase] No se pudo parsear FIREBASE_SERVICE_ACCOUNT_JSON:", err);
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
      projectId,
    });
  } else {
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

// Exporta servicios
export const auth = admin.auth();
export const messaging = admin.messaging();
export const firestore = admin.firestore();

export default admin;