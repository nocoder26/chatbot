import cron from 'node-cron';
import prisma from '../lib/prisma.js';

/**
 * Tier 1: 24-hour privacy deletion. Runs every hour at :15 (after Tier 2 extraction at :00).
 * Tier 2: 18-month expiry cleanup runs in the same job.
 *
 * Note: Valkey-based data (sessions, gaps, feedback) is automatically deleted via TTL (24h).
 * This cron only handles Prisma-based data that doesn't have TTL support.
 */
export function startPrivacyDeletionCron() {
  cron.schedule('15 * * * *', async () => {
    try {
      const tier1Cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const messagesDeleted = await prisma.message.deleteMany({
        where: { createdAt: { lt: tier1Cutoff } },
      });
      const chatsDeleted = await prisma.chat.deleteMany({
        where: { createdAt: { lt: tier1Cutoff } },
      });
      const bloodworkDeleted = await prisma.bloodWorkReport.deleteMany({
        where: { createdAt: { lt: tier1Cutoff } },
      });
      const activitiesDeleted = await prisma.userActivity.deleteMany({
        where: { createdAt: { lt: tier1Cutoff } },
      });
      const credentialsDeleted = await prisma.webAuthnCredential.deleteMany({
        where: { createdAt: { lt: tier1Cutoff } },
      });
      const consentsDeletedWithUser = await prisma.consent.deleteMany({
        where: { grantedAt: { lt: tier1Cutoff } },
      });
      const usersDeleted = await prisma.user.deleteMany({
        where: { createdAt: { lt: tier1Cutoff } },
      });

      const tier1Total =
        messagesDeleted.count + chatsDeleted.count + bloodworkDeleted.count +
        activitiesDeleted.count + credentialsDeleted.count + consentsDeletedWithUser.count +
        usersDeleted.count;

      if (tier1Total > 0) {
        console.log(
          `[Privacy Tier1] Deleted ${messagesDeleted.count} messages, ${chatsDeleted.count} chats, ${bloodworkDeleted.count} bloodwork, ${activitiesDeleted.count} activities, ${credentialsDeleted.count} creds, ${consentsDeletedWithUser.count} consents, ${usersDeleted.count} users (>24h)`
        );
      }

      // Tier 2 expiry cleanup
      const now = new Date();
      const qaExpired = await prisma.anonymizedQAPair.deleteMany({
        where: { expiresAt: { lt: now } },
      });
      const bwExpired = await prisma.anonymizedBloodwork.deleteMany({
        where: { expiresAt: { lt: now } },
      });
      const fbExpired = await prisma.trainingFeedback.deleteMany({
        where: { expiresAt: { lt: now } },
      });

      const tier2Total = qaExpired.count + bwExpired.count + fbExpired.count;
      if (tier2Total > 0) {
        console.log(
          `[Privacy Tier2] Expired ${qaExpired.count} QA pairs, ${bwExpired.count} bloodwork, ${fbExpired.count} feedback`
        );
      }

      // Completed deletion requests
      const pendingDeletions = await prisma.deletionRequest.findMany({
        where: { status: 'pending' },
      });
      for (const req of pendingDeletions) {
        const userExists = await prisma.user.findUnique({ where: { id: req.userId } });
        if (!userExists) {
          await prisma.deletionRequest.update({
            where: { id: req.id },
            data: { status: 'completed', completedAt: new Date(), tier1Deleted: true },
          });
        }
      }
    } catch (err) {
      console.error('[Privacy] Cron deletion failed:', err);
    }
  });
  console.log('[Privacy] Deletion cron scheduled (runs every hour at :15)');
}
