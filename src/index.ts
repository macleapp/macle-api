// src/index.ts
import 'dotenv/config';
import express from 'express';
import cors, { CorsOptions } from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { ENV } from './config/env';

import authRouter from './routes/auth';
import productsRouter from './routes/products';
import usersRouter from './routes/users';
import serviceProfileRouter from './routes/serviceProfile';
import uploadRouter from './routes/upload';
import chatRoutes from './routes/chat';
import toolsRoutes from './routes/tools';
import welcomeRouter from "./routes/welcome";

// 👉 cuando me envíes el archivo, descomento:
// import welcomeRouter from './routes/welcome';

const app = express();
const API_PREFIX = '/api';

/* ---------- Hardening ---------- */
app.disable('x-powered-by');
if (ENV.NODE_ENV === 'production') app.set('trust proxy', 1);

/* ---------- Seguridad base ---------- */
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(cookieParser());
app.use(compression());

/* ---------- CORS ---------- */
const allowList = Array.isArray(ENV.CORS_ORIGIN)
  ? (ENV.CORS_ORIGIN as string[])
  : String(ENV.CORS_ORIGIN ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

const corsOptions: CorsOptions = {
  origin: ((origin, cb) => {
    if (!origin) return cb(null, true);            // RN / emulador
    if (!allowList.length) return cb(null, true);  // dev relajado
    if (allowList.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  }) as CorsOptions['origin'],
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

/* ---------- Body parsers ---------- */
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(`${API_PREFIX}/welcome`, welcomeRouter);

/* ---------- Rate limit en /auth ---------- */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(`${API_PREFIX}/auth`, authLimiter);

/* ---------- Archivos estáticos (uploads) ---------- */
const uploadsDir = path.resolve(process.cwd(), ENV.UPLOAD_DIR ?? 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use(
  `${API_PREFIX}/uploads`,
  (req, res, next) => {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    next();
  },
  express.static(uploadsDir)
);

/* ---------- Health ---------- */
app.get(`${API_PREFIX}/health`, (_req, res) => res.send('ok'));

/* ---------- Rutas (todas bajo /api) ---------- */
app.use(`${API_PREFIX}/auth`, authRouter);
app.use(`${API_PREFIX}/products`, productsRouter);
app.use(`${API_PREFIX}/users`, usersRouter);
app.use(`${API_PREFIX}/service-profile`, serviceProfileRouter);
app.use(`${API_PREFIX}/upload`, uploadRouter);
app.use(`${API_PREFIX}/chat`, chatRoutes);
app.use(`${API_PREFIX}/tools`, toolsRoutes);
// app.use(${API_PREFIX}/welcome, welcomeRouter); // ← cuando lo envíes

/* ---------- 404 API ---------- */
app.use(API_PREFIX, (_req, res) => {
  res.status(404).json({ ok: false, msg: 'Not Found' });
});

/* ---------- Error handler ---------- */
app.use((err: any, _req: any, res: any, _next: any) => {
  // eslint-disable-next-line no-console
  console.error(err);
  const status = err.status || 500;
  const msg = err.message || 'Error interno';
  res.status(status).json({ ok: false, msg });
});

export default app;