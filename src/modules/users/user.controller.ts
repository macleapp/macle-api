// src/modules/users/user.controller.ts
import { Router, Request, Response } from "express";
import prisma from "../../lib/prisma";
import { authMW } from "../../lib/authMW";
import { BadgeCode, BadgeIcon } from "@prisma/client"; // ✅ enums Prisma v5

const userRouter = Router();

/** Lee el userId inyectado por authMW */
function getUserId(req: Request): number {
  const id = (req as any)?.userId ?? (req as any)?.user?.id;
  if (!id) throw new Error("UNAUTHENTICATED");
  return Number(id);
}

/* =========================================================
 *                DEFINICIÓN DE INSIGNIAS
 * ========================================================= */

const BADGE_DEFS: Array<{
  code: BadgeCode;
  label: string;
  description: string;
  icon: BadgeIcon;
  rules: (ctx: {
    business: any;
    user: any;
    metrics: {
      ratingAvg?: number;
      responseRate?: number; // %
      responseTimeMs?: number;
      onTimeRate?: number; // %
      categoryPercentile?: number; // %
    };
  }) => boolean;
}> = [
  {
    code: BadgeCode.real_photo,
    label: "Foto Real",
    description: "Tu foto de perfil fue validada.",
    icon: BadgeIcon.user_check,
    rules: ({ business }) => Boolean(business?.hasRealPhoto === true),
  },
  {
    code: BadgeCode.real_name,
    label: "Nombre Real Verificado",
    description: "Tu nombre fue verificado con documento.",
    icon: BadgeIcon.id_card,
    rules: ({ business }) => Boolean(business?.realNameVerified === true),
  },
  {
    code: BadgeCode.kindness,
    label: "Amabilidad & Atención",
    description: "Alta calificación y respuesta rápida.",
    icon: BadgeIcon.smile,
    rules: ({ metrics }) =>
      (metrics.ratingAvg ?? 0) >= 4.5 &&
      (metrics.responseRate ?? 0) >= 80 &&
      (metrics.responseTimeMs ?? Number.MAX_SAFE_INTEGER) <= 60 * 60 * 1000,
  },
  {
    code: BadgeCode.on_time,
    label: "Puntualidad",
    description: "Entregas a tiempo comprobadas por clientes.",
    icon: BadgeIcon.clock,
    rules: ({ metrics }) => (metrics.onTimeRate ?? 0) >= 95,
  },
  {
    code: BadgeCode.top_recommended,
    label: "Top Recomendado",
    description: "Entre los más recomendados del mes.",
    icon: BadgeIcon.award,
    rules: ({ metrics }) => (metrics.categoryPercentile ?? 101) <= 10,
  },
];

/** Se asegura de que el catálogo de badges exista en BD (idempotente). */
async function ensureBadgeCatalog() {
  for (const b of BADGE_DEFS) {
    await prisma.badge.upsert({
      where: { code: b.code },
      update: { label: b.label, description: b.description, icon: b.icon },
      create: { code: b.code, label: b.label, description: b.description, icon: b.icon },
    });
  }
}

/** Obtiene métricas necesarias para evaluar insignias (placeholder). */
async function getSellerMetrics(ownerId: number) {
  const business = await prisma.business.findUnique({ where: { ownerId } });
  return {
    ratingAvg: business?.ratingAvg ?? undefined,
    responseRate: business?.responseRate ?? undefined,
    responseTimeMs: business?.responseTimeMs ?? undefined,
    onTimeRate: business?.onTimeRate ?? undefined,
    categoryPercentile: business?.categoryPercentile ?? undefined,
  };
}

