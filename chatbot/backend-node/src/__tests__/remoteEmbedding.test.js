import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Remote Embedding (Cohere)', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.COHERE_API_KEY;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.COHERE_API_KEY = originalEnv;
    vi.resetModules();
  });

  it('getRemoteEmbedding returns null when COHERE_API_KEY is unset', async () => {
    delete process.env.COHERE_API_KEY;
    vi.resetModules();
    const { getRemoteEmbedding } = await import('../lib/remoteEmbedding.js');
    const result = await getRemoteEmbedding('hello');
    expect(result).toBeNull();
  });

  it('getRemoteEmbedding returns null for empty string', async () => {
    process.env.COHERE_API_KEY = 'test-key';
    vi.resetModules();
    const { getRemoteEmbedding } = await import('../lib/remoteEmbedding.js');
    const result = await getRemoteEmbedding('   ');
    expect(result).toBeNull();
  });

  it('getRemoteEmbedding returns 1024-dim L2-normalized vector when Cohere returns embeddings', async () => {
    process.env.COHERE_API_KEY = 'test-key';
    const fakeVec = new Array(1024).fill(0).map((_, i) => (i + 1) * 0.001);
    const norm = Math.sqrt(fakeVec.reduce((s, x) => s + x * x, 0));
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ embeddings: [fakeVec] }),
    });
    vi.resetModules();
    const { getRemoteEmbedding } = await import('../lib/remoteEmbedding.js');
    const result = await getRemoteEmbedding('test query');
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1024);
    const resultNorm = Math.sqrt(result.reduce((s, x) => s + x * x, 0));
    expect(Math.abs(resultNorm - 1)).toBeLessThan(1e-5);
  });

  it('getRemoteEmbedding returns null when Cohere returns non-ok', async () => {
    process.env.COHERE_API_KEY = 'test-key';
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, text: () => Promise.resolve('Unauthorized') });
    vi.resetModules();
    const { getRemoteEmbedding } = await import('../lib/remoteEmbedding.js');
    const result = await getRemoteEmbedding('test');
    expect(result).toBeNull();
  });
});
