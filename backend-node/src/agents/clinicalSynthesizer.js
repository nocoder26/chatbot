/**
 * Clinical Synthesizer Agent: Generates fertility health responses.
 * Model: llama-3.3-70b-versatile (high quality, JSON mode)
 * Output: { response, citations, followUpQuestions }
 */
import Groq from 'groq-sdk';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MODEL = 'llama-3.3-70b-versatile';
const TIMEOUT_MS = 25000;

let groq = null;
if (GROQ_API_KEY) {
  groq = new Groq({ apiKey: GROQ_API_KEY });
}

/**
 * Check if synthesizer is available.
 */
export function isSynthesizerAvailable() {
  return !!groq;
}

/**
 * Format citation from raw document ID.
 */
function formatCitation(rawCitation) {
  return rawCitation
    .replace(/_compress\.pdf$/i, '')
    .replace(/\.pdf$/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Synthesize a clinical response from retrieved context.
 * @param {string} query - User's question
 * @param {Array} chunks - Retrieved and reranked chunks
 * @param {Array} chatHistory - Previous conversation turns
 * @param {string} language - Response language (e.g., 'en', 'es')
 * @returns {Promise<{ response: string, citations: string[], followUpQuestions: string[] }>}
 */
export async function synthesizeResponse(query, chunks, chatHistory = [], language = 'en') {
  const fallback = {
    response: "I'm sorry, I couldn't generate a response at this time. Please try again.",
    citations: [],
    followUpQuestions: [],
  };

  if (!groq) {
    return fallback;
  }

  // Build context from chunks
  const contextParts = chunks.map((c, i) =>
    `[Source ${i + 1}: ${formatCitation(c.doc_id)}]\n${c.text}`
  ).join('\n\n');

  const systemPrompt = `You are Izana, an empathetic fertility health assistant. Generate helpful, accurate responses about reproductive health.

CRITICAL RULES:
1. Write in flowing clinical prose (avoid bullet points unless specifically requested)
2. NEVER use the word "cancer" - use "cell abnormalities" or "abnormal cell growth" instead
3. Cite sources using [Source N] format when referencing information
4. Generate exactly 2 contextual follow-up questions the user might ask
5. Respond entirely in ${language === 'en' ? 'English' : language}
6. Be warm, supportive, and medically accurate

CONTEXT FROM KNOWLEDGE BASE:
${contextParts || 'No specific context available.'}

Respond ONLY with valid JSON:
{
  "response": "Your detailed, flowing response here...",
  "citations": ["Source Name 1", "Source Name 2"],
  "followUpQuestions": ["Follow-up question 1?", "Follow-up question 2?"]
}`;

  // Build messages with chat history
  const messages = [{ role: 'system', content: systemPrompt }];

  if (chatHistory?.length > 0) {
    chatHistory.slice(-4).forEach((msg) => {
      messages.push({
        role: msg.role === 'ai' ? 'assistant' : 'user',
        content: msg.content,
      });
    });
  }

  messages.push({ role: 'user', content: query });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await groq.chat.completions.create(
      {
        model: MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
      },
      { signal: controller.signal }
    );

    clearTimeout(timeout);

    const content = response.choices?.[0]?.message?.content;
    if (!content) return fallback;

    const parsed = JSON.parse(content);

    // Extract unique citations from chunks
    const usedCitations = [...new Set(chunks.map((c) => formatCitation(c.doc_id)))];

    return {
      response: parsed.response || fallback.response,
      citations: parsed.citations?.length > 0 ? parsed.citations : usedCitations.slice(0, 3),
      followUpQuestions: Array.isArray(parsed.followUpQuestions)
        ? parsed.followUpQuestions.slice(0, 2)
        : [],
    };
  } catch (err) {
    console.error('[ClinicalSynthesizer] Failed:', err.message);
    return fallback;
  }
}
