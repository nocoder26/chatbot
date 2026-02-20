import cron from 'node-cron';
import prisma from '../lib/prisma.js';

const MIN_CELL_SIZE = 10;

function getWeekPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const oneJan = new Date(year, 0, 1);
  const week = Math.ceil(((now - oneJan) / 86400000 + oneJan.getDay() + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * Compute Tier 3 population-level aggregates from Tier 2 data.
 * Only metrics with cell size >= MIN_CELL_SIZE are stored.
 */
async function runTier3Aggregation() {
  const startTime = Date.now();
  const period = getWeekPeriod();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  try {
    const aggregates = [];

    // Conversation volume
    const qaCount = await prisma.anonymizedQAPair.count({
      where: { sourceExtractedAt: { gte: weekAgo } },
    });
    if (qaCount >= MIN_CELL_SIZE) {
      aggregates.push({
        period,
        metricType: 'conversation_volume',
        metricValue: { total: qaCount },
        cellSize: qaCount,
      });
    }

    // Question categories distribution
    const categories = await prisma.anonymizedQAPair.groupBy({
      by: ['category'],
      where: { sourceExtractedAt: { gte: weekAgo } },
      _count: true,
    });
    const catMetrics = categories
      .filter((c) => c._count >= MIN_CELL_SIZE)
      .map((c) => ({ category: c.category, count: c._count }));
    if (catMetrics.length > 0) {
      aggregates.push({
        period,
        metricType: 'question_categories',
        metricValue: { categories: catMetrics },
        cellSize: Math.min(...catMetrics.map((c) => c.count)),
      });
    }

    // Language distribution
    const languages = await prisma.anonymizedQAPair.groupBy({
      by: ['language'],
      where: { sourceExtractedAt: { gte: weekAgo } },
      _count: true,
    });
    const langMetrics = languages
      .filter((l) => l._count >= MIN_CELL_SIZE)
      .map((l) => ({ language: l.language, count: l._count }));
    if (langMetrics.length > 0) {
      aggregates.push({
        period,
        metricType: 'language_distribution',
        metricValue: { languages: langMetrics },
        cellSize: Math.min(...langMetrics.map((l) => l.count)),
      });
    }

    // Bloodwork reports count
    const bwCount = await prisma.anonymizedBloodwork.count({
      where: { sourceExtractedAt: { gte: weekAgo } },
    });
    if (bwCount >= MIN_CELL_SIZE) {
      aggregates.push({
        period,
        metricType: 'bloodwork_volume',
        metricValue: { total: bwCount },
        cellSize: bwCount,
      });
    }

    // Quality scores from feedback
    const feedback = await prisma.trainingFeedback.findMany({
      where: { createdAt: { gte: weekAgo } },
      select: { qualityScore: true },
    });
    if (feedback.length >= MIN_CELL_SIZE) {
      const scores = feedback.map((f) => f.qualityScore);
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      const sorted = [...scores].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const variance = scores.reduce((sum, s) => sum + (s - avg) ** 2, 0) / scores.length;

      aggregates.push({
        period,
        metricType: 'quality_scores',
        metricValue: {
          count: scores.length,
          average: Math.round(avg * 100) / 100,
          median,
          stddev: Math.round(Math.sqrt(variance) * 100) / 100,
        },
        cellSize: scores.length,
      });
    }

    // Age group distribution from bloodwork
    const ageGroups = await prisma.anonymizedBloodwork.groupBy({
      by: ['ageGroup'],
      where: { sourceExtractedAt: { gte: weekAgo }, ageGroup: { not: null } },
      _count: true,
    });
    const ageMetrics = ageGroups
      .filter((a) => a._count >= MIN_CELL_SIZE)
      .map((a) => ({ ageGroup: a.ageGroup, count: a._count }));
    if (ageMetrics.length > 0) {
      aggregates.push({
        period,
        metricType: 'age_distribution',
        metricValue: { ageGroups: ageMetrics },
        cellSize: Math.min(...ageMetrics.map((a) => a.count)),
      });
    }

    if (aggregates.length > 0) {
      await prisma.analyticsAggregate.createMany({ data: aggregates });
    }

    const elapsed = Date.now() - startTime;
    console.log(`[Tier3] Aggregated ${aggregates.length} metrics for period ${period} (${elapsed}ms)`);
  } catch (err) {
    console.error('[Tier3] Aggregation failed:', err);
  }
}

export function startTier3AggregationCron() {
  // Runs weekly on Sunday at midnight
  cron.schedule('0 0 * * 0', runTier3Aggregation);
  console.log('[Tier3] Aggregation cron scheduled (runs weekly on Sunday at 00:00)');
}

export { runTier3Aggregation };
