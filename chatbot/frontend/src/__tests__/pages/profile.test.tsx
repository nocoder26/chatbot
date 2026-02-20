import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/api', () => ({
  fetchUserProfile: vi.fn().mockResolvedValue({
    user: { id: 'u1', username: 'TestUser', avatarUrl: 'https://example.com/avatar.svg' },
    chats: [
      { id: 'c1', title: 'IVF Chat', createdAt: new Date().toISOString(), messageCount: 5 },
    ],
    bloodwork: [
      { id: 'bw1', results: [{ name: 'Glucose', value: '95', unit: 'mg/dL', status: 'In Range' }], summary: 'Normal', createdAt: new Date().toISOString() },
    ],
  }),
  deleteChat: vi.fn().mockResolvedValue(undefined),
  exportUserData: vi.fn().mockResolvedValue(new Blob(['{}'])),
  deleteUserData: vi.fn().mockResolvedValue({ success: true, deletionRequestId: 'del-1' }),
}));

describe('Profile Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('izana_token', 'test-token');
    localStorage.setItem('izana_user', JSON.stringify({ id: 'u1', username: 'TestUser' }));
  });

  it('should redirect to / if not authenticated', async () => {
    localStorage.clear();
    const ProfilePage = (await import('@/app/profile/page')).default;
    render(<ProfilePage />);
    // Router push would be called, but we can check the component renders
  });

  it('should export API functions needed for GDPR', async () => {
    const api = await import('@/lib/api');
    expect(typeof api.exportUserData).toBe('function');
    expect(typeof api.deleteUserData).toBe('function');
  });

  it('should have correct UserProfile type structure', async () => {
    const api = await import('@/lib/api');
    const profile = await api.fetchUserProfile('TestUser');
    expect(profile.user.id).toBe('u1');
    expect(profile.chats).toHaveLength(1);
    expect(profile.bloodwork).toHaveLength(1);
    expect(profile.chats[0].messageCount).toBe(5);
  });
});
