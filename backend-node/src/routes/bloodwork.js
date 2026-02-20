import { Router } from 'express';
import multer from 'multer';
import prisma from '../lib/prisma.js';
import { getLLMResponse } from '../lib/llm.js';
import { verifyJWT } from '../middleware/auth.js';
import { vectorizeBloodwork, querySimilar } from '../lib/pinecone.js';
import { encryptField, isEncryptionEnabled } from '../gdpr/encryption.js';
import { requireConsent } from '../gdpr/consentCheck.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const LANG_NAMES = {
  en: 'English', es: 'Spanish', ja: 'Japanese', hi: 'Hindi',
  ta: 'Tamil', te: 'Telugu', ml: 'Malayalam', fr: 'French', pt: 'Portuguese',
};

function buildBloodworkPrompt(langCode) {
  const langName = LANG_NAMES[langCode] || 'English';
  return `You are a medical lab analyst for reproductive health. Extract ALL lab results from the following text — every marker, not just fertility-related ones.

For each result, return:
- "name": marker name (keep medical terms in English)
- "value": the measured value
- "unit": unit of measurement
- "status": "In Range" or "Out of Range" based on standard reference ranges
- "description": a brief 1–2 sentence explanation in ${langName}: (1) what this marker measures and its general health impact, (2) its relevance to fertility and reproductive health when applicable (e.g. thyroid for cycle; glucose for PCOS; liver/kidney for overall health in pregnancy). For fertility-specific markers (FSH, LH, AMH, E2, Progesterone, TSH, Prolactin) always explain reproductive significance.

Also provide (all text in ${langName}):
- "summary": a 2-3 sentence overall summary of the report in ${langName}, including how the results relate to reproductive health where relevant.
- "fertility_note": If fertility-specific markers (FSH, LH, AMH, Estradiol/E2, Progesterone, TSH, Prolactin, Anti-Mullerian Hormone) are NOT present in the report, include a note in ${langName} explaining which specific tests the user should request from their doctor for a complete reproductive health assessment, and why each matters. If they ARE present, provide interpretation of those values for fertility in ${langName}.
- "suggested_questions": an array of exactly 3 follow-up questions in ${langName} relevant to this user's specific lab results and reproductive health.

You MUST return ONLY valid JSON. No markdown, no code fences, no explanation outside the JSON.

Example output format:
{"results":[{"name":"Hemoglobin","value":"14.2","unit":"g/dL","status":"In Range","description":"..."}],"summary":"...","fertility_note":"...","suggested_questions":["...","...","..."]}

If no lab values found, return:
{"results":[],"summary":"No lab results found in the document.","fertility_note":"","suggested_questions":[]}`;
}

function cleanJsonString(text) {
  return text
    .replace(/,\s*([}\]])/g, '$1')        // trailing commas
    .replace(/[\x00-\x1F\x7F]/g, ' ')     // control characters
    .replace(/\t/g, ' ');                  // tabs
}

function extractJSON(text) {
  try { return JSON.parse(text); } catch (_) {}

  const cleaned = cleanJsonString(text);
  try { return JSON.parse(cleaned); } catch (_) {}

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch (_) {}
    try { return JSON.parse(cleanJsonString(fenced[1].trim())); } catch (_) {}
  }

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch (_) {}
  }

  return null;
}

/**
 * POST /api/analyze-bloodwork
 * JWT required. Accept PDF file, extract text, use AI to classify In/Out of Range, save to User.
 */
