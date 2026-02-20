/**
 * Query Expansion: Generate 2 alternative queries via llama-3.1-8b-instant (Groq).
 * Used to improve retrieval recall by querying the knowledge base with multiple phrasings.
 */
import OpenAI from 'openai';

const EXPANSION_MODEL = process.env.QUERY_EXPANSION_MODEL || 'llama-3.1-8b-instant';
const EXPANSION_TIMEOUT = parseInt(process.env.QUERY_EXPANSION_TIMEOUT_MS || '5000', 10);
const GROQ_API_KEY = process.env.GROQ_API_KEY;

let client = null;

if (GROQ_API_KEY) {
  try {
    client = new OpenAI({
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey: GROQ_API_KEY,
    });
  } catch (err) {
    console.error('[QueryExpansion] Failed to initialize client:', err.message);
  }
}

const EXPANSION_PROMPT = `You are a query expansion assistant for a reproductive health and fertility knowledge base.
Given a user query, generate exactly 2 alternative phrasings that might help retrieve relevant medical information.

Rules:
- Keep the medical meaning identical
- Use different terminology (synonyms, medical terms, lay terms)
- Make each alternative concise (1 sentence max)
- Output ONLY a JSON array of 2 strings, no other text

Example:
Input: "What is AMH?"
Output: ["What does Anti-Mullerian Hormone measure?", "AMH fertility test explanation"]

Input: "IVF success rates"
Output: ["In vitro fertilization success statistics", "What are the chances of IVF working?"]`;

/**
 * Expand a query into [original, alt1, alt2].
 * @param {string} query - Original user query
 * @returns {Promise<string[]>} Array of 3 queries (original + 2 alternatives)
 */
export async function expandQuery(query) {
  // Always return at least the original query
  const result = [query];

  if (!client || !query || query.trim().length < 5) {
    return result;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXPANSION_TIMEOUT);

  try {
    const completion = await client.chat.completions.create({
      model: EXPANSION_MODEL,
      messages: [
        { role: 'system', content: EXPANSION_PROMPT },
        { role: 'user', content: query },
      ],
      temperature: 0.7,
      max_tokens: 150,
      response_format: { type: 'json_object' },
    }, { signal: controller.signal });

    const content = completion.choices[0]?.message?.content || '';

    // Parse JSON response
    let alternatives = [];
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        alternatives = parsed;
      } else if (parsed.alternatives && Array.isArray(parsed.alternatives)) {
        alternatives = parsed.alternatives;
      } else if (parsed.queries && Array.isArray(parsed.queries)) {
        alternatives = parsed.queries;
      }
    } catch (_) {
      // Try to extract array from response
      const match = content.match(/\[([^\]]+)\]/);
      if (match) {
        try {
          alternatives = JSON.parse(`[${match[1]}]`);
        } catch (_) {}
      }
    }

    // Filter and add valid alternatives
    const validAlts = alternatives
      .filter((a) => typeof a === 'string' && a.trim().length > 3)
      .map((a) => a.trim())
      .slice(0, 2);

    result.push(...validAlts);
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn('[QueryExpansion] Timed out, using original query only');
    } else {
      console.error('[QueryExpansion] Error:', err.message);
    }
  } finally {
    clearTimeout(timer);
  }

  return result;
}

/**
 * Check if query expansion is available.
 */
export function isExpansionAvailable() {
  return !!client;
}

export { EXPANSION_MODEL, EXPANSION_TIMEOUT };
