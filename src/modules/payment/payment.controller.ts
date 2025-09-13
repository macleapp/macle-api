// src/modules/payment/payment.controller.ts
import { Router, Request, Response } from "express";
import prisma from "../../lib/prisma";
import { ENV } from "../../config/env";
import { authMW } from "../../lib/authMW";

const paymentRouter = Router();

/** Helper para obtener el userId (lo pone authMW en req.userId) */
function getUserId(req: Request): number {
  const id = (req as any)?.userId;
  if (!id) throw new Error("UNAUTHENTICATED");
  return Number(id);
}

/** Secreto del webhook (puede venir de ENV o process.env) */
const WEBHOOK_SECRET: string =
  (ENV as any).PAYMENT_WEBHOOK_SECRET ??
  process.env.PAYMENT_WEBHOOK_SECRET ??
  "";

/**
 * GET /api/payment/me/status
 * Devuelve si el usuario autenticado tiene verificación por pago
 */
paymentRouter.get("/me/status", authMW, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, paidVerified: true, paidVerifiedAt: true },
    });
    if (!user) return res.status(404).json({ ok: false, msg: "Usuario no encontrado" });
    return res.json({
      ok: true,
      status: user.paidVerified,
      paidVerifiedAt: user.paidVerifiedAt,
    });
  } catch (e: any) {
    const code = e.message === "UNAUTHENTICATED" ? 401 : 500;
    return res.status(code).json({ ok: false, msg: e.message ?? "Error" });
  }
});

/**
 * POST /api/payment/webhook
 * Webhook genérico: valida un secreto sencillo y marca la cuenta.
 * Body esperado: { "event": "payment.succeeded", "userId": 123 }
 */
paymentRouter.post("/webhook", async (req: Request, res: Response) => {
  try {
    const provided = req.header("x-webhook-secret") ?? "";
    if (!WEBHOOK_SECRET || provided !== WEBHOOK_SECRET) {
      return res.status(401).json({ ok: false, msg: "Firma inválida" });
    }

    const { event, userId } = req.body as { event?: string; userId?: number };
    if (!userId) return res.status(400).json({ ok: false, msg: "userId requerido" });

    // Filtra eventos si tu PSP los envía
    if (event && !event.includes("succeeded")) {
      return res.json({ ok: true, ignored: true });
    }

    const updated = await prisma.user.update({
      where: { id: Number(userId) },
      data: { paidVerified: true, paidVerifiedAt: new Date() },
      select: { id: true, paidVerified: true, paidVerifiedAt: true },
    });

    return res.json({ ok: true, user: updated });
  } catch (e: any) {
    return res.status(500).json({ ok: false, msg: e.message ?? "Error" });
  }
});

/**
 * POST /api/payment/dev/mark-paid
 * Solo desarrollo: marca pagado por email o userId.
 * Body: { email?: string, userId?: number }
 */
paymentRouter.post("/dev/mark-paid", async (req: Request, res: Response) => {
  try {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ ok: false, msg: "No disponible en producción" });
    }

    const { email, userId } = req.body as { email?: string; userId?: number };
    if (!email && !userId) {
      return res.status(400).json({ ok: false, msg: "Proporciona email o userId" });
    }

    const user = email
      ? await prisma.user.findUnique({ where: { email } })
      : await prisma.user.findUnique({ where: { id: Number(userId) } });

    if (!user) return res.status(404).json({ ok: false, msg: "Usuario no encontrado" });

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { paidVerified: true, paidVerifiedAt: new Date() },
      select: { id: true, email: true, paidVerified: true, paidVerifiedAt: true },
    });

    return res.json({ ok: true, user: updated });
  } catch (e: any) {
    return res.status(500).json({ ok: false, msg: e.message ?? "Error" });
  }
});

export default paymentRouter;