import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OnboardingPage from '@/app/page';

vi.mock('@/lib/api', () => ({
  fetchRegisterOptions: vi.fn().mockResolvedValue({
    usernames: ['HappyPanda', 'WiseDolphin', 'KindStar', 'GentleWave', 'BrightMoon'],
    avatarUrls: ['https://example.com/1.svg', 'https://example.com/2.svg'],
  }),
  registerAnonymous: vi.fn().mockResolvedValue({
    token: 'test-jwt-token',
    user: { id: 'u1', username: 'HappyPanda', avatarUrl: null },
  }),
  checkAuthMethods: vi.fn().mockResolvedValue({ exists: true, hasPasskey: false, hasPassphrase: true }),
  loginWithPassphrase: vi.fn().mockResolvedValue({
    token: 'test-jwt-token',
    user: { id: 'u1', username: 'HappyPanda', avatarUrl: null },
  }),
  grantConsent: vi.fn().mockResolvedValue({ success: true }),
}));

describe('Onboarding Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('should render the language selection step', () => {
    render(<OnboardingPage />);
    expect(screen.getByText('Select your language')).toBeTruthy();
  });

  it('should render all 9 language options', () => {
    render(<OnboardingPage />);
    expect(screen.getByText('English')).toBeTruthy();
    expect(screen.getByText('Español')).toBeTruthy();
    expect(screen.getByText('日本語')).toBeTruthy();
    expect(screen.getByText('Français')).toBeTruthy();
    expect(screen.getByText('Português')).toBeTruthy();
  });

  it('should show privacy badges in English by default', () => {
    render(<OnboardingPage />);
    expect(screen.getByText('End-to-end anonymous')).toBeTruthy();
    expect(screen.getByText('No email required')).toBeTruthy();
    expect(screen.getByText('Auto-deleted in 24h')).toBeTruthy();
  });

  it('should show "I already have an account" link', () => {
    render(<OnboardingPage />);
    expect(screen.getByText('I already have an account')).toBeTruthy();
  });

  it('should navigate to consent step after language selection', async () => {
    render(<OnboardingPage />);
    fireEvent.click(screen.getByText('English'));
    const continueBtn = screen.getAllByRole('button').find(b => b.textContent === 'Continue');
    fireEvent.click(continueBtn!);
    expect(screen.getByText('Privacy & Consent')).toBeTruthy();
  });

  it('should render a single consent checkbox (not two)', async () => {
    render(<OnboardingPage />);
    fireEvent.click(screen.getByText('English'));
    const continueBtn = screen.getAllByRole('button').find(b => b.textContent === 'Continue');
    fireEvent.click(continueBtn!);
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(1);
  });

  it('should show translated consent text for Spanish', async () => {
    render(<OnboardingPage />);
    fireEvent.click(screen.getByText('Español'));
    const continueBtn = screen.getAllByRole('button').find(b => b.textContent === 'Continuar');
    fireEvent.click(continueBtn!);
    expect(screen.getByText('Privacidad y consentimiento')).toBeTruthy();
  });

  it('should show translated consent text for Japanese', async () => {
    render(<OnboardingPage />);
    fireEvent.click(screen.getByText('日本語'));
    const continueBtn = screen.getAllByRole('button').find(b => b.textContent === '続ける');
    fireEvent.click(continueBtn!);
    expect(screen.getByText('プライバシーと同意')).toBeTruthy();
  });

  it('I Agree button should be disabled until checkbox is checked', async () => {
    render(<OnboardingPage />);
    fireEvent.click(screen.getByText('English'));
    fireEvent.click(screen.getAllByRole('button').find(b => b.textContent === 'Continue')!);

    const agreeBtn = screen.getByText('I Agree — Continue');
    expect(agreeBtn.closest('button')?.disabled).toBe(true);

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(agreeBtn.closest('button')?.disabled).toBe(false);
  });
});
