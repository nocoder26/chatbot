"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Send, ArrowLeft, Loader2, Globe } from "lucide-react";

// --- SUGGESTED CATEGORIES ---
const SUGGESTIONS = [
  "What is the IVF process?",
  "Does freezing eggs hurt?",
  "Diet tips for fertility?",
  "Side effects of hormones?"
];

// --- LOADING STEPS ---
const LOADING_STEPS = [
  "Analysing your question...",
  "Cross referencing knowledge base...",
  "Refining your response...",
  "Almost there..."
];

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [language, setLanguage] = useState("en");
  
  // Feedback State
  const [ratingModal, setRatingModal] = useState<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isLoading) {
      const interval = setInterval(() => {
        setLoadingStep((prev) => (prev < 3 ? prev + 1 : prev));
      }, 1500); // Change text every 1.5s
      return () => clearInterval(interval);
    }
    setLoadingStep(0);
  }, [isLoading]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loadingStep]);

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
        body: JSON.stringify({ message: text, language })
      });
      const data = await res.json();
      
      const botMsg = { 
        id: Date.now() + 1, 
        type: "bot", 
        content: data.response, 
        citations: data.citations || [],
        questionOriginal: text // Save for feedback context
      };
      setMessages(prev => [...prev, botMsg]);
    } catch (e) {
      setMessages(prev => [...prev, { id: Date.now(), type: "bot", content: "I'm having trouble connecting. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const submitFeedback = async (rating: number, reason: string = "") => {
    if (!ratingModal) return;
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: ratingModal.questionOriginal,
          answer: ratingModal.content,
          rating,
          reason
        })
      });
      setRatingModal(null); // Close modal
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-900">
      
      {/* HEADER */}
      <header className="flex justify-between items-center px-4 py-3 bg-white shadow-sm dark:bg-slate-800">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="p-2 rounded-full hover:bg-slate-100">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h1 className="font-bold text-teal-700">Fertility Assistant</h1>
        </div>
        
        {/* Language Picker */}
        <div className="flex items-center gap-2 bg-slate-100 px-3 py-1 rounded-full">
          <Globe className="w-4 h-4 text-slate-500" />
          <select 
            value={language} 
            onChange={(e) => setLanguage(e.target.value)}
            className="bg-transparent text-sm text-slate-700 outline-none"
          >
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="hi">Hindi</option>
            <option value="fr">French</option>
          </select>
        </div>
      </header>

      {/* CHAT AREA */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.length === 0 && (
          <div className="mt-8">
            <p className="text-center text-slate-400 mb-4">Here are some topics you can ask about:</p>
            <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto">
              {SUGGESTIONS.map((s, i) => (
                <button 
                  key={i} 
                  onClick={() => handleSend(s)}
                  className="p-3 text-sm bg-white border border-teal-100 rounded-xl text-teal-700 hover:bg-teal-50 transition-colors shadow-sm text-left"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.type === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl p-4 ${m.type === 'user' ? 'bg-slate-200 text-slate-800' : 'bg-teal-600 text-white shadow-md'}`}>
              <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
              
              {/* CITATIONS SUBTITLE */}
              {m.citations && m.citations.length > 0 && (
                <div className="mt-4 pt-3 border-t border-white/20">
                  <p className="text-xs font-bold uppercase tracking-wider opacity-70 mb-2">Citations</p>
                  <div className="flex flex-wrap gap-2">
                    {m.citations.map((c: string, i: number) => (
                      <span key={i} className="text-xs bg-black/20 px-2 py-1 rounded">{c}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* RATING UI */}
              {m.type === 'bot' && (
                <div className="mt-3 flex gap-1 justify-end opacity-80 hover:opacity-100 transition-opacity">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button 
                      key={star} 
                      onClick={() => star < 3 ? setRatingModal({...m, tempRating: star}) : submitFeedback(star)}
                      className="hover:scale-110 transition-transform"
                    >
                      ⭐
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* LOADING ANIMATION */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl p-4 flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
              <motion.span 
                key={loadingStep}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm font-medium text-teal-800"
              >
                {LOADING_STEPS[loadingStep]}
              </motion.span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT AREA */}
      <div className="p-4 bg-white border-t border-slate-200 relative">
        <div className="max-w-3xl mx-auto relative">
          {/* SHADOW TEXT */}
          {!input && !isLoading && (
            <span className="absolute left-5 top-4 text-slate-300 pointer-events-none italic truncate">
              Try asking: "What are the success rates for IVF over 40?"
            </span>
          )}
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={isLoading}
            className="w-full pl-5 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-full focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-inner"
          />
          <button 
            onClick={() => handleSend()}
            disabled={isLoading || !input}
            className="absolute right-2 top-2 p-2 bg-teal-600 rounded-full text-white hover:bg-teal-700 disabled:opacity-50 transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* LOW RATING MODAL */}
      <AnimatePresence>
        {ratingModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          >
            <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-2xl">
              <h3 className="font-bold text-slate-800 mb-2">We're sorry the answer wasn't helpful.</h3>
              <p className="text-sm text-slate-500 mb-4">Please tell us why so we can improve:</p>
              <div className="space-y-2 mb-4">
                {["Inaccurate info", "Too vague", "Not empathetic enough", "Other"].map(reason => (
                  <button 
                    key={reason}
                    onClick={() => submitFeedback(ratingModal.tempRating, reason)}
                    className="w-full text-left px-4 py-2 rounded-lg bg-slate-50 hover:bg-teal-50 text-sm text-slate-700 hover:text-teal-700 transition-colors"
                  >
                    {reason}
                  </button>
                ))}
              </div>
              <button onClick={() => setRatingModal(null)} className="text-xs text-slate-400 hover:text-slate-600 w-full text-center">Cancel</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
