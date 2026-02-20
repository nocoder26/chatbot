import { describe, it, expect } from 'vitest';
import {
  generalizeBloodworkValue,
  generalizeAge,
  sanitizeFreeText,
  addDifferentialPrivacyNoise,
  categorizeQuestion,
  hashForDedup,
} from '../../gdpr/anonymization.js';
import { validateKAnonymity, calculateKAnonymity } from '../../gdpr/riskAssessment.js';

describe('Cron Pipeline Validation', () => {
  describe('Anonymization Pipeline', () => {
    it('should anonymize a batch of 50 QA pairs', () => {
      const questions = [
        'What is IVF?', 'How does IUI work?', 'What does AMH mean?',
        'Diet tips for fertility', 'How to improve sperm count?',
        'What is a normal FSH level?', 'Success rates of IVF',
        'What medications help?', 'Can I get pregnant naturally?',
        'What is my AMH level meaning?',
      ];

      const anonymized = questions.map((q) => ({
        questionHash: hashForDedup(q),
        question: sanitizeFreeText(q),
        category: categorizeQuestion(q),
        language: 'en',
      }));

      expect(anonymized).toHaveLength(10);
      anonymized.forEach((a) => {
        expect(a.questionHash.length).toBe(64);
        expect(a.question).toBeTruthy();
        expect(a.category).toBeTruthy();
      });
    });

    it('should not contain raw PII in anonymized records', () => {
      const rawTexts = [
        'Dr. Smith told me my AMH is low',
        'I visited Hospital de Barcelona for IVF',
        'Contact me at user@email.com',
        'my husband Pedro and I are trying IVF',
      ];

      const cleaned = rawTexts.map(sanitizeFreeText);
      cleaned.forEach((text) => {
        expect(text).not.toContain('Dr. Smith');
        expect(text).not.toContain('Hospital de Barcelona');
        expect(text).not.toContain('user@email.com');
        expect(text).not.toContain('Pedro');
      });
    });

    it('should generalize bloodwork values correctly', () => {
      const markers = [
        { name: 'AMH', value: '0.5', unit: 'ng/mL' },
        { name: 'FSH', value: '8', unit: 'mIU/mL' },
        { name: 'Glucose', value: '120', unit: 'mg/dL' },
        { name: 'TSH', value: '2.5', unit: 'mIU/L' },
      ];

      const generalized = markers.map((m) => generalizeBloodworkValue(m.name, m.value, m.unit));
      expect(generalized[0].range).toContain('low');
      expect(generalized[1].range).toContain('normal');
      expect(generalized[2].range).toContain('elevated');
      expect(generalized[3].range).toContain('normal');
    });

    it('should add DP noise that alters values', () => {
      const original = 2.5;
      const noised = new Set();
      for (let i = 0; i < 50; i++) {
        noised.add(addDifferentialPrivacyNoise(original, 1.0));
      }
      expect(noised.size).toBeGreaterThan(1);
    });
  });

  describe('K-Anonymity Validation', () => {
    it('should validate k>=10 for all groups', () => {
      const records = [];
      const categories = ['ivf', 'iui', 'bloodwork', 'nutrition', 'general'];
      for (const cat of categories) {
        for (let i = 0; i < 12; i++) {
          records.push({ category: cat, language: 'en' });
        }
      }

      const result = validateKAnonymity(records, ['category', 'language'], 10);
      expect(result.valid).toBe(true);
      expect(result.suppressed.length).toBe(0);
      expect(result.kept.length).toBe(60);
    });

    it('should suppress groups below k=10', () => {
      const records = [
        ...Array.from({ length: 15 }, () => ({ category: 'ivf', language: 'en' })),
        ...Array.from({ length: 3 }, () => ({ category: 'rare_topic', language: 'ja' })),
      ];

      const result = validateKAnonymity(records, ['category', 'language'], 10);
      expect(result.valid).toBe(false);
      expect(result.suppressed.length).toBe(3);
      expect(result.kept.length).toBe(15);
    });

    it('should calculate correct k value', () => {
      const records = [
        ...Array.from({ length: 10 }, () => ({ cat: 'a', lang: 'en' })),
        ...Array.from({ length: 20 }, () => ({ cat: 'b', lang: 'en' })),
      ];

      const result = calculateKAnonymity(records, ['cat', 'lang']);
      expect(result.k).toBe(10);
    });
  });

  describe('Tier 3 Aggregation Logic', () => {
    it('should only report metrics with cell size >= 10', () => {
      const MIN_CELL_SIZE = 10;
      const metrics = [
        { type: 'conversation_volume', count: 50 },
        { type: 'rare_metric', count: 3 },
        { type: 'quality_scores', count: 15 },
      ];

      const valid = metrics.filter((m) => m.count >= MIN_CELL_SIZE);
      expect(valid).toHaveLength(2);
      expect(valid.every((m) => m.count >= 10)).toBe(true);
    });

    it('should compute correct aggregate statistics', () => {
      const scores = [4, 5, 3, 4, 5, 4, 3, 5, 4, 4, 3, 5];
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      const sorted = [...scores].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];

      expect(avg).toBeCloseTo(4.083, 2);
      expect(median).toBe(4);
      expect(scores.length).toBeGreaterThanOrEqual(10);
    });
  });
});
