// ─── CONFIG ─────────────────────────────────────────
const config = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
  },

  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
  },

  fast: {
    model: process.env.FAST_MODEL || "qwen/qwen3.5-122b-a10b",
  },

  thinker: {
    model: process.env.THINKER_MODEL || "stepfun-ai/step-3.5-flash",
  },

  ai: {
    timeoutMs: 15000,
    maxRetries: 3,
  },

  memory: {
    maxMessages: 20,
  },
};

const fastModel = config?.fast?.model ?? "llama-3.1-8b-instant";
const thinkerModel = config?.thinker?.model ?? "llama-3.1-70b-versatile";
console.log("FAST:", config.fast);
console.log("THINKER:", config.thinker);
console.log("CONFIG FULL:", config);

export default config;
// ─── TELEGRAM API BASE ──────────────────────────────

const API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

/**
 * Generic Telegram API caller with error handling + timeout safety
 */
async function callTelegram(method, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`${API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const data = await res.json();

    if (!data.ok) {
      const err = new Error(data.description || 'Telegram API error');
      err.telegramError = data;
      throw err;
    }

    return data.result;
  } catch (error) {
    clearTimeout(timeout);
    console.error(`❌ Telegram call failed (${method}):`, error.message);
    throw error;
  }
}

// ─── MESSAGING ──────────────────────────────────────

export async function sendMessage(chatId, text, options = {}) {
  return callTelegram('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: options.parseMode || 'HTML',
    reply_markup: options.replyMarkup,
    disable_web_page_preview: true,
  });
}

export async function sendMessagePlain(chatId, text, options = {}) {
  return callTelegram('sendMessage', {
    chat_id: chatId,
    text,
    reply_markup: options.replyMarkup,
    disable_web_page_preview: true,
  });
}

export async function editMessageText(chatId, messageId, text, options = {}) {
  return callTelegram('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: options.parseMode || 'HTML',
    reply_markup: options.replyMarkup,
    disable_web_page_preview: true,
  });
}

export async function answerCallbackQuery(callbackQueryId, text = '') {
  return callTelegram('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false,
  });
}

export async function sendChatAction(chatId, action = 'typing') {
  return callTelegram('sendChatAction', {
    chat_id: chatId,
    action,
  });
}

export async function getFile(fileId) {
  return callTelegram('getFile', { file_id: fileId });
}

export async function downloadFile(filePath) {
  const url = `https://api.telegram.org/file/bot${config.telegram.token}/${filePath}`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to download file: ${res.status}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

// ─── WEBHOOK ────────────────────────────────────────

export async function setWebhook(url) {
  return callTelegram('setWebhook', {
    url,
    allowed_updates: ['message', 'callback_query'],
  });
}

export async function deleteWebhook() {
  return callTelegram('deleteWebhook', {
    drop_pending_updates: true,
  });
}

// ─── KEYBOARD BUILDER ───────────────────────────────

export function buildModeKeyboard(currentMode) {
  return {
    inline_keyboard: [
      [
        {
          text: currentMode === 'fast' ? '✅ ⚡ Fast' : '⚡ Fast',
          callback_data: 'mode_fast',
        },
        {
          text: currentMode === 'thinker' ? '✅ 🧠 Thinker' : '🧠 Thinker',
          callback_data: 'mode_thinker',
        },
      ],
      [
        { text: '🗑️ Clear Memory', callback_data: 'clear_memory' },
        { text: '🔄 Regenerate', callback_data: 'regenerate' },
      ],
    ],
  };
}

export function buildPaginationKeyboard(currentPage, totalPages, currentMode) {
  const navRow = [];

  if (currentPage > 0) {
    navRow.push({ text: '⬅️ Previous', callback_data: `page_prev_${currentPage}` });
  }

  navRow.push({ text: `${currentPage + 1}/${totalPages}`, callback_data: 'page_noop' });

  if (currentPage < totalPages - 1) {
    navRow.push({ text: 'Next ➡️', callback_data: `page_next_${currentPage}` });
  }

  return {
    inline_keyboard: [
      navRow,
      [
        {
          text: currentMode === 'fast' ? '✅ ⚡ Fast' : '⚡ Fast',
          callback_data: 'mode_fast',
        },
        {
          text: currentMode === 'thinker' ? '✅ 🧠 Thinker' : '🧠 Thinker',
          callback_data: 'mode_thinker',
        },
      ],
      [
        { text: '🗑️ Clear Memory', callback_data: 'clear_memory' },
        { text: '🔄 Regenerate', callback_data: 'regenerate' },
      ],
    ],
  };
}
