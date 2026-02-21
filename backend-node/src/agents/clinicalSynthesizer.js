/**
 * Clinical Synthesizer Agent: Generates fertility health responses.
 * Model: llama-3.3-70b-versatile (high quality)
 * Streaming mode: Plain markdown text (no JSON mode - 70B struggles with streaming JSON)
 * Non-streaming mode: JSON structured output
 */
import Groq from 'groq-sdk';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MODEL = 'llama-3.3-70b-versatile';
const FAST_MODEL = 'llama-3.1-8b-instant';
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
export function formatCitation(rawCitation) {
  if (!rawCitation) return '';
  return rawCitation
    .replace(/_compress\.pdf$/i, '')
    .replace(/\.pdf$/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const LANG_NAMES = {
  en: 'English', es: 'Spanish', ja: 'Japanese', hi: 'Hindi',
  ta: 'Tamil', te: 'Telugu', ml: 'Malayalam', fr: 'French', pt: 'Portuguese',
};

/**
 * Follow-Up Agent: Generates deeply contextual clinical follow-up questions.
 * Uses llama-3.1-8b-instant for speed.
 * @param {string} userQuery - The original user question
 * @param {Array} retrievedContext - The retrieved KB context chunks
 * @param {string} language - Response language
 * @returns {Promise<string[]>}
 */
export async function generateFollowUpQuestions(userQuery, retrievedContext = [], language = 'en') {
  if (!groq) return [];

  const langName = LANG_NAMES[language] || 'English';

  // Build context summary from retrieved chunks
  const contextSummary = retrievedContext
    .slice(0, 3)
    .map((c) => c.text?.slice(0, 300) || '')
    .filter(Boolean)
    .join('\n---\n');

  const systemPrompt = `You are an expert reproductive endocrinology assistant. Based on the provided user query and the retrieved medical context, generate exactly 3 highly specific, deeply contextual follow-up questions the patient should ask next.

RULES:
- All questions MUST relate strictly to fertility, IVF, reproductive health, or specific treatments mentioned in the context
- Do NOT ask generic questions (e.g., "What is next?" or "Can you tell me more?")
- Ask clinical or actionable questions that demonstrate deep understanding
- CRITICAL: You MUST write the 3 follow-up questions entirely in ${langName}. Do not use English unless the requested language is English.
- Output ONLY a strict JSON object: { "questions": ["Question 1", "Question 2", "Question 3"] }
- Do not include any other text.`;

  const userContent = `USER QUERY: ${userQuery}

RETRIEVED MEDICAL CONTEXT:
${contextSummary || 'No specific context available.'}`;

  try {
    const response = await groq.chat.completions.create({
      model: FAST_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.7,
      max_tokens: 1024,
      response_format: { type: 'json_object' },
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) return [];

    const parsed = JSON.parse(content);
    const questions = parsed.questions || parsed.followUpQuestions || [];
    return Array.isArray(questions) ? questions.slice(0, 3) : [];
  } catch (err) {
    console.warn('[FollowUpAgent] Generation failed:', err.message);
    return [];
  }
}

/**
 * Synthesize a clinical response from retrieved context (STREAMING mode).
 * Returns an async generator that yields text chunks.
 * @param {string} query - User's question
 * @param {Array} chunks - Retrieved and reranked chunks
 * @param {Array} chatHistory - Previous conversation turns
 * @param {string} language - Response language
 * @returns {AsyncGenerator<string>}
 */
export async function* synthesizeResponseStream(query, chunks, chatHistory = [], language = 'en') {
  if (!groq) {
    yield "I'm sorry, I couldn't generate a response at this time. Please try again.";
    return;
  }

  const langName = LANG_NAMES[language] || 'English';

  // Build context from chunks (without asking for JSON output)
  const contextParts = chunks.map((c, i) =>
    `[Source ${i + 1}: ${formatCitation(c.doc_id)}]\n${c.text}`
  ).join('\n\n');

  const systemPrompt = `You are Izana, an empathetic fertility health assistant. Generate helpful, accurate responses about reproductive health.

CRITICAL RULES:
1. Write in flowing clinical prose (avoid bullet points unless specifically requested)
2. NEVER use the word "cancer" - use "cell abnormalities" or "abnormal cell growth" instead
3. Naturally reference sources when citing information (e.g., "According to medical research..." or "Studies show...")
4. Respond entirely in ${langName}
5. Be warm, supportive, and medically accurate
6. Keep your response focused and informative

CONTEXT FROM KNOWLEDGE BASE:
${contextParts || 'No specific context available.'}`;

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
    const stream = await groq.chat.completions.create({
      model: MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 1500,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        yield delta;
      }
    }
  } catch (err) {
    console.error('[ClinicalSynthesizer] Stream failed:', err.message);
    yield "I'm sorry, I encountered an error. Please try again.";
  }
}

/**
 * Synthesize a clinical response from retrieved context (NON-STREAMING mode).
 * @param {string} query - User's question
 * @param {Array} chunks - Retrieved and reranked chunks
 * @param {Array} chatHistory - Previous conversation turns
 * @param {string} language - Response language (e.g., 'en', 'es')
 * @param {boolean} streaming - If true, returns async generator (use synthesizeResponseStream instead)
 * @returns {Promise<{ response: string, citations: string[], followUpQuestions: string[] }>}
 */
export async function synthesizeResponse(query, chunks, chatHistory = [], language = 'en', streaming = false) {
  // For streaming, use the dedicated generator function
  if (streaming) {
    return synthesizeResponseStream(query, chunks, chatHistory, language);
  }

  const fallback = {
    response: "I'm sorry, I couldn't generate a response at this time. Please try again.",
    citations: [],
    followUpQuestions: [],
  };

  if (!groq) {
    return fallback;
  }

  const langName = LANG_NAMES[language] || 'English';

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
5. Respond entirely in ${langName}
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
