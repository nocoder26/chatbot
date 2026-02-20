import { describe, it, expect } from 'vitest';
import { encryptField, decryptField, generateDEK, rotateEnvelopes, isEncryptionEnabled } from '../gdpr/encryption.js';

const TEST_MASTER_KEY = 'a'.repeat(64);

describe('Encryption Module', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
  });

  afterAll(() => {
    delete process.env.ENCRYPTION_MASTER_KEY;
  });

  it('should encrypt and decrypt a string round-trip', () => {
    const plaintext = 'Hello, this is a secret message!';
    const envelope = encryptField(plaintext);
    expect(envelope).toBeTruthy();
    expect(envelope.v).toBe(1);
    expect(envelope.ct).toBeTruthy();

    const decrypted = decryptField(envelope);
    expect(decrypted).toBe(plaintext);
  });

  it('should handle JSON objects via string serialization', () => {
    const data = JSON.stringify({ name: 'AMH', value: 0.8, unit: 'ng/mL' });
    const envelope = encryptField(data);
    const decrypted = decryptField(envelope);
    expect(JSON.parse(decrypted)).toEqual(JSON.parse(data));
  });

  it('should handle empty strings', () => {
    const envelope = encryptField('');
    const decrypted = decryptField(envelope);
    expect(decrypted).toBe('');
  });

  it('should handle unicode text', () => {
    const text = '日本語テスト 🌸 données médicales';
    const envelope = encryptField(text);
    const decrypted = decryptField(envelope);
    expect(decrypted).toBe(text);
  });

  it('should produce different ciphertext each time (random IV)', () => {
    const plaintext = 'Same message twice';
    const env1 = encryptField(plaintext);
    const env2 = encryptField(plaintext);
    expect(env1.ct).not.toBe(env2.ct);
    expect(env1.iv).not.toBe(env2.iv);
  });

  it('should generate unique DEKs', () => {
    const dek1 = generateDEK();
    const dek2 = generateDEK();
    expect(dek1.toString('hex')).not.toBe(dek2.toString('hex'));
    expect(dek1.length).toBe(32);
  });

  it('should detect tampered ciphertext', () => {
    const envelope = encryptField('secure data');
    const tampered = { ...envelope, ct: 'AAAAAA' + envelope.ct.slice(6) };
    expect(() => decryptField(tampered)).toThrow();
  });

  it('should return null for null/invalid envelope', () => {
    expect(decryptField(null)).toBeNull();
    expect(decryptField({ v: 2 })).toBeNull();
  });

  it('should rotate envelopes with new master key', () => {
    const plaintext = 'data to rotate';
    const envelope = encryptField(plaintext);

    const newKey = 'b'.repeat(64);
    const rotated = rotateEnvelopes([envelope], TEST_MASTER_KEY, newKey);
    expect(rotated).toHaveLength(1);
    expect(rotated[0].ct).toBe(envelope.ct); // data unchanged
    expect(rotated[0].ek).not.toBe(envelope.ek); // DEK re-encrypted

    process.env.ENCRYPTION_MASTER_KEY = newKey;
    const decrypted = decryptField(rotated[0]);
    expect(decrypted).toBe(plaintext);
    process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
  });

  it('should report encryption as enabled', () => {
    expect(isEncryptionEnabled()).toBe(true);
  });

  it('should return null when encryption is disabled', () => {
    const savedKey = process.env.ENCRYPTION_MASTER_KEY;
    delete process.env.ENCRYPTION_MASTER_KEY;
    expect(encryptField('test')).toBeNull();
    expect(isEncryptionEnabled()).toBe(false);
    process.env.ENCRYPTION_MASTER_KEY = savedKey;
  });
});
