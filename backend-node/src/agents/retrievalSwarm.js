/**
 * Retrieval Swarm: Parallel Pinecone searches with deduplication and Cohere reranking.
 * Executes all search queries concurrently via Promise.all().
 * Caps results at 15 chunks before reranking.
 */
import { embedQuery, queryByVector } from '../lib/pinecone.js';
import { rerankAndFilter, isRerankAvailable, RERANK_THRESHOLD } from '../lib/cohereRerank.js';

const MAX_RERANK_CHUNKS = 15;
const TOP_K_PER_QUERY = 20;
const TOP_K_FINAL = 6;
const COHERE_FALLBACK_TOP_K = 5;

/**
 * Execute parallel retrieval for multiple search queries.
 * @param {string[]} searchQueries - Array of search query strings
 * @param {string} originalQuery - Original user query for reranking
 * @returns {Promise<{ chunks: Array, rerankUsed: boolean, allBelowThreshold: boolean }>}
 */
export async function executeRetrievalSwarm(searchQueries, originalQuery) {
  const result = {
    chunks: [],
    rerankUsed: false,
    allBelowThreshold: false,
    queryCount: searchQueries.length,
  };

  if (!searchQueries?.length) {
    return result;
  }

  try {
    // Step 1: Parallel embedding + Pinecone queries for all search queries
    const queryPromises = searchQueries.map(async (q) => {
      try {
        const vector = await embedQuery(q);
        if (vector.every((x) => x === 0)) return [];
        return queryByVector(vector, TOP_K_PER_QUERY, {}, 'knowledgeBase');
      } catch (err) {
        console.warn('[RetrievalSwarm] Query failed:', err.message);
        return [];
      }
    });

    const allResults = await Promise.all(queryPromises);

    // Step 2: Deduplicate by chunk_id (keep highest score)
    const seenChunks = new Map();
    allResults.flat().forEach((m) => {
      const chunkId = m.id;
      if (!seenChunks.has(chunkId) || (m.score || 0) > (seenChunks.get(chunkId).score || 0)) {
        seenChunks.set(chunkId, m);
      }
    });

    // Step 3: Format and sort by score
    let candidates = Array.from(seenChunks.values())
      .map((m) => ({
        chunk_id: m.id,
        score: typeof m.score === 'number' ? m.score : 0,
        doc_id: m.metadata?.source || m.metadata?.document || m.metadata?.doc_id || 'unknown',
        text: m.metadata?.text || m.metadata?.content || '',
      }))
      .sort((a, b) => b.score - a.score);

    if (candidates.length === 0) {
      return result;
    }

    // Step 4: Cap at 15 chunks before reranking
    const candidatesForRerank = candidates.slice(0, MAX_RERANK_CHUNKS);

    // Step 5: Cohere rerank (with fallback)
    if (isRerankAvailable() && candidatesForRerank.length > 0) {
      try {
        const rerankResult = await rerankAndFilter(
          originalQuery,
          candidatesForRerank,
          TOP_K_FINAL,
          RERANK_THRESHOLD
        );
        result.chunks = rerankResult.reranked.map((c) => ({
          chunk_id: c.chunk_id,
          score: c.rerank_score,
          doc_id: c.doc_id,
          text: c.text,
        }));
        result.rerankUsed = true;
        result.allBelowThreshold = rerankResult.all_below_threshold;
      } catch (err) {
        console.warn('[RetrievalSwarm] Cohere rerank failed, using raw chunks:', err.message);
        // Fallback: use top 5 raw Pinecone chunks
        result.chunks = candidatesForRerank.slice(0, COHERE_FALLBACK_TOP_K);
      }
    } else {
      // No reranking available, use top chunks
      result.chunks = candidatesForRerank.slice(0, TOP_K_FINAL);
    }

    return result;
  } catch (err) {
    console.error('[RetrievalSwarm] Fatal error:', err.message);
    return result;
  }
}
