"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Send, ArrowLeft, Loader2, Sparkles, BookOpen, Heart, Activity, CheckCircle2, ChevronRight, TestTube, Paperclip } from "lucide-react";
import BloodWorkConfirm from "@/components/BloodWorkConfirm";

// --- FULL LOCALIZATION DICTIONARY ---
const TRANSLATIONS: any = {
  en: { 
    morning: "Good Morning", afternoon: "Good Afternoon", evening: "Good Evening",
    topics: "Topics you can ask about", placeholder: "Type your question...", 
    disclaimer: "Izana AI does not provide medical diagnosis. Check with your provider. Chats deleted in 24h.", 
    rate: "Rate this response", feedback_prompt: "What was missing?", feedback_thanks: "Thank you for helping us improve!",
    shadow: "Try asking: \"What lifestyle changes improve IVF success?\"",
    t_ivf: "IVF", t_ivf_q: "What is IVF?",
    t_male: "Male Fertility", t_male_q: "How do men contribute to infertility and what can men do?",
    t_iui: "IUI", t_iui_q: "What is IUI?",
    t_nutrition: "Nutrition & Fertility", t_nutrition_q: "How important is what you eat to fertility treatment success?",
    t_bloodwork: "Understand Blood Work", t_bloodwork_q: "I want to understand my blood work.",
    t_success: "Improving Success", t_success_q: "What are 10 things you can do right now to improve fertility treatment success rates?",
    bw_intro: "I can analyze your blood work and provide insights related to your fertility, reproductive health, and treatment plan. \n\nPlease select your current treatment path and upload your lab report below so I can review it.",
    r1: "Inaccurate", r2: "Vague", r3: "Tone", r4: "Other",
    suggested: "Continue exploring:"
  },
  es: { morning: "Buenos Días", afternoon: "Buenas Tardes", evening: "Buenas Noches", topics: "Temas para preguntar", placeholder: "Escribe tu pregunta...", disclaimer: "Izana AI no proporciona diagnósticos médicos.", rate: "Califica esta respuesta", feedback_prompt: "¿Qué faltó?", feedback_thanks: "¡Gracias!", shadow: "Prueba: \"¿Qué cambios mejoran la FIV?\"", suggested: "Sigue explorando:", t_bloodwork: "Análisis de Sangre", t_bloodwork_q: "I want to understand my blood work.", bw_intro: "Puedo analizar sus análisis de sangre y proporcionar información..." },
  ja: { morning: "おはようございます", afternoon: "こんにちは", evening: "こんばんは", topics: "トピック", placeholder: "質問を入力...", disclaimer: "Izana AIは診断を提供しません。", rate: "評価する", feedback_prompt: "何が不足していましたか？", feedback_thanks: "ありがとうございます！", shadow: "例：「IVFの成功率を上げるには？」", suggested: "さらに詳しく:", t_bloodwork: "血液検査を理解する", t_bloodwork_q: "I want to understand my blood work.", bw_intro: "血液検査を分析し、情報を提供できます..." },
  zh: { morning: "早上好", afternoon: "下午好", evening: "晚上好", topics: "推荐主题", placeholder: "输入问题...", disclaimer: "Izana AI 不提供医疗诊断。", rate: "评价此回复", feedback_prompt: "哪里不足？", feedback_thanks: "感谢您！", shadow: "试试问：“如何提高成功率？”", suggested: "继续探索:", t_bloodwork: "了解验血报告", t_bloodwork_q: "I want to understand my blood work.", bw_intro: "我可以分析您的验血报告..." },
  hi: { morning: "सुप्रभात", afternoon: "नमस्कार", evening: "शुभ संध्या", topics: "विषय", placeholder: "प्रश्न लिखें...", disclaimer: "Izana AI निदान प्रदान नहीं करता है।", rate: "मूल्यांकन करें", feedback_prompt: "क्या कमी थी?", feedback_thanks: "धन्यवाद!", shadow: "पूछें: \"IVF सफलता दर कैसे बढ़ाएं?\"", suggested: "आगे जानें:", t_bloodwork: "रक्त परीक्षण समझें", t_bloodwork_q: "I want to understand my blood work.", bw_intro: "मैं आपके रक्त परीक्षण का विश्लेषण कर सकता हूँ..." },
  ta: { morning: "காலை வணக்கம்", afternoon: "மதிய வணக்கம்", evening: "மாலை வணக்கம்", topics: "தலைப்புகள்", placeholder: "கேட்கவும்...", disclaimer: "Izana AI நோயறிதலை வழங்காது.", rate: "மதிப்பிடவும்", feedback_prompt: "என்ன குறை?", feedback_thanks: "நன்றி!", shadow: "கேட்கவும்: \"வெற்றி விகிதத்தை கூட்டுவது எப்படி?\"", suggested: "மேலும் ஆராய:", t_bloodwork: "இரத்த பரிசோதனையை புரிந்து கொள்ளுங்கள்", t_bloodwork_q: "I want to understand my blood work.", bw_intro: "நான் உங்கள் இரத்த பரிசோதனையை பகுப்பாய்வு செய்யலாம்..." },
  te: { morning: "శుభోదయం", afternoon: "శుభ మధ్యాహ్నం", evening: "శుభ సాయంత్రం", topics: "అంశాలు", placeholder: "ప్రశ్న...", disclaimer: "Izana AI రోగనిర్ధారణ అందించదు.", rate: "రేట్ చేయండి", feedback_prompt: "లోపం ఏమిటి?", feedback_thanks: "ధన్యవాదాలు!", shadow: "ప్రయత్నించండి: \"IVF విజయం ఎలా?\"", suggested: "మరింత అన్వేషించండి:", t_bloodwork: "రక్త పరీక్షను అర్థం చేసుకోండి", t_bloodwork_q: "I want to understand my blood work.", bw_intro: "నేను మీ రక్త పరీక్షను విశ్లేషించగలను..." },
  ml: { morning: "സുപ്രഭാതം", afternoon: "ഗുഡ് ആഫ്റ്റർനൂൺ", evening: "ശുഭ സായാഹ്നം", topics: "വിഷയങ്ങൾ", placeholder: "ചോദിക്കൂ...", disclaimer: "Izana AI രോഗനിർണയം നൽകുന്നില്ല.", rate: "വിലയിരുത്തുക", feedback_prompt: "എന്താണ് കുറവ്?", feedback_thanks: "നന്ദി!", shadow: "ചോദിക്കുക: \"വിജയസാധ്യത എങ്ങനെ കൂട്ടാം?\"", suggested: "കൂടുതൽ അറിയുക:", t_bloodwork: "രക്തപരിശോധന മനസ്സിലാക്കുക", t_bloodwork_q: "I want to understand my blood work.", bw_intro: "നിങ്ങളുടെ രക്തപരിശോധന വിശകലനം ചെയ്യാൻ എനിക്ക് കഴിയും..." },
  bn: { morning: "সুপ্রভাত", afternoon: "শুভ দুপুর", evening: "শুভ সন্ধ্যা", topics: "বিষয়", placeholder: "লিখুন...", disclaimer: "Izana AI চিকিৎসা পরামর্শ দেয় না।", rate: "রেটিং দিন", feedback_prompt: "কি কম ছিল?", feedback_thanks: "ধন্যবাদ!", shadow: "জিজ্ঞাসা করুন: \"সাফল্যের হার কত?\"", suggested: "আরও জানুন:", t_bloodwork: "রক্ত পরীক্ষা বুঝুন", t_bloodwork_q: "I want to understand my blood work.", bw_intro: "আমি আপনার রক্ত পরীক্ষা বিশ্লেষণ করতে পারি..." }
};

