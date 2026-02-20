/**
 * Chat retrieval pipeline: dense KB (top_k=30) + BM25 over candidates + RRF fusion -> top 6 context.
 * Uses single query embed for KB and (reused) for conversation memory. Semantic cache for speed/consistency.
 */
import { embedQuery, queryByVector } from './pinecone.js';
import * as semanticCache from './semanticCache.js';

const KB_TOP_K = parseInt(process.env.RAG_KB_TOP_K || '30', 10);
const TOP_K_CONTEXT = parseInt(process.env.RAG_TOP_K_CONTEXT || '6', 10);
const RRF_K = 60;

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
 * Dense retrieve from KB (Pinecone reproductive-health), then BM25 + RRF fusion -> top 6.
 * Uses semantic cache when available for speed and consistency.
 * @param {string} queryText
 * @returns {Promise<{ kb_dense_candidates: Array<{chunk_id, score, doc_id, text}>, kb_final_context: Array<{chunk_id, fused_score, doc_id, text}>, queryVector: number[] }>}
 */
export async function retrieveKB(queryText) {
  const cached = semanticCache.get(queryText);
  if (cached) {
    return cached;
  }

  const queryVector = await embedQuery(queryText);
  const isZero = queryVector.every((x) => x === 0);
  if (isZero) {
    return { kb_dense_candidates: [], kb_final_context: [], queryVector };
  }

  const matches = await queryByVector(queryVector, KB_TOP_K, {}, 'knowledgeBase');
  const kb_dense_candidates = matches.map((m) => ({
    chunk_id: m.id,
    score: typeof m.score === 'number' ? m.score : 0,
    doc_id: m.metadata?.source || m.metadata?.document || m.metadata?.doc_id || 'unknown',
    text: m.metadata?.text || m.metadata?.content || '',
  }));

  if (kb_dense_candidates.length === 0) {
    return { kb_dense_candidates: [], kb_final_context: [], queryVector };
  }

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
  const kb_final_context = fused.slice(0, TOP_K_CONTEXT).map(({ chunk_id, fused_score, doc_id, text }) => ({
    chunk_id,
    fused_score,
    doc_id,
    text,
  }));

  const result = { kb_dense_candidates, kb_final_context, queryVector };
  semanticCache.set(queryText, result);
  return result;
}
