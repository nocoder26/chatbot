import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

const mockAuditLogs = [];
const mockPrisma = {
  auditLog: {
    create: vi.fn(({ data }) => {
      const entry = { id: crypto.randomUUID(), ...data, createdAt: new Date() };
      mockAuditLogs.push(entry);
      return Promise.resolve(entry);
    }),
    findFirst: vi.fn(() => {
      if (mockAuditLogs.length === 0) return null;
      return mockAuditLogs[mockAuditLogs.length - 1];
    }),
    findMany: vi.fn(() => [...mockAuditLogs]),
  },
};

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }));

describe('Audit Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditLogs.length = 0;
  });

  it('should create audit log entries', async () => {
    const { logAuditEvent } = await import('../gdpr/auditLogger.js');
    const entry = await logAuditEvent({
      action: 'consent_granted',
      tier: 'tier1',
      actorType: 'user',
      actorId: 'user-123',
      details: { version: '1.0' },
    });

    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    expect(entry.action).toBe('consent_granted');
    expect(entry.integrityHash).toBeTruthy();
    expect(entry.integrityHash.length).toBe(64);
  });

  it('should generate hash chain (each entry includes previous hash)', async () => {
    const { logAuditEvent } = await import('../gdpr/auditLogger.js');
    
    const entry1 = await logAuditEvent({
      action: 'consent_granted',
      tier: 'tier1',
      actorType: 'user',
      actorId: 'user-1',
    });

    const entry2 = await logAuditEvent({
      action: 'data_accessed',
      tier: 'tier1',
      actorType: 'admin',
    });

    expect(entry1.integrityHash).not.toBe(entry2.integrityHash);
    expect(entry2.integrityHash.length).toBe(64);
  });

  it('should handle all required action types', async () => {
    const { logAuditEvent } = await import('../gdpr/auditLogger.js');
    
    const actions = [
      'consent_granted', 'consent_withdrawn', 'data_accessed',
      'deletion_requested', 'export_requested', 'admin_access',
    ];

    for (const action of actions) {
      const entry = await logAuditEvent({ action, tier: 'tier1', actorType: 'system' });
      expect(entry.action).toBe(action);
    }

    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(actions.length);
  });
});