const TOPIC_ICONS = [
  { icon: <Activity className="w-5 h-5" />, labelKey: "t_ivf", queryKey: "t_ivf_q" },
  { icon: <Heart className="w-5 h-5" />, labelKey: "t_male", queryKey: "t_male_q" },
  { icon: <Sparkles className="w-5 h-5" />, labelKey: "t_iui", queryKey: "t_iui_q" },
  { icon: <BookOpen className="w-5 h-5" />, labelKey: "t_nutrition", queryKey: "t_nutrition_q" },
  { icon: <TestTube className="w-5 h-5" />, labelKey: "t_bloodwork", queryKey: "t_bloodwork_q" }, // CHANGED
  { icon: <CheckCircle2 className="w-5 h-5" />, labelKey: "t_success", queryKey: "t_success_q" },
];

const LOADING_STEPS = ["Understanding your needs...", "Reading medical knowledge...", "Writing a caring response...", "Almost there..."];

const cleanCitation = (raw: any) => {
  try {
    let cleaned = String(raw || "").replace(/\\/g, '/').split('/').pop() || String(raw);
    cleaned = cleaned.replace(/\.pdf$/i, '');
    cleaned = cleaned.replace(/(_compress|-compress|_final_version|_\d_\d|nbsped|factsheet)/gi, '');
    cleaned = cleaned.replace(/\d{8,}/g, '');
    cleaned = cleaned.replace(/[-_]/g, ' ');
    return cleaned.trim().replace(/\b\w/g, c => c.toUpperCase());
  } catch {
    return "Medical Document";
  }
};

