"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Send, ArrowLeft, Loader2, ChevronRight, Paperclip, Star } from "lucide-react";
import BloodWorkConfirm from "@/components/BloodWorkConfirm";
import {
  sendChatMessage,
  analyzeBloodWork,
  submitFeedback,
  type ChatResponse,
  type LabResult,
} from "@/lib/api";

// --- TYPES ---
interface ChatMessage {
  id: number;
  type: "user" | "bot";
  content: string;
  suggested_questions?: string[];
  citations?: string[];
  isAnimating: boolean;
  isBloodWorkPrompt?: boolean;
  userQuery?: string;
  rating?: number;
}

// --- TOPIC SHORTCUTS ---
const TOPIC_ICONS = [
  { label: "IVF", query: "What is IVF?" },
  { label: "Male Fertility", query: "How can men improve fertility?" },
  { label: "IUI", query: "What is IUI?" },
  { label: "Nutrition", query: "Fertility diet tips" },
  { label: "Blood Work", query: "I want to understand my blood work." },
  { label: "Success Rates", query: "How to improve IVF success?" },
];

const LOADING_STEPS = ["Understanding your needs...", "Reading medical knowledge...", "Almost there..."];

// --- LANGUAGE MAP ---
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  ta: "Tamil",
  hi: "Hindi",
  te: "Telugu",
  ml: "Malayalam",
  es: "Spanish",
  ja: "Japanese",
};

// --- ANIMATED TEXT RENDERER ---
function GeminiFadeText({ text, onComplete }: { text: string; onComplete: () => void }) {
  const paragraphs = text.split("\n\n").filter((p) => p.trim() !== "");

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
}

// --- INLINE STAR RATING ---
function InlineStarRating({
  currentRating,
  onRate,
}: {
  currentRating: number;
  onRate: (r: number) => void;
}) {
  const [hoveredRating, setHoveredRating] = useState(0);
  const display = hoveredRating || currentRating;

  return (
    <div className="flex items-center gap-1 pt-3 border-t border-white/10 mt-3">
      <span className="text-xs text-white/60 mr-2">Rate this response:</span>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => onRate(star)}
          onMouseEnter={() => setHoveredRating(star)}
          onMouseLeave={() => setHoveredRating(0)}
          className="p-0.5 transition-transform hover:scale-110"
        >
          <Star
            className={`w-4 h-4 transition-colors ${
              star <= display
                ? "fill-yellow-400 text-yellow-400"
                : "text-white/30"
            }`}
          />
        </button>
      ))}
      {currentRating > 0 && (
        <span className="text-xs text-white/50 ml-2">
          {currentRating === 5 ? "Thank you!" : "Thanks for your feedback"}
        </span>
      )}
    </div>
  );
}

