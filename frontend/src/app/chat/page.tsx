"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Send, ArrowLeft, Loader2, Sparkles, BookOpen, Heart, Activity, CheckCircle2, ChevronRight, TestTube, Paperclip } from "lucide-react";
import BloodWorkConfirm from "@/components/BloodWorkConfirm";

// --- LOCALIZATION DICTIONARY ---
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
    bw_intro: "I can analyze your blood work and provide insights. Please select your treatment path and upload your lab report (PDF) below.",
    suggested: "Continue exploring:"
  }
  // ... other languages omitted for brevity but remain in your logic
};

const TOPIC_ICONS = [
  { icon: <Activity className="w-5 h-5" />, labelKey: "t_ivf", queryKey: "t_ivf_q" },
  { icon: <Heart className="w-5 h-5" />, labelKey: "t_male", queryKey: "t_male_q" },
  { icon: <Sparkles className="w-5 h-5" />, labelKey: "t_iui", queryKey: "t_iui_q" },
  { icon: <BookOpen className="w-5 h-5" />, labelKey: "t_nutrition", queryKey: "t_nutrition_q" },
  { icon: <TestTube className="w-5 h-5" />, labelKey: "t_bloodwork", queryKey: "t_bloodwork_q" }, 
  { icon: <CheckCircle2 className="w-5 h-5" />, labelKey: "t_success", queryKey: "t_success_q" },
];

const LOADING_STEPS = ["Understanding your needs...", "Reading medical knowledge...", "Almost there..."];

const cleanCitation = (raw: any) => {
  try {
    let cleaned = String(raw || "").replace(/\\/g, '/').split('/').pop() || String(raw);
    cleaned = cleaned.replace(/\.pdf$/i, '').replace(/(_compress|-compress|_final_version|_\d_\d|nbsped|factsheet)/gi, '').replace(/\d{8,}/g, '').replace(/[-_]/g, ' ');
    return cleaned.trim().replace(/\b\w/g, c => c.toUpperCase());
  } catch { return "Medical Document"; }
};

// --- SYNCED GEMINI FADE ---
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
        <motion.p 
          key={i} 
          initial={{ opacity: 0, y: 5 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.5, delay: i * 0.3 }} 
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
  const [isReady, setIsReady] = useState(false); // FIXED: Prevents Black Screen
  const [loadingStep, setLoadingStep] = useState(0);
  const [langCode, setLangCode] = useState("en");
  const [interactionCount, setInteractionCount] = useState(0);
  const [verificationData, setVerificationData] = useState<any>(null);
  const [selectedTreatment, setSelectedTreatment] = useState("Not sure");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getText = (key: string) => {
    const langDict = TRANSLATIONS[langCode] || TRANSLATIONS["en"];
    return langDict[key] || TRANSLATIONS["en"][key] || key;
  };

  useEffect(() => {
    const saved = localStorage.getItem("izana_language") || "en";
    setLangCode(saved);
    setIsReady(true); // FIXED: Sync Complete
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

    if (!isHiddenQuery)
