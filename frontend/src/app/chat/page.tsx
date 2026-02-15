"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Send, ArrowLeft, Loader2, Sparkles, BookOpen, Heart, Activity, CheckCircle2, ChevronRight, TestTube, Paperclip } from "lucide-react";
import BloodWorkConfirm from "@/components/BloodWorkConfirm";

// ... [TRANSLATIONS & TOPIC_ICONS remain the same] ...
const LOADING_STEPS = ["Understanding your needs...", "Reading medical knowledge...", "Almost there..."];

const cleanCitation = (raw: any) => {
  try {
    let cleaned = String(raw || "").replace(/\\/g, '/').split('/').pop() || String(raw);
    cleaned = cleaned.replace(/\.pdf$/i, '').replace(/(_compress|-compress|_final_version|_\d_\d|nbsped|factsheet)/gi, '').replace(/\d{8,}/g, '').replace(/[-_]/g, ' ');
    return cleaned.trim().replace(/\b\w/g, c => c.toUpperCase());
  } catch { return "Medical Document"; }
};

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
  const [loadingStep, setLoadingStep] = useState(0);
  const [langCode, setLangCode] = useState("en");
  const [interactionCount, setInteractionCount] = useState(0);
  const [verificationData, setVerificationData] = useState<any>(null);
  const [selectedTreatment, setSelectedTreatment] = useState("Not sure");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("izana_language") || "en";
    setLangCode(saved);
  }, []);

  useEffect(() => {
    if (isLoading) {
      const interval = setInterval(() => setLoadingStep(p => (p < 2 ? p + 1 : p)), 1500);
      return () => clearInterval(interval);
    }
    setLoadingStep(0);
  }, [isLoading]);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => { scrollToBottom(); }, [messages, isLoading]);

  const handleSend = async (text = input, isHiddenQuery = false) => {
    const queryText = text || input;
    if (!queryText.trim() || isLoading) return;

    if (!isHiddenQuery) setMessages(p => [...p, { id: Date.now(), type: "user", content: queryText }]);
    setInput("");
    
    // INTERCEPT LOCAL UI
    if (queryText.includes("understand my blood work")) {
        setMessages(p => [...p, { id: Date.now()+1, type: "bot", content: "I can analyze your blood work. Please upload your PDF below.", isBloodWorkPrompt: true, isAnimating: false }]);
        return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: queryText, language: langCode, interaction_count: interactionCount })
      });
      const data = await res.json();
      
      setMessages(p => [...p, { 
        id: Date.now() + 1, type: "bot", 
        content: data.response || "I'm sorry, I couldn't generate a response.", 
        citations: (data.citations || []).map(cleanCitation),
        suggested_questions: data.suggested_questions || [],
        isAnimating: true 
      }]);
      setInteractionCount(prev => prev + 1);
    } catch {
      setMessages(p => [...p, { id: Date.now(), type: "bot", content: "Connection error.", isAnimating: false }]);
    } finally { setIsLoading(false); }
  };

  const onFinalConfirm = async (confirmedData: any) => {
    setVerificationData(null);
    setIsLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Analyze labs", clinical_data: confirmedData, treatment: selectedTreatment, interaction_count: interactionCount })
      });
      const data = await res.json();
      setMessages(p => [...p, { 
        id: Date.now() + 1, type: "bot", 
        content: data.response, 
        suggested_questions: data.suggested_questions || [], 
        citations: (data.citations || []).map(cleanCitation),
        isAnimating: true 
      }]);
      setInteractionCount(prev => prev + 1);
    } catch {
      setMessages(p => [...p, { id: Date.now(), type: "bot", content: "Analysis failed.", isAnimating: false }]);
    } finally { setIsLoading(false); }
  };

  // ... [handleFileUpload remains similar but ensure interactionCount is handled] ...

  return (
    <div className="flex flex-col h-screen bg-[#f9f9f9] dark:bg-[#212121] overflow-hidden">
      {/* Verification Overlay */}
      <AnimatePresence>
        {verificationData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
             <BloodWorkConfirm initialData={verificationData} onConfirm={onFinalConfirm} onCancel={() => setVerificationData(null)} />
          </div>
        )}
      </AnimatePresence>

      {/* Header & Main Chat (standard logic) */}
      <div id="chat-scroll-container" className="flex-1 overflow-y-auto p-4 chat-container pb-10">
        {messages.length === 0 && !isLoading ? (
            <div className="h-full flex flex-col items-center justify-center">
                {/* Topic grid logic */}
            </div>
        ) : (
          <div className="space-y-6 max-w-3xl mx-auto">
            {messages.map((m) => (
              <div key={m.id} className={`flex w-full ${m.type === 'user' ? 'justify-end' : 'justify-start gap-3'}`}>
                {m.type === 'bot' && <div className="w-9 h-9 rounded-full bg-white p-1.5 shrink-0"><img src="/logo.png" className="dark:invert"/></div>}
                <div className={`max-w-[85%] rounded-3xl p-5 ${m.type === 'user' ? 'bg-white text-black' : 'bg-gradient-to-br from-[#3231b1] to-[#230871] text-white'}`}>
                  {m.isAnimating ? (
                    <GeminiFadeText text={m.content} onComplete={() => setMessages(prev => prev.map(msg => msg.id === m.id ? { ...msg, isAnimating: false } : msg))} />
                  ) : (
                    <div className="flex flex-col gap-4">
                      {m.content.split('\n\n').map((p:string, i:number) => <p key={i}>{p}</p>)}
                      {m.suggested_questions?.length > 0 && (
                        <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4">
                          <p className="text-[11px] font-bold text-[#86eae9] uppercase tracking-wider">Suggested:</p>
                          {m.suggested_questions.map((sq: string, i: number) => (
                            <button key={i} onClick={() => handleSend(sq)} className="text-left text-sm bg-white/10 hover:bg-white/20 p-3 rounded-xl flex items-center justify-between group">
                              <span>{sq}</span>
                              <ChevronRight className="w-4 h-4 text-[#ff7a55] group-hover:translate-x-1 transition-transform" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
               <div className="flex justify-start gap-3">
                 <div className="w-9 h-9 rounded-full bg-white p-1.5"><img src="/logo.png" className="dark:invert animate-pulse"/></div>
                 <div className="bg-white px-5 py-4 rounded-3xl flex items-center gap-3">
                   <Loader2 className="w-5 h-5 animate-spin text-[#3231b1]" />
                   <span className="text-sm font-bold text-[#3231b1]">{LOADING_STEPS[loadingStep]}</span>
                 </div>
               </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
      {/* Input Bar (standard Send logic) */}
    </div>
  );
}
