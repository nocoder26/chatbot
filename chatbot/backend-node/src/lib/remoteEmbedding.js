/**
 * Cohere remote embeddings (1024-dim, L2-normalized). Used when local embeddings are disabled.
 * GDPR: Only the text to embed is sent; no user IDs or PII.
 */
const COHERE_API_KEY = process.env.COHERE_API_KEY;
const COHERE_EMBED_URL = 'https://api.cohere.com/v1/embed';
const TARGET_DIMS = 1024;
const EMBED_TIMEOUT_MS = parseInt(process.env.COHERE_EMBED_TIMEOUT_MS || '15000', 10);

function l2Normalize(vec) {
  const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) || 1;
  return vec.map((x) => x / norm);
}

/**
 * Get 1024-dim embedding from Cohere. Returns null if key missing or request fails.
 * @param {string} text - Text to embed (only this is sent to Cohere; no PII).
 * @returns {Promise<number[]|null>}
 */
export async function getRemoteEmbedding(text) {
  if (!COHERE_API_KEY || typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);
  try {
    const res = await fetch(COHERE_EMBED_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${COHERE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'embed-multilingual-v3.0',
        input_type: 'search_document',
        texts: [trimmed],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errBody = await res.text();
      console.error('[RemoteEmbed] Cohere error:', res.status, errBody?.slice(0, 200));
      return null;
    }

    const data = await res.json();
    const embeddings = data.embeddings;
    if (!Array.isArray(embeddings) || embeddings.length === 0 || !Array.isArray(embeddings[0])) {
      return null;
    }

    let vec = embeddings[0];
    if (vec.length !== TARGET_DIMS) {
      vec = vec.slice(0, TARGET_DIMS);
      if (vec.length < TARGET_DIMS) vec = [...vec, ...new Array(TARGET_DIMS - vec.length).fill(0)];
    }
    return l2Normalize(vec);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error('[RemoteEmbed] Request timed out after', EMBED_TIMEOUT_MS, 'ms');
    } else {
      console.error('[RemoteEmbed] Request error:', err.message);
    }
    return null;
  }
}
