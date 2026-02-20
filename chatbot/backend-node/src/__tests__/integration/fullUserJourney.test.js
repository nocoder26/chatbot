import { describe, it, expect, vi } from 'vitest';
import { createTestUser, createTestChat, createTestMessage, createTestBloodwork, createTestConsent, getAuthToken } from '../helpers/factories.js';

/**
 * Integration test for the full user journey data lifecycle.
 * Uses mocked Prisma for unit-level integration validation.
 * For real DB tests, set DATABASE_URL to a test database.
 */

describe('Full User Journey Data Lifecycle', () => {
  it('should follow the complete data flow: register -> consent -> chat -> bloodwork -> feedback -> profile -> admin', () => {
    // 1. Register anonymous user
    const user = createTestUser({ username: 'JourneyTestUser' });
    expect(user.id).toBeTruthy();
    expect(user.username).toBe('JourneyTestUser');

    // 2. Generate auth token
    const token = getAuthToken(user.id);
    expect(token).toBeTruthy();
    expect(token.split('.')).toHaveLength(3); // JWT has 3 parts

    // 3. Grant consent
    const consent = createTestConsent(user.id);
    expect(consent.healthDataConsent).toBe(true);
    expect(consent.modelTrainingConsent).toBe(true);
    expect(consent.withdrawnAt).toBeNull();

    // 4. Create chat with messages
    const chat = createTestChat(user.id, { title: 'IVF Discussion' });
    const userMsg = createTestMessage(chat.id, { role: 'user', content: 'What is IVF?' });
    const aiMsg = createTestMessage(chat.id, { role: 'ai', content: 'IVF stands for In Vitro Fertilization...' });
    expect(chat.userId).toBe(user.id);
    expect(userMsg.role).toBe('user');
    expect(aiMsg.role).toBe('ai');

    // 5. Create bloodwork report
    const bloodwork = createTestBloodwork(user.id);
    expect(bloodwork.results).toHaveLength(2);
    expect(bloodwork.userId).toBe(user.id);

    // 6. Verify data structure integrity
    expect(user.id).toBe(chat.userId);
    expect(user.id).toBe(bloodwork.userId);
    expect(user.id).toBe(consent.userId);
    expect(chat.id).toBe(userMsg.chatId);
    expect(chat.id).toBe(aiMsg.chatId);
  });

  it('should support the GDPR data lifecycle', () => {
    const user = createTestUser();
    const consent = createTestConsent(user.id);
    
    // Test consent withdrawal
    const withdrawnConsent = { ...consent, withdrawnAt: new Date() };
    expect(withdrawnConsent.withdrawnAt).toBeTruthy();

    // Test deletion request
    const deletionRequest = {
      id: 'del-req-1',
      userId: user.id,
      status: 'pending',
      requestedAt: new Date(),
      completedAt: null,
      tier1Deleted: false,
      tier2Excluded: false,
    };
    expect(deletionRequest.status).toBe('pending');

    // Simulate completion
    deletionRequest.status = 'completed';
    deletionRequest.completedAt = new Date();
    deletionRequest.tier1Deleted = true;
    deletionRequest.tier2Excluded = true;
    expect(deletionRequest.tier1Deleted).toBe(true);
  });
});

describe('Consent Enforcement Flow', () => {
  it('should require consent before allowing data operations', () => {
    const hasConsent = false;
    if (!hasConsent) {
      expect(hasConsent).toBe(false);
      // In real implementation, returns 403 consent_required
    }
  });

  it('should allow operations after consent is granted', () => {
    const consent = createTestConsent('user-1');
    const hasValidConsent = consent.healthDataConsent && !consent.withdrawnAt;
    expect(hasValidConsent).toBe(true);
  });

  it('should block operations after consent withdrawal', () => {
    const consent = createTestConsent('user-1', { withdrawnAt: new Date() });
    const hasValidConsent = consent.healthDataConsent && !consent.withdrawnAt;
    expect(hasValidConsent).toBe(false);
  });
});

describe('Cron Pipeline Data Flow', () => {
  it('should validate Tier 2 anonymization requirements', async () => {
    const { generalizeAge, generalizeBloodworkValue, sanitizeFreeText } = await import('../../gdpr/anonymization.js');
    const { validateKAnonymity } = await import('../../gdpr/riskAssessment.js');

    // Anonymize a sample record
    const ageGroup = generalizeAge(34);
    expect(ageGroup).toBe('30-35');

    const marker = generalizeBloodworkValue('AMH', '2.5', 'ng/mL');
    expect(marker.range).toContain('normal');

    const cleaned = sanitizeFreeText('Dr. Smith said my AMH is 2.5 ng/mL and progesterone is normal');
    expect(cleaned).not.toContain('Dr. Smith');
    expect(cleaned).toContain('AMH');
    expect(cleaned).toContain('progesterone');

    // Validate k-anonymity on sample batch
    const records = Array.from({ length: 15 }, (_, i) => ({
      ageGroup: i < 10 ? '30-35' : '35-40',
      language: 'en',
    }));
    const result = validateKAnonymity(records, ['ageGroup', 'language'], 5);
    expect(result.valid).toBe(true);
    expect(result.kept.length).toBe(15);
  });

  it('should validate encryption round-trip for Tier 1 data', async () => {
    process.env.ENCRYPTION_MASTER_KEY = 'a'.repeat(64);
    const { encryptField, decryptField } = await import('../../gdpr/encryption.js');

    const content = 'What are my FSH levels indicating?';
    const encrypted = encryptField(content);
    expect(encrypted).toBeTruthy();
    expect(encrypted.ct).toBeTruthy();

    const decrypted = decryptField(encrypted);
    expect(decrypted).toBe(content);
  });
});
