import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { authMW } from "../lib/authMW";
import { z } from "zod";

const router = Router();

/* ------------ Schemas ------------ */
const patchMeSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  // Bloqueamos explícitamente campos sensibles en este endpoint
  email: z.never().optional(),
  role: z.never().optional(),
  onboardingCompleted: z.never().optional(),
});

/**
 * GET /users/me
 * Devuelve el perfil del usuario autenticado (sin password)
 */
router.get("/me", authMW, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        onboardingCompleted: true,
        emailVerified: true,
        emailVerifiedAt: true,
        paidVerified: true,
        paidVerifiedAt: true,
        business: {
          select: { id: true, name: true, phone: true, city: true },
        },
        serviceProfile: {
          select: { id: true, name: true, phone: true, city: true },
        },
        // evita traer lista de productos completa aquí (puede ser grande)
        _count: { select: { products: true } },
      },
    });

    if (!user) return res.status(404).json({ ok: false, msg: "Usuario no encontrado" });
    return res.json({ ok: true, user });
  } catch (e: any) {
    return res
      .status(500)
      .json({ ok: false, msg: "Error al obtener perfil", details: e.message });
  }
});

/**
 * PATCH /users/me
 * Actualiza datos básicos del usuario autenticado
 * Solo permitimos: name
 * Cambios de email/role requieren flujos separados (verificación, autorizaciones)
 */
router.patch("/me", authMW, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const parsed = patchMeSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        msg: "Payload inválido",
        issues: parsed.error.issues.map(i => ({ path: i.path, msg: i.message })),
      });
    }

    const dataToUpdate: { name?: string } = {};
    if (parsed.data.name !== undefined) dataToUpdate.name = parsed.data.name;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: dataToUpdate,
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        onboardingCompleted: true,
        emailVerified: true,
        emailVerifiedAt: true,
        paidVerified: true,
        paidVerifiedAt: true,
        business: {
          select: { id: true, name: true, phone: true, city: true },
        },
        serviceProfile: {
          select: { id: true, name: true, phone: true, city: true },
        },
        _count: { select: { products: true } },
      },
    });

    return res.json({ ok: true, user: updated });
  } catch (e: any) {
    return res
      .status(500)
      .json({ ok: false, msg: "Error al actualizar perfil", details: e.message });
  }
});

export default router;