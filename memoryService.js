// ─── Memory Service ──────────────────────────────────────────────────────────
// Handles all Supabase operations: user modes, conversation history,
// pagination state, file storage, and smart memory trimming.

import supabase from './supabaseClient.js';
import config from './config.js';

// ─── User Mode ───────────────────────────────────────────────────────────────

/**
 * Get the user's selected AI mode. Defaults to 'fast' if no record exists.
 */
export async function getUserMode(userId) {
  const { data, error } = await supabase
    .from('user_modes')
    .select('selected_mode')
    .eq('user_id', userId)
    .single();

  if (error || !data) return 'fast';
  return data.selected_mode;
}

/**
 * Set the user's selected AI mode. Upserts to handle first-time users.
 */
export async function setUserMode(userId, mode) {
  const { error } = await supabase
    .from('user_modes')
    .upsert(
      { user_id: userId, selected_mode: mode, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );

  if (error) {
    console.error('[MemoryService] Failed to set user mode:', error);
    throw error;
  }
}

// ─── Conversation History ────────────────────────────────────────────────────

/**
 * Load the last N messages for a user, ordered chronologically (oldest first).
 */
export async function loadHistory(userId, limit = config.memory.maxMessages) {
  const { data, error } = await supabase
    .from('messages')
    .select('role, content')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[MemoryService] Failed to load history:', error);
    return [];
  }

  // Reverse so oldest messages come first (chronological order for the AI)
  return (data || []).reverse();
}

/**
 * Save a single message (user or assistant).
 */
export async function saveMessage(userId, role, content) {
  const { error } = await supabase
    .from('messages')
    .insert({ user_id: userId, role, content });

  if (error) {
    console.error('[MemoryService] Failed to save message:', error);
  }
}

/**
 * Clear all conversation history for a user.
 */
export async function clearHistory(userId) {
  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('user_id', userId);

  if (error) {
    console.error('[MemoryService] Failed to clear history:', error);
    throw error;
  }
}

/**
 * Smart memory trimming — delete oldest messages when count exceeds threshold.
 * This prevents unbounded storage growth per user.
 */
export async function trimHistory(userId) {
  const { count, error: countError } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (countError || count === null) return;

  if (count > config.memory.trimThreshold) {
    const deleteCount = count - config.memory.maxMessages;

    // Get IDs of oldest messages to delete
    const { data: oldest, error: fetchError } = await supabase
      .from('messages')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(deleteCount);

    if (fetchError || !oldest || oldest.length === 0) return;

    const idsToDelete = oldest.map((row) => row.id);

    const { error: deleteError } = await supabase
      .from('messages')
      .delete()
      .in('id', idsToDelete);

    if (deleteError) {
      console.error('[MemoryService] Failed to trim history:', deleteError);
    } else {
      console.log(`[MemoryService] Trimmed ${idsToDelete.length} old messages for user ${userId}`);
    }
  }
}

// ─── Pagination State ────────────────────────────────────────────────────────

/**
 * Store paginated content for a sent message.
 */
export async function savePaginationState(chatId, messageId, userId, pages) {
  const { error } = await supabase
    .from('pagination_state')
    .upsert(
      {
        chat_id: chatId,
        message_id: messageId,
        user_id: userId,
        pages: JSON.stringify(pages),
        current_page: 0,
        total_pages: pages.length,
      },
      { onConflict: 'chat_id,message_id' }
    );

  if (error) {
    console.error('[MemoryService] Failed to save pagination state:', error);
  }
}

/**
 * Get paginated content and metadata for a message.
 */
export async function getPaginationState(chatId, messageId) {
  const { data, error } = await supabase
    .from('pagination_state')
    .select('*')
    .eq('chat_id', chatId)
    .eq('message_id', messageId)
    .single();

  if (error || !data) return null;

  // Parse pages back from JSON string
  if (typeof data.pages === 'string') {
    data.pages = JSON.parse(data.pages);
  }

  return data;
}

/**
 * Update the current page index for a paginated message.
 */
export async function updatePaginationPage(chatId, messageId, newPage) {
  const { error } = await supabase
    .from('pagination_state')
    .update({ current_page: newPage })
    .eq('chat_id', chatId)
    .eq('message_id', messageId);

  if (error) {
    console.error('[MemoryService] Failed to update pagination page:', error);
  }
}

// ─── File Storage (PDF Q&A) ─────────────────────────────────────────────────

/**
 * Store extracted file content for a user.
 */
export async function saveFileContent(userId, fileName, content) {
  // Delete any previous file for this user (keep it simple: one file at a time)
  await supabase.from('user_files').delete().eq('user_id', userId);

  const { error } = await supabase
    .from('user_files')
    .insert({ user_id: userId, file_name: fileName, content });

  if (error) {
    console.error('[MemoryService] Failed to save file content:', error);
    throw error;
  }
}

/**
 * Get the most recent uploaded file content for a user.
 */
export async function getFileContent(userId) {
  const { data, error } = await supabase
    .from('user_files')
    .select('file_name, content')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data;
}

// ─── Last Assistant Message (for regeneration) ───────────────────────────────

/**
 * Get the last user message for regeneration purposes.
 */
export async function getLastUserMessage(userId) {
  const { data, error } = await supabase
    .from('messages')
    .select('content')
    .eq('user_id', userId)
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data.content;
}

/**
 * Delete the last assistant message (used before regeneration).
 */
export async function deleteLastAssistantMessage(userId) {
  const { data, error: fetchError } = await supabase
    .from('messages')
    .select('id')
    .eq('user_id', userId)
    .eq('role', 'assistant')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (fetchError || !data) return;

  await supabase.from('messages').delete().eq('id', data.id);
}
