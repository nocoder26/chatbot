import prisma from '../lib/prisma.js';
import { upsertAnonymizedVector } from '../lib/pinecone.js';

/**
 * Export Tier 2 anonymized Q&A pairs in JSONL format for RAG embedding updates.
 * Returns a string with one JSON object per line.
 */
export async function exportTrainingData(limit = 1000) {
  const pairs = await prisma.anonymizedQAPair.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      question: true,
      answer: true,
      qualityScore: true,
      language: true,
      category: true,
    },
  });

  return pairs.map((p) => JSON.stringify({
    question: p.question,
    answer: p.answer,
    quality_score: p.qualityScore,
    language: p.language,
    category: p.category,
  })).join('\n');
}

/**
 * Identify knowledge gaps from Tier 2 data.
 * Looks for low-confidence answers and frequently asked but poorly rated questions.
 */
export async function identifyKnowledgeGaps() {
  const lowQuality = await prisma.anonymizedQAPair.findMany({
    where: { qualityScore: { lt: 3.0 } },
    orderBy: { qualityScore: 'asc' },
    take: 50,
    select: { question: true, category: true, qualityScore: true, language: true },
  });

  const categoryGaps = await prisma.trainingFeedback.groupBy({
    by: ['questionCategory'],
    _avg: { qualityScore: true },
    _count: true,
    having: { qualityScore: { _avg: { lt: 3.5 } } },
    orderBy: { _avg: { qualityScore: 'asc' } },
  });

  return {
    lowQualityResponses: lowQuality,
    underperformingCategories: categoryGaps.map((g) => ({
      category: g.questionCategory,
      avgScore: Math.round((g._avg.qualityScore || 0) * 100) / 100,
      sampleCount: g._count,
    })),
    totalGaps: lowQuality.length + categoryGaps.length,
  };
}

/**
 * Re-embed Tier 2 data into Pinecone for improved RAG retrieval.
 * Processes anonymized Q&A pairs that haven't been recently embedded.
 */
export async function reEmbedTier2Data(batchSize = 100) {
  const pairs = await prisma.anonymizedQAPair.findMany({
    orderBy: { createdAt: 'desc' },
    take: batchSize,
    select: { id: true, question: true, answer: true, category: true, language: true },
  });

  let embedded = 0;
  for (const pair of pairs) {
    const content = `Q: ${pair.question}\nA: ${pair.answer}`;
    await upsertAnonymizedVector('training_qa', content, {
      category: pair.category,
      language: pair.language,
      sourceId: pair.id,
    });
    embedded++;
  }

  return { embedded, total: pairs.length };
}

/**
 * Get a summary of training data available in Tier 2.
 */
export async function getTrainingDataSummary() {
  const [qaCount, bwCount, fbCount] = await Promise.all([
    prisma.anonymizedQAPair.count(),
    prisma.anonymizedBloodwork.count(),
    prisma.trainingFeedback.count(),
  ]);

  const categoryBreakdown = await prisma.anonymizedQAPair.groupBy({
    by: ['category'],
    _count: true,
    orderBy: { _count: { category: 'desc' } },
  });

  const avgQuality = await prisma.trainingFeedback.aggregate({
    _avg: { qualityScore: true },
  });

  return {
    qaPairCount: qaCount,
    bloodworkCount: bwCount,
    feedbackCount: fbCount,
    categoryBreakdown: categoryBreakdown.map((c) => ({ category: c.category, count: c._count })),
    averageQualityScore: Math.round((avgQuality._avg.qualityScore || 0) * 100) / 100,
  };
}
