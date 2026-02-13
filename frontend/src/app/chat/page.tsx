"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Send, ArrowLeft, Loader2, Sparkles, BookOpen, Heart, Activity, Coins } from "lucide-react";

// --- FULL LOCALIZATION DICTIONARY ---
const TRANSLATIONS: any = {
  en: { 
    morning: "Good Morning", afternoon: "Good Afternoon", evening: "Good Evening",
    topics: "Topics you can ask about", 
    placeholder: "Type your question...", 
    disclaimer: "Izana AI does not provide medical diagnosis and can make mistakes. Check with your healthcare provider always. Chats deleted in 24 hours for privacy.", 
    rate: "Rate this response",
    shadow: "Try asking: \"What lifestyle changes improve IVF success?\"",
    t_ivf: "IVF Process", t_success: "Success Rates", t_emotion: "Emotional Support", t_life: "Lifestyle & Diet", t_cost: "Costs & Financial"
  },
  es: { 
    morning: "Buenos Días", afternoon: "Buenas Tardes", evening: "Buenas Noches",
    topics: "Temas para preguntar", 
    placeholder: "Escribe tu pregunta...", 
    disclaimer: "Izana AI no proporciona diagnósticos médicos y puede cometer errores. Consulta siempre a tu médico. Los chats se borran en 24 horas.", 
    rate: "Califica esta respuesta",
    shadow: "Prueba preguntar: \"¿Qué cambios mejoran el éxito de la FIV?\"",
    t_ivf: "Proceso de FIV", t_success: "Tasas de Éxito", t_emotion: "Apoyo Emocional", t_life: "Estilo de Vida", t_cost: "Costos y Finanzas"
  },
  ja: { 
    morning: "おはようございます", afternoon: "こんにちは", evening: "こんばんは",
    topics: "質問できるトピック", 
    placeholder: "質問を入力してください...", 
    disclaimer: "Izana AIは診断を提供しません。常に医師に確認してください。チャットは24時間後に削除されます。", 
    rate: "評価する",
    shadow: "試してみる：「IVFの成功率を上げる方法は？」",
    t_ivf: "IVFのプロセス", t_success: "成功率", t_emotion: "感情的サポート", t_life: "生活習慣と食事", t_cost: "費用と財務"
  },
  zh: { 
    morning: "早上好", afternoon: "下午好", evening: "晚上好",
    topics: "您可以询问的主题", 
    placeholder: "输入您的问题...", 
    disclaimer: "Izana AI 不提供医疗诊断。请务必咨询医生。聊天记录将在 24 小时后删除。", 
    rate: "评价此回复",
    shadow: "试着问：“哪些生活方式能提高试管婴儿成功率？”",
    t_ivf: "试管婴儿流程", t_success: "成功率", t_emotion: "情感支持", t_life: "生活方式与饮食", t_cost: "费用与财务"
  },
  hi: { 
    morning: "सुप्रभात", afternoon: "नमस्कार", evening: "शुभ संध्या",
    topics: "आप इनके बारे में पूछ सकते हैं", 
    placeholder: "अपना प्रश्न लिखें...", 
    disclaimer: "Izana AI चिकित्सा निदान प्रदान नहीं करता है। हमेशा डॉक्टर से सलाह लें। 24 घंटे में चैट हटा दी जाती है।", 
    rate: "मूल्यांकन करें",
    shadow: "पूछें: \"आईवीएफ सफलता दर कैसे बढ़ाएं?\"",
    t_ivf: "आईवीएफ प्रक्रिया", t_success: "सफलता दर", t_emotion: "भावनात्मक समर्थन", t_life: "जीवनशैली और आहार", t_cost: "लागत और वित्तीय"
  },
  ta: {
    morning: "காலை வணக்கம்", afternoon: "மதிய வணக்கம்", evening: "மாலை வணக்கம்",
    topics: "நீங்கள் கேட்கக்கூடிய தலைப்புகள்",
    placeholder: "உங்கள் கேள்வியைத் தட்டச்சு செய்க...",
    disclaimer: "Izana AI மருத்துவ நோயறிதலை வழங்காது. எப்போதும் மருத்துவரை அணுகவும்.",
    rate: "மதிப்பிடவும்",
    shadow: "கேட்கவும்: \"IVF வெற்றி விகிதங்களை எவ்வாறு மேம்படுத்துவது?\"",
    t_ivf: "IVF செயல்முறை", t_success: "வெற்றி விகிதங்கள்", t_emotion: "உணர்ச்சி ஆதரவு", t_life: "வாழ்க்கை முறை", t_cost: "செலவுகள்"
  },
  te: {
    morning: "శుభోదయం", afternoon: "శుభ మధ్యాహ్నం", evening: "శుభ సాయంత్రం",
    topics: "మీరు అడగగలిగే అంశాలు",
    placeholder: "మీ ప్రశ్నను టైప్ చేయండి...",
    disclaimer: "Izana AI వైద్య నిర్ధారణను అందించదు. ఎల్లప్పుడూ వైద్యుడిని సంప్రదించండి.",
    rate: "రేట్ చేయండి",
    shadow: "ప్రయత్నించండి: \"IVF విజయాన్ని ఎలా మెరుగుపరచాలి?\"",
    t_ivf: "IVF ప్రక్రియ", t_success: "విజయ రేట్లు", t_emotion: "భావోద్వేగ మద్దతు", t_life: "జీవనశైలి", t_cost: "ఖర్చులు"
  },
  ml: {
    morning: "സുപ്രഭാതം", afternoon: "ഗുഡ് ആഫ്റ്റർനൂൺ", evening: "ശുഭ സായാഹ്നം",
    topics: "നിങ്ങൾക്ക് ചോദിക്കാവുന്ന വിഷയങ്ങൾ",
    placeholder: "നിങ്ങളുടെ ചോദ്യം ടൈപ്പ് ചെയ്യുക...",
    disclaimer: "Izana AI ചികിത്സാ രോഗനിർണയം നൽകുന്നില്ല. എപ്പോഴും ഡോക്ടറോട് ചോദിക്കുക.",
    rate: "വിലയിരുത്തുക",
    shadow: "ചോദിക്കുക: \"IVF വിജയസാധ്യത എങ്ങനെ കൂട്ടാം?\"",
    t_ivf: "IVF പ്രക്രിയ", t_success: "വിജയ നിരക്കുകൾ", t_emotion: "മാനസിക പിന്തുണ", t_life: "ജീവിതശൈലി", t_cost: "ചെലവുകൾ"
  },
  bn: {
    morning: "সুপ্রভাত", afternoon: "শুভ দুপুর", evening: "শুভ সন্ধ্যা",
    topics: "যে বিষয়গুলো নিয়ে আপনি জানতে পারেন",
    placeholder: "আপনার প্রশ্ন লিখুন...",
    disclaimer: "Izana AI চিকিৎসা পরামর্শ দেয় না। সর্বদা ডাক্তারের সাথে পরামর্শ করুন।",
    rate: "রেটিং দিন",
    shadow: "জিজ্ঞাসা করুন: \"কিভাবে আইভিএফ সাফল্যের হার বাড়ানো যায়?\"",
    t_ivf: "আইভিএফ প্রক্রিয়া", t_success: "সাফল্যের হার", t_emotion: "মানসিক সমর্থন", t_life: "জীবনধারা ও ডায়েট", t_cost: "খরচ এবং অর্থ"
  }
};

