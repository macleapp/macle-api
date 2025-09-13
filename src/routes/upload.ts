import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import multer, { MulterError } from "multer";
import { authMW } from "../lib/authMW";
import { ENV } from "../config/env";

const router = Router();

/** 
 * Asegura carpeta de subida (por defecto: "uploads")
 * Sirves estático en index.ts con: app.use("/api/uploads", express.static(UPLOAD_DIR))
 */
const UPLOAD_DIR = path.resolve(process.cwd(), ENV.UPLOAD_DIR || "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/** Prefijo público donde sirves archivos (ajústalo si cambias en index.ts) */
const PUBLIC_PREFIX = "/api/uploads";

/* ---------- Multer config ---------- */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const base = path
      .basename(file.originalname || "file", ext)
      .replace(/[^\w\-]+/g, "_")
      .toLowerCase();
    cb(null, `${Date.now()}_${base}${ext}`);
  },
});

const allowed = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic",
  "video/mp4", "video/quicktime", "video/webm",
]);

function fileFilter(_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if (allowed.has(file.mimetype)) cb(null, true);
  else cb(new Error("Tipo de archivo no permitido"));
}

const maxBytes = Number(ENV.MAX_UPLOAD_MB || 10) * 1024 * 1024; // MB → bytes
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: maxBytes },
});

/* ---------- POST /upload ---------- */
/** Body: form-data con field "file". Respuesta incluye URL pública absoluta y relativa. */
router.post("/", authMW, upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, msg: 'Archivo requerido (field "file")' });
    }

    const filename = req.file.filename;
    const publicPath = `${PUBLIC_PREFIX}/${filename}`;
    const absoluteUrl = `${ENV.APP_PUBLIC_URL}${publicPath}`;

    // TODO opcional: persistir en BD si quieres asociar al usuario

    return res.status(201).json({
      ok: true,
      url: absoluteUrl,           // absoluta (útil para front)
      path: publicPath,           // relativa (si ya conoces tu dominio)
      filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, msg: e.message ?? "Error al subir archivo" });
  }
});

/* ---------- Manejo de errores de Multer en esta ruta ---------- */
router.use((err: any, _req: Request, res: Response, _next: any) => {
  if (err instanceof MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        ok: false,
        msg: `Archivo demasiado grande (máx ${ENV.MAX_UPLOAD_MB || 10} MB)`,
      });
    }
    return res.status(400).json({ ok: false, msg: `Error de subida: ${err.code}` });
  }
  if (err?.message === "Tipo de archivo no permitido") {
    return res.status(400).json({ ok: false, msg: err.message });
  }
  return res.status(500).json({ ok: false, msg: err?.message ?? "Error en upload" });
});

export default router;