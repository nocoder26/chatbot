import cron from 'node-cron';
import prisma from '../lib/prisma.js';
import { decryptField, isEncryptionEnabled } from '../gdpr/encryption.js';
import {
  sanitizeFreeText,
  generalizeBloodworkValue,
  addDifferentialPrivacyNoise,
  categorizeQuestion,
  hashForDedup,
  temporalBucket,
} from '../gdpr/anonymization.js';
import { validateKAnonymity } from '../gdpr/riskAssessment.js';
import { vectorizeAndStore } from '../lib/pinecone.js';

const TIER2_RETENTION_MONTHS = parseInt(process.env.TIER2_RETENTION_MONTHS || '18', 10);

function computeExpiresAt() {
  const d = new Date();
  d.setMonth(d.getMonth() + TIER2_RETENTION_MONTHS);
  return d;
}

/**
 * Extract and anonymize chat Q&A pairs from Tier 1 into Tier 2.
 */
async function extractChatData() {
  const recentChats = await prisma.chat.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
      user: {
        include: {
          consents: { orderBy: { grantedAt: 'desc' }, take: 1 },
        },
      },
    },
  });

  const qaPairs = [];

  for (const chat of recentChats) {
    const consent = chat.user.consents?.[0];
    if (!consent || consent.withdrawnAt || !consent.modelTrainingConsent) continue;

    const restriction = await prisma.processingRestriction.findUnique({
      where: { userId: chat.userId },
    });
    if (restriction?.restrictTier2) continue;

    const messages = chat.messages;
    for (let i = 0; i < messages.length - 1; i++) {
      if (messages[i].role === 'user' && messages[i + 1]?.role === 'ai') {
        let questionText = messages[i].content;
        let answerText = messages[i + 1].content;

        if (isEncryptionEnabled() && messages[i].encryptedData) {
          try {
            questionText = decryptField(JSON.parse(messages[i].encryptedData)) || questionText;
          } catch (_) { /* use plaintext fallback */ }
        }
        if (isEncryptionEnabled() && messages[i + 1].encryptedData) {
          try {
            answerText = decryptField(JSON.parse(messages[i + 1].encryptedData)) || answerText;
          } catch (_) { /* use plaintext fallback */ }
        }

        const cleanQuestion = sanitizeFreeText(questionText);
        const cleanAnswer = sanitizeFreeText(answerText);
        const qHash = hashForDedup(questionText);

        const existing = await prisma.anonymizedQAPair.findFirst({
          where: { questionHash: qHash },
        });
        if (existing) continue;

        qaPairs.push({
          questionHash: qHash,
          question: cleanQuestion.slice(0, 2000),
          answer: cleanAnswer.slice(0, 5000),
          language: 'en',
          category: categorizeQuestion(cleanQuestion),
          sourceExtractedAt: new Date(),
          expiresAt: computeExpiresAt(),
        });
      }
    }
  }

  return qaPairs;
}

/**
 * Extract and anonymize bloodwork data from Tier 1 into Tier 2.
 */
async function extractBloodworkData() {
  const reports = await prisma.bloodWorkReport.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    },
    include: {
      user: {
        include: {
          consents: { orderBy: { grantedAt: 'desc' }, take: 1 },
        },
      },
    },
  });

  const anonBloodwork = [];

  for (const report of reports) {
    const consent = report.user.consents?.[0];
    if (!consent || consent.withdrawnAt || !consent.modelTrainingConsent) continue;

    const restriction = await prisma.processingRestriction.findUnique({
      where: { userId: report.userId },
    });
    if (restriction?.restrictTier2) continue;

    let results = report.results;
    if (isEncryptionEnabled() && report.encryptedData) {
      try {
        const parsed = JSON.parse(report.encryptedData);
        if (parsed.results) {
          results = JSON.parse(decryptField(parsed.results));
        }
      } catch (_) { /* use plaintext fallback */ }
    }

    const markers = (Array.isArray(results) ? results : []).map((r) => {
      const generalized = generalizeBloodworkValue(r.name, r.value, r.unit);
      return {
        name: generalized.name,
        range: generalized.range,
        unit: generalized.unit,
        noisyValue: addDifferentialPrivacyNoise(parseFloat(r.value) || 0),
      };
    });

    const summary = sanitizeFreeText(report.summary || '');

    anonBloodwork.push({
      markers,
      summary: summary.slice(0, 2000),
      sourceExtractedAt: new Date(),
      expiresAt: computeExpiresAt(),
    });
  }

  return anonBloodwork;
}

