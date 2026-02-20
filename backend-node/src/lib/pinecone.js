import { Pinecone } from '@pinecone-database/pinecone';
import { hashUserId } from '../gdpr/sanitizer.js';
import { getRemoteEmbedding } from './remoteEmbedding.js';

let pinecone = null;
let userdataIndex = null;
let knowledgeBaseIndex = null;
let bloodworkIndex = null;

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_USERDATA_INDEX = process.env.PINECONE_USERDATA_INDEX;
const PINECONE_USERDATA_HOST = process.env.PINECONE_USERDATA_HOST;
const PINECONE_KB_INDEX = process.env.PINECONE_KB_INDEX;
const PINECONE_KB_HOST = process.env.PINECONE_KB_HOST;
const PINECONE_BLOODWORK_INDEX = process.env.PINECONE_BLOODWORK_INDEX;
const PINECONE_BLOODWORK_HOST = process.env.PINECONE_BLOODWORK_HOST;

if (PINECONE_API_KEY) {
  try {
    pinecone = new Pinecone({ apiKey: PINECONE_API_KEY });

    if (PINECONE_USERDATA_INDEX) {
      const udOpts = PINECONE_USERDATA_HOST
        ? { indexName: PINECONE_USERDATA_INDEX, indexHostUrl: PINECONE_USERDATA_HOST }
        : PINECONE_USERDATA_INDEX;
      userdataIndex = typeof udOpts === 'string' ? pinecone.index(udOpts) : pinecone.index(udOpts.indexName, udOpts.indexHostUrl);
      console.log(`[Pinecone] User data index connected: ${PINECONE_USERDATA_INDEX} (1024 dims)`);
    } else {
      console.warn('[Pinecone] PINECONE_USERDATA_INDEX not set — user data vectorization disabled.');
    }

    if (PINECONE_KB_INDEX) {
      const kbOpts = PINECONE_KB_HOST
        ? { indexName: PINECONE_KB_INDEX, indexHostUrl: PINECONE_KB_HOST }
        : PINECONE_KB_INDEX;
      knowledgeBaseIndex = typeof kbOpts === 'string' ? pinecone.index(kbOpts) : pinecone.index(kbOpts.indexName, kbOpts.indexHostUrl);
      console.log(`[Pinecone] Knowledge base index connected: ${PINECONE_KB_INDEX} (1024 dims)`);
    } else {
      console.warn('[Pinecone] PINECONE_KB_INDEX not set — knowledge base queries disabled.');
    }

    if (PINECONE_BLOODWORK_INDEX) {
      const bwOpts = PINECONE_BLOODWORK_HOST
        ? { indexName: PINECONE_BLOODWORK_INDEX, indexHostUrl: PINECONE_BLOODWORK_HOST }
        : PINECONE_BLOODWORK_INDEX;
      bloodworkIndex = typeof bwOpts === 'string' ? pinecone.index(bwOpts) : pinecone.index(bwOpts.indexName, bwOpts.indexHostUrl);
      console.log(`[Pinecone] Bloodwork index connected: ${PINECONE_BLOODWORK_INDEX}`);
    } else {
      console.warn('[Pinecone] PINECONE_BLOODWORK_INDEX not set — bloodwork vectorization uses userdata index.');
    }
  } catch (err) {
    console.error('[Pinecone] Failed to initialize:', err.message);
  }
} else {
  console.warn('[Pinecone] PINECONE_API_KEY not set — all Pinecone features disabled.');
}

// --- Real Embeddings via @xenova/transformers ---
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'Xenova/bge-large-en-v1.5';
const EMBEDDING_DIMS = parseInt(process.env.EMBEDDING_DIMS || '1024', 10);

let embeddingPipeline = null;
let embeddingLoadFailed = false;

async function getEmbeddingPipeline() {
  if (embeddingPipeline) return embeddingPipeline;
  if (embeddingLoadFailed) return null;

  if (process.env.DISABLE_LOCAL_EMBEDDINGS === 'true') {
    console.warn('[Embeddings] Local embeddings disabled via DISABLE_LOCAL_EMBEDDINGS — using zero-vector fallback.');
    embeddingLoadFailed = true;
    return null;
  }

  try {
    const { pipeline } = await import('@xenova/transformers');
    embeddingPipeline = await pipeline('feature-extraction', EMBEDDING_MODEL);
    console.log(`[Embeddings] Model loaded: ${EMBEDDING_MODEL} (${EMBEDDING_DIMS} dims)`);
    return embeddingPipeline;
  } catch (err) {
    console.error('[Embeddings] Failed to load model:', err.message);
    embeddingLoadFailed = true;
    return null;
  }
}

/**
 * Generate a real embedding vector from text (local model or Cohere remote).
 * 1024-dim, L2-normalized for cosine similarity. Falls back to zero vector if unavailable.
 */
export async function textToVector(text, dimensions = EMBEDDING_DIMS) {
  const pipe = await getEmbeddingPipeline();
  if (pipe) {
    try {
      const output = await pipe(text, { pooling: 'cls', normalize: true });
      const raw = Array.from(output.data);
      const vec = raw.slice(0, dimensions);
      const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) || 1;
      return vec.map((x) => x / norm);
    } catch (err) {
      console.error('[Embeddings] Inference error:', err.message);
      return new Array(dimensions).fill(0);
    }
  }

  const remote = await getRemoteEmbedding(text);
  if (remote && remote.length === dimensions) {
    return remote;
  }
  if (!process.env.COHERE_API_KEY) {
    console.warn('[Embeddings] RAG will be disabled: no local pipeline and COHERE_API_KEY not set.');
  }
  return new Array(dimensions).fill(0);
}

