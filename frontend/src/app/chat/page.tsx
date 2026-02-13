"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Send, ArrowLeft, Loader2, Sparkles, BookOpen, Heart, Activity, Coins, CheckCircle } from "lucide-react";

// --- LOCALIZATION DICTIONARY ---
const TRANSLATIONS: any = {
  en: { morning: "Good Morning", afternoon: "Good Afternoon", evening: "Good Evening", topics: "Topics you can ask about", placeholder: "Type your question...", disclaimer: "Izana AI does not provide medical diagnosis and can make mistakes. Check with your healthcare provider always. Chats deleted in 24 hours for privacy.", rate: "Rate this response", shadow: "Try asking: \"What lifestyle changes improve IVF success?\"", t_ivf: "IVF Process", t_success: "Success Rates", t_emotion: "Emotional Support", t_life: "Lifestyle & Diet", t_cost: "Costs & Financial", feedback_thanks: "Thank you for your feedback!", feedback_prompt: "Help us improve. What was missing?" },
  es: { morning: "Buenos Días", afternoon: "Buenas Tardes", evening: "Buenas Noches", topics: "Temas para preguntar", placeholder: "Escribe tu pregunta...", disclaimer: "Izana AI no proporciona diagnósticos médicos y puede cometer errores. Consulta siempre a tu médico. Los chats se borran en 24 horas.", rate: "Califica esta respuesta", shadow: "Prueba preguntar: \"¿Qué cambios mejoran el éxito de la FIV?\"", t_ivf: "Proceso de FIV", t_success: "Tasas de Éxito", t_emotion: "Apoyo Emocional", t_life: "Estilo de Vida", t_cost: "Costos y Finanzas", feedback_thanks: "¡Gracias por tus comentarios!", feedback_prompt: "Ayúdanos a mejorar. ¿Qué faltó?" },
  ja: { morning: "おはようございます", afternoon: "こんにちは", evening: "こんばんは", topics: "質問できるトピック", placeholder: "質問を入力してください...", disclaimer: "Izana AIは診断を提供しません。常に医師に確認してください。チャットは24時間後に削除されます。", rate: "評価する", shadow: "試してみる：「IVFの成功率を上げる方法は？」", t_ivf: "IVFのプロセス", t_success: "成功率", t_emotion: "感情的サポート", t_life: "生活習慣と食事", t_cost: "費用と財務", feedback_thanks: "フィードバックありがとうございます！", feedback_prompt: "改善にご協力ください。何が足りませんでしたか？" },
  zh: { morning: "早上好", afternoon: "下午好", evening: "晚上好", topics: "您可以询问的主题", placeholder: "输入您的问题...", disclaimer: "Izana AI 不提供医疗诊断。请务必咨询医生。聊天记录将在 24 小时后删除。", rate: "评价此回复", shadow: "试着问：“哪些生活方式能提高试管婴儿成功率？”", t_ivf: "试管婴儿流程", t_success: "成功率", t_emotion: "情感支持", t_life: "生活方式与饮食", t_cost: "费用与财务", feedback_thanks: "感谢您的反馈！", feedback_prompt: "帮助我们改进。缺少了什么？" },
  hi: { morning: "सुप्रभात", afternoon: "नमस्कार", evening: "शुभ संध्या", topics: "आप इनके बारे में पूछ सकते हैं", placeholder: "अपना प्रश्न लिखें...", disclaimer: "Izana AI चिकित्सा निदान प्रदान नहीं करता है। हमेशा डॉक्टर से सलाह लें। 24 घंटे में चैट हटा दी जाती है।", rate: "मूल्यांकन करें", shadow: "पूछें: \"आईवीएफ सफलता दर कैसे बढ़ाएं?\"", t_ivf: "आईवीएफ प्रक्रिया", t_success: "सफलता दर", t_emotion: "भावनात्मक समर्थन", t_life: "जीवनशैली और आहार", t_cost: "लागत और वित्तीय", feedback_thanks: "आपकी प्रतिक्रिया के लिए धन्यवाद!", feedback_prompt: "सुधार में मदद करें। क्या कमी थी?" },
  ta: { morning: "காலை வணக்கம்", afternoon: "மதிய வணக்கம்", evening: "மாலை வணக்கம்", topics: "நீங்கள் கேட்கக்கூடிய தலைப்புகள்", placeholder: "உங்கள் கேள்வியைத் தட்டச்சு செய்க...", disclaimer: "Izana AI மருத்துவ நோயறிதலை வழங்காது. எப்போதும் மருத்துவரை அணுகவும்.", rate: "மதிப்பிடவும்", shadow: "கேட்கவும்: \"IVF வெற்றி விகிதங்களை எவ்வாறு மேம்படுவது?\"", t_ivf: "IVF செயல்முறை", t_success: "வெற்றி விகிதங்கள்", t_emotion: "உணர்ச்சி ஆதரவு", t_life: "வாழ்க்கை முறை", t_cost: "செலவுகள்", feedback_thanks: "உங்கள் கருத்துக்கு நன்றி!", feedback_prompt: "மேம்படுத்த உதவுங்கள். என்ன குறைந்தது?" },
  te: { morning: "శుభోదయం", afternoon: "శుభ మధ్యాహ్னம்", evening: "శుభ సాయంత్రం", topics: "మీరు అడగగలిగే అంశాలు", placeholder: "మీ ప్రశ్నను టైప్ చేయండి...", disclaimer: "Izana AI వైద్య నిర్ధారణను అందించదు. ఎల్లప్పుడూ వైద్యుడిని సంప్రదించండి.", rate: "రేట్ చేయండి", shadow: "ప్రయత్నించండి: \"IVF విజయాన్ని ఎలా మెరుగుపరచాలి?\"", t_ivf: "IVF ప్రక్రియ", t_success: "విజయ రేట్లు", t_emotion: "భావోద్వేగ మద్దతు", t_life: "జీవనశైలి", t_cost: "ఖర్చులు", feedback_thanks: "మీ అభిప్రాయానికి ధన్యవాదాలు!", feedback_prompt: "మెరుగుపరచడంలో సహాయపడండి. ఏమి లేదు?" },
  ml: { morning: "സുപ്രഭാതം", afternoon: "ഗുഡ് ആഫ്റ്റർനൂൺ", evening: "ശുഭ സായാഹ്നം", topics: "നിങ്ങൾക്ക് ചോദിക്കാവുന്ന വിഷയങ്ങൾ", placeholder: "നിങ്ങളുടെ ചോദ്യം ടൈപ്പ് ചെയ്യുക...", disclaimer: "Izana AI ചികിത്സാ രോഗനിർണയം നൽകുന്നില്ല. എപ്പോഴും ഡോക്ടറോട് ചോദിക്കുക.", rate: "വിലയിരുത്തുക", shadow: "ചോദിക്കുക: \"IVF വിജയസാധ്യത എങ്ങനെ കൂട്ടാം?\"", t_ivf: "IVF പ്രക്രിയ", t_success: "വിജയ നിരക്കുകൾ", t_emotion: "മാനസിക പിന്തുണ", t_life: "ജീവിതശൈലി", t_cost: "ചെലവുകൾ", feedback_thanks: "നിങ്ങളുടെ അഭിപ്രായത്തിന് നന്ദി!", feedback_prompt: "മെച്ചപ്പെടുത്താൻ സഹായിക്കുക. എന്താണ് കുറവുള്ളത്?" },
  bn: { morning: "সুপ্রভাত", afternoon: "শুভ দুপুর", evening: "শুভ সন্ধ্যা", topics: "যে বিষয়গুলো নিয়ে আপনি জানতে পারেন", placeholder: "আপনার প্রশ্ন লিখুন...", disclaimer: "Izana AI চিকিৎসা পরামর্শ দেয় না। সর্বদা ডাক্তারের সাথে পরামর্শ করুন।", rate: "রেটিং দিন", shadow: "জিজ্ঞাসা করুন: \"কিভাবে আইভিএফ সাফল্যের হার বাড়ানো যায়?\"", t_ivf: "আইভিএফ প্রক্রিয়া", t_success: "সাফল্যের হার", t_emotion: "মানসিক সমর্থন", t_life: "জীবনধারা ও ডায়েট", t_cost: "খরচ এবং অর্থ", feedback_thanks: "আপনার মতামতের জন্য ধন্যবাদ!", feedback_prompt: "উন্নত করতে সাহায্য করুন। কি কম ছিল?" }
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
    // Find the message
    const msg = messages.find(m => m.id === msgId);
    if (!msg) return;

    // Update UI immediately
    setMessages(prev => prev.map(m => 
      m.id === msgId ? { ...m, rating, feedbackSubmitted: rating >= 4 || reason !== "", showReasonBox: rating < 4 && reason === "" } : m
    ));

    // If rating is high or reason is already provided, send to backend
    if (rating >= 4 || reason !== "") {
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
      <header className="flex justify-between items-center px-4 py-3 bg-white shadow-sm dark:bg-slate-800 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="p-2 rounded-full hover:bg-slate-100 dark:hover
