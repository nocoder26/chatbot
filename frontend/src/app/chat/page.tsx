"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Send, ArrowLeft, Loader2, Sparkles, BookOpen, Heart, Activity, CheckCircle2, ChevronRight, Moon } from "lucide-react";

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
    t_sleep: "Sleep & Fertility", t_sleep_q: "How does sleep affect fertility treatment success?",
    t_success: "Improving Success", t_success_q: "What are 10 things you can do right now to improve fertility treatment success rates?",
    r1: "Inaccurate", r2: "Vague", r3: "Tone", r4: "Other",
    suggested: "Suggested for you:"
  }
};

// Map pre-loaded topics to translation keys
const TOPIC_ICONS = [
  { icon: <Activity className="w-5 h-5" />, labelKey: "t_ivf", queryKey: "t_ivf_q" },
  { icon: <Heart className="w-5 h-5" />, labelKey: "t_male", queryKey: "t_male_q" },
  { icon: <Sparkles className="w-5 h-5" />, labelKey: "t_iui", queryKey: "t_iui_q" },
  { icon: <BookOpen className="w-5 h-5" />, labelKey: "t_nutrition", queryKey: "t_nutrition_q" },
  { icon: <Moon className="w-5 h-5" />, labelKey: "t_sleep", queryKey: "t_sleep_q" },
  { icon: <CheckCircle2 className="w-5 h-5" />, labelKey: "t_success", queryKey: "t_success_q" },
];

const LOADING_STEPS = ["Understanding your needs...", "Reading medical knowledge...", "Writing a caring response...", "Almost there..."];

// --- ADVANCED FORMATTERS ---
// Strips ugly file paths perfectly
const cleanCitation = (raw: string) => {
  let cleaned = raw.replace(/\\/g, '/').split('/').pop() || raw;
  cleaned = cleaned.replace(/\.pdf$/i, '');
  cleaned = cleaned.replace(/(_compress|-compress|_final_version|_\d_\d|nbsped|factsheet)/gi, '');
  cleaned = cleaned.replace(/\d{8,}/g, '');
  cleaned = cleaned.replace(/[-_]/g, ' ');
  return cleaned.trim().replace(/\b\w/g, c => c.toUpperCase());
};

// Strips asterisks safely and creates bold tags instantly during the typewriter stream
const formatText = (text: string) => {
  const cleaned = text.replace(/—/g, '-').replace(/(?<!\*)\*(?!\*)/g, '•'); 
  const parts = cleaned.split('**');
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return <strong key={i} className="block mt-5 mb-1 text-[16px] sm:text-[17px] font-extrabold tracking-wide text-teal-950 dark:text-teal-100 drop-shadow-sm">{part}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
};

