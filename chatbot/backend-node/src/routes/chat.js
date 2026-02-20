import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { streamLLMResponse, getLLMResponse } from '../lib/llm.js';
import { verifyJWT } from '../middleware/auth.js';
import { vectorizeAndStore, queryConversationMemory } from '../lib/pinecone.js';
import { hashUserId } from '../gdpr/sanitizer.js';
import { retrieveKB } from '../lib/retrieval.js';
import { checkSufficiency } from '../lib/sufficiency.js';
import { encryptField, decryptField, isEncryptionEnabled } from '../gdpr/encryption.js';
import { requireConsent } from '../gdpr/consentCheck.js';
import { getPromptAdjustments } from '../lib/promptRouter.js';
import { classifyReproductiveHealthQuery, getOffTopicMessage, getOffTopicSuggestedQuestions } from '../lib/topicFilter.js';

const router = Router();
const TOPIC_FILTER_THRESHOLD = parseFloat(process.env.TOPIC_FILTER_CONFIDENCE_THRESHOLD || '0.5', 10) || 0.5;

const LANG_NAMES = {
  en: 'English', es: 'Spanish', ja: 'Japanese', hi: 'Hindi',
  ta: 'Tamil', te: 'Telugu', ml: 'Malayalam', fr: 'French', pt: 'Portuguese',
};

