import { getLLMResponse } from './llm.js';
import { querySimilar } from './pinecone.js';

const RAG_MATCH_THRESHOLD = parseFloat(process.env.RAG_MATCH_THRESHOLD || '0.85', 10) || 0.85;
const VARIANTS_COUNT = 5;
const TOP_K_PER_QUERY = parseInt(process.env.RAG_TOP_K_PER_QUERY || '5', 10) || 5;

/**
 * Generate 5 paraphrased/rewritten versions of the user question to improve KB recall.
 * @param {string} question
 * @param {string} language
 * @returns {Promise<string[]>}
 */
export async function generateQuestionVariants(question, language = 'en') {
  const system = `You are a query rewriter for a medical knowledge base. Given a user question about fertility or reproductive health, output exactly ${VARIANTS_COUNT} different phrasings or paraphrases that a person might use to ask the same thing. Each variant should be a complete question. Output ONLY a JSON object with a single key "variants" whose value is an array of exactly ${VARIANTS_COUNT} strings. No other text. Example: {"variants":["question 1","question 2","question 3","question 4","question 5"]}`;
  const user = `User question: ${question}\n\nProvide exactly ${VARIANTS_COUNT} variant questions as JSON.`;
  try {
    const raw = await getLLMResponse(system, user, { temperature: 0.6, maxTokens: 512, responseFormat: 'json', timeout: 15000 });
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : '{"variants":[]}');
    const list = Array.isArray(parsed.variants) ? parsed.variants : [];
    const variants = [question, ...list.filter((v) => typeof v === 'string' && v.trim()).slice(0, VARIANTS_COUNT - 1)];
    return variants.slice(0, VARIANTS_COUNT);
  } catch (err) {
    console.error('[RAG] Generate variants failed:', err.message);
    return [question];
  }
}

/**
 * Search KB for each variant, merge and dedupe by id, then rank by LLM and compute match score.
 * @param {string} originalQuestion
 * @param {string[]} variantQuestions
 * @param {number} topKPerQuery
 * @returns {Promise<{ context: string, citations: string[], matchScore: number, document: string, allMatches: Array }>}
 */
export async function searchAndRank(originalQuestion, variantQuestions, topKPerQuery = TOP_K_PER_QUERY) {
  const seen = new Map();
  const allMatches = [];

  for (const q of variantQuestions) {
    try {
      const results = await querySimilar(q.trim(), topKPerQuery, {}, 'knowledgeBase');
      for (const r of results) {
        const id = r.id || r.metadata?.id || `${r.metadata?.source || ''}-${(r.metadata?.text || r.metadata?.content || '').slice(0, 80)}`;
        if (seen.has(id)) continue;
        seen.set(id, true);
        allMatches.push({
          id,
          score: r.score ?? 0,
          text: r.metadata?.text || r.metadata?.content || '',
          source: r.metadata?.source || r.metadata?.document || '',
        });
      }
    } catch (e) {
      console.error('[RAG] Query variant failed:', e.message);
    }
  }

  if (allMatches.length === 0) {
    return { context: '', citations: [], matchScore: 0, document: '', allMatches: [] };
  }

  // Sort by score desc and take top 10 for ranking
  const sorted = [...allMatches].sort((a, b) => b.score - a.score).slice(0, 10);
  const passages = sorted.map((m, i) => `[${i}] ${m.text.slice(0, 600)}`).join('\n\n');

  const rankSystem = `You are a relevance judge for a reproductive health knowledge base. Given the user's question and numbered passages, determine how well the passages answer the question. Respond with JSON only: {"bestIndices": [0,1,...], "matchScore": 0.0 to 1.0}.
- matchScore 1.0: passage(s) fully and accurately answer the question with verified information.
- matchScore >= 0.85: passage(s) contain sufficient verified information to answer the question; use this only when the match is strong.
- matchScore < 0.85: passages are only partially relevant or lack sufficient detail to fully answer the question.
- matchScore 0.0: none are relevant.
bestIndices: list of passage numbers (0-based) that best match the query. Be strict: only assign matchScore >= 0.85 when the passages clearly hold the answer.`;
  const rankUser = `User question: ${originalQuestion}\n\nPassages:\n${passages}\n\nJSON with bestIndices and matchScore:`;

  let matchScore = sorted[0]?.score ?? 0;
  let bestIndices = [0];

  try {
    const rankRaw = await getLLMResponse(rankSystem, rankUser, { temperature: 0.2, maxTokens: 200, responseFormat: 'json', timeout: 10000 });
    const rankJsonMatch = rankRaw.match(/\{[\s\S]*\}/);
    const rankParsed = JSON.parse(rankJsonMatch ? rankJsonMatch[0] : '{}');
    if (Array.isArray(rankParsed.bestIndices) && rankParsed.bestIndices.length) {
      bestIndices = rankParsed.bestIndices.filter((i) => i >= 0 && i < sorted.length);
    }
    if (typeof rankParsed.matchScore === 'number' && rankParsed.matchScore >= 0 && rankParsed.matchScore <= 1) {
      matchScore = rankParsed.matchScore;
    }
  } catch (err) {
    console.error('[RAG] Rank step failed, using vector score:', err.message);
  }

  const selected = bestIndices.length ? bestIndices.map((i) => sorted[i]).filter(Boolean) : [sorted[0]];
  const context = selected.map((m) => m.text).filter(Boolean).join('\n---\n');
  const citations = [...new Set(selected.map((m) => m.source).filter(Boolean))];
  const document = citations[0] || '';

  return { context, citations, matchScore, document, allMatches: sorted };
}

export { RAG_MATCH_THRESHOLD };
