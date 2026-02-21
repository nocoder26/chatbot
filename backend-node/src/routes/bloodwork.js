/**
 * Bloodwork Route - Refactored with Parallel Micro-Agent Architecture
 * Pipeline: PDF Extract → Biomarker Extractor Agent → Parallel(Vectorize + Synthesizer)
 */
import { Router } from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import os from 'os';
import prisma from '../lib/prisma.js';
import { getLLMResponse } from '../lib/llm.js';
import { verifyJWT } from '../middleware/auth.js';
import { vectorizeBloodwork, querySimilar } from '../lib/pinecone.js';
import { encryptField, isEncryptionEnabled } from '../gdpr/encryption.js';
import { requireConsent } from '../gdpr/consentCheck.js';
import { logGap } from '../lib/gapLogger.js';

// Micro-Agents
import { extractBiomarkers, isExtractorAvailable, identifyMissingTests, STANDARD_FERTILITY_PANEL } from '../agents/biomarkerExtractor.js';
import { synthesizeBloodworkAnalysis, isBloodworkSynthesizerAvailable } from '../agents/bloodworkSynthesizer.js';
import { executeRetrievalSwarm } from '../agents/retrievalSwarm.js';

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

function extractJSON(text) {
  try { return JSON.parse(text); } catch (_) {}
  const cleaned = text.replace(/,\s*([}\]])/g, '$1').replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\t/g, ' ');
  try { return JSON.parse(cleaned); } catch (_) {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch (_) {} }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end > start) { try { return JSON.parse(cleaned.slice(start, end + 1)); } catch (_) {} }
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
 * Micro-Agent Pipeline:
 * 1. Parse PDF
 * 2. Biomarker Extraction Agent (llama-3.1-8b, JSON mode)
 * 3. Identify missing tests
 * Returns: { extracted, missing_tests }
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

    // Step 1: Parse PDF
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
      // IMMEDIATELY delete PDF after parsing (GDPR)
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

    // Step 2: AGENT - Biomarker Extraction (llama-3.1-8b, JSON mode)
    let extractionResult;
    try {
      if (isExtractorAvailable()) {
        extractionResult = await extractBiomarkers(pdfText);
      } else {
        // Fallback to LLM without JSON mode
        const truncatedText = pdfText.slice(0, 8000);
        const extractionPrompt = `You are a medical lab analyst. Extract ALL lab results from the following text.
For each result, return:
- "biomarker": marker name
- "value": the measured value
- "unit": unit of measurement
- "referenceRange": normal range if found
- "isNormal": boolean

Return ONLY valid JSON: {"results":[...]}`;

        const aiResponse = await getLLMResponse(extractionPrompt, truncatedText, {
          temperature: 0.1,
          maxTokens: 2048,
          timeout: 30000,
          responseFormat: 'json',
        });

        const parsed = extractJSON(aiResponse);
        extractionResult = {
          results: Array.isArray(parsed?.results) ? parsed.results :
                   Array.isArray(parsed?.biomarkers) ? parsed.biomarkers : [],
        };
      }
    } catch (err) {
      console.warn('[Bloodwork] Extraction agent failed:', err.message);
      extractionResult = { results: [] };
    }

    const extracted = extractionResult.results.filter((b) => b.biomarker && b.value).map((b) => ({
      biomarker: String(b.biomarker).trim(),
      value: String(b.value).trim(),
      unit: String(b.unit || '').trim(),
      referenceRange: String(b.referenceRange || '').trim(),
      isNormal: b.isNormal ?? null,
    }));

    // Step 3: Identify missing tests
    const missing_tests = identifyMissingTests(extracted);

    // Log activity (fire-and-forget)
    prisma.userActivity.create({
      data: {
        userId,
        type: 'bloodwork_upload',
        metadata: { extracted_count: extracted.length, missing_tests, language },
      },
    }).catch(() => {});

    res.json({
      extracted,
      missing_tests,
      extraction_count: extracted.length,
    });
  } catch (err) {
    console.error('Upload bloodwork error:', err);
    res.status(500).json({ error: err?.message || 'Upload failed' });
  } finally {
    if (filePath) {
      try { await fs.unlink(filePath); } catch (_) {}
    }
  }
});

