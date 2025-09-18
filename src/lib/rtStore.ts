// src/lib/rtStore.ts
import { Prisma } from "@prisma/client";
import  prisma  from '../lib/prisma';

/** Guarda el jti del refresh recién emitido (idempotente ante duplicados) */
export async function saveRefreshJti(userId: number, jti: string) {
  try {
    await prisma.refreshToken.create({
      data: { userId, jti }, // revokedAt = null por defecto
    });
  } catch (e: any) {
    // Si se repite el jti (unique) lo tratamos como éxito idempotente
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return;
    throw e;
  }
}

/** Devuelve true si NO existe o si ya fue revocado */
export async function isRevoked(jti: string): Promise<boolean> {
  const row = await prisma.refreshToken.findUnique({ where: { jti } });
  return !row || row.revokedAt !== null;
}

/** Revoca el jti viejo (si no existe no revienta) */
export async function rotateRefreshJti(oldJti: string) {
  try {
    await prisma.refreshToken.update({
      where: { jti: oldJti },
      data: { revokedAt: new Date() },
    });
  } catch (e: any) {
    // Si no existe, no hacemos nada (ya no es válido)
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") return;
    throw e;
  }
}

/** Revoca todos los refresh tokens activos del usuario (logout global) */
export async function revokeAllUserTokens(userId: number) {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Limpieza opcional: elimina refresh tokens antiguos ya revocados (retención en días) */
export async function purgeRevokedOlderThan(days = 30) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.deleteMany({
    where: {
      revokedAt: { not: null, lt: cutoff },
    },
  });
}