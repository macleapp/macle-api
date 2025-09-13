import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";   // <-- tu prisma

const router = Router();

const completeSchema = z.object({
  role: z.enum(["CUSTOMER", "SELLER", "PROVIDER"]),
  lang: z.enum(["es", "en"]).default("es"),
  tcAccepted: z.boolean().default(false),
});

router.get("/status", async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { onboardingCompleted: true, lang: true, tcAccepted: true, tcVersion: true },
    });
    if (!user) return res.status(404).json({ ok:false, msg:"Usuario no encontrado" });
    return res.json({ ok:true, ...user });
  } catch (e:any) {
    return res.status(500).json({ ok:false, msg:e.message });
  }
});

router.post("/complete", async (req, res) => {
  try {
    const body = completeSchema.parse(req.body); // <- TIPADO

    const tcVersion = process.env.TC_VERSION ?? "1.0";

    const user = await prisma.user.update({
      where: { id: req.userId! },
      data: {
        onboardingCompleted: true,
        role: body.role,
        lang: body.lang,
        tcAccepted: body.tcAccepted,
        tcVersion,                    // String en Prisma
      },
      select: {
        id: true, role: true, lang: true,
        onboardingCompleted: true, tcAccepted: true, tcVersion: true
      }
    });

    return res.json({ ok:true, user });
  } catch (e:any) {
    if (e?.name === "ZodError") {
      return res.status(400).json({ ok:false, msg:"Datos inválidos", issues: e.issues });
    }
    return res.status(500).json({ ok:false, msg:e.message });
  }
});

export default router;