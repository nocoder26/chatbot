import { describe, it, expect, beforeEach } from 'vitest';
import * as semanticCache from '../lib/semanticCache.js';

describe('Semantic Cache', () => {
  beforeEach(() => {
    semanticCache.clear();
  });

  it('get returns null for uncached key', () => {
    expect(semanticCache.get('unknown query')).toBeNull();
  });

  it('set and get return same value', () => {
    const value = {
      queryVector: [0.1, 0.2],
      kb_dense_candidates: [],
      kb_final_context: [{ chunk_id: '1', doc_id: 'd1', text: 't1' }],
    };
    semanticCache.set('what is IVF?', value);
    const got = semanticCache.get('what is IVF?');
    expect(got).not.toBeNull();
    expect(got.queryVector).toEqual(value.queryVector);
    expect(got.kb_final_context).toHaveLength(1);
    expect(got.kb_final_context[0].chunk_id).toBe('1');
  });

  it('key is normalized (lowercase, trim, collapse spaces)', () => {
    const value = { queryVector: [], kb_dense_candidates: [], kb_final_context: [] };
    semanticCache.set('  What   is   IVF?  ', value);
    expect(semanticCache.get('what is ivf?')).not.toBeNull();
    expect(semanticCache.get('What is IVF?')).not.toBeNull();
  });

  it('clear removes all entries', () => {
    semanticCache.set('q1', { queryVector: [], kb_dense_candidates: [], kb_final_context: [] });
    semanticCache.clear();
    expect(semanticCache.get('q1')).toBeNull();
  });
});
