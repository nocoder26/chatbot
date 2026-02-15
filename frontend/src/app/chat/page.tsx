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
    bw_intro: "I can analyze your blood work and provide insights related to your fertility, reproductive health, and treatment plan. \n\nPlease select your current treatment path and upload your lab report (PDF) below so I can review it.",
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
  { icon: <TestTube className="w-5 h-5" />, labelKey: "t_bloodwork", queryKey: "t_bloodwork_q" }, 
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

// --- GEMINI-STYLE FADE RENDERING ---
const GeminiFadeText = ({ text, onComplete }: { text: any, onComplete: () => void }) => {
  let safeText = "";
  if (typeof text === 'string') safeText = text;
  else if (Array.isArray(text)) safeText = text.join('\n\n');
  else if (typeof text === 'object' && text !== null) safeText = Object.values(text).join('\n\n');
  else safeText = String(text || "");

  safeText = safeText.replace(/\*\*/g, '').replace(/\*/g, '').replace(/—/g, '-'); 

  // Split by double line breaks to animate paragraph by paragraph
  const paragraphs = safeText.split('\n\n').filter(p => p.trim() !== '');

  useEffect(() => {
    // Calculate total animation time to trigger the "complete" state (showing follow-up questions)
    const totalTime = paragraphs.length * 300 + 400; // 300ms stagger + buffer
    const timer = setTimeout(onComplete, totalTime);
    return () => clearTimeout(timer);
  }, [paragraphs.length, onComplete]);

  return (
    <div className="flex flex-col gap-4">
      {paragraphs.map((p, i) => (
        <motion.p
          key={i}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: i * 0.3 }} // Stagger each paragraph by 0.3s
          className="leading-relaxed"
        >
          {p}
        </motion.p>
      ))}
    </div>
  );
};

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [langCode, setLangCode] = useState("en");
  const [timeOfDay, setTimeOfDay] = useState<"morning" | "afternoon" | "evening">("morning");
  
  // Track interactions to prevent Izana promo spam
  const [interactionCount, setInteractionCount] = useState(0);
  
  // BLOOD WORK STATES
  const [verificationData, setVerificationData] = useState<any>(null);
  const [selectedTreatment, setSelectedTreatment] = useState("Not sure / Just checking");
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

  useEffect(() => {
    if (isLoading || messages.length > 0) scrollToBottomSmooth();
  }, [isLoading, messages.length]);

  // --- INTERCEPT BACK BUTTON ---
  const handleBackClick = () => {
    if (messages.length > 0) {
      // Clear chat and return to topics view
      setMessages([]);
      setInput("");
      setVerificationData(null);
      setInteractionCount(0); // Reset interaction count on new chat
    } else {
      // If already at topics view, go back to language selection
      router.push("/");
    }
  };

  // --- BLOOD WORK PIPELINE ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // --- ENFORCE PDF ONLY & 5MB SIZE LIMIT ---
    if (file.type !== "application/pdf") {
      alert("Please upload a PDF file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      alert("File is too large. Please ensure the PDF is under 5MB.");
      return;
    }

    setIsLoading(true);
    const formData = new FormData();
    formData.append('file', file, file.name); 

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/analyze-bloodwork`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      
      if (data.error) {
         setMessages(prev => [...prev, { id: Date.now(), type: "bot", content: data.error, isAnimating: false }]);
      } else {
         setVerificationData(data); // Show verification overlay
      }
      
    } catch (err) {
      setMessages(prev => [...prev, { id: Date.now(), type: "bot", content: "Could not read the PDF report. Please try a different file.", isAnimating: false }]);
    } finally {
      setIsLoading(false);
      // Reset input so the user can select the same file again if they cancelled
      if (fileInputRef.current) fileInputRef.current.value = '';
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
          treatment: selectedTreatment,
          interaction_count: interactionCount // Pass interaction count to avoid spam
        })
      });
      const data = await res.json();
      
      // FIXED: Actually map the suggested questions for blood work responses
      const safeResponse = Array.isArray(data.response) ? data.response.join('\n\n') : String(data.response || "No response received.");
      const safeCitations = Array.isArray(data.citations) ? data.citations.map((c: any) => cleanCitation(c)) : [];
      const safeQuestions = Array.isArray(data.suggested_questions) ? data.suggested_questions.map((q: any) => String(q)) : [];

      setMessages(prev => [...prev, { 
        id: Date.now() + 1, 
        type: "bot", 
        content: safeResponse, 
        citations: safeCitations, 
        suggested_questions: safeQuestions, // Added
        questionOriginal: "Analyze my blood work", // Added for feedback linking
        rating: 0, 
        feedbackSubmitted: false, 
        showReasonBox: false,
        isAnimating: true 
      }]);
      
      setInteractionCount(prev => prev + 1);
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
        body: JSON.stringify({ 
          message: queryText, 
          language: langCode,
          interaction_count: interactionCount // Pass interaction count
        })
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
      
      setInteractionCount(prev => prev + 1);
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
      
      {/* Hidden File Input for Blood Work - ENFORCED PDF ONLY */}
      <input type="file" accept="application/pdf" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />

      {/* Header */}
      <header className="flex justify-between items-center px-4 py-3 bg-[#f9f9f9]/90 backdrop-blur-md dark:bg-[#212121]/90 z-10 sticky top-0 shrink-0 border-b border-black/5 dark:border-white/5">
        <div className="flex items-center gap-3">
          <button onClick={handleBackClick} className="p-2 rounded-full hover:bg-[#3231b1]/10 dark:hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-5 h-5 text-[#212121] dark:text-[#f9f9f9]" />
          </button>
          
          <div className="flex items-center gap-2">
            <img 
              src="/logo.png" 
              alt="Izana AI" 
              className="h-6 md:h-7 object-contain dark:invert" 
              onError={(e) => {
                e.currentTarget.style.display = 'none'; 
                const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                if (fallback) fallback.style.display = 'block'; 
              }}
            />
            <span className="hidden font-bold text-[#3231b1] dark:text-[#86eae9] text-lg tracking-tight">Izana AI</span>
          </div>
          
        </div>
        <select value={langCode} onChange={(e) => { setLangCode(e.target.value); localStorage.setItem("izana_language", e.target.value); }} className="bg-white dark:bg-[#3231b1] border border-black/10 dark:border-white/10 shadow-sm text-[#212121] dark:text-[#f9f9f9] text-xs py-1.5 px-3 rounded-full outline-none appearance-none font-medium">
          <option value="en">English</option><option value="es">Español</option><option value="ja">日本語</option><option value="zh">普通话</option><option value="hi">हिन्दी</option><option value="ta">தமிழ்</option><option value="te">తెలుగు</option><option value="ml">മലയാളം</option><option value="bn">বাংলা</option>
        </select>
      </header>

      {/* Main Chat Area */}
      <div id="chat-scroll-container" className="flex-1 overflow-y-auto p-4 relative chat-container pb-10">
        
        {/* Verification Overlay */}
        <AnimatePresence>
          {verificationData && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
               <BloodWorkConfirm initialData={verificationData} onConfirm={onFinalConfirm} onCancel={() => setVerificationData(null)} />
            </motion.div>
          )}
        </AnimatePresence>

        {messages.length === 0 && !isLoading ? (
          <div className="h-full flex flex-col items-center justify-center -mt-4">
            <motion.h2 initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} className="text-3xl font-light text-[#212121] dark:text-[#f9f9f9] mb-8 text-center">
              <span className="font-bold text-[#3231b1] dark:text-[#86eae9]">{getText(timeOfDay)}</span>
            </motion.h2>
            <p className="text-xs text-[#212121]/50 dark:text-[#f9f9f9]/50 uppercase tracking-widest font-bold mb-6 text-center">{getText("topics")}</p>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full max-w-2xl px-2">
              {TOPIC_ICONS.map((topic, i) => (
                <button key={i} onClick={() => handleSend(getText(topic.queryKey), true)} className="flex flex-col items-center gap-3 p-4 bg-white dark:bg-[#3231b1]/20 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(50,49,177,0.15)] active:scale-95 transition-all border border-[#f9f9f9] dark:border-[#3231b1]/30 group">
                  <div className="p-3 bg-[#86eae9]/20 text-[#3231b1] dark:text-[#86eae9] rounded-full group-hover:bg-[#3231b1] group-hover:text-white transition-colors">{topic.icon}</div>
                  <span className="text-[13px] font-bold text-[#212121] dark:text-[#f9f9f9] text-center leading-tight">{getText(topic.labelKey)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6 max-w-3xl mx-auto">
            {messages.map((m) => (
              <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} key={m.id} className={`flex w-full ${m.type === 'user' ? 'justify-end' : 'justify-start gap-2 sm:gap-3'}`}>
                
                {/* BOT AVATAR */}
                {m.type === 'bot' && (
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white border border-black/10 dark:border-white/10 shadow-sm flex items-center justify-center shrink-0 mt-1 overflow-hidden p-1.5">
                    <img 
                      src="/logo.png" 
                      alt="AI" 
                      className="w-full h-full object-contain dark:invert" 
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'; 
                        const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                        if (fallback) fallback.style.display = 'flex'; 
                      }}
                    />
                    <div className="hidden w-full h-full bg-[#3231b1] rounded-full items-center justify-center">
                      <span className="text-[10px] font-bold text-white">AI</span>
                    </div>
                  </div>
                )}

                <div className={`max-w-[85%] sm:max-w-[80%] rounded-3xl p-5 shadow-[0_4px_20px_rgb(0,0,0,0.03)] ${m.type === 'user' ? 'bg-white dark:bg-[#3231b1]/20 border border-black/5 dark:border-white/10 text-[#212121] dark:text-white rounded-br-sm' : 'bg-gradient-to-br from-[#3231b1] to-[#230871] text-[#f9f9f9] rounded-bl-sm'}`}>
                  
                  <div className="whitespace-pre-wrap text-[15px] sm:text-base">
                    {m.isAnimating ? (
                      <GeminiFadeText text={m.content} onComplete={() => markAnimationComplete(m.id)} />
                    ) : (
                      <div className="flex flex-col gap-4">
                        {formatText(m.content).split('\n\n').map((p, idx) => (
                          <p key={idx} className="leading-relaxed">{p}</p>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* BLOOD WORK SPECIAL UI INJECTION */}
                  {m.isBloodWorkPrompt && (
                    <div className="mt-5 flex flex-col gap-3 border-t border-white/20 pt-4">
                      <label className="text-xs font-bold uppercase tracking-wider text-[#86eae9]">1. Select Treatment Path (Optional)</label>
                      <select 
                        value={selectedTreatment} 
                        onChange={(e) => setSelectedTreatment(e.target.value)}
                        className="p-3 rounded-xl bg-white/10 text-white border border-white/20 text-sm focus:outline-none focus:ring-2 focus:ring-[#86eae9]"
                      >
                        <option value="Not sure / Just checking" className="text-black">Not sure / Just checking</option>
                        <option value="IVF" className="text-black">IVF</option>
                        <option value="IUI" className="text-black">IUI</option>
                        <option value="Natural Conception" className="text-black">Natural Conception</option>
                        <option value="Timed Intercourse" className="text-black">Timed Intercourse</option>
                      </select>
                      
                      <label className="text-xs font-bold uppercase tracking-wider text-[#86eae9] mt-2">2. Upload Lab Report (PDF)</label>
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-[#ff7a55] hover:bg-[#e66c4a] text-white py-3 px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-md"
                      >
                        <Paperclip className="w-4 h-4" /> Select PDF
                      </button>
                    </div>
                  )}
                  
                  {/* STANDARD BOT FOOTER */}
                  {!m.isAnimating && m.type === 'bot' && !m.isBloodWorkPrompt && (
                    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                      {m.suggested_questions && m.suggested_questions.length > 0 && (
                        <div className="mt-5 flex flex-col gap-2 border-t border-white/10 pt-4">
                          <p className="text-[11px] font-bold text-[#86eae9] uppercase tracking-wider pl-1">{getText("suggested")}</p>
                          {m.suggested_questions.map((sq: string, i: number) => (
                            <button 
                              key={i}
                              onClick={() => handleSend(sq)}
                              className="text-left text-sm bg-white/10 hover:bg-white/20 text-white py-2.5 px-4 rounded-2xl transition-all flex items-center justify-between gap-3 group active:scale-[0.98]"
                            >
                              <span className="leading-snug">{sq}</span>
                              <ChevronRight className="w-4 h-4 text-[#ff7a55] group-hover:translate-x-1 transition-transform flex-shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}

                      {m.citations && m.citations.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-white/10">
                          <p className="text-[10px] font-bold uppercase tracking-wider opacity-60 mb-2">Sources Referenced</p>
                          <div className="flex flex-wrap gap-2">
                            {m.citations.map((c: string, i: number) => (
                              <span key={i} className="text-[11px] bg-black/20 px-3 py-1.5 rounded-full cursor-default opacity-90 border border-white/5">{c}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="mt-4 pt-3 border-t border-white/10">
                        <AnimatePresence mode="wait">
                          {!m.feedbackSubmitted ? (
                            <motion.div key="rating" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="flex flex-col gap-3">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold uppercase tracking-tighter opacity-70">{getText("rate")}</span>
                                <div className="flex gap-1.5">
                                  {[1, 2, 3, 4, 5].map((s) => (
                                    <button key={s} onClick={() => submitRating(m.id, s)} className={`text-lg transition-all hover:scale-125 active:scale-90 ${m.rating >= s ? 'filter-none' : 'grayscale opacity-30 hover:opacity-100'}`}>⭐</button>
                                  ))}
                                </div>
                              </div>
                              {m.showReasonBox && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="overflow-hidden">
                                  <p className="text-[11px] font-bold text-white mb-2">{getText("feedback_prompt")}</p>
                                  <div className="grid grid-cols-2 gap-2">
                                    {[getText("r1"), getText("r2"), getText("r3"), getText("r4")].map((label, idx) => (
                                      <button key={idx} onClick={() => submitRating(m.id, m.rating, label)} className="text-[11px] bg-white/10 hover:bg-[#ff7a55] py-2.5 px-2 rounded-xl border border-white/10 transition-colors text-center font-bold active:scale-95">{label}</button>
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </motion.div>
                          ) : (
                            <motion.div key="thanks" initial={{scale:0.9, opacity:0}} animate={{scale:1, opacity:1}} className="flex items-center gap-2 py-1 text-[#86eae9]">
                              <CheckCircle2 className="w-4 h-4 text-[#86eae9]" />
                              <span className="text-xs font-bold italic">{getText("feedback_thanks")}</span>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            ))}
            
            {/* TYPING INDICATOR */}
            {isLoading && (
               <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} className="flex justify-start gap-2 sm:gap-3 w-full">
                 <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white border border-black/10 dark:border-white/10 shadow-sm flex items-center justify-center shrink-0 mt-1 overflow-hidden p-1.5">
                    <img 
                      src="/logo.png" 
                      alt="AI" 
                      className="w-full h-full object-contain dark:invert" 
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'; 
                        const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                        if (fallback) fallback.style.display = 'flex'; 
                      }}
                    />
                    <div className="hidden w-full h-full bg-[#3231b1] rounded-full items-center justify-center">
                      <span className="text-[10px] font-bold text-white">AI</span>
                    </div>
                 </div>
                 <div className="bg-white dark:bg-[#3231b1]/20 border border-black/5 dark:border-white/10 rounded-3xl rounded-bl-sm px-5 py-4 flex items-center gap-3 shadow-[0_4px_20px_rgb(0,0,0,0.03)]">
                   <Loader2 className="w-5 h-5 animate-spin text-[#3231b1] dark:text-[#86eae9]" />
                   <motion.span key={loadingStep} initial={{ opacity: 0, y: 2 }} animate={{ opacity: 1, y: 0 }} className="text-sm font-bold text-[#3231b1] dark:text-[#86eae9]">
                     {LOADING_STEPS[loadingStep]}
                   </motion.span>
                 </div>
               </motion.div>
            )}
            <div ref={messagesEndRef} className="h-2" />
          </div>
        )}
      </div>

      {/* Input Bar */}
      <div className="p-4 bg-[#f9f9f9] dark:bg-[#212121] border-t border-black/5 dark:border-white/5 pb-safe shrink-0">
        <div className="max-w-3xl mx-auto relative">
          {!input && !isLoading && (
            <span className="absolute left-6 top-[18px] text-[#212121]/40 dark:text-[#f9f9f9]/40 pointer-events-none text-base hidden sm:block truncate w-2/3">
              {getText("shadow")}
            </span>
          )}
          <div className="relative flex items-center shadow-[0_8px_30px_rgb(0,0,0,0.06)] rounded-full bg-white dark:bg-[#212121] border border-black/5 dark:border-white/10">
            <input 
              value={input} 
              onChange={(e) => setInput(e.target.value)} 
              onKeyDown={(e) => e.key === 'Enter' && handleSend()} 
              disabled={isLoading} 
              placeholder={getText("placeholder")} 
              className="w-full pl-6 pr-14 py-4 bg-transparent rounded-full focus:outline-none text-[#212121] dark:text-[#f9f9f9] placeholder-[#212121]/40 sm:placeholder-transparent text-[15px]" 
            />
            <button 
              onClick={() => handleSend()} 
              disabled={isLoading || !input} 
              className="absolute right-2 p-2.5 bg-[#ff7a55] rounded-full text-white hover:bg-[#e66c4a] active:scale-90 disabled:opacity-40 disabled:active:scale-100 transition-all shadow-sm"
            >
              <Send className="w-5 h-5 ml-0.5" />
            </button>
          </div>
          <p className="text-[10px] text-center text-[#212121]/40 dark:text-[#f9f9f9]/40 mt-3 max-w-xl mx-auto leading-tight font-medium">{getText("disclaimer")}</p>
        </div>
      </div>
    </div>
  );
}
