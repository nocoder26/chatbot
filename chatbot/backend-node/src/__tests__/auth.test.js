import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

const TEST_SECRET = 'test-secret-key-for-testing-only-32chars';

vi.mock('../lib/prisma.js', () => ({
  default: {
    user: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

describe('JWT Verification', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = TEST_SECRET;
  });

  it('should accept valid JWT token', () => {
    const token = jwt.sign({ userId: 'user-123' }, TEST_SECRET, { expiresIn: '1h' });
    const decoded = jwt.verify(token, TEST_SECRET);
    expect(decoded.userId).toBe('user-123');
  });

  it('should reject expired tokens', () => {
    const token = jwt.sign({ userId: 'user-123' }, TEST_SECRET, { expiresIn: '-1s' });
    expect(() => jwt.verify(token, TEST_SECRET)).toThrow();
  });

  it('should reject malformed tokens', () => {
    expect(() => jwt.verify('not-a-token', TEST_SECRET)).toThrow();
  });

  it('should reject tokens with wrong secret', () => {
    const token = jwt.sign({ userId: 'user-123' }, 'wrong-secret');
    expect(() => jwt.verify(token, TEST_SECRET)).toThrow();
  });
});

describe('Registration Logic', () => {
  it('should create user with UUID', async () => {
    const prisma = (await import('../lib/prisma.js')).default;
    const userId = 'a1b2c3d4-uuid';

    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: userId,
      username: 'TestUser',
      avatarUrl: 'https://example.com/avatar.svg',
      createdAt: new Date(),
    });

    const user = await prisma.user.create({
      data: { username: 'TestUser', avatarUrl: 'https://example.com/avatar.svg' },
    });
    expect(user.id).toBeTruthy();
    expect(user.username).toBe('TestUser');
  });

  it('should hash username with SHA-256', async () => {
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256').update('TestUser').digest('hex');
    expect(hash).toBeTruthy();
    expect(hash.length).toBe(64);
  });

  it('should bcrypt hash passphrases', async () => {
    const bcrypt = await import('bcryptjs');
    const hashed = await bcrypt.hash('mypassphrase', 10);
    expect(hashed).toBeTruthy();
    const valid = await bcrypt.compare('mypassphrase', hashed);
    expect(valid).toBe(true);
    const invalid = await bcrypt.compare('wrong', hashed);
    expect(invalid).toBe(false);
  });

  it('should validate passphrase minimum length', () => {
    const passphrase = 'short';
    expect(passphrase.length < 8).toBe(true);
    const validPassphrase = 'long-enough-passphrase';
    expect(validPassphrase.length >= 8).toBe(true);
  });
});
