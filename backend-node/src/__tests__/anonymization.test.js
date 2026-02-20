import { describe, it, expect } from 'vitest';
import {
  generalizeBloodworkValue,
  generalizeAge,
  sanitizeFreeText,
  suppressRareCombinations,
  temporalBucket,
  addDifferentialPrivacyNoise,
  categorizeQuestion,
  hashForDedup,
} from '../gdpr/anonymization.js';

describe('generalizeBloodworkValue', () => {
  it('should generalize low AMH', () => {
    const result = generalizeBloodworkValue('AMH', '0.8', 'ng/mL');
    expect(result.range).toContain('low');
  });

  it('should generalize elevated FSH', () => {
    const result = generalizeBloodworkValue('FSH', '45', 'mIU/mL');
    expect(result.range).toContain('elevated');
  });

  it('should generalize normal range glucose', () => {
    const result = generalizeBloodworkValue('Glucose', '85', 'mg/dL');
    expect(result.range).toContain('normal');
  });

  it('should handle unknown markers with quintile ranges', () => {
    const result = generalizeBloodworkValue('CustomMarker', '37', 'units');
    expect(result.range).toMatch(/\d+-\d+/);
  });

  it('should handle non-numeric values', () => {
    const result = generalizeBloodworkValue('Test', 'Positive', 'n/a');
    expect(result.range).toBe('unknown');
  });
});

describe('generalizeAge', () => {
  it('should bucket 22 to 20-25', () => {
    expect(generalizeAge(22)).toBe('20-25');
  });

  it('should bucket 38 to 35-40', () => {
    expect(generalizeAge(38)).toBe('35-40');
  });

  it('should bucket 40 to 40-45', () => {
    expect(generalizeAge(40)).toBe('40-45');
  });

  it('should return null for invalid age', () => {
    expect(generalizeAge('invalid')).toBeNull();
  });
});

describe('sanitizeFreeText', () => {
  it('should strip email addresses', () => {
    const result = sanitizeFreeText('Contact me at john@example.com for results');
    expect(result).not.toContain('john@example.com');
    expect(result).toContain('[REDACTED]');
  });

  it('should strip doctor names', () => {
    const result = sanitizeFreeText('Dr. Smith prescribed medication');
    expect(result).not.toContain('Dr. Smith');
  });

  it('should strip clinic names', () => {
    const result = sanitizeFreeText('I visited Hospital de Barcelona last week');
    expect(result).not.toContain('Hospital de Barcelona');
  });

  it('should strip partner names', () => {
    const result = sanitizeFreeText('my husband John was also tested');
    expect(result).not.toContain('John');
  });

  it('should preserve medical terminology', () => {
    const result = sanitizeFreeText('AMH level is 2.5 ng/mL, follicular phase progesterone normal');
    expect(result).toContain('AMH');
    expect(result).toContain('follicular phase');
    expect(result).toContain('progesterone');
  });

  it('should return empty string for null input', () => {
    expect(sanitizeFreeText(null)).toBe('');
  });
});

describe('suppressRareCombinations', () => {
  it('should keep combinations at or above threshold', () => {
    const records = Array.from({ length: 6 }, () => ({ combinationKey: 'A' }));
    const { kept, suppressed } = suppressRareCombinations(records, 5);
    expect(kept.length).toBe(6);
    expect(suppressed.length).toBe(0);
  });

  it('should suppress combinations below threshold', () => {
    const records = [
      ...Array.from({ length: 3 }, () => ({ combinationKey: 'rare' })),
      ...Array.from({ length: 6 }, () => ({ combinationKey: 'common' })),
    ];
    const { kept, suppressed } = suppressRareCombinations(records, 5);
    expect(kept.length).toBe(6);
    expect(suppressed.length).toBe(3);
  });
});

describe('temporalBucket', () => {
  it('should return cycle phase if provided', () => {
    expect(temporalBucket(new Date(), 'follicular day 3-5')).toBe('follicular day 3-5');
  });

  it('should bucket dates to month level', () => {
    const result = temporalBucket(new Date('2026-03-15'));
    expect(result).toBe('2026-03');
  });
});

describe('addDifferentialPrivacyNoise', () => {
  it('should return a different value than input', () => {
    const results = new Set();
    for (let i = 0; i < 20; i++) {
      results.add(addDifferentialPrivacyNoise(100, 1.0));
    }
    expect(results.size).toBeGreaterThan(1);
  });

  it('should return non-numeric input unchanged', () => {
    expect(addDifferentialPrivacyNoise('text')).toBe('text');
  });
});

describe('categorizeQuestion', () => {
  it('should categorize IVF questions', () => {
    expect(categorizeQuestion('What is IVF?')).toBe('ivf');
  });

  it('should categorize nutrition questions', () => {
    expect(categorizeQuestion('What diet helps fertility?')).toBe('nutrition');
  });

  it('should categorize bloodwork questions', () => {
    expect(categorizeQuestion('What does my AMH level mean?')).toBe('bloodwork');
  });

  it('should return general for unknown topics', () => {
    expect(categorizeQuestion('Hello there')).toBe('general');
  });
});

describe('hashForDedup', () => {
  it('should produce consistent hashes', () => {
    expect(hashForDedup('test')).toBe(hashForDedup('test'));
  });

  it('should produce different hashes for different input', () => {
    expect(hashForDedup('a')).not.toBe(hashForDedup('b'));
  });
});
