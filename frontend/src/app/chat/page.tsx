"use client";

import { useState, useEffect, useRef } from "react";
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
      const interval = setInterval(() => setLoadingStep(p => (p < 3 ? p + 1 : p)), 1800);
      return () => clearInterval(interval);
    }
    setLoadingStep(0);
  }, [isLoading]);

  useEffect(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), [messages, loadingStep]);

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
        suggested_questions: data.suggested_questions || [], // NEW: Capture questions
        questionOriginal: text, 
        rating: 0, 
        feedbackSubmitted: false, 
        showReasonBox: false
      }]);
    } catch {
      setMessages(prev => [...prev, { id: Date.now(), type: "bot", content: "Connection error. Please try again." }]);
    } finally { setIsLoading(false); }
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
    // NEW: Softer, warmer background color (#FDFBF7) for a calming caregiver vibe
    <div className="flex flex-col h-screen bg-[#FDFBF7] dark:bg-slate-900 font-sans antialiased">
      
      {/* Header */}
      <header className="flex justify-between items-center px-4 py-3 bg-[#FDFBF7]/80 backdrop-blur-md dark:bg-slate-900/80 z-10 sticky top-0">
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

      {/* Main Chat/Greeting Area */}
      <div className="flex-1 overflow-y-auto p-4 relative chat-container pb-6">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center -mt-10">
            <motion.h2 initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} className="text-3xl font-light text-slate-800 dark:text-white mb-8 text-center">
              <span className="font-bold text-teal-700">{t[timeOfDay]}</span>
            </motion.h2>
            <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-6 text-center">{t.topics}</p>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full max-w-2xl px-2">
              {TOPIC_ICONS.map((topic, i) => (
                <button key={i} onClick={() => handleSend(t[topic.key])} className="flex flex-col items-center gap-3 p-4 bg-white dark:bg-slate-800 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] active:scale-95 transition-all border border-slate-100 dark:border-slate-700 group">
                  <div className="p-3 bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 rounded-full group-hover:bg-teal-600 group-hover:text-white transition-colors">{topic.icon}</div>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 text-center">{t[topic.key]}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6 max-w-3xl mx-auto">
            {messages.map((m) => (
              <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} key={m.id} className={`flex ${m.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                
                {/* NEW: Softer, rounder message bubbles */}
                <div className={`max-w-[92%] sm:max-w-[85%] rounded-3xl p-5 shadow-[0_4px_20px_rgb(0,0,0,0.03)] ${m.type === 'user' ? 'bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-800 dark:text-white rounded-br-sm' : 'bg-gradient-to-br from-teal-600 to-emerald-600 text-white rounded-bl-sm'}`}>
                  
                  <div className="whitespace-pre-wrap leading-relaxed text-[15px] sm:text-base">{m.content}</div>
                  
                  {/* NEW: 3 Clickable Leading Questions */}
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

                  {/* Citations section */}
                  {m.citations && m.citations.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-white/10">
                      <p className="text-[10px] font-bold uppercase tracking-wider opacity-70 mb-2">Citations</p>
                      <div className="flex flex-wrap gap-2">
                        {m.citations.map((c: string, i: number) => (
                          <span key={i} className="text-[10px] bg-black/10 px-2.5 py-1 rounded-full cursor-default opacity-90">{c}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Rating UI */}
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
                </div>
              </motion.div>
            ))}
            
            {/* Loading Indicator */}
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
            <div ref={messagesEndRef} className="h-4" />
          </div>
        )}
      </div>

      {/* Input Bar */}
      <div className="p-4 bg-[#FDFBF7] dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 pb-safe">
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
