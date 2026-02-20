import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { verifyJWT } from '../middleware/auth.js';
import { logAuditEvent } from '../gdpr/auditLogger.js';

const router = Router();

const CONSENT_VERSION = process.env.CONSENT_VERSION || '1.0';

/**
 * POST /api/consent  -- Record user consent
 */
router.post('/', verifyJWT, async (req, res) => {
  try {
    const { healthDataConsent, modelTrainingConsent } = req.body;

    if (typeof healthDataConsent !== 'boolean' || typeof modelTrainingConsent !== 'boolean') {
      return res.status(400).json({ error: 'Both healthDataConsent and modelTrainingConsent are required (boolean)' });
    }

    const consent = await prisma.consent.create({
      data: {
        userId: req.userId,
        consentVersion: CONSENT_VERSION,
        healthDataConsent,
        modelTrainingConsent,
      },
    });

    logAuditEvent({ action: 'consent_granted', tier: 'tier1', actorType: 'user', actorId: req.userId, targetId: consent.id, details: { version: CONSENT_VERSION, healthDataConsent, modelTrainingConsent } });
    res.json({ success: true, consentId: consent.id, version: CONSENT_VERSION });
  } catch (err) {
    console.error('Consent creation error:', err);
    res.status(500).json({ error: 'Failed to record consent' });
  }
});

/**
 * GET /api/consent/status  -- Check if current user has valid consent
 */
router.get('/status', verifyJWT, async (req, res) => {
  try {
    const latest = await prisma.consent.findFirst({
      where: { userId: req.userId },
      orderBy: { grantedAt: 'desc' },
    });

    if (!latest) {
      return res.json({ hasConsent: false, reason: 'no_consent_record' });
    }

    if (latest.withdrawnAt) {
      return res.json({ hasConsent: false, reason: 'consent_withdrawn', withdrawnAt: latest.withdrawnAt });
    }

    if (latest.consentVersion !== CONSENT_VERSION) {
      return res.json({ hasConsent: false, reason: 'version_outdated', currentVersion: CONSENT_VERSION, userVersion: latest.consentVersion });
    }

    res.json({
      hasConsent: true,
      consentId: latest.id,
      version: latest.consentVersion,
      healthDataConsent: latest.healthDataConsent,
      modelTrainingConsent: latest.modelTrainingConsent,
      grantedAt: latest.grantedAt,
    });
  } catch (err) {
    console.error('Consent status error:', err);
    res.status(500).json({ error: 'Failed to check consent status' });
  }
});

/**
 * POST /api/consent/withdraw  -- Withdraw consent
 */
router.post('/withdraw', verifyJWT, async (req, res) => {
  try {
    const latest = await prisma.consent.findFirst({
      where: { userId: req.userId, withdrawnAt: null },
      orderBy: { grantedAt: 'desc' },
    });

    if (!latest) {
      return res.status(404).json({ error: 'No active consent found' });
    }

    await prisma.consent.update({
      where: { id: latest.id },
      data: { withdrawnAt: new Date() },
    });

    logAuditEvent({ action: 'consent_withdrawn', tier: 'tier1', actorType: 'user', actorId: req.userId, targetId: latest.id });
    res.json({ success: true, message: 'Consent withdrawn successfully' });
  } catch (err) {
    console.error('Consent withdrawal error:', err);
    res.status(500).json({ error: 'Failed to withdraw consent' });
  }
});

export default router;
