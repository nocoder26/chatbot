/**
 * Session Manager: CRUD operations for Valkey-based session tracking.
 * Tracks user sessions with chat history (last 4 messages), context cache, and retrieval scores.
 */
import { randomUUID } from 'crypto';
import * as valkey from './valkey.js';
import { hashUserId } from '../gdpr/sanitizer.js';

const MAX_CHAT_HISTORY = 4;
const SESSION_TTL = parseInt(process.env.SESSION_TTL || '86400', 10); // 24h

/**
 * Generate a new session ID.
 */
function generateSessionId() {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Create a new session.
 * @param {string} userId - Original user ID (will be hashed)
 * @returns {{ session_id: string, user_id: string, chat_history: [], context_cache: null }}
 */
export async function createSession(userId) {
  const sessionId = generateSessionId();
  const hashedUserId = hashUserId(userId);

  const session = {
    session_id: sessionId,
    user_id: hashedUserId,
    chat_history: [],
    context_cache: null,
    created_at: new Date().toISOString(),
    last_active: new Date().toISOString(),
  };

  const key = valkey.sessionKey(sessionId);
  const success = await valkey.setKey(key, session, SESSION_TTL);

  if (!success) {
    // Fallback: return session object without Valkey persistence
    console.warn('[SessionManager] Failed to persist session to Valkey');
  }

  return session;
}

/**
 * Get an existing session by ID.
 * @param {string} sessionId
 * @returns {object|null}
 */
export async function getSession(sessionId) {
  if (!sessionId) return null;

  const key = valkey.sessionKey(sessionId);
  const session = await valkey.getKey(key);

  if (session) {
    // Refresh TTL on access
    await valkey.expire(key, SESSION_TTL);
  }

  return session;
}

/**
 * Get or create a session.
 * @param {string} sessionId - Existing session ID (optional)
 * @param {string} userId - User ID for new session creation
 * @returns {object}
 */
export async function getOrCreateSession(sessionId, userId) {
  if (sessionId) {
    const existing = await getSession(sessionId);
    if (existing) return existing;
  }

  return createSession(userId);
}

/**
 * Update chat history with a new message (keeps last 4 messages).
 * @param {string} sessionId
 * @param {string} role - 'user' or 'ai'
 * @param {string} content - Message content
 */
export async function updateHistory(sessionId, role, content) {
  if (!sessionId) return null;

  const session = await getSession(sessionId);
  if (!session) return null;

  // Add new message
  session.chat_history.push({
    role,
    content: content.slice(0, 2000), // Truncate for storage efficiency
    timestamp: new Date().toISOString(),
  });

  // Keep only last N messages
  if (session.chat_history.length > MAX_CHAT_HISTORY) {
    session.chat_history = session.chat_history.slice(-MAX_CHAT_HISTORY);
  }

  session.last_active = new Date().toISOString();

  const key = valkey.sessionKey(sessionId);
  await valkey.setKey(key, session, SESSION_TTL);

  return session;
}

/**
 * Cache retrieval context for the session.
 * @param {string} sessionId
 * @param {object[]} kbChunks - KB chunks used in response
 * @param {number} highestScore - Highest retrieval score
 */
export async function cacheContext(sessionId, kbChunks, highestScore) {
  if (!sessionId) return null;

  const session = await getSession(sessionId);
  if (!session) return null;

  session.context_cache = {
    kb_chunks: (kbChunks || []).slice(0, 6).map((c) => ({
      chunk_id: c.chunk_id,
      doc_id: c.doc_id,
      score: c.fused_score || c.score,
      text_preview: (c.text || '').slice(0, 200),
    })),
    highest_score: highestScore || 0,
    cached_at: new Date().toISOString(),
  };

  session.last_active = new Date().toISOString();

  const key = valkey.sessionKey(sessionId);
  await valkey.setKey(key, session, SESSION_TTL);

  return session;
}

/**
 * Get the chat history formatted for LLM context.
 * @param {string} sessionId
 * @returns {{ role: string, content: string }[]}
 */
export async function getFormattedHistory(sessionId) {
  const session = await getSession(sessionId);
  if (!session || !session.chat_history) return [];

  return session.chat_history.map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

/**
 * Delete a session.
 * @param {string} sessionId
 */
export async function deleteSession(sessionId) {
  if (!sessionId) return false;
  return valkey.deleteKey(valkey.sessionKey(sessionId));
}

/**
 * Get session metadata (without full chat history).
 * @param {string} sessionId
 */
export async function getSessionMeta(sessionId) {
  const session = await getSession(sessionId);
  if (!session) return null;

  return {
    session_id: session.session_id,
    user_id: session.user_id,
    message_count: session.chat_history?.length || 0,
    has_context_cache: !!session.context_cache,
    highest_score: session.context_cache?.highest_score || 0,
    created_at: session.created_at,
    last_active: session.last_active,
  };
}

export { MAX_CHAT_HISTORY, SESSION_TTL };
