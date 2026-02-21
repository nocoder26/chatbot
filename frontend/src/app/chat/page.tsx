"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Send, ArrowLeft, Loader2, ChevronRight, Paperclip, Star, Heart, Users, UtensilsCrossed, TestTube, TrendingUp, User, LogOut, ThumbsUp, ThumbsDown, Globe } from "lucide-react";
import BloodWorkConfirm from "@/components/BloodWorkConfirm";
import {
  sendChatMessage,
  analyzeBloodWork,
  submitFeedback,
  resolveApiUrl,
  fetchConsentStatus,
  fetchChatMessages,
  type ChatResponse,
  type LabResult,
} from "@/lib/api";

// --- TYPES ---
// PHASE 5: KB Reference type
interface KBReference {
  doc_id: string;
  chunk_id: string;
  score: number;
  text_preview?: string;
}

interface ChatMessage {
  id: number | string;
  type: "user" | "bot";
  content: string;
  suggested_questions?: string[];
  followUpQuestions?: string[];
  citations?: string[];
  isAnimating: boolean;
  isBloodWorkPrompt?: boolean;
  userQuery?: string;
  rating?: number;
  feedbackReason?: string;
  isOffTopic?: boolean;
  kbReferences?: KBReference[];
  kbGap?: boolean;
  isStreamComplete?: boolean;
}

// --- TOPIC SHORTCUTS ---
const TOPIC_ICONS = [
  { label: "IVF", query: "What is IVF?", icon: Heart },
  { label: "IUI", query: "What is IUI?", icon: Heart },
  { label: "Male Fertility", query: "How can men improve fertility?", icon: Users },
  { label: "Nutrition and Fertility", query: "Fertility diet tips", icon: UtensilsCrossed },
  { label: "Understand your Bloodwork", query: "I want to understand my blood work.", icon: TestTube },
  { label: "Fertility Success Rates", query: "How to improve IVF success?", icon: TrendingUp },
];

// Loading steps will be translated dynamically based on langCode
const getLoadingSteps = (lang: string): string[] => [
  getTranslation("understandingNeeds", lang),
  getTranslation("readingKnowledge", lang),
  getTranslation("almostThere", lang),
];

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  ta: "Tamil",
  hi: "Hindi",
  te: "Telugu",
  ml: "Malayalam",
  es: "Spanish",
  ja: "Japanese",
  fr: "French",
  pt: "Portuguese",
};

