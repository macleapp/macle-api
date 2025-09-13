// src/routes/serviceProfile.ts
import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { authMW } from "../lib/authMW";
import { z } from "zod";
import { validate } from "../lib/validate";
import { Role } from "@prisma/client";

const router = Router();

/* =========================
 *   Schemas (Zod)
 * ========================= */
const createSchema = z.object({
  body: z.object({
    name: z.string().min(2, "name es requerido"),
    phone: z.string().trim().min(1).optional().nullable(),
    city: z.string().trim().min(1).optional().nullable(),
  }),
});

const patchSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    phone: z.string().trim().min(1).optional().nullable(),
    city: z.string().trim().min(1).optional().nullable(),
  }),
});

const upsertSchema = createSchema; // mismas reglas

/* =========================
 *   Helpers
 * ========================= */
function ensureProvider(role?: Role) {
  if (role !== "PROVIDER") {
    const e: any = new Error("Requiere rol PROVIDER");
    e.status = 403;
    throw e;
  }
}

/* =========================
 *   Crear perfil (una sola vez)
 *   POST /service-profile
 * ========================= */
router.post("/", authMW, validate(createSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const me = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    ensureProvider(me?.role);

    const { name, phone, city } = req.body;

    const exist = await prisma.serviceProfile.findUnique({ where: { ownerId: userId } });
    if (exist) return res.status(409).json({ ok: false, msg: "Ya existe un perfil de servicio" });

    const created = await prisma.serviceProfile.create({
      data: { ownerId: userId, name: String(name), phone: phone ?? null, city: city ?? null },
    });

    return res.status(201).json({ ok: true, profile: created });
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ ok: false, msg: e.message ?? "Error al crear perfil de servicio" });
  }
});

/* =========================
 *   Mi perfil
 *   GET /service-profile/me
 * ========================= */
router.get("/me", authMW, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const profile = await prisma.serviceProfile.findUnique({ where: { ownerId: userId } });
    if (!profile) return res.status(404).json({ ok: false, msg: "No tienes perfil de servicio" });
    return res.json({ ok: true, profile });
  } catch (e: any) {
    return res.status(500).json({ ok: false, msg: "Error al obtener perfil de servicio" });
  }
});

/* =========================
 *   Actualizar mi perfil (parcial)
 *   PATCH /service-profile/me
 * ========================= */
router.patch("/me", authMW, validate(patchSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const me = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    ensureProvider(me?.role);

    const { name, phone, city } = req.body || {};

    const exist = await prisma.serviceProfile.findUnique({ where: { ownerId: userId } });
    if (!exist) return res.status(404).json({ ok: false, msg: "No tienes perfil de servicio" });

    const updated = await prisma.serviceProfile.update({
      where: { ownerId: userId },
      data: {
        ...(name !== undefined ? { name: String(name) } : {}),
        ...(phone !== undefined ? { phone: phone ?? null } : {}),
        ...(city !== undefined ? { city: city ?? null } : {}),
      },
    });

    return res.json({ ok: true, profile: updated });
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ ok: false, msg: e.message ?? "Error al actualizar perfil de servicio" });
  }
});

/* =========================
 *   Upsert (crear o actualizar)
 *   PUT /service-profile/me
 * ========================= */
router.put("/me", authMW, validate(upsertSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const me = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    ensureProvider(me?.role);

    const { name, phone, city } = req.body;

    const profile = await prisma.serviceProfile.upsert({
      where: { ownerId: userId },
      create: { ownerId: userId, name: String(name), phone: phone ?? null, city: city ?? null },
      update: {
        name: String(name),
        phone: phone ?? null,
        city: city ?? null,
      },
    });

    return res.json({ ok: true, profile });
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ ok: false, msg: e.message ?? "Error al guardar perfil de servicio" });
  }
});

/* =========================
 *   Perfil público
 *   GET /service-profile/:ownerId
 * ========================= */
router.get("/:ownerId", async (req: Request, res: Response) => {
  try {
    const ownerId = Number(req.params.ownerId);
    if (!Number.isFinite(ownerId)) {
      return res.status(400).json({ ok: false, msg: "ownerId inválido" });
    }

    const profile = await prisma.serviceProfile.findUnique({ where: { ownerId } });
    if (!profile) return res.status(404).json({ ok: false, msg: "Perfil no encontrado" });

    return res.json({ ok: true, profile });
  } catch (e: any) {
    return res.status(500).json({ ok: false, msg: "Error al obtener perfil" });
  }
});

export default router;