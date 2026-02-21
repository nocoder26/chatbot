/**
 * Biomarker Extraction Agent: Extracts structured biomarker data from PDF text.
 * Model: llama-3.1-8b-instant (fast, JSON mode)
 * Output: { results: [{ biomarker, value, unit, referenceRange, isNormal }] }
 */
import Groq from 'groq-sdk';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MODEL = 'llama-3.1-8b-instant';
const TIMEOUT_MS = 8000;

let groq = null;
if (GROQ_API_KEY) {
  groq = new Groq({ apiKey: GROQ_API_KEY });
}

/**
 * Check if extractor is available.
 */
export function isExtractorAvailable() {
  return !!groq;
}

/**
 * Extract biomarkers from raw PDF text.
 * @param {string} pdfText - Raw text extracted from PDF
 * @returns {Promise<{ results: Array<{ biomarker: string, value: string, unit: string, referenceRange: string, isNormal: boolean }> }>}
 */
export async function extractBiomarkers(pdfText) {
  const fallback = { results: [] };

  if (!groq || !pdfText?.trim()) {
    return fallback;
  }

  const systemPrompt = `You are a medical lab report parser. Extract ALL biomarkers/test results from the provided lab report text.

For each biomarker found, extract:
- biomarker: The test name (e.g., "FSH", "LH", "AMH", "Estradiol", "TSH")
- value: The numeric or text result
- unit: The measurement unit (e.g., "mIU/mL", "pg/mL", "ng/dL")
- referenceRange: The normal range if provided (e.g., "2.5-10.2")
- isNormal: Boolean indicating if the value is within reference range

Focus on fertility-related markers: FSH, LH, AMH, Estradiol, Progesterone, Prolactin, TSH, Free T4, Testosterone, DHEA-S, Vitamin D, Iron, Ferritin, B12, Folate, CBC components.

Respond ONLY with valid JSON:
{
  "results": [
    {
      "biomarker": "FSH",
      "value": "6.5",
      "unit": "mIU/mL",
      "referenceRange": "3.5-12.5",
      "isNormal": true
    }
  ]
}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    // Truncate PDF text to avoid token limits
    const truncatedText = pdfText.slice(0, 8000);

    const response = await groq.chat.completions.create(
      {
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Lab Report Text:\n${truncatedText}` },
        ],
        temperature: 0.1,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      },
      { signal: controller.signal }
    );

    clearTimeout(timeout);

    const content = response.choices?.[0]?.message?.content;
    if (!content) return fallback;

    const parsed = JSON.parse(content);
    return {
      results: Array.isArray(parsed.results) ? parsed.results : [],
    };
  } catch (err) {
    console.warn('[BiomarkerExtractor] Failed:', err.message);
    return fallback;
  }
}

/**
 * Standard fertility panel for missing test detection.
 */
export const STANDARD_FERTILITY_PANEL = [
  'FSH', 'LH', 'AMH', 'Estradiol', 'Progesterone',
  'Prolactin', 'TSH', 'Free T4', 'Testosterone',
];

/**
 * Identify missing tests from standard panel.
 * @param {Array} extractedResults - Extracted biomarker results
 * @returns {string[]} - List of missing test names
 */
export function identifyMissingTests(extractedResults) {
  const extractedNames = new Set(
    extractedResults.map((r) => r.biomarker?.toLowerCase()).filter(Boolean)
  );

  return STANDARD_FERTILITY_PANEL.filter(
    (test) => !extractedNames.has(test.toLowerCase())
  );
}
