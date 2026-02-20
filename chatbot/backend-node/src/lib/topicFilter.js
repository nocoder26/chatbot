/**
 * Reproductive health topic filter: classify user queries as on-topic or off-topic.
 * When off-topic, return a polite scope message and 3 suggested questions in the user's language.
 * Optimised for speed (keyword fast-path, small LLM call) and accuracy (few-shot, safe fallback).
 */

import { getLLMResponse } from './llm.js';

// Strong on-topic terms: used only to skip LLM when message is clearly off-topic (no term matches).
const ON_TOPIC_KEYWORDS = [
  'fertility', 'ivf', 'iui', 'pregnancy', 'pregnant', 'conceive', 'conception', 'ovulation', 'ovulate',
  'sperm', 'embryo', 'hormone', 'estrogen', 'progesterone', 'testosterone', 'amh', 'fsh', 'lh', 'tsh',
  'menstrual', 'period', 'cycle', 'reproductive', 'reproduction', 'bloodwork', 'blood work', 'lab result',
  'infertility', 'fertile', 'implantation', 'miscarriage', 'pcos', 'endometriosis', 'semen', 'sperm count',
  'follicle', 'uterine', 'ovary', 'ovaries', 'fallopian', 'egg quality', 'egg count', 'reserve',
];
// Terms that strongly suggest off-topic (cooking, weather, etc.). If message has these and no on-topic, can fast-path off.
const OFF_TOPIC_KEYWORDS = [
  'weather', 'recipe', 'cooking', 'sports', 'football', 'soccer', 'movie', 'political', 'election',
  'stock market', 'bitcoin', 'recipe for', 'how to cook', 'today\'s weather', 'forecast',
];

const CLASSIFIER_TIMEOUT_MS = 6000;
const CLASSIFIER_MAX_TOKENS = 80;

const CLASSIFIER_SYSTEM = `You are a strict classifier. Output ONLY valid JSON, no other text.
Given a user message, output: {"onTopic": true or false, "confidence": number between 0 and 1}

onTopic = true ONLY if the message is clearly about: fertility, reproduction, pregnancy, conception, IVF, IUI, hormones, menstrual health, sperm, eggs, reproductive bloodwork, ovulation, infertility, PCOS, endometriosis, or related reproductive/fertility topics.
onTopic = false for: cooking, weather, sports, general non-reproductive health, politics, tech, or clearly unrelated topics.

The user may write in any language; classify based on meaning.

Examples:
"How do I improve my chances of IVF success?" -> {"onTopic": true, "confidence": 0.95}
"What's the weather in Paris?" -> {"onTopic": false, "confidence": 0.95}
"Tell me a joke" -> {"onTopic": false, "confidence": 0.9}`;

/**
 * Fast path OFF-TOPIC only: if message has strong off-topic terms and no on-topic terms, return off-topic without LLM.
 * We never fast-path to on-topic so that phrases like "I had eggs for breakfast" are still classified by LLM.
 * @param {string} message
 * @returns {{ onTopic: boolean, confidence: number } | null} null if fast path did not apply
 */
function keywordFastPath(message) {
  const lower = message.trim().toLowerCase();
  if (lower.length < 2) return null;
  const hasOnTopic = ON_TOPIC_KEYWORDS.some((term) => lower.includes(term));
  if (hasOnTopic) return null; // always run LLM when any on-topic keyword present (second layer for accuracy)
  const hasOffTopic = OFF_TOPIC_KEYWORDS.some((term) => lower.includes(term));
  if (hasOffTopic) return { onTopic: false, confidence: 0.85 };
  return null;
}

/**
 * Parse LLM JSON response with safe fallback (treat as on-topic on failure).
 * @param {string} raw
 * @returns {{ onTopic: boolean, confidence: number }}
 */
function parseClassifierResponse(raw) {
  if (!raw || typeof raw !== 'string') return { onTopic: true, confidence: 0.5 };
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  let parsed;
  try {
    const jsonStr = cleaned.replace(/^[^{]*/, '').replace(/[^}]*$/, '');
    parsed = JSON.parse(jsonStr);
  } catch (_) {
    const match = cleaned.match(/"onTopic"\s*:\s*(true|false)|"confidence"\s*:\s*([0-9.]+)/gi);
    if (match) {
      const onTopicStr = match.find((m) => m.toLowerCase().includes('ontopic'));
      const confStr = match.find((m) => m.toLowerCase().includes('confidence'));
      parsed = {};
      if (onTopicStr) parsed.onTopic = onTopicStr.toLowerCase().includes('true');
      if (confStr) parsed.confidence = parseFloat(confStr.split(':')[1].trim()) || 0.5;
    } else {
      return { onTopic: true, confidence: 0.5 };
    }
  }
  const onTopic = parsed && typeof parsed.onTopic === 'boolean' ? parsed.onTopic : true;
  const confidence = parsed && typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5;
  return { onTopic, confidence };
}

/**
 * Classify whether the user message is about reproductive/fertility health.
 * @param {string} message - User message (any language).
 * @param {string} language - Language code for logging only (en, es, ja, hi, ta, te, ml, fr, pt).
 * @returns {Promise<{ onTopic: boolean, confidence: number }>}
 */
export async function classifyReproductiveHealthQuery(message, language) {
  const fast = keywordFastPath(message);
  if (fast) return fast;

  try {
    const raw = await getLLMResponse(CLASSIFIER_SYSTEM, message.trim().slice(0, 500), {
      temperature: 0,
      maxTokens: CLASSIFIER_MAX_TOKENS,
      timeout: CLASSIFIER_TIMEOUT_MS,
      responseFormat: 'json',
    });
    return parseClassifierResponse(raw);
  } catch (err) {
    console.error('[TopicFilter] Classifier failed, allowing through:', err.message);
    return { onTopic: true, confidence: 0.5 };
  }
}

