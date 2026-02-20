/**
 * Chat retrieval pipeline: query expansion + dense KB + BM25 + RRF fusion + Cohere rerank -> top 6 context.
 * Enhanced with:
 * - Query expansion (3 query variants)
 * - Parallel Pinecone queries for all variants
 * - Cohere reranking for improved relevance
 * - Semantic cache for speed/consistency
 */
import { embedQuery, queryByVector } from './pinecone.js';
import * as semanticCache from './semanticCache.js';
import { expandQuery, isExpansionAvailable } from './queryExpansion.js';
import { rerankAndFilter, isRerankAvailable, RERANK_THRESHOLD } from './cohereRerank.js';

const KB_TOP_K = parseInt(process.env.RAG_KB_TOP_K || '30', 10);
const TOP_K_CONTEXT = parseInt(process.env.RAG_TOP_K_CONTEXT || '6', 10);
const RRF_K = 60;
const USE_QUERY_EXPANSION = process.env.ENABLE_QUERY_EXPANSION !== 'false';
const USE_COHERE_RERANK = process.env.ENABLE_COHERE_RERANK !== 'false';

function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 1);
}

/**
 * BM25 over a small corpus (the dense candidates). Returns map of id -> score.
 */
function bm25Scores(queryTokens, candidates) {
  const k1 = 1.2;
  const b = 0.75;
  const docTokens = candidates.map((c) => tokenize(c.text));
  const N = docTokens.length;
  const avgLen = docTokens.reduce((s, d) => s + d.length, 0) / N || 1;
  const df = {};
  for (const doc of docTokens) {
    const seen = new Set();
    for (const t of doc) {
      if (!seen.has(t)) {
        seen.add(t);
        df[t] = (df[t] || 0) + 1;
      }
    }
  }
  const idf = {};
  for (const t of queryTokens) {
    idf[t] = Math.log((N - (df[t] || 0) + 0.5) / ((df[t] || 0) + 0.5) + 1);
  }
  const scores = {};
  candidates.forEach((c, i) => {
    const doc = docTokens[i];
    const len = doc.length;
    const tf = {};
    for (const t of doc) tf[t] = (tf[t] || 0) + 1;
    let sum = 0;
    for (const t of queryTokens) {
      const n = tf[t] || 0;
      sum += idf[t] * (n * (k1 + 1)) / (n + k1 * (1 - b + b * (len / avgLen)));
    }
    scores[c.chunk_id] = sum;
  });
  return scores;
}

/** RRF: 1 / (k + rank). */
function rrf(rank) {
  return 1 / (RRF_K + rank);
}

/**
 * Dense retrieve from KB with query expansion and Cohere reranking.
 * Flow:
 * 1. Query expansion → [q1, q2, q3]
 * 2. Promise.all → Pinecone KB query for all 3 queries
 * 3. Deduplicate by chunk_id
 * 4. BM25 + RRF fusion
 * 5. Cohere rerank against original query
 * 6. Filter chunks < 0.3 score
 * 7. Return top 6 chunks
 *
 * @param {string} queryText
 * @returns {Promise<{ kb_dense_candidates: Array, kb_final_context: Array, queryVector: number[], expansion_used: boolean, rerank_used: boolean }>}
 */