router.post('/', verifyJWT, requireConsent, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'PDF file is required' });
    }

    const mime = req.file.mimetype;
    if (mime !== 'application/pdf' && !req.file.originalname.toLowerCase().endsWith('.pdf')) {
      return res.status(400).json({ error: 'Only PDF files are accepted.' });
    }

    const userId = req.userId;
    const buffer = req.file.buffer;
    const language = req.body?.language || 'en';

    let pdfText;
    try {
      const pdfParseModule = await import('pdf-parse');
      const pdfParse = pdfParseModule.default || pdfParseModule;
      const data = await pdfParse(buffer);
      pdfText = data.text || '';
    } catch (err) {
      console.error('PDF parse error:', err);
      return res.status(400).json({ error: 'Could not extract text from PDF. Ensure it is a valid PDF.' });
    }

    if (!pdfText.trim()) {
      return res.status(400).json({ error: 'No text could be extracted from the PDF.' });
    }

    const truncatedText = pdfText.slice(0, 8000);

    let bloodworkPrompt = buildBloodworkPrompt(language);
    try {
      const ragResults = await querySimilar(truncatedText.slice(0, 500), 3, {}, 'bloodwork');
      if (ragResults.length > 0) {
        const context = ragResults.map((r) => r.metadata?.text || r.metadata?.content || '').filter(Boolean).join('\n---\n');
        if (context) {
          bloodworkPrompt += `\n\nAdditional reproductive health reference context:\n${context}`;
        }
      }
    } catch (err) {
      console.error('[RAG] Bloodwork context query failed:', err.message);
    }

    console.log(`[Bloodwork] PDF text extracted: ${pdfText.length} chars, truncated to ${truncatedText.length}. First 200: ${truncatedText.slice(0, 200)}`);

    let aiResponse = await getLLMResponse(bloodworkPrompt, truncatedText, {
      temperature: 0.2,
      maxTokens: 4096,
      timeout: 50000,
      responseFormat: 'json',
    });

    let results = [];
    let summary = '';
    let fertilityNote = '';
    let suggestedQuestions = [];

    let parsed = extractJSON(aiResponse);
    if (!parsed) {
      console.warn(`[Bloodwork] First parse failed. Response length: ${aiResponse.length}. First 500 chars: ${aiResponse.slice(0, 500)}`);
      try {
        const retryResponse = await getLLMResponse(
          `Re-extract ALL lab results from this medical report text. Return ONLY a JSON object with keys: "results" (array of {name, value, unit, status, description}), "summary", "fertility_note", "suggested_questions". No other text.`,
          truncatedText,
          { temperature: 0.1, maxTokens: 4096, timeout: 50000, responseFormat: 'json' },
        );
        parsed = extractJSON(retryResponse);
      } catch (retryErr) {
        console.error('[Bloodwork] Retry LLM call failed:', retryErr.message);
      }
    }

    if (parsed) {
      results = Array.isArray(parsed.results) ? parsed.results : parsed.results ? [parsed.results] : [];
      summary = typeof parsed.summary === 'string' ? parsed.summary : '';
      fertilityNote = typeof parsed.fertility_note === 'string' ? parsed.fertility_note : '';
      suggestedQuestions = Array.isArray(parsed.suggested_questions) ? parsed.suggested_questions.slice(0, 3) : [];
    } else {
      console.error('[Bloodwork] All JSON parse attempts failed for response length:', aiResponse.length);
    }

    const normalizedResults = results.map((r) => ({
      name: String(r.name || '').trim(),
      value: String(r.value ?? '').trim(),
      unit: String(r.unit ?? '').trim(),
      status: r.status === 'Out of Range' ? 'Out of Range' : 'In Range',
      description: String(r.description || '').trim(),
    })).filter((r) => r.name);

    const encResults = isEncryptionEnabled() ? encryptField(JSON.stringify(normalizedResults)) : null;
    const encSummary = summary && isEncryptionEnabled() ? encryptField(summary) : null;
    await prisma.bloodWorkReport.create({
      data: {
        userId,
        results: normalizedResults,
        summary: summary || null,
        encryptedData: encResults ? JSON.stringify({ results: encResults, summary: encSummary }) : null,
        encryptionMeta: encResults ? { encrypted: true, version: 1 } : null,
      },
    });

    const vectorContent = normalizedResults.map((r) => `${r.name}: ${r.value} ${r.unit} (${r.status})`).join(', ');
    vectorizeBloodwork(userId, `Bloodwork: ${vectorContent}. Summary: ${summary}`);

    // Check KB coverage for each marker and log gaps (fire-and-forget)
    const markerNames = [...new Set(normalizedResults.map((r) => r.name))];
    const coveredMarkers = [];
    const uncoveredMarkers = [];
    for (const marker of markerNames) {
      try {
        const hits = await querySimilar(`${marker} reproductive health reference range`, 1, {}, 'bloodwork');
        if (hits.length > 0 && (hits[0]?.score || 0) >= 0.4) {
          coveredMarkers.push(marker);
        } else {
          uncoveredMarkers.push(marker);
          prisma.userActivity.create({
            data: {
              userId,
              type: 'knowledge_gap',
              metadata: { question: `Reference data for ${marker} in reproductive health`, category: 'Blood Work Gap', confidence: hits[0]?.score || 0, source: 'bloodwork', marker },
            },
          }).catch((e) => console.error('BW gap log error:', e));
        }
      } catch (_) {
        uncoveredMarkers.push(marker);
      }
    }

    prisma.userActivity.create({
      data: {
        userId,
        type: 'bloodwork_upload',
        metadata: {
          markers: normalizedResults.map((r) => ({ name: r.name, status: r.status })),
          markerCount: normalizedResults.length,
          coveredByKB: coveredMarkers.length,
          uncoveredByKB: uncoveredMarkers.length,
          uncoveredMarkers,
        },
      },
    }).catch((e) => console.error('Activity log error:', e));

    res.json({
      results: normalizedResults.map((r) => ({ name: r.name, value: r.value, unit: r.unit, status: r.status, description: r.description })),
      summary,
      fertility_note: fertilityNote,
      suggested_questions: suggestedQuestions,
    });
  } catch (err) {
    console.error('Analyze bloodwork error:', err);
    if (!res.headersSent) {
      const message = err?.message === 'The operation was aborted.' ? 'Analysis timed out. Please try again with a shorter document.' : (err?.message || 'Analysis failed');
      res.status(err?.message === 'The operation was aborted.' ? 503 : 500).json({ error: message });
    }
  }
});

export default router;
