// src/routes.ts
import { Router } from "express";

// Rutas clásicas
import authRouter from "./routes/auth";
import usersRouter from "./routes/users";
import productsRouter from "./routes/products";
import serviceProfileRouter from "./routes/serviceProfile";
import uploadRouter from "./routes/upload";

// Nuevas/ajustes
import welcomeRouter from "./routes/welcome";
import onboardingRouter from "./routes/onboarding";

// Pagos (Stripe)
import paymentRouter from "./modules/payment/payment.controller";

const api = Router();

/**
 * Importante: el webhook de Stripe se monta con express.raw() en index.ts,
 * NO aquí. Aquí montamos el resto de endpoints de /payment.
 */
api.use("/auth", authRouter);
api.use("/welcome", welcomeRouter)

// 👇 añade el ping simple bajo /auth -> GET /api/auth/welcome
api.use("/auth", welcomeRouter);

// 👇 onboarding protegido (adentro del archivo se aplica el middleware)
api.use("/onboarding", onboardingRouter);

api.use("/users", usersRouter);
api.use("/products", productsRouter);
api.use("/service-profile", serviceProfileRouter);
api.use("/upload", uploadRouter);

// Endpoints de pago “normales”
api.use("/payment", paymentRouter);

export default api;