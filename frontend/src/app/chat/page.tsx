"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Send, ArrowLeft, Loader2, Sparkles, BookOpen, Heart, Activity, Coins, CheckCircle2, ChevronRight } from "lucide-react";

// --- FULL LOCALIZATION DICTIONARY ---
const TRANSLATIONS: any = {
  en: { 
    morning: "Good Morning", afternoon: "Good Afternoon", evening: "Good Evening",
    topics: "Topics you can ask about", placeholder: "Type your question...", 
    disclaimer: "Izana AI does not provide medical diagnosis. Check with your provider. Chats deleted in 24h.", 
    rate: "Rate this response", feedback_prompt: "What was missing?", feedback_thanks: "Thank you for helping us improve!",
    shadow: "Try asking: \"What lifestyle changes improve IVF success?\"",
    t_ivf: "IVF Process", t_success: "Success Rates", t_emotion: "Support", t_life: "Lifestyle", t_cost: "Costs",
    r1: "Inaccurate", r2: "Vague", r3: "Tone", r4: "Other",
    suggested: "Suggested for you:"
  },
  es: { 
    morning: "Buenos Días", afternoon: "Buenas Tardes", evening: "Buenas Noches",
    topics: "Temas para preguntar", placeholder: "Escribe tu pregunta...", 
    disclaimer: "Izana AI no proporciona diagnósticos médicos. Los chats se borran en 24h.", 
    rate: "Califica esta respuesta", feedback_prompt: "¿Qué faltó?", feedback_thanks: "¡Gracias por ayudarnos a mejorar!",
    shadow: "Prueba: \"¿Qué cambios mejoran el éxito de la FIV?\"",
    t_ivf: "Proceso FIV", t_success: "Éxito", t_emotion: "Apoyo", t_life: "Estilo de vida", t_cost: "Costos",
    r1: "Inexacto", r2: "Vago", r3: "Tono", r4: "Otro",
    suggested: "Sugerido para ti:"
  },
  ja: { 
    morning: "おはようございます", afternoon: "こんにちは", evening: "こんばんは",
    topics: "トピック", placeholder: "質問を入力...", disclaimer: "Izana AIは診断を提供しません。24時間後に削除されます。", 
    rate: "回答を評価する", feedback_prompt: "何が足りませんでしたか？", feedback_thanks: "改善へのご協力ありがとうございます！",
    shadow: "例：「IVFの成功率を上げる方法は？」",
    t_ivf: "プロセス", t_success: "成功率", t_emotion: "サポート", t_life: "生活習慣", t_cost: "費用",
    r1: "不正確", r2: "曖昧", r3: "トーン", r4: "その他",
    suggested: "あなたへの提案:"
  },
  zh: { 
    morning: "早上好", afternoon: "下午好", evening: "晚上好",
    topics: "推荐主题", placeholder: "输入问题...", disclaimer: "Izana AI 不提供医疗诊断。聊天记录24小时后删除。", 
    rate: "评价此回复", feedback_prompt: "哪里不足？", feedback_thanks: "感谢您帮助我们改进！",
    shadow: "试试问：“如何提高试管婴儿成功率？”",
    t_ivf: "流程", t_success: "成功率", t_emotion: "支持", t_life: "生活方式", t_cost: "费用",
    r1: "不准确", r2: "太笼统", r3: "语气不当", r4: "其他",
    suggested: "为您推荐:"
  },
  hi: { 
    morning: "सुप्रभात", afternoon: "नमस्कार", evening: "शुभ संध्या",
    topics: "विषय", placeholder: "प्रश्न लिखें...", disclaimer: "Izana AI निदान प्रदान नहीं करता है। 24 घंटे में चैट हटा दी जाएगी।", 
    rate: "मूल्यांकन करें", feedback_prompt: "क्या कमी थी?", feedback_thanks: "सुधार में मदद करने के लिए धन्यवाद!",
    shadow: "पूछें: \"IVF सफलता दर कैसे बढ़ाएं?\"",
    t_ivf: "प्रक्रिया", t_success: "सफलता दर", t_emotion: "समर्थन", t_life: "जीवनशैली", t_cost: "लागत",
    r1: "गलत जानकारी", r2: "अस्पष्ट", r3: "लहजा", r4: "अन्य",
    suggested: "आपके लिए सुझाव:"
  },
  ta: { morning: "காலை வணக்கம்", afternoon: "மதிய வணக்கம்", evening: "மாலை வணக்கம்", topics: "தலைப்புகள்", placeholder: "கேட்கவும்...", disclaimer: "Izana AI நோயறிதலை வழங்காது.", rate: "மதிப்பிடவும்", feedback_prompt: "என்ன குறை?", feedback_thanks: "மேம்படுத்த உதவியதற்கு நன்றி!", shadow: "கேட்கவும்: \"வெற்றி விகிதத்தை கூட்டுவது எப்படி?\"", t_ivf: "செயல்முறை", t_success: "வெற்றி", t_emotion: "ஆதரவு", t_life: "வாழ்க்கை முறை", t_cost: "செலவு", r1: "தவறானது", r2: "தெளிவில்லை", r3: "தொனி", r4: "மற்றவை", suggested: "பரிந்துரைக்கப்படுகிறது:" },
  te: { morning: "శుభోదయం", afternoon: "శుభ మధ్యాహ్నం", evening: "శుభ సాయంత్రం", topics: "అంశాలు", placeholder: "ప్రశ్న...", disclaimer: "Izana AI రోగనిర్ధారణ అందించదు.", rate: "రేట్ చేయండి", feedback_prompt: "లోపం ఏమిటి?", feedback_thanks: "ధన్యవాదాలు!", shadow: "ప్రయత్నించండి: \"IVF విజయం ఎలా?\"", t_ivf: "ప్రక్రియ", t_success: "విజయం", t_emotion: "మద్దతు", t_life: "జీవనశైలి", t_cost: "ఖర్చులు", r1: "తప్పు", r2: "అస్పష్టం", r3: "ధోరణి", r4: "ఇతర", suggested: "మీకు సూచించబడింది:" },
  ml: { morning: "സുപ്രഭാതം", afternoon: "ഗുഡ് ആഫ്റ്റർനൂൺ", evening: "ശുഭ സായാഹ്നം", topics: "വിഷയങ്ങൾ", placeholder: "ചോദിക്കൂ...", disclaimer: "Izana AI രോഗനിർണയം നൽകുന്നില്ല.", rate: "വിലയിരുത്തുക", feedback_prompt: "എന്താണ് കുറവ്?", feedback_thanks: "നന്ദി!", shadow: "ചോദിക്കുക: \"വിജയസാധ്യത എങ്ങനെ കൂട്ടാം?\"", t_ivf: "പ്രക്രിയ", t_success: "വിജയം", t_emotion: "പിന്തുണ", t_life: "ജീവിതശൈലി", t_cost: "ചെലവ്", r1: "തെറ്റായ വിവരം", r2: "അവ്യക്തം", r3: "രീതി", r4: "മറ്റുള്ളവ", suggested: "നിങ്ങൾക്കായി നിർദ്ദേശിക്കുന്നത്:" },
  bn: { morning: "সুপ্রভাত", afternoon: "শুভ দুপুর", evening: "শুভ সন্ধ্যা", topics: "বিষয়", placeholder: "লিখুন...", disclaimer: "Izana AI চিকিৎসা পরামর্শ দেয় না।", rate: "রেটিং দিন", feedback_prompt: "কি কম ছিল?", feedback_thanks: "ধন্যবাদ!", shadow: "জিজ্ঞাসা করুন: \"সাফল্যের হার কত?\"", t_ivf: "প্রক্রিয়া", t_success: "সাফল্য", t_emotion: "সমর্থন", t_life: "জীবনধারা", t_cost: "খরচ", r1: "ভুল তথ্য", r2: "অস্পষ্ট", r3: "সুর", r4: "অন্যান্য", suggested: "আপনার জন্য প্রস্তাবিত:" }
};