/** Evalúa y otorga/revoca insignias según reglas. */
async function evaluateBadges(ownerId: number) {
  await ensureBadgeCatalog();

  const [user, business, metrics] = await Promise.all([
    prisma.user.findUnique({ where: { id: ownerId } }),
    prisma.business.findUnique({ where: { ownerId } }),
    getSellerMetrics(ownerId),
  ]);
  if (!business) return;

  const shouldHaveCodes = BADGE_DEFS
    .filter((d) => d.rules({ business, user, metrics }))
    .map((d) => d.code);

  const current = await prisma.sellerBadge.findMany({
    where: { ownerId },
    include: { badge: true },
  });
  const currentCodes = new Set<BadgeCode>(current.map((sb) => sb.badge.code));

  // Otorgar faltantes
  for (const code of shouldHaveCodes) {
    if (!currentCodes.has(code)) {
      const b = await prisma.badge.findUnique({ where: { code } });
      if (b) {
        await prisma.sellerBadge.create({
          data: { ownerId, badgeId: b.id, earnedAt: new Date() },
        });
      }
    }
  }

  // Revocar las que ya no cumplen (opcional)
  for (const sb of current) {
    if (!shouldHaveCodes.includes(sb.badge.code)) {
      await prisma.sellerBadge.delete({ where: { id: sb.id } });
    }
  }
}

/* =========================
 *        USUARIO (ME)
 * ========================= */

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

userRouter.get("/profiles/seller/:userId", async (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.userId);
    if (Number.isNaN(userId)) return res.status(400).json({ ok: false, message: "userId inválido" });

    const profile = await prisma.business.findUnique({ where: { ownerId: userId } });
    if (!profile) return res.status(404).json({ ok: false, message: "Perfil de emprendedor no encontrado" });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { paidVerified: true, paidVerifiedAt: true },
  });

    const sellerBadges = await prisma.sellerBadge.findMany({
      where: { ownerId: userId },
      include: { badge: true },
      orderBy: { earnedAt: "asc" },
    });

    const badges = sellerBadges.map((sb) => ({
      code: sb.badge.code,
      label: sb.badge.label,
      description: sb.badge.description,
      icon: sb.badge.icon,
      earnedAt: sb.earnedAt,
    }));

    return res.json({
      ok: true,
      profile: {
        ...profile,
        verification: {
          status: user?.paidVerified ? "verified" : "unverified",
          type: "paid_check",
          verifiedAt: user?.paidVerifiedAt ?? null,
        },
        badges,
      },
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, message: e.message ?? "Error" });
  }
});

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

userRouter.put("/profiles/seller", authMW, async (req: Request, res: Response) => {
  try {
    const ownerId = getUserId(req);
    const {
      name,
      phone,
      city,
      hasRealPhoto,
      realNameVerified,
      ratingAvg,
      responseRate,
      responseTimeMs,
      onTimeRate,
      categoryPercentile,
    } = (req.body ?? {}) as {
      name?: string;
      phone?: string | null;
      city?: string | null;
      hasRealPhoto?: boolean;
      realNameVerified?: boolean;
      ratingAvg?: number | null;
      responseRate?: number | null;
      responseTimeMs?: number | null;
      onTimeRate?: number | null;
      categoryPercentile?: number | null;
    };

    if (!name || !name.trim()) return res.status(400).json({ ok: false, message: "name es requerido" });

    const profile = await prisma.business.upsert({
      where: { ownerId },
      create: {
        ownerId,
        name: name.trim(),
        phone: phone ?? null,
        city: city ?? null,
        ...(hasRealPhoto !== undefined ? { hasRealPhoto } : {}),
        ...(realNameVerified !== undefined ? { realNameVerified } : {}),
        ...(ratingAvg !== undefined ? { ratingAvg } : {}),
        ...(responseRate !== undefined ? { responseRate } : {}),
        ...(responseTimeMs !== undefined ? { responseTimeMs } : {}),
        ...(onTimeRate !== undefined ? { onTimeRate } : {}),
        ...(categoryPercentile !== undefined ? { categoryPercentile } : {}),
      },
      update: {
        ...(name !== undefined ? { name: name?.trim() ?? "" } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(city !== undefined ? { city } : {}),
        ...(hasRealPhoto !== undefined ? { hasRealPhoto } : {}),
        ...(realNameVerified !== undefined ? { realNameVerified } : {}),
        ...(ratingAvg !== undefined ? { ratingAvg } : {}),
        ...(responseRate !== undefined ? { responseRate } : {}),
        ...(responseTimeMs !== undefined ? { responseTimeMs } : {}),
        ...(onTimeRate !== undefined ? { onTimeRate } : {}),
        ...(categoryPercentile !== undefined ? { categoryPercentile } : {}),
      },
    });

    await evaluateBadges(ownerId);

    const sellerBadges = await prisma.sellerBadge.findMany({
      where: { ownerId },
      include: { badge: true },
      orderBy: { earnedAt: "asc" },
    });

    return res.json({
      ok: true,
      profile,
      badges: sellerBadges.map((sb) => ({
        code: sb.badge.code,
        label: sb.badge.label,
        description: sb.badge.description,
        icon: sb.badge.icon,
        earnedAt: sb.earnedAt,
      })),
    });
  } catch (e: any) {
    const code = e.message === "UNAUTHENTICATED" ? 401 : 500;
    return res.status(code).json({ ok: false, message: e.message ?? "Error" });
  }
});

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

    await evaluateBadges(Number(ownerId));

    return res.json({ ok: true, user, status: "verified" });
  } catch (e: any) {
    return res.status(500).json({ ok: false, message: e.message ?? "Error" });
  }
});