// --- TRANSLATIONS ---
const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    howCanHelp: "How can Izana help?",
    understandingNeeds: "Understanding your needs...",
    readingKnowledge: "Reading medical knowledge...",
    almostThere: "Almost there...",
    continueExploring: "Continue Exploring...",
    wasThisHelpful: "Was this helpful?",
    thanksFeedback: "Thanks for the feedback!",
    wellImprove: "We'll work on improving.",
    rateResponse: "Rate this response:",
    whatImproved: "What could be improved?",
    feedbackRecorded: "Feedback recorded:",
    askAnything: "Ask me anything about your fertility journey...",
    sources: "Sources:",
    privacyNote: "Your conversation is anonymous and auto-deleted after 24 hours. Always consult a healthcare professional.",
    reasonNotAccurate: "Not accurate",
    reasonTooVague: "Too vague",
    reasonNotRelevant: "Not relevant",
    reasonOutdated: "Outdated info",
    reasonHardToUnderstand: "Hard to understand",
    reasonOther: "Other",
    thankYou: "Thank you!",
    headerSubtitle: "Your Private Fertility Companion",
    uploadPrompt: "Please upload your lab report (PDF) so we can analyze your blood work results.",
    pdfOnly: "Please upload a PDF file. Other formats are not supported.",
    fileTooLarge: "The file is too large. Please upload a PDF under 5MB.",
    uploadError: "An unknown error occurred while processing the PDF.",
    noResults: "We could not extract any lab results from this PDF. It might be a scanned image. Please try uploading a text-based PDF or enter your values manually.",
    uploadFailed: "Failed to process the uploaded file. Please try again.",
    processing: "Processing...",
    selectPdf: "Select PDF",
    uploaded: "Uploaded:",
    chatError: "We encountered an error connecting to the AI service. Please try again.",
    bloodworkError: "We encountered an error analyzing your blood work. Please try again.",
    scopeReminder: "Scope reminder",
    sourcesUsed: "Knowledge sources used",
    kbGapNote: "Answer based on general medical knowledge",
  },
  ta: {
    howCanHelp: "இசானா எவ்வாறு உதவ முடியும்?",
    understandingNeeds: "உங்கள் தேவைகளை புரிந்துகொள்கிறது...",
    readingKnowledge: "மருத்துவ அறிவைப் படிக்கிறது...",
    almostThere: "கிட்டத்தட்ட முடிந்தது...",
    continueExploring: "மேலும் ஆராயுங்கள்...",
    wasThisHelpful: "இது பயனுள்ளதாக இருந்ததா?",
    thanksFeedback: "கருத்துக்கு நன்றி!",
    wellImprove: "நாங்கள் மேம்படுத்துவோம்.",
    rateResponse: "இந்த பதிலை மதிப்பிடுங்கள்:",
    whatImproved: "என்ன மேம்படுத்தலாம்?",
    feedbackRecorded: "கருத்து பதிவு செய்யப்பட்டது:",
    askAnything: "உங்கள் கருவுறுதல் பயணம் பற்றி எதையும் கேளுங்கள்...",
    sources: "ஆதாரங்கள்:",
    privacyNote: "உங்கள் உரையாடல் அநாமதேயமானது மற்றும் 24 மணி நேரத்தில் தானாக நீக்கப்படும்.",
    reasonNotAccurate: "துல்லியமற்றது",
    reasonTooVague: "மிகவும் தெளிவற்றது",
    reasonNotRelevant: "பொருத்தமற்றது",
    reasonOutdated: "காலாவதியான தகவல்",
    reasonHardToUnderstand: "புரிந்துகொள்ள கடினம்",
    reasonOther: "மற்றவை",
    thankYou: "நன்றி!",
    headerSubtitle: "உங்கள் தனிப்பட்ட கருவுறுதல் துணை",
    uploadPrompt: "உங்கள் இரத்தப் பரிசோதனை அறிக்கையை (PDF) பதிவேற்றவும்.",
    pdfOnly: "PDF கோப்பை மட்டும் பதிவேற்றவும்.",
    fileTooLarge: "கோப்பு மிகப் பெரியது. 5MB க்குள் PDF பதிவேற்றவும்.",
    uploadError: "PDF செயலாக்கத்தில் பிழை ஏற்பட்டது.",
    noResults: "இந்த PDF இலிருந்து முடிவுகளை எடுக்க முடியவில்லை. உரை அடிப்படையிலான PDF முயற்சிக்கவும்.",
    uploadFailed: "கோப்பை செயலாக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.",
    processing: "செயலாக்கம்...",
    selectPdf: "PDF தேர்வு",
    uploaded: "பதிவேற்றம்:",
    chatError: "AI சேவையில் பிழை. மீண்டும் முயற்சிக்கவும்.",
    bloodworkError: "இரத்தப் பரிசோதனை பகுப்பாய்வில் பிழை. மீண்டும் முயற்சிக்கவும்.",
    scopeReminder: "வரம்பு நினைவூட்டல்",
    sourcesUsed: "பயன்படுத்தப்பட்ட அறிவு ஆதாரங்கள்",
    kbGapNote: "பொது மருத்துவ அறிவின் அடிப்படையில் பதில்",
  },
  hi: {
    howCanHelp: "इज़ाना कैसे मदद कर सकता है?",
    understandingNeeds: "आपकी जरूरतों को समझ रहा है...",
    readingKnowledge: "चिकित्सा ज्ञान पढ़ रहा है...",
    almostThere: "लगभग हो गया...",
    continueExploring: "और जानें...",
    wasThisHelpful: "क्या यह मददगार था?",
    thanksFeedback: "प्रतिक्रिया के लिए धन्यवाद!",
    wellImprove: "हम सुधार करेंगे।",
    rateResponse: "इस उत्तर को रेट करें:",
    whatImproved: "क्या बेहतर हो सकता है?",
    feedbackRecorded: "प्रतिक्रिया दर्ज:",
    askAnything: "अपनी प्रजनन यात्रा के बारे में कुछ भी पूछें...",
    sources: "स्रोत:",
    privacyNote: "आपकी बातचीत गुमनाम है और 24 घंटे में स्वतः हटा दी जाती है।",
    reasonNotAccurate: "सटीक नहीं",
    reasonTooVague: "बहुत अस्पष्ट",
    reasonNotRelevant: "प्रासंगिक नहीं",
    reasonOutdated: "पुरानी जानकारी",
    reasonHardToUnderstand: "समझना कठिन",
    reasonOther: "अन्य",
    thankYou: "धन्यवाद!",
    headerSubtitle: "आपका निजी प्रजनन साथी",
    uploadPrompt: "कृपया अपनी रक्त रिपोर्ट (PDF) अपलोड करें।",
    pdfOnly: "कृपया केवल PDF फ़ाइल अपलोड करें।",
    fileTooLarge: "फ़ाइल बहुत बड़ी है। 5MB से कम PDF अपलोड करें।",
    uploadError: "PDF प्रोसेसिंग में त्रुटि हुई।",
    noResults: "इस PDF से कोई परिणाम नहीं निकाला जा सका। टेक्स्ट-आधारित PDF आज़माएं।",
    uploadFailed: "फ़ाइल प्रोसेस नहीं हो सकी। पुनः प्रयास करें।",
    processing: "प्रोसेसिंग...",
    selectPdf: "PDF चुनें",
    uploaded: "अपलोड:",
    chatError: "AI सेवा में त्रुटि। पुनः प्रयास करें।",
    bloodworkError: "रक्त विश्लेषण में त्रुटि। पुनः प्रयास करें।",
    scopeReminder: "दायरा अनुस्मारक",
    sourcesUsed: "उपयोग किए गए ज्ञान स्रोत",
    kbGapNote: "सामान्य चिकित्सा ज्ञान पर आधारित उत्तर",
  },
  te: {
    howCanHelp: "ఇజానా ఎలా సహాయం చేయగలదు?",
    understandingNeeds: "మీ అవసరాలను అర్థం చేసుకుంటోంది...",
    readingKnowledge: "వైద్య జ్ఞానాన్ని చదువుతోంది...",
    almostThere: "దాదాపు పూర్తయింది...",
    continueExploring: "మరింత అన్వేషించండి...",
    wasThisHelpful: "ఇది సహాయకరంగా ఉందా?",
    thanksFeedback: "అభిప్రాయానికి ధన్యవాదాలు!",
    wellImprove: "మేము మెరుగుపరుస్తాము.",
    rateResponse: "ఈ ప్రతిస్పందనను రేట్ చేయండి:",
    whatImproved: "ఏమి మెరుగుపరచవచ్చు?",
    feedbackRecorded: "అభిప్రాయం నమోదు:",
    askAnything: "మీ సంతానోత్పత్తి ప్రయాణం గురించి ఏదైనా అడగండి...",
    sources: "మూలాలు:",
    privacyNote: "మీ సంభాషణ అనామకంగా ఉంటుంది మరియు 24 గంటల్లో స్వయంచాలకంగా తొలగించబడుతుంది.",
    reasonNotAccurate: "ఖచ్చితం కాదు",
    reasonTooVague: "చాలా అస్పష్టం",
    reasonNotRelevant: "సంబంధం లేదు",
    reasonOutdated: "పాత సమాచారం",
    reasonHardToUnderstand: "అర్థం చేసుకోవడం కష్టం",
    reasonOther: "ఇతరం",
    thankYou: "ధన్యవాదాలు!",
    headerSubtitle: "మీ ప్రైవేట్ సంతానోత్పత్తి సహచరి",
    uploadPrompt: "దయచేసి మీ రక్త పరీక్ష నివేదిక (PDF) అప్‌లోడ్ చేయండి.",
    pdfOnly: "దయచేసి PDF ఫైల్ మాత్రమే అప్‌లోడ్ చేయండి.",
    fileTooLarge: "ఫైల్ చాలా పెద్దది. 5MB లోపు PDF అప్‌లోడ్ చేయండి.",
    uploadError: "PDF ప్రాసెసింగ్‌లో లోపం.",
    noResults: "ఈ PDF నుండి ఫలితాలు తీయలేకపోయాం. టెక్స్ట్ PDF ప్రయత్నించండి.",
    uploadFailed: "ఫైల్ ప్రాసెస్ చేయలేకపోయాం. మళ్ళీ ప్రయత్నించండి.",
    processing: "ప్రాసెసింగ్...",
    selectPdf: "PDF ఎంచుకోండి",
    uploaded: "అప్‌లోడ్:",
    chatError: "AI సేవలో లోపం. మళ్ళీ ప్రయత్నించండి.",
    bloodworkError: "రక్త పరీక్ష విశ్లేషణలో లోపం. మళ్ళీ ప్రయత్నించండి.",
    scopeReminder: "స్కోప్ రిమైండర్",
    sourcesUsed: "ఉపయోగించిన జ్ఞాన వనరులు",
    kbGapNote: "సాధారణ వైద్య జ్ఞానం ఆధారంగా సమాధానం",
  },
  ml: {
    howCanHelp: "ഇസാന എങ്ങനെ സഹായിക്കും?",
    understandingNeeds: "നിങ്ങളുടെ ആവശ്യങ്ങൾ മനസ്സിലാക്കുന്നു...",
    readingKnowledge: "വൈദ്യ അറിവ് വായിക്കുന്നു...",
    almostThere: "മിക്കവാറും പൂർത്തിയായി...",
    continueExploring: "കൂടുതൽ അറിയുക...",
    wasThisHelpful: "ഇത് സഹായകരമായിരുന്നോ?",
    thanksFeedback: "അഭിപ്രായത്തിന് നന്ദി!",
    wellImprove: "ഞങ്ങൾ മെച്ചപ്പെടുത്തും.",
    rateResponse: "ഈ പ്രതികരണം റേറ്റ് ചെയ്യുക:",
    whatImproved: "എന്ത് മെച്ചപ്പെടുത്താം?",
    feedbackRecorded: "അഭിപ്രായം രേഖപ്പെടുത്തി:",
    askAnything: "നിങ്ങളുടെ പ്രത്യുൽപാദന യാത്രയെക്കുറിച്ച് എന്തും ചോദിക്കൂ...",
    sources: "ഉറവിടങ്ങൾ:",
    privacyNote: "നിങ്ങളുടെ സംഭാഷണം അജ്ഞാതമാണ്, 24 മണിക്കൂറിനുള്ളിൽ സ്വയം ഇല്ലാതാകും.",
    reasonNotAccurate: "കൃത്യമല്ല",
    reasonTooVague: "വളരെ അവ്യക്തം",
    reasonNotRelevant: "പ്രസക്തമല്ല",
    reasonOutdated: "കാലഹരണപ്പെട്ട വിവരം",
    reasonHardToUnderstand: "മനസ്സിലാക്കാൻ ബുദ്ധിമുട്ട്",
    reasonOther: "മറ്റുള്ളവ",
    thankYou: "നന്ദി!",
    headerSubtitle: "നിങ്ങളുടെ സ്വകാര്യ പ്രത്യുൽപാദന സഹായി",
    uploadPrompt: "ദയവായി നിങ്ങളുടെ രക്ത പരിശോധനാ റിപ്പോർട്ട് (PDF) അപ്‌ലോഡ് ചെയ്യുക.",
    pdfOnly: "ദയവായി PDF ഫയൽ മാത്രം അപ്‌ലോഡ് ചെയ്യുക.",
    fileTooLarge: "ഫയൽ വളരെ വലുതാണ്. 5MB-ൽ താഴെയുള്ള PDF അപ്‌ലോഡ് ചെയ്യുക.",
    uploadError: "PDF പ്രോസസ്സിംഗിൽ പിശക്.",
    noResults: "ഈ PDF-ൽ നിന്ന് ഫലങ്ങൾ എടുക്കാനായില്ല. ടെക്സ്റ്റ് PDF ശ്രമിക്കുക.",
    uploadFailed: "ഫയൽ പ്രോസസ്സ് ചെയ്യാനായില്ല. വീണ്ടും ശ്രമിക്കുക.",
    processing: "പ്രോസസ്സിംഗ്...",
    selectPdf: "PDF തിരഞ്ഞെടുക്കുക",
    uploaded: "അപ്‌ലോഡ്:",
    chatError: "AI സേവനത്തിൽ പിശക്. വീണ്ടും ശ്രമിക്കുക.",
    bloodworkError: "രക്ത പരിശോധനാ വിശകലനത്തിൽ പിശക്. വീണ്ടും ശ്രമിക്കുക.",
    scopeReminder: "സ്കോപ്പ് ഓർമ്മപ്പെടുത്തൽ",
    sourcesUsed: "ഉപയോഗിച്ച അറിവ് ഉറവിടങ്ങൾ",
    kbGapNote: "പൊതു വൈദ്യ അറിവിനെ അടിസ്ഥാനമാക്കിയുള്ള ഉത്തരം",
  },
  es: {
    howCanHelp: "¿Cómo puede ayudar Izana?",
    understandingNeeds: "Entendiendo tus necesidades...",
    readingKnowledge: "Leyendo conocimiento médico...",
    almostThere: "Casi listo...",
    continueExploring: "Sigue explorando...",
    wasThisHelpful: "¿Fue útil?",
    thanksFeedback: "¡Gracias por tu opinión!",
    wellImprove: "Trabajaremos para mejorar.",
    rateResponse: "Califica esta respuesta:",
    whatImproved: "¿Qué podría mejorar?",
    feedbackRecorded: "Opinión registrada:",
    askAnything: "Pregúntame cualquier cosa sobre tu camino de fertilidad...",
    sources: "Fuentes:",
    privacyNote: "Tu conversación es anónima y se elimina automáticamente en 24 horas.",
    reasonNotAccurate: "No es preciso",
    reasonTooVague: "Demasiado vago",
    reasonNotRelevant: "No es relevante",
    reasonOutdated: "Información desactualizada",
    reasonHardToUnderstand: "Difícil de entender",
    reasonOther: "Otro",
    thankYou: "¡Gracias!",
    headerSubtitle: "Tu compañero privado de fertilidad",
    uploadPrompt: "Sube tu informe de laboratorio (PDF) para analizar tus resultados.",
    pdfOnly: "Por favor sube solo un archivo PDF.",
    fileTooLarge: "El archivo es demasiado grande. Sube un PDF de menos de 5MB.",
    uploadError: "Error al procesar el PDF.",
    noResults: "No se pudieron extraer resultados de este PDF. Prueba con un PDF basado en texto.",
    uploadFailed: "No se pudo procesar el archivo. Inténtalo de nuevo.",
    processing: "Procesando...",
    selectPdf: "Seleccionar PDF",
    uploaded: "Subido:",
    chatError: "Error en el servicio AI. Inténtalo de nuevo.",
    bloodworkError: "Error al analizar los resultados. Inténtalo de nuevo.",
    scopeReminder: "Recordatorio de alcance",
    sourcesUsed: "Fuentes de conocimiento utilizadas",
    kbGapNote: "Respuesta basada en conocimiento médico general",
  },
  ja: {
    howCanHelp: "イザナはどのようにお手伝いできますか？",
    understandingNeeds: "あなたのニーズを理解しています...",
    readingKnowledge: "医学知識を読んでいます...",
    almostThere: "もうすぐです...",
    continueExploring: "さらに詳しく...",
    wasThisHelpful: "役に立ちましたか？",
    thanksFeedback: "フィードバックありがとうございます！",
    wellImprove: "改善に取り組みます。",
    rateResponse: "この回答を評価:",
    whatImproved: "改善点は？",
    feedbackRecorded: "フィードバック記録済み:",
    askAnything: "妊活について何でも聞いてください...",
    sources: "出典:",
    privacyNote: "会話は匿名で、24時間後に自動削除されます。",
    reasonNotAccurate: "不正確",
    reasonTooVague: "曖昧すぎる",
    reasonNotRelevant: "関連性がない",
    reasonOutdated: "古い情報",
    reasonHardToUnderstand: "理解しにくい",
    reasonOther: "その他",
    thankYou: "ありがとう！",
    headerSubtitle: "プライベート妊活パートナー",
    uploadPrompt: "血液検査レポート（PDF）をアップロードしてください。",
    pdfOnly: "PDFファイルのみアップロードしてください。",
    fileTooLarge: "ファイルが大きすぎます。5MB以下のPDFをアップロードしてください。",
    uploadError: "PDF処理中にエラーが発生しました。",
    noResults: "このPDFから結果を抽出できませんでした。テキストベースのPDFをお試しください。",
    uploadFailed: "ファイルの処理に失敗しました。もう一度お試しください。",
    processing: "処理中...",
    selectPdf: "PDF選択",
    uploaded: "アップロード:",
    chatError: "AIサービスでエラーが発生しました。もう一度お試しください。",
    bloodworkError: "血液分析でエラーが発生しました。もう一度お試しください。",
    scopeReminder: "対象範囲の案内",
    sourcesUsed: "使用された知識ソース",
    kbGapNote: "一般的な医学知識に基づく回答",
  },
  fr: {
    howCanHelp: "Comment Izana peut-il vous aider ?",
    understandingNeeds: "Compréhension de vos besoins...",
    readingKnowledge: "Lecture des connaissances médicales...",
    almostThere: "Presque terminé...",
    continueExploring: "Continuer à explorer...",
    wasThisHelpful: "Cela vous a-t-il aidé ?",
    thanksFeedback: "Merci pour votre avis !",
    wellImprove: "Nous allons nous améliorer.",
    rateResponse: "Évaluez cette réponse :",
    whatImproved: "Que pourrait-on améliorer ?",
    feedbackRecorded: "Avis enregistré :",
    askAnything: "Posez-moi toute question sur votre parcours de fertilité...",
    sources: "Sources :",
    privacyNote: "Votre conversation est anonyme et supprimée automatiquement après 24 heures.",
    reasonNotAccurate: "Pas précis",
    reasonTooVague: "Trop vague",
    reasonNotRelevant: "Pas pertinent",
    reasonOutdated: "Info obsolète",
    reasonHardToUnderstand: "Difficile à comprendre",
    reasonOther: "Autre",
    thankYou: "Merci !",
    headerSubtitle: "Votre compagnon privé de fertilité",
    uploadPrompt: "Veuillez télécharger votre rapport d'analyse (PDF).",
    pdfOnly: "Veuillez télécharger uniquement un fichier PDF.",
    fileTooLarge: "Le fichier est trop volumineux. Téléchargez un PDF de moins de 5 Mo.",
    uploadError: "Erreur lors du traitement du PDF.",
    noResults: "Aucun résultat n'a pu être extrait de ce PDF. Essayez un PDF textuel.",
    uploadFailed: "Impossible de traiter le fichier. Veuillez réessayer.",
    processing: "Traitement...",
    selectPdf: "Sélectionner PDF",
    uploaded: "Téléchargé :",
    chatError: "Erreur du service IA. Veuillez réessayer.",
    bloodworkError: "Erreur d'analyse sanguine. Veuillez réessayer.",
    scopeReminder: "Rappel du champ",
    sourcesUsed: "Sources de connaissances utilisées",
    kbGapNote: "Réponse basée sur des connaissances médicales générales",
  },
  pt: {
    howCanHelp: "Como a Izana pode ajudar?",
    understandingNeeds: "Compreendendo suas necessidades...",
    readingKnowledge: "Lendo conhecimento médico...",
    almostThere: "Quase lá...",
    continueExploring: "Continue explorando...",
    wasThisHelpful: "Isso foi útil?",
    thanksFeedback: "Obrigado pelo feedback!",
    wellImprove: "Vamos trabalhar para melhorar.",
    rateResponse: "Avalie esta resposta:",
    whatImproved: "O que pode melhorar?",
    feedbackRecorded: "Feedback registrado:",
    askAnything: "Pergunte qualquer coisa sobre sua jornada de fertilidade...",
    sources: "Fontes:",
    privacyNote: "Sua conversa é anônima e excluída automaticamente em 24 horas.",
    reasonNotAccurate: "Não é preciso",
    reasonTooVague: "Muito vago",
    reasonNotRelevant: "Não é relevante",
    reasonOutdated: "Informação desatualizada",
    reasonHardToUnderstand: "Difícil de entender",
    reasonOther: "Outro",
    thankYou: "Obrigado!",
    headerSubtitle: "Seu companheiro privado de fertilidade",
    uploadPrompt: "Envie seu relatório de exames (PDF) para análise.",
    pdfOnly: "Por favor, envie apenas um arquivo PDF.",
    fileTooLarge: "O arquivo é muito grande. Envie um PDF com menos de 5MB.",
    uploadError: "Erro ao processar o PDF.",
    noResults: "Não foi possível extrair resultados deste PDF. Tente um PDF baseado em texto.",
    uploadFailed: "Não foi possível processar o arquivo. Tente novamente.",
    processing: "Processando...",
    selectPdf: "Selecionar PDF",
    uploaded: "Enviado:",
    chatError: "Erro no serviço de IA. Tente novamente.",
    bloodworkError: "Erro na análise sanguínea. Tente novamente.",
    scopeReminder: "Lembrete de escopo",
    sourcesUsed: "Fontes de conhecimento utilizadas",
    kbGapNote: "Resposta baseada em conhecimento médico geral",
  },
};

