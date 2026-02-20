/**
 * In-memory LRU semantic cache for retrieval: key = normalized query, value = { queryVector, kb_final_context, ... }.
 * TTL and max size to bound memory. Used for speed and consistent answers for similar queries.
 */
const MAX_SIZE = parseInt(process.env.SEMANTIC_CACHE_MAX_SIZE || '500', 10);
const TTL_MS = parseInt(process.env.SEMANTIC_CACHE_TTL_MS || '300000', 10); // 5 min default

function normalizeKey(queryText) {
  if (typeof queryText !== 'string') return '';
  return queryText.trim().toLowerCase().replace(/\s+/g, ' ');
}

const cache = new Map(); // key -> { value, expiresAt }
const order = []; // keys in insertion order for LRU eviction

function evictOne() {
  while (order.length > 0 && cache.size >= MAX_SIZE) {
    const k = order.shift();
    cache.delete(k);
  }
}

/**
 * @param {string} queryText
 * @returns {{ queryVector: number[], kb_dense_candidates: object[], kb_final_context: object[] } | null}
 */
export function get(queryText) {
  const key = normalizeKey(queryText);
  if (!key) return null;
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    if (entry) cache.delete(key);
    return null;
  }
  // Move to end (most recently used)
  const idx = order.indexOf(key);
  if (idx !== -1) {
    order.splice(idx, 1);
    order.push(key);
  }
  return entry.value;
}

/**
 * @param {string} queryText
 * @param {{ queryVector: number[], kb_dense_candidates: object[], kb_final_context: object[] }} value
 */
export function set(queryText, value) {
  const key = normalizeKey(queryText);
  if (!key) return;
  evictOne();
  const expiresAt = Date.now() + TTL_MS;
  if (cache.has(key)) {
    const i = order.indexOf(key);
    if (i !== -1) order.splice(i, 1);
  }
  cache.set(key, { value: { ...value }, expiresAt });
  order.push(key);
  if (cache.size > MAX_SIZE) evictOne();
}

/** Clear cache (e.g. for tests). */
export function clear() {
  cache.clear();
  order.length = 0;
}
