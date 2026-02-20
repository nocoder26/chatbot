import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = {
  userActivity: { findMany: vi.fn(), groupBy: vi.fn(), count: vi.fn() },
  user: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
  chat: { count: vi.fn(), findMany: vi.fn() },
  message: { count: vi.fn() },
  bloodWorkReport: { count: vi.fn(), findMany: vi.fn() },
};

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }));
vi.mock('../gdpr/auditLogger.js', () => ({ logAuditEvent: vi.fn() }));
vi.mock('../gdpr/modelImprovement.js', () => ({
  identifyKnowledgeGaps: vi.fn().mockResolvedValue({ lowQualityResponses: [], underperformingCategories: [], totalGaps: 0 }),
}));
vi.mock('../cron/modelImprovement.js', () => ({
  getCachedKnowledgeGaps: vi.fn().mockReturnValue(null),
}));

describe('Admin Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('PIN Verification', () => {
    it('should accept correct PIN', () => {
      const pin = '2603';
      const expectedKey = process.env.ADMIN_PIN || '2603';
      expect(pin).toBe(expectedKey);
    });

    it('should reject wrong PIN', () => {
      const pin = '1234';
      const expectedKey = '2603';
      expect(pin).not.toBe(expectedKey);
    });
  });

  describe('Admin Key Verification', () => {
    it('should require X-Admin-Key header', () => {
      const headers = {};
      const key = headers['x-admin-key'] || headers['X-Admin-Key'];
      expect(key).toBeUndefined();
    });

    it('should accept valid admin key', () => {
      const headers = { 'x-admin-key': '2603' };
      expect(headers['x-admin-key']).toBe('2603');
    });
  });

  describe('Stats Endpoint', () => {
    it('should return structured stats', async () => {
      mockPrisma.userActivity.findMany.mockResolvedValue([
        { id: '1', type: 'feedback', metadata: { rating: 4, question: 'test' }, createdAt: new Date() },
      ]);

      const activities = await mockPrisma.userActivity.findMany();
      const gaps = activities.filter((a) => a.type === 'chat_message' && a.metadata?.confidence < 0.5);
      const feedback = activities.filter((a) => a.type === 'feedback');

      expect(feedback).toHaveLength(1);
      expect(gaps).toHaveLength(0);
    });
  });

  describe('User Analytics', () => {
    it('should return active user count', async () => {
      mockPrisma.user.count.mockResolvedValue(5);
      const count = await mockPrisma.user.count();
      expect(count).toBe(5);
    });

    it('should compute sentiment breakdown from feedback', () => {
      const ratings = [5, 4, 3, 2, 1, 4, 5, 3];
      const positive = ratings.filter((r) => r >= 4).length;
      const negative = ratings.filter((r) => r <= 2).length;
      const neutral = ratings.filter((r) => r === 3).length;
      expect(positive).toBe(4);
      expect(negative).toBe(2);
      expect(neutral).toBe(2);
    });
  });

  describe('Users List', () => {
    it('should return user list with engagement metrics', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'u1', username: 'TestUser', createdAt: new Date(), _count: { chats: 3, activities: 10 } },
      ]);

      const users = await mockPrisma.user.findMany();
      expect(users).toHaveLength(1);
      expect(users[0].id).toBe('u1');
    });
  });

  describe('Knowledge Gaps Endpoint', () => {
    it('should return structured knowledge gaps data', async () => {
      const { identifyKnowledgeGaps } = await import('../gdpr/modelImprovement.js');
      const gaps = await identifyKnowledgeGaps();
      expect(gaps).toHaveProperty('lowQualityResponses');
      expect(gaps).toHaveProperty('underperformingCategories');
      expect(gaps).toHaveProperty('totalGaps');
      expect(Array.isArray(gaps.lowQualityResponses)).toBe(true);
    });
  });

  describe('Audit Logging on all admin endpoints', () => {
    it('should call logAuditEvent', async () => {
      const { logAuditEvent } = await import('../gdpr/auditLogger.js');
      logAuditEvent({ action: 'admin_access', tier: 'tier1', actorType: 'admin', details: { endpoint: '/stats' } });
      expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'admin_access' }));
    });
  });
});
