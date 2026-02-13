"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Send, ArrowLeft, Loader2, Sparkles, BookOpen, Heart, Activity, Coins, CheckCircle2 } from "lucide-react";

// --- FULL LOCALIZATION DICTIONARY ---
const TRANSLATIONS: any = {
  en: { 
    morning: "Good Morning", afternoon: "Good Afternoon", evening: "Good Evening",
    topics: "Topics you can ask about", placeholder: "Type your question...", 
    disclaimer: "Izana AI does not provide medical diagnosis. Check with your provider. Chats deleted in 24h.", 
    rate: "Rate this response", feedback_prompt: "What was missing?", feedback_thanks: "Thank you for helping us improve!",
    shadow: "Try asking: \"What lifestyle changes improve IVF success?\"",
    t_ivf: "IVF Process", t_success: "Success Rates", t_emotion: "Support", t_life: "Lifestyle", t_cost: "Costs",
    r1: "Inaccurate", r2: "Vague", r3: "Tone", r4: "Other"
  },
  es: { 
    morning: "Buenos Días", afternoon: "Buenas Tardes", evening: "Buenas Noches",
    topics: "Temas para preguntar", placeholder: "Escribe tu pregunta...", 
    disclaimer: "Izana AI no proporciona diagnósticos médicos. Los chats se borran en 24h.", 
    rate: "Califica esta respuesta", feedback_prompt: "¿Qué faltó?", feedback_thanks: "¡Gracias por ayudarnos a mejorar!",
    shadow: "Prueba: \"¿Qué cambios mejoran el éxito de la FIV?\"",
    t_ivf: "Proceso FIV", t_success: "Éxito", t_emotion: "Apoyo", t_life: "Estilo de vida", t_cost: "Costos",
    r1: "Inexacto", r2: "Vago", r3: "Tono", r4: "Otro"
  },
  ja: { 
    morning: "おはようございます", afternoon: "こんにちは", evening: "こんばんは",
    topics: "トピック", placeholder: "質問を入力...", disclaimer: "Izana AIは診断を提供しません。24時間後に削除されます。", 
    rate: "回答を評価する", feedback_prompt: "何が足りませんでしたか？", feedback_thanks: "改善へのご協力ありがとうございます！",
    shadow: "例：「IVFの成功率を上げる方法は？」",
    t_ivf: "プロセス", t_success: "成功率", t_emotion: "サポート", t_life: "生活習慣", t_cost: "費用",
    r1: "不正確", r2: "曖昧", r3: "トーン", r4: "その他"
  },
  zh: { 
    morning: "早上好", afternoon: "下午好", evening: "晚上好",
    topics: "推荐主题", placeholder: "输入问题...", disclaimer: "Izana AI 不提供医疗诊断。聊天记录24小时后删除。", 
    rate: "评价此回复", feedback_prompt: "哪里不足？", feedback_thanks: "感谢您帮助我们改进！",
    shadow: "试试问：“如何提高试管婴儿成功率？”",
    t_ivf: "流程", t_success: "成功率", t_emotion: "支持", t_life: "生活方式", t_cost: "费用",
    r1: "不准确", r2: "太笼统", r3: "语气不当", r4: "其他"
  },
  hi: { 
    morning: "सुप्रभात", afternoon: "नमस्कार", evening: "शुभ संध्या",
    topics: "विषय", placeholder: "प्रश्न लिखें...", disclaimer: "Izana AI निदान प्रदान नहीं करता है। 24 घंटे में चैट हटा दी जाएगी।", 
    rate: "मूल्यांकन करें", feedback_prompt: "क्या कमी थी?", feedback_thanks: "सुधार में मदद करने के लिए धन्यवाद!",
    shadow: "पूछें: \"IVF सफलता दर कैसे बढ़ाएं?\"",
    t_ivf: "प्रक्रिया", t_success: "सफलता दर", t_emotion: "समर्थन", t_life: "जीवनशैली", t_cost: "लागत",
    r1: "गलत जानकारी", r2: "अस्पष्ट", r3: "लहजा", r4: "अन्य"
  },
  ta: { morning: "காலை வணக்கம்", afternoon: "மதிய வணக்கம்", evening: "மாலை வணக்கம்", topics: "தலைப்புகள்", placeholder: "கேட்கவும்...", disclaimer: "Izana AI நோயறிதலை வழங்காது.", rate: "மதிப்பிடவும்", feedback_prompt: "என்ன குறை?", feedback_thanks: "மேம்படுத்த உதவியதற்கு நன்றி!", shadow: "கேட்கவும்: \"வெற்றி விகிதத்தை கூட்டுவது எப்படி?\"", t_ivf: "செயல்முறை", t_success: "வெற்றி", t_emotion: "ஆதரவு", t_life: "வாழ்க்கை முறை", t_cost: "செலவு", r1: "தவறானது", r2: "தெளிவில்லை", r3: "தொனி", r4: "மற்றவை" },
  te: { morning: "శుభోదయం", afternoon: "శుభ మధ్యాహ్నం", evening: "శుభ సాయంత్రం", topics: "అంశాలు", placeholder: "ప్రశ్న...", disclaimer: "Izana AI రోగనిర్ధారణ అందించదు.", rate: "రేట్ చేయండి", feedback_prompt: "లోపం ఏమిటి?", feedback_thanks: "ధన్యవాదాలు!", shadow: "ప్రయత్నించండి: \"IVF విజయం ఎలా?\"", t_ivf: "ప్రక్రియ", t_success: "విజయం", t_emotion: "మద్దతు", t_life: "జీవనశైలి", t_cost: "ఖర్చులు", r1: "తప్పు", r2: "అస్పష్టం", r3: "ధోరణి", r4: "ఇతర" },
  ml: { morning: "സുപ്രഭാതം", afternoon: "ഗുഡ് ആഫ്റ്റർനൂൺ", evening: "ശുഭ സായാഹ്നം", topics: "വിഷയങ്ങൾ", placeholder: "ചോദിക്കൂ...", disclaimer: "Izana AI രോഗനിർണയം നൽകുന്നില്ല.", rate: "വിലയിരുത്തുക", feedback_prompt: "എന്താണ് കുറവ്?", feedback_thanks: "നന്ദി!", shadow: "ചോദിക്കുക: \"വിജയസാധ്യത എങ്ങനെ കൂട്ടാം?\"", t_ivf: "പ്രക്രിയ", t_success: "വിജയം", t_emotion: "പിന്തുണ", t_life: "ജീവിതശൈലി", t_cost: "ചെലവ്", r1: "തെറ്റായ വിവരം", r2: "അവ്യക്തം", r3: "രീതി", r4: "മറ്റുള്ളവ" },
  bn: { morning: "সুপ্রভাত", afternoon: "শুভ দুপুর", evening: "শুভ সন্ধ্যা", topics: "বিষয়", placeholder: "লিখুন...", disclaimer: "Izana AI চিকিৎসা পরামর্শ দেয় না।", rate: "রেটিং দিন", feedback_prompt: "কি কম ছিল?", feedback_thanks: "ধন্যবাদ!", shadow: "জিজ্ঞাসা করুন: \"সাফল্যের হার কত?\"", t_ivf: "প্রক্রিয়া", t_success: "সাফল্য", t_emotion: "সমর্থন", t_life: "জীবনধারা", t_cost: "খরচ", r1: "ভুল তথ্য", r2: "অস্পষ্ট", r3: "সুর", r4: "অন্যান্য" }
};

