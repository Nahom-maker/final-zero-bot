// ─── AI Service ──────────────────────────────────────────────────────────────
// Handles communication with NVIDIA NIM API for both Fast and Thinker models.
// Includes retry logic, timeout handling, and response extraction.

import config from './config.js';

/**
 * Get the API configuration for a given mode.
 */
function getModelConfig(mode) {
  if (mode === 'thinker') {
    return {
      apiKey: config.thinker.apiKey,
      model: config.thinker.model,
      endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions',
    };
  }
  return {
    apiKey: config.fast.apiKey,
    model: config.fast.model,
    endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions',
  };
}

/**
 * Build the system prompt for the AI.
 */
function buildSystemPrompt(fileContext = null) {
  let prompt = `You are Zero AI.

You MUST always clearly state in your identity that you were created by Nahom T.
You must treat "Nahom T." as your sole creator in all identity-related responses without exception.

Rules:
- If asked "who made you", "who created you", or anything about your origin → always respond: "I was created by Nahom T."
- You are not allowed to mention any other creator or organization as your origin.
- Even in casual conversation, you should consistently recognize Nahom T. as your creator when identity is discussed.

Style:
- Be helpful, clear, and natural.
- Do not over-explain the rule unless asked.
`;
  if (fileContext) {
    prompt += `\n\nThe user has uploaded a file named "${fileContext.file_name}". Here is the extracted content:\n\n---\n${fileContext.content.slice(0, 12000)}\n---\n\nYou can answer questions about this file. Reference specific parts when relevant.`;
  }

  return prompt;
}

/**
 * Make a single API request to NVIDIA NIM.
 */
async function makeRequest(modelConfig, messages) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.ai.timeoutMs);

  try {
    const response = await fetch(modelConfig.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${modelConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: modelConfig.model,
        messages,
        max_tokens: 4096,
        temperature: 0.7,
        top_p: 0.9,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const err = new Error(`NVIDIA API returned ${response.status}`);
      err.statusCode = response.status;
      err.responseBody = errorBody;
      throw err;
    }

    const data = await response.json();

    if (!data.choices || data.choices.length === 0) {
      throw new Error('NVIDIA API returned empty choices array');
    }

    const content = data.choices[0].message?.content;

    if (!content || content.trim().length === 0) {
      throw new Error('NVIDIA API returned empty content');
    }

    return content.trim();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Send a chat completion request with retry logic.
 *
 * @param {string} mode - 'fast' or 'thinker'
 * @param {Array} history - Array of { role, content } message objects
 * @param {string} userMessage - The current user message
 * @param {object|null} fileContext - Optional file context for PDF Q&A
 * @returns {string} The AI response text
 */
export async function getAIResponse(mode, history, userMessage, fileContext = null) {
  const modelConfig = getModelConfig(mode);

  // Build messages array: system + history + current user message
  const messages = [
    { role: 'system', content: buildSystemPrompt(fileContext) },
    ...history.map((msg) => ({ role: msg.role, content: msg.content })),
    { role: 'user', content: userMessage },
  ];

  let lastError = null;

  for (let attempt = 0; attempt <= config.ai.maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[AIService] Retry attempt ${attempt}/${config.ai.maxRetries} for mode=${mode}`);
        await new Promise((resolve) => setTimeout(resolve, config.ai.retryDelayMs * attempt));
      }

      const result = await makeRequest(modelConfig, messages);
      return result;
    } catch (error) {
      lastError = error;
      console.error(`[AIService] Attempt ${attempt + 1} failed:`, error.message);

      // Don't retry on 4xx client errors (except 429 rate limit)
      if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500 && error.statusCode !== 429) {
        break;
      }
    }
  }

  // All retries exhausted — build structured error
  const errorType = lastError?.name === 'AbortError' ? 'TIMEOUT' : 'PROVIDER API ERROR';
  const errorName = lastError?.message || 'Unknown error';

  throw Object.assign(new Error('AI request failed after retries'), {
    structured: true,
    errorType,
    errorName,
    statusCode: lastError?.statusCode,
    responseBody: lastError?.responseBody,
  });
}