const TOPIC_ICONS = [
  { icon: <Activity className="w-5 h-5" />, key: "t_ivf" },
  { icon: <BookOpen className="w-5 h-5" />, key: "t_success" },
  { icon: <Heart className="w-5 h-5" />, key: "t_emotion" },
  { icon: <Sparkles className="w-5 h-5" />, key: "t_life" },
  { icon: <Coins className="w-5 h-5" />, key: "t_cost" },
];

const LOADING_STEPS = ["Understanding your needs...", "Reading medical knowledge...", "Writing a caring response...", "Almost there..."];

// Turns **Subheadings** into beautiful bold text dynamically
const formatText = (text: string) => {
  return text.split('**').map((part, i) => 
    i % 2 === 1 ? <strong key={i} className="font-bold tracking-wide text-white drop-shadow-sm">{part}</strong> : part
  );
};

// --- FLUID TYPING ANIMATION COMPONENT ---
const TypewriterText = ({ text, onComplete, onTick }: { text: string, onComplete: () => void, onTick: () => void }) => {
  const [displayed, setDisplayed] = useState("");
  const onCompleteRef = useRef(onComplete);
  const onTickRef = useRef(onTick);
  
  useEffect(() => {
    onCompleteRef.current = onComplete;
    onTickRef.current = onTick;
  }, [onComplete, onTick]);

  useEffect(() => {
    let i = 0;
    setDisplayed("");
    
    // Renders 4 characters every 15ms for a fast, incredibly smooth reading pace
    const timer = setInterval(() => {
      i += 4; 
      if (i >= text.length) {
        setDisplayed(text);
        clearInterval(timer);
        onCompleteRef.current();
        setTimeout(() => onTickRef.current(), 50); // One final scroll tick
      } else {
        setDisplayed(text.slice(0, i));
        onTickRef.current(); // Triggers the auto-scroll
      }
    }, 15); 
    
    return () => clearInterval(timer);
  }, [text]);

  return <>{formatText(displayed)}</>;
};

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [langCode, setLangCode] = useState("en");
  const [timeOfDay, setTimeOfDay] = useState<"morning" | "afternoon" | "evening">("morning");
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const t = TRANSLATIONS[langCode] || TRANSLATIONS["en"];

  useEffect(() => {
    const saved = localStorage.getItem("izana_language");
    if (saved && TRANSLATIONS[saved]) setLangCode(saved);
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

  // Smooth scroll logic for instant drops (like user message)
  const scrollToBottomSmooth = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Instant scroll logic for rapid ticking (during typing animation)
  const scrollToBottomInstant = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "auto", block: "end" });
    }
  }, []);

  useEffect(() => {
    if (isLoading || messages.length > 0) {
      scrollToBottomSmooth();
    }
  }, [isLoading, messages.length]); // Only smooth scroll on new messages or loading state

  const handleSend = async (text = input) => {
    if (!text.trim() || isLoading) return;
    const userMsg = { id: Date.now(), type: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, language: langCode })
      });
      const data = await res.json();
      setMessages(prev => [...prev, { 
        id: Date.now() + 1, 
        type: "bot", 
        content: data.response, 
        citations: data.citations, 
        suggested_questions: data.suggested_questions || [],
        questionOriginal: text, 
        rating: 0, 
        feedbackSubmitted: false, 
        showReasonBox: false,
        isAnimating: true // Triggers the Typewriter effect
      }]);
    } catch {
      setMessages(prev => [...prev, { id: Date.now(), type: "bot", content: "Connection error. Please try again.", isAnimating: false }]);
    } finally { setIsLoading(false); }
  };

  const markAnimationComplete = (id: number) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, isAnimating: false } : m));
    setTimeout(scrollToBottomSmooth, 100); // Smoothly scroll to reveal buttons that fade in
  };

  const submitRating = async (msgId: number, rating: number, reason: string = "") => {
    const msg = messages.find(m => m.id === msgId);
    if (!msg) return;

    const isInstantSubmit = rating >= 4 || reason !== "";

    setMessages(prev => prev.map(m => 
      m.id === msgId ? { 
        ...m, rating, feedbackSubmitted: isInstantSubmit, showReasonBox: rating < 4 && reason === "" 
      } : m
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
    <div className="flex flex-col h-screen bg-[#FDFBF7] dark:bg-slate-900 font-sans antialiased overflow-hidden">
      
      {/* Header */}
      <header className="flex justify-between items-center px-4 py-3 bg-[#FDFBF7]/80 backdrop-blur-md dark:bg-slate-900/80 z-10 sticky top-0 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="p-2 rounded-full hover:bg-black/5
