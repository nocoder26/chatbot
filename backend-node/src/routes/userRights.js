import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { verifyJWT } from '../middleware/auth.js';
import { decryptField, isEncryptionEnabled } from '../gdpr/encryption.js';
import { logAuditEvent } from '../gdpr/auditLogger.js';

const router = Router();

/**
 * GET /api/gdpr/export -- Right to Access (Art. 15)
 * Export all Tier 1 data for the authenticated user.
 */
router.get('/export', verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        chats: {
          include: { messages: { orderBy: { createdAt: 'asc' } } },
        },
        bloodWorkReports: true,
        activities: { orderBy: { createdAt: 'desc' } },
        consents: { orderBy: { grantedAt: 'desc' } },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Decrypt messages if encryption is enabled
    const decryptedChats = user.chats.map((chat) => ({
      ...chat,
      messages: chat.messages.map((msg) => {
        if (isEncryptionEnabled() && msg.encryptedData) {
          try {
            const decrypted = decryptField(JSON.parse(msg.encryptedData));
            return { ...msg, content: decrypted || msg.content, encryptedData: undefined, encryptionMeta: undefined };
          } catch (_) { /* fallback to plaintext */ }
        }
        return { ...msg, encryptedData: undefined, encryptionMeta: undefined };
      }),
    }));

    const decryptedBloodwork = user.bloodWorkReports.map((report) => {
      if (isEncryptionEnabled() && report.encryptedData) {
        try {
          const parsed = JSON.parse(report.encryptedData);
          const decryptedResults = parsed.results ? JSON.parse(decryptField(parsed.results)) : report.results;
          const decryptedSummary = parsed.summary ? decryptField(parsed.summary) : report.summary;
          return { ...report, results: decryptedResults, summary: decryptedSummary, encryptedData: undefined, encryptionMeta: undefined };
        } catch (_) { /* fallback */ }
      }
      return { ...report, encryptedData: undefined, encryptionMeta: undefined };
    });

    const exportData = {
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
      },
      consents: user.consents,
      chats: decryptedChats,
      bloodWorkReports: decryptedBloodwork,
      activities: user.activities,
    };

    logAuditEvent({ action: 'export_requested', tier: 'tier1', actorType: 'user', actorId: userId, details: { chatCount: user.chats.length, reportCount: user.bloodWorkReports.length } });
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="izana-data-export-${userId.slice(0, 8)}.json"`);
    res.json(exportData);
  } catch (err) {
    console.error('GDPR export error:', err);
    res.status(500).json({ error: 'Export failed' });
  }
});

/**
 * POST /api/gdpr/delete -- Right to Erasure (Art. 17)
 * Cascade delete all Tier 1 data and create processing restriction.
 */
router.post('/delete', verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;

    const deletionRequest = await prisma.deletionRequest.create({
      data: { userId, status: 'processing' },
    });

    // Cascade delete all user data (FK cascade handles child records)
    await prisma.message.deleteMany({ where: { chat: { userId } } });
    await prisma.chat.deleteMany({ where: { userId } });
    await prisma.bloodWorkReport.deleteMany({ where: { userId } });
    await prisma.userActivity.deleteMany({ where: { userId } });
    await prisma.consent.deleteMany({ where: { userId } });
    await prisma.webAuthnCredential.deleteMany({ where: { userId } });

    // Create processing restriction to prevent future Tier 2 extraction
    await prisma.processingRestriction.upsert({
      where: { userId },
      update: { restrictTier2: true, restrictedAt: new Date() },
      create: { userId, restrictTier2: true },
    });

    await prisma.user.delete({ where: { id: userId } }).catch(() => {});

    await prisma.deletionRequest.update({
      where: { id: deletionRequest.id },
      data: { status: 'completed', completedAt: new Date(), tier1Deleted: true, tier2Excluded: true },
    });

    logAuditEvent({ action: 'deletion_completed', tier: 'tier1', actorType: 'user', actorId: userId, targetId: deletionRequest.id });
    res.json({
      success: true,
      deletionRequestId: deletionRequest.id,
      message: 'All your data has been deleted. Your anonymised training data will be excluded from future processing.',
    });
  } catch (err) {
    console.error('GDPR deletion error:', err);
    res.status(500).json({ error: 'Deletion failed' });
  }
});

/**
 * PUT /api/gdpr/rectify -- Right to Rectification (Art. 16)
 * Update bloodwork values in an active session.
 */
router.put('/rectify', verifyJWT, async (req, res) => {
  try {
    const { reportId, results } = req.body;
    if (!reportId || !results) {
      return res.status(400).json({ error: 'reportId and results are required' });
    }

    const report = await prisma.bloodWorkReport.findFirst({
      where: { id: reportId, userId: req.userId },
    });

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    await prisma.bloodWorkReport.update({
      where: { id: reportId },
      data: { results },
    });

    res.json({ success: true, message: 'Report updated successfully' });
  } catch (err) {
    console.error('GDPR rectification error:', err);
    res.status(500).json({ error: 'Rectification failed' });
  }
});

/**
 * POST /api/gdpr/restrict -- Right to Restrict Processing (Art. 18)
 */
router.post('/restrict', verifyJWT, async (req, res) => {
  try {
    await prisma.processingRestriction.upsert({
      where: { userId: req.userId },
      update: { restrictTier2: true, restrictedAt: new Date() },
      create: { userId: req.userId, restrictTier2: true },
    });

    res.json({ success: true, message: 'Processing restricted. Your data will not be used for model improvement.' });
  } catch (err) {
    console.error('GDPR restrict error:', err);
    res.status(500).json({ error: 'Failed to restrict processing' });
  }
});

/**
 * POST /api/gdpr/object-training -- Right to Object (Art. 21)
 */
router.post('/object-training', verifyJWT, async (req, res) => {
  try {
    await prisma.processingRestriction.upsert({
      where: { userId: req.userId },
      update: { restrictTier2: true, restrictedAt: new Date() },
      create: { userId: req.userId, restrictTier2: true },
    });

    // Also withdraw model training consent
    const latestConsent = await prisma.consent.findFirst({
      where: { userId: req.userId, withdrawnAt: null },
      orderBy: { grantedAt: 'desc' },
    });
    if (latestConsent) {
      await prisma.consent.update({
        where: { id: latestConsent.id },
        data: { modelTrainingConsent: false },
      });
    }

    res.json({ success: true, message: 'Objection recorded. Your data will be excluded from model training.' });
  } catch (err) {
    console.error('GDPR object error:', err);
    res.status(500).json({ error: 'Failed to record objection' });
  }
});

export default router;
