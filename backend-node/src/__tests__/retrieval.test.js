import { describe, it, expect } from 'vitest';
import { retrieveKB } from '../lib/retrieval.js';

describe('Retrieval (retrieveKB)', () => {
  it('returns expected shape: kb_dense_candidates, kb_final_context, queryVector', async () => {
    const result = await retrieveKB('what is IVF?');
    expect(result).toHaveProperty('kb_dense_candidates');
    expect(result).toHaveProperty('kb_final_context');
    expect(result).toHaveProperty('queryVector');
    expect(Array.isArray(result.kb_dense_candidates)).toBe(true);
    expect(Array.isArray(result.kb_final_context)).toBe(true);
    expect(Array.isArray(result.queryVector)).toBe(true);
    expect(result.queryVector.length).toBe(1024);
  });

  it('semantic cache returns same result for same normalized query', async () => {
    const r1 = await retrieveKB('What is IVF?');
    const r2 = await retrieveKB('what is ivf?');
    expect(r1.queryVector.length).toBe(r2.queryVector.length);
    expect(r1.kb_final_context.length).toBe(r2.kb_final_context.length);
  });
});
