// src/modules/auth/auth.controller.ts
import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt, { SignOptions } from "jsonwebtoken";

import prisma from ".././lib/prisma";
import { authMW } from ".././lib/authMW";
import { issueTokens, verifyRefresh } from ".././lib/tokens";
import { saveRefreshJti, rotateRefreshJti, isRevoked, revokeAllUserTokens } from ".././lib/rtStore";
import { verifyGoogleToken } from ".././lib/google";
import { sendVerificationEmail /* , sendPasswordResetEmail */ } from ".././lib/mailer";
import { ENV } from ".././config/env";
import { Role } from "@prisma/client";
import { z } from "zod";

/* =========================
 *   Router
 * ========================= */
const router = Router();

/* =========================
 *   Schemas (Zod)
 * ========================= */
const registerSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    role: z.enum(["CUSTOMER", "SELLER", "PROVIDER"]).optional(),
  }),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
  }),
});

const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(10).optional(),
  }),
});

const resendSchema = z.object({
  body: z.object({
    email: z.string().email(),
  }),
});

const forgotSchema = z.object({
  body: z.object({
    email: z.string().email(),
  }),
});

const resetSchema = z.object({
  body: z.object({
    token: z.string().min(10),
    password: z.string().min(8),
  }),
});

/* =========================
 *   Helpers
 * ========================= */
type RefreshPayload = { uid: number; jti: string };

function readJwtPayload<T = any>(jwtStr: string): T {
  const base64 = jwtStr.split(".")[1];
  return JSON.parse(Buffer.from(base64, "base64").toString());
}

function minutesFromNow(mins: number) {
  return new Date(Date.now() + mins * 60 * 1000);
}

/* =========================
 *   REGISTER
 * ========================= */
router.post("/register", async (req, res) => {
  try {
    const parsed = registerSchema.parse({ body: req.body });
    const { email, password, role, name } = parsed.body;

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(400).json({ ok: false, msg: "El correo ya está registrado" });

    const hash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hash,
        role: (role as Role) ?? "CUSTOMER",
        emailVerified: false,
        paidVerified: false,
        paidVerifiedAt: null,
      },
      include: { business: true },
    });

    // Generar token de verificación (DB) y enviar correo
    const token = crypto.randomBytes(32).toString("hex");
    await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt: minutesFromNow(60), // 60 min
      },
    });
    await sendVerificationEmail(user.email, token);

    return res.json({
      ok: true,
      msg: "Usuario registrado. Revisa tu correo para verificar la cuenta.",
    });
  } catch (e: any) {
    const msg = e?.issues?.[0]?.message ?? e.message ?? "Error";
    return res.status(400).json({ ok: false, msg });
  }
});

/* =========================
 *   VERIFY EMAIL
 *   Soporta /verify-email/:token o /verify-email?token=...
 * ========================= */
router.get("/verify-email/:token?", async (req: Request, res: Response) => {
  try {
    const tokenFromParam = req.params?.token;
    const tokenFromQuery = (req.query?.token as string | undefined) ?? undefined;
    const token = tokenFromParam || tokenFromQuery;
    if (!token) return res.status(400).json({ ok: false, msg: "Token inválido" });

    const rec = await prisma.emailVerificationToken.findUnique({ where: { token } });
    if (!rec || rec.usedAt || rec.expiresAt < new Date()) {
      return res.status(400).json({ ok: false, msg: "Token inválido o expirado" });
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

    return res.json({ ok: true, msg: "Correo verificado con éxito. Ya puedes iniciar sesión." });
  } catch (e: any) {
    return res.status(400).json({ ok: false, msg: e.message ?? "Token inválido" });
  }
});

/* =========================
 *   RESEND VERIFICATION
 * ========================= */
router.post("/resend-verification", async (req, res) => {
  try {
    const parsed = resendSchema.parse({ body: req.body });
    const { email } = parsed.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(400).json({ ok: false, msg: "Usuario no encontrado" });
    if (user.emailVerified) {
      return res.status(400).json({ ok: false, msg: "El correo ya está verificado" });
    }

    // Invalida anteriores y emite nuevo
    await prisma.emailVerificationToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = crypto.randomBytes(32).toString("hex");
    await prisma.emailVerificationToken.create({
      data: { userId: user.id, token, expiresAt: minutesFromNow(60) },
    });

    await sendVerificationEmail(user.email, token);
    return res.json({ ok: true, msg: "Se envió un nuevo correo de verificación." });
  } catch (e: any) {
    const msg = e?.issues?.[0]?.message ?? e.message ?? "Error";
    return res.status(400).json({ ok: false, msg });
  }
});

/* =========================
 *   LOGIN
 * ========================= */
router.post("/login", async (req, res) => {
  try {
    const parsed = loginSchema.parse({ body: req.body });
    const { email, password } = parsed.body;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { business: true },
    });
    if (!user) return res.status(400).json({ ok: false, msg: "Credenciales inválidas" });

    if (!user.emailVerified) {
      return res.status(403).json({ ok: false, msg: "Debes verificar tu correo antes de iniciar sesión." });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ ok: false, msg: "Credenciales inválidas" });

    const { accessToken, refreshToken } = issueTokens(user.id);
    const { jti } = readJwtPayload<{ jti: string }>(refreshToken);
    await saveRefreshJti(user.id, jti);

    return res.json({ ok: true, accessToken, refreshToken, user });
  } catch (e: any) {
    const msg = e?.issues?.[0]?.message ?? e.message ?? "Error";
    return res.status(400).json({ ok: false, msg });
  }
});

