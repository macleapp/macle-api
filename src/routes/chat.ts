import { Router } from 'express';
import  prisma  from '../lib/prisma';

const r = Router();

// GET /api/chat/history?sellerId=123
r.get('/history', async (req, res) => {
  const sellerId = Number(req.query.sellerId);
  if (!sellerId) return res.status(400).json({ error: 'sellerId required' });

  const items = await prisma.chatMessage.findMany({
    where: { sellerId },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ items });
});

// POST /api/chat/send { sellerId, text, userId? }
r.post('/send', async (req, res) => {
  const { sellerId, text, userId } = req.body || {};
  if (!sellerId || !text) return res.status(400).json({ error: 'sellerId & text required' });

  const mine = await prisma.chatMessage.create({
    data: { sellerId: Number(sellerId), userId, from: 'me', text },
  });

  // Respuesta simulada (luego la cambias por lógica real)
  const reply = await prisma.chatMessage.create({
    data: { sellerId: Number(sellerId), from: 'seller', text: 'Recibido ✅ ¿En qué ciudad estás?' },
  });

  res.json({ ok: true, mine, reply });
});

export default r;