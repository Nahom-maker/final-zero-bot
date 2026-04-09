// ─── Webhook Route ───────────────────────────────────────────────────────────
// Express router for the Telegram webhook endpoint.
// Receives updates from Telegram and dispatches to the controller.

import { Router } from 'express';
import { handleUpdate } from './botController.js';

const router = Router();

/**
 * POST /webhook
 * Telegram sends updates here. We respond 200 immediately
 * and process asynchronously to avoid webhook timeouts.
 */
router.post('/webhook', (req, res) => {
  // Immediately acknowledge receipt to Telegram
  res.sendStatus(200);

  // Process the update asynchronously
  const update = req.body;

  if (!update || typeof update !== 'object') {
    console.warn('[Webhook] Received invalid update payload');
    return;
  }

  handleUpdate(update).catch((error) => {
    console.error('[Webhook] Unhandled error in update processing:', error);
  });
});

/**
 * GET /webhook
 * Health check endpoint — useful for monitoring and Leapcell health probes.
 */
router.get('/webhook', (req, res) => {
  res.json({
    status: 'ok',
    bot: 'Zero AI Telegram Bot',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /
 * Root health check.
 */
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Zero AI Telegram Bot',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

export default router;
