// src/modules/auth/auth.service.ts
import { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import jwt, { SignOptions } from "jsonwebtoken";

import prisma from "../../lib/prisma";
import { ENV } from "../../config/env";
import { sendVerificationEmail, sendPasswordResetEmail } from "../../lib/mailer";
import { auth as fbAuth } from "../../lib/firebase";

/* ===== Tipos ===== */
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

/* ===== Helpers ENV/JWT ===== */
function need(name: string, value?: string) {
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}
const ACCESS_SECRET = need("JWT_ACCESS_SECRET", ENV.JWT_ACCESS_SECRET);
const REFRESH_SECRET = need("JWT_REFRESH_SECRET", ENV.JWT_REFRESH_SECRET);
const ACCESS_EXPIRES: SignOptions["expiresIn"] =
  (ENV.JWT_ACCESS_EXPIRES as SignOptions["expiresIn"]) ?? "15m";
const REFRESH_EXPIRES: SignOptions["expiresIn"] =
  (ENV.JWT_REFRESH_EXPIRES as SignOptions["expiresIn"]) ?? "30d";

/** Firma access token */
function signAccessToken(user: { id: number; role: Role }): string {
  return jwt.sign(
    { sub: user.id, role: user.role },
    ACCESS_SECRET,
    { expiresIn: ACCESS_EXPIRES } as SignOptions
  );
}

/** Firma refresh token */
function signRefreshToken(userId: number, jti: string): string {
  return jwt.sign(
    { sub: userId, jti },
    REFRESH_SECRET,
    { expiresIn: REFRESH_EXPIRES } as SignOptions
  );
}

/* ===== Firebase helper ===== */
async function ensureFirebaseUser(email: string, uid: string) {
  try {
    await fbAuth.getUserByEmail(email);
  } catch {
    await fbAuth.createUser({ uid, email });
  }
}

/* ===== Servicio de Auth ===== */
export const AuthService = {
  /** Registro con verificación vía Firebase */
  async register(input: {
    email: string;
    password: string;
    name?: string;
    role?: Role;
    accepted?: boolean;
  }) {
    const em = input.email.toLowerCase().trim();

    const exists = await prisma.user.findUnique({ where: { email: em } });
    if (exists) throw new Error("El email ya está registrado");

    const hash = await bcrypt.hash(input.password, 10);

    const user = await prisma.user.create({
      data: {
        email: em,
        password: hash,
        role: input.role ?? Role.CUSTOMER,
        name: input.name ?? null,
        emailVerified: false,
        paidVerified: false,
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

    // Firebase: asegurar usuario y generar link de verificación
    await ensureFirebaseUser(user.email, String(user.id));
    const verifyLink = await sendVerificationEmail(user.email); // devuelve el link

    // JTI para refresh (si usas tabla de revocación)
    const jti = randomBytes(16).toString("hex");
    await prisma.refreshToken.create({ data: { userId: user.id, jti } });

    const accessToken = signAccessToken({ id: user.id, role: user.role });
    const refreshToken = signRefreshToken(user.id, jti);

    return {
      user: toPublicUser(user),
      verifyLink, // por ahora muéstralo en el front o logs
      tokens: { accessToken, refreshToken },
    };
  },

  /** Login (bloquea si email no verificado; intenta sincronizar con Firebase) */
  async login(input: { email: string; password: string }) {
    const em = input.email.toLowerCase().trim();

    let user = await prisma.user.findUnique({
      where: { email: em },
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

    if (!user.emailVerified) {
      try {
        const fb = await fbAuth.getUserByEmail(em);
        if (fb.emailVerified) {
          user = await prisma.user.update({
            where: { id: user.id },
            data: { emailVerified: true, emailVerifiedAt: new Date() },
            select: {
              id: true, email: true, role: true, name: true, password: true,
              emailVerified: true, emailVerifiedAt: true,
              paidVerified: true, paidVerifiedAt: true,
            },
          });
        }
      } catch {
        /* ignore */
      }
    }

    if (!user.emailVerified) {
      throw new Error("Debes verificar tu correo antes de iniciar sesión.");
    }

    const ok = await bcrypt.compare(input.password, user.password!);
    if (!ok) throw new Error("Credenciales inválidas");

    const jti = randomBytes(16).toString("hex");
    await prisma.refreshToken.create({ data: { userId: user.id, jti } });

    const accessToken = signAccessToken({ id: user.id, role: user.role });
    const refreshToken = signRefreshToken(user.id, jti);

    const { password: _omit, ...pub } = user;
    return { user: toPublicUser(pub), tokens: { accessToken, refreshToken } };
  },

  /** Reenviar verificación (Firebase) */
  async resendVerification(email: string) {
    const em = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({
      where: { email: em },
      select: { id: true, email: true, emailVerified: true },
    });
    if (!user) throw new Error("Usuario no encontrado");
    if (user.emailVerified) return { sent: false as const, reason: "already-verified" as const };

    await ensureFirebaseUser(user.email, String(user.id));
    const verifyLink = await sendVerificationEmail(user.email);
    return { sent: true as const, verifyLink };
  },

  /** Reset password (Firebase) – devuelve link por ahora */
  async forgotPassword(email: string) {
    const em = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({
      where: { email: em },
      select: { id: true, email: true },
    });
    if (!user) return { ok: true as const }; // respuesta genérica

    await ensureFirebaseUser(user.email, String(user.id));
    const resetLink = await sendPasswordResetEmail(user.email);
    return { ok: true as const, resetLink };
  },

  /** Sincroniza emailVerified desde Firebase (útil tras abrir el link) */
  async syncEmailVerified(email: string) {
    const em = email.toLowerCase().trim();
    const fb = await fbAuth.getUserByEmail(em);
    if (fb.emailVerified) {
      const updated = await prisma.user.update({
        where: { email: em },
        data: { emailVerified: true, emailVerifiedAt: new Date() },
        select: {
          id: true, email: true, role: true, name: true,
          emailVerified: true, emailVerifiedAt: true,
          paidVerified: true, paidVerifiedAt: true,
        },
      });
      return { ok: true as const, user: toPublicUser(updated) };
    }
    return { ok: false as const };
  },

  /** Logout por jti */
  async logout(jti: string) {
    await prisma.refreshToken.updateMany({
      where: { jti, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true as const };
  },
};