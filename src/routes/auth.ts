// src/routes/auth.ts
import { Router } from "express";
import bcrypt from "bcryptjs";
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

// Firebase Admin helpers (genera enlaces)
import { auth as fbAuth } from "../lib/firebase";
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
} from "../lib/mailer";

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
    accepted: z.boolean(), // acepta TyC/Privacidad
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

/* =========================
 *   Helpers
 * ========================= */
type RefreshPayload = { uid: number; jti: string };

function readJwtPayload<T = any>(jwt: string): T {
  const base64 = jwt.split(".")[1];
  return JSON.parse(Buffer.from(base64, "base64").toString());
}

// Crea el usuario en Firebase si no existe (usamos el id de Prisma como uid)
async function ensureFirebaseUser(email: string, uid: string) {
  try {
    await fbAuth.getUserByEmail(email);
  } catch {
    await fbAuth.createUser({ uid, email });
  }
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

    // Asegura usuario en Firebase y genera enlace de verificación (opcional: devolverlo)
    await ensureFirebaseUser(user.email, String(user.id));
    const verifyLink = await sendVerificationEmail(user.email);

    // Tokens app
    const { accessToken, refreshToken } = issueTokens(user.id);
    const { jti } = readJwtPayload<{ jti: string }>(refreshToken);
    await saveRefreshJti(user.id, jti);

    return res.json({
      ok: true,
      msg: "Usuario registrado. Revisa tu correo para verificar la cuenta.",
      // opcional para pruebas si no envías email en el cliente:
      verifyLink,
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

/* ========== RESEND VERIFICATION ========== */
router.post("/resend-verification", async (req, res) => {
  try {
    const em = (req.body?.email || "").toString().toLowerCase().trim();
    if (!em) return res.status(400).json({ ok: false, msg: "Falta email" });

    const user = await prisma.user.findUnique({ where: { email: em } });
    if (!user) return res.status(400).json({ ok: false, msg: "Usuario no encontrado" });
    if (user.emailVerified)
      return res.status(400).json({ ok: false, msg: "El correo ya está verificado" });

    await ensureFirebaseUser(user.email, String(user.id));
    const verifyLink = await sendVerificationEmail(user.email);

    return res.json({ ok: true, msg: "Se envió un nuevo correo de verificación.", verifyLink });
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

    if (!user.emailVerified) {
      // Si quieres, aquí podrías consultar Firebase y sincronizar flag:
      // const fb = await fbAuth.getUserByEmail(em);
      // if (fb.emailVerified) await prisma.user.update({ where:{ id: user.id }, data:{ emailVerified:true, emailVerifiedAt:new Date() }});
      return res
        .status(403)
        .json({ ok: false, msg: "Verifica tu email antes de iniciar sesión" });
    }

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

/* ========== FORGOT PASSWORD (Firebase link) ========== */
router.post("/forgot-password", validate(forgotSchema), async (req, res) => {
  try {
    const em = (req.body.email as string).toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: em } });

    // Respuesta genérica para no filtrar correos
    if (!user) return res.json({ ok: true, msg: "Si el correo existe, enviaremos instrucciones." });

    // Asegura usuario en Firebase y genera link de reset (opcional: devolverlo)
    await ensureFirebaseUser(user.email, String(user.id));
    const resetLink = await sendPasswordResetEmail(user.email);

    return res.json({ ok: true, msg: "Si el correo existe, enviaremos instrucciones.", resetLink });
  } catch (e: any) {
    return res.status(500).json({ ok: false, msg: e.message });
  }
});

export default router;