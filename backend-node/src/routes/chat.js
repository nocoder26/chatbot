/**
 * Chat Route - Refactored with Parallel Micro-Agent Architecture
 * Pipeline: Triage → Retrieval Swarm → Clinical Synthesizer
 */
import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { streamLLMResponse, getLLMResponse } from '../lib/llm.js';
import { verifyJWT } from '../middleware/auth.js';
import { vectorizeAndStore, queryConversationMemory, queryBloodworkMemory } from '../lib/pinecone.js';
import { hashUserId } from '../gdpr/sanitizer.js';
import { checkSufficiency } from '../lib/sufficiency.js';
import { encryptField, decryptField, isEncryptionEnabled } from '../gdpr/encryption.js';
import { requireConsent } from '../gdpr/consentCheck.js';
import { getPromptAdjustments } from '../lib/promptRouter.js';
import * as sessionManager from '../lib/sessionManager.js';
import { logGap } from '../lib/gapLogger.js';
import { queryCachedAnswer, upsertCachedAnswer, isCacheAvailable } from '../lib/semanticCachePinecone.js';

// Micro-Agents
// Add BloodworkEvaluationSwarm import
import { triageQuery, isTriageAvailable } from '../agents/triageAgent.js';
import { executeRetrievalSwarm } from '../agents/retrievalSwarm.js';
import { synthesizeResponse, synthesizeResponseStream, generateFollowUpQuestions, formatCitation, isSynthesizerAvailable } from '../agents/clinicalSynthesizer.js';
import { evaluateBloodworkKnowledgeGap } from '../agents/bloodworkEvaluationSwarm.js';

const router = Router();

const LANG_NAMES = {
  en: 'English', es: 'Spanish', ja: 'Japanese', hi: 'Hindi',
  ta: 'Tamil', te: 'Telugu', ml: 'Malayalam', fr: 'French', pt: 'Portuguese',
};

