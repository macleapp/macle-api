// src/routes.ts
import { Router } from "express";

// Rutas clásicas
import authRouter from "./routes/auth";
import usersRouter from "./routes/users";
import productsRouter from "./routes/products";
import serviceProfileRouter from "./routes/serviceProfile";
import uploadRouter from "./routes/upload";

// Pagos (Stripe)
import paymentRouter from "./modules/payment/payment.controller";

const api = Router();

/**
 * Importante: el webhook de Stripe se monta con express.raw() en index.ts,
 * NO aquí. Aquí montamos el resto de endpoints de /payment.
 */
api.use("/auth", authRouter);
api.use("/users", usersRouter);
api.use("/products", productsRouter);
api.use("/service-profile", serviceProfileRouter);
api.use("/upload", uploadRouter);

// Endpoints de pago “normales” (ej. /payment/checkout, /payment/status)
api.use("/payment", paymentRouter);

export default api;