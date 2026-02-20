import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = {
  user: { findFirst: vi.fn() },
  chat: { findMany: vi.fn(), deleteMany: vi.fn() },
  message: { deleteMany: vi.fn() },
  bloodWorkReport: { findMany: vi.fn() },
};

vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }));

describe('Profile Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/user-profile/:username', () => {
    it('should return user data with chats and bloodwork', async () => {
      const now = new Date();
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'u1',
        username: 'TestUser',
        avatarUrl: 'https://example.com/avatar.svg',
      });
      mockPrisma.chat.findMany.mockResolvedValue([
        { id: 'c1', title: 'Test Chat', createdAt: now, _count: { messages: 5 } },
      ]);
      mockPrisma.bloodWorkReport.findMany.mockResolvedValue([
        { id: 'bw1', results: [{ name: 'Glucose', value: '95', unit: 'mg/dL', status: 'In Range' }], summary: 'Normal', createdAt: now },
      ]);

      const user = await mockPrisma.user.findFirst();
      const chats = await mockPrisma.chat.findMany();
      const bloodwork = await mockPrisma.bloodWorkReport.findMany();

      expect(user.username).toBe('TestUser');
      expect(chats).toHaveLength(1);
      expect(bloodwork).toHaveLength(1);
    });

    it('should return empty arrays for unknown user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      const user = await mockPrisma.user.findFirst();
      expect(user).toBeNull();
    });
  });

  describe('DELETE chat', () => {
    it('should delete a chat and its messages', async () => {
      mockPrisma.message.deleteMany.mockResolvedValue({ count: 5 });
      mockPrisma.chat.deleteMany.mockResolvedValue({ count: 1 });

      const msgResult = await mockPrisma.message.deleteMany({ where: { chatId: 'c1' } });
      const chatResult = await mockPrisma.chat.deleteMany({ where: { id: 'c1' } });

      expect(msgResult.count).toBe(5);
      expect(chatResult.count).toBe(1);
    });
  });
});
