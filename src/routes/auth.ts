// src/routes/auth.ts
import { Router } from "express";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { z } from "zod";

import prisma from "../lib/prisma";
import { Role } from "@prisma/client";
import { authMW } from "../lib/authMW";
import { issueTokens, verifyRefresh } from "../lib/tokens";
import {
  saveRefreshJti,
  rotateRefreshJti,
  isRevoked,
  revokeAllUserTokens,
} from "../lib/rtStore";
import { validate } from "../lib/validate";
import { verifyGoogleToken } from "../lib/google";
import { sendVerificationEmail, sendPasswordResetEmail } from "../lib/mailer";

const router = Router();

/* =========================
 *   Schemas (Zod)
 * ========================= */
const registerSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Nombre muy corto"),
    email: z.string().email(),
    password: z.string().min(8, "Mínimo 8 caracteres"),
    role: z.enum(["CUSTOMER", "SELLER", "PROVIDER"]).optional(),
    accepted: z.boolean(),
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
function readJwtPayload<T = any>(jwt: string): T {
  const base64 = jwt.split(".")[1];
  return JSON.parse(Buffer.from(base64, "base64").toString());
}

/* ========== REGISTER ========== */
router.post("/register", validate(registerSchema), async (req, res) => {
  try {
    const { email, password, role, name, accepted } = req.body as {
      email: string;
      password: string;
      role?: Role;
      name: string;
      accepted: boolean;
    };

    if (!accepted) {
      return res.status(400).json({
        ok: false,
        msg: "Debes aceptar los Términos y la Política de Privacidad.",
      });
    }

    const em = email.toLowerCase().trim();

    const exists = await prisma.user.findUnique({ where: { email: em } });
    if (exists) return res.status(400).json({ ok: false, msg: "Email ya registrado" });

    const hash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email: em,
        password: hash,
        role: role ?? "CUSTOMER",
        emailVerified: false,
        tcAccepted: accepted,
        tcVersion: "v1",
        legalAcceptedAt: new Date(),
      },
      include: { business: true },
    });

    // Envío de verificación (Firebase genera y envía/retorna el link según tu mailer)
    await sendVerificationEmail(user.email);

    // Tokens
    const { accessToken, refreshToken } = issueTokens(user.id);
    const { jti } = readJwtPayload<{ jti: string }>(refreshToken);
    await saveRefreshJti(user.id, jti);

    return res.json({
      ok: true,
      msg: "Usuario registrado. Verifica tu email.",
      accessToken,
      refreshToken,
      user,
    });
  } catch (e: any) {
    console.error("REGISTER_ERROR:", e?.issues || e?.message || e);
    return res
      .status(400)
      .json({ ok: false, msg: e?.message || "Bad request", issues: e?.issues });
  }
});

/* ========== (REMOVIDO) VERIFY EMAIL POR TOKEN PROPIO ==========
   Si sigues el flujo de Firebase, no necesitas esta ruta.
   Si en el futuro la necesitas, vuelve a implementarla.
*/

/* ========== RESEND VERIFICATION ========== */
router.post("/resend-verification", async (req, res) => {
  try {
    const em = (req.body?.email || "").toString().toLowerCase().trim();
    if (!em) return res.status(400).json({ ok: false, msg: "Falta email" });

    const user = await prisma.user.findUnique({ where: { email: em } });
    if (!user) return res.status(400).json({ ok: false, msg: "Usuario no encontrado" });
    if (user.emailVerified)
      return res.status(400).json({ ok: false, msg: "El correo ya está verificado" });

    await sendVerificationEmail(user.email);

    return res.json({ ok: true, msg: "Se envió un nuevo correo de verificación." });
  } catch (e: any) {
    return res.status(500).json({ ok: false, msg: e.message });
  }
});

