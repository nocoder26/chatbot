import cron from 'node-cron';
import { reEmbedTier2Data, identifyKnowledgeGaps } from '../gdpr/modelImprovement.js';

let cachedGaps = null;

/**
 * Weekly cron: re-embed Tier 2 data and analyze knowledge gaps.
 * Runs Sundays at 03:00 (after Tier 3 aggregation at 00:00).
 */
export function startModelImprovementCron() {
  cron.schedule('0 3 * * 0', async () => {
    console.log('[Cron] Starting model improvement pipeline...');
    try {
      const embedResult = await reEmbedTier2Data(500);
      console.log(`[Cron] Re-embedded ${embedResult.embedded}/${embedResult.total} Q&A pairs`);

      cachedGaps = await identifyKnowledgeGaps();
      console.log(`[Cron] Knowledge gaps: ${cachedGaps.totalGaps} identified`);
    } catch (err) {
      console.error('[Cron] Model improvement failed:', err.message);
    }
  });

  console.log('[Cron] Model improvement scheduled (Sundays 03:00)');
}

export function getCachedKnowledgeGaps() {
  return cachedGaps;
}