export async function retrieveKB(queryText) {
  const cached = semanticCache.get(queryText);
  if (cached) {
    return { ...cached, from_cache: true };
  }

  // Step 1: Query expansion (if enabled)
  let queries = [queryText];
  let expansionUsed = false;
  if (USE_QUERY_EXPANSION && isExpansionAvailable()) {
    try {
      queries = await expandQuery(queryText);
      expansionUsed = queries.length > 1;
    } catch (err) {
      console.warn('[Retrieval] Query expansion failed:', err.message);
    }
  }

  // Step 2: Embed original query (for return value and memory queries)
  const queryVector = await embedQuery(queryText);
  const isZero = queryVector.every((x) => x === 0);
  if (isZero) {
    return { kb_dense_candidates: [], kb_final_context: [], queryVector, expansion_used: false, rerank_used: false };
  }

  // Step 3: Parallel Pinecone queries for all query variants
  const queryPromises = queries.map(async (q, idx) => {
    const vec = idx === 0 ? queryVector : await embedQuery(q);
    if (vec.every((x) => x === 0)) return [];
    return queryByVector(vec, KB_TOP_K, {}, 'knowledgeBase');
  });

  const allResults = await Promise.all(queryPromises);

  // Step 4: Deduplicate by chunk_id
  const seenChunks = new Map();
  allResults.flat().forEach((m) => {
    const chunkId = m.id;
    if (!seenChunks.has(chunkId) || (m.score || 0) > (seenChunks.get(chunkId).score || 0)) {
      seenChunks.set(chunkId, m);
    }
  });

  const kb_dense_candidates = Array.from(seenChunks.values()).map((m) => ({
    chunk_id: m.id,
    score: typeof m.score === 'number' ? m.score : 0,
    doc_id: m.metadata?.source || m.metadata?.document || m.metadata?.doc_id || 'unknown',
    text: m.metadata?.text || m.metadata?.content || '',
  }));

  if (kb_dense_candidates.length === 0) {
    return { kb_dense_candidates: [], kb_final_context: [], queryVector, expansion_used: expansionUsed, rerank_used: false };
  }

  // Step 5: BM25 + RRF fusion
  const queryTokens = tokenize(queryText);
  const bm25 = bm25Scores(queryTokens, kb_dense_candidates);
  const denseRank = new Map();
  [...kb_dense_candidates]
    .sort((a, b) => b.score - a.score)
    .forEach((c, i) => denseRank.set(c.chunk_id, i));
  const bm25Rank = new Map();
  [...kb_dense_candidates]
    .sort((a, b) => (bm25[b.chunk_id] || 0) - (bm25[a.chunk_id] || 0))
    .forEach((c, i) => bm25Rank.set(c.chunk_id, i));

  const fused = kb_dense_candidates.map((c) => ({
    ...c,
    fused_score: rrf(denseRank.get(c.chunk_id)) + rrf(bm25Rank.get(c.chunk_id)),
  }));
  fused.sort((a, b) => b.fused_score - a.fused_score);

  // Take top candidates for reranking
  const candidatesForRerank = fused.slice(0, KB_TOP_K);

  // Step 6: Cohere rerank (if enabled)
  let kb_final_context;
  let rerankUsed = false;
  let allBelowThreshold = false;

  if (USE_COHERE_RERANK && isRerankAvailable() && candidatesForRerank.length > 0) {
    try {
      const rerankResult = await rerankAndFilter(queryText, candidatesForRerank, TOP_K_CONTEXT, RERANK_THRESHOLD);
      kb_final_context = rerankResult.reranked.map((c) => ({
        chunk_id: c.chunk_id,
        fused_score: c.rerank_score, // Use rerank score as final score
        doc_id: c.doc_id,
        text: c.text,
        original_fused_score: c.fused_score,
      }));
      rerankUsed = true;
      allBelowThreshold = rerankResult.all_below_threshold;
    } catch (err) {
      console.warn('[Retrieval] Cohere rerank failed, using RRF results:', err.message);
      kb_final_context = fused.slice(0, TOP_K_CONTEXT).map(({ chunk_id, fused_score, doc_id, text }) => ({
        chunk_id,
        fused_score,
        doc_id,
        text,
      }));
    }
  } else {
    // No reranking, use RRF results
    kb_final_context = fused.slice(0, TOP_K_CONTEXT).map(({ chunk_id, fused_score, doc_id, text }) => ({
      chunk_id,
      fused_score,
      doc_id,
      text,
    }));
  }

  const result = {
    kb_dense_candidates,
    kb_final_context,
    queryVector,
    expansion_used: expansionUsed,
    rerank_used: rerankUsed,
    all_below_threshold: allBelowThreshold,
    queries_used: queries.length,
  };

  semanticCache.set(queryText, result);
  return result;
}
