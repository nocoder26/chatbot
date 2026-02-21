/**
 * Pinecone-based Semantic Cache for cached Q&A responses.
 * Query threshold: similarity >= 0.95 → return cached answer
 * Metadata: { question, answer, language, created_at }
 */
import { Pinecone } from '@pinecone-database/pinecone';
import { textToVector, EMBEDDING_DIMS } from './pinecone.js';

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const SEMANTIC_CACHE_INDEX = process.env.PINECONE_SEMANTIC_CACHE_INDEX;
const SEMANTIC_CACHE_HOST = process.env.PINECONE_SEMANTIC_CACHE_HOST;
const CACHE_THRESHOLD = parseFloat(process.env.SEMANTIC_CACHE_THRESHOLD || '0.95');
const CACHE_TTL_DAYS = parseInt(process.env.SEMANTIC_CACHE_TTL_DAYS || '30', 10);

let pinecone = null;
let semanticCacheIndex = null;

// Initialize the semantic cache index
if (PINECONE_API_KEY && SEMANTIC_CACHE_INDEX) {
  try {
    pinecone = new Pinecone({ apiKey: PINECONE_API_KEY });
    const indexOpts = SEMANTIC_CACHE_HOST
      ? { indexName: SEMANTIC_CACHE_INDEX, indexHostUrl: SEMANTIC_CACHE_HOST }
      : SEMANTIC_CACHE_INDEX;
    semanticCacheIndex = typeof indexOpts === 'string'
      ? pinecone.index(indexOpts)
      : pinecone.index(indexOpts.indexName, indexOpts.indexHostUrl);
    console.log(`[SemanticCache] Index connected: ${SEMANTIC_CACHE_INDEX} (${EMBEDDING_DIMS} dims, threshold=${CACHE_THRESHOLD})`);
  } catch (err) {
    console.error('[SemanticCache] Failed to initialize:', err.message);
  }
} else {
  console.warn('[SemanticCache] PINECONE_SEMANTIC_CACHE_INDEX not set — semantic caching disabled.');
}

/**
 * Check if semantic cache is available.
 */
export function isCacheAvailable() {
  return !!semanticCacheIndex;
}

/**
 * Query the semantic cache for a similar question.
 * @param {string} question - User question
 * @param {string} language - Language code (e.g., 'en', 'es')
 * @returns {{ hit: boolean, answer?: string, question?: string, score?: number }}
 */
export async function queryCachedAnswer(question, language = 'en') {
  if (!semanticCacheIndex || !question) {
    return { hit: false };
  }

  try {
    const queryVector = await textToVector(question);
    if (queryVector.every((x) => x === 0)) {
      return { hit: false };
    }

    // Query with language filter
    const results = await semanticCacheIndex.query({
      vector: queryVector,
      topK: 1,
      includeMetadata: true,
      filter: { language: { $eq: language } },
    });

    const match = results.matches?.[0];
    if (match && match.score >= CACHE_THRESHOLD) {
      return {
        hit: true,
        answer: match.metadata?.answer || '',
        question: match.metadata?.question || '',
        score: match.score,
        cached_at: match.metadata?.created_at,
      };
    }

    return { hit: false, score: match?.score };
  } catch (err) {
    console.error('[SemanticCache] Query error:', err.message);
    return { hit: false };
  }
}

/**
 * Upsert a Q&A pair into the semantic cache.
 * @param {string} question - User question
 * @param {string} answer - AI answer
 * @param {string} language - Language code
 * @param {object} metadata - Additional metadata
 */
export async function upsertCachedAnswer(question, answer, language = 'en', metadata = {}) {
  if (!semanticCacheIndex || !question || !answer) {
    return false;
  }

  try {
    const queryVector = await textToVector(question);
    if (queryVector.every((x) => x === 0)) {
      return false;
    }

    const id = `sc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const expiresAt = new Date(Date.now() + CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

const records = [{
  id,
  values: queryVector,
  metadata: {
    question: question.slice(0, 1000),
    answer: answer.slice(0, 4000),
    language,
    created_at: new Date().toISOString(),
    expires_at: expiresAt,
    ...metadata,
  },
}];

if (!records || records.length === 0) {
  console.log('Skipping empty Pinecone upsert');
  return false;
}

await semanticCacheIndex.upsert(records);

console.log(`[SemanticCache] Cached Q&A: "${question.slice(0, 50)}..." (${language})`);
return true;
  } catch (err) {
    console.error('[SemanticCache] Upsert error:', err.message);
    return false;
  }
}

/**
 * Delete a cached answer by ID.
 * @param {string} id
 */
export async function deleteCachedAnswer(id) {
  if (!semanticCacheIndex || !id) return false;

  try {
    await semanticCacheIndex.deleteOne(id);
    return true;
  } catch (err) {
    console.error('[SemanticCache] Delete error:', err.message);
    return false;
  }
}

/**
 * Clear expired entries from the cache (for maintenance).
 * @returns {number} Number of deleted entries
 */
export async function cleanupExpiredEntries() {
  if (!semanticCacheIndex) return 0;

  try {
    const now = new Date().toISOString();
    // Query for expired entries
    const zeroVector = new Array(EMBEDDING_DIMS).fill(0.0001);
    const results = await semanticCacheIndex.query({
      vector: zeroVector,
      topK: 100,
      includeMetadata: true,
      filter: {
        expires_at: { $lt: now },
      },
    });

    if (!results.matches || results.matches.length === 0) {
      return 0;
    }

    const expiredIds = results.matches.map((m) => m.id);
    await semanticCacheIndex.deleteMany(expiredIds);
    console.log(`[SemanticCache] Cleaned up ${expiredIds.length} expired entries`);
    return expiredIds.length;
  } catch (err) {
    console.error('[SemanticCache] Cleanup error:', err.message);
    return 0;
  }
}

export { semanticCacheIndex, CACHE_THRESHOLD, CACHE_TTL_DAYS };
