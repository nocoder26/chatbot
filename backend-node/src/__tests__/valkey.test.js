/**
 * Unit tests for Valkey client wrapper.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock iovalkey before importing valkey
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

  return {
    default: vi.fn(() => mockClient),
  };
});

describe('Valkey Client', () => {
  let valkey;

  beforeEach(async () => {
    vi.resetModules();
    // Set environment variable before importing
    process.env.VALKEY_URL = 'redis://localhost:6379';
    valkey = await import('../lib/valkey.js');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Key Helpers', () => {
    it('generates session key correctly', () => {
      expect(valkey.sessionKey('abc123')).toBe('session:abc123');
    });

    it('generates gap key correctly', () => {
      expect(valkey.gapKey(1234567890, 'hash123')).toBe('gap:1234567890:hash123');
    });

    it('generates feedback key correctly', () => {
      const key = valkey.feedbackKey('sess123', 1234567890);
      expect(key).toBe('feedback:sess123:1234567890');
    });

    it('generates telemetry key correctly', () => {
      expect(valkey.telemetryKey('user456')).toBe('telemetry:user456');
    });
  });

  describe('TTL Configuration', () => {
    it('has default TTL of 24 hours', () => {
      expect(valkey.DEFAULT_TTL).toBe(86400);
    });
  });
});

describe('Session Manager', () => {
  let sessionManager;

  beforeEach(async () => {
    vi.resetModules();
    process.env.VALKEY_URL = 'redis://localhost:6379';
    sessionManager = await import('../lib/sessionManager.js');
  });

  describe('Session Creation', () => {
    it('exports createSession function', () => {
      expect(typeof sessionManager.createSession).toBe('function');
    });

    it('exports getSession function', () => {
      expect(typeof sessionManager.getSession).toBe('function');
    });

    it('exports updateHistory function', () => {
      expect(typeof sessionManager.updateHistory).toBe('function');
    });

    it('has MAX_CHAT_HISTORY constant', () => {
      expect(sessionManager.MAX_CHAT_HISTORY).toBe(4);
    });
  });
});

describe('Query Expansion', () => {
  let queryExpansion;

  beforeEach(async () => {
    vi.resetModules();
    queryExpansion = await import('../lib/queryExpansion.js');
  });

  it('exports expandQuery function', () => {
    expect(typeof queryExpansion.expandQuery).toBe('function');
  });

  it('exports isExpansionAvailable function', () => {
    expect(typeof queryExpansion.isExpansionAvailable).toBe('function');
  });

  it('returns original query when expansion not available', async () => {
    const result = await queryExpansion.expandQuery('test query');
    expect(result).toContain('test query');
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Gap Logger', () => {
  let gapLogger;

  beforeEach(async () => {
    vi.resetModules();
    gapLogger = await import('../lib/gapLogger.js');
  });

  it('exports logGap function', () => {
    expect(typeof gapLogger.logGap).toBe('function');
  });

  it('exports getGaps function', () => {
    expect(typeof gapLogger.getGaps).toBe('function');
  });

  it('exports getGapStats function', () => {
    expect(typeof gapLogger.getGapStats).toBe('function');
  });

  it('logGap does not throw', () => {
    expect(() => {
      gapLogger.logGap({
        query: 'test query',
        highest_score: 0.2,
        source: 'chat',
      });
    }).not.toThrow();
  });
});

describe('Cohere Rerank', () => {
  let cohereRerank;

  beforeEach(async () => {
    vi.resetModules();
    cohereRerank = await import('../lib/cohereRerank.js');
  });

  it('exports rerankDocuments function', () => {
    expect(typeof cohereRerank.rerankDocuments).toBe('function');
  });

  it('exports rerankAndFilter function', () => {
    expect(typeof cohereRerank.rerankAndFilter).toBe('function');
  });

  it('exports isRerankAvailable function', () => {
    expect(typeof cohereRerank.isRerankAvailable).toBe('function');
  });

  it('has default threshold of 0.3', () => {
    expect(cohereRerank.RERANK_THRESHOLD).toBe(0.3);
  });
});

describe('Training Data Writer', () => {
  let trainingDataWriter;

  beforeEach(async () => {
    vi.resetModules();
    trainingDataWriter = await import('../lib/trainingDataWriter.js');
  });

  it('exports appendTrainingRecord function', () => {
    expect(typeof trainingDataWriter.appendTrainingRecord).toBe('function');
  });

  it('exports qualifiesForTraining function', () => {
    expect(typeof trainingDataWriter.qualifiesForTraining).toBe('function');
  });

  it('qualifies rating 5 for training', () => {
    expect(trainingDataWriter.qualifiesForTraining(5)).toBe(true);
  });

  it('qualifies rating 1 for training', () => {
    expect(trainingDataWriter.qualifiesForTraining(1)).toBe(true);
  });

  it('qualifies follow_up_clicked for training', () => {
    expect(trainingDataWriter.qualifiesForTraining(3, true)).toBe(true);
  });

  it('does not qualify rating 3 without follow_up', () => {
    expect(trainingDataWriter.qualifiesForTraining(3, false)).toBe(false);
  });
});

describe('LLM Citation Formatting', () => {
  let llm;

  beforeEach(async () => {
    vi.resetModules();
    llm = await import('../lib/llm.js');
  });

  it('exports formatCitation function', () => {
    expect(typeof llm.formatCitation).toBe('function');
  });

  it('formats citation with compress suffix', () => {
    expect(llm.formatCitation('protocol_ivf_2024_compress.pdf')).toBe('Protocol Ivf 2024');
  });

  it('formats citation with pdf extension', () => {
    expect(llm.formatCitation('fertility_guide.pdf')).toBe('Fertility Guide');
  });

  it('replaces underscores with spaces', () => {
    expect(llm.formatCitation('my_test_file')).toBe('My Test File');
  });

  it('handles empty input', () => {
    expect(llm.formatCitation('')).toBe('');
    expect(llm.formatCitation(null)).toBe('');
  });
});
