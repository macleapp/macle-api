// src/lib/authMW.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { ENV } from "../config/env";

declare global {
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

/**
 * Middleware de autenticación.
 * Requiere header: Authorization: Bearer <token>
 */
export const authMW = (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, msg: "No autorizado, falta token" });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, ENV.JWT_ACCESS_SECRET) as { uid: number };
    req.userId = payload.uid;
    return next();
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ ok: false, msg: "Token expirado" });
    }
    return res.status(401).json({ ok: false, msg: "Token inválido" });
  }
};