// --- MAIN CHAT PAGE ---
export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [langCode, setLangCode] = useState("en");
  const [showBloodWorkModal, setShowBloodWorkModal] = useState(false);
  const [bloodWorkData, setBloodWorkData] = useState<{ results: LabResult[] } | null>(null);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("izana_language") || "en";
    setLangCode(saved);
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (isLoading) {
      setLoadingStep(0);
      const interval = setInterval(
        () => setLoadingStep((p) => (p < 2 ? p + 1 : p)),
        1500
      );
      return () => clearInterval(interval);
    }
  }, [isLoading]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  const handleRate = async (messageId: number, rating: number) => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg) return;

    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, rating } : m))
    );

    try {
      await submitFeedback({
        question: msg.userQuery || "",
        answer: msg.content,
        rating,
        reason: "",
        suggested_questions: msg.suggested_questions || [],
      });
    } catch (err) {
      console.error("Failed to submit feedback:", err);
    }
  };

  const handleSend = async (text?: string, isHidden = false) => {
    const query = text || input;
    if (!query.trim() || isLoading) return;

    if (!isHidden) {
      setMessages((p) => [
        ...p,
        { id: Date.now(), type: "user", content: query, isAnimating: false },
      ]);
    }
    setInput("");

    if (query.toLowerCase().includes("blood work") || query.toLowerCase().includes("bloodwork")) {
      setMessages((p) => [
        ...p,
        {
          id: Date.now() + 1,
          type: "bot",
          content: "Please upload your lab report (PDF) so we can analyze your blood work results.",
          isBloodWorkPrompt: true,
          isAnimating: false,
        },
      ]);
      return;
    }

    setIsLoading(true);
    try {
      const data: ChatResponse = await sendChatMessage({
        message: query,
        language: langCode,
      });

      setMessages((p) => [
        ...p,
        {
          id: Date.now() + 1,
          type: "bot",
          content: data.response,
          suggested_questions: data.suggested_questions || [],
          citations: data.citations || [],
          isAnimating: true,
          userQuery: query,
          rating: 0,
        },
      ]);
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((p) => [
        ...p,
        {
          id: Date.now() + 1,
          type: "bot",
          content: "We encountered an error connecting to the AI service. Please try again.",
          isAnimating: false,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBloodWorkConfirm = async (confirmedData: { results: LabResult[] }) => {
    setShowBloodWorkModal(false);
    setBloodWorkData(null);

    const labSummary = confirmedData.results
      .map((r) => `${r.name}: ${r.value} ${r.unit}`)
      .join(", ");

    setMessages((p) => [
      ...p,
      {
        id: Date.now(),
        type: "user",
        content: `Analyze my lab results: ${labSummary}`,
        isAnimating: false,
      },
    ]);

    setIsLoading(true);
    try {
      const data: ChatResponse = await sendChatMessage({
        message: `Please analyze these fertility blood work results and provide a detailed interpretation.`,
        language: langCode,
        clinical_data: confirmedData,
      });

      setMessages((p) => [
        ...p,
        {
          id: Date.now() + 1,
          type: "bot",
          content: data.response,
          suggested_questions: data.suggested_questions || [],
          citations: data.citations || [],
          isAnimating: true,
          userQuery: `Blood work analysis: ${labSummary}`,
          rating: 0,
        },
      ]);
    } catch (err) {
      console.error("Blood work chat error:", err);
      setMessages((p) => [
        ...p,
        {
          id: Date.now() + 1,
          type: "bot",
          content: "We encountered an error analyzing your blood work. Please try again.",
          isAnimating: false,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (e.target) e.target.value = "";

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setMessages((p) => [
        ...p,
        {
          id: Date.now(),
          type: "bot",
          content: "Please upload a PDF file. Other formats are not supported.",
          isAnimating: false,
        },
      ]);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setMessages((p) => [
        ...p,
        {
          id: Date.now(),
          type: "bot",
          content: "The file is too large. Please upload a PDF under 10MB.",
          isAnimating: false,
        },
      ]);
      return;
    }

    setIsUploadingPdf(true);
    setMessages((p) => [
      ...p,
      {
        id: Date.now(),
        type: "user",
        content: `Uploaded: ${file.name}`,
        isAnimating: false,
      },
    ]);

    try {
      const data = await analyzeBloodWork(file);

      if (data.error) {
        setMessages((p) => [
          ...p,
          {
            id: Date.now(),
            type: "bot",
            content: data.error || "An unknown error occurred while processing the PDF.",
            isAnimating: false,
          },
        ]);
        setIsUploadingPdf(false);
        return;
      }

      if (data.results && data.results.length > 0) {
        setBloodWorkData(data);
        setShowBloodWorkModal(true);
      } else {
        setMessages((p) => [
          ...p,
          {
            id: Date.now(),
            type: "bot",
            content:
              "We could not extract any lab results from this PDF. It might be a scanned image. Please try uploading a text-based PDF or enter your values manually.",
            isAnimating: false,
          },
        ]);
      }
    } catch (err) {
      console.error("PDF upload error:", err);
      setMessages((p) => [
        ...p,
        {
          id: Date.now(),
          type: "bot",
          content: "Failed to process the uploaded file. Please try again.",
          isAnimating: false,
        },
      ]);
    } finally {
      setIsUploadingPdf(false);
    }
  };

  if (!isReady) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#f9f9f9] dark:bg-[#212121]">
        <Loader2 className="w-8 h-8 animate-spin text-[#3231b1]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#f9f9f9] dark:bg-[#212121] overflow-hidden">
      {/* HEADER */}
      <header className="flex justify-between items-center px-4 py-3 border-b border-black/5 dark:border-white/5">
        <button
          onClick={() => (messages.length > 0 ? setMessages([]) : router.push("/"))}
          className="p-2 rounded-full hover:bg-black/5"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <span className="font-bold text-[#3231b1] dark:text-[#86eae9]">Izana AI</span>
          <span className="text-xs text-slate-400">
            {LANGUAGE_NAMES[langCode] || "English"}
          </span>
        </div>
        <div className="w-10" />
      </header>

      {/* MESSAGES */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 max-w-3xl mx-auto w-full">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center space-y-8">
            <h2 className="text-3xl font-light text-center">
              How can{" "}
              <span className="font-bold text-[#3231b1] dark:text-[#86eae9]">Izana</span>{" "}
              help?
            </h2>
            <div className="grid grid-cols-2 gap-3 w-full">
              {TOPIC_ICONS.map((t, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(t.query, true)}
                  className="p-4 bg-white dark:bg-white/5 rounded-3xl border border-black/5 text-center font-bold hover:shadow-md transition-all"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex w-full ${
                m.type === "user" ? "justify-end" : "justify-start gap-3"
              }`}
            >
              {m.type === "bot" && (
                <div className="w-8 h-8 rounded-full bg-white p-1 shrink-0 border border-black/5">
                  <img src="/logo.png" alt="Izana" className="dark:invert" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-3xl p-5 ${
                  m.type === "user"
                    ? "bg-white text-black border border-black/5"
                    : "bg-gradient-to-br from-[#3231b1] to-[#230871] text-white shadow-lg"
                }`}
              >
                {/* Message Content */}
                {m.isAnimating ? (
                  <GeminiFadeText
                    text={m.content}
                    onComplete={() =>
                      setMessages((prev) =>
                        prev.map((msg) =>
                          msg.id === m.id ? { ...msg, isAnimating: false } : msg
                        )
                      )
                    }
                  />
                ) : (
                  <div className="space-y-4">
                    {m.content.split("\n\n").map((p, i) => (
                      <p key={i} className="leading-relaxed">
                        {p}
                      </p>
                    ))}
                  </div>
                )}

                {/* Citations */}
                {m.type === "bot" &&
                  !m.isAnimating &&
                  m.citations &&
                  m.citations.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-white/10">
                      <p className="text-xs text-white/40 mb-1">Sources:</p>
                      <div className="flex flex-wrap gap-1">
                        {m.citations.map((c, i) => (
                          <span
                            key={i}
                            className="text-xs bg-white/10 px-2 py-0.5 rounded-full text-white/60"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Follow-Up Questions - shown for ALL bot responses after animation */}
                {m.type === "bot" &&
                  !m.isAnimating &&
                  !m.isBloodWorkPrompt &&
                  m.suggested_questions &&
                  m.suggested_questions.length > 0 && (
                    <div className="pt-3 mt-3 border-t border-white/10 space-y-2">
                      {m.suggested_questions.map((q, i) => (
                        <button
                          key={i}
                          onClick={() => handleSend(q)}
                          className="w-full text-left text-sm bg-white/10 p-3 rounded-xl flex items-center justify-between hover:bg-white/20 transition-colors"
                        >
                          {q} <ChevronRight className="w-4 h-4 text-[#ff7a55] shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}

                {/* Star Rating - shown for ALL bot responses with content */}
                {m.type === "bot" &&
                  !m.isAnimating &&
                  !m.isBloodWorkPrompt &&
                  m.userQuery && (
                    <InlineStarRating
                      currentRating={m.rating || 0}
                      onRate={(r) => handleRate(m.id, r)}
                    />
                  )}

                {/* Blood Work Upload Button */}
                {m.isBloodWorkPrompt && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingPdf}
                    className="mt-4 w-full bg-[#ff7a55] text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isUploadingPdf ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Processing...
                      </>
                    ) : (
                      <>
                        <Paperclip className="w-4 h-4" /> Select PDF
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          ))
        )}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-[#3231b1]" />
            <span className="text-sm text-[#3231b1] font-bold">
              {LOADING_STEPS[loadingStep]}
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT BAR */}
      <div className="p-4 bg-[#f9f9f9] dark:bg-[#212121] border-t border-black/5">
        <div className="max-w-3xl mx-auto flex items-center bg-white dark:bg-[#2a2a2a] rounded-full px-4 py-2 border border-black/5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Ask a question..."
            className="flex-1 bg-transparent py-2 outline-none text-sm"
            maxLength={2000}
            disabled={isLoading}
          />
          <button
            onClick={() => handleSend()}
            disabled={isLoading || !input.trim()}
            className="p-2 bg-[#ff7a55] rounded-full text-white disabled:opacity-50 transition-opacity"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-center text-[10px] text-slate-400 mt-2">
          Izana AI provides general medical information only. Always consult a healthcare professional.
        </p>
      </div>

      {/* Hidden File Input */}
      <input
        type="file"
        accept="application/pdf"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileUpload}
      />

      {/* Blood Work Confirmation Modal */}
      <AnimatePresence>
        {showBloodWorkModal && bloodWorkData && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => setShowBloodWorkModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-2xl mx-auto"
            >
              <BloodWorkConfirm
                initialData={bloodWorkData}
                onConfirm={handleBloodWorkConfirm}
                onCancel={() => setShowBloodWorkModal(false)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
