// src/modules/auth/auth.service.ts
import { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import { randomBytes } from "crypto";
import prisma from "../../lib/prisma";
import { ENV } from "../../config/env";
import { sendVerificationEmail } from "../../lib/mailer";

/* =========================
   Tipos y utilidades
   ========================= */
export type PublicUser = {
  id: number;
  email: string;
  role: Role;
  name?: string | null;
  emailVerified: boolean;
  emailVerifiedAt?: Date | null;
  paidVerified: boolean;
  paidVerifiedAt?: Date | null;
};

function toPublicUser(u: any): PublicUser {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    name: u.name ?? null,
    emailVerified: !!u.emailVerified,
    emailVerifiedAt: u.emailVerifiedAt ?? null,
    paidVerified: !!u.paidVerified,
    paidVerifiedAt: u.paidVerifiedAt ?? null,
  };
}

/** Token de verificación seguro */
function newEmailToken(): string {
  return randomBytes(32).toString("hex");
}

/* =========================
   JWT helpers
   ========================= */
function signAccessToken(user: { id: number; role: Role }): string {
  return jwt.sign(
    { sub: user.id, role: user.role },
    ENV.JWT_ACCESS_SECRET as string,
    { expiresIn: ENV.JWT_ACCESS_EXPIRES } as SignOptions
  );
}

function signRefreshToken(userId: number, jti: string): string {
  return jwt.sign(
    { sub: userId, jti },
    ENV.JWT_REFRESH_SECRET as string,
    { expiresIn: ENV.JWT_REFRESH_EXPIRES } as SignOptions
  );
}

/* =========================
   Servicio de Auth
   ========================= */
export const AuthService = {
  /** Registro con envío de verificación por correo */
  async register(input: {
    email: string;
    password: string;
    name?: string;
    role?: Role;
  }) {
    const { email, password, name, role } = input;

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) throw new Error("El email ya está registrado");

    const hash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hash,
        role: role ?? Role.CUSTOMER,
        name: name ?? null,
        emailVerified: false,
        paidVerified: false, // badge solo cuando pague
      },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        emailVerified: true,
        emailVerifiedAt: true,
        paidVerified: true,
        paidVerifiedAt: true,
      },
    });

    // crear token de verificación (60 min)
    const token = newEmailToken();
    const expires = new Date(Date.now() + 60 * 60 * 1000);
    await prisma.emailVerificationToken.create({
      data: { userId: user.id, token, expiresAt: expires },
    });

    await sendVerificationEmail(user.email);

    // crear registro de refresh token (para revocación por jti si lo necesitas)
    const jti = randomBytes(16).toString("hex");
    await prisma.refreshToken.create({ data: { userId: user.id, jti } });

    const accessToken = signAccessToken({ id: user.id, role: user.role });
    const refreshToken = signRefreshToken(user.id, jti);

    return {
      user: toPublicUser(user),
      tokens: { accessToken, refreshToken },
    };
  },

  /** Login (bloquea si email no verificado) */
  async login(input: { email: string; password: string }) {
    const { email, password } = input;

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        password: true,
        emailVerified: true,
        emailVerifiedAt: true,
        paidVerified: true,
        paidVerifiedAt: true,
      },
    });
    if (!user) throw new Error("Credenciales inválidas");

    // ⛔ Requiere verificación de email antes de permitir login
    if (!user.emailVerified) {
      throw new Error("Debes verificar tu correo antes de iniciar sesión.");
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) throw new Error("Credenciales inválidas");

    const jti = randomBytes(16).toString("hex");
    await prisma.refreshToken.create({ data: { userId: user.id, jti } });

    const accessToken = signAccessToken({ id: user.id, role: user.role });
    const refreshToken = signRefreshToken(user.id, jti);

    const { password: _omit, ...rest } = user;
    return { user: toPublicUser(rest), tokens: { accessToken, refreshToken } };
  },

  /** Reenviar correo de verificación */
  async resendVerification(userIdOrEmail: number | string) {
    const where =
      typeof userIdOrEmail === "number" ? { id: userIdOrEmail } : { email: userIdOrEmail };

    const user = await prisma.user.findUnique({
      where,
      select: { id: true, email: true, emailVerified: true },
    });
    if (!user) throw new Error("Usuario no encontrado");
    if (user.emailVerified) return { sent: false, reason: "already-verified" } as const;

    // invalidar tokens previos
    await prisma.emailVerificationToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = newEmailToken();
    const expires = new Date(Date.now() + 60 * 60 * 1000);
    await prisma.emailVerificationToken.create({
      data: { userId: user.id, token, expiresAt: expires },
    });

    await sendVerificationEmail(user.email);

    return { sent: true as const };
  },

  /** Confirmar verificación desde el enlace del email */
  async verifyEmail(token: string) {
    const rec = await prisma.emailVerificationToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!rec || rec.usedAt || rec.expiresAt < new Date()) {
      throw new Error("Token inválido o expirado");
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: rec.userId },
        data: { emailVerified: true, emailVerifiedAt: new Date() },
      }),
      prisma.emailVerificationToken.update({
        where: { id: rec.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { verified: true as const };
  },

  /** Revocar un refresh token por jti (logout puntual) */
  async logout(jti: string) {
    await prisma.refreshToken.updateMany({
      where: { jti, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true as const };
  },
};