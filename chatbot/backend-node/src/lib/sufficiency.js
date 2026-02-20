/**
 * Sufficiency check: is the retrieved KB context sufficient to answer the query well?
 * Heuristic: top fused score and score drop-off. "Insufficient" = partial context still used.
 */
const TOP_SCORE_THRESHOLD = parseFloat(process.env.SUFFICIENCY_TOP_THRESHOLD || '0.5', 10) || 0.5;
const DROP_OFF_RATIO_THRESHOLD = parseFloat(process.env.SUFFICIENCY_DROP_OFF_RATIO || '0.6', 10) || 0.6;

/**
 * @param {Array<{chunk_id: string, fused_score: number, doc_id: string, text: string}>} kb_final_context
 * @param {string} _queryText - reserved for optional LLM judge
 * @returns {{ label: 'sufficient'|'insufficient', score: number, reason: string }}
 */
export function checkSufficiency(kb_final_context, _queryText = '') {
  if (!kb_final_context || kb_final_context.length === 0) {
    return { label: 'insufficient', score: 0, reason: 'No KB context retrieved' };
  }

  const top = kb_final_context[0];
  const second = kb_final_context[1];
  const topScore = top?.fused_score ?? 0;
  const secondScore = second?.fused_score ?? 0;
  const dropOff = topScore > 0 ? 1 - secondScore / topScore : 1;

  if (topScore >= TOP_SCORE_THRESHOLD && dropOff <= 1 - DROP_OFF_RATIO_THRESHOLD) {
    return {
      label: 'sufficient',
      score: Math.min(1, topScore * 1.2),
      reason: 'Strong top match and stable scores',
    };
  }
  if (topScore < 0.2) {
    return { label: 'insufficient', score: topScore, reason: 'Low top score' };
  }
  return {
    label: 'insufficient',
    score: topScore,
    reason: dropOff > 0.5 ? 'High score drop-off' : 'Moderate match; partial context',
  };
}