function buildSystemPrompt(langCode) {
  const langName = LANG_NAMES[langCode] || 'English';
  return `You are Izana, a compassionate and knowledgeable health assistant specializing in fertility and reproductive health.
You provide evidence-based, caring responses while respecting user privacy.

Guidelines:
- Use flowing clinical prose (avoid bullet points unless specifically requested)
- IMPORTANT: Never use the word "cancer" - instead use "cell abnormalities", "abnormal cell growth", or similar phrases
- Be empathetic and supportive while remaining medically accurate
- Cite knowledge base sources when available

Respond entirely in ${langName}. All text and follow-ups must be in ${langName}.

At the end of your response, provide exactly 3 contextual follow-up questions the user might want to ask. Format:
[Q1] First question
[Q2] Second question
[Q3] Third question`;
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
 * GET /api/chat/:chatId/messages
 */
router.get('/:chatId/messages', verifyJWT, async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.userId;
    const chat = await prisma.chat.findFirst({
      where: { id: chatId, userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    const messages = chat.messages.map((m) => {
      let content = m.content;
      if (m.encryptionMeta?.encrypted && m.encryptedData) {
        try {
          const decrypted = decryptField(JSON.parse(m.encryptedData));
          if (decrypted != null) content = decrypted;
        } catch (e) {
          console.error('[Chat] Decrypt message error:', e.message);
        }
      }
      return { id: m.id, role: m.role, content, createdAt: m.createdAt };
    });
    return res.json({ chatId: chat.id, title: chat.title, messages });
  } catch (err) {
    console.error('Get chat messages error:', err);
    return res.status(500).json({ error: 'Failed to load messages' });
  }
});

/**
 * POST /api/chat - Micro-Agent Pipeline
 * 1. Triage Agent: Validate query + generate search queries
 * 2. Retrieval Swarm: Parallel Pinecone searches + Cohere rerank
 * 3. Clinical Synthesizer: Generate response with citations
 */
// Remove duplicate declaration
// Declare triageResult at the top of the route handler
var triageResult = null;

router.post('/', verifyJWT, requireConsent, async (req, res) => {
  try {
    // Extract request parameters
    const { message, language = 'en', stream = false, chatId, clinical_data, treatment, title } = req.body;
    const userId = req.userId;
    const queryText = (message || '').trim();

    if (!queryText) {
      return res.status(400).json({ error: 'message is required' });
    }

    // Session management
    const hashedUserId = hashUserId(userId);
    let session = await sessionManager.getSession(hashedUserId);
    if (!session) {
      session = await sessionManager.createSession(hashedUserId);
    }
    const activeSessionId = session?.session_id;

    // Check semantic cache first
    if (isCacheAvailable()) {
      try {
        const cacheResult = await queryCachedAnswer(queryText, language);
        if (cacheResult.hit && cacheResult.answer) {
          const { cleanedText, questions } = parseFollowUpQuestions(cacheResult.answer);
          if (stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();
            res.write(`data: ${JSON.stringify({ text: cleanedText, cached: true })}\n\n`);
            res.write(`data: ${JSON.stringify({
              isDone: true,
              citations: [],
              followUpQuestions: questions,
              session_id: activeSessionId,
            })}\n\n`);
            res.end();
          } else {
            res.json({
              response: cleanedText,
              suggested_questions: questions,
              citations: [],
              cached: true,
              session_id: activeSessionId,
            });
          }
          return;
        }
      } catch (cacheErr) {
        console.warn('[Chat] Semantic cache check failed:', cacheErr.message);
      }
    }

    // Build effective message with clinical context
    let effectiveMessage = queryText;
    if (clinical_data?.results && Array.isArray(clinical_data.results)) {
      const labLines = clinical_data.results.map((r) => `${r.name || 'Marker'}: ${r.value || ''} ${r.unit || ''}`).filter(Boolean);
      if (labLines.length) {
        effectiveMessage += '\n\n[Attached lab results:]\n' + labLines.join('\n');
      }
    }
    if (treatment && typeof treatment === 'string' && treatment.trim()) {
      effectiveMessage += '\n\nTreatment context: ' + treatment.trim();
    }

    // Resolve or create chat
    let chat;
    if (chatId) {
      chat = await prisma.chat.findFirst({ where: { id: chatId, userId } });
      if (!chat) return res.status(404).json({ error: 'Chat not found' });
    } else {
      chat = await prisma.chat.create({
        data: {
          userId,
          title: title && typeof title === 'string' ? title.trim() : queryText.slice(0, 40) + (queryText.length > 40 ? '...' : ''),
        },
      });
    }

    // ============================================
    // MICRO-AGENT PIPELINE
    // ============================================

// AGENT 1: Triage (validates query + generates search queries)
// Declare triageResult in the outer scope
// Remove let declaration
// Remove let declaration
triageResult = await triageQuery(queryText);

// Short-circuit if query is rejected
if (!triageResult.isValidFertilityQuery && triageResult.rejectionReason) {
  // Log rejected query
  prisma.userActivity.create({
    data: {
      userId,
      type: 'query_rejected',
      metadata: { query: queryText.slice(0, 200), reason: triageResult.rejectionReason },
    },
  }).catch(() => {});
  
  // Parallel BloodworkMemorySwarm with normal retrieval
  const [retrievalResult, userLabResults] = await Promise.all([
    executeRetrievalSwarm(triageResult.searchQueries, queryText),
    queryBloodworkMemory(userId)
  ]);

  if (userLabResults && userLabResults.length > 0) {
    effectiveMessage += `\n\nPatient's known lab results: ${JSON.stringify(userLabResults)}. Personalize your response using these values. If the medical context does not explicitly explain these specific values, you may use pre-trained knowledge, but do not state the context was missing.`;
  }
      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();
        res.write(`data: ${JSON.stringify({ text: triageResult.rejectionReason })}\n\n`);
        res.write(`data: ${JSON.stringify({
          isDone: true,
          citations: [],
          followUpQuestions: [
            'What are common fertility tests?',
            'How does IVF work?',
            'What affects ovulation?'
          ],
          isOffTopic: true,
        })}\n\n`);
        res.end();
      } else {
        res.json({
          response: triageResult.rejectionReason,
          suggested_questions: [
            'What are common fertility tests?',
            'How does IVF work?',
            'What affects ovulation?'
          ],
          citations: [],
          offTopic: true,
        });
      }
      return;
    }

    // AGENT 2: Retrieval Swarm (parallel Pinecone + Cohere rerank)
    const retrievalResult = await executeRetrievalSwarm(triageResult.searchQueries, queryText);

    const kb_final_context = retrievalResult.chunks || [];
    const hasKBContext = kb_final_context.length > 0;
    const sufficiency = checkSufficiency(kb_final_context, effectiveMessage);

    // Log knowledge gap if no context
    if (!hasKBContext || retrievalResult.allBelowThreshold) {
      const sessionHistory = session?.chat_history || [];
      logGap({
        query: queryText,
        chat_history: sessionHistory.map((h) => ({ role: h.role, content: h.content?.slice(0, 200) })),
        highest_score: kb_final_context[0]?.score || 0,
        source: 'chat',
      });
    }

    // Get session history for synthesizer
    const chatHistory = session?.chat_history || [];

    // Save user message
    const userContent = queryText;
    const userEncrypted = isEncryptionEnabled() ? encryptField(userContent) : null;
    const userMsg = await prisma.message.create({
      data: {
        chatId: chat.id,
        role: 'user',
        content: userContent,
        encryptedData: userEncrypted ? JSON.stringify(userEncrypted) : null,
        encryptionMeta: userEncrypted ? { encrypted: true, version: 1 } : null,
      },
    });

    const ragCitations = [...new Set(kb_final_context.map((c) => c.doc_id).filter(Boolean))];
    const kbReferences = kb_final_context.map((c) => ({
      doc_id: c.doc_id,
      chunk_id: c.chunk_id,
      score: Math.round((c.score || 0) * 100) / 100,
      text_preview: (c.text || '').slice(0, 100),
    }));

    // ============================================
    // AGENT 3: Clinical Synthesizer (or fallback to LLM)
    // ============================================
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      // START Follow-Up Agent in PARALLEL with streaming (fire it off immediately)
      const followUpPromise = generateFollowUpQuestions(queryText, kb_final_context, language);

      // Try synthesizer agent first, fallback to streaming LLM
      let fullResponse = '';
      let synthesizerUsed = false;

      if (isSynthesizerAvailable()) {
        try {
          const synthStream = await synthesizeResponseStream(effectiveMessage, kb_final_context, chatHistory, language);
          for await (const chunk of synthStream) {
            fullResponse += chunk;
            res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
            if (typeof res.flush === 'function') res.flush();
          }
          synthesizerUsed = true;
        } catch (err) {
          console.warn('[Chat] Synthesizer stream failed, falling back:', err.message);
          fullResponse = '';
        }
      }

      if (!synthesizerUsed) {
        // Fallback: streaming LLM
        const adjustments = await getPromptAdjustments('general');
        let systemPrompt = buildSystemPrompt(language);
        if (adjustments.extraInstructions) {
          systemPrompt += `\n\n${adjustments.extraInstructions}`;
        }

        const kbContextText = kb_final_context.map((c) => c.text).filter(Boolean).join('\n---\n');
        if (kbContextText) {
          systemPrompt += `\n\nUse the following verified medical context:\n${kbContextText}`;
        }

        fullResponse = await streamLLMResponse(
          systemPrompt,
          effectiveMessage,
          (chunk) => {
            res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
            if (typeof res.flush === 'function') res.flush();
          },
          { temperature: adjustments.temperature, maxTokens: 1024, timeout: 50000 }
        );
      }

      // Parse any follow-up questions from the response (for fallback LLM)
      const { cleanedText, questions: parsedQuestions } = parseFollowUpQuestions(fullResponse);

      // Clean citations: ONLY titles from Pinecone metadata (no scores, no percentages)
      const cleanCitations = [...new Set(kb_final_context.map((c) => formatCitation(c.doc_id)).filter(Boolean))].slice(0, 5);

      // AWAIT the Follow-Up Agent result (it was started in parallel)
      let followUpQuestions = [];
      try {
        followUpQuestions = await followUpPromise;
      } catch (err) {
        console.warn('[Chat] Follow-up agent failed:', err.message);
      }

      // Fallback to parsed questions if agent returned nothing
      if (followUpQuestions.length === 0 && parsedQuestions.length > 0) {
        followUpQuestions = parsedQuestions;
      }

      // Send final payload with isDone flag, clean citations, and follow-up questions
      res.write(`data: ${JSON.stringify({
        isDone: true,
        citations: cleanCitations,
        followUpQuestions: followUpQuestions.slice(0, 3),
        session_id: activeSessionId,
      })}\n\n`);
// Background BloodworkEvaluationSwarm after response is sent
if (userLabResults?.length > 0) {
  try {
    const evalResult = await evaluateBloodworkKnowledgeGap(
      queryText,
      userLabResults,
      kb_final_context,
      fullResponse || responseText
    );
    if (evalResult?.knowledgeGapDetected) {
      logGap({
        query: queryText,
        chat_history: chatHistory,
        highest_score: kb_final_context[0]?.score || 0,
        source: 'chat',
        knowledge_gap: evalResult.missingInformation,
      });
    }
  } catch (evalErr) {
    console.error('[Chat] Bloodwork evaluation failed:', evalErr.message);
  }
}

res.end();

// Update session and save response
if (activeSessionId) {
  sessionManager.updateHistory(activeSessionId, 'user', queryText).catch(() => {});
  sessionManager.updateHistory(activeSessionId, 'ai', fullResponse || responseText).catch(() => {});
  sessionManager.cacheContext(activeSessionId, kb_final_context, kb_final_context[0]?.score || 0).catch(() => {});
}

// Save AI response
const responseToStore = cleanedText || fullResponse || responseText;
const aiEnc = isEncryptionEnabled() ? encryptField(responseToStore) : null;
await prisma.message.create({
  data: {
    chatId: chat.id,
    role: 'ai',
    content: responseToStore,
    encryptedData: aiEnc ? JSON.stringify(aiEnc) : null,
    encryptionMeta: aiEnc ? { encrypted: true, version: 1 } : null,
  },
});

// Vectorize conversation
try {
  vectorizeAndStore(userId, 'chat_message', `Q: ${queryText}\nA: ${responseToStore.slice(0, 500)}`, { conversationId: chat.id });
} catch (err) {
  console.warn('[Chat] Vectorization failed:', err.message);
}

} else {
      // Non-streaming: use Clinical Synthesizer agent
      const CHAT_REQUEST_TIMEOUT_MS = parseInt(process.env.CHAT_REQUEST_TIMEOUT_MS || '55000', 10);

      try {
        let responseText, suggestedQuestions;

        if (isSynthesizerAvailable()) {
          // Use JSON-mode synthesizer
          const synthResult = await synthesizeResponse(effectiveMessage, kb_final_context, chatHistory, language);
          responseText = synthResult.response;
          suggestedQuestions = synthResult.followUpQuestions;
        } else {
          // Fallback to LLM
          const adjustments = await getPromptAdjustments('general');
          let systemPrompt = buildSystemPrompt(language);
          const kbContextText = kb_final_context.map((c) => c.text).filter(Boolean).join('\n---\n');
          if (kbContextText) {
            systemPrompt += `\n\nUse the following verified medical context:\n${kbContextText}`;
          }

          const rawResponse = await getLLMResponse(systemPrompt, effectiveMessage, {
            temperature: adjustments.temperature,
            maxTokens: 1024,
            timeout: CHAT_REQUEST_TIMEOUT_MS - 5000,
          });
          const parsed = parseFollowUpQuestions(rawResponse);
          responseText = parsed.cleanedText;
          suggestedQuestions = parsed.questions;
        }

        // Update session
        if (activeSessionId) {
          sessionManager.updateHistory(activeSessionId, 'user', queryText).catch(() => {});
          sessionManager.updateHistory(activeSessionId, 'ai', responseText).catch(() => {});
          sessionManager.cacheContext(activeSessionId, kb_final_context, kb_final_context[0]?.score || 0).catch(() => {});
        }

        // Save AI response
        const aiEnc = isEncryptionEnabled() ? encryptField(responseText) : null;
        await prisma.message.create({
          data: {
            chatId: chat.id, role: 'ai', content: responseText,
            encryptedData: aiEnc ? JSON.stringify(aiEnc) : null,
            encryptionMeta: aiEnc ? { encrypted: true, version: 1 } : null,
          },
        });

        // Vectorize (fire-and-forget)
        try {
          vectorizeAndStore(userId, 'chat_message', `Q: ${queryText}\nA: ${responseText.slice(0, 500)}`, { conversationId: chat.id });
        } catch (err) {
          console.warn('[Chat] Vectorization failed:', err.message);
        }

        res.json({
          response: responseText,
          suggested_questions: suggestedQuestions || [],
          citations: ragCitations,
          kbReferences,
          kbGap: !hasKBContext,
          matchScore: sufficiency?.score,
          session_id: activeSessionId,
        });

      } catch (err) {
        console.error('[Chat] Pipeline error:', err.message);
        if (!res.headersSent) {
          res.status(503).json({ error: 'Request timed out. Please try again.' });
        }
      }
    }
  } catch (err) {
    console.error('Chat error:', err);
    if (!res.headersSent) {
      return res.status(500).json({ error: err?.message === 'The operation was aborted.' ? 'Request timed out. Please try again.' : 'Chat failed' });
    }
    try {
      res.write(`data: ${JSON.stringify({ error: 'Chat failed' })}\n\n`);
      res.end();
    } catch (_) {}
  }
});

/**
 * POST /api/chat/rate
 */
router.post('/rate', verifyJWT, async (req, res) => {
  try {
    const { messageId, rating } = req.body;
    if (!messageId || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'messageId and rating (1-5) required' });
    }

    const message = await prisma.message.findFirst({
      where: { id: messageId, role: 'ai' },
      include: { chat: true },
    });
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const questionCategory = message.content?.toLowerCase().includes('blood') ? 'bloodwork' : 'general';

    await prisma.trainingFeedback.create({
      data: {
        questionCategory,
        qualityScore: rating,
        feedbackType: rating >= 4 ? 'positive' : rating <= 2 ? 'negative' : 'neutral',
        language: 'en',
        expiresAt: new Date(Date.now() + 18 * 30 * 24 * 60 * 60 * 1000),
      },
    });

    prisma.userActivity.create({
      data: {
        userId: req.userId,
        type: 'feedback',
        metadata: { messageId, rating, category: questionCategory },
      },
    }).catch((e) => console.error('Activity log error:', e));

    res.json({ ok: true });
  } catch (err) {
    console.error('Rate error:', err);
    res.status(500).json({ error: 'Rating failed' });
  }
});

export default router;
