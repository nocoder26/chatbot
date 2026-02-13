"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Send, ArrowLeft, Loader2, Sparkles, BookOpen, Heart, Activity, Coins, Globe } from "lucide-react";

// --- LOCALIZATION DICTIONARY ---
const TRANSLATIONS: any = {
  en: { greeting: "Good", topics: "Topics you can ask about", placeholder: "Type your question...", disclaimer: "Izana AI does not provide medical diagnosis and can make mistakes, including about people. Check with your healthcare provider always. Chats deleted in 24 hours for privacy.", rate: "Rate this response" },
  es: { greeting: "Hola, Buenos", topics: "Temas para preguntar", placeholder: "Escribe tu pregunta...", disclaimer: "Izana AI no proporciona diagnósticos médicos y puede cometer errores. Consulta siempre a tu médico. Los chats se borran en 24 horas.", rate: "Califica esta respuesta" },
  ja: { greeting: "こんにちは", topics: "質問できるトピック", placeholder: "質問を入力してください...", disclaimer: "Izana AIは医学的診断を提供しません。間違いを犯す可能性があります。常に医療提供者に確認してください。チャットは24時間後に削除されます。", rate: "この回答を評価する" },
  zh: { greeting: "你好", topics: "您可以询问的主题", placeholder: "输入您的问题...", disclaimer: "Izana AI 不提供医疗诊断，可能会出错。请务必咨询您的医疗保健提供者。聊天记录将在 24 小时后删除。", rate: "评价此回复" },
  hi: { greeting: "नमस्ते", topics: "आप इनके बारे में पूछ सकते हैं", placeholder: "अपना प्रश्न लिखें...", disclaimer: "Izana AI चिकित्सा निदान प्रदान नहीं करता है और गलतियाँ कर सकता है। हमेशा अपने चिकित्सक से जाँच करें। गोपनीयता के लिए 24 घंटे में चैट हटा दी जाती है।", rate: "इस उत्तर का मूल्यांकन करें" },
  // Add others similarly (defaults to EN if missing)
};

const TOPICS = [
  { icon: <Activity />, label: "IVF Process" },
  { icon: <BookOpen />, label: "Success Rates" },
  { icon: <Heart />, label: "Emotional Support" },
  { icon: <Sparkles />, label: "Lifestyle & Diet" },
  { icon: <Coins />, label: "Costs & Financial" },
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
  const [timeGreeting, setTimeGreeting] = useState("Morning");
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const t = TRANSLATIONS[langCode] || TRANSLATIONS["en"];

  useEffect(() => {
    const saved = localStorage.getItem("izana_language");
    if (saved) setLangCode(saved);
    
    const hour = new Date().getHours();
    if (hour < 12) setTimeGreeting("Morning");
    else if (hour < 18) setTimeGreeting("Afternoon");
    else setTimeGreeting("Evening");
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
        <select value={langCode} onChange={(e) => { setLangCode(e.target.value); localStorage.setItem("izana_language", e.target.value); }} className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs py-1 px-3 rounded-full outline-none border-none">
          <option value="en">English</option><option value="es">Español</option><option value="ja">日本語</option><option value="zh">普通话</option><option value="hi">हिन्दी</option><option value="ta">தமிழ்</option><option value="bn">বাংলা</option>
        </select>
      </header>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 relative">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center -mt-10">
            <h2 className="text-3xl font-light text-slate-800 dark:text-white mb-8">
              {t.greeting} <span className="font-bold text-teal-600">{timeGreeting}</span>
            </h2>
            
            <p className="text-sm text-slate-400 uppercase tracking-widest font-semibold mb-4">{t.topics}</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full max-w-2xl">
              {TOPICS.map((topic, i) => (
                <button key={i} onClick={() => handleSend(topic.label)} className="flex flex-col items-center gap-2 p-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm hover:shadow-md hover:scale-105 transition-all border border-slate-100 dark:border-slate-700 group">
                  <div className="p-3 bg-teal-50 dark:bg-teal-900/30 text-teal-600 rounded-full group-hover:bg-teal-600 group-hover:text-white transition-colors">
                    {topic.icon}
                  </div>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{topic.label}</span>
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
           {/* Shadow Text / Suggestion */}
           {!input && !isLoading && (
            <span className="absolute left-16 top-4 text-slate-300 dark:text-slate-600 pointer-events-none italic hidden sm:block truncate w-2/3">
              Try asking: "What lifestyle changes improve IVF success?"
            </span>
          )}
          <div className="relative">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} disabled={isLoading} placeholder={t.placeholder} className="w-full pl-6 pr-14 py-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-full focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-inner text-slate-800 dark:text-white placeholder-transparent sm:placeholder-slate-400" />
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
