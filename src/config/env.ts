// src/config/env.ts
import "dotenv/config";

const must = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing required env var ${k}`);
  return v;
};

const num = (k: string, d: number) => parseInt(process.env[k] ?? String(d), 10);

export const ENV = {
  // ===== Básicos =====
  PORT: num("PORT", 3000),
  NODE_ENV: process.env.NODE_ENV ?? "production",

  // ===== Uploads =====
  UPLOAD_DIR: process.env.UPLOAD_DIR ?? "uploads",
  MAX_UPLOAD_MB: num("MAX_UPLOAD_MB", 10),

  // ===== DB =====
  DATABASE_URL: must("DATABASE_URL"),

  // ===== CORS =====
  // Coma-separado. Ej: "https://macleapp.com,https://legal.macleapp.com"
  CORS_ORIGIN: must("CORS_ORIGIN").split(",").map(s => s.trim()),

  // ===== JWT =====
  JWT_ACCESS_SECRET: must("JWT_ACCESS_SECRET"),
  JWT_REFRESH_SECRET: must("JWT_REFRESH_SECRET"),
  JWT_EMAIL_VERIFY_SECRET: must("JWT_EMAIL_VERIFY_SECRET"),
  JWT_ACCESS_EXPIRES: process.env.JWT_ACCESS_EXPIRES ?? "15m",
  JWT_REFRESH_EXPIRES: process.env.JWT_REFRESH_EXPIRES ?? "7d",

  // ===== URLs usadas en correos (para construir deep links) =====
  APP_PUBLIC_URL: must("APP_PUBLIC_URL"),            // p.ej. https://macleapp.com
  EMAIL_VERIFY_ROUTE: must("EMAIL_VERIFY_ROUTE"),    // p.ej. /verify-email
  PASSWORD_RESET_ROUTE: must("PASSWORD_RESET_ROUTE"),// p.ej. /reset-password

  // ===== Firebase =====
  EMAIL_PROVIDER: "firebase" as const,               
  FIREBASE: {
    // Opcional si usas GOOGLE_APPLICATION_CREDENTIALS en Render
    SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
  },

  // ===== Google Sign-In (solo client id) =====
  GOOGLE_CLIENT_ID: must("GOOGLE_CLIENT_ID"),

  // ===== Payments (opcional) =====
  PAYMENT_WEBHOOK_SECRET: process.env.PAYMENT_WEBHOOK_SECRET ?? "",
} as const;