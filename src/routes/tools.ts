import { Router } from "express";
import fetch from "node-fetch";

const r = Router();

const LT = process.env.LIBRETRANSLATE_URL || "http://localhost:5000";

// POST /api/tools/translate { text, target }
r.post("/translate", async (req, res) => {
  const { text, target } = req.body || {};
  if (!text || !target) {
    return res.status(400).json({ error: "text & target required" });
  }

  try {
    const response = await fetch(`${LT}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: text, source: "auto", target }),
    });
    const data = (await response.json()) as any;
    return res.json({ text: data.translatedText });
  } catch (err) {
    return res.status(500).json({ error: "LibreTranslate error", detail: String(err) });
  }
});

export default r;