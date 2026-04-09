// ─── Bot Controller ──────────────────────────────────────────────────────────

import {
  sendMessage,
  sendMessagePlain,
  editMessageText,
  editMessageTextPlain,
  answerCallbackQuery,
  sendChatAction,
  getFile,
  downloadFile,
  buildModeKeyboard,
  buildPaginationKeyboard,
} from './telegram.js';

import {
  getUserMode,
  setUserMode,
  loadHistory,
  saveMessage,
  clearHistory,
  trimHistory,
  savePaginationState,
  getPaginationState,
  updatePaginationPage,
  saveFileContent,
  getFileContent,
  getLastUserMessage,
  deleteLastAssistantMessage,
} from './memoryService.js';

import { getAIResponse } from './aiService.js';

import {
  formatResponse,
  escapeForTelegram,
  paginateResponse,
  buildPageHeader,
} from './formattingService.js';

// ─── Duplicate protection ────────────────────────────────────────────────────
const processedUpdates = new Set();
const MAX_TRACKED_UPDATES = 5000;

function isDuplicate(updateId) {
  if (updateId == null) return false;

  if (processedUpdates.has(updateId)) return true;

  processedUpdates.add(updateId);

  if (processedUpdates.size > MAX_TRACKED_UPDATES) {
    const iterator = processedUpdates.values();
    for (let i = 0; i < 1000; i++) {
      processedUpdates.delete(iterator.next().value);
    }
  }

  return false;
}

// ─── Typing indicator ───────────────────────────────────────────────────────
function startTypingIndicator(chatId) {
  const interval = setInterval(() => {
    sendChatAction(chatId, 'typing').catch(() => {});
  }, 4000);

  sendChatAction(chatId, 'typing').catch(() => {});
  return () => clearInterval(interval);
}

// ─── Error formatter ─────────────────────────────────────────────────────────
function formatError(error) {
  return [
    '❌ Something went wrong',
    error?.message ? `🔧 ${error.message}` : '',
    '',
    'Please try again.',
  ]
    .filter(Boolean)
    .join('\n');
}

// ─── Paginated response ──────────────────────────────────────────────────────
async function sendPaginatedResponse(chatId, userId, mode, fullText) {
  const formatted = formatResponse(fullText);
  const pages = paginateResponse(formatted);

  const header = buildPageHeader(mode, 0, pages.length);
  const firstPage = header + pages[0];

  const keyboard =
    pages.length > 1
      ? buildPaginationKeyboard(0, pages.length, mode)
      : buildModeKeyboard(mode);

  try {
    const escaped = escapeForTelegram(firstPage);
    const msg = await sendMessage(chatId, escaped, { replyMarkup: keyboard });

    if (pages.length > 1) {
      await savePaginationState(chatId, msg.message_id, userId, pages);
    }

    return msg;
  } catch (err) {
    console.warn("Markdown failed, fallback used:", err.message);

    return await sendMessagePlain(chatId, firstPage, {
      replyMarkup: keyboard,
    });
  }
}

// ─── TEXT HANDLER ────────────────────────────────────────────────────────────
async function handleTextMessage(chatId, userId, text) {
  if (!text?.trim()) return;

  const userMessage = text.trim();

  if (userMessage === '/start') {
    const mode = await getUserMode(userId);

    const welcome = [
      '👋 Welcome to Zero AI!',
      '',
      '⚡ Fast Mode',
      '🧠 Thinker Mode',
      '',
      'Send a message to begin.',
    ].join('\n');

    await sendMessagePlain(chatId, welcome, {
      replyMarkup: buildModeKeyboard(mode),
    });

    return;
  }

  const stopTyping = startTypingIndicator(chatId);

  try {
    const mode = await getUserMode(userId);
    const history = await loadHistory(userId);
    const fileContext = await getFileContent(userId);

    await saveMessage(userId, 'user', userMessage);

    // ─── SAFE AI CALL ─────────────────────────────────────────
    let aiResponse;

    try {
      aiResponse = await getAIResponse(
        mode,
        history,
        userMessage,
        fileContext
      );

      if (!aiResponse || typeof aiResponse !== 'string') {
        throw new Error('Invalid AI response');
      }
    } catch (err) {
      console.error("🔥 AI ERROR:", err);

      await sendMessagePlain(
        chatId,
        "⚠️ AI failed to respond. Try again."
      );

      return;
    }

    await saveMessage(userId, 'assistant', aiResponse);

    trimHistory(userId).catch(() => {});

    await sendPaginatedResponse(chatId, userId, mode, aiResponse);
  } catch (error) {
    console.error("🔥 MESSAGE HANDLER ERROR:", error);

    await sendMessagePlain(
      chatId,
      formatError(error),
      {
        replyMarkup: await getUserMode(userId).then(buildModeKeyboard),
      }
    );
  } finally {
    stopTyping();
  }
}

// ─── DOCUMENT HANDLER ───────────────────────────────────────────────────────
async function handleDocument(chatId, userId, document) {
  try {
    await sendMessagePlain(chatId, "📄 File received, processing...");
    await saveFileContent(userId, document.file_name, "FILE_CONTENT_PLACEHOLDER");

    await sendMessagePlain(chatId, "✅ File stored successfully.");
  } catch (err) {
    console.error("🔥 FILE ERROR:", err);
    await sendMessagePlain(chatId, "❌ File processing failed.");
  }
}

// ─── CALLBACK HANDLER ───────────────────────────────────────────────────────
async function handleCallbackQuery(callbackQuery) {
  const { id, data, message, from } = callbackQuery;

  try {
    await answerCallbackQuery(id);

    if (data === 'mode_fast' || data === 'mode_thinker') {
      const mode = data === 'mode_fast' ? 'fast' : 'thinker';

      await setUserMode(from.id, mode);

      await editMessageTextPlain(
        message.chat.id,
        message.message_id,
        message.text || '',
        { replyMarkup: buildModeKeyboard(mode) }
      );

      return;
    }

    if (data === 'clear_memory') {
      await clearHistory(from.id);

      await editMessageTextPlain(
        message.chat.id,
        message.message_id,
        "🗑️ Memory cleared",
        { replyMarkup: buildModeKeyboard('fast') }
      );

      return;
    }

    if (data === 'page_noop') return;

    await answerCallbackQuery(id, 'Unknown action');
  } catch (err) {
    console.error("🔥 CALLBACK ERROR:", err);
  }
}

// ─── MAIN ENTRY ──────────────────────────────────────────────────────────────
export async function handleUpdate(update) {
  try {
    console.log("🔥 UPDATE RECEIVED");

    if (!update) return;

    console.log("📦 KEYS:", Object.keys(update));

    if (update.update_id != null && isDuplicate(update.update_id)) {
      console.log("⏭️ Duplicate ignored");
      return;
    }

    if (update.callback_query) {
      return await handleCallbackQuery(update.callback_query);
    }

    if (!update.message) return;

    const { chat, from, text, document } = update.message;

    if (!chat?.id || !from?.id) return;

    if (document) {
      return await handleDocument(chat.id, from.id, document);
    }

    if (text) {
      return await handleTextMessage(chat.id, from.id, text);
    }
  } catch (err) {
    console.error("🔥 CRITICAL UPDATE ERROR:", err);
  }
}
