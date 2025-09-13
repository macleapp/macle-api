// src/routes/products.ts
import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { authMW } from "../lib/authMW";

const router = Router();

/**
 * GET /products?limit=20&cursor=123
 * Paginación por cursor (id): orden descendente por id.
 * Devuelve { ok, items, nextCursor }
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? 20), 10) || 20, 1), 50);
    const cursorNum = req.query.cursor ? Number(req.query.cursor) : undefined;
    const cursor = Number.isFinite(cursorNum) ? cursorNum : undefined;

    const items = await prisma.product.findMany({
      take: limit + 1, // pedimos 1 extra para saber si hay siguiente página
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: "desc" },
      include: {
        seller: { select: { id: true, email: true, role: true } },
      },
    });

    let nextCursor: number | null = null;
    if (items.length > limit) {
      const next = items.pop(); // quitamos el extra
      nextCursor = next!.id;
    }

    return res.json({ ok: true, items, nextCursor });
  } catch (e: any) {
    return res.status(500).json({ ok: false, msg: "No se pudo listar productos" });
  }
});

/**
 * GET /products/:id
 * Detalle
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, msg: "id inválido" });
    }

    const item = await prisma.product.findUnique({
      where: { id },
      include: {
        seller: { select: { id: true, email: true, role: true } },
      },
    });

    if (!item) return res.status(404).json({ ok: false, msg: "No encontrado" });
    return res.json({ ok: true, item });
  } catch (e: any) {
    return res.status(500).json({ ok: false, msg: "No se pudo obtener el producto" });
  }
});

/**
 * POST /products
 * Crear (auth requerido, solo SELLER/PROVIDER)
 * Body: { name: string, price: number, description?: string }
 */
router.post("/", authMW, async (req: Request, res: Response) => {
  try {
    const sellerId = Number((req as any).userId);
    if (!sellerId) return res.status(401).json({ ok: false, msg: "No autorizado" });

    const actor = await prisma.user.findUnique({ where: { id: sellerId }, select: { role: true } });
    if (!actor || (actor.role !== "SELLER" && actor.role !== "PROVIDER")) {
      return res.status(403).json({ ok: false, msg: "Requiere rol vendedor/proveedor" });
    }

    const { name, price, description } = req.body || {};

    const rawName = typeof name === "string" ? name.trim() : "";
    if (!rawName || price === undefined) {
      return res.status(400).json({ ok: false, msg: "name y price son obligatorios" });
    }

    const parsedPrice = Number(price);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ ok: false, msg: "price debe ser numérico y ≥ 0" });
    }

    const created = await prisma.product.create({
      data: {
        name: rawName,
        price: parsedPrice,
        description: description ?? null,
        sellerId,
      },
    });

    return res.status(201).json({ ok: true, item: created });
  } catch (e: any) {
    return res.status(500).json({ ok: false, msg: "No se pudo crear el producto" });
  }
});

/**
 * PUT /products/:id
 * Actualizar (auth requerido, solo dueño)
 */
router.put("/:id", authMW, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, msg: "id inválido" });
    }

    const sellerId = Number((req as any).userId);
    if (!sellerId) return res.status(401).json({ ok: false, msg: "No autorizado" });

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return res.status(404).json({ ok: false, msg: "No encontrado" });
    if (product.sellerId !== sellerId) {
      return res.status(403).json({ ok: false, msg: "Prohibido" });
    }

    const { name, price, description } = req.body || {};
    const data: any = {};

    if (name !== undefined) {
      const nm = String(name).trim();
      if (!nm) return res.status(400).json({ ok: false, msg: "name no puede estar vacío" });
      data.name = nm;
    }

    if (price !== undefined) {
      const p = Number(price);
      if (!Number.isFinite(p) || p < 0) {
        return res.status(400).json({ ok: false, msg: "price debe ser numérico y ≥ 0" });
      }
      data.price = p;
    }

    if (description !== undefined) data.description = description ?? null;

    const updated = await prisma.product.update({
      where: { id },
      data,
    });

    return res.json({ ok: true, item: updated });
  } catch (e: any) {
    return res.status(500).json({ ok: false, msg: "No se pudo actualizar el producto" });
  }
});

/**
 * DELETE /products/:id
 * Eliminar (auth requerido, solo dueño)
 */
router.delete("/:id", authMW, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, msg: "id inválido" });
    }

    const sellerId = Number((req as any).userId);
    if (!sellerId) return res.status(401).json({ ok: false, msg: "No autorizado" });

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return res.status(404).json({ ok: false, msg: "No encontrado" });
    if (product.sellerId !== sellerId) {
      return res.status(403).json({ ok: false, msg: "Prohibido" });
    }

    await prisma.product.delete({ where: { id } });
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, msg: "No se pudo eliminar el producto" });
  }
});

export default router;