// Helper function to get translation
const getTranslation = (key: string, lang: string): string => {
  return TRANSLATIONS[lang]?.[key] || TRANSLATIONS.en[key] || key;
};

const getFeedbackReasons = (lang: string) => [
  { key: "reasonNotAccurate", label: getTranslation("reasonNotAccurate", lang) },
  { key: "reasonTooVague", label: getTranslation("reasonTooVague", lang) },
  { key: "reasonNotRelevant", label: getTranslation("reasonNotRelevant", lang) },
  { key: "reasonOutdated", label: getTranslation("reasonOutdated", lang) },
  { key: "reasonHardToUnderstand", label: getTranslation("reasonHardToUnderstand", lang) },
  { key: "reasonOther", label: getTranslation("reasonOther", lang) },
];

// --- TEXT RENDERER (renders immediately, triggers onComplete after short delay for follow-ups) ---
function GeminiFadeText({
  text,
  onComplete,
}: {
  text: string;
  onComplete: () => void;
}) {
  const paragraphs = text.split("\n\n").filter((p) => p.trim() !== "");
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const timer = setTimeout(() => onCompleteRef.current(), 600);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div
      className="flex flex-col gap-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {paragraphs.map((p, i) => (
        <p key={i} className="leading-relaxed">{p}</p>
      ))}
    </motion.div>
  );
}

