import { describe, it, expect } from 'vitest';
import { calculateKAnonymity, validateKAnonymity, uniquenessTest } from '../gdpr/riskAssessment.js';

describe('calculateKAnonymity', () => {
  it('should return correct k for sample data', () => {
    const records = [
      { age: '30-35', language: 'en' },
      { age: '30-35', language: 'en' },
      { age: '30-35', language: 'en' },
      { age: '35-40', language: 'es' },
      { age: '35-40', language: 'es' },
    ];
    const result = calculateKAnonymity(records, ['age', 'language']);
    expect(result.k).toBe(2);
    expect(result.totalRecords).toBe(5);
  });

  it('should return Infinity for empty dataset', () => {
    const result = calculateKAnonymity([], ['age']);
    expect(result.k).toBe(Infinity);
  });

  it('should return 1 for unique records', () => {
    const records = [
      { age: '20-25', language: 'en' },
      { age: '30-35', language: 'es' },
    ];
    const result = calculateKAnonymity(records, ['age', 'language']);
    expect(result.k).toBe(1);
  });

  it('should handle all identical records', () => {
    const records = Array.from({ length: 15 }, () => ({ age: '30-35', lang: 'en' }));
    const result = calculateKAnonymity(records, ['age', 'lang']);
    expect(result.k).toBe(15);
  });
});

describe('validateKAnonymity', () => {
  it('should pass when all groups meet k threshold', () => {
    const records = Array.from({ length: 20 }, (_, i) => ({
      age: i < 10 ? '30-35' : '35-40',
      lang: 'en',
    }));
    const result = validateKAnonymity(records, ['age', 'lang'], 10);
    expect(result.valid).toBe(true);
    expect(result.kept.length).toBe(20);
    expect(result.suppressed.length).toBe(0);
  });

  it('should suppress groups below k', () => {
    const records = [
      ...Array.from({ length: 12 }, () => ({ age: '30-35', lang: 'en' })),
      ...Array.from({ length: 3 }, () => ({ age: '35-40', lang: 'es' })),
    ];
    const result = validateKAnonymity(records, ['age', 'lang'], 10);
    expect(result.valid).toBe(false);
    expect(result.kept.length).toBe(12);
    expect(result.suppressed.length).toBe(3);
  });

  it('should handle empty dataset', () => {
    const result = validateKAnonymity([], ['age'], 10);
    expect(result.valid).toBe(true);
    expect(result.kept.length).toBe(0);
  });
});

describe('uniquenessTest', () => {
  it('should detect unique records', () => {
    const record = { age: '25-30', lang: 'ja' };
    const existing = [
      { age: '30-35', lang: 'en' },
      { age: '35-40', lang: 'es' },
    ];
    const result = uniquenessTest(record, existing, ['age', 'lang']);
    expect(result.isUnique).toBe(true);
    expect(result.groupSize).toBe(1);
  });

  it('should detect non-unique records', () => {
    const record = { age: '30-35', lang: 'en' };
    const existing = [
      { age: '30-35', lang: 'en' },
      { age: '30-35', lang: 'en' },
    ];
    const result = uniquenessTest(record, existing, ['age', 'lang']);
    expect(result.isUnique).toBe(false);
    expect(result.groupSize).toBe(3);
  });
});
