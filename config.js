// ─── Telegram API Helper ─────────────────────────────────────────────────────
// Stable wrapper around Telegram Bot API using fetch

import config from './config.js';

// ✅ FIX: build API directly from token (no fragile apiBase)
const API = `https://api.telegram.org/bot${config.telegram.token}`;

/**
 * Generic Telegram API caller with error handling
 */
async function callTelegram(method, body) {
  try {
    const res = await fetch(`${API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!data.ok) {
      const err = new Error(`Telegram API error: ${data.description || 'Unknown'}`);
      err.telegramError = data;
      err.statusCode = res.status;
      throw err;
    }

    return data.result;
  } catch (error) {
    console.error(`❌ Telegram call failed (${method}):`, error.message);
    throw error;
  }
}

// ─── Message Sending ─────────────────────────────────────────────────────────

export async function sendMessage(chatId, text, options = {}) {
  return callTelegram('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: options.parseMode || 'MarkdownV2',
    reply_markup: options.replyMarkup || undefined,
    disable_web_page_preview: true,
  });
}

export async function sendMessagePlain(chatId, text, options = {}) {
  return callTelegram('sendMessage', {
    chat_id: chatId,
    text,
    reply_markup: options.replyMarkup || undefined,
    disable_web_page_preview: true,
  });
}

export async function editMessageText(chatId, messageId, text, options = {}) {
  return callTelegram('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: options.parseMode || 'MarkdownV2',
    reply_markup: options.replyMarkup || undefined,
    disable_web_page_preview: true,
  });
}

export async function editMessageTextPlain(chatId, messageId, text, options = {}) {
  return callTelegram('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    reply_markup: options.replyMarkup || undefined,
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

// ─── Polling & Webhook Management ───────────────────────────────────────────

export async function getUpdates(offset) {
  return callTelegram('getUpdates', {
    offset,
    timeout: 30,
    allowed_updates: ['message', 'callback_query'],
  });
}

export async function setWebhook(url) {
  return callTelegram('setWebhook', {
    url,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true,
  });
}

export async function deleteWebhook() {
  return callTelegram('deleteWebhook', {
    drop_pending_updates: true,
  });
}

// ─── Inline Keyboard Builders ────────────────────────────────────────────────

export function buildModeKeyboard(currentMode) {
  const fastLabel = currentMode === 'fast' ? '✅ ⚡ Fast' : '⚡ Fast';
  const thinkerLabel = currentMode === 'thinker' ? '✅ 🧠 Thinker' : '🧠 Thinker';

  return {
    inline_keyboard: [
      [
        { text: fastLabel, callback_data: 'mode_fast' },
        { text: thinkerLabel, callback_data: 'mode_thinker' },
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

  const fastLabel = currentMode === 'fast' ? '✅ ⚡ Fast' : '⚡ Fast';
  const thinkerLabel = currentMode === 'thinker' ? '✅ 🧠 Thinker' : '🧠 Thinker';

  return {
    inline_keyboard: [
      navRow,
      [
        { text: fastLabel, callback_data: 'mode_fast' },
        { text: thinkerLabel, callback_data: 'mode_thinker' },
      ],
      [
        { text: '🗑️ Clear Memory', callback_data: 'clear_memory' },
        { text: '🔄 Regenerate', callback_data: 'regenerate' },
      ],
    ],
  };
}