const TOPIC_ICONS = [
  { icon: <Activity />, key: "t_ivf" },
  { icon: <BookOpen />, key: "t_success" },
  { icon: <Heart />, key: "t_emotion" },
  { icon: <Sparkles />, key: "t_life" },
  { icon: <Coins />, key: "t_cost" },
];

const LOADING_STEPS = ["Analysing your question...", "Cross referencing knowledge base...", "Refining your response...", "Almost there..."];

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [langCode, setLangCode] = useState("en");
  const [ratingModal, setRatingModal] = useState<any>(null);
  const [timeOfDay, setTimeOfDay] = useState<"morning" | "afternoon" | "evening">("morning");
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Dynamic Translation Object
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
        id: Date.now() + 1, type: "bot", content: data.response, citations: data.citations, questionOriginal: text 
      }]);
    } catch {
      setMessages(prev => [...prev, { id: Date.now(), type: "bot", content: "Connection error. Please try again." }]);
    } finally { setIsLoading(false); }
  };

  const submitFeedback = async (rating: number, reason: string = "") => {
    if (!ratingModal) return;
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/feedback`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: ratingModal.questionOriginal, answer: ratingModal.content, rating, reason })
      });
      setRatingModal(null);
    } catch (e) { console.error(e); }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-900 font-sans">
      {/* Header */}
      <header className="flex justify-between items-center px-4 py-3 bg-white shadow-sm dark:bg-slate-800 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-300" />
          </button>
          <span className="font-bold text-teal-700 text-lg tracking-tight">Izana AI</span>
        </div>
        <select 
          value={langCode} 
          onChange={(e) => { setLangCode(e.target.value); localStorage.setItem("izana_language", e.target.value); }} 
          className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs py-1 px-3 rounded-full outline-none border-none"
        >
          <option value="en">English</option>
          <option value="es">Español</option>
          <option value="ja">日本語</option>
          <option value="zh">普通话</option>
          <option value="hi">हिन्दी</option>
          <option value="ta">தமிழ்</option>
          <option value="te">తెలుగు</option>
          <option value="ml">മലയാളം</option>
          <option value="bn">বাংলা</option>
        </select>
      </header>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 relative">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center -mt-10">
            {/* Dynamic Greeting */}
            <h2 className="text-3xl font-light text-slate-800 dark:text-white mb-8 text-center">
              <span className="font-bold text-teal-600">{t[timeOfDay]}</span>
            </h2>
            
            <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-4 text-center">{t.topics}</p>
            
            {/* Dynamic Topics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full max-w-2xl px-4">
              {TOPIC_ICONS.map((topic, i) => (
                <button 
                  key={i} 
                  onClick={() => handleSend(t[topic.key])} 
                  className="flex flex-col items-center gap-2 p-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm hover:shadow-md hover:scale-105 transition-all border border-slate-100 dark:border-slate-700 group"
                >
                  <div className="p-3 bg-teal-50 dark:bg-teal-900/30 text-teal-600 rounded-full group-hover:bg-teal-600 group-hover:text-white transition-colors">
                    {topic.icon}
                  </div>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 text-center">
                    {t[topic.key]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6 max-w-3xl mx-auto pb-8">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] rounded-2xl p-5 ${m.type === 'user' ? 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white rounded-br-none' : 'bg-teal-600 text-white shadow-lg rounded-bl-none'}`}>
                  <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                  
                  {/* Citations */}
                  {m.citations && m.citations.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-white/20">
                      <p className="text-[10px] font-bold uppercase tracking-wider opacity-80 mb-2">Citations</p>
                      <div className="flex flex-wrap gap-2">
                        {m.citations.map((c: string, i: number) => (
                          <span key={i} className="text-[10px] bg-black/20 px-2 py-1 rounded hover:bg-black/30 transition-colors cursor-default">{c}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Rating */}
                  {m.type === 'bot' && (
                    <div className="mt-4 flex items-center gap-2 justify-end opacity-90">
                      <span className="text-xs font-medium">{t.rate}:</span>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <button key={s} onClick={() => s < 3 ? setRatingModal({...m, tempRating: s}) : submitFeedback(s)} className="hover:scale-125 transition-transform">⭐</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {/* Loading Steps */}
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

      {/* Input Area */}
      <div className="p-4 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700 relative">
        <div className="max-w-3xl mx-auto relative">
           {/* Dynamic Shadow Text */}
           {!input && !isLoading && (
            <span className="absolute left-16 top-4 text-slate-300 dark:text-slate-600 pointer-events-none italic hidden sm:block truncate w-2/3">
              {t.shadow}
            </span>
          )}
          <div className="relative">
            <input 
              value={input} 
              onChange={(e) => setInput(e.target.value)} 
              onKeyDown={(e) => e.key === 'Enter' && handleSend()} 
              disabled={isLoading} 
              placeholder={t.placeholder} 
              className="w-full pl-6 pr-14 py-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-full focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-inner text-slate-800 dark:text-white placeholder-transparent sm:placeholder-slate-400" 
            />
            <button onClick={() => handleSend()} disabled={isLoading || !input} className="absolute right-2 top-2 p-2 bg-teal-600 rounded-full text-white hover:bg-teal-700 disabled:opacity-50 transition-all shadow-md">
              <Send className="w-5 h-5" />
            </button>
          </div>
          <p className="text-[10px] text-center text-slate-400 mt-3 max-w-xl mx-auto leading-tight opacity-70">
            {t.disclaimer}
          </p>
        </div>
      </div>

      {/* Feedback Modal */}
      <AnimatePresence>
        {ratingModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 dark:border-slate-700">
              <h3 className="font-bold text-slate-800 dark:text-white mb-2 text-lg">Help us improve</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">What was missing in this response?</p>
              <div className="space-y-2 mb-4">
                {["Inaccurate Information", "Too Vague / Generic", "Tone was not right", "Other"].map(r => (
                  <button key={r} onClick={() => submitFeedback(ratingModal.tempRating, r)} className="w-full text-left px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-700 hover:bg-teal-50 dark:hover:bg-teal-900/30 text-sm text-slate-700 dark:text-slate-200 hover:text-teal-700 dark:hover:text-teal-400 transition-colors font-medium border border-transparent hover:border-teal-200">
                    {r}
                  </button>
                ))}
              </div>
              <button onClick={() => setRatingModal(null)} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 w-full text-center py-2">Skip Feedback</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
