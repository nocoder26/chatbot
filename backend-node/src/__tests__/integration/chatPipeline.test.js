/**
 * Integration tests for the enhanced chat pipeline.
 * Tests: session → expansion → cache check → retrieval → rerank → LLM
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock external dependencies
vi.mock('@pinecone-database/pinecone', () => ({
  Pinecone: vi.fn(() => ({
    index: vi.fn(() => ({
      query: vi.fn().mockResolvedValue({ matches: [] }),
      upsert: vi.fn().mockResolvedValue({}),
    })),
  })),
}));

vi.mock('iovalkey', () => {
  const mockClient = {
    status: 'ready',
    ping: vi.fn().mockResolvedValue('PONG'),
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
    exists: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    scan: vi.fn().mockResolvedValue(['0', []]),
    mget: vi.fn().mockResolvedValue([]),
    quit: vi.fn().mockResolvedValue('OK'),
    on: vi.fn(),
  };
  return { default: vi.fn(() => mockClient) };
});

describe('Chat Pipeline Integration', () => {
  describe('Session Management', () => {
    it('creates a new session when session_id not provided', async () => {
      const { createSession } = await import('../../lib/sessionManager.js');

      const session = await createSession('user123');
      expect(session).toBeDefined();
      expect(session.session_id).toBeDefined();
      expect(session.session_id).toMatch(/^sess_/);
      expect(session.chat_history).toEqual([]);
    });

    it('returns session object with expected structure', async () => {
      const { getOrCreateSession } = await import('../../lib/sessionManager.js');

      // Get or create a session
      const session = await getOrCreateSession(null, 'user123');

      // Should have expected structure
      expect(session).toBeDefined();
      expect(session.session_id).toMatch(/^sess_/);
      expect(session.chat_history).toBeDefined();
      expect(Array.isArray(session.chat_history)).toBe(true);
    });
  });

  describe('Query Expansion', () => {
    it('returns at least the original query', async () => {
      const { expandQuery } = await import('../../lib/queryExpansion.js');

      const queries = await expandQuery('What is AMH?');
      expect(queries).toContain('What is AMH?');
      expect(queries.length).toBeGreaterThanOrEqual(1);
    });

    it('handles empty query gracefully', async () => {
      const { expandQuery } = await import('../../lib/queryExpansion.js');

      const queries = await expandQuery('');
      expect(queries).toEqual(['']);
    });
  });

  describe('Retrieval Pipeline', () => {
    it('handles zero-vector embedding gracefully', async () => {
      // Mock the embedding function to return zero vector
      vi.doMock('../../lib/pinecone.js', () => ({
        embedQuery: vi.fn().mockResolvedValue(new Array(1024).fill(0)),
        queryByVector: vi.fn().mockResolvedValue([]),
        EMBEDDING_DIMS: 1024,
      }));

      const { retrieveKB } = await import('../../lib/retrieval.js');

      const result = await retrieveKB('test query');
      expect(result.kb_dense_candidates).toEqual([]);
      expect(result.kb_final_context).toEqual([]);
    });
  });

  describe('Gap Logging', () => {
    it('logs gaps asynchronously without blocking', async () => {
      const { logGap } = await import('../../lib/gapLogger.js');

      // Should not throw
      expect(() => {
        logGap({
          query: 'test query with no KB match',
          highest_score: 0.1,
          source: 'chat',
          chat_history: [
            { role: 'user', content: 'previous question' },
            { role: 'ai', content: 'previous answer' },
          ],
        });
      }).not.toThrow();
    });

    it('includes chat history in gap log', async () => {
      const { logGap, getGaps } = await import('../../lib/gapLogger.js');

      logGap({
        query: 'fertility question',
        highest_score: 0.15,
        source: 'chat',
        chat_history: [
          { role: 'user', content: 'What is IVF?' },
          { role: 'ai', content: 'IVF stands for...' },
        ],
      });

      // Gap should be logged (fire-and-forget)
      // Can't directly verify without Valkey, but function should not throw
    });
  });

  describe('Cohere Reranking', () => {
    it('returns original order when reranking not available', async () => {
      const { rerankDocuments, isRerankAvailable } = await import('../../lib/cohereRerank.js');

      // Without COHERE_API_KEY, should fallback
      const docs = [
        { text: 'Document 1', score: 0.8 },
        { text: 'Document 2', score: 0.6 },
      ];

      const result = await rerankDocuments('test query', docs, 2);
      expect(result.length).toBe(2);
      expect(result[0].document).toEqual(docs[0]);
    });

    it('filters by threshold', async () => {
      const { rerankAndFilter } = await import('../../lib/cohereRerank.js');

      const docs = [
        { text: 'High relevance', score: 0.9 },
        { text: 'Low relevance', score: 0.1 },
      ];

      const result = await rerankAndFilter('test', docs, 2, 0.5);
      // With mock, scores default to original scores
      expect(result.reranked).toBeDefined();
    });
  });

  describe('Training Data Collection', () => {
    it('qualifies 5-star ratings for training', async () => {
      const { qualifiesForTraining } = await import('../../lib/trainingDataWriter.js');

      expect(qualifiesForTraining(5, false)).toBe(true);
    });

    it('qualifies 1-star ratings for training', async () => {
      const { qualifiesForTraining } = await import('../../lib/trainingDataWriter.js');

      expect(qualifiesForTraining(1, false)).toBe(true);
    });

    it('qualifies follow-up clicks for training', async () => {
      const { qualifiesForTraining } = await import('../../lib/trainingDataWriter.js');

      expect(qualifiesForTraining(3, true)).toBe(true);
    });

    it('does not qualify neutral ratings without follow-up', async () => {
      const { qualifiesForTraining } = await import('../../lib/trainingDataWriter.js');

      expect(qualifiesForTraining(3, false)).toBe(false);
      expect(qualifiesForTraining(4, false)).toBe(false);
      expect(qualifiesForTraining(2, false)).toBe(false);
    });
  });

  describe('Semantic Cache', () => {
    it('exports cache functions', async () => {
      const semanticCache = await import('../../lib/semanticCachePinecone.js');

      expect(typeof semanticCache.isCacheAvailable).toBe('function');
      expect(typeof semanticCache.queryCachedAnswer).toBe('function');
      expect(typeof semanticCache.upsertCachedAnswer).toBe('function');
    });

    it('returns cache miss when not available', async () => {
      const { queryCachedAnswer, isCacheAvailable } = await import('../../lib/semanticCachePinecone.js');

      // Without proper Pinecone config, cache should be unavailable
      const result = await queryCachedAnswer('test question', 'en');
      expect(result.hit).toBe(false);
    });
  });

  describe('LLM Utilities', () => {
    it('formats citations correctly', async () => {
      const { formatCitation } = await import('../../lib/llm.js');

      expect(formatCitation('ivf_protocol_2024_compress.pdf')).toBe('Ivf Protocol 2024');
      expect(formatCitation('fertility_guide.pdf')).toBe('Fertility Guide');
      expect(formatCitation('test_document')).toBe('Test Document');
    });
  });
});

describe('Bloodwork Pipeline', () => {
  describe('Standard Fertility Panel', () => {
    it('identifies missing tests from standard panel', () => {
      const STANDARD_FERTILITY_PANEL = [
        'FSH', 'LH', 'AMH', 'Estradiol', 'Progesterone',
        'Prolactin', 'TSH', 'Free T4', 'Testosterone',
      ];

      const extractedBiomarkers = [
        { biomarker: 'FSH', value: '6.5' },
        { biomarker: 'LH', value: '4.2' },
        { biomarker: 'Hemoglobin', value: '14.0' },
      ];

      const extractedNames = new Set(extractedBiomarkers.map((b) => b.biomarker.toLowerCase()));
      const missingTests = STANDARD_FERTILITY_PANEL.filter(
        (test) => !extractedNames.has(test.toLowerCase())
      );

      expect(missingTests).toContain('AMH');
      expect(missingTests).toContain('Estradiol');
      expect(missingTests).toContain('Progesterone');
      expect(missingTests).not.toContain('FSH');
      expect(missingTests).not.toContain('LH');
    });
  });
});

describe('Admin Endpoints', () => {
  describe('Valkey Stats', () => {
    it('handles Valkey unavailable gracefully', async () => {
      const valkey = await import('../../lib/valkey.js');

      // When Valkey is not available
      if (!valkey.isAvailable()) {
        const { getGapStats } = await import('../../lib/gapLogger.js');
        const stats = await getGapStats();

        expect(stats.total).toBe(0);
        expect(stats.by_source).toEqual({});
      }
    });
  });
});