/* ========== LOGIN ========== */
router.post("/login", validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    const em = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: em },
      include: { business: true },
    });
    if (!user) return res.status(400).json({ ok: false, msg: "Credenciales" });

    if (!user.emailVerified)
      return res
        .status(403)
        .json({ ok: false, msg: "Verifica tu email antes de iniciar sesión" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ ok: false, msg: "Credenciales" });

    const { accessToken, refreshToken } = issueTokens(user.id);
    const { jti } = readJwtPayload<{ jti: string }>(refreshToken);
    await saveRefreshJti(user.id, jti);

    return res.json({ ok: true, token: accessToken, accessToken, refreshToken, user });
  } catch (e: any) {
    return res.status(400).json({ ok: false, msg: e.message });
  }
});

/* ========== ME ========== */
router.get("/me", authMW, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      include: { business: true },
    });
    if (!user) return res.status(404).json({ ok: false, msg: "Usuario no encontrado" });
    return res.json({ ok: true, user });
  } catch (e: any) {
    return res.status(400).json({ ok: false, msg: e.message });
  }
});

/* ========== REFRESH ========== */
router.post("/refresh", validate(refreshSchema), async (req, res) => {
  try {
    const incoming =
      (req.body?.refreshToken || req.headers["x-refresh-token"]) as string | undefined;
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
  } catch {
    return res.status(401).json({ ok: false, msg: "Refresh token inválido" });
  }
});

/* ========== LOGOUT-ALL ========== */
router.post("/logout-all", authMW, async (req, res) => {
  try {
    await revokeAllUserTokens(req.userId!);
    return res.json({ ok: true, msg: "Sesiones cerradas en todos los dispositivos" });
  } catch (e: any) {
    return res.status(500).json({ ok: false, msg: e.message });
  }
});

/* ========== GOOGLE LOGIN ========== */
router.post("/google", async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ ok: false, msg: "Falta idToken" });

    const payload = await verifyGoogleToken(idToken);
    if (!payload?.email) return res.status(400).json({ ok: false, msg: "Token inválido" });

    const em = payload.email.toLowerCase().trim();

    let user = await prisma.user.findUnique({ where: { email: em } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: em,
          password: "",
          role: "CUSTOMER",
          name: payload.name ?? null,
          emailVerified: true, // Confiamos en Google
          tcAccepted: true,
          tcVersion: "v1",
          legalAcceptedAt: new Date(),
        },
      });
    }

    const { accessToken, refreshToken } = issueTokens(user.id);
    return res.json({ ok: true, accessToken, refreshToken, user });
  } catch (e: any) {
    return res.status(401).json({ ok: false, msg: e.message });
  }
});

/* ========== FORGOT PASSWORD ========== */
router.post("/forgot-password", validate(forgotSchema), async (req, res) => {
  try {
    const em = (req.body.email as string).toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: em } });

    // Respuesta genérica para no filtrar correos
    if (!user) return res.json({ ok: true, msg: "Si el correo existe, enviaremos instrucciones." });

    // Invalida tokens previos (si conservas tu tabla local)
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    // Puedes mantener este registro (auditoría) aunque uses link de Firebase
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 60 min

    await prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt },
    });

    // Genera y envía (o devuelve) el enlace de Firebase
    await sendPasswordResetEmail(user.email);

    return res.json({ ok: true, msg: "Si el correo existe, enviaremos instrucciones." });
  } catch (e: any) {
    return res.status(500).json({ ok: false, msg: e.message });
  }
});

/* ========== RESET PASSWORD ========== */
router.post("/reset-password", validate(resetSchema), async (req, res) => {
  try {
    const { token, password } = req.body as { token: string; password: string };

    const rec = await prisma.passwordResetToken.findUnique({ where: { token } });
    if (!rec || rec.usedAt || rec.expiresAt < new Date()) {
      return res.status(400).json({ ok: false, msg: "Token inválido o expirado" });
    }

    const hash = await bcrypt.hash(password, 10);

    await prisma.$transaction([
      prisma.user.update({ where: { id: rec.userId }, data: { password: hash } }),
      prisma.passwordResetToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
    ]);

    return res.json({ ok: true, msg: "Contraseña actualizada. Ya puedes iniciar sesión." });
  } catch (e: any) {
    return res.status(500).json({ ok: false, msg: e.message });
  }
});

export default router;