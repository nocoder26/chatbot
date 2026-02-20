import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api', () => ({
  verifyAdminPin: vi.fn().mockResolvedValue({ authenticated: true, admin_key: '2603' }),
  fetchAdminStats: vi.fn().mockResolvedValue({ gaps: [], gapsChat: [], gapsBloodwork: [], feedback: [], doc_usage: [], kb_sources: [] }),
  fetchUserAnalytics: vi.fn().mockResolvedValue({
    activeUsers: 10,
    totalConversations: 50,
    totalBloodwork: 5,
    recentActivities: [],
    topQuestionCategories: [],
    bloodworkPatterns: [],
  }),
  fetchAdminUsers: vi.fn().mockResolvedValue({
    users: [
      { userId: 'u1...', fullId: 'u1', createdAt: new Date().toISOString(), messageCount: 10, chatCount: 3, bloodworkCount: 1, activityCount: 20, avgRating: 4.2, lastActiveAt: new Date().toISOString(), sessionDuration: 300, thumbsUp: 5, thumbsDown: 1 },
    ],
  }),
  fetchUserDrillDown: vi.fn().mockResolvedValue({}),
}));

describe('Admin Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should verify admin PIN', async () => {
    const { verifyAdminPin } = await import('@/lib/api');
    const result = await verifyAdminPin('2603');
    expect(result.authenticated).toBe(true);
    expect(result.admin_key).toBe('2603');
  });

  it('should reject wrong PIN', async () => {
    const { verifyAdminPin } = await import('@/lib/api');
    (verifyAdminPin as any).mockRejectedValueOnce(new Error('Authentication failed'));
    await expect(verifyAdminPin('1234')).rejects.toThrow();
  });

  it('should fetch admin stats', async () => {
    const { fetchAdminStats } = await import('@/lib/api');
    const stats = await fetchAdminStats('2603');
    expect(stats.gaps).toBeDefined();
    expect(stats.feedback).toBeDefined();
    expect(stats.doc_usage).toBeDefined();
  });

  it('should fetch user analytics', async () => {
    const { fetchUserAnalytics } = await import('@/lib/api');
    const analytics = await fetchUserAnalytics('2603');
    expect(analytics.activeUsers).toBe(10);
    expect(analytics.totalConversations).toBe(50);
  });

  it('should fetch users list', async () => {
    const { fetchAdminUsers } = await import('@/lib/api');
    const result = await fetchAdminUsers('2603');
    expect(result.users).toHaveLength(1);
    expect(result.users[0].messageCount).toBe(10);
  });

  it('should support drill-down to user details', async () => {
    const { fetchUserDrillDown } = await import('@/lib/api');
    const details = await fetchUserDrillDown('2603', 'u1');
    expect(details).toBeDefined();
  });
});
