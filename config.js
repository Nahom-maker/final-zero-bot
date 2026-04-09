// ─── Environment Configuration ───────────────────────────────────────────────
// Loads and validates all required environment variables at startup.
// Crashes early with clear errors if anything is missing.

const REQUIRED_VARS = [
  'TELEGRAM_BOT_TOKEN',
  'FAST_API_KEY',
  'FAST_MODEL',
  'THINKER_API_KEY',
  'THINKER_MODEL',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
];

const missing = REQUIRED_VARS.filter((v) => !process.env[v]);
if (missing.length > 0) {
  console.error(`❌ Missing required environment variables:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}

const config = Object.freeze({
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    webhookUrl: process.env.WEBHOOK_URL,
    apiBase: `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`,
  },
  fast: {
    apiKey: process.env.FAST_API_KEY,
    model: process.env.FAST_MODEL,
  },
  thinker: {
    apiKey: process.env.THINKER_API_KEY,
    model: process.env.THINKER_MODEL,
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
  },
  server: {
    port: parseInt(process.env.PORT, 10) || 3001,
  },
  // Tuning constants
  memory: {
    maxMessages: 15,       // number of history messages to load
    trimThreshold: 30,     // when total exceeds this, auto-trim oldest
  },
  pagination: {
    chunkSize: 1000,       // target chars per page (soft limit)
    minChunkSize: 400,     // never make a page smaller than this
    maxChunkSize: 1500,    // hard cap per page
  },
  ai: {
    timeoutMs: 90_000,     // 90 second timeout for AI requests
    maxRetries: 2,         // retry count on failure
    retryDelayMs: 1500,    // delay between retries
  },
});

export default config;
