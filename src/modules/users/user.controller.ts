// src/modules/users/user.controller.ts
import { Router, Request, Response } from "express";
import prisma from "../../lib/prisma";
import { authMW } from "../../lib/authMW";

const userRouter = Router();

/** Lee el userId inyectado por authMW */
function getUserId(req: Request): number {
  const id = (req as any)?.userId ?? (req as any)?.user?.id;
  if (!id) throw new Error("UNAUTHENTICATED");
  return Number(id);
}

/* =========================
 *        USUARIO (ME)
 * ========================= */

/** GET /api/users/me */
userRouter.get("/me", authMW, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        emailVerified: true,
        emailVerifiedAt: true,
        paidVerified: true,
        paidVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    return res.json({ ok: true, user });
  } catch (e: any) {
    const code = e.message === "UNAUTHENTICATED" ? 401 : 500;
    return res.status(code).json({ ok: false, message: e.message ?? "Error" });
  }
});

/** PATCH /api/users/me */
userRouter.patch("/me", authMW, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { name } = (req.body ?? {}) as { name?: string };

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { ...(typeof name === "string" ? { name } : {}) },
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

    return res.json({ ok: true, user: updated });
  } catch (e: any) {
    const code = e.message === "UNAUTHENTICATED" ? 401 : 500;
    return res.status(code).json({ ok: false, message: e.message ?? "Error" });
  }
});

/* =========================
 *   PERFILES PÚBLICOS
 * ========================= */

/** GET /api/users/profiles/seller/:userId  → Business del emprendedor */
userRouter.get("/profiles/seller/:userId", async (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.userId);
    if (Number.isNaN(userId)) return res.status(400).json({ ok: false, message: "userId inválido" });

    const profile = await prisma.business.findUnique({ where: { ownerId: userId } });
    if (!profile) return res.status(404).json({ ok: false, message: "Perfil de emprendedor no encontrado" });
    return res.json({ ok: true, profile });
  } catch (e: any) {
    return res.status(500).json({ ok: false, message: e.message ?? "Error" });
  }
});

/** GET /api/users/profiles/customer/:userId  → ServiceProfile del cliente/proveedor */
userRouter.get("/profiles/customer/:userId", async (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.userId);
    if (Number.isNaN(userId)) return res.status(400).json({ ok: false, message: "userId inválido" });

    const profile = await prisma.serviceProfile.findUnique({ where: { ownerId: userId } });
    if (!profile) return res.status(404).json({ ok: false, message: "Perfil de cliente no encontrado" });
    return res.json({ ok: true, profile });
  } catch (e: any) {
    return res.status(500).json({ ok: false, message: e.message ?? "Error" });
  }
});

/* =========================
 *  UPSERT DE PERFILES (ME)
 * ========================= */

/** PUT /api/users/profiles/seller → crea/actualiza Business (requiere login) */
userRouter.put("/profiles/seller", authMW, async (req: Request, res: Response) => {
  try {
    const ownerId = getUserId(req);
    const { name, phone, city } = (req.body ?? {}) as {
      name?: string;
      phone?: string | null;
      city?: string | null;
    };

    if (!name || !name.trim()) return res.status(400).json({ ok: false, message: "name es requerido" });

    const profile = await prisma.business.upsert({
      where: { ownerId },
      create: { ownerId, name: name.trim(), phone: phone ?? null, city: city ?? null },
      update: {
        ...(name !== undefined ? { name: name?.trim() ?? "" } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(city !== undefined ? { city } : {}),
      },
    });

    return res.json({ ok: true, profile });
  } catch (e: any) {
    const code = e.message === "UNAUTHENTICATED" ? 401 : 500;
    return res.status(code).json({ ok: false, message: e.message ?? "Error" });
  }
});

/** PUT /api/users/profiles/customer → crea/actualiza ServiceProfile (requiere login) */
userRouter.put("/profiles/customer", authMW, async (req: Request, res: Response) => {
  try {
    const ownerId = getUserId(req);
    const { name, phone, city } = (req.body ?? {}) as {
      name?: string;
      phone?: string | null;
      city?: string | null;
    };

    if (!name || !name.trim()) return res.status(400).json({ ok: false, message: "name es requerido" });

    const profile = await prisma.serviceProfile.upsert({
      where: { ownerId },
      create: { ownerId, name: name.trim(), phone: phone ?? null, city: city ?? null },
      update: {
        ...(name !== undefined ? { name: name?.trim() ?? "" } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(city !== undefined ? { city } : {}),
      },
    });

    return res.json({ ok: true, profile });
  } catch (e: any) {
    const code = e.message === "UNAUTHENTICATED" ? 401 : 500;
    return res.status(code).json({ ok: false, message: e.message ?? "Error" });
  }
});

/* =========================
 *  VERIFICACIÓN POR PAGO
 * ========================= */

/**
 * POST /api/users/profiles/seller/verify
 * Llamado desde tu webhook de pagos (valida firma antes de exponer).
 */
userRouter.post("/profiles/seller/verify", async (req: Request, res: Response) => {
  try {
    const { ownerId } = req.body as { ownerId?: number };
    if (!ownerId || Number.isNaN(Number(ownerId))) {
      return res.status(400).json({ ok: false, message: "ownerId requerido" });
    }

    const user = await prisma.user.update({
      where: { id: Number(ownerId) },
      data: { paidVerified: true, paidVerifiedAt: new Date() },
      select: { id: true, paidVerified: true, paidVerifiedAt: true },
    });

    return res.json({ ok: true, user, status: "verified" });
  } catch (e: any) {
    return res.status(500).json({ ok: false, message: e.message ?? "Error" });
  }
});

export default userRouter;