const formatText = (text: string) => {
  let clean = text.replace(/\*\*\s*\n/g, ''); 
  clean = clean.replace(/—/g, '-'); 
  return clean.replace(/\*\*/g, '').replace(/\*/g, '');
};

const TypewriterText = ({ text, onComplete, onTick }: { text: any, onComplete: () => void, onTick: () => void }) => {
  let safeText = "";
  if (typeof text === 'string') safeText = text;
  else if (Array.isArray(text)) safeText = text.join('\n\n');
  else if (typeof text === 'object' && text !== null) safeText = Object.values(text).join('\n\n');
  else safeText = String(text || "");

  safeText = safeText.replace(/\*\*/g, '').replace(/\*/g, '').replace(/—/g, '-'); 

  const [displayedLength, setDisplayedLength] = useState(0);
  
  useEffect(() => {
    let currentLen = 0;
    const timer = setInterval(() => {
      currentLen += 1; 
      setDisplayedLength(currentLen);
      onTick();
      if (currentLen >= safeText.length) {
        clearInterval(timer);
        onComplete();
      }
    }, 20); 
    
    return () => clearInterval(timer);
  }, [safeText, onComplete, onTick]);

  return <span>{safeText.slice(0, displayedLength)}</span>;
};

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [langCode, setLangCode] = useState("en");
  const [timeOfDay, setTimeOfDay] = useState<"morning" | "afternoon" | "evening">("morning");
  
  // BLOOD WORK STATES
  const [verificationData, setVerificationData] = useState<any>(null);
  const [selectedTreatment, setSelectedTreatment] = useState("IVF");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const getText = (key: string) => {
    const langDict = TRANSLATIONS[langCode] || TRANSLATIONS["en"];
    return langDict[key] || TRANSLATIONS["en"][key] || key;
  };

  useEffect(() => {
    const saved = localStorage.getItem("izana_language");
    if (saved) setLangCode(saved);
    const hour = new Date().getHours();
    if (hour < 12) setTimeOfDay("morning");
    else if (hour < 18) setTimeOfDay("afternoon");
    else setTimeOfDay("evening");
  }, []);

  useEffect(() => {
    if (isLoading) {
      const interval = setInterval(() => setLoadingStep(p => (p < 3 ? p + 1 : p)), 1000);
      return () => clearInterval(interval);
    }
    setLoadingStep(0);
  }, [isLoading]);

  const scrollToBottomSmooth = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  
  const scrollToBottomInstant = useCallback(() => {
    const container = document.getElementById("chat-scroll-container");
    if (container && messagesEndRef.current) {
      const isNearBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 150;
      if (isNearBottom) {
        messagesEndRef.current.scrollIntoView({ behavior: "auto", block: "end" });
      }
    }
  }, []);

  useEffect(() => {
    if (isLoading || messages.length > 0) scrollToBottomSmooth();
  }, [isLoading, messages.length]);

  // --- BLOOD WORK PIPELINE ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/analyze-bloodwork`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      setVerificationData(data); // Show verification overlay
    } catch (err) {
      setMessages(prev => [...prev, { id: Date.now(), type: "bot", content: "Could not read the report. Please try a clearer photo.", isAnimating: false }]);
    } finally {
      setIsLoading(false);
    }
  };

  const onFinalConfirm = async (confirmedData: any) => {
    setVerificationData(null); 
    setIsLoading(true);
    
    const userMsg = { id: Date.now(), type: "user", content: `Analyzing my verified blood work. Target Treatment: ${selectedTreatment}` };
    setMessages(prev => [...prev, userMsg]);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: "Analyze these blood results and provide insights based on my treatment.", 
          language: langCode, 
          clinical_data: confirmedData,
          treatment: selectedTreatment
        })
      });
      const data = await res.json();
      setMessages(prev => [...prev, { 
        id: Date.now() + 1, type: "bot", content: data.response, citations: data.citations || [], isAnimating: true 
      }]);
    } catch {
      setMessages(prev => [...prev, { id: Date.now(), type: "bot", content: "Analysis failed. Please try again.", isAnimating: false }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async (text = input, isHiddenQuery = false) => {
    const queryText = text || input;
    if (!queryText.trim() || isLoading) return;
    
    // Show user message (if not hidden)
    if (!isHiddenQuery || queryText === getText("t_bloodwork_q")) {
      setMessages(prev => [...prev, { id: Date.now(), type: "user", content: queryText }]);
    }
    
    setInput("");

    // INTERCEPT: If it's the blood work topic, trigger local UI instead of LLM
    if (queryText === getText("t_bloodwork_q") || queryText === "I want to understand my blood work.") {
      setTimeout(() => {
        setMessages(prev => [...prev, { 
          id: Date.now() + 1, 
          type: "bot", 
          content: getText("bw_intro"), 
          isBloodWorkPrompt: true, // Special flag to render dropdowns
          isAnimating: false
        }]);
        scrollToBottomSmooth();
      }, 600);
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: queryText, language: langCode })
      });
      const data = await res.json();
      
      const safeResponse = Array.isArray(data.response) ? data.response.join('\n\n') : String(data.response || "No response received.");
      const safeCitations = Array.isArray(data.citations) ? data.citations.map((c: any) => cleanCitation(c)) : [];
      const safeQuestions = Array.isArray(data.suggested_questions) ? data.suggested_questions.map((q: any) => String(q)) : [];

      setMessages(prev => [...prev, { 
        id: Date.now() + 1, 
        type: "bot", 
        content: safeResponse, 
        citations: safeCitations, 
        suggested_questions: safeQuestions,
        questionOriginal: queryText, 
        rating: 0, 
        feedbackSubmitted: false, 
        showReasonBox: false,
        isAnimating: true 
      }]);
    } catch {
      setMessages(prev => [...prev, { id: Date.now(), type: "bot", content: "Connection error. Please try again.", isAnimating: false }]);
    } finally { setIsLoading(false); }
  };

  const markAnimationComplete = (id: number) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, isAnimating: false } : m));
    setTimeout(scrollToBottomSmooth, 100); 
  };

  const submitRating = async (msgId: number, rating: number, reason: string = "") => {
    const msg = messages.find(m => m.id === msgId);
    if (!msg) return;
    const isInstantSubmit = rating >= 4 || reason !== "";

    setMessages(prev => prev.map(m => 
      m.id === msgId ? { ...m, rating, feedbackSubmitted: isInstantSubmit, showReasonBox: rating < 4 && reason === "" } : m
    ));

    if (isInstantSubmit) {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/feedback`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: msg.questionOriginal, answer: msg.content, rating, reason, suggested_questions: msg.suggested_questions })
        });
      } catch (e) { console.error(e); }
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#f9f9f9] dark:bg-[#212121] font-sans antialiased overflow-hidden">
      
      {/* Hidden File Input for Blood Work */}
      <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />

      {/* Header */}
      <header className="flex justify-between items-center px-4 py-3 bg-[#f9f9f9]/90 backdrop-blur-