// --- FLUID TYPING ANIMATION COMPONENT ---
const TypewriterText = ({ text, onComplete, onTick }: { text: string, onComplete: () => void, onTick: () => void }) => {
  const [displayedLength, setDisplayedLength] = useState(0);
  
  useEffect(() => {
    let currentLen = 0;
    const timer = setInterval(() => {
      currentLen += 3; // Fast, fluid typing speed
      setDisplayedLength(currentLen);
      onTick();
      if (currentLen >= text.length) {
        clearInterval(timer);
        onComplete();
      }
    }, 15); 
    
    return () => clearInterval(timer);
  }, [text, onComplete, onTick]);

  return <>{formatText(text.substring(0, displayedLength))}</>;
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
  // Fallback to English if translation is missing
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

  const scrollToBottomSmooth = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  const scrollToBottomInstant = useCallback(() => messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" }), []);

  useEffect(() => {
    if (isLoading || messages.length > 0) scrollToBottomSmooth();
  }, [isLoading, messages.length]);

  // NEW: handleSend now accepts an "isHiddenQuery" flag for pre-loaded buttons
  const handleSend = async (text = input, isHiddenQuery = false) => {
    if (!text.trim() || isLoading) return;
    
    if (!isHiddenQuery) {
      setMessages(prev => [...prev, { id: Date.now(), type: "user", content: text }]);
    }
    
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
        citations: data.citations.map((c: string) => cleanCitation(c)), // Cleaned instantly
        suggested_questions: data.suggested_questions || [],
        questionOriginal: text, 
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
    <div className="flex flex-col h-screen bg-[#FDFBF7] dark:bg-slate-900 font-sans antialiased overflow-hidden">
      
      {/* Header */}
      <header className="flex justify-between items-center px-4 py-3 bg-[#FDFBF7]/80 backdrop-blur-md dark:bg-slate-900/80 z-10 sticky top-0 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-300" />
          </button>
          <span className="font-bold text-teal-800 dark:text-teal-400 text-lg tracking-tight">Izana AI</span>
        </div>
        <select value={langCode} onChange={(e) => { setLangCode(e.target.value); localStorage.setItem("izana_language", e.target.value); }} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm text-slate-700 dark:text-slate-200 text-xs py-1.5 px-3 rounded-full outline-none appearance-none">
          <option value="en">English</option><option value="es">Español</option><option value="ja">日本語</option><option value="zh">普通话</option><option value="hi">हिन्दी</option><option value="ta">தமிழ்</option><option value="te">తెలుగు</option><option value="ml">മലയാളം</option><option value="bn">বাংলা</option>
        </select>
      </header>

      {/* Main Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 relative chat-container pb-10">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center -mt-4">
            <motion.h2 initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} className="text-3xl font-light text-slate-800 dark:text-white mb-8 text-center">
              <span className="font-bold text-teal-700">{t[timeOfDay]}</span>
            </motion.h2>
            <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-6 text-center">{t.topics}</p>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full max-w-2xl px-2">
              {TOPIC_ICONS.map((topic, i) => (
                <button key={i} onClick={() => handleSend(t[topic.queryKey], true)} className="flex flex-col items-center gap-3 p-4 bg-white dark:bg-slate-800 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] active:scale-95 transition-all border border-slate-100 dark:border-slate-700 group">
                  <div className="p-3 bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 rounded-full group-hover:bg-teal-600 group-hover:text-white transition-colors">{topic.icon}</div>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 text-center">{t[topic.labelKey]}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6 max-w-3xl mx-auto">
            {messages.map((m) => (
              <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} key={m.id} className={`flex ${m.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                
                <div className={`max-w-[92%] sm:max-w-[85%] rounded-3xl p-5 shadow-[0_4px_20px_rgb(0,0,0,0.03)] ${m.type === 'user' ? 'bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-800 dark:text-white rounded-br-sm' : 'bg-gradient-to-br from-teal-600 to-emerald-600 text-white rounded-bl-sm'}`}>
                  
                  <div className="whitespace-pre-wrap leading-relaxed text-[15px] sm:text-base">
                    {m.isAnimating ? (
                      <TypewriterText text={m.content} onComplete={() => markAnimationComplete(m.id)} onTick={scrollToBottomInstant} />
                    ) : (
                      formatText(m.content)
                    )}
                  </div>
                  
                  {!m.isAnimating && (
                    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                      {m.suggested_questions && m.suggested_questions.length > 0 && (
                        <div className="mt-5 flex flex-col gap-2 border-t border-white/10 pt-4">
                          <p className="text-[11px] font-medium text-emerald-100 uppercase tracking-wider pl-1">{t.suggested}</p>
                          {m.suggested_questions.map((sq: string, i: number) => (
                            <button 
                              key={i}
                              onClick={() => handleSend(sq)}
                              className="text-left text-sm bg-black/10 hover:bg-black/20 text-white py-2.5 px-4 rounded-2xl transition-all flex items-center justify-between gap-3 group active:scale-[0.98]"
                            >
                              <span className="leading-snug">{sq}</span>
                              <ChevronRight className="w-4 h-4 text-emerald-200 group-hover:translate-x-1 transition-transform flex-shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}

                      {m.citations && m.citations.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-white/10">
                          <p className="text-[10px] font-bold uppercase tracking-wider opacity-70 mb-2">Sources Referenced</p>
                          <div className="flex flex-wrap gap-2">
                            {m.citations.map((c: string, i: number) => (
                              <span key={i} className="text-[11px] bg-black/10 px-3 py-1.5 rounded-full cursor-default opacity-90 border border-white/5">{c}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {m.type === 'bot' && (
                        <div className="mt-4 pt-3 border-t border-white/10">
                          <AnimatePresence mode="wait">
                            {!m.feedbackSubmitted ? (
                              <motion.div key="rating" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="flex flex-col gap-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-medium uppercase tracking-tighter opacity-80">{t.rate}</span>
                                  <div className="flex gap-1.5">
                                    {[1, 2, 3, 4, 5].map((s) => (
                                      <button key={s} onClick={() => submitRating(m.id, s)} className={`text-lg transition-all hover:scale-125 active:scale-90 ${m.rating >= s ? 'filter-none' : 'grayscale opacity-30 hover:opacity-100'}`}>⭐</button>
                                    ))}
                                  </div>
                                </div>
                                {m.showReasonBox && (
                                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="overflow-hidden">
                                    <p className="text-[11px] font-bold text-teal-50 mb-2">{t.feedback_prompt}</p>
                                    <div className="grid grid-cols-2 gap-2">
                                      {[t.r1, t.r2, t.r3, t.r4].map((label, idx) => (
                                        <button key={idx} onClick={() => submitRating(m.id, m.rating, label)} className="text-[11px] bg-white/10 hover:bg-white/20 py-2.5 px-2 rounded-xl border border-white/10 transition-colors text-center active:scale-95">{label}</button>
                                      ))}
                                    </div>
                                  </motion.div>
                                )}
                              </motion.div>
                            ) : (
                              <motion.div key="thanks" initial={{scale:0.9, opacity:0}} animate={{scale:1, opacity:1}} className="flex items-center gap-2 py-1 text-emerald-100">
                                <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                                <span className="text-xs font-medium italic">{t.feedback_thanks}</span>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}
                    </motion.div>
                  )}
                </div>
              </motion.div>
            ))}
            
            {isLoading && (
               <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} className="flex justify-start">
                 <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-3xl rounded-bl-sm px-5 py-4 flex items-center gap-3 shadow-[0_4px_20px_rgb(0,0,0,0.03)]">
                   <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
                   <motion.span key={loadingStep} initial={{ opacity: 0, y: 2 }} animate={{ opacity: 1, y: 0 }} className="text-sm font-medium text-slate-600 dark:text-slate-300">
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
      <div className="p-4 bg-[#FDFBF7] dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 pb-safe shrink-0">
        <div className="max-w-3xl mx-auto relative">
          {!input && !isLoading && (
            <span className="absolute left-6 top-[18px] text-slate-400 dark:text-slate-500 pointer-events-none text-base hidden sm:block truncate w-2/3">
              {t.shadow}
            </span>
          )}
          <div className="relative flex items-center shadow-[0_8px_30px_rgb(0,0,0,0.06)] rounded-full bg-white dark:bg-slate-800">
            <input 
              value={input} 
              onChange={(e) => setInput(e.target.value)} 
              onKeyDown={(e) => e.key === 'Enter' && handleSend()} 
              disabled={isLoading} 
              placeholder={t.placeholder} 
              className="w-full pl-6 pr-14 py-4 bg-transparent rounded-full focus:outline-none text-slate-800 dark:text-white placeholder-slate-400 sm:placeholder-transparent text-[15px]" 
            />
            <button 
              onClick={() => handleSend()} 
              disabled={isLoading || !input} 
              className="absolute right-2 p-2.5 bg-teal-600 rounded-full text-white hover:bg-teal-700 active:scale-90 disabled:opacity-40 disabled:active:scale-100 transition-all"
            >
              <Send className="w-5 h-5 ml-0.5" />
            </button>
          </div>
          <p className="text-[10px] text-center text-slate-400 mt-3 max-w-xl mx-auto leading-tight opacity-70">{t.disclaimer}</p>
        </div>
      </div>
    </div>
  );
}