function buildSystemPrompt(langCode) {
  const langName = LANG_NAMES[langCode] || 'English';
  return `Izana health assistant for fertility. Caring, evidence-based, clear. Respect privacy.

Respond entirely in ${langName}. All text and follow-ups in ${langName}.

At the end, give exactly 3 short, deep contextual follow-up questions the user might ask next (same language). Format:
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
 * JWT required. Returns messages for the chat (must belong to authenticated user).
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
      return {
        id: m.id,
        role: m.role,
        content,
        createdAt: m.createdAt,
      };
    });
    return res.json({ chatId: chat.id, title: chat.title, messages });
  } catch (err) {
    console.error('Get chat messages error:', err);
    return res.status(500).json({ error: 'Failed to load messages' });
  }
});

/**
 * POST /api/chat
 * JWT required. Accept message, chatId, title, stream (default true), clinical_data, treatment.
 * When stream=false, returns JSON { response, suggested_questions, citations }.
 */
router.post('/', verifyJWT, requireConsent, async (req, res) => {
  try {
    const { message, chatId, title, stream = true, language = 'en', clinical_data, treatment } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const userId = req.userId;

    // Build effective user message for LLM: include attached lab results and treatment when provided
    let effectiveMessage = message.trim();
    if (clinical_data?.results && Array.isArray(clinical_data.results)) {
      const labLines = clinical_data.results.map((r) => `${r.name || 'Marker'}: ${r.value || ''} ${r.unit || ''}`).filter(Boolean);
      if (labLines.length) {
        effectiveMessage += '\n\n[Attached lab results for interpretation:]\n' + labLines.join('\n');
      }
    }
    if (treatment && typeof treatment === 'string' && treatment.trim()) {
      effectiveMessage += '\n\nCurrent treatment context: ' + treatment.trim();
    }

    // Topic filter: classify as reproductive health or off-topic (never block on classifier failure)
    let onTopic = true;
    let confidence = 0.5;
    try {
      const classified = await classifyReproductiveHealthQuery(message.trim(), language);
      onTopic = classified.onTopic;
      confidence = classified.confidence;
    } catch (e) {
      console.error('[Chat] Topic classification failed, allowing query through:', e.message);
    }
    prisma.userActivity.create({
      data: {
        userId,
        type: 'topic_classification',
        metadata: { query: message.trim().slice(0, 200), onTopic, confidence, language },
      },
    }).catch((e) => console.error('Topic classification log error:', e));

    if (!onTopic && confidence >= TOPIC_FILTER_THRESHOLD) {
      let offTopicChat;
      if (chatId) {
        offTopicChat = await prisma.chat.findFirst({ where: { id: chatId, userId } });
        if (!offTopicChat) return res.status(404).json({ error: 'Chat not found' });
      } else {
        offTopicChat = await prisma.chat.create({
          data: {
            userId,
            title: title && typeof title === 'string' ? title.trim() : message.trim().slice(0, 40) + (message.trim().length > 40 ? '...' : ''),
          },
        });
      }
      const userContent = message.trim();
      const userEncrypted = isEncryptionEnabled() ? encryptField(userContent) : null;
      await prisma.message.create({
        data: {
          chatId: offTopicChat.id,
          role: 'user',
          content: userContent,
          encryptedData: userEncrypted ? JSON.stringify(userEncrypted) : null,
          encryptionMeta: userEncrypted ? { encrypted: true, version: 1 } : null,
        },
      });
      const politeMessage = getOffTopicMessage(language);
      const threeQuestions = getOffTopicSuggestedQuestions(language);
      return res.status(200).json({
        response: politeMessage,
        suggested_questions: threeQuestions,
        citations: [],
        offTopic: true,
      });
    }

    const category = message.trim().toLowerCase().includes('blood') ? 'bloodwork' : 'general';
    const adjustments = await getPromptAdjustments(category);

    // Resolve or create chat first (needed for conversation memory filter)
    let chat;
    if (chatId) {
      chat = await prisma.chat.findFirst({
        where: { id: chatId, userId },
      });
      if (!chat) {
        return res.status(404).json({ error: 'Chat not found' });
      }
    } else {
      chat = await prisma.chat.create({
        data: {
          userId,
          title: title && typeof title === 'string' ? title.trim() : message.trim().slice(0, 40) + (message.trim().length > 40 ? '...' : ''),
        },
      });
    }

    // New retrieval pipeline: dense KB (top 30) + BM25 fusion -> top 6, conversation memory, sufficiency
    let kb_dense_candidates = [];
    let kb_final_context = [];
    let sufficiency = { label: 'insufficient', score: 0, reason: 'No retrieval' };
    let memoryLines = [];
    let queryVector = [];
    try {
      const { kb_dense_candidates: dense, kb_final_context: final, queryVector: qv } = await retrieveKB(effectiveMessage);
      kb_dense_candidates = dense;
      kb_final_context = final;
      queryVector = qv;
      sufficiency = checkSufficiency(kb_final_context, effectiveMessage);

      const memoryMatches = await queryConversationMemory(queryVector, userId, chat.id, 3);
      memoryLines = memoryMatches.map((m) => {
        const content = m.metadata?.content || m.metadata?.text || '';
        return content.slice(0, 400);
      }).filter(Boolean);
    } catch (err) {
      console.error('[Retrieval] Pipeline failed, proceeding without context:', err.message);
    }

    let systemPrompt = buildSystemPrompt(language);
    if (adjustments.extraInstructions) {
      systemPrompt += `\n\n${adjustments.extraInstructions}`;
    }

    const kbContextText = kb_final_context.map((c) => c.text).filter(Boolean).join('\n---\n');
    const used_general_knowledge = sufficiency.label === 'insufficient';

    if (kbContextText) {
      systemPrompt += `\n\nUse the following verified medical context from the knowledge base. Prioritize it and never contradict it:\n${kbContextText}`;
      if (used_general_knowledge) {
        systemPrompt += `\n\nThe above KB context may be partial. Use it where applicable, then complete the answer from your general knowledge. Clearly separate what is grounded in the KB vs what is general knowledge.`;
      } else {
        systemPrompt += `\n\nPrefer the verified KB context above when it addresses the question.`;
      }
    }
    if (memoryLines.length > 0) {
      systemPrompt += `\n\nPrevious conversation context (for continuity):\n${memoryLines.join('\n---\n')}`;
    }

    const userContent = message.trim();
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

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const fullResponse = await streamLLMResponse(
        systemPrompt,
        effectiveMessage,
        (chunk) => {
          res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
          if (typeof res.flush === 'function') res.flush();
        },
        { temperature: adjustments.temperature, maxTokens: 1024, timeout: 50000 }
      );

      const { cleanedText, questions } = parseFollowUpQuestions(fullResponse);

      if (questions.length > 0) {
        res.write(`data: ${JSON.stringify({ suggested_questions: questions })}\n\n`);
        if (typeof res.flush === 'function') res.flush();
      }

      res.write('data: [DONE]\n\n');
      res.end();

      const aiEnc = isEncryptionEnabled() ? encryptField(cleanedText) : null;
      const aiMsg = await prisma.message.create({
        data: {
          chatId: chat.id, role: 'ai', content: cleanedText,
          encryptedData: aiEnc ? JSON.stringify(aiEnc) : null,
          encryptionMeta: aiEnc ? { encrypted: true, version: 1 } : null,
        },
      });

      vectorizeAndStore(userId, 'chat_message', `Q: ${message.trim()}\nA: ${cleanedText.slice(0, 500)}`, { conversationId: chat.id });

      const source_usage = kb_final_context.map((c) => ({ query_id: userMsg.id, source_id: c.doc_id, chunk_id: c.chunk_id }));
      const retrievalMeta = {
        query_id: userMsg.id,
        timestamp: new Date().toISOString(),
        user_id: hashUserId(userId),
        conversation_id: chat.id,
        query_text: message.trim().slice(0, 500),
        kb_dense_candidates: kb_dense_candidates.map((c) => ({ chunk_id: c.chunk_id, score: c.score, doc_id: c.doc_id })),
        kb_final_context: kb_final_context.map((c) => ({ chunk_id: c.chunk_id, fused_score: c.fused_score, doc_id: c.doc_id })),
        sufficiency: { label: sufficiency.label, score: sufficiency.score, reason: sufficiency.reason },
        used_general_knowledge: used_general_knowledge,
        answer_id: aiMsg.id,
        source_usage,
      };
      prisma.userActivity.create({ data: { userId, type: 'retrieval_event', metadata: retrievalMeta } }).catch((e) => console.error('Retrieval event log error:', e));
    } else {
      const CHAT_REQUEST_TIMEOUT_MS = parseInt(process.env.CHAT_REQUEST_TIMEOUT_MS || '55000', 10);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('REQUEST_TIMEOUT')), CHAT_REQUEST_TIMEOUT_MS);
      });
      const workPromise = (async () => {
        const rawResponse = await getLLMResponse(systemPrompt, effectiveMessage, { temperature: adjustments.temperature, maxTokens: 1024, timeout: 50000 });
        const { cleanedText, questions } = parseFollowUpQuestions(rawResponse);

        const aiEnc2 = isEncryptionEnabled() ? encryptField(cleanedText) : null;
        const aiMsg2 = await prisma.message.create({
          data: {
            chatId: chat.id, role: 'ai', content: cleanedText,
            encryptedData: aiEnc2 ? JSON.stringify(aiEnc2) : null,
            encryptionMeta: aiEnc2 ? { encrypted: true, version: 1 } : null,
          },
        });

        vectorizeAndStore(userId, 'chat_message', `Q: ${message.trim()}\nA: ${cleanedText.slice(0, 500)}`, { conversationId: chat.id });

        const source_usage2 = kb_final_context.map((c) => ({ query_id: userMsg.id, source_id: c.doc_id, chunk_id: c.chunk_id }));
        const retrievalMeta2 = {
          query_id: userMsg.id,
          timestamp: new Date().toISOString(),
          user_id: hashUserId(userId),
          conversation_id: chat.id,
          query_text: message.trim().slice(0, 500),
          kb_dense_candidates: kb_dense_candidates.map((c) => ({ chunk_id: c.chunk_id, score: c.score, doc_id: c.doc_id })),
          kb_final_context: kb_final_context.map((c) => ({ chunk_id: c.chunk_id, fused_score: c.fused_score, doc_id: c.doc_id })),
          sufficiency: { label: sufficiency.label, score: sufficiency.score, reason: sufficiency.reason },
          used_general_knowledge: used_general_knowledge,
          answer_id: aiMsg2.id,
          source_usage: source_usage2,
        };
        prisma.userActivity.create({ data: { userId, type: 'retrieval_event', metadata: retrievalMeta2 } }).catch((e) => console.error('Retrieval event log error:', e));

        return { cleanedText, questions, ragCitations, sufficiency };
      })();

      try {
        const result = await Promise.race([workPromise, timeoutPromise]);
        if (result && !res.headersSent) {
          res.json({
            response: result.cleanedText,
            suggested_questions: result.questions,
            citations: result.ragCitations,
            matchScore: result.sufficiency?.score,
          });
        }
      } catch (raceErr) {
        if (raceErr?.message === 'REQUEST_TIMEOUT' && !res.headersSent) {
          console.error('[Chat] Non-stream request timed out after', CHAT_REQUEST_TIMEOUT_MS, 'ms');
          res.status(503).json({ error: 'Request timed out. Please try again.' });
        } else {
          throw raceErr;
        }
      }
    }
  } catch (err) {
    console.error('Chat error:', err);
    if (!res.headersSent) {
      return res.status(500).json({ error: err?.message === 'The operation was aborted.' ? 'Request timed out. Please try again.' : 'Chat failed' });
    }
    try {
      res.write(`data: ${JSON.stringify({ error: err?.message === 'The operation was aborted.' ? 'Request timed out. Please try again.' : 'Chat failed' })}\n\n`);
      res.end();
    } catch (_) {}
  }
});

/**
 * POST /api/chat/rate
 * Rate a specific AI message. Stores in TrainingFeedback.
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
