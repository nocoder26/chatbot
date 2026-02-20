import prisma from './prisma.js';

let categoryScores = {};
let lastRefresh = 0;
const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

async function refreshScores() {
  try {
    const groups = await prisma.trainingFeedback.groupBy({
      by: ['questionCategory'],
      _avg: { qualityScore: true },
      _count: true,
    });

    const scores = {};
    for (const g of groups) {
      if (g.questionCategory && g._count >= 3) {
        scores[g.questionCategory] = Math.round((g._avg.qualityScore || 3.5) * 100) / 100;
      }
    }
    categoryScores = scores;
    lastRefresh = Date.now();
  } catch (err) {
    console.error('[PromptRouter] Failed to refresh scores:', err.message);
  }
}

/**
 * Get prompt adjustments based on accumulated feedback for a question category.
 * Low-scoring categories get more context and stricter prompts.
 * @param {string} category
 * @returns {{ extraInstructions: string, topK: number, temperature: number }}
 */
export async function getPromptAdjustments(category) {
  if (Date.now() - lastRefresh > REFRESH_INTERVAL_MS) {
    await refreshScores();
  }

  const score = categoryScores[category];

  if (score !== undefined && score < 3.0) {
    return {
      extraInstructions: 'Be extra precise and thorough. Cite specific medical evidence. Avoid vague statements.',
      topK: 5,
      temperature: 0.5,
    };
  }

  return { extraInstructions: '', topK: 3, temperature: 0.7 };
}

export function getCachedScores() {
  return { ...categoryScores };
}
