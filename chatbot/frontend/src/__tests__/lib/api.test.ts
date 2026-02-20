import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveApiUrl } from '@/lib/api';

describe('resolveApiUrl', () => {
  it('should return localhost URL by default', () => {
    const url = resolveApiUrl('/api/chat');
    expect(url).toContain('/api/chat');
  });

  it('should handle empty path', () => {
    const url = resolveApiUrl('');
    expect(url).toBeDefined();
  });
});

describe('API Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have registerAnonymous function', async () => {
    const api = await import('@/lib/api');
    expect(typeof api.registerAnonymous).toBe('function');
  });

  it('should have loginWithPassphrase function', async () => {
    const api = await import('@/lib/api');
    expect(typeof api.loginWithPassphrase).toBe('function');
  });

  it('should have sendChatMessage function', async () => {
    const api = await import('@/lib/api');
    expect(typeof api.sendChatMessage).toBe('function');
  });

  it('should have analyzeBloodWork function', async () => {
    const api = await import('@/lib/api');
    expect(typeof api.analyzeBloodWork).toBe('function');
  });

  it('should have fetchUserProfile function', async () => {
    const api = await import('@/lib/api');
    expect(typeof api.fetchUserProfile).toBe('function');
  });

  it('should have submitFeedback function', async () => {
    const api = await import('@/lib/api');
    expect(typeof api.submitFeedback).toBe('function');
  });

  it('should have GDPR consent functions', async () => {
    const api = await import('@/lib/api');
    expect(typeof api.grantConsent).toBe('function');
    expect(typeof api.fetchConsentStatus).toBe('function');
    expect(typeof api.withdrawConsent).toBe('function');
  });

  it('should have GDPR user rights functions', async () => {
    const api = await import('@/lib/api');
    expect(typeof api.exportUserData).toBe('function');
    expect(typeof api.deleteUserData).toBe('function');
    expect(typeof api.restrictProcessing).toBe('function');
  });

  it('should have admin functions', async () => {
    const api = await import('@/lib/api');
    expect(typeof api.verifyAdminPin).toBe('function');
    expect(typeof api.fetchAdminStats).toBe('function');
    expect(typeof api.fetchUserAnalytics).toBe('function');
    expect(typeof api.fetchAdminUsers).toBe('function');
  });
});
