// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface JwtReq extends Request { userId?: number; }

export function authMiddleware(req: JwtReq, res: Response, next: NextFunction) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return res.status(401).json({ ok: false, msg: 'No token' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as any;
    req.userId = payload.sub || payload.uid || payload.userId;
    if (!req.userId) return res.status(401).json({ ok: false, msg: 'Token inválido' });
    next();
  } catch {
    return res.status(401).json({ ok: false, msg: 'Token inválido' });
  }
}