// Off-topic message and 3 suggested questions per language (en, es, ja, hi, ta, te, ml, fr, pt)
const OFF_TOPIC_MESSAGES = {
  en: 'Izana is your reproductive health companion. I can only answer questions about fertility and reproductive health. Here are some questions I can help with:',
  es: 'Izana es tu compañera de salud reproductiva. Solo puedo responder preguntas sobre fertilidad y salud reproductiva. Aquí hay algunas preguntas con las que puedo ayudarte:',
  ja: 'Izanaは生殖健康のコンパニオンです。妊娠・生殖に関する質問にのみお答えします。以下のような質問にお答えできます：',
  hi: 'Izana आपकी प्रजनन स्वास्थ्य साथी है। मैं केवल प्रजनन और फर्टिलिटी से जुड़े सवालों का जवाब दे सकती हूं। यहां कुछ सवाल हैं जिनमें मैं मदद कर सकती हूं:',
  ta: 'இசானா உங்கள் இனப்பெருக்க சுகாதார துணை. கருவுறுதல் மற்றும் இனப்பெருக்க சுகாதாரம் பற்றிய கேள்விகளுக்கு மட்டுமே நான் பதிலளிக்க முடியும். நான் உதவக்கூடிய சில கேள்விகள் இங்கே:',
  te: 'ఇజానా మీ ప్రజనన ఆరోగ్య సహచరుడు. నేను ఫర్టిలిటీ మరియు ప్రజనన ఆరోగ్యం గురించి ప్రశ్నలకు మాత్రమే సమాధానం ఇవ్వగలను. నేను సహాయం చేయగల కొన్ని ప్రశ్నలు ఇక్కడ ఉన్నాయి:',
  ml: 'ഇസാന നിങ്ങളുടെ പ്രജനന ആരോഗ്യ സഹചാരിയാണ്. ഫെർട്ടിലിറ്റിയും പ്രജനന ആരോഗ്യവുമായി ബന്ധപ്പെട്ട ചോദ്യങ്ങൾക്ക് മാത്രമേ ഞാൻ ഉത്തരം നൽകൂ. ഞാൻ സഹായിക്കാൻ കഴിയുന്ന ചില ചോദ്യങ്ങൾ:',
  fr: "Izana est votre compagnon de santé reproductive. Je ne peux répondre qu'aux questions sur la fertilité et la santé reproductive. Voici quelques questions avec lesquelles je peux vous aider :",
  pt: 'A Izana é sua companheira de saúde reprodutiva. Só posso responder a perguntas sobre fertilidade e saúde reprodutiva. Aqui estão algumas perguntas com as quais posso ajudar:',
};

const OFF_TOPIC_QUESTIONS = {
  en: ['What is IVF?', 'How can I improve my fertility?', 'What do my hormone levels mean?'],
  es: ['¿Qué es la FIV?', '¿Cómo puedo mejorar mi fertilidad?', '¿Qué significan mis niveles hormonales?'],
  ja: ['IVFとは何ですか？', '妊娠力はどう高められますか？', 'ホルモン値はどういう意味ですか？'],
  hi: ['IVF क्या है?', 'मैं अपनी फर्टिलिटी कैसे बढ़ा सकती/सकता हूं?', 'मेरे हार्मोन स्तर का क्या मतलब है?'],
  ta: ['IVF என்றால் என்ன?', 'என் கருவுறுதல் திறனை எப்படி மேம்படுத்த முடியும்?', 'என் ஹார்மோன் அளவுகளின் அர்த்தம் என்ன?'],
  te: ['IVF అంటే ఏమిటి?', 'నేను నా ఫర్టిలిటీని ఎలా మెరుగుపరచగలను?', 'నా హార్మోన్ స్థాయిల అర్థం ఏమిటి?'],
  ml: ['IVF എന്താണ്?', 'എനിക്ക് ഫെർട്ടിലിറ്റി എങ്ങനെ മെച്ചപ്പെടുത്താം?', 'എന്റെ ഹോർമോൺ ലെവലുകൾക്ക് എന്താണ് അർത്ഥം?'],
  fr: ["Qu'est-ce que la FIV ?", 'Comment améliorer ma fertilité ?', 'Que signifient mes niveaux hormonaux ?'],
  pt: ['O que é FIV?', 'Como posso melhorar minha fertilidade?', 'O que significam meus níveis hormonais?'],
};

/**
 * Get the off-topic polite message in the user's language.
 * @param {string} language - Language code (en, es, ja, hi, ta, te, ml, fr, pt).
 * @returns {string}
 */
export function getOffTopicMessage(language) {
  const code = (language && String(language).toLowerCase().slice(0, 2)) || 'en';
  return OFF_TOPIC_MESSAGES[code] || OFF_TOPIC_MESSAGES.en;
}

/**
 * Get exactly 3 reproductive-health suggested questions in the user's language.
 * @param {string} language - Language code (en, es, ja, hi, ta, te, ml, fr, pt).
 * @returns {string[]}
 */
export function getOffTopicSuggestedQuestions(language) {
  const code = (language && String(language).toLowerCase().slice(0, 2)) || 'en';
  const questions = OFF_TOPIC_QUESTIONS[code] || OFF_TOPIC_QUESTIONS.en;
  return Array.isArray(questions) ? questions.slice(0, 3) : OFF_TOPIC_QUESTIONS.en.slice(0, 3);
}