// --- INLINE STAR RATING WITH FEEDBACK REASON ---
function InlineStarRating({
  currentRating,
  feedbackReason,
  onRate,
  onReasonSelect,
  lang = "en",
}: {
  currentRating: number;
  feedbackReason?: string;
  onRate: (r: number) => void;
  onReasonSelect: (reason: string) => void;
  lang?: string;
}) {
  const [hoveredRating, setHoveredRating] = useState(0);
  const display = hoveredRating || currentRating;
  const showReasonPicker = currentRating >= 1 && currentRating <= 3 && !feedbackReason;

  return (
    <div className="pt-3 border-t border-white/10 mt-3">
      <div className="flex items-center gap-1">
        <span className="text-xs text-white/60 mr-2">{getTranslation("rateResponse", lang)}</span>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => onRate(star)}
            onMouseEnter={() => setHoveredRating(star)}
            onMouseLeave={() => setHoveredRating(0)}
            className="p-0.5 transition-transform hover:scale-110"
          >
            <Star
              className={`w-4 h-4 transition-colors ${
                star <= display
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-white/30"
              }`}
            />
          </button>
        ))}
        {currentRating > 3 && (
          <span className="text-xs text-white/50 ml-2">
            {currentRating === 5 ? getTranslation("thankYou", lang) : getTranslation("thanksFeedback", lang)}
          </span>
        )}
      </div>

      {/* Reason popup for 3 stars or less */}
      <AnimatePresence>
        {showReasonPicker && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2.5 p-3 bg-white/10 rounded-xl">
              <p className="text-[11px] text-white/50 mb-2 font-medium">
                {getTranslation("whatImproved", lang)}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {getFeedbackReasons(lang).map((reason) => (
                  <button
                    key={reason.key}
                    onClick={() => onReasonSelect(reason.label)}
                    className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-white/10 text-white/70 hover:bg-izana-coral hover:text-white transition-all active:scale-95"
                  >
                    {reason.label}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {feedbackReason && currentRating <= 3 && (
        <p className="text-xs text-white/40 mt-2 italic">
          {getTranslation("feedbackRecorded", lang)} {feedbackReason}
        </p>
      )}
    </div>
  );
}

// --- MICRO FEEDBACK (thumbs up/down — shown every 3rd AI response) ---
function MicroFeedback({
  onThumbsUp,
  onThumbsDown,
  lang = "en",
}: {
  onThumbsUp: () => void;
  onThumbsDown: () => void;
  lang?: string;
}) {
  const [chosen, setChosen] = useState<"up" | "down" | null>(null);

  if (chosen) {
    return (
      <p className="text-[11px] text-white/40 pt-2 mt-2 border-t border-white/10">
        {chosen === "up" ? getTranslation("thanksFeedback", lang) : getTranslation("wellImprove", lang)}
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2 pt-2 mt-2 border-t border-white/10">
      <span className="text-[11px] text-white/50">{getTranslation("wasThisHelpful", lang)}</span>
      <button
        onClick={() => { setChosen("up"); onThumbsUp(); }}
        className="p-1 rounded-lg hover:bg-white/10 transition-colors"
      >
        <ThumbsUp className="w-3.5 h-3.5 text-white/50 hover:text-green-400" />
      </button>
      <button
        onClick={() => { setChosen("down"); onThumbsDown(); }}
        className="p-1 rounded-lg hover:bg-white/10 transition-colors"
      >
        <ThumbsDown className="w-3.5 h-3.5 text-white/50 hover:text-red-400" />
      </button>
    </div>
  );
}

// --- MAIN CHAT PAGE CONTENT (uses useSearchParams) ---
function ChatPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const chatIdFromUrl = searchParams.get("chatId");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [langCode, setLangCode] = useState("en");
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showBloodWorkModal, setShowBloodWorkModal] = useState(false);
  const [bloodWorkData, setBloodWorkData] = useState<{
    results: LabResult[];
    fertility_note?: string;
    suggested_questions?: string[];
  } | null>(null);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionStartRef = useRef(Date.now());
  const messageCountRef = useRef(0);

  useEffect(() => {
    const token = localStorage.getItem("izana_token");
    if (!token) {
      localStorage.removeItem("izana_user");
      localStorage.removeItem("izana_language");
      router.push("/");
      return;
    }
    const saved = localStorage.getItem("izana_language") || "en";
    setLangCode(saved);

    fetchConsentStatus().then((status) => {
      if (!status.hasConsent) {
        router.push("/");
        return;
      }
      setIsReady(true);
    }).catch(() => {
      setIsReady(true);
    });

    const handleUnload = () => {
      const duration = Date.now() - sessionStartRef.current;
      const payload = JSON.stringify({
        type: "session_end",
        sessionDuration: duration,
        messageCount: messageCountRef.current,
      });
      const url = resolveApiUrl("/api/feedback");
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [router]);

  // Load chat history when opening an existing chat via URL
  useEffect(() => {
    if (!isReady || !chatIdFromUrl) return;
    let cancelled = false;
    fetchChatMessages(chatIdFromUrl)
      .then((data) => {
        if (cancelled) return;
        const mapped: ChatMessage[] = (data.messages || []).map((m) => ({
          id: m.id,
          type: m.role === "ai" ? "bot" : "user",
          content: m.content,
          isAnimating: false,
        }));
        setMessages(mapped);
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      });
    return () => { cancelled = true; };
  }, [isReady, chatIdFromUrl]);

  useEffect(() => {
    if (isLoading) {
      setLoadingStep(0);
      const interval = setInterval(
        () => setLoadingStep((p) => (p < 2 ? p + 1 : p)),
        1500
      );
      return () => clearInterval(interval);
    }
  }, [isLoading]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  const handleRate = async (messageId: number | string, rating: number) => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg) return;

    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, rating, feedbackReason: undefined } : m
      )
    );

    if (rating > 3) {
      try {
        await submitFeedback({
          question: msg.userQuery || "",
          answer: msg.content,
          rating,
          reason: "",
          suggested_questions: msg.suggested_questions || [],
        });
      } catch (err) {
        console.error("Failed to submit feedback:", err);
      }
    }
  };

  const handleFeedbackReason = async (
    messageId: number | string,
    reason: string
  ) => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg) return;

    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, feedbackReason: reason } : m
      )
    );

    try {
      await submitFeedback({
        question: msg.userQuery || "",
        answer: msg.content,
        rating: msg.rating || 1,
        reason,
        suggested_questions: msg.suggested_questions || [],
      });
    } catch (err) {
      console.error("Failed to submit feedback:", err);
    }
  };

