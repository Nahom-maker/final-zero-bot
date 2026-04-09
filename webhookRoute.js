import { Router } from 'express';
import { handleUpdate } from './botController.js';

const router = Router();

router.post('/webhook', (req, res) => {
  res.sendStatus(200);

  const update = req.body;

  console.log("📩 RAW UPDATE:", JSON.stringify(update, null, 2));

  if (!update || typeof update !== 'object') {
    console.warn('[Webhook] Invalid update payload');
    return;
  }

  Promise.resolve()
    .then(() => handleUpdate(update))
    .catch((error) => {
      console.error('[Webhook] Unhandled error in update processing:', error);
    });
});

router.get('/webhook', (req, res) => {
  res.json({
    status: 'ok',
    bot: 'Zero AI Telegram Bot',
    timestamp: new Date().toISOString(),
  });
});

router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Zero AI Telegram Bot',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

export default router;
