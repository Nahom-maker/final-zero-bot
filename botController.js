// ─── Bot Controller ──────────────────────────────────────────────────────────
// Central orchestration layer. Handles all incoming Telegram updates:
// text messages, callback queries, and document uploads.
// Coordinates between services and sends responses.

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

// ─── Duplicate prevention ────────────────────────────────────────────────────
// Simple in-memory set to prevent processing the same update twice.
const processedUpdates = new Set();
const MAX_TRACKED_UPDATES = 5000;

function isDuplicate(updateId) {
  if (processedUpdates.has(updateId)) return true;
  processedUpdates.add(updateId);
  // Prevent unbounded growth
  if (processedUpdates.size > MAX_TRACKED_UPDATES) {
    const iterator = processedUpdates.values();
    for (let i = 0; i < 1000; i++) {
      processedUpdates.delete(iterator.next().value);
    }
  }
  return false;
}

// ─── Typing indicator ────────────────────────────────────────────────────────
// Continuously sends "typing" while the AI is processing.

function startTypingIndicator(chatId) {
  const interval = setInterval(() => {
    sendChatAction(chatId, 'typing').catch(() => { });
  }, 4000);

  // Send immediately
  sendChatAction(chatId, 'typing').catch(() => { });

  return () => clearInterval(interval);
}

// ─── Error formatter ─────────────────────────────────────────────────────────

