import { Router } from 'express';
import webpush from 'web-push';
import prisma from '../lib/prisma.js';
import { verifyJWT } from '../middleware/auth.js';

const router = Router();

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@izana.ai';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  console.log('[Push] VAPID keys configured');
} else {
  console.warn('[Push] VAPID keys not set — push notifications disabled');
}

router.get('/vapid-key', (_req, res) => {
  if (!VAPID_PUBLIC) return res.status(503).json({ error: 'Push not configured' });
  res.json({ publicKey: VAPID_PUBLIC });
});

router.post('/subscribe', verifyJWT, async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ error: 'Invalid subscription object' });
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, userId: req.userId },
      create: { userId: req.userId, endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[Push] Subscribe error:', err.message);
    res.status(500).json({ error: 'Subscription failed' });
  }
});

router.post('/unsubscribe', verifyJWT, async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) {
      await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.userId } });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[Push] Unsubscribe error:', err.message);
    res.status(500).json({ error: 'Unsubscribe failed' });
  }
});

export async function sendPushToUser(userId, payload) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  const body = JSON.stringify(payload);

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
      );
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      }
    }
  }
}

export default router;
