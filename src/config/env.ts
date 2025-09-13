import "dotenv/config";

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var ${key}`);
  return value;
}

export const ENV = {
  // Básicos
  PORT: parseInt(process.env.PORT ?? "3000", 10),
  NODE_ENV: process.env.NODE_ENV ?? "development",

  // Uploads
  UPLOAD_DIR: process.env.UPLOAD_DIR ?? "uploads",
  MAX_UPLOAD_MB: parseInt(process.env.MAX_UPLOAD_MB ?? "10", 10),

  // DB
  DATABASE_URL: required("DATABASE_URL"),

  // CORS
  CORS_ORIGIN: required("CORS_ORIGIN").split(",").map((s) => s.trim()),

  // JWT
  JWT_ACCESS_SECRET: required("JWT_ACCESS_SECRET"),
  JWT_REFRESH_SECRET: required("JWT_REFRESH_SECRET"),
  JWT_EMAIL_VERIFY_SECRET: required("JWT_EMAIL_VERIFY_SECRET"),
  JWT_ACCESS_EXPIRES: process.env.JWT_ACCESS_EXPIRES ?? "15m",
  JWT_REFRESH_EXPIRES: process.env.JWT_REFRESH_EXPIRES ?? "7d",

  // URLs para enlaces en correos
  APP_PUBLIC_URL: required("APP_PUBLIC_URL"),
  EMAIL_VERIFY_ROUTE: required("EMAIL_VERIFY_ROUTE"),     // p.ej. /api/auth/verify-email
  PASSWORD_RESET_ROUTE: required("PASSWORD_RESET_ROUTE"), // p.ej. /api/auth/reset-password

  // Email (SMTP)
  SMTP_HOST: required("SMTP_HOST"),
  SMTP_PORT: parseInt(process.env.SMTP_PORT ?? "587", 10),
  SMTP_SECURE: process.env.SMTP_SECURE === "true", // false para 587 (STARTTLS), true para 465 (SSL)
  SMTP_USER: required("SMTP_USER"),
  SMTP_PASS: required("SMTP_PASS"),
  EMAIL_FROM: required("EMAIL_FROM"),

  // App
  APP_NAME: process.env.APP_NAME ?? "MACLE",

  // Google Sign-In (solo client id; NO pedimos client secret para verificar idToken)
  GOOGLE_CLIENT_ID: required("GOOGLE_CLIENT_ID"),

  // Payments (opcional)
  PAYMENT_WEBHOOK_SECRET: process.env.PAYMENT_WEBHOOK_SECRET ?? "",
} as const;