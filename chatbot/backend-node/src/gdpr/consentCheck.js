import prisma from '../lib/prisma.js';

const CONSENT_VERSION = process.env.CONSENT_VERSION || '1.0';

/**
 * Middleware that verifies the user has granted valid, non-withdrawn consent
 * before allowing data-collecting operations.
 * Must be applied AFTER verifyJWT (needs req.userId).
 */
export function requireConsent(req, res, next) {
  prisma.consent.findFirst({
    where: { userId: req.userId },
    orderBy: { grantedAt: 'desc' },
  }).then((latest) => {
    if (!latest || latest.withdrawnAt || latest.consentVersion !== CONSENT_VERSION || !latest.healthDataConsent) {
      return res.status(403).json({
        error: 'consent_required',
        message: 'Valid consent is required before using this service.',
        currentVersion: CONSENT_VERSION,
      });
    }
    req.consentId = latest.id;
    req.modelTrainingConsent = latest.modelTrainingConsent;
    next();
  }).catch((err) => {
    console.error('Consent check error:', err);
    res.status(500).json({ error: 'Failed to verify consent' });
  });
}
