import OpenAI from 'openai';

const COHERE_API_KEY = process.env.COHERE_API_KEY;
const COHERE_CHAT_URL = 'https://api.cohere.com/v2/chat';
const COHERE_MODEL = process.env.COHERE_CHAT_MODEL || 'command-r-plus-08-2024';
const DEFAULT_MAX_TOKENS = parseInt(process.env.LLM_MAX_TOKENS || '1024', 10);
// PHASE 7: Reduced default timeout from 50s to 30s for faster failure feedback
const CHAT_TIMEOUT_MS = parseInt(process.env.LLM_CHAT_TIMEOUT_MS || '30000', 10);

const PROVIDER = (process.env.LLM_PROVIDER || 'groq').toLowerCase();
const MODEL = process.env.LLM_MODEL || 'llama-3.3-70b-versatile';
// Phase 8: Model routing - use versatile model for complex tasks
const VERSATILE_MODEL = 'llama-3.3-70b-versatile';
const FAST_MODEL = 'llama-3.1-8b-instant';

const BASE_URLS = {
  groq: 'https://api.groq.com/openai/v1',
  ollama: 'http://localhost:11434/v1',
};

const baseURL = process.env.LLM_BASE_URL || BASE_URLS[PROVIDER] || BASE_URLS.groq;
const apiKey = process.env.LLM_API_KEY || process.env.GROQ_API_KEY || 'unused';

let client = null;
if (!COHERE_API_KEY) {
  try {
    if (apiKey && apiKey !== 'unused') {
      client = new OpenAI({ baseURL, apiKey });
    }
  } catch (err) {
    console.error('[LLM] Failed to initialize:', err.message);
  }
}

function useCohere() {
  return !!COHERE_API_KEY;
}

function cohereMessages(systemPrompt, userMessage) {
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userMessage });
  return messages;
}

/**
 * Cohere chat (streaming). Returns full text.
 */
async function streamCohere(systemPrompt, userMessage, onChunk, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeout ?? CHAT_TIMEOUT_MS);
  try {
    const res = await fetch(COHERE_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${COHERE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        stream: true,
        model: COHERE_MODEL,
        messages: cohereMessages(systemPrompt, userMessage),
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Cohere chat error: ${res.status} ${errText?.slice(0, 200)}`);
    }
    let fullContent = '';
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const obj = JSON.parse(data);
            const text = obj.delta?.message?.content?.text ?? obj.message?.content?.[0]?.text ?? '';
            if (text) {
              fullContent += text;
              if (onChunk) onChunk(text);
            }
          } catch (_) {}
        }
      }
    }
    return fullContent;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Cohere chat (non-streaming). Returns full text.
 */
async function getCohereResponse(systemPrompt, userMessage, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeout ?? CHAT_TIMEOUT_MS);
  try {
    const res = await fetch(COHERE_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${COHERE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        stream: false,
        model: COHERE_MODEL,
        messages: cohereMessages(systemPrompt, userMessage),
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Cohere chat error: ${res.status} ${errText?.slice(0, 200)}`);
    }
    const data = await res.json();
    const content = data.message?.content;
    if (Array.isArray(content) && content[0]?.text) return content[0].text;
    if (typeof content === 'string') return content;
    return '';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Stream LLM response. Uses Cohere when COHERE_API_KEY is set, else OpenAI-compatible.
 */
export async function streamLLMResponse(systemPrompt, userMessage, onChunk, opts = {}) {
  if (useCohere()) {
    return streamCohere(systemPrompt, userMessage, onChunk, {
      ...opts,
      maxTokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    });
  }
  if (!client) throw new Error('LLM client not configured — set COHERE_API_KEY or LLM_API_KEY/GROQ_API_KEY');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeout ?? CHAT_TIMEOUT_MS);
  try {
    const stream = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      stream: true,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    }, { signal: controller.signal });

    let fullContent = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? '';
      if (delta) {
        fullContent += delta;
        if (onChunk) onChunk(delta);
      }
    }
    return fullContent;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Non-streaming LLM response. Uses Cohere when COHERE_API_KEY is set, else OpenAI-compatible.
 */
export async function getLLMResponse(systemPrompt, userMessage, opts = {}) {
  if (useCohere()) {
    return getCohereResponse(systemPrompt, userMessage, {
      ...opts,
      maxTokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    });
  }
  if (!client) throw new Error('LLM client not configured — set COHERE_API_KEY or LLM_API_KEY/GROQ_API_KEY');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeout ?? CHAT_TIMEOUT_MS);
  try {
    const params = {
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      stream: false,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    };

    if (opts.responseFormat === 'json') {
      params.response_format = { type: 'json_object' };
    }

    const completion = await client.chat.completions.create(params, { signal: controller.signal });
    return completion.choices[0]?.message?.content ?? '';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Format a raw citation (document filename) into a human-readable format.
 * "protocol_ivf_2024_compress.pdf" → "Protocol Ivf 2024"
 * @param {string} rawCitation
 * @returns {string}
 */
export function formatCitation(rawCitation) {
  if (!rawCitation || typeof rawCitation !== 'string') return '';
  return rawCitation
    .replace(/_compress\.pdf$/i, '')
    .replace(/\.pdf$/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Get LLM response with structured JSON output.
 * Uses JSON mode for reliable structured responses.
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @param {object} schema - Expected JSON schema (for documentation)
 * @param {object} opts
 */
export async function getStructuredResponse(systemPrompt, userMessage, schema = {}, opts = {}) {
  const enhancedPrompt = `${systemPrompt}

You MUST respond with valid JSON only. No markdown, no code fences, no explanation outside the JSON.
Expected schema: ${JSON.stringify(schema)}`;

  return getLLMResponse(enhancedPrompt, userMessage, {
    ...opts,
    responseFormat: 'json',
    temperature: opts.temperature ?? 0.2,
  });
}

export { VERSATILE_MODEL, FAST_MODEL };