/**
 * Extract feedback data into Tier 2 TrainingFeedback.
 */
async function extractFeedbackData() {
  const activities = await prisma.userActivity.findMany({
    where: {
      type: 'feedback',
      createdAt: { gte: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    },
    include: {
      user: {
        include: {
          consents: { orderBy: { grantedAt: 'desc' }, take: 1 },
        },
      },
    },
  });

  const feedbackRecords = [];

  for (const activity of activities) {
    const consent = activity.user.consents?.[0];
    if (!consent || consent.withdrawnAt || !consent.modelTrainingConsent) continue;

    const meta = activity.metadata || {};
    const rating = meta.rating;
    if (typeof rating !== 'number') continue;

    feedbackRecords.push({
      questionCategory: categorizeQuestion(meta.question || ''),
      qualityScore: rating,
      feedbackType: meta.reason ? 'rating_with_reason' : 'rating',
      language: 'en',
      createdAt: activity.createdAt,
      expiresAt: computeExpiresAt(),
    });
  }

  return feedbackRecords;
}

/**
 * Main extraction pipeline. Runs hourly at :00.
 */
async function runTier2Extraction() {
  const startTime = Date.now();
  try {
    const qaPairs = await extractChatData();
    const bloodwork = await extractBloodworkData();
    const feedback = await extractFeedbackData();

    const kResult = validateKAnonymity(
      qaPairs.map((q) => ({ language: q.language, category: q.category })),
      ['language', 'category'],
    );

    const qaToInsert = kResult.valid
      ? qaPairs
      : qaPairs.filter((_, i) => kResult.kept.some((k, ki) => ki === i));

    if (qaToInsert.length > 0) {
      await prisma.anonymizedQAPair.createMany({ data: qaToInsert });
    }

    if (bloodwork.length > 0) {
      await prisma.anonymizedBloodwork.createMany({ data: bloodwork });
    }

    if (feedback.length > 0) {
      await prisma.trainingFeedback.createMany({ data: feedback });
    }

    for (const qa of qaToInsert) {
      vectorizeAndStore('anonymized', 'training_qa', `Q: ${qa.question}\nA: ${qa.answer}`, {
        category: qa.category,
        language: qa.language,
      }).catch(() => {});
    }

    // Auto-promote high-rated Q&A pairs (rating >= 4) into the KB
    const highRatedPairs = await prisma.anonymizedQAPair.findMany({
      where: { qualityScore: { gte: 4 }, NOT: { metadata: { path: ['autoPromoted'], equals: true } } },
      take: 50,
      select: { id: true, question: true, answer: true, category: true, language: true },
    }).catch(() => []);

    let promoted = 0;
    for (const pair of highRatedPairs) {
      try {
        await vectorizeAndStore('anonymized', 'kb_auto_promoted', `Q: ${pair.question}\nA: ${pair.answer}`, {
          category: pair.category,
          language: pair.language,
          source: 'auto_quality_gate',
          autoApproved: true,
        });
        await prisma.anonymizedQAPair.update({
          where: { id: pair.id },
          data: { metadata: { autoPromoted: true, promotedAt: new Date().toISOString() } },
        }).catch(() => {});
        promoted++;
      } catch (_) {}
    }

    const elapsed = Date.now() - startTime;
    const total = qaToInsert.length + bloodwork.length + feedback.length;
    if (total > 0 || promoted > 0) {
      console.log(
        `[Tier2] Extracted ${qaToInsert.length} QA, ${bloodwork.length} bloodwork, ${feedback.length} feedback. Auto-promoted: ${promoted} high-quality pairs. (${elapsed}ms). Suppressed: ${kResult.suppressed?.length || 0} by k-anonymity.`
      );
    }
  } catch (err) {
    console.error('[Tier2] Extraction failed:', err);
  }
}

export function startTier2ExtractionCron() {
  cron.schedule('0 * * * *', runTier2Extraction);
  console.log('[Tier2] Extraction cron scheduled (runs every hour at :00)');
}

export { runTier2Extraction };
