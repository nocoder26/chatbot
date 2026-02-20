import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = {
  consent: {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }));
vi.mock('../gdpr/auditLogger.js', () => ({ logAuditEvent: vi.fn() }));

describe('Consent Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CONSENT_VERSION = '1.0';
  });

  it('should block requests without consent', async () => {
    const { requireConsent } = await import('../gdpr/consentCheck.js');
    mockPrisma.consent.findFirst.mockResolvedValue(null);

    const req = { userId: 'test-user' };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await requireConsent(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'consent_required' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('should allow requests with valid consent', async () => {
    const { requireConsent } = await import('../gdpr/consentCheck.js');
    mockPrisma.consent.findFirst.mockResolvedValue({
      id: 'consent-1',
      userId: 'test-user',
      consentVersion: '1.0',
      healthDataConsent: true,
      modelTrainingConsent: true,
      withdrawnAt: null,
    });

    const req = { userId: 'test-user' };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await requireConsent(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.consentId).toBe('consent-1');
  });

  it('should block after consent withdrawal', async () => {
    const { requireConsent } = await import('../gdpr/consentCheck.js');
    mockPrisma.consent.findFirst.mockResolvedValue({
      id: 'consent-1',
      consentVersion: '1.0',
      healthDataConsent: true,
      withdrawnAt: new Date(),
    });

    const req = { userId: 'test-user' };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await requireConsent(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should block outdated consent versions', async () => {
    const { requireConsent } = await import('../gdpr/consentCheck.js');
    mockPrisma.consent.findFirst.mockResolvedValue({
      id: 'consent-1',
      consentVersion: '0.9',
      healthDataConsent: true,
      withdrawnAt: null,
    });

    const req = { userId: 'test-user' };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await requireConsent(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
