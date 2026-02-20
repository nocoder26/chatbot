import { describe, it, expect } from 'vitest';
import { sanitizeInput, detectPII, hashUserId } from '../gdpr/sanitizer.js';

describe('sanitizeInput', () => {
  it('should strip email addresses', () => {
    const result = sanitizeInput('Send results to patient@hospital.com');
    expect(result).not.toContain('patient@hospital.com');
    expect(result).toContain('[REDACTED]');
  });

  it('should strip doctor names', () => {
    expect(sanitizeInput('Dr. Martinez recommended tests')).not.toContain('Dr. Martinez');
    expect(sanitizeInput('Doctor Johnson prescribed medication')).not.toContain('Doctor Johnson');
    expect(sanitizeInput('Prof. Garcia from the clinic')).not.toContain('Prof. Garcia');
  });

  it('should strip clinic and hospital names', () => {
    expect(sanitizeInput('I went to Hospital de Barcelona')).not.toContain('Hospital de Barcelona');
    expect(sanitizeInput('Tests done at Clinic Mayo')).not.toContain('Clinic Mayo');
  });

  it('should strip partner references', () => {
    expect(sanitizeInput('my husband Pedro was also tested')).not.toContain('Pedro');
    expect(sanitizeInput('my wife Sarah has similar results')).not.toContain('Sarah');
  });

  it('should preserve medical terminology', () => {
    const text = 'AMH 2.5 ng/mL, follicular phase, progesterone, FSH elevated';
    const result = sanitizeInput(text);
    expect(result).toContain('AMH');
    expect(result).toContain('progesterone');
    expect(result).toContain('FSH');
  });

  it('should handle null and empty input', () => {
    expect(sanitizeInput(null)).toBe('');
    expect(sanitizeInput('')).toBe('');
    expect(sanitizeInput(undefined)).toBe('');
  });

  it('should handle multilingual text', () => {
    const result = sanitizeInput('Clínica de Fertilidad Barcelona me dio estos resultados');
    expect(result).toContain('[REDACTED]');
  });
});

describe('detectPII', () => {
  it('should detect emails', () => {
    expect(detectPII('john@example.com')).toContain('email');
  });

  it('should detect doctor names', () => {
    expect(detectPII('Dr. Smith prescribed it')).toContain('doctor_name');
  });

  it('should return empty for clean text', () => {
    expect(detectPII('AMH level is 2.5')).toHaveLength(0);
  });
});

describe('hashUserId', () => {
  it('should produce consistent hashes', () => {
    const hash1 = hashUserId('user-123', 'salt');
    const hash2 = hashUserId('user-123', 'salt');
    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different users', () => {
    const hash1 = hashUserId('user-1', 'salt');
    const hash2 = hashUserId('user-2', 'salt');
    expect(hash1).not.toBe(hash2);
  });

  it('should produce 32-char hex strings', () => {
    const hash = hashUserId('test-user', 'salt');
    expect(hash.length).toBe(32);
    expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
  });
});
