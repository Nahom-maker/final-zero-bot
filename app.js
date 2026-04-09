import 'dotenv/config.js'; // MUST be first

import express from 'express';
import config from './config.js';
import { getUpdates, setWebhook, deleteWebhook } from './telegram.js';
import webhookRoute from './webhookRoute.js';
import { handleUpdate } from './botController.js';

// NOW env is safe
console.log("TOKEN:", process.env.TELEGRAM_BOT_TOKEN?.slice(0,10));
// ─── Middleware ───────────────────────────────────────────────────────────────

// Parse JSON bodies (Telegram sends JSON webhooks)
app.use(express.json());

// Request logging (lightweight)
app.use((req, res, next) => {
  if (req.method === 'POST') {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

// ─── Routes ──────────────────────────────────────────────────────────────────

app.use(webhookRoute);

// ─── 404 Handler ─────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Global Error Handler ────────────────────────────────────────────────────

app.use((err, req, res, _next) => {
  console.error('[App] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Server Startup & Bot Initialization ─────────────────────────────────────

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`\n🤖 Zero AI Bot Server running on port ${PORT}`);

  try {
    if (config.telegram.webhookUrl) {
      // ─── Webhook Mode (Production/Leapcell) ───
      const webhookUrl = `${config.telegram.webhookUrl}/webhook`;
      await setWebhook(webhookUrl);
      console.log(`✅ Webhook registered: ${webhookUrl}`);
    } else {
      // ─── Long Polling Mode (Local Dev) ───
      console.log(`🔄 No WEBHOOK_URL provided. Deleting webhook...`);
      await deleteWebhook();
      console.log(`✅ Falling back to Long Polling mode for local dev...`);

      let offset = 0;
      // Background polling loop
      const poll = async () => {
        try {
          const updates = await getUpdates(offset);
          for (const update of updates) {
            offset = update.update_id + 1;
            // Process async without blocking polling
            handleUpdate(update).catch((err) => {
              console.error('[Polling] Update processing error:', err.message);
            });
          }
        } catch (error) {
          if (error.name !== 'AbortError' && !error.message.includes('timeout')) {
            console.error('[Polling] Error fetching updates:', error.message);
          }
        } finally {
          setTimeout(poll, 1000); // 1-second delay between checks
        }
      };

      poll(); // kick off the loop
    }
  } catch (error) {
    console.error('❌ Failed to initialize Telegram connection:', error.message);
  }

  console.log('\n📋 Configuration:');
  console.log(`   Fast Model:    ${config.fast.model}`);
  console.log(`   Thinker Model: ${config.thinker.model}`);
  console.log(`   Memory Limit:  ${config.memory.maxMessages} messages`);
  console.log(`   AI Timeout:    ${config.ai.timeoutMs / 1000}s`);
  console.log(`   Max Retries:   ${config.ai.maxRetries}`);
  console.log('\n✨ Ready to receive messages!\n');
});

// ─── Graceful Shutdown ───────────────────────────────────────────────────────

process.on('SIGTERM', () => {
  console.log('\n🛑 SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n🛑 SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  console.error('[App] Unhandled Promise Rejection:', reason);
  // Don't crash — log and continue
});

process.on('uncaughtException', (error) => {
  console.error('[App] Uncaught Exception:', error);
  // Don't crash immediately — let in-flight requests finish
  setTimeout(() => process.exit(1), 5000);
});

export default app;
