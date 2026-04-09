// ─── Webhook Route ───────────────────────────────────────────────────────────
// Telegram webhook handler (SAFE VERSION)

import { Router } from 'express';
import { handleUpdate } from './botController.js';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /webhook
// Telegram sends updates here
// ─────────────────────────────────────────────────────────────────────────────
router.post('/webhook', (req, res) => {
  try {
    console.log("🔥 WEBHOOK HIT");
    console.log("BODY TYPE:", typeof req.body);
    console.log("BODY:", req.body);

    // Always respond immediately to Telegram
    res.sendStatus(200);

    const update = req.body;

    if (!update || typeof update !== 'object') {
      console.warn('[Webhook] Invalid update payload received');
      return;
    }

    // Async processing (never block Telegram)
    handleUpdate(update).catch((error) => {
      console.error('[Webhook] Unhandled error in update processing:', error);
    });

  } catch (error) {
    console.error('[Webhook] CRITICAL ROUTE ERROR:', error);

    // Still respond to avoid Telegram retry loops
    try {
      res.sendStatus(200);
    } catch {}
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /webhook (health check)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/webhook', (req, res) => {
  res.json({
    status: 'ok',
    bot: 'Zero AI Telegram Bot',
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET / (server health check)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Zero AI Telegram Bot',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

export default router;