const handleSend = async (text?: string, isHidden = false) => {
  const query = text || input.trim();
  if (!query || isLoading) return;

  messageCountRef.current += 1;

  // Check for bloodwork query first
  if (
    query.toLowerCase().includes("blood work") ||
    query.toLowerCase().includes("bloodwork")
  ) {
    if (!isHidden) {
      setMessages((p) => [
        ...p,
        { id: Date.now(), type: "user", content: query, isAnimating: false },
      ]);
    }
    setMessages((p) => [
      ...p,
      {
        id: Date.now() + 1,
        type: "bot",
        content: getTranslation("uploadPrompt", langCode),
        isBloodWorkPrompt: true,
        isAnimating: false,
      },
    ]);
    setInput("");
    return;
  }

  // Track the bot message ID for updates
  const botMessageId = Date.now() + 1;

  if (!isHidden) {
    setMessages((p) => [
      ...p,
      { id: Date.now(), type: "user", content: query, isAnimating: false, userQuery: query },
    ]);
  }

  // Create the bot message BEFORE streaming starts to prevent multiple bubbles
  setMessages((p) => [
    ...p,
    {
      id: botMessageId,
      type: "bot",
      content: "",
      isAnimating: true,
      userQuery: query,
    },
  ]);

  setInput("");
  setIsLoading(true);

  try {
    await sendChatMessage(
      {
        message: query,
        language: langCode,
        ...(chatIdFromUrl && { chatId: chatIdFromUrl }),
      },
      (chunk) => {
        // Handle text chunks (streaming content)
        if (chunk.text || chunk.content) {
          const textContent = chunk.text || chunk.content || '';
          setMessages((prev) => {
            const newMsgs = [...prev];
            const botMsgIndex = newMsgs.findIndex((m) => m.id === botMessageId);
            if (botMsgIndex !== -1) {
              newMsgs[botMsgIndex] = {
                ...newMsgs[botMsgIndex],
                content: newMsgs[botMsgIndex].content + textContent,
              };
            }
            return newMsgs;
          });
        }

        // Handle final payload with isDone
        if (chunk.isDone) {
          setMessages((prev) => {
            const newMsgs = [...prev];
            const botMsgIndex = newMsgs.findIndex((m) => m.id === botMessageId);
            if (botMsgIndex !== -1) {
              newMsgs[botMsgIndex] = {
                ...newMsgs[botMsgIndex],
                isAnimating: false,
                isStreamComplete: true,
                citations: chunk.citations || [],
                followUpQuestions: chunk.followUpQuestions || [],
                suggested_questions: chunk.followUpQuestions || [],
                isOffTopic: chunk.isOffTopic || false,
              };
            }
            return newMsgs;
          });
        }
      },
      () => {
        setIsLoading(false);
        // Ensure animation is stopped even if isDone wasn't received
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === botMessageId && msg.isAnimating
              ? { ...msg, isAnimating: false, isStreamComplete: true }
              : msg
          )
        );
      },
      (error) => {
        console.error('Chat error:', error);
        setIsLoading(false);
        // Update the existing bot message with error
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === botMessageId
              ? { ...msg, content: getTranslation("chatError", langCode), isAnimating: false }
              : msg
          )
        );
      }
    );
  } catch (err) {
    console.error('Chat error:', err);
    setIsLoading(false);
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === botMessageId
          ? { ...msg, content: getTranslation("chatError", langCode), isAnimating: false }
          : msg
      )
    );
  }
};

  const handleBloodWorkConfirm = async (confirmedData: {
    results: LabResult[];
    treatment: string;
  }) => {
    setShowBloodWorkModal(false);
    setBloodWorkData(null);

    const labSummary = confirmedData.results
      .map((r) => `${r.name}: ${r.value} ${r.unit}`)
      .join(", ");

    const treatmentLabel = confirmedData.treatment
      ? ` (Treatment: ${confirmedData.treatment})`
      : "";

    const userQuery = `Analyze my lab results: ${labSummary}${treatmentLabel}`;
    const botMessageId = Date.now() + 1;

    // Add user message
    setMessages((p) => [
      ...p,
      {
        id: Date.now(),
        type: "user",
        content: userQuery,
        isAnimating: false,
      },
    ]);

    // Create bot message BEFORE streaming starts
    setMessages((p) => [
      ...p,
      {
        id: botMessageId,
        type: "bot",
        content: "",
        isAnimating: true,
        userQuery,
      },
    ]);

    setIsLoading(true);
    try {
      await sendChatMessage(
        {
          message:
            "Please analyze these fertility blood work results and provide a detailed interpretation.",
          language: langCode,
          clinical_data: { results: confirmedData.results },
          treatment: confirmedData.treatment || undefined,
          ...(chatIdFromUrl && { chatId: chatIdFromUrl }),
        },
        (chunk) => {
          // Handle text chunks
          if (chunk.text || chunk.content) {
            const textContent = chunk.text || chunk.content || '';
            setMessages((prev) => {
              const newMsgs = [...prev];
              const botMsgIndex = newMsgs.findIndex((m) => m.id === botMessageId);
              if (botMsgIndex !== -1) {
                newMsgs[botMsgIndex] = {
                  ...newMsgs[botMsgIndex],
                  content: newMsgs[botMsgIndex].content + textContent,
                };
              }
              return newMsgs;
            });
          }

          // Handle final payload with isDone
          if (chunk.isDone) {
            setMessages((prev) => {
              const newMsgs = [...prev];
              const botMsgIndex = newMsgs.findIndex((m) => m.id === botMessageId);
              if (botMsgIndex !== -1) {
                newMsgs[botMsgIndex] = {
                  ...newMsgs[botMsgIndex],
                  isAnimating: false,
                  isStreamComplete: true,
                  citations: chunk.citations || [],
                  followUpQuestions: chunk.followUpQuestions || [],
                  suggested_questions: chunk.followUpQuestions || [],
                };
              }
              return newMsgs;
            });
          }
        },
        () => {
          setIsLoading(false);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === botMessageId && msg.isAnimating
                ? { ...msg, isAnimating: false, isStreamComplete: true }
                : msg
            )
          );
        },
        (error) => {
          console.error('Chat error:', error);
          setIsLoading(false);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === botMessageId
                ? { ...msg, content: getTranslation("chatError", langCode), isAnimating: false }
                : msg
            )
          );
        }
      );
    } catch (err) {
      console.error("Blood work chat error:", err);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === botMessageId
            ? { ...msg, content: getTranslation("bloodworkError", langCode), isAnimating: false }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (e.target) e.target.value = "";

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setMessages((p) => [
        ...p,
        {
          id: Date.now(),
          type: "bot",
          content: getTranslation("pdfOnly", langCode),
          isAnimating: false,
        },
      ]);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessages((p) => [
        ...p,
        {
          id: Date.now(),
          type: "bot",
          content: getTranslation("fileTooLarge", langCode),
          isAnimating: false,
        },
      ]);
      return;
    }

    setIsUploadingPdf(true);
    setMessages((p) => [
      ...p,
      {
        id: Date.now(),
        type: "user",
        content: `${getTranslation("uploaded", langCode)} ${file.name}`,
        isAnimating: false,
      },
    ]);

    try {
      const data = await analyzeBloodWork(file, langCode);

      if (data.error) {
        setMessages((p) => [
          ...p,
          {
            id: Date.now(),
            type: "bot",
            content: data.error || getTranslation("uploadError", langCode),
            isAnimating: false,
          },
        ]);
        setIsUploadingPdf(false);
        return;
      }

      if (data.results && data.results.length > 0) {
        setBloodWorkData({
          results: data.results,
          fertility_note: data.fertility_note,
          suggested_questions: data.suggested_questions,
        });
        setShowBloodWorkModal(true);
      } else {
        setMessages((p) => [
          ...p,
          {
            id: Date.now(),
            type: "bot",
            content: getTranslation("noResults", langCode),
            isAnimating: false,
          },
        ]);
      }
    } catch (err) {
      console.error("PDF upload error:", err);
      setMessages((p) => [
        ...p,
        {
          id: Date.now(),
          type: "bot",
          content: getTranslation("uploadFailed", langCode),
          isAnimating: false,
        },
      ]);
    } finally {
      setIsUploadingPdf(false);
    }
  };

  if (!isReady) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-izana-light dark:bg-izana-dark">
        <Loader2 className="w-8 h-8 animate-spin text-izana-primary dark:text-izana-teal" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-izana-light dark:bg-izana-dark overflow-hidden">
      {/* HEADER */}
      <header className="flex justify-between items-center px-4 py-3 border-b border-black/5 dark:border-white/5 bg-white/50 dark:bg-white/5 backdrop-blur-sm">
        <button
          onClick={() =>
            messages.length > 0 ? setMessages([]) : router.push("/")
          }
          className="p-2 rounded-full hover:bg-black/5"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex flex-col items-center">
          <span className="font-bold text-izana-primary dark:text-izana-teal">
            Izana AI
          </span>
          <span className="text-[10px] text-gray-400">
            {getTranslation("headerSubtitle", langCode)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <div className="relative">
            <button
              onClick={() => setShowLangPicker((v) => !v)}
              className="p-2 rounded-full hover:bg-black/5"
              aria-label="Change language"
            >
              <Globe className="w-4 h-4" />
            </button>
            {showLangPicker && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-[#2a2a2a] border border-gray-200 dark:border-[#404040] rounded-xl shadow-lg py-1 min-w-[140px]">
                {Object.entries(LANGUAGE_NAMES).map(([code, name]) => (
                  <button
                    key={code}
                    onClick={() => {
                      setLangCode(code);
                      localStorage.setItem("izana_language", code);
                      setShowLangPicker(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/5 ${
                      langCode === code ? "font-bold text-izana-primary dark:text-izana-teal" : ""
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => router.push("/profile")}
            className="p-2 rounded-full hover:bg-black/5"
            aria-label="Profile"
          >
            <User className="w-5 h-5" />
          </button>
          <button
            onClick={() => {
              localStorage.removeItem("izana_token");
              localStorage.removeItem("izana_user");
              localStorage.removeItem("izana_language");
              router.push("/");
            }}
            className="p-2 rounded-full hover:bg-black/5 text-gray-400 hover:text-red-500 transition-colors"
            aria-label="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* MESSAGES */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 max-w-3xl mx-auto w-full">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center space-y-8">
            <h2 className="text-3xl font-light text-center">
              {(() => {
                const text = getTranslation("howCanHelp", langCode);
                // For English, highlight Izana; for other languages, just show the translated text
                if (langCode === "en") {
                  const parts = text.split("Izana");
                  return (
                    <>
                      {parts[0]}
                      <span className="font-bold text-izana-primary dark:text-izana-teal">Izana</span>
                      {parts[1]}
                    </>
                  );
                }
                return text;
              })()}
            </h2>
            <div className="grid grid-cols-2 gap-3 w-full">
              {TOPIC_ICONS.map((t, i) => {
                const IconComponent = t.icon;
                return (
                  <button
                    key={i}
                    onClick={() => handleSend(t.query, true)}
                    className="p-4 bg-white dark:bg-white/5 rounded-3xl border border-black/5 text-center font-bold hover:shadow-md transition-all flex flex-col items-center gap-2"
                  >
                    <IconComponent className="w-6 h-6 text-izana-primary dark:text-izana-teal" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex w-full ${
                m.type === "user" ? "justify-end" : "justify-start gap-3"
              }`}
            >
              {m.type === "bot" && (
                <div className="w-8 h-8 rounded-full bg-white p-1 shrink-0 border border-black/5">
                  <img src="/logo.png" alt="Izana" className="dark:invert" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-3xl p-5 ${
                  m.type === "user"
                    ? "bg-white text-black border border-black/5"
                    : "bg-gradient-to-br from-izana-primary to-izana-indigo text-white shadow-lg"
                }`}
              >
                {m.type === "bot" && m.isOffTopic && (
                  <p className="text-xs text-white/70 mb-2 font-medium">
                    {getTranslation("scopeReminder", langCode)}
                  </p>
                )}
                {/* Message Content */}
                {m.isAnimating ? (
                  <GeminiFadeText
                    text={m.content}
                    onComplete={() =>
                      setMessages((prev) =>
                        prev.map((msg) =>
                          msg.id === m.id
                            ? { ...msg, isAnimating: false }
                            : msg
                        )
                      )
                    }
                  />
                ) : (
                  <div className="space-y-4">
                    {m.content.split("\n\n").map((p, i) => (
                      <p key={i} className="leading-relaxed">
                        {p}
                      </p>
                    ))}
                  </div>
                )}

                {/* Citations */}
                {m.type === "bot" &&
                  !m.isAnimating &&
                  m.isStreamComplete &&
                  m.citations &&
                  m.citations.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3, delay: 0.1 }}
                      className="mt-3 pt-2 border-t border-white/10"
                    >
                      <p className="text-xs text-white/40 mb-1">{getTranslation("sources", langCode)}</p>
                      <div className="flex flex-wrap gap-1">
                        {m.citations.map((c, i) => (
                          <span
                            key={i}
                            className="text-xs bg-white/10 px-2 py-0.5 rounded-full text-white/60"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </motion.div>
                  )}

                {/* KB References and KB Gap indicators removed - admin-only data */}

                {/* Follow-Up Questions - Gemini-style */}
                {m.type === "bot" &&
                  !m.isAnimating &&
                  m.isStreamComplete &&
                  !m.isBloodWorkPrompt &&
                  ((m.followUpQuestions && m.followUpQuestions.length > 0) ||
                   (m.suggested_questions && m.suggested_questions.length > 0)) && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: 0.2 }}
                      className="pt-4 mt-4 border-t border-white/10"
                    >
                      <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-3">
                        {getTranslation("continueExploring", langCode)}
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {(m.followUpQuestions || m.suggested_questions || []).map((q, i) => (
                          <button
                            key={i}
                            onClick={() => handleSend(q)}
                            className="text-sm bg-white/10 hover:bg-white/20 px-4 py-2.5 rounded-full flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
                          >
                            <span className="text-white/90">{q}</span>
                            <ChevronRight className="w-4 h-4 text-izana-coral shrink-0" />
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}

                {/* Feedback: micro thumbs every 3rd bot msg, stars otherwise */}
                {m.type === "bot" &&
                  !m.isAnimating &&
                  m.isStreamComplete &&
                  !m.isBloodWorkPrompt &&
                  m.userQuery && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3, delay: 0.4 }}
                    >
                      {(() => {
                        const botIndex = messages.filter((x) => x.type === "bot" && x.userQuery).indexOf(m);
                        const isMicroSlot = (botIndex + 1) % 3 === 0 && botIndex >= 0;
                        if (isMicroSlot && !m.rating) {
                          return (
                            <MicroFeedback
                              onThumbsUp={() => handleRate(m.id, 5)}
                              onThumbsDown={() => handleRate(m.id, 1)}
                              lang={langCode}
                            />
                          );
                        }
                        return (
                          <InlineStarRating
                            currentRating={m.rating || 0}
                            feedbackReason={m.feedbackReason}
                            onRate={(r) => handleRate(m.id, r)}
                            onReasonSelect={(reason) =>
                              handleFeedbackReason(m.id, reason)
                            }
                            lang={langCode}
                          />
                        );
                      })()}
                    </motion.div>
                  )}

                {/* Blood Work Upload Button */}
                {m.isBloodWorkPrompt && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingPdf}
                    className="mt-4 w-full bg-izana-coral text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isUploadingPdf ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />{" "}
                        {getTranslation("processing", langCode)}
                      </>
                    ) : (
                      <>
                        <Paperclip className="w-4 h-4" /> {getTranslation("selectPdf", langCode)}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          ))
        )}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-izana-primary dark:text-izana-teal" />
            <span className="text-sm text-izana-primary dark:text-izana-teal font-bold">
              {getLoadingSteps(langCode)[loadingStep]}
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT BAR */}
      <div className="p-4 bg-izana-light dark:bg-izana-dark border-t border-black/5">
        <div className="max-w-3xl mx-auto flex items-center bg-white dark:bg-[#2a2a2a] rounded-full px-4 py-2 border border-black/5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && !e.shiftKey && handleSend()
            }
            placeholder={getTranslation("askAnything", langCode)}
            className="flex-1 bg-transparent py-2 outline-none text-sm"
            maxLength={2000}
            disabled={isLoading}
          />
          <button
            onClick={() => handleSend()}
            disabled={isLoading || !input.trim()}
            className="p-2 bg-izana-coral rounded-full text-white disabled:opacity-50 transition-opacity"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-center text-[10px] text-gray-400 mt-2">
          {getTranslation("privacyNote", langCode)}
        </p>
      </div>

      {/* Hidden File Input */}
      <input
        type="file"
        accept="application/pdf"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileUpload}
      />

      {/* Blood Work Confirmation Modal */}
      <AnimatePresence>
        {showBloodWorkModal && bloodWorkData && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => setShowBloodWorkModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-4 sm:inset-x-4 z-50 max-w-2xl mx-auto flex items-center justify-center"
            >
              <BloodWorkConfirm
                initialData={bloodWorkData}
                onConfirm={handleBloodWorkConfirm}
                onCancel={() => setShowBloodWorkModal(false)}
                lang={langCode}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- PAGE WRAPPER WITH SUSPENSE ---
export default function ChatPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ChatPageContent />
    </Suspense>
  );
}
