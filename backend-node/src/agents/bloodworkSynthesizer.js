/**
 * Bloodwork Synthesizer Agent: Generates clinical summaries from biomarker data.
 * Model: llama-3.3-70b-versatile (high quality, JSON mode)
 * Output: { summary, flaggedItems, suggestedQuestions }
 */
import Groq from 'groq-sdk';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MODEL = 'llama-3.3-70b-versatile';
const TIMEOUT_MS = 25000;

let groq = null;
if (GROQ_API_KEY) {
  groq = new Groq({ apiKey: GROQ_API_KEY });
}

/**
 * Check if synthesizer is available.
 */
export function isBloodworkSynthesizerAvailable() {
  return !!groq;
}

/**
 * Synthesize a clinical summary from extracted biomarkers.
 * @param {Array} biomarkers - Array of extracted biomarker results
 * @param {string} treatmentType - Optional treatment context (e.g., "IVF", "TTC")
 * @param {Array} kbChunks - Optional knowledge base context
 * @param {string} language - Response language
 * @returns {Promise<{ summary: string, flaggedItems: string[], suggestedQuestions: string[] }>}
 */
export async function synthesizeBloodworkAnalysis(biomarkers, treatmentType = null, kbChunks = [], language = 'en') {
  const fallback = {
    summary: "Unable to generate analysis at this time. Please consult your healthcare provider for interpretation of your results.",
    flaggedItems: [],
    suggestedQuestions: [],
  };

  if (!groq || !biomarkers?.length) {
    return fallback;
  }

  // Format biomarker data for prompt
  const biomarkerText = biomarkers.map((b) => {
    const status = b.isNormal ? '✓ Normal' : '⚠ Flagged';
    return `${b.biomarker}: ${b.value} ${b.unit || ''} (Ref: ${b.referenceRange || 'N/A'}) - ${status}`;
  }).join('\n');

  // Format KB context if available
  const contextText = kbChunks.length > 0
    ? kbChunks.map((c) => c.text).join('\n\n').slice(0, 3000)
    : '';

  const treatmentContext = treatmentType
    ? `\nTreatment Context: ${treatmentType}`
    : '';

  const systemPrompt = `You are Izana, an empathetic fertility health assistant specializing in bloodwork interpretation.

CRITICAL RULES:
1. Write in flowing clinical prose (avoid bullet points unless specifically requested)
2. NEVER use the word "cancer" - use "cell abnormalities" or "abnormal cell growth" instead
3. Identify biomarkers outside reference ranges and explain their clinical significance
4. Relate findings to fertility and reproductive health
5. Generate exactly 2 follow-up questions the user might ask their doctor
6. Respond entirely in ${language === 'en' ? 'English' : language}
7. Always recommend consulting a healthcare provider for medical decisions

BIOMARKER RESULTS:
${biomarkerText}
${treatmentContext}

${contextText ? `RELEVANT MEDICAL CONTEXT:\n${contextText}` : ''}

Respond ONLY with valid JSON:
{
  "summary": "Your detailed clinical summary here...",
  "flaggedItems": ["Biomarker 1 is elevated...", "Biomarker 2 is low..."],
  "suggestedQuestions": ["Question to ask your doctor 1?", "Question to ask your doctor 2?"]
}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await groq.chat.completions.create(
      {
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Please analyze these bloodwork results and provide a fertility-focused interpretation.' },
        ],
        temperature: 0.5,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
      },
      { signal: controller.signal }
    );

    clearTimeout(timeout);

    const content = response.choices?.[0]?.message?.content;
    if (!content) return fallback;

    const parsed = JSON.parse(content);
    return {
      summary: parsed.summary || fallback.summary,
      flaggedItems: Array.isArray(parsed.flaggedItems) ? parsed.flaggedItems : [],
      suggestedQuestions: Array.isArray(parsed.suggestedQuestions)
        ? parsed.suggestedQuestions.slice(0, 2)
        : [],
    };
  } catch (err) {
    console.error('[BloodworkSynthesizer] Failed:', err.message);
    return fallback;
  }
}
