/**
 * Valkey client wrapper with connection pool, retry logic, and helper methods.
 * Valkey is a Redis-compatible key-value store used for session tracking, gap logging, and feedback caching.
 * All keys use 24h TTL by default (EX 86400).
 */
import Valkey from 'iovalkey';

const VALKEY_URL = process.env.VALKEY_URL || 'redis://localhost:6379';
const DEFAULT_TTL = parseInt(process.env.VALKEY_DEFAULT_TTL || '86400', 10); // 24 hours

let client = null;
let connectionAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY_MS = 1000;

/**
 * Initialize Valkey client with retry logic and connection pool.
 */
export async function initValkey() {
  if (client && client.status === 'ready') {
    return client;
  }

  try {
    client = new Valkey(VALKEY_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > MAX_RECONNECT_ATTEMPTS) {
          console.error('[Valkey] Max reconnection attempts reached');
          return null; // Stop retrying
        }
        const delay = Math.min(times * RECONNECT_DELAY_MS, 10000);
        console.log(`[Valkey] Retrying connection in ${delay}ms (attempt ${times})`);
        return delay;
      },
      lazyConnect: false,
      enableReadyCheck: true,
      connectTimeout: 10000,
      keepAlive: 30000,
    });

    client.on('connect', () => {
      console.log('[Valkey] Connected to', VALKEY_URL.replace(/\/\/.*@/, '//***@'));
      connectionAttempts = 0;
    });

    client.on('error', (err) => {
      connectionAttempts++;
      if (connectionAttempts <= 3) {
        console.error('[Valkey] Connection error:', err.message);
      }
    });

    client.on('close', () => {
      console.log('[Valkey] Connection closed');
    });

    client.on('reconnecting', () => {
      console.log('[Valkey] Reconnecting...');
    });

    await client.ping();
    console.log('[Valkey] Ready');
    return client;
  } catch (err) {
    console.error('[Valkey] Failed to initialize:', err.message);
    client = null;
    return null;
  }
}

/**
 * Get the Valkey client (lazy initialization).
 */
export function getClient() {
  return client;
}

/**
 * Check if Valkey is available.
 */
export function isAvailable() {
  return client && client.status === 'ready';
}

/**
 * Set a key with optional TTL (defaults to 24h).
 * @param {string} key
 * @param {object|string} value - Will be JSON stringified if object
 * @param {number} ttl - TTL in seconds (default: 86400)
 */
export async function setKey(key, value, ttl = DEFAULT_TTL) {
  if (!isAvailable()) return false;
  try {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    await client.set(key, serialized, 'EX', ttl);
    return true;
  } catch (err) {
    console.error('[Valkey] setKey error:', err.message);
    return false;
  }
}

/**
 * Get a key and parse as JSON.
 * @param {string} key
 * @returns {object|null}
 */
export async function getKey(key) {
  if (!isAvailable()) return null;
  try {
    const value = await client.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch (_) {
      return value; // Return raw string if not JSON
    }
  } catch (err) {
    console.error('[Valkey] getKey error:', err.message);
    return null;
  }
}

/**
 * Delete a key.
 * @param {string} key
 */
export async function deleteKey(key) {
  if (!isAvailable()) return false;
  try {
    await client.del(key);
    return true;
  } catch (err) {
    console.error('[Valkey] deleteKey error:', err.message);
    return false;
  }
}

/**
 * Check if a key exists.
 * @param {string} key
 */
export async function exists(key) {
  if (!isAvailable()) return false;
  try {
    return (await client.exists(key)) === 1;
  } catch (err) {
    console.error('[Valkey] exists error:', err.message);
    return false;
  }
}

/**
 * Set TTL on an existing key.
 * @param {string} key
 * @param {number} ttl - TTL in seconds
 */
export async function expire(key, ttl) {
  if (!isAvailable()) return false;
  try {
    await client.expire(key, ttl);
    return true;
  } catch (err) {
    console.error('[Valkey] expire error:', err.message);
    return false;
  }
}

/**
 * Scan keys by pattern.
 * @param {string} pattern - e.g. 'gap:*'
 * @param {number} count - Maximum keys to return
 * @returns {string[]}
 */
export async function scanKeys(pattern, count = 100) {
  if (!isAvailable()) return [];
  try {
    const keys = [];
    let cursor = '0';
    do {
      const [newCursor, batch] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', Math.min(count, 100));
      cursor = newCursor;
      keys.push(...batch);
      if (keys.length >= count) break;
    } while (cursor !== '0');
    return keys.slice(0, count);
  } catch (err) {
    console.error('[Valkey] scanKeys error:', err.message);
    return [];
  }
}

/**
 * Get multiple keys at once.
 * @param {string[]} keys
 * @returns {object[]}
 */
export async function mget(keys) {
  if (!isAvailable() || keys.length === 0) return [];
  try {
    const values = await client.mget(keys);
    return values.map((v) => {
      if (!v) return null;
      try {
        return JSON.parse(v);
      } catch (_) {
        return v;
      }
    });
  } catch (err) {
    console.error('[Valkey] mget error:', err.message);
    return [];
  }
}

// --- Domain-specific key helpers ---

/**
 * Session key pattern: session:{session_id}
 */
export function sessionKey(sessionId) {
  return `session:${sessionId}`;
}

/**
 * Gap key pattern: gap:{timestamp}:{hash}
 */
export function gapKey(timestamp, hash) {
  return `gap:${timestamp}:${hash}`;
}

/**
 * Feedback key pattern: feedback:{session_id}:{timestamp}
 */
export function feedbackKey(sessionId, timestamp) {
  return `feedback:${sessionId}:${timestamp || Date.now()}`;
}

/**
 * Telemetry key pattern: telemetry:{user_id}
 */
export function telemetryKey(userId) {
  return `telemetry:${userId}`;
}

/**
 * Graceful shutdown.
 */
export async function disconnect() {
  if (client) {
    try {
      await client.quit();
      console.log('[Valkey] Disconnected');
    } catch (err) {
      console.error('[Valkey] Disconnect error:', err.message);
    }
    client = null;
  }
}

export { DEFAULT_TTL };
