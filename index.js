import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import fetch from 'node-fetch'; // para llamar a la API de FCM

const app = express();
app.use(cors());
app.use(express.json());

// ====== MOCKS (reemplázalos luego por tu BD) ======
const products = [
  { id: 'p1', name: 'Shampoo Premium', price: 8.99, imageUrl: 'https://picsum.photos/seed/p1/600/400', description: 'Cabello sedoso' },
  { id: 'p2', name: 'Acondicionador Pro', price: 10.5, imageUrl: 'https://picsum.photos/seed/p2/600/400', description: 'Brillo y suavidad' },
  { id: 'p3', name: 'Cera Modeladora', price: 7.2, imageUrl: 'https://picsum.photos/seed/p3/600/400' },
  { id: 'p4', name: 'Tinte Natural', price: 12.9, imageUrl: 'https://picsum.photos/seed/p4/600/400' },
  { id: 'p5', name: 'Secador Travel', price: 25.0, imageUrl: 'https://picsum.photos/seed/p5/600/400' },
  { id: 'p6', name: 'Plancha 2en1', price: 39.9, imageUrl: 'https://picsum.photos/seed/p6/600/400' },
  { id: 'p7', name: 'Peine Carbón', price: 4.5, imageUrl: 'https://picsum.photos/seed/p7/600/400' },
  { id: 'p8', name: 'Serum Nutritivo', price: 15.0, imageUrl: 'https://picsum.photos/seed/p8/600/400' },
  { id: 'p9', name: 'Gel Fijación', price: 6.1, imageUrl: 'https://picsum.photos/seed/p9/600/400' }
];

const services = [
  { id: 's1', name: 'Corte clásico', price: 12, imageUrl: 'https://picsum.photos/seed/s1/600/400', description: '30 min' },
  { id: 's2', name: 'Corte + Barba', price: 18, imageUrl: 'https://picsum.photos/seed/s2/600/400' },
  { id: 's3', name: 'Tintura', price: 25, imageUrl: 'https://picsum.photos/seed/s3/600/400' },
  { id: 's4', name: 'Keratina', price: 60, imageUrl: 'https://picsum.photos/seed/s4/600/400' },
  { id: 's5', name: 'Peinado evento', price: 30, imageUrl: 'https://picsum.photos/seed/s5/600/400' },
  { id: 's6', name: 'Lavado + Brushing', price: 20, imageUrl: 'https://picsum.photos/seed/s6/600/400' }
];

// ====== BASE DE DATOS EN MEMORIA ======
const devices = []; // aquí se guardarán los tokens de FCM

// ====== ENDPOINTS MOCKS ======
app.get('/products', (req, res) => {
  const limit = Number(req.query.limit) || products.length;
  return res.json(products.slice(0, limit));
});

app.get('/products/:id', (req, res) => {
  const item = products.find(p => p.id === req.params.id);
  if (!item) return res.status(404).json({ message: 'Producto no encontrado' });
  return res.json(item);
});

app.get('/services', (req, res) => {
  const limit = Number(req.query.limit) || services.length;
  return res.json(services.slice(0, limit));
});

app.get('/services/:id', (req, res) => {
  const item = services.find(s => s.id === req.params.id);
  if (!item) return res.status(404).json({ message: 'Servicio no encontrado' });
  return res.json(item);
});

// ====== PUSH NOTIFICATIONS ======

// Registrar un token de dispositivo
app.post('/devices/register', (req, res) => {
  const { token, platform } = req.body;
  if (!token) return res.status(400).json({ message: 'Token requerido' });

  if (!devices.find(d => d.token === token)) {
    devices.push({ token, platform });
  }

  return res.json({ success: true });
});

// Enviar notificación de prueba a todos los dispositivos
app.post('/notifications/test', async (req, res) => {
  const { title, body } = req.body;
  if (!process.env.FCM_SERVER_KEY) {
    return res.status(500).json({ message: 'Falta FCM_SERVER_KEY en .env' });
  }

  const promises = devices.map(d =>
    fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        Authorization: `key=${process.env.FCM_SERVER_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: d.token,
        notification: { title, body },
        data: { route: 'Home' }
      })
    })
  );

  await Promise.all(promises);
  return res.json({ success: true, sent: devices.length });
});

// ====== Salud ======
app.get('/', (_, res) => res.send('OK macle-api'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`macle-api escuchando en http://localhost:${PORT}`);
});