/* =========================
 *   ME (requiere access token)
 * ========================= */
router.get("/me", authMW, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      include: { business: true, serviceProfile: true },
    });
    if (!user) return res.status(404).json({ ok: false, msg: "Usuario no encontrado" });
    return res.json({ ok: true, user });
  } catch (e: any) {
    return res.status(400).json({ ok: false, msg: e.message });
  }
});

/* =========================
 *   REFRESH
 * ========================= */
router.post("/refresh", async (req, res) => {
  try {
    const parsed = refreshSchema.parse({ body: req.body });
    const incoming = (parsed.body.refreshToken || (req.headers["x-refresh-token"] as string | undefined));
    if (!incoming) return res.status(401).json({ ok: false, msg: "Falta refreshToken" });

    const payload = verifyRefresh(incoming) as RefreshPayload;
    if (await isRevoked(payload.jti)) {
      return res.status(401).json({ ok: false, msg: "Refresh token revocado" });
    }

    await rotateRefreshJti(payload.jti);
    const { accessToken, refreshToken } = issueTokens(payload.uid);

    const { jti: newJti } = readJwtPayload<{ jti: string }>(refreshToken);
    await saveRefreshJti(payload.uid, newJti);

    return res.json({ ok: true, accessToken, refreshToken });
  } catch (e: any) {
    return res.status(401).json({ ok: false, msg: "Refresh token inválido" });
  }
});

/* =========================
 *   LOGOUT ALL
 * ========================= */
router.post("/logout-all", authMW, async (req, res) => {
  try {
    await revokeAllUserTokens(req.userId!);
    return res.json({ ok: true, msg: "Sesiones cerradas en todos los dispositivos" });
  } catch (e: any) {
    return res.status(500).json({ ok: false, msg: e.message });
  }
});

/* =========================
 *   GOOGLE LOGIN
 * ========================= */
router.post("/google", async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ ok: false, msg: "Falta idToken" });

    const payload = await verifyGoogleToken(idToken);
    if (!payload?.email) return res.status(400).json({ ok: false, msg: "Token inválido" });

    let user = await prisma.user.findUnique({ where: { email: payload.email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: payload.email,
          password: "",
          role: "CUSTOMER",
          name: payload.name ?? null,
          emailVerified: true, // confiamos en Google
          paidVerified: false,
        },
      });
    }

    const { accessToken, refreshToken } = issueTokens(user.id);
    const { jti } = readJwtPayload<{ jti: string }>(refreshToken);
    await saveRefreshJti(user.id, jti);

    res.json({ ok: true, accessToken, refreshToken, user });
  } catch (e: any) {
    res.status(401).json({ ok: false, msg: e.message });
  }
});

/* =========================
 *   FORGOT PASSWORD  (JWT corto, sin tocar Prisma)
 *   Requiere agregar sendPasswordResetEmail en lib/mailer si aún no lo tienes.
 * ========================= */
router.post("/forgot-password", async (req, res) => {
  try {
    const parsed = forgotSchema.parse({ body: req.body });
    const { email } = parsed.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Responder 200 para no filtrar existencia de emails
      return res.json({ ok: true, msg: "Si el correo existe, enviaremos instrucciones." });
    }

    const resetToken = jwt.sign(
      { sub: user.id, email: user.email },
      ENV.JWT_EMAIL_VERIFY_SECRET as string,
      { expiresIn: "15m" } as SignOptions
    );

    // Si ya tienes implementado en tu mailer:
    // await sendPasswordResetEmail(user.email, resetToken);

    return res.json({ ok: true, msg: "Si el correo existe, enviaremos instrucciones." });
  } catch (e: any) {
    const msg = e?.issues?.[0]?.message ?? e.message ?? "Error";
    return res.status(400).json({ ok: false, msg });
  }
});

/* =========================
 *   RESET PASSWORD
 * ========================= */
router.post("/reset-password", async (req, res) => {
  try {
    const parsed = resetSchema.parse({ body: req.body });
    const { token, password } = parsed.body;

    const decoded = jwt.verify(token, ENV.JWT_EMAIL_VERIFY_SECRET as string) as unknown as { sub: number; email: string };
    const hash = await bcrypt.hash(password, 10);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: decoded.sub },
        data: { password: hash },
      }),
      // seguridad: revocar refresh tokens existentes
      prisma.refreshToken.updateMany({
        where: { userId: decoded.sub, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return res.json({ ok: true, msg: "Contraseña actualizada correctamente" });
  } catch (e: any) {
    return res.status(400).json({ ok: false, msg: "Token inválido o expirado" });
  }
});

export default router;