/** Alias for retrieval pipeline: embed query once for KB and userdata. */
export async function embedQuery(text) {
  return textToVector(text);
}

/**
 * Vectorize content and store in the `userdata` Pinecone index.
 */
function isZeroVector(vector) {
  return vector.every((v) => v === 0);
}

export async function vectorizeAndStore(userId, type, content, metadata = {}) {
  if (!userdataIndex) return;

  try {
    const vector = await textToVector(content);
    if (isZeroVector(vector)) return;

    const pseudoId = hashUserId(userId);
    const id = `${type}_${pseudoId}_${Date.now()}`;

    await userdataIndex.upsert([{
      id,
      values: vector,
      metadata: {
        type,
        userId: pseudoId,
        content: content.slice(0, 1000),
        timestamp: new Date().toISOString(),
        ...metadata,
      },
    }]);
  } catch (err) {
    console.error('[Pinecone] Vectorize error:', err.message);
  }
}

/**
 * Query Pinecone for similar vectors.
 * @param {string} queryText
 * @param {number} topK
 * @param {object} filter
 * @param {"knowledgeBase"|"userdata"} source
 */
export async function querySimilar(queryText, topK = 5, filter = {}, source = 'knowledgeBase') {
  const vector = await textToVector(queryText);
  return queryByVector(vector, topK, filter, source);
}

/**
 * Query Pinecone with a precomputed vector (e.g. reuse same embed for KB + userdata).
 * @param {number[]} vector
 * @param {number} topK
 * @param {object} filter
 * @param {"knowledgeBase"|"userdata"} source
 */
export async function queryByVector(vector, topK = 5, filter = {}, source = 'knowledgeBase') {
  const indexMap = { userdata: userdataIndex, knowledgeBase: knowledgeBaseIndex, bloodwork: bloodworkIndex || userdataIndex };
  const targetIndex = indexMap[source] || knowledgeBaseIndex;
  if (!targetIndex) return [];
  if (isZeroVector(vector)) return [];

  try {
    const queryOpts = { vector, topK, includeMetadata: true };
    if (filter && Object.keys(filter).length > 0) {
      queryOpts.filter = filter;
    }
    const results = await targetIndex.query(queryOpts);
    return results.matches || [];
  } catch (err) {
    console.error('[Pinecone] Query error:', err.message);
    return [];
  }
}

/** Query userdata by precomputed vector; filter by hashed userId and optional conversationId. */
export async function queryConversationMemory(queryVector, userId, conversationId, topK = 3) {
  if (!userdataIndex) return [];
  if (isZeroVector(queryVector)) return [];
  try {
    const pseudoId = hashUserId(userId);
    const filter = { userId: pseudoId };
    if (conversationId) filter.conversationId = conversationId;
    return queryByVector(queryVector, topK, filter, 'userdata');
  } catch (err) {
    console.error('[Pinecone] Conversation memory query error:', err.message);
    return [];
  }
}

/**
 * Delete vectors associated with a user (GDPR right to erasure).
 */
export async function deleteVectorsByUserId(userId) {
  if (!userdataIndex) return;
  try {
    const pseudoId = hashUserId(userId);
    const results = await userdataIndex.query({
      vector: new Array(EMBEDDING_DIMS).fill(0),
      topK: 100,
      filter: { userId: pseudoId },
      includeMetadata: false,
    });
    const ids = (results.matches || []).map((m) => m.id);
    if (ids.length > 0) {
      await userdataIndex.deleteMany(ids);
      console.log(`[Pinecone] Deleted ${ids.length} vectors for user ${pseudoId.slice(0, 8)}...`);
    }
  } catch (err) {
    console.error('[Pinecone] Delete vectors error:', err.message);
  }
}

/**
 * Upsert an anonymized vector (no userId in metadata).
 */
export async function upsertAnonymizedVector(type, content, metadata = {}) {
  if (!userdataIndex) return;
  try {
    const vector = await textToVector(content);
    if (isZeroVector(vector)) return;

    const id = `anon_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await userdataIndex.upsert([{
      id,
      values: vector,
      metadata: { type, content: content.slice(0, 1000), timestamp: new Date().toISOString(), anonymized: true, ...metadata },
    }]);
  } catch (err) {
    console.error('[Pinecone] Anonymized upsert error:', err.message);
  }
}

/**
 * Vectorize bloodwork content and store in the dedicated bloodwork index (falls back to userdata).
 */
export async function vectorizeBloodwork(userId, content, metadata = {}) {
  const targetIdx = bloodworkIndex || userdataIndex;
  if (!targetIdx) return;

  try {
    const vector = await textToVector(content);
    if (isZeroVector(vector)) return;

    const pseudoId = hashUserId(userId);
    const id = `bw_${pseudoId}_${Date.now()}`;

    await targetIdx.upsert([{
      id,
      values: vector,
      metadata: {
        type: 'bloodwork_upload',
        userId: pseudoId,
        content: content.slice(0, 1000),
        timestamp: new Date().toISOString(),
        ...metadata,
      },
    }]);
  } catch (err) {
    console.error('[Pinecone] Bloodwork vectorize error:', err.message);
  }
}

export { pinecone, userdataIndex, knowledgeBaseIndex, bloodworkIndex, EMBEDDING_DIMS };
