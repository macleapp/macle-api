// src/lib/validate.ts
import { z, ZodError } from "zod";
import type { Request, Response, NextFunction } from "express";

/**
 * Middleware de validación con Zod:
 * - Usa safeParse (no lanza excepciones)
 * - Retorna 422 con detalles si falla
 * - Reemplaza req.body / req.query / req.params con los datos parseados
 */
export function validate(schema: z.ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
      headers: req.headers,
    });

    if (!result.success) {
      const err = result.error as ZodError;
      return res.status(422).json({
        ok: false,
        msg: "Validación fallida",
        issues: err.issues.map(e => ({
          path: e.path.join("."),
          code: e.code,
          message: e.message,
        })),
      });
    }

    // Asignar de vuelta lo validado (evita datos inesperados aguas abajo)
    const { body, query, params } = result.data as {
      body?: unknown; query?: unknown; params?: unknown;
    };
    if (body !== undefined)   (req as any).body = body;
    if (query !== undefined)  (req as any).query = query;
    if (params !== undefined) (req as any).params = params;

    return next();
  };
}