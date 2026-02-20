import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { logAuditEvent } from '../gdpr/auditLogger.js';
import { identifyKnowledgeGaps } from '../gdpr/modelImprovement.js';
import { getCachedKnowledgeGaps } from '../cron/modelImprovement.js';
import { upsertAnonymizedVector } from '../lib/pinecone.js';

const router = Router();
const ADMIN_KEY = process.env.ADMIN_PIN || '2603';

function verifyAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!key || key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

/**
 * POST /api/admin/verify-pin
 */
router.post('/verify-pin', (req, res) => {
  const { pin } = req.body;
  if (pin && pin === ADMIN_KEY) {
    return res.json({ authenticated: true, admin_key: ADMIN_KEY });
  }
  return res.status(401).json({ error: 'Invalid PIN' });
});

/**
 * GET /api/admin/stats
 */
router.get('/stats', verifyAdmin, async (req, res) => {
  try {
    logAuditEvent({ action: 'admin_access', tier: 'tier1', actorType: 'admin', details: { endpoint: '/stats' } });
    const activities = await prisma.userActivity.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const allGaps = activities
      .filter((a) => a.type === 'knowledge_gap' || (a.type === 'chat_message' && a.metadata?.confidence < 0.5 && !a.metadata?.usedKnowledgeBase))
      .map((a) => ({
        id: a.id,
        question: a.metadata?.question || '',
        type: a.metadata?.category || a.metadata?.source || 'General',
        score: a.metadata?.confidence || 0,
        marker: a.metadata?.marker || null,
        source: a.metadata?.source || 'chat',
        timestamp: a.createdAt,
      }));

    const gapsBloodwork = allGaps.filter((g) => g.source === 'bloodwork');

    const feedback = activities
      .filter((a) => a.type === 'feedback')
      .map((a) => ({
        rating: a.metadata?.rating || 0,
        reason: a.metadata?.reason || '',
        question: a.metadata?.question || '',
      }));

    const docUsage = activities
      .filter((a) => a.type === 'chat_message' && a.metadata?.document)
      .map((a) => ({ document: a.metadata.document, question: a.metadata?.question || '', timestamp: a.createdAt }));

    // KB sources: frequency and keywords (questions that led to each document)
    const docFreq = {};
    docUsage.forEach((u) => {
      const doc = u.document || 'unknown';
      if (!docFreq[doc]) docFreq[doc] = { count: 0, keywords: [] };
      docFreq[doc].count += 1;
      if (u.question && u.question.trim()) {
        const words = u.question.trim().split(/\s+/).filter((w) => w.length > 2).slice(0, 10);
        docFreq[doc].keywords.push(...words);
      }
    });
    const kbSources = Object.entries(docFreq).map(([document, data]) => ({
      document,
      frequency: data.count,
      keywords: [...new Set(data.keywords)].slice(0, 30),
    })).sort((a, b) => b.frequency - a.frequency);

    // Retrieval-event pipeline: insufficient KB table and sources ranking
    const retrievalEvents = activities.filter((a) => a.type === 'retrieval_event');
    const insufficientKb = retrievalEvents
      .filter((a) => a.metadata?.sufficiency?.label === 'insufficient')
      .map((a) => ({
        id: a.id,
        query_text: a.metadata?.query_text || '',
        reason: a.metadata?.sufficiency?.reason || '',
        score: a.metadata?.sufficiency?.score ?? 0,
        top_context: (a.metadata?.kb_final_context || []).slice(0, 2).map((c) => c.doc_id || c.chunk_id),
        timestamp: a.createdAt,
      }));

    const sourceFreq = {};
    retrievalEvents.forEach((a) => {
      const ctx = a.metadata?.kb_final_context || [];
      const usage = a.metadata?.source_usage || [];
      const docIds = new Set([...ctx.map((c) => c.doc_id), ...usage.map((u) => u.source_id)]);
      docIds.forEach((docId) => {
        if (docId) sourceFreq[docId] = (sourceFreq[docId] || 0) + 1;
      });
    });
    const sources_ranking = Object.entries(sourceFreq)
      .map(([document, frequency]) => ({ document, frequency }))
      .sort((a, b) => b.frequency - a.frequency);

    // Merge retrieval_event insufficient-KB into chat gaps so the dashboard shows them in one table
    const gapsChatFromRetrieval = insufficientKb.map((k) => ({
      id: k.id,
      question: k.query_text || '',
      type: 'Insufficient KB',
      score: k.score ?? 0,
      source: 'chat',
      marker: null,
      timestamp: k.timestamp,
    }));
    const gapsChat = [...allGaps.filter((g) => (g.source || 'chat') === 'chat'), ...gapsChatFromRetrieval];
    const gapsMerged = [...gapsChat, ...gapsBloodwork];

    return res.json({
      gaps: gapsMerged,
      gapsChat,
      gapsBloodwork,
      feedback,
      doc_usage: docUsage,
      kb_sources: kbSources,
      insufficient_kb: insufficientKb,
      sources_ranking,
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    return res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

/**
 * GET /api/admin/user-analytics
 * Aggregated analytics for all users within 24h
 */
router.get('/user-analytics', verifyAdmin, async (req, res) => {
  try {
    logAuditEvent({ action: 'admin_access', tier: 'tier1', actorType: 'admin', details: { endpoint: '/user-analytics' } });
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [activeUsers, totalConversations, totalBloodwork, recentActivities, deviceActivities] = await Promise.all([
      prisma.user.count({ where: { createdAt: { gte: cutoff } } }),
      prisma.chat.count({ where: { createdAt: { gte: cutoff } } }),
      prisma.bloodWorkReport.count({ where: { createdAt: { gte: cutoff } } }),
      prisma.userActivity.findMany({
        where: { createdAt: { gte: cutoff } },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          userId: true,
          type: true,
          metadata: true,
          createdAt: true,
        },
      }),
      prisma.userActivity.findMany({
        where: { type: 'device_info', createdAt: { gte: cutoff } },
        select: { metadata: true },
      }),
    ]);

    // Aggregate question categories
    const categoryMap = {};
    const bloodworkPatternMap = {};
    recentActivities.forEach((a) => {
      if (a.type === 'chat_message' && a.metadata?.category) {
        categoryMap[a.metadata.category] = (categoryMap[a.metadata.category] || 0) + 1;
      }
      if (a.type === 'bloodwork_upload' && Array.isArray(a.metadata?.markers)) {
        a.metadata.markers.forEach((m) => {
          if (m.status === 'Out of Range') {
            bloodworkPatternMap[m.name] = (bloodworkPatternMap[m.name] || 0) + 1;
          }
        });
      }
    });

    const topQuestionCategories = Object.entries(categoryMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([category, count]) => ({ category, count }));

    const bloodworkPatterns = Object.entries(bloodworkPatternMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([marker, count]) => ({ marker, count }));

    // Sentiment breakdown
    const feedbackActivities = recentActivities.filter((a) => a.type === 'feedback');
    const positiveCount = feedbackActivities.filter((a) => a.metadata?.rating >= 4).length;
    const negativeCount = feedbackActivities.filter((a) => a.metadata?.rating <= 2).length;
    const neutralCount = feedbackActivities.filter((a) => a.metadata?.rating === 3).length;

    // Avg session duration from session_end activities
    const sessionEnds = recentActivities.filter((a) => a.type === 'session_end' && a.metadata?.sessionDuration);
    const avgSessionDuration = sessionEnds.length
      ? Math.round(sessionEnds.reduce((sum, a) => sum + (a.metadata.sessionDuration || 0), 0) / sessionEnds.length)
      : 0;

    const deviceBreakdown = { browsers: {}, os: {}, screens: {}, timezones: {} };
    deviceActivities.forEach((a) => {
      const m = a.metadata || {};
      if (m.browser) deviceBreakdown.browsers[m.browser] = (deviceBreakdown.browsers[m.browser] || 0) + 1;
      if (m.os) deviceBreakdown.os[m.os] = (deviceBreakdown.os[m.os] || 0) + 1;
      if (m.screen) deviceBreakdown.screens[m.screen] = (deviceBreakdown.screens[m.screen] || 0) + 1;
      if (m.timezone) deviceBreakdown.timezones[m.timezone] = (deviceBreakdown.timezones[m.timezone] || 0) + 1;
    });

    return res.json({
      activeUsers,
      totalConversations,
      totalBloodwork,
      recentActivities: recentActivities.map((a) => ({
        ...a,
        userId: `user_${a.userId.slice(0, 8)}`,
      })),
      topQuestionCategories,
      bloodworkPatterns,
      sentimentBreakdown: { positive: positiveCount, negative: negativeCount, neutral: neutralCount },
      avgSessionDuration,
      deviceBreakdown,
    });
  } catch (err) {
    console.error('Admin user-analytics error:', err);
    return res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

/**
 * GET /api/admin/users
 * Full user list with per-user engagement metrics
 */
router.get('/users', verifyAdmin, async (req, res) => {
  try {
    logAuditEvent({ action: 'admin_access', tier: 'tier1', actorType: 'admin', details: { endpoint: '/users' } });
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const users = await prisma.user.findMany({
      where: { createdAt: { gte: cutoff } },
      include: {
        _count: { select: { chats: true, bloodWorkReports: true, activities: true } },
        activities: {
          orderBy: { createdAt: 'desc' },
          select: { type: true, metadata: true, createdAt: true },
        },
        chats: {
          select: { _count: { select: { messages: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const userList = users.map((u) => {
      const messageCount = u.chats.reduce((sum, c) => sum + c._count.messages, 0);
      const feedbackActivities = u.activities.filter((a) => a.type === 'feedback');
      const ratings = feedbackActivities
        .map((a) => (a.metadata && typeof a.metadata === 'object' && 'rating' in a.metadata) ? Number(a.metadata.rating) : 0)
        .filter((r) => r > 0);
      const avgRating = ratings.length ? +(ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : null;

      const timestamps = u.activities.map((a) => new Date(a.createdAt).getTime());
      const lastActiveAt = timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : u.createdAt.toISOString();
      const sessionDuration = timestamps.length >= 2
        ? Math.max(...timestamps) - Math.min(...timestamps)
        : 0;

      const thumbsUp = feedbackActivities.filter((a) => a.metadata && typeof a.metadata === 'object' && 'rating' in a.metadata && Number(a.metadata.rating) >= 4).length;
      const thumbsDown = feedbackActivities.filter((a) => a.metadata && typeof a.metadata === 'object' && 'rating' in a.metadata && Number(a.metadata.rating) <= 2).length;

      return {
        userId: `user_${u.id.slice(0, 8)}`,
        fullId: u.id,
        createdAt: u.createdAt,
        messageCount,
        chatCount: u._count.chats,
        bloodworkCount: u._count.bloodWorkReports,
        activityCount: u._count.activities,
        avgRating,
        lastActiveAt,
        sessionDuration,
        thumbsUp,
        thumbsDown,
      };
    });

    userList.sort((a, b) => b.activityCount - a.activityCount);

    return res.json({ users: userList });
  } catch (err) {
    console.error('Admin users error:', err);
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * GET /api/admin/user-analytics/:userId
 * Drill-down for a specific user (anonymized)
 */
router.get('/user-analytics/:userId', verifyAdmin, async (req, res) => {
  try {
    logAuditEvent({ action: 'admin_access', tier: 'tier1', actorType: 'admin', details: { endpoint: `/user-analytics/${req.params.userId}` } });
    const { userId } = req.params;
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // userId comes as "user_abc12345" — extract the prefix to search
    const idPrefix = userId.replace('user_', '');

    const users = await prisma.user.findMany({
      where: {
        id: { startsWith: idPrefix },
        createdAt: { gte: cutoff },
      },
      take: 1,
    });

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];

    const [activities, chats, bloodwork] = await Promise.all([
      prisma.userActivity.findMany({
        where: { userId: user.id, createdAt: { gte: cutoff } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.chat.findMany({
        where: { userId: user.id, createdAt: { gte: cutoff } },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.bloodWorkReport.findMany({
        where: { userId: user.id, createdAt: { gte: cutoff } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return res.json({
      userId: `user_${user.id.slice(0, 8)}`,
      createdAt: user.createdAt,
      activities,
      chats: chats.map((c) => ({
        id: c.id,
        title: c.title,
        createdAt: c.createdAt,
        messages: c.messages.map((m) => ({
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
        })),
      })),
      bloodwork: bloodwork.map((b) => ({
        id: b.id,
        results: b.results,
        summary: b.summary,
        createdAt: b.createdAt,
      })),
    });
  } catch (err) {
    console.error('Admin user-analytics drilldown error:', err);
    return res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

/**
 * GET /api/admin/knowledge-gaps
 * Returns knowledge gaps from model improvement analysis.
 */
router.get('/knowledge-gaps', verifyAdmin, async (req, res) => {
  try {
    logAuditEvent({ action: 'admin_access', tier: 'tier2', actorType: 'admin', details: { endpoint: '/knowledge-gaps' } });

    const cached = getCachedKnowledgeGaps();
    if (cached) return res.json(cached);

    const gaps = await identifyKnowledgeGaps();
    return res.json(gaps);
  } catch (err) {
    console.error('Admin knowledge-gaps error:', err);
    return res.status(500).json({ error: 'Failed to fetch knowledge gaps' });
  }
});

/**
 * GET /api/admin/pending-improvements
 * List knowledge gap activities that haven't been acted on.
 */
router.get('/pending-improvements', verifyAdmin, async (req, res) => {
  try {
    logAuditEvent({ action: 'admin_access', tier: 'tier2', actorType: 'admin', details: { endpoint: '/pending-improvements' } });
    const gaps = await prisma.userActivity.findMany({
      where: { type: 'knowledge_gap' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const pending = gaps.filter((g) => !g.metadata?.resolved);
    return res.json({
      total: pending.length,
      items: pending.map((g) => ({
        id: g.id,
        question: g.metadata?.question || '',
        marker: g.metadata?.marker || null,
        source: g.metadata?.source || 'chat',
        category: g.metadata?.category || 'General',
        confidence: g.metadata?.confidence || 0,
        timestamp: g.createdAt,
      })),
    });
  } catch (err) {
    console.error('Admin pending-improvements error:', err);
    return res.status(500).json({ error: 'Failed to fetch pending improvements' });
  }
});

/**
 * POST /api/admin/clear-test-data
 * Deletes all operational and optional tier2/tier3 data for a clean test state.
 * Audit log is kept. Requires X-Admin-Key.
 */
router.post('/clear-test-data', verifyAdmin, async (req, res) => {
  try {
    logAuditEvent({ action: 'admin_clear_test_data_start', tier: 'tier1', actorType: 'admin', details: { endpoint: '/clear-test-data' } });

    const includeTier2And3 = req.body?.includeTier2And3 !== false;

    const counts = { messages: 0, chats: 0, bloodwork: 0, activities: 0, consents: 0, pushSubs: 0, webauthn: 0, users: 0, trainingFeedback: 0, anonymizedQA: 0, anonymizedBloodwork: 0, analytics: 0 };

    await prisma.$transaction(async (tx) => {
      counts.messages = (await tx.message.deleteMany({})).count;
      counts.chats = (await tx.chat.deleteMany({})).count;
      counts.bloodwork = (await tx.bloodWorkReport.deleteMany({})).count;
      counts.activities = (await tx.userActivity.deleteMany({})).count;
      counts.consents = (await tx.consent.deleteMany({})).count;
      counts.pushSubs = (await tx.pushSubscription.deleteMany({})).count;
      counts.webauthn = (await tx.webAuthnCredential.deleteMany({})).count;
      counts.users = (await tx.user.deleteMany({})).count;

      if (includeTier2And3) {
        counts.trainingFeedback = (await tx.trainingFeedback.deleteMany({})).count;
        counts.anonymizedQA = (await tx.anonymizedQAPair.deleteMany({})).count;
        counts.anonymizedBloodwork = (await tx.anonymizedBloodwork.deleteMany({})).count;
        counts.analytics = (await tx.analyticsAggregate.deleteMany({})).count;
      }
    });

    logAuditEvent({ action: 'admin_clear_test_data_done', tier: 'tier1', actorType: 'admin', details: { counts, includeTier2And3 } });
    return res.json({ ok: true, deleted: counts });
  } catch (err) {
    console.error('Admin clear-test-data error:', err);
    return res.status(500).json({ error: 'Failed to clear data', message: err?.message });
  }
});

/**
 * POST /api/admin/approve-gap
 * Admin approves a gap and optionally provides content to upsert to KB.
 * Body: { gapId, answer?, action: 'approve' | 'dismiss' }
 */
router.post('/approve-gap', verifyAdmin, async (req, res) => {
  try {
    const { gapId, answer, action } = req.body;
    if (!gapId || !action) return res.status(400).json({ error: 'gapId and action required' });

    const gap = await prisma.userActivity.findUnique({ where: { id: gapId } });
    if (!gap || gap.type !== 'knowledge_gap') return res.status(404).json({ error: 'Gap not found' });

    if (action === 'approve' && answer) {
      const question = gap.metadata?.question || '';
      await upsertAnonymizedVector('kb_improvement', `Q: ${question}\nA: ${answer}`, {
        source: 'admin_approved',
        category: gap.metadata?.category || 'General',
        marker: gap.metadata?.marker || null,
      });
      logAuditEvent({ action: 'kb_improvement_approved', tier: 'tier2', actorType: 'admin', details: { gapId, question } });
    }

    await prisma.userActivity.update({
      where: { id: gapId },
      data: { metadata: { ...gap.metadata, resolved: true, resolution: action, resolvedAt: new Date().toISOString() } },
    });

    return res.json({ ok: true, action });
  } catch (err) {
    console.error('Admin approve-gap error:', err);
    return res.status(500).json({ error: 'Failed to process gap' });
  }
});

export default router;
