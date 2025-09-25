// src/routes/welcome.ts
import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { authMW } from "../lib/authMW";   // ⬅️ importa el middleware

const router = Router();

const completeSchema = z.object({
  role: z.enum(["CUSTOMER", "SELLER", "PROVIDER"]),
  lang: z.enum(["es", "en"]).default("es"),
  tcAccepted: z.boolean().default(false),
});

router.get("/status", authMW, async (req, res) => {   // ⬅️ protégela
  try {
    const userId = Number(req.userId);
    if (!userId) return res.status(401).json({ ok:false, msg:"Unauthorized" });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { onboardingCompleted: true, lang: true, tcAccepted: true, tcVersion: true },
    });
    if (!user) return res.status(404).json({ ok:false, msg:"Usuario no encontrado" });
    return res.json({ ok:true, ...user });
  } catch (e:any) {
    return res.status(500).json({ ok:false, msg:e.message });
  }
});

router.post("/complete", authMW, async (req, res) => { // ⬅️ protégela
  try {
    const body = completeSchema.parse(req.body);
    const userId = Number(req.userId);
    if (!userId) return res.status(401).json({ ok:false, msg:"Unauthorized" });

    const tcVersion = process.env.TC_VERSION ?? "1.0";

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        onboardingCompleted: true,
        role: body.role,
        lang: body.lang,
        tcAccepted: body.tcAccepted,
        tcVersion,
      },
      select: { id:true, role:true, lang:true, onboardingCompleted:true, tcAccepted:true, tcVersion:true }
    });

    return res.json({ ok:true, user });
  } catch (e:any) {
    if (e?.name === "ZodError") {
      return res.status(400).json({ ok:false, msg:"Datos inválidos", issues:e.issues });
    }
    return res.status(500).json({ ok:false, msg:e.message });
  }
});

export default router;