// src/routes/notifications.ts

import { Router, Request, Response } from "express";
import admin from "firebase-admin";

const router = Router();

// Función que envía la notificación push
async function sendPushNotification(req: Request, res: Response) {
  try {
    const { title, body, token } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Falta el token del dispositivo" });
    }

    const message = {
      notification: {
        title,
        body,
      },
      token,
    };

    const response = await admin.messaging().send(message);

    return res.status(200).json({
      success: true,
      messageId: response,
    });
  } catch (error: any) {
    console.error("Error enviando notificación:", error);
    return res.status(500).json({ error: error.message });
  }
}

// Ruta para probar enviar notificaciones
router.post("/send", sendPushNotification);

export default router;