function formatError(error) {
  if (error.structured) {
    return [
      `❌ ERROR TYPE: ${error.errorType}`,
      `❌ ERROR NAME: ${error.errorName}`,
      error.statusCode ? `📊 Status: ${error.statusCode}` : null,
      '',
      'Please try again. If the issue persists, try switching modes.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    '❌ ERROR TYPE: INTERNAL ERROR',
    `❌ ERROR NAME: ${error.message || 'Unknown error'}`,
    '',
    'An unexpected error occurred. Please try again.',
  ].join('\n');
}

// ─── Send paginated response ─────────────────────────────────────────────────

async function sendPaginatedResponse(chatId, userId, mode, fullText) {
  const formatted = formatResponse(fullText);
  const pages = paginateResponse(formatted);

  const header = buildPageHeader(mode, 0, pages.length);
  const firstPageContent = header + pages[0];

  let keyboard;
  if (pages.length > 1) {
    keyboard = buildPaginationKeyboard(0, pages.length, mode);
  } else {
    keyboard = buildModeKeyboard(mode);
  }

  // Try MarkdownV2 first, fall back to plain text
  let sentMessage;
  try {
    const escaped = escapeForTelegram(firstPageContent);
    sentMessage = await sendMessage(chatId, escaped, { replyMarkup: keyboard });
  } catch (mdError) {
    console.warn('[Controller] MarkdownV2 failed, falling back to plain text:', mdError.message);
    sentMessage = await sendMessagePlain(chatId, firstPageContent, { replyMarkup: keyboard });
  }

  // Store pagination state if multi-page
  if (pages.length > 1 && sentMessage) {
    await savePaginationState(chatId, sentMessage.message_id, userId, pages);
  }

  return sentMessage;
}

// ─── Handle text message ─────────────────────────────────────────────────────

async function handleTextMessage(chatId, userId, text) {
  // Input validation
  if (!text || text.trim().length === 0) return;

  const userMessage = text.trim();

  // Handle /start command
  if (userMessage === '/start') {
    const mode = await getUserMode(userId);
    const welcomeText = [
      '👋 Welcome to *Zero AI*\\!',
      '',
      '⚡ *Fast Mode* — Quick, lightweight responses',
      '🧠 *Thinker Mode* — Deep reasoning and analysis',
      '',
      'Just send me a message to get started\\!',
      'Use the buttons below to switch modes or manage memory\\.',
    ].join('\n');

    try {
      await sendMessage(chatId, welcomeText, {
        replyMarkup: buildModeKeyboard(mode),
      });
    } catch {
      await sendMessagePlain(chatId, '👋 Welcome to Zero AI!\n\nJust send me a message to get started.\nUse the buttons below to switch modes.', {
        replyMarkup: buildModeKeyboard(mode),
      });
    }
    return;
  }

  // Start typing indicator
  const stopTyping = startTypingIndicator(chatId);

  try {
    // 1. Load user mode
    const mode = await getUserMode(userId);

    // 2. Load conversation history
    const history = await loadHistory(userId);

    // 3. Check for file context
    const fileContext = await getFileContent(userId);

    // 4. Save user message
    await saveMessage(userId, 'user', userMessage);

    // 5. Get AI response
    const aiResponse = await getAIResponse(mode, history, userMessage, fileContext);

    // 6. Save assistant response
    await saveMessage(userId, 'assistant', aiResponse);

    // 7. Trim history if needed
    trimHistory(userId).catch((err) => {
      console.error('[Controller] Background trim failed:', err.message);
    });

    // 8. Send paginated response
    await sendPaginatedResponse(chatId, userId, mode, aiResponse);
  } catch (error) {
    console.error('[Controller] Message handling error:', error);
    const errorMsg = formatError(error);
    const mode = await getUserMode(userId).catch(() => 'fast');
    await sendMessagePlain(chatId, errorMsg, {
      replyMarkup: buildModeKeyboard(mode),
    });
  } finally {
    stopTyping();
  }
}

// ─── Handle document upload ──────────────────────────────────────────────────

async function handleDocument(chatId, userId, document) {
  const { file_id, file_name, mime_type } = document;

  // Only support PDF and text files
  const supportedTypes = ['application/pdf', 'text/plain', 'text/markdown'];
  const isPdf = mime_type === 'application/pdf' || file_name?.endsWith('.pdf');
  const isText = supportedTypes.includes(mime_type) || file_name?.match(/\.(txt|md|csv|json|xml|html)$/i);

  if (!isPdf && !isText) {
    await sendMessagePlain(chatId, '⚠️ Unsupported file type. I can process PDF, TXT, MD, CSV, JSON, XML, and HTML files.');
    return;
  }

  const stopTyping = startTypingIndicator(chatId);

  try {
    // Download the file from Telegram
    const fileInfo = await getFile(file_id);
    const fileBuffer = await downloadFile(fileInfo.file_path);

    let extractedText = '';

    if (isPdf) {
      // Dynamic import of pdf-parse
      const pdfParse = (await import('pdf-parse')).default;
      const pdfData = await pdfParse(fileBuffer);
      extractedText = pdfData.text;
    } else {
      extractedText = fileBuffer.toString('utf-8');
    }

    if (!extractedText || extractedText.trim().length === 0) {
      await sendMessagePlain(chatId, '⚠️ Could not extract any text from the file. It may be empty or contain only images.');
      return;
    }

    // Store in database
    await saveFileContent(userId, file_name || 'uploaded_file', extractedText);

    const charCount = extractedText.length;
    const wordCount = extractedText.split(/\s+/).length;

    const mode = await getUserMode(userId);
    await sendMessagePlain(
      chatId,
      [
        `📄 *File uploaded successfully!*`,
        '',
        `📁 Name: ${file_name}`,
        `📊 Size: ${charCount.toLocaleString()} chars, ~${wordCount.toLocaleString()} words`,
        '',
        `You can now ask me questions about this file.`,
        `The file context will be included in my responses until you clear memory.`,
      ].join('\n'),
      { replyMarkup: buildModeKeyboard(mode) }
    );
  } catch (error) {
    console.error('[Controller] Document handling error:', error);
    await sendMessagePlain(chatId, '❌ ERROR TYPE: FILE PROCESSING\n❌ ERROR NAME: ' + error.message);
  } finally {
    stopTyping();
  }
}

// ─── Handle callback queries ─────────────────────────────────────────────────

async function handleCallbackQuery(callbackQuery) {
  const { id: queryId, data, message, from } = callbackQuery;
  const chatId = message.chat.id;
  const messageId = message.message_id;
  const userId = from.id;

  try {
    // ─── Mode Switch ───────────────────────────────────────────────────────
    if (data === 'mode_fast' || data === 'mode_thinker') {
      const newMode = data === 'mode_fast' ? 'fast' : 'thinker';
      await setUserMode(userId, newMode);

      const emoji = newMode === 'fast' ? '⚡' : '🧠';
      const label = newMode === 'fast' ? 'Fast' : 'Thinker';
      await answerCallbackQuery(queryId, `Switched to ${label} ${emoji}`);

      // Update the inline keyboard to reflect the new mode
      try {
        const currentText = message.text || '';
        const keyboard = buildModeKeyboard(newMode);

        // Check if the message has pagination
        const paginationState = await getPaginationState(chatId, messageId);
        if (paginationState) {
          const page = paginationState.pages[paginationState.current_page];
          const header = buildPageHeader(newMode, paginationState.current_page, paginationState.total_pages);
          const paginatedKeyboard = buildPaginationKeyboard(
            paginationState.current_page,
            paginationState.total_pages,
            newMode
          );
          try {
            await editMessageText(chatId, messageId, escapeForTelegram(header + page), {
              replyMarkup: paginatedKeyboard,
            });
          } catch {
            await editMessageTextPlain(chatId, messageId, header + page, {
              replyMarkup: paginatedKeyboard,
            });
          }
        } else if (currentText) {
          // Just update the keyboard, not the text
          try {
            await editMessageText(chatId, messageId, escapeForTelegram(currentText), {
              replyMarkup: keyboard,
            });
          } catch {
            await editMessageTextPlain(chatId, messageId, currentText, {
              replyMarkup: keyboard,
            });
          }
        }
      } catch (editError) {
        // Non-critical: keyboard update failed, mode was still saved
        console.warn('[Controller] Keyboard update failed:', editError.message);
      }
      return;
    }

    // ─── Clear Memory ────────────────────────────────────────────────────────
    if (data === 'clear_memory') {
      await clearHistory(userId);
      await answerCallbackQuery(queryId, '🗑️ Memory cleared!');

      const mode = await getUserMode(userId);
      try {
        await editMessageText(chatId, messageId, escapeForTelegram('🗑️ Memory cleared!\n\nYour conversation history has been deleted. Start fresh!'), {
          replyMarkup: buildModeKeyboard(mode),
        });
      } catch {
        await editMessageTextPlain(chatId, messageId, '🗑️ Memory cleared!\n\nYour conversation history has been deleted. Start fresh!', {
          replyMarkup: buildModeKeyboard(mode),
        });
      }
      return;
    }

    // ─── Regenerate Response ─────────────────────────────────────────────────
    if (data === 'regenerate') {
      await answerCallbackQuery(queryId, '🔄 Regenerating...');

      const lastUserMsg = await getLastUserMessage(userId);
      if (!lastUserMsg) {
        await answerCallbackQuery(queryId, '❌ No previous message to regenerate');
        return;
      }

      // Delete the last assistant message from memory
      await deleteLastAssistantMessage(userId);

      // Start typing
      const stopTyping = startTypingIndicator(chatId);

      try {
        const mode = await getUserMode(userId);
        const history = await loadHistory(userId);
        const fileContext = await getFileContent(userId);

        // Remove the last user message from history since we'll add it as the current message
        const filteredHistory = history.filter(
          (msg, idx) => !(idx === history.length - 1 && msg.role === 'user')
        );

        const aiResponse = await getAIResponse(mode, filteredHistory, lastUserMsg, fileContext);
        await saveMessage(userId, 'assistant', aiResponse);

        // Send as new message (since we can't fully replace paginated content via edit)
        await sendPaginatedResponse(chatId, userId, mode, aiResponse);
      } catch (error) {
        console.error('[Controller] Regeneration error:', error);
        const errorMsg = formatError(error);
        await sendMessagePlain(chatId, errorMsg);
      } finally {
        stopTyping();
      }
      return;
    }

    // ─── Pagination ──────────────────────────────────────────────────────────
    if (data.startsWith('page_prev_') || data.startsWith('page_next_')) {
      const paginationState = await getPaginationState(chatId, messageId);
      if (!paginationState) {
        await answerCallbackQuery(queryId, '⚠️ Pagination expired');
        return;
      }

      const currentPage = paginationState.current_page;
      let newPage;

      if (data.startsWith('page_prev_')) {
        newPage = Math.max(0, currentPage - 1);
      } else {
        newPage = Math.min(paginationState.total_pages - 1, currentPage + 1);
      }

      if (newPage === currentPage) {
        await answerCallbackQuery(queryId);
        return;
      }

      // Update page in DB
      await updatePaginationPage(chatId, messageId, newPage);

      // Get mode for header
      const mode = await getUserMode(userId);
      const header = buildPageHeader(mode, newPage, paginationState.total_pages);
      const pageContent = header + paginationState.pages[newPage];
      const keyboard = buildPaginationKeyboard(newPage, paginationState.total_pages, mode);

      try {
        await editMessageText(chatId, messageId, escapeForTelegram(pageContent), {
          replyMarkup: keyboard,
        });
      } catch {
        await editMessageTextPlain(chatId, messageId, pageContent, {
          replyMarkup: keyboard,
        });
      }

      await answerCallbackQuery(queryId, `Page ${newPage + 1}/${paginationState.total_pages}`);
      return;
    }

    // ─── No-op (page counter button) ─────────────────────────────────────────
    if (data === 'page_noop') {
      await answerCallbackQuery(queryId);
      return;
    }

    // Unknown callback
    await answerCallbackQuery(queryId, '❓ Unknown action');
  } catch (error) {
    console.error('[Controller] Callback query error:', error);
    await answerCallbackQuery(queryId, '❌ Error processing action').catch(() => { });
  }
}

// ─── Main Update Handler ─────────────────────────────────────────────────────

/**
 * Process a single Telegram update. This is the main entry point
 * called by the webhook route.
 */
export async function handleUpdate(update) {
  // Duplicate check
  if (isDuplicate(update.update_id)) {
    return;
  }

  try {
    // Handle callback queries (inline button presses)
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
      return;
    }

    // Handle messages
    if (update.message) {
      const { chat, from, text, document } = update.message;
      const chatId = chat.id;
      const userId = from.id;

      // Handle document uploads
      if (document) {
        await handleDocument(chatId, userId, document);
        return;
      }

      // Handle text messages
      if (text) {
        await handleTextMessage(chatId, userId, text);
        return;
      }
    }
  } catch (error) {
    console.error('[Controller] Unhandled error in update processing:', error);
    // Never crash the server — swallow the error after logging
  }
}
