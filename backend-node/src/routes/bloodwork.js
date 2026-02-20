import { Router } from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import prisma from '../lib/prisma.js';
import { getLLMResponse } from '../lib/llm.js';
import { verifyJWT } from '../middleware/auth.js';
import { vectorizeBloodwork, querySimilar } from '../lib/pinecone.js';
import { encryptField, isEncryptionEnabled } from '../gdpr/encryption.js';
import { requireConsent } from '../gdpr/consentCheck.js';
import { retrieveKB } from '../lib/retrieval.js';
import { logGap } from '../lib/gapLogger.js';

const router = Router();
const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (req, file, cb) => cb(null, `bw_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are accepted'));
    }
  },
});

const LANG_NAMES = {
  en: 'English', es: 'Spanish', ja: 'Japanese', hi: 'Hindi',
  ta: 'Tamil', te: 'Telugu', ml: 'Malayalam', fr: 'French', pt: 'Portuguese',
};

// Standard fertility panel for missing test detection
const STANDARD_FERTILITY_PANEL = [
  'FSH', 'LH', 'AMH', 'Estradiol', 'Progesterone',
  'Prolactin', 'TSH', 'Free T4', 'Testosterone',
];

function buildExtractionPrompt(langCode) {
  const langName = LANG_NAMES[langCode] || 'English';
  return `You are a medical lab analyst. Extract ALL lab results from the following text — every biomarker found.

For each result, return:
- "biomarker": marker name (keep medical terms in English)
- "value": the measured value
- "unit": unit of measurement

Return ONLY valid JSON: {"biomarkers":[{"biomarker":"...","value":"...","unit":"..."}]}

If no lab values found, return: {"biomarkers":[]}`;
}

function buildAnalysisPrompt(langCode, treatmentType) {
  const langName = LANG_NAMES[langCode] || 'English';
  const treatmentContext = treatmentType ? `\nTreatment context: ${treatmentType}` : '';

  return `You are a reproductive health specialist analyzing blood work results.${treatmentContext}

Provide:
1. A clinical interpretation of each biomarker in context of reproductive health
2. How markers relate to each other
3. Relevance to fertility treatment if applicable
4. Areas of concern or positive indicators

Use flowing clinical prose (no bullet points unless requested).
Do NOT use the word "cancer" - use "cell abnormalities" or "abnormal cell growth" instead.

Respond entirely in ${langName}. All text in ${langName}.

At the end, generate exactly 3 contextual follow-up questions the user might ask:
[Q1] First question
[Q2] Second question
[Q3] Third question

Also include citations to the knowledge base sources used (if any).`;
}

function extractJSON(text) {
  try { return JSON.parse(text); } catch (_) {}

  const cleaned = text
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .replace(/\t/g, ' ');
  try { return JSON.parse(cleaned); } catch (_) {}

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch (_) {}
  }

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch (_) {}
  }

  return null;
}

function parseFollowUpQuestions(text) {
  const questions = [];
  const regex = /\[Q[1-3]\]\s*(.+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    questions.push(match[1].trim());
  }
  const cleanedText = text.replace(/\[Q[1-3]\]\s*.+/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return { cleanedText, questions };
}

/**
 * POST /api/upload-bloodwork
 * Accept PDF (<5MB), extract biomarkers, immediately delete PDF.
 * Returns: { extracted: [...], missing_tests: [...] }
 */
router.post('/upload', verifyJWT, requireConsent, upload.single('file'), async (req, res) => {
  let filePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'PDF file is required' });
    }

    filePath = req.file.path;
    const userId = req.userId;
    const language = req.body?.language || 'en';

    // Parse PDF
    let pdfText;
    try {
      const buffer = await fs.readFile(filePath);
      const pdfParseModule = await import('pdf-parse');
      const pdfParse = pdfParseModule.default || pdfParseModule;
      const data = await pdfParse(buffer);
      pdfText = data.text || '';
    } catch (err) {
      console.error('PDF parse error:', err);
      return res.status(400).json({ error: 'Could not extract text from PDF. Ensure it is a valid PDF.' });
    } finally {
      // IMMEDIATELY delete PDF after parsing (GDPR: no PII storage)
      try {
        await fs.unlink(filePath);
        filePath = null;
        console.log('[Bloodwork] PDF deleted immediately after extraction');
      } catch (unlinkErr) {
        console.error('[Bloodwork] Failed to delete PDF:', unlinkErr.message);
      }
    }

    if (!pdfText.trim()) {
      return res.status(400).json({ error: 'No text could be extracted from the PDF.' });
    }

    const truncatedText = pdfText.slice(0, 8000);

    // Extract biomarkers using LLM
    const extractionPrompt = buildExtractionPrompt(language);
    const aiResponse = await getLLMResponse(extractionPrompt, truncatedText, {
      temperature: 0.1,
      maxTokens: 2048,
      timeout: 30000,
      responseFormat: 'json',
    });

    let extracted = [];
    const parsed = extractJSON(aiResponse);
    if (parsed && Array.isArray(parsed.biomarkers)) {
      extracted = parsed.biomarkers
        .filter((b) => b.biomarker && b.value)
        .map((b) => ({
          biomarker: String(b.biomarker).trim(),
          value: String(b.value).trim(),
          unit: String(b.unit || '').trim(),
        }));
    }

    // Identify missing fertility panel tests
    const extractedNames = new Set(extracted.map((b) => b.biomarker.toLowerCase()));
    const missing_tests = STANDARD_FERTILITY_PANEL.filter(
      (test) => !extractedNames.has(test.toLowerCase()) &&
               !Array.from(extractedNames).some((e) => e.includes(test.toLowerCase()) || test.toLowerCase().includes(e))
    );

    // Log activity (fire-and-forget)
    prisma.userActivity.create({
      data: {
        userId,
        type: 'bloodwork_upload',
        metadata: {
          extracted_count: extracted.length,
          missing_tests,
          language,
        },
      },
    }).catch((e) => console.error('Activity log error:', e));

    res.json({
      extracted,
      missing_tests,
      extraction_count: extracted.length,
    });
  } catch (err) {
    console.error('Upload bloodwork error:', err);
    res.status(500).json({ error: err?.message || 'Upload failed' });
  } finally {
    // Ensure PDF is deleted even on error
    if (filePath) {
      try {
        await fs.unlink(filePath);
      } catch (_) {}
    }
  }
});

/**
 * POST /api/analyze-bloodwork
 * Accept JSON body: { biomarkers: [...], treatment_type: "IVF" }
 * Synthesize query from biomarkers + treatment, route through KB retrieval + Cohere reranker.
 * Returns: { interpretation, citations, suggested_questions }
 */
router.post('/analyze', verifyJWT, requireConsent, async (req, res) => {
  try {
    const { biomarkers, treatment_type, language = 'en' } = req.body;

    if (!biomarkers || !Array.isArray(biomarkers) || biomarkers.length === 0) {
      return res.status(400).json({ error: 'biomarkers array is required' });
    }

    const userId = req.userId;

    // Synthesize query from biomarkers for KB retrieval
    const biomarkerSummary = biomarkers
      .map((b) => `${b.biomarker}: ${b.value} ${b.unit || ''}`.trim())
      .join(', ');
    const synthesizedQuery = treatment_type
      ? `Interpret blood work results for ${treatment_type} treatment: ${biomarkerSummary}`
      : `Interpret reproductive health blood work results: ${biomarkerSummary}`;

    // Retrieve KB context with enhanced pipeline (query expansion + reranking)
    const retrievalResult = await retrieveKB(synthesizedQuery);
    const kbContext = retrievalResult.kb_final_context || [];

    // Check if all results are below threshold (gap)
    if (retrievalResult.all_below_threshold || kbContext.length === 0) {
      // Log gap asynchronously
      logGap({
        query: synthesizedQuery,
        treatment: treatment_type,
        highest_score: retrievalResult.kb_dense_candidates?.[0]?.score || 0,
        missing_tests: [],
        source: 'bloodwork_analyze',
      });
    }

    // Build analysis prompt with KB context
    let analysisPrompt = buildAnalysisPrompt(language, treatment_type);
    if (kbContext.length > 0) {
      const contextText = kbContext.map((c) => c.text).filter(Boolean).join('\n---\n');
      analysisPrompt += `\n\nUse the following verified medical context from the knowledge base:\n${contextText}`;
    }

    // Format biomarkers for LLM
    const biomarkersText = biomarkers
      .map((b) => `${b.biomarker}: ${b.value} ${b.unit || ''}`)
      .join('\n');

    // Get LLM analysis
    const aiResponse = await getLLMResponse(analysisPrompt, biomarkersText, {
      temperature: 0.3,
      maxTokens: 2048,
      timeout: 50000,
    });

    const { cleanedText: interpretation, questions: suggested_questions } = parseFollowUpQuestions(aiResponse);

    // Extract citations from KB context
    const citations = [...new Set(kbContext.map((c) => c.doc_id).filter(Boolean))];

    // Store bloodwork report
    const normalizedResults = biomarkers.map((b) => ({
      name: String(b.biomarker || '').trim(),
      value: String(b.value || '').trim(),
      unit: String(b.unit || '').trim(),
      status: 'Unknown', // Status determined by LLM interpretation
    }));

    const encResults = isEncryptionEnabled() ? encryptField(JSON.stringify(normalizedResults)) : null;
    await prisma.bloodWorkReport.create({
      data: {
        userId,
        results: normalizedResults,
        summary: interpretation.slice(0, 500),
        encryptedData: encResults ? JSON.stringify({ results: encResults }) : null,
        encryptionMeta: encResults ? { encrypted: true, version: 1 } : null,
      },
    });

    // Vectorize for memory
    const vectorContent = normalizedResults.map((r) => `${r.name}: ${r.value} ${r.unit}`).join(', ');
    vectorizeBloodwork(userId, `Bloodwork: ${vectorContent}. Treatment: ${treatment_type || 'General'}`);

    // Log activity
    prisma.userActivity.create({
      data: {
        userId,
        type: 'bloodwork_analyze',
        metadata: {
          markers: normalizedResults.map((r) => r.name),
          treatment_type,
          kb_context_count: kbContext.length,
          rerank_used: retrievalResult.rerank_used,
          expansion_used: retrievalResult.expansion_used,
        },
      },
    }).catch((e) => console.error('Activity log error:', e));

    res.json({
      interpretation,
      citations,
      suggested_questions: suggested_questions.slice(0, 3),
      kb_coverage: kbContext.length > 0,
    });
  } catch (err) {
    console.error('Analyze bloodwork error:', err);
    const message = err?.message === 'The operation was aborted.'
      ? 'Analysis timed out. Please try again.'
      : (err?.message || 'Analysis failed');
    res.status(err?.message === 'The operation was aborted.' ? 503 : 500).json({ error: message });
  }
});

/**
 * POST /api/analyze-bloodwork (legacy endpoint - maintains backward compatibility)
 * Accept PDF file, extract + analyze in one step.
 */
router.post('/', verifyJWT, requireConsent, upload.single('file'), async (req, res) => {
  let filePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'PDF file is required' });
    }

    filePath = req.file.path;
    const userId = req.userId;
    const language = req.body?.language || 'en';

    // Parse PDF
    let pdfText;
    try {
      const buffer = await fs.readFile(filePath);
      const pdfParseModule = await import('pdf-parse');
      const pdfParse = pdfParseModule.default || pdfParseModule;
      const data = await pdfParse(buffer);
      pdfText = data.text || '';
    } catch (err) {
      console.error('PDF parse error:', err);
      return res.status(400).json({ error: 'Could not extract text from PDF. Ensure it is a valid PDF.' });
    } finally {
      // IMMEDIATELY delete PDF after parsing
      try {
        await fs.unlink(filePath);
        filePath = null;
      } catch (unlinkErr) {
        console.error('[Bloodwork] Failed to delete PDF:', unlinkErr.message);
      }
    }

    if (!pdfText.trim()) {
      return res.status(400).json({ error: 'No text could be extracted from the PDF.' });
    }

    const truncatedText = pdfText.slice(0, 8000);

    // Build full analysis prompt
    const langName = LANG_NAMES[language] || 'English';
    let bloodworkPrompt = `You are a medical lab analyst for reproductive health. Extract ALL lab results from the following text — every marker, not just fertility-related ones.

For each result, return:
- "name": marker name (keep medical terms in English)
- "value": the measured value
- "unit": unit of measurement
- "status": "In Range" or "Out of Range" based on standard reference ranges
- "description": a brief 1–2 sentence explanation in ${langName}

Also provide (all text in ${langName}):
- "summary": a 2-3 sentence overall summary
- "fertility_note": interpretation for fertility
- "suggested_questions": array of exactly 3 follow-up questions

Return ONLY valid JSON. No markdown, no code fences.`;

    // Add RAG context
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

    const aiResponse = await getLLMResponse(bloodworkPrompt, truncatedText, {
      temperature: 0.2,
      maxTokens: 4096,
      timeout: 50000,
      responseFormat: 'json',
    });

    let results = [];
    let summary = '';
    let fertilityNote = '';
    let suggestedQuestions = [];

    const parsed = extractJSON(aiResponse);
    if (parsed) {
      results = Array.isArray(parsed.results) ? parsed.results : [];
      summary = typeof parsed.summary === 'string' ? parsed.summary : '';
      fertilityNote = typeof parsed.fertility_note === 'string' ? parsed.fertility_note : '';
      suggestedQuestions = Array.isArray(parsed.suggested_questions) ? parsed.suggested_questions.slice(0, 3) : [];
    }

    const normalizedResults = results.map((r) => ({
      name: String(r.name || '').trim(),
      value: String(r.value ?? '').trim(),
      unit: String(r.unit ?? '').trim(),
      status: r.status === 'Out of Range' ? 'Out of Range' : 'In Range',
      description: String(r.description || '').trim(),
    })).filter((r) => r.name);

    // Store and vectorize
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

    prisma.userActivity.create({
      data: {
        userId,
        type: 'bloodwork_upload',
        metadata: {
          markers: normalizedResults.map((r) => ({ name: r.name, status: r.status })),
          markerCount: normalizedResults.length,
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
      const message = err?.message === 'The operation was aborted.'
        ? 'Analysis timed out. Please try again with a shorter document.'
        : (err?.message || 'Analysis failed');
      res.status(err?.message === 'The operation was aborted.' ? 503 : 500).json({ error: message });
    }
  } finally {
    if (filePath) {
      try { await fs.unlink(filePath); } catch (_) {}
    }
  }
});

export default router;
