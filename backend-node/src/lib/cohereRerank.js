/**
 * Cohere Rerank API integration.
 * Used to rerank retrieval candidates against the original query for improved relevance.
 */

const COHERE_API_KEY = process.env.COHERE_API_KEY;
const COHERE_RERANK_URL = 'https://api.cohere.com/v1/rerank';
const RERANK_MODEL = process.env.COHERE_RERANK_MODEL || 'rerank-english-v3.0';
const RERANK_THRESHOLD = parseFloat(process.env.COHERE_RERANK_THRESHOLD || '0.3');
const RERANK_TIMEOUT_MS = parseInt(process.env.COHERE_RERANK_TIMEOUT_MS || '5000', 10);

/**
 * Check if Cohere Rerank is available.
 */
export function isRerankAvailable() {
  return !!COHERE_API_KEY;
}

/**
 * Rerank documents using Cohere Rerank API.
 * @param {string} query - Original user query
 * @param {object[]} documents - Array of documents with 'text' field
 * @param {number} topN - Maximum number of results to return
 * @returns {Promise<{ index: number, relevance_score: number, document: object }[]>}
 */
export async function rerankDocuments(query, documents, topN = 6) {
  if (!COHERE_API_KEY || !query || !documents || documents.length === 0) {
    // Return documents unchanged with default scores
    return documents.map((doc, index) => ({
      index,
      relevance_score: doc.score || doc.fused_score || 0.5,
      document: doc,
    }));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RERANK_TIMEOUT_MS);

  try {
    // Prepare documents for reranking (Cohere expects string array or object array with 'text')
    const docTexts = documents.map((d) => d.text || d.content || '');

    const response = await fetch(COHERE_RERANK_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${COHERE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: RERANK_MODEL,
        query,
        documents: docTexts,
        top_n: Math.min(topN, documents.length),
        return_documents: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[CohereRerank] API error: ${response.status} ${errText.slice(0, 200)}`);
      // Fallback to original order
      return documents.map((doc, index) => ({
        index,
        relevance_score: doc.score || doc.fused_score || 0.5,
        document: doc,
      }));
    }

    const data = await response.json();
    const results = data.results || [];

    // Map back to original documents with scores
    return results.map((r) => ({
      index: r.index,
      relevance_score: r.relevance_score,
      document: documents[r.index],
    }));
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn('[CohereRerank] Request timed out, using original ranking');
    } else {
      console.error('[CohereRerank] Error:', err.message);
    }
    // Fallback to original order
    return documents.map((doc, index) => ({
      index,
      relevance_score: doc.score || doc.fused_score || 0.5,
      document: doc,
    }));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Rerank and filter documents below threshold.
 * @param {string} query - Original user query
 * @param {object[]} documents - Array of documents
 * @param {number} topN - Maximum results
 * @param {number} threshold - Minimum relevance score (default: 0.3)
 * @returns {Promise<{ reranked: object[], filtered_count: number, highest_score: number }>}
 */
export async function rerankAndFilter(query, documents, topN = 6, threshold = RERANK_THRESHOLD) {
  const reranked = await rerankDocuments(query, documents, documents.length);

  // Filter by threshold
  const filtered = reranked.filter((r) => r.relevance_score >= threshold);
  const topResults = filtered.slice(0, topN);

  // Map back to document format with rerank score
  const results = topResults.map((r) => ({
    ...r.document,
    rerank_score: r.relevance_score,
    original_index: r.index,
  }));

  return {
    reranked: results,
    filtered_count: reranked.length - filtered.length,
    highest_score: reranked[0]?.relevance_score || 0,
    all_below_threshold: filtered.length === 0,
  };
}

export { RERANK_MODEL, RERANK_THRESHOLD, RERANK_TIMEOUT_MS };
