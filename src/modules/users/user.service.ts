// src/modules/users/user.service.ts
import bcrypt from "bcryptjs";
import prisma from "../../lib/prisma";

export type UpdateMeDTO = {
  name?: string | null;
};

export const usersService = {
  /** Perfil propio (para pantalla Cuenta / Ajustes) */
  async getMe(userId: number) {
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerified: true,
        emailVerifiedAt: true,
        paidVerified: true,
        paidVerifiedAt: true,
        onboardingCompleted: true,
        business: { select: { id: true, name: true, phone: true, city: true } },
        serviceProfile: { select: { id: true, name: true, phone: true, city: true } },
      },
    });
    if (!me) throw new Error("Usuario no encontrado");
    return me;
  },

  /** Perfil público por id (no expone email ni campos sensibles) */
  async getPublicById(userId: number) {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        role: true,
        business: { select: { id: true, name: true, city: true } },
        serviceProfile: { select: { id: true, name: true, city: true } },
      },
    });
    if (!u) throw new Error("Usuario no encontrado");
    return u;
  },

  /** Actualiza datos básicos del usuario (p.ej. nombre) */
  async updateMe(userId: number, data: UpdateMeDTO) {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerified: true,
        emailVerifiedAt: true,
        paidVerified: true,
        paidVerifiedAt: true,
      },
    });
    return updated;
  },

  /** Cambiar contraseña y revocar refresh tokens activos */
  async changePassword(userId: number, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("Usuario no encontrado");

    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) throw new Error("Contraseña actual incorrecta");

    const hash = await bcrypt.hash(newPassword, 10);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { password: hash },
      }),
      prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { ok: true as const };
  },

  /** Marca verificación por pago (badge) */
  async setPaidVerified(userId: number, verified: boolean) {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        paidVerified: verified,
        paidVerifiedAt: verified ? new Date() : null,
      },
      select: { id: true, paidVerified: true, paidVerifiedAt: true },
    });
    return updated;
  },
};