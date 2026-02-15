"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Send, ArrowLeft, Loader2, ChevronRight, Paperclip } from "lucide-react";
import BloodWorkConfirm from "@/components/BloodWorkConfirm";

// --- CORE ICONS & DATA ---
const TOPIC_ICONS = [
  { label: "IVF", query: "What is IVF?" },
  { label: "Male Fertility", query: "How can men improve fertility?" },
  { label: "IUI", query: "What is IUI?" },
  { label: "Nutrition", query: "Fertility diet tips" },
  { label: "Blood Work", query: "I want to understand my blood work." }, 
  { label: "Success Rates", query: "How to improve IVF success?" },
];

const LOADING_STEPS = ["Understanding your needs...", "Reading medical knowledge...", "Almost there..."];

// --- GEMINI-STYLE SYNCED RENDERING ---
const GeminiFadeText = ({ text, onComplete }: { text: string, onComplete: () => void }) => {
  const paragraphs = text.split('\n\n').filter(p => p.trim() !== '');
  useEffect(() => {
    const totalTime = paragraphs.length * 300 + 400;
    const timer = setTimeout(onComplete, totalTime);
    return () => clearTimeout(timer);
  }, [paragraphs.length, onComplete]);

  return (
    <div className="flex flex-col gap-4">
      {paragraphs.map((p, i) => (
        <motion.p key={i} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: i * 0.3 }} className="leading-relaxed">{p}</motion.p>
      ))}
    </div>
  );
};

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false); 
  const [loadingStep, setLoadingStep] = useState(0);
  const [langCode, setLangCode] = useState("en");
  const [interactionCount, setInteractionCount] = useState(0);
  const [verificationData, setVerificationData] = useState<any>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("izana_language") || "en";
    setLangCode(saved);
    setIsReady(true); // CRITICAL: Only show UI after state is hydrated
  }, []);

  useEffect(() => {
    if (isLoading) {
      const interval = setInterval(() => setLoadingStep(p => (p < 2 ? p + 1 : p)), 1500);
      return () => clearInterval(interval);
    }
  }, [isLoading]);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => { scrollToBottom(); }, [messages, isLoading]);

  const handleSend = async (text = input, isHidden = false) => {
    const query = text || input;
    if (!query.trim() || isLoading) return;

    if (!isHidden) setMessages(p => [...p, { id: Date.now(), type: "user", content: query }]);
    setInput("");
    
    if (query.toLowerCase().includes("blood work")) {
        setMessages(p => [...p, { id: Date.now()+1, type: "bot", content: "Please upload your lab report (PDF) for analysis.", isBloodWorkPrompt: true, isAnimating: false }]);
        return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: query, language: langCode, interaction_count: interactionCount })
      });
      const data = await res.json();
      
      setMessages(p => [...p, { 
        id: Date.now() + 1, type: "bot", 
        content: data.response, 
        suggested_questions: data.suggested_questions || [],
        isAnimating: true 
      }]);
      setInteractionCount(c => c + 1);
    } catch {
      setMessages(p => [...p, { id: Date.now(), type: "bot", content: "Error connecting to AI.", isAnimating: false }]);
    } finally { setIsLoading(false); }
  };

  if (!isReady) return <div className="h-screen w-full flex items-center justify-center bg-[#f9f9f9] dark:bg-[#212121]"><Loader2 className="w-8 h-8 animate-spin text-[#3231b1]" /></div>;

  return (
    <div className="flex flex-col h-screen bg-[#f9f9f9] dark:bg-[#212121] overflow-hidden">
      <header className="flex justify-between items-center px-4 py-3 border-b border-black/5 dark:border-white/5">
        <button onClick={() => messages.length > 0 ? setMessages([]) : router.push("/")} className="p-2 rounded-full hover:bg-black/5"><ArrowLeft className="w-5 h-5"/></button>
        <span className="font-bold text-[#3231b1] dark:text-[#86eae9]">Izana AI</span>
        <div className="w-10"></div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 max-w-3xl mx-auto w-full">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center space-y-8">
            <h2 className="text-3xl font-light text-center">How can <span className="font-bold text-[#3231b1] dark:text-[#86eae9]">Izana</span> help?</h2>
            <div className="grid grid-cols-2 gap-3 w-full">
              {TOPIC_ICONS.map((t, i) => (
                <button key={i} onClick={() => handleSend(t.query, true)} className="p-4 bg-white dark:bg-white/5 rounded-3xl border border-black/5 text-center font-bold hover:shadow-md transition-all">
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex w-full ${m.type === 'user' ? 'justify-end' : 'justify-start gap-3'}`}>
              {m.type === 'bot' && <div className="w-8 h-8 rounded-full bg-white p-1 shrink-0 border border-black/5"><img src="/logo.png" className="dark:invert"/></div>}
              <div className={`max-w-[85%] rounded-3xl p-5 ${m.type === 'user' ? 'bg-white text-black border border-black/5' : 'bg-gradient-to-br from-[#3231b1] to-[#230871] text-white shadow-lg'}`}>
                {m.isAnimating ? (
                  <GeminiFadeText text={m.content} onComplete={() => setMessages(prev => prev.map(msg => msg.id === m.id ? { ...msg, isAnimating: false } : msg))} />
                ) : (
                  <div className="space-y-4">
                    {m.content.split('\n\n').map((p:any, i:number) => <p key={i}>{p}</p>)}
                    {m.suggested_questions?.length > 0 && (
                      <div className="pt-4 border-t border-white/10 space-y-2">
                        {m.suggested_questions.map((q: string, i: number) => (
                          <button key={i} onClick={() => handleSend(q)} className="w-full text-left text-sm bg-white/10 p-3 rounded-xl flex items-center justify-between hover:bg-white/20">
                            {q} <ChevronRight className="w-4 h-4 text-[#ff7a55]" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {m.isBloodWorkPrompt && (
                  <button onClick={() => fileInputRef.current?.click()} className="mt-4 w-full bg-[#ff7a55] text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                    <Paperclip className="w-4 h-4" /> Select PDF
                  </button>
                )}
              </div>
            </div>
          ))
        )}
        {isLoading && <div className="flex gap-3"><Loader2 className="w-5 h-5 animate-spin text-[#3231b1]" /> <span className="text-sm text-[#3231b1] font-bold">{LOADING_STEPS[loadingStep]}</span></div>}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-[#f9f9f9] dark:bg-[#212121] border-t border-black/5">
        <div className="max-w-3xl mx-auto flex items-center bg-white dark:bg-[#2a2a2a] rounded-full px-4 py-2 border border-black/5">
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} placeholder="Ask a question..." className="flex-1 bg-transparent py-2 outline-none text-sm" />
          <button onClick={() => handleSend()} className="p-2 bg-[#ff7a55] rounded-full text-white"><Send className="w-4 h-4" /></button>
        </div>
      </div>
      <input type="file" accept="application/pdf" className="hidden" ref={fileInputRef} onChange={(e) => {/* existing upload logic */}} />
    </div>
  );
}
