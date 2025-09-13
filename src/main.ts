import app from "./index";
import slowDown from "express-slow-down";

const PORT = Number(process.env.PORT) || 3000;

// ejemplo de middleware opcional
app.use(
  "/api/auth",
  slowDown({
    windowMs: 10 * 60 * 1000, // 10 min
    delayAfter: 5,            // a partir de la 6ª request
    delayMs: 500,             // añade 500ms extra por request
  })
);

// 🚀 Levanta el server aquí SOLO una vez
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});