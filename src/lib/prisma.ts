// src/lib/prisma.ts
import { PrismaClient } from "@prisma/client";

const isProd = process.env.NODE_ENV === "production";

// Reutiliza una única instancia en dev para evitar crear múltiples clientes en HMR
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProd ? ["error"] : ["warn", "error"], // en prod solo errores
  });

// Guarda instancia en global en desarrollo
if (!isProd) globalForPrisma.prisma = prisma;

// Cierre ordenado en señales comunes (PM2, Docker, etc.)
const gracefulShutdown = async () => {
  try {
    await prisma.$disconnect();
  } catch {
    /* noop */
  } finally {
    process.exit(0);
  }
};

process.once("SIGINT", gracefulShutdown);
process.once("SIGTERM", gracefulShutdown);

export default prisma;