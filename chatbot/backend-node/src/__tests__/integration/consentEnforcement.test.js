import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestUser, createTestConsent, getAuthToken } from '../helpers/factories.js';

const mockPrisma = {
  consent: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock('../../lib/prisma.js', () => ({ default: mockPrisma }));

describe('Consent Enforcement Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CONSENT_VERSION = '1.0';
  });

  it('should block chat without consent', async () => {
    const { requireConsent } = await import('../../gdpr/consentCheck.js');
    mockPrisma.consent.findFirst.mockResolvedValue(null);

    const user = createTestUser();
    const req = { userId: user.id };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await requireConsent(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should allow chat after consent is granted', async () => {
    const { requireConsent } = await import('../../gdpr/consentCheck.js');
    const user = createTestUser();
    const consent = createTestConsent(user.id);

    mockPrisma.consent.findFirst.mockResolvedValue(consent);

    const req = { userId: user.id };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await requireConsent(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.consentId).toBe(consent.id);
    expect(req.modelTrainingConsent).toBe(true);
  });

  it('should block after consent withdrawal', async () => {
    const { requireConsent } = await import('../../gdpr/consentCheck.js');
    const user = createTestUser();
    const consent = createTestConsent(user.id, { withdrawnAt: new Date() });

    mockPrisma.consent.findFirst.mockResolvedValue(consent);

    const req = { userId: user.id };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await requireConsent(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should allow again after re-granting consent', async () => {
    const { requireConsent } = await import('../../gdpr/consentCheck.js');
    const user = createTestUser();
    const newConsent = createTestConsent(user.id);

    mockPrisma.consent.findFirst.mockResolvedValue(newConsent);

    const req = { userId: user.id };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await requireConsent(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should handle version mismatch', async () => {
    const { requireConsent } = await import('../../gdpr/consentCheck.js');
    const user = createTestUser();
    const outdatedConsent = createTestConsent(user.id, { consentVersion: '0.5' });

    mockPrisma.consent.findFirst.mockResolvedValue(outdatedConsent);

    const req = { userId: user.id };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await requireConsent(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
