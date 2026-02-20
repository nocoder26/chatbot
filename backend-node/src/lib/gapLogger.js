/**
 * Gap Logger: Async gap logging to Valkey for knowledge gap detection.
 * Triggered when all reranked chunks score < 0.3 (threshold).
 * Fire-and-forget (async, no await) to avoid blocking the response.
 */
import crypto from 'crypto';
import * as valkey from './valkey.js';

const GAP_TTL = parseInt(process.env.GAP_LOG_TTL || '86400', 10); // 24h

/**
 * Generate a hash for deduplication.
 * @param {string} query
 */
function hashQuery(query) {
  return crypto.createHash('sha256').update(query || '').digest('hex').slice(0, 12);
}

/**
 * Log a knowledge gap to Valkey (fire-and-forget).
 * @param {object} gapData
 * @param {string} gapData.query - The query that had no good matches
 * @param {string} gapData.treatment - Treatment context (optional)
 * @param {string[]} gapData.chat_history - Recent chat history (optional)
 * @param {string[]} gapData.missing_tests - Missing tests from bloodwork (optional)
 * @param {number} gapData.highest_score - Highest retrieval score (if any)
 * @param {string} gapData.source - Source: 'chat' or 'bloodwork_analyze'
 */
export function logGap(gapData) {
  // Fire-and-forget: don't await
  _logGapAsync(gapData).catch((err) => {
    console.error('[GapLogger] Failed to log gap:', err.message);
  });
}

async function _logGapAsync(gapData) {
  if (!valkey.isAvailable()) {
    // Fallback: just log to console
    console.log('[GapLogger] Gap detected (no Valkey):', gapData.query?.slice(0, 100));
    return;
  }

  const timestamp = Date.now();
  const hash = hashQuery(gapData.query);
  const key = valkey.gapKey(timestamp, hash);

  const gapRecord = {
    query: (gapData.query || '').slice(0, 500),
    treatment: gapData.treatment || null,
    chat_history: (gapData.chat_history || []).slice(-4), // Keep last 4 messages
    missing_tests: gapData.missing_tests || [],
    highest_score: gapData.highest_score || 0,
    source: gapData.source || 'chat',
    timestamp: new Date().toISOString(),
    logged_at: timestamp,
  };

  await valkey.setKey(key, gapRecord, GAP_TTL);
  console.log(`[GapLogger] Logged gap: "${gapData.query?.slice(0, 50)}..." (score: ${gapData.highest_score?.toFixed(2) || 0})`);
}

/**
 * Get all gaps from Valkey (for admin dashboard).
 * @param {number} limit - Maximum gaps to return
 * @returns {Promise<object[]>}
 */
export async function getGaps(limit = 100) {
  if (!valkey.isAvailable()) {
    return [];
  }

  try {
    const keys = await valkey.scanKeys('gap:*', limit);
    if (keys.length === 0) return [];

    const gaps = await valkey.mget(keys);
    return gaps
      .filter(Boolean)
      .sort((a, b) => (b.logged_at || 0) - (a.logged_at || 0));
  } catch (err) {
    console.error('[GapLogger] Failed to get gaps:', err.message);
    return [];
  }
}

/**
 * Get gap statistics from Valkey.
 * @returns {Promise<{ total: number, by_source: object, avg_score: number }>}
 */
export async function getGapStats() {
  const gaps = await getGaps(500);

  const bySource = {};
  let totalScore = 0;

  gaps.forEach((g) => {
    const source = g.source || 'chat';
    bySource[source] = (bySource[source] || 0) + 1;
    totalScore += g.highest_score || 0;
  });

  return {
    total: gaps.length,
    by_source: bySource,
    avg_score: gaps.length > 0 ? totalScore / gaps.length : 0,
    recent_queries: gaps.slice(0, 10).map((g) => ({
      query: g.query?.slice(0, 100),
      score: g.highest_score,
      source: g.source,
      timestamp: g.timestamp,
    })),
  };
}

/**
 * Delete a specific gap.
 * @param {string} key - Full gap key
 */
export async function deleteGap(key) {
  return valkey.deleteKey(key);
}

export { GAP_TTL };
