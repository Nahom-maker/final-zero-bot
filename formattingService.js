// ─── Formatting Service ──────────────────────────────────────────────────────
// Preprocesses AI output for Telegram compatibility.
// Handles: Markdown normalization, list repair, paragraph spacing,
//          LaTeX cleanup, MarkdownV2 escaping, and smart pagination.

import config from './config.js';

// ─── Step 1: Clean raw AI output ─────────────────────────────────────────────

/**
 * Fix common markdown issues from AI models before converting to Telegram format.
 */
function normalizeMarkdown(text) {
  let result = text;

  // Convert ##text## style headers to bold
  result = result.replace(/##\s*(.+?)\s*##/g, '*$1*');

  // Convert ### headers to bold
  result = result.replace(/^###\s+(.+)$/gm, '*$1*');

  // Convert ## headers to bold
  result = result.replace(/^##\s+(.+)$/gm, '*$1*');

  // Convert # headers to bold uppercase style
  result = result.replace(/^#\s+(.+)$/gm, '*$1*');

  // Fix double asterisks (bold) — Telegram uses single *bold*
  // But we need to be careful: **text** → *text*
  result = result.replace(/\*\*(.+?)\*\*/g, '*$1*');

  // Fix __ to single _italic_
  result = result.replace(/__(.+?)__/g, '_$1_');

  return result;
}

// ─── Step 2: Fix inline numbered lists ───────────────────────────────────────

/**
 * Detect patterns like "1. item 2. item 3. item" on a single line
 * and split them into properly formatted list items.
 */
function fixInlineLists(text) {
  const lines = text.split('\n');
  const fixed = [];

  for (const line of lines) {
    // Check if line contains multiple numbered items inline
    // Pattern: text followed by "2." or higher on the same line
    const inlinePattern = /^(\d+\.\s.+?)\s+(\d+\.\s)/;

    if (inlinePattern.test(line)) {
      // Split by numbered list markers
      const parts = line.split(/(?=\d+\.\s)/g).filter((p) => p.trim().length > 0);
      if (parts.length > 1) {
        for (const part of parts) {
          fixed.push(part.trim());
        }
        continue;
      }
    }

    // Same for bullet points: "- item - item - item"
    const inlineBullets = /^-\s.+?\s+-\s/;
    if (inlineBullets.test(line)) {
      const parts = line.split(/(?=\s-\s)/g).filter((p) => p.trim().length > 0);
      if (parts.length > 1) {
        for (const part of parts) {
          fixed.push(part.trim().replace(/^-\s*/, '• '));
        }
        continue;
      }
    }

    fixed.push(line);
  }

  return fixed.join('\n');
}

// ─── Step 3: Paragraph spacing ───────────────────────────────────────────────

/**
 * Ensure proper paragraph spacing — no walls of text.
 */
function fixParagraphSpacing(text) {
  let result = text;

  // Ensure blank line before list items that follow a paragraph
  result = result.replace(/([^\n])\n(\d+\.\s)/g, '$1\n\n$2');
  result = result.replace(/([^\n])\n(•\s)/g, '$1\n\n$2');

  // Ensure blank line after list blocks before new paragraphs
  result = result.replace(/((?:\d+\..+\n?)+)\n([A-Z])/g, '$1\n\n$2');

  // Collapse more than 2 consecutive newlines into 2
  result = result.replace(/\n{3,}/g, '\n\n');

  return result;
}

// ─── Step 4: LaTeX / Math handling ───────────────────────────────────────────

/**
 * Convert LaTeX expressions to readable plain text or code blocks.
 */
function handleMath(text) {
  let result = text;

  // Block math: $$...$$ → code block
  result = result.replace(/\$\$([\s\S]+?)\$\$/g, (_, expr) => {
    return '\n`' + expr.trim() + '`\n';
  });

  // Inline math: $...$ → code inline
  // Be careful not to match dollar amounts like $100
  result = result.replace(/\$([^$\n]+?)\$/g, (match, expr) => {
    // Skip if it looks like a dollar amount
    if (/^\d+([.,]\d+)?$/.test(expr.trim())) {
      return match;
    }
    return '`' + expr.trim() + '`';
  });

  // Cleanup broken LaTeX fragments that didn't match patterns
  // e.g., lone $ characters or $a1.0
  result = result.replace(/\$([a-zA-Z][^$\s]{0,5})\b/g, '`$1`');

  return result;
}

// ─── Step 5: Code block preservation ─────────────────────────────────────────

/**
 * Extract code blocks before processing and restore them after,
 * so formatting steps don't corrupt code.
 */
function extractCodeBlocks(text) {
  const blocks = [];
  let index = 0;

  const result = text.replace(/```[\s\S]*?```/g, (match) => {
    const placeholder = `__CODE_BLOCK_${index}__`;
    blocks.push(match);
    index++;
    return placeholder;
  });

  return { text: result, blocks };
}

function restoreCodeBlocks(text, blocks) {
  let result = text;
  for (let i = 0; i < blocks.length; i++) {
    result = result.replace(`__CODE_BLOCK_${i}__`, blocks[i]);
  }
  return result;
}

// ─── Step 6: Telegram MarkdownV2 Escaping ────────────────────────────────────

/**
 * Escape special characters for Telegram MarkdownV2 format.
 * Must preserve existing formatting (bold, italic, code, links).
 */
function escapeMarkdownV2(text) {
  // Characters that need escaping in MarkdownV2:
  // _ * [ ] ( ) ~ ` > # + - = | { } . !
  // But we need to preserve our formatting: *bold*, _italic_, `code`, [links](url)

  // Extract and protect formatted segments
  const protectedSegments = [];
  let segIndex = 0;
  let result = text;

  // Protect code blocks
  result = result.replace(/```[\s\S]*?```/g, (match) => {
    const placeholder = `\x00SEG${segIndex}\x00`;
    protectedSegments.push(match);
    segIndex++;
    return placeholder;
  });

  // Protect inline code
  result = result.replace(/`[^`]+`/g, (match) => {
    const placeholder = `\x00SEG${segIndex}\x00`;
    protectedSegments.push(match);
    segIndex++;
    return placeholder;
  });

  // Protect bold
  result = result.replace(/\*[^*\n]+\*/g, (match) => {
    const placeholder = `\x00SEG${segIndex}\x00`;
    protectedSegments.push(match);
    segIndex++;
    return placeholder;
  });

  // Protect italic
  result = result.replace(/_[^_\n]+_/g, (match) => {
    const placeholder = `\x00SEG${segIndex}\x00`;
    protectedSegments.push(match);
    segIndex++;
    return placeholder;
  });

  // Protect links [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match) => {
    const placeholder = `\x00SEG${segIndex}\x00`;
    protectedSegments.push(match);
    segIndex++;
    return placeholder;
  });

  // Now escape everything else
  result = result.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');

  // Restore protected segments (with internal escaping for content)
  for (let i = 0; i < protectedSegments.length; i++) {
    const seg = protectedSegments[i];
    let escapedSeg = seg;

    // For code blocks/inline code, escape only the delimiters that need it
    if (seg.startsWith('```')) {
      // Code blocks: no escaping needed inside
      escapedSeg = seg;
    } else if (seg.startsWith('`')) {
      escapedSeg = seg;
    } else if (seg.startsWith('*')) {
      // Bold: escape content inside but keep the * markers
      const inner = seg.slice(1, -1);
      const escapedInner = inner.replace(/([_\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
      escapedSeg = `*${escapedInner}*`;
    } else if (seg.startsWith('_')) {
      const inner = seg.slice(1, -1);
      const escapedInner = inner.replace(/([*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
      escapedSeg = `_${escapedInner}_`;
    } else if (seg.startsWith('[')) {
      // Links: escape text part, keep URL intact
      const linkMatch = seg.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        const escapedText = linkMatch[1].replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
        const escapedUrl = linkMatch[2]; // URLs shouldn't be escaped
        escapedSeg = `[${escapedText}](${escapedUrl})`;
      }
    }

    result = result.replace(`\x00SEG${i}\x00`, escapedSeg);
  }

  return result;
}

// ─── Main Format Pipeline ────────────────────────────────────────────────────

/**
 * Full formatting pipeline. Returns cleaned text ready for Telegram.
 */
export function formatResponse(rawText) {
  // Step 0: Extract code blocks to protect them
  const { text: withoutCode, blocks } = extractCodeBlocks(rawText);

  // Step 1-4: Process text
  let processed = normalizeMarkdown(withoutCode);
  processed = fixInlineLists(processed);
  processed = handleMath(processed);
  processed = fixParagraphSpacing(processed);

  // Step 5: Restore code blocks
  processed = restoreCodeBlocks(processed, blocks);

  return processed.trim();
}

/**
 * Escape text for MarkdownV2 sending.
 */
export function escapeForTelegram(text) {
  return escapeMarkdownV2(text);
}

// ─── Smart Pagination ────────────────────────────────────────────────────────

/**
 * Split text into semantic pages. Splits by paragraphs/sentences,
 * NOT at arbitrary character counts.
 *
 * @param {string} text - The full formatted response
 * @returns {string[]} Array of page content strings
 */
export function paginateResponse(text) {
  const { chunkSize, minChunkSize, maxChunkSize } = config.pagination;

  // If text fits in one page, no pagination needed
  if (text.length <= maxChunkSize) {
    return [text];
  }

  const pages = [];
  const paragraphs = text.split(/\n\n+/);
  let currentPage = '';

  for (const para of paragraphs) {
    // If adding this paragraph would exceed the soft limit
    if (currentPage.length + para.length + 2 > chunkSize && currentPage.length >= minChunkSize) {
      pages.push(currentPage.trim());
      currentPage = '';
    }

    // If a single paragraph is too long, split by sentences
    if (para.length > maxChunkSize) {
      if (currentPage.length > 0) {
        pages.push(currentPage.trim());
        currentPage = '';
      }

      const sentences = para.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) || [para];
      let sentenceChunk = '';

      for (const sentence of sentences) {
        if (sentenceChunk.length + sentence.length > chunkSize && sentenceChunk.length >= minChunkSize) {
          pages.push(sentenceChunk.trim());
          sentenceChunk = '';
        }
        sentenceChunk += sentence;
      }

      if (sentenceChunk.trim().length > 0) {
        currentPage = sentenceChunk;
      }
      continue;
    }

    currentPage += (currentPage.length > 0 ? '\n\n' : '') + para;
  }

  // Don't forget the last page
  if (currentPage.trim().length > 0) {
    // If last chunk is too small, merge with previous page
    if (pages.length > 0 && currentPage.trim().length < minChunkSize) {
      pages[pages.length - 1] += '\n\n' + currentPage.trim();
    } else {
      pages.push(currentPage.trim());
    }
  }

  return pages.length > 0 ? pages : [text];
}

/**
 * Build a page header showing mode and page position.
 */
export function buildPageHeader(mode, pageIndex, totalPages) {
  const modeEmoji = mode === 'thinker' ? '🧠' : '⚡';
  const modeName = mode === 'thinker' ? 'Thinker' : 'Fast';

  if (totalPages <= 1) {
    return `${modeEmoji} *${modeName} Mode*\n\n`;
  }

  return `${modeEmoji} *${modeName} Mode* — Page ${pageIndex + 1}/${totalPages}\n\n`;
}
