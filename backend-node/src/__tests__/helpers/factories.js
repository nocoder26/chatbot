import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-testing-only-32chars';

export function createTestUser(overrides = {}) {
  return {
    id: randomUUID(),
    username: `TestUser_${Math.random().toString(36).slice(2, 8)}`,
    usernameHash: null,
    passphraseHash: null,
    avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=test',
    createdAt: new Date(),
    ...overrides,
  };
}

export function createTestChat(userId, overrides = {}) {
  return {
    id: randomUUID(),
    userId,
    title: 'Test Chat',
    createdAt: new Date(),
    ...overrides,
  };
}

export function createTestMessage(chatId, overrides = {}) {
  return {
    id: randomUUID(),
    chatId,
    role: 'user',
    content: 'Test message content',
    encryptedData: null,
    encryptionMeta: null,
    createdAt: new Date(),
    ...overrides,
  };
}

export function createTestBloodwork(userId, overrides = {}) {
  return {
    id: randomUUID(),
    userId,
    results: [
      { name: 'Glucose', value: '95', unit: 'mg/dL', status: 'In Range' },
      { name: 'Hemoglobin', value: '14.2', unit: 'g/dL', status: 'In Range' },
    ],
    summary: 'Blood work results are within normal ranges.',
    encryptedData: null,
    encryptionMeta: null,
    createdAt: new Date(),
    ...overrides,
  };
}

export function createTestConsent(userId, overrides = {}) {
  return {
    id: randomUUID(),
    userId,
    consentVersion: '1.0',
    healthDataConsent: true,
    modelTrainingConsent: true,
    grantedAt: new Date(),
    withdrawnAt: null,
    ...overrides,
  };
}

export function getAuthToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' });
}
