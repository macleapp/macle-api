// src/routes/onboarding.ts
import { Router, Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { authMW } from "../lib/authMW";
import { Role } from "@prisma/client";
import { z } from "zod";

const router = Router();

/* ========= Schemas ========= */
const sellerSchema = z.object({
  body: z.object({
    businessName: z.string().trim().min(2, "Nombre del negocio requerido"),
    phone: z.string().trim().min(6).optional().or(z.literal("")),
    city: z.string().trim().min(2).optional().or(z.literal("")),
  }),
});

const providerSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, "Nombre requerido"),
    phone: z.string().trim().min(6).optional().or(z.literal("")),
    city: z.string().trim().min(2).optional().or(z.literal("")),
  }),
});

/* ========= Helpers ========= */
function validate<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse({ body: req.body });
    if (!parsed.success) {
      const msg = parsed.error.issues.map(e => e.message).join(", ");
      return res.status(400).json({ ok: false, msg });
    }
    // Normaliza strings vacíos -> null
    req.body = Object.fromEntries(
      Object.entries(req.body).map(([k, v]) =>
        typeof v === "string" ? [k, v.trim() || null] : [k, v]
      )
    );
    next();
  };
}

/* ========= SELLER ========= */
router.post("/seller", authMW, validate(sellerSchema), async (req: Request, res: Response) => {
  try {
    const id = Number((req as any).userId);
    if (!id) return res.status(401).json({ ok: false, msg: "Unauthorized" });

    const { businessName, phone, city } = req.body as {
      businessName: string;
      phone?: string | null;
      city?: string | null;
    };

    const user = await prisma.user.update({
      where: { id },
      data: {
        role: Role.SELLER,
        onboardingCompleted: true,
        business: {
          upsert: {
            create: { name: businessName.trim(), phone, city },
            update: { name: businessName.trim(), phone, city },
          },
        },
      },
      include: { business: true },
    });

    return res.json({ ok: true, user });
  } catch (e: any) {
    return res.status(400).json({ ok: false, msg: e.message ?? "Error" });
  }
});

/* ========= PROVIDER ========= */
router.post("/provider", authMW, validate(providerSchema), async (req: Request, res: Response) => {
  try {
    const id = Number((req as any).userId);
    if (!id) return res.status(401).json({ ok: false, msg: "Unauthorized" });

    const { name, phone, city } = req.body as {
      name: string;
      phone?: string | null;
      city?: string | null;
    };

    const user = await prisma.user.update({
      where: { id },
      data: {
        role: Role.PROVIDER,
        onboardingCompleted: true,
        serviceProfile: {
          upsert: {
            create: { name: name.trim(), phone, city },
            update: { name: name.trim(), phone, city },
          },
        },
      },
      include: { serviceProfile: true },
    });

    return res.json({ ok: true, user });
  } catch (e: any) {
    return res.status(400).json({ ok: false, msg: e.message ?? "Error" });
  }
});

export default router;