/**
 * POST /api/analyze-bloodwork
 * Micro-Agent Pipeline:
 * 1. Retrieval Swarm for KB context
 * 2. PARALLEL: Pinecone vectorization + Bloodwork Synthesizer Agent
 * Returns: { summary, flaggedItems, suggestedQuestions, citations }
 */
router.post('/analyze', verifyJWT, requireConsent, async (req, res) => {
  try {
    const { biomarkers, treatment_type, language = 'en' } = req.body;

    if (!biomarkers || !Array.isArray(biomarkers) || biomarkers.length === 0) {
      return res.status(400).json({ error: 'biomarkers array is required' });
    }

    const userId = req.userId;

    // Synthesize search queries from biomarkers
    const biomarkerSummary = biomarkers
      .map((b) => `${b.biomarker}: ${b.value} ${b.unit || ''}`.trim())
      .join(', ');

    const searchQueries = [
      treatment_type
        ? `${treatment_type} blood work interpretation ${biomarkers.map(b => b.biomarker).slice(0, 3).join(' ')}`
        : `fertility blood work interpretation ${biomarkers.map(b => b.biomarker).slice(0, 3).join(' ')}`,
      `reproductive health biomarkers ${biomarkers.map(b => b.biomarker).slice(0, 3).join(' ')}`,
    ];

    // Step 1: Retrieval Swarm for KB context
    let kbChunks = [];
    try {
      const retrievalResult = await executeRetrievalSwarm(searchQueries, biomarkerSummary);
      kbChunks = retrievalResult.chunks || [];

      // Log gap if no context
      if (kbChunks.length === 0 || retrievalResult.allBelowThreshold) {
        logGap({
          query: biomarkerSummary,
          treatment: treatment_type,
          highest_score: kbChunks[0]?.score || 0,
          source: 'bloodwork_analyze',
        });
      }
    } catch (err) {
      console.warn('[Bloodwork] Retrieval swarm failed:', err.message);
    }

    // Step 2: PARALLEL - Vectorization + Synthesizer
    const vectorContent = biomarkers.map((b) => `${b.biomarker}: ${b.value} ${b.unit || ''}`).join(', ');

    const [synthResult] = await Promise.all([
      // Bloodwork Synthesizer Agent (llama-3.3-70b, JSON mode)
      (async () => {
        try {
          if (isBloodworkSynthesizerAvailable()) {
            return await synthesizeBloodworkAnalysis(biomarkers, treatment_type, kbChunks, language);
          } else {
            // Fallback to standard LLM
            const langName = LANG_NAMES[language] || 'English';
            const treatmentContext = treatment_type ? `\nTreatment context: ${treatment_type}` : '';
            const kbContextText = kbChunks.map((c) => c.text).filter(Boolean).join('\n---\n');

            let analysisPrompt = `You are a reproductive health specialist analyzing blood work.${treatmentContext}

Provide a clinical interpretation focusing on fertility. Use flowing prose.
Do NOT use the word "cancer" - use "cell abnormalities" instead.
Respond in ${langName}.

At the end, provide:
[Q1] First follow-up question
[Q2] Second follow-up question`;

            if (kbContextText) {
              analysisPrompt += `\n\nMedical reference context:\n${kbContextText}`;
            }

            const biomarkersText = biomarkers.map((b) => `${b.biomarker}: ${b.value} ${b.unit || ''}`).join('\n');
            const aiResponse = await getLLMResponse(analysisPrompt, biomarkersText, {
              temperature: 0.3,
              maxTokens: 1500,
              timeout: 25000,
            });

            const { cleanedText, questions } = parseFollowUpQuestions(aiResponse);

            // Identify flagged items
            const flagged = biomarkers.filter((b) => b.isNormal === false).map((b) => b.biomarker);

            return {
              summary: cleanedText,
              flaggedItems: flagged,
              suggestedQuestions: questions.slice(0, 2),
            };
          }
        } catch (err) {
          console.error('[Bloodwork] Synthesizer failed:', err.message);
          return {
            summary: "Unable to generate analysis. Please consult your healthcare provider.",
            flaggedItems: [],
            suggestedQuestions: [],
          };
        }
      })(),

      // Pinecone vectorization (fire-and-forget, catch silently)
      (async () => {
        try {
          if (vectorContent.length > 0) {
            await vectorizeBloodwork(userId, `Bloodwork: ${vectorContent}. Treatment: ${treatment_type || 'General'}`);
          }
        } catch (err) {
          console.warn('[Bloodwork] Vectorization failed (non-blocking):', err.message);
        }
        return null;
      })(),
    ]);

    // Store bloodwork report
    const normalizedResults = biomarkers.map((b) => ({
      name: String(b.biomarker || '').trim(),
      value: String(b.value || '').trim(),
      unit: String(b.unit || '').trim(),
      status: b.isNormal === false ? 'Flagged' : b.isNormal === true ? 'Normal' : 'Unknown',
    }));

    try {
      const encResults = isEncryptionEnabled() ? encryptField(JSON.stringify(normalizedResults)) : null;
      await prisma.bloodWorkReport.create({
        data: {
          userId,
          results: normalizedResults,
          summary: synthResult.summary?.slice(0, 500) || '',
          encryptedData: encResults ? JSON.stringify({ results: encResults }) : null,
          encryptionMeta: encResults ? { encrypted: true, version: 1 } : null,
        },
      });
    } catch (err) {
      console.warn('[Bloodwork] Report save failed:', err.message);
    }

    // Log activity (fire-and-forget)
    prisma.userActivity.create({
      data: {
        userId,
        type: 'bloodwork_analyze',
        metadata: {
          markers: normalizedResults.map((r) => r.name),
          treatment_type,
          kb_context_count: kbChunks.length,
        },
      },
    }).catch(() => {});

    // Extract citations
    const citations = [...new Set(kbChunks.map((c) => c.doc_id).filter(Boolean))];

    res.json({
      summary: synthResult.summary,
      interpretation: synthResult.summary, // Alias for backward compatibility
      flaggedItems: synthResult.flaggedItems || [],
      suggestedQuestions: synthResult.suggestedQuestions || [],
      suggested_questions: synthResult.suggestedQuestions || [], // Alias
      citations,
      kb_coverage: kbChunks.length > 0,
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
 * POST /api/analyze-bloodwork (legacy endpoint - PDF upload + analyze)
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

    // Step 1: Parse PDF
    let pdfText;
    try {
      const buffer = await fs.readFile(filePath);
      const pdfParseModule = await import('pdf-parse');
      const pdfParse = pdfParseModule.default || pdfParseModule;
      const data = await pdfParse(buffer);
      pdfText = data.text || '';
    } catch (err) {
      console.error('PDF parse error:', err);
      return res.status(400).json({ error: 'Could not extract text from PDF.' });
    } finally {
      try {
        await fs.unlink(filePath);
        filePath = null;
      } catch (_) {}
    }

    if (!pdfText.trim()) {
      return res.status(400).json({ error: 'No text could be extracted from the PDF.' });
    }

    // Step 2: AGENT - Extract biomarkers
    let biomarkers = [];
    try {
      if (isExtractorAvailable()) {
        const extractionResult = await extractBiomarkers(pdfText);
        biomarkers = extractionResult.results || [];
      } else {
        // Fallback
        const truncatedText = pdfText.slice(0, 8000);
        const langName = LANG_NAMES[language] || 'English';
        const prompt = `You are a medical lab analyst. Extract ALL lab results.
Return JSON: {"results":[{"name":"...","value":"...","unit":"...","status":"In Range"|"Out of Range","description":"..."}]}
Also include "summary", "fertility_note", "suggested_questions" array.
Respond in ${langName}.`;

        const aiResponse = await getLLMResponse(prompt, truncatedText, {
          temperature: 0.2,
          maxTokens: 4096,
          timeout: 50000,
          responseFormat: 'json',
        });

        const parsed = extractJSON(aiResponse);
        if (parsed) {
          const results = Array.isArray(parsed.results) ? parsed.results : [];
          const summary = parsed.summary || '';
          const fertilityNote = parsed.fertility_note || '';
          const suggestedQuestions = parsed.suggested_questions || [];

          // Normalize and store
          const normalizedResults = results.map((r) => ({
            name: String(r.name || r.biomarker || '').trim(),
            value: String(r.value ?? '').trim(),
            unit: String(r.unit ?? '').trim(),
            status: r.status || (r.isNormal === false ? 'Out of Range' : 'In Range'),
            description: String(r.description || '').trim(),
          })).filter((r) => r.name);

          // Store report
          try {
            const encResults = isEncryptionEnabled() ? encryptField(JSON.stringify(normalizedResults)) : null;
            await prisma.bloodWorkReport.create({
              data: {
                userId,
                results: normalizedResults,
                summary: summary || null,
                encryptedData: encResults ? JSON.stringify({ results: encResults }) : null,
                encryptionMeta: encResults ? { encrypted: true, version: 1 } : null,
              },
            });
          } catch (err) {
            console.warn('[Bloodwork] Report save failed:', err.message);
          }

          // Vectorize (fire-and-forget with length check)
          const vectorContent = normalizedResults.map((r) => `${r.name}: ${r.value} ${r.unit}`).join(', ');
          if (vectorContent.length > 0) {
            try {
              vectorizeBloodwork(userId, `Bloodwork: ${vectorContent}. Summary: ${summary}`);
            } catch (_) {}
          }

          prisma.userActivity.create({
            data: {
              userId,
              type: 'bloodwork_upload',
              metadata: { markerCount: normalizedResults.length },
            },
          }).catch(() => {});

          return res.json({
            results: normalizedResults.map((r) => ({
              name: r.name,
              value: r.value,
              unit: r.unit,
              status: r.status,
              description: r.description,
            })),
            summary,
            fertility_note: fertilityNote,
            suggested_questions: suggestedQuestions.slice(0, 3),
          });
        }
      }

      // Convert extraction agent results to legacy format
      biomarkers = biomarkers.map((b) => ({
        biomarker: b.biomarker,
        value: b.value,
        unit: b.unit || '',
        isNormal: b.isNormal,
        referenceRange: b.referenceRange || '',
      }));
    } catch (err) {
      console.warn('[Bloodwork] Extraction failed:', err.message);
    }

    if (biomarkers.length === 0) {
      return res.json({
        results: [],
        summary: 'No biomarkers could be extracted from the document.',
        fertility_note: '',
        suggested_questions: [],
      });
    }

    // Step 3: PARALLEL - Synthesize + Vectorize
    const vectorContent = biomarkers.map((b) => `${b.biomarker}: ${b.value} ${b.unit || ''}`).join(', ');

    const [synthResult] = await Promise.all([
      (async () => {
        try {
          if (isBloodworkSynthesizerAvailable()) {
            return await synthesizeBloodworkAnalysis(biomarkers, null, [], language);
          }
          return { summary: '', flaggedItems: [], suggestedQuestions: [] };
        } catch (err) {
          console.warn('[Bloodwork] Synthesizer failed:', err.message);
          return { summary: '', flaggedItems: [], suggestedQuestions: [] };
        }
      })(),
      (async () => {
        if (vectorContent.length > 0) {
          try {
            await vectorizeBloodwork(userId, `Bloodwork: ${vectorContent}`);
          } catch (_) {}
        }
      })(),
    ]);

    // Store report
    const normalizedResults = biomarkers.map((b) => ({
      name: String(b.biomarker || '').trim(),
      value: String(b.value || '').trim(),
      unit: String(b.unit || '').trim(),
      status: b.isNormal === false ? 'Out of Range' : 'In Range',
      description: '',
    }));

    try {
      const encResults = isEncryptionEnabled() ? encryptField(JSON.stringify(normalizedResults)) : null;
      await prisma.bloodWorkReport.create({
        data: {
          userId,
          results: normalizedResults,
          summary: synthResult.summary?.slice(0, 500) || null,
          encryptedData: encResults ? JSON.stringify({ results: encResults }) : null,
          encryptionMeta: encResults ? { encrypted: true, version: 1 } : null,
        },
      });
    } catch (_) {}

    prisma.userActivity.create({
      data: {
        userId,
        type: 'bloodwork_upload',
        metadata: { markerCount: normalizedResults.length },
      },
    }).catch(() => {});

    res.json({
      results: normalizedResults,
      summary: synthResult.summary || '',
      fertility_note: '',
      suggested_questions: synthResult.suggestedQuestions || [],
    });
  } catch (err) {
    console.error('Analyze bloodwork error:', err);
    if (!res.headersSent) {
      const message = err?.message === 'The operation was aborted.'
        ? 'Analysis timed out. Please try again.'
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
