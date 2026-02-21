/**
 * Triage Agent: Validates fertility queries and generates search queries.
 * Model: llama-3.1-8b-instant (fast, JSON mode)
 * Output: { isValidFertilityQuery, rejectionReason, searchQueries }
 */
import Groq from 'groq-sdk';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MODEL = 'llama-3.1-8b-instant';
const TIMEOUT_MS = 5000;

let groq = null;
if (GROQ_API_KEY) {
  groq = new Groq({ apiKey: GROQ_API_KEY });
}

/**
 * Check if triage agent is available.
 */
export function isTriageAvailable() {
  return !!groq;
}

/**
 * Triage the user query to validate and generate search queries.
 * @param {string} query - User's raw query
 * @returns {Promise<{ isValidFertilityQuery: boolean, rejectionReason: string|null, searchQueries: string[] }>}
 */
export async function triageQuery(query) {
  const fallback = {
    isValidFertilityQuery: true,
    rejectionReason: null,
    searchQueries: [query, query],
  };

  if (!groq || !query?.trim()) {
    return fallback;
  }

  const systemPrompt = `You are a fertility health query classifier. Analyze the user's query and determine:
1. Is this a valid fertility/reproductive health question? (IVF, hormones, pregnancy, menstrual health, sperm health, etc.)
2. If invalid, provide a brief, kind rejection reason.
3. Generate 2 semantic search queries to find relevant medical knowledge.

Respond ONLY with valid JSON:
{
  "isValidFertilityQuery": boolean,
  "rejectionReason": string or null,
  "searchQueries": ["query1", "query2"]
}

Invalid queries include: non-health topics, harmful requests, off-topic questions.
Valid queries include: ANY fertility, reproductive, hormonal, or pregnancy-related question.`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await groq.chat.completions.create(
      {
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query },
        ],
        temperature: 0.3,
        max_tokens: 300,
        response_format: { type: 'json_object' },
      },
      { signal: controller.signal }
    );

    clearTimeout(timeout);

    const content = response.choices?.[0]?.message?.content;
    if (!content) return fallback;

    const parsed = JSON.parse(content);
    return {
      isValidFertilityQuery: parsed.isValidFertilityQuery ?? true,
      rejectionReason: parsed.rejectionReason || null,
      searchQueries: Array.isArray(parsed.searchQueries) && parsed.searchQueries.length >= 2
        ? parsed.searchQueries.slice(0, 2)
        : [query, query],
    };
  } catch (err) {
    console.warn('[TriageAgent] Failed, using fallback:', err.message);
    return fallback;
  }
}