/* =========================
 *   ENDPOINTS DE INSIGNIAS
 * ========================= */

userRouter.get("/badges", async (_req: Request, res: Response) => {
  try {
    await ensureBadgeCatalog();
    const list = await prisma.badge.findMany({ orderBy: { code: "asc" } });
    return res.json({ ok: true, badges: list });
  } catch (e: any) {
    return res.status(500).json({ ok: false, message: e.message ?? "Error" });
  }
});

userRouter.post("/profiles/seller/evaluate", authMW, async (req: Request, res: Response) => {
  try {
    const ownerId = getUserId(req);
    await evaluateBadges(ownerId);
    const sellerBadges = await prisma.sellerBadge.findMany({
      where: { ownerId },
      include: { badge: true },
      orderBy: { earnedAt: "asc" },
    });
    return res.json({
      ok: true,
      badges: sellerBadges.map((sb) => ({
        code: sb.badge.code,
        label: sb.badge.label,
        description: sb.badge.description,
        icon: sb.badge.icon,
        earnedAt: sb.earnedAt,
      })),
    });
  } catch (e: any) {
    const code = e.message === "UNAUTHENTICATED" ? 401 : 500;
    return res.status(code).json({ ok: false, message: e.message ?? "Error" });
  }
});

userRouter.post("/admin/sellers/:ownerId/badges/:code", async (req: Request, res: Response) => {
  try {
    const ownerId = Number(req.params.ownerId);
    const code = req.params.code as BadgeCode;
    if (Number.isNaN(ownerId)) return res.status(400).json({ ok: false, message: "ownerId inválido" });

    await ensureBadgeCatalog();
    const b = await prisma.badge.findUnique({ where: { code } });
    if (!b) return res.status(404).json({ ok: false, message: "Badge no encontrado" });

    const already = await prisma.sellerBadge.findFirst({ where: { ownerId, badgeId: b.id } });
    if (already) return res.json({ ok: true, message: "Ya la tiene" });

    const sb = await prisma.sellerBadge.create({
      data: { ownerId, badgeId: b.id, earnedAt: new Date() },
    });
    return res.json({ ok: true, granted: sb });
  } catch (e: any) {
    return res.status(500).json({ ok: false, message: e.message ?? "Error" });
  }
});

userRouter.delete("/admin/sellers/:ownerId/badges/:code", async (req: Request, res: Response) => {
  try {
    const ownerId = Number(req.params.ownerId);
    const code = req.params.code as BadgeCode;
    if (Number.isNaN(ownerId)) return res.status(400).json({ ok: false, message: "ownerId inválido" });

    const b = await prisma.badge.findUnique({ where: { code } });
    if (!b) return res.status(404).json({ ok: false, message: "Badge no encontrado" });

    const sb = await prisma.sellerBadge.findFirst({ where: { ownerId, badgeId: b.id } });
    if (!sb) return res.status(404).json({ ok: false, message: "El seller no tiene esa insignia" });

    await prisma.sellerBadge.delete({ where: { id: sb.id } });
    return res.json({ ok: true, revoked: code });
  } catch (e: any) {
    return res.status(500).json({ ok: false, message: e.message ?? "Error" });
  }
});

export default userRouter;