const TOPIC_ICONS = [
  { icon: <Activity className="w-5 h-5" />, key: "t_ivf" },
  { icon: <BookOpen className="w-5 h-5" />, key: "t_success" },
  { icon: <Heart className="w-5 h-5" />, key: "t_emotion" },
  { icon: <Sparkles className="w-5 h-5" />, key: "t_life" },
  { icon: <Coins className="w-5 h-5" />, key: "t_cost" },
];

const LOADING_STEPS = ["Analysing your question...", "Cross referencing knowledge base...", "Refining your response...", "Almost there..."];

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
      const interval = setInterval(() => setLoadingStep(p => (p < 3 ? p + 1 : p)), 1500);
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
        id: Date.now() + 1, type: "bot", content: data.response, citations: data.citations, questionOriginal: text, rating: 0, feedbackSubmitted: false, showReasonBox: false
      }]);
    } catch {
      setMessages(prev => [...prev, { id: Date.now(), type: "bot", content: "Connection error. Please try again." }]);
    } finally { setIsLoading(false); }
  };

  const submitRating = async (msgId: number, rating: number, reason: string = "") => {
    const msg = messages.find(m => m.id === msgId);
    if (!msg) return;

    // Logic: 4-5 stars submit immediately. 1-3 stars show reason box first.
    const isInstantSubmit = rating >= 4 || reason !== "";

    setMessages(prev => prev.map(m => 
      m.id === msgId ? { 
        ...m, 
        rating, 
        feedbackSubmitted: isInstantSubmit, 
        showReasonBox: rating < 4 && reason === "" 
      } : m
    ));

    if (isInstantSubmit) {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/feedback`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: msg.questionOriginal, answer: msg.content, rating, reason })
        });
      } catch (e) { console.error(e); }
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-900 font-sans">
      {/* Header */}
      <header className="flex justify-between items-center px-4 py-3 bg-white shadow-sm dark:bg-slate-800 z-10 border-b border-slate-100 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-300" />
          </button>
          <span className="font-bold text-teal-700 dark:text-teal-400 text-lg tracking-tight">Izana AI</span>
        </div>
        <select value={langCode} onChange={(e) => { setLangCode(e.target.value); localStorage.setItem("izana_language", e.target.value); }} className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs py-1 px-3 rounded-full outline-none">
          <option value="en">English</option><option value="es">Español</option><option value="ja">日本語</option><option value="zh">普通话</option><option value="hi">हिन्दी</option><option value="ta">தமிழ்</option><option value="te">తెలుగు</option><option value="ml">മലയാളം</option><option value="bn">বাংলা</option>
        </select>
      </header>

      {/* Main Chat/Greeting Area */}
      <div className="flex-1 overflow-y-auto p-4 relative chat-container">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center -mt-10">
            <motion.h2 initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} className="text-3xl font-light text-slate-800 dark:text-white mb-8 text-center"><span className="font-bold text-teal-600">{t[timeOfDay]}</span></motion.h2>
            <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-6 text-center">{t.topics}</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full max-w-2xl px-4">
              {TOPIC_ICONS.map((topic, i) => (
                <button key={i} onClick={() => handleSend(t[topic.key])} className="flex flex-col items-center gap-3 p-5 bg-white dark:bg-slate-800 rounded-2xl shadow-sm hover:shadow-md hover:scale-105 transition-all border border-slate-100 dark:border-slate-700 group">
                  <div className="p-3 bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 rounded-full group-hover:bg-teal-600 group-hover:text-white transition-colors">{topic.icon}</div>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 text-center">{t[topic.key]}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6 max-w-3xl mx-auto pb-8">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[95%] rounded-2xl p-5 ${m.type === 'user' ? 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white rounded-br-none' : 'bg-teal-600 text-white shadow-lg rounded-bl-none'}`}>
                  <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                  
                  {/* Citations section */}
                  {m.citations && m.citations.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-white/20">
                      <p className="text-[10px] font-bold uppercase tracking-wider opacity-80 mb-2">Citations</p>
                      <div className="flex flex-wrap gap-2">
                        {m.citations.map((c: string, i: number) => (
                          <span key={i} className="text-[10px] bg-black/20 px-2 py-1 rounded cursor-default">{c}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Redesigned Rating UI */}
                  {m.type === 'bot' && (
                    <div className="mt-4 pt-2 border-t border-white/10">
                      <AnimatePresence mode="wait">
                        {!m.feedbackSubmitted ? (
                          <motion.div key="rating" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="flex flex-col gap-3">
                            {/* Star Selector Row */}
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-medium uppercase tracking-tighter opacity-80">{t.rate}</span>
                              <div className="flex gap-1.5">
                                {[1, 2, 3, 4, 5].map((s) => (
                                  <button 
                                    key={s} 
                                    onClick={() => submitRating(m.id, s)} 
                                    className={`text-lg transition-all hover:scale-125 ${m.rating >= s ? 'filter-none' : 'grayscale opacity-30 hover:opacity-100'}`}
                                  >
                                    ⭐
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Inline Reason Buttons - Only shows for low ratings */}
                            {m.showReasonBox && (
                              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="overflow-hidden">
                                <p className="text-[11px] font-bold text-teal-50 mb-2">{t.feedback_prompt}</p>
                                <div className="grid grid-cols-2 gap-2">
                                  {[t.r1, t.r2, t.r3, t.r4].map((label, idx) => (
                                    <button 
                                      key={idx} 
                                      onClick={() => submitRating(m.id, m.rating, label)}
                                      className="text-[10px] bg-white/10 hover:bg-white/20 py-2 px-2 rounded-xl border border-white/10 transition-colors text-center"
                                    >
                                      {label}
                                    </button>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </motion.div>
                        ) : (
                          <motion.div key="thanks" initial={{scale:0.9, opacity:0}} animate={{scale:1, opacity:1}} className="flex items-center gap-2 py-1 text-teal-100">
                            <CheckCircle2 className="w-4 h-4 text-teal-200" />
                            <span className="text-xs font-medium italic">{t.feedback_thanks}</span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {/* Loading Indicator */}
            {isLoading && (
               <div className="flex justify-start">
                 <div className="bg-white dark:bg-slate-800 border border-teal-100 dark:border-slate-700 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
                   <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
                   <motion.span key={loadingStep} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="text-sm font-medium text-teal-800 dark:text-teal-400">
                     {LOADING_STEPS[loadingStep]}
                   </motion.span>
                 </div>
               </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Bar */}
      <div className="p-4 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700 relative">
        <div className="max-w-3xl mx-auto relative">
          {!input && !isLoading && (
            <span className="absolute left-16 top-4 text-slate-300 dark:text-slate-600 pointer-events-none italic hidden sm:block truncate w-2/3">
              {t.shadow}
            </span>
          )}
          <div className="relative">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} disabled={isLoading} placeholder={t.placeholder} className="w-full pl-6 pr-14 py-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-full focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-inner text-slate-800 dark:text-white placeholder-transparent sm:placeholder-slate-400" />
            <button onClick={() => handleSend()} disabled={isLoading || !input} className="absolute right-2 top-2 p-2 bg-teal-600 rounded-full text-white hover:bg-teal-700 disabled:opacity-50 transition-all shadow-md"><Send className="w-5 h-5" /></button>
          </div>
          <p className="text-[10px] text-center text-slate-400 mt-3 max-w-xl mx-auto leading-tight opacity-70 italic">{t.disclaimer}</p>
        </div>
      </div>
    </div>
  );
}
