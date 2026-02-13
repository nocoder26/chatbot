"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Send, ArrowLeft, Loader2 } from "lucide-react";
import StarRating from "@/components/StarRating";
import FeedbackModal from "@/components/FeedbackModal";
import { sendMessage, submitFeedback, ChatResponse } from "@/lib/api";

interface Message {
  id: string;
  type: "user" | "bot";
  content: string;
  citations?: string[];
  chatId?: number;
  isGap?: boolean;
  rating?: number;
}

function parseCitations(text: string): { content: string; citations: string[] } {
  const citationRegex = /\[Source:\s*([^\]]+)\]/g;
  const citations: string[] = [];
  let match;

  while ((match = citationRegex.exec(text)) !== null) {
    if (!citations.includes(match[1])) {
      citations.push(match[1]);
    }
  }

  // Remove citation markers from text for cleaner display
  const content = text.replace(citationRegex, "").trim();

  return { content, citations };
}

function CitationBadge({ source }: { source: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200">
      {source}
    </span>
  );
}

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [language, setLanguage] = useState("en");
  const [feedbackModal, setFeedbackModal] = useState<{
    isOpen: boolean;
    messageId: string;
    rating: number;
  }>({ isOpen: false, messageId: "", rating: 0 });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedLang = localStorage.getItem("selectedLanguage");
    if (savedLang) {
      setLanguage(savedLang);
    } else {
      router.push("/");
    }
  }, [router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response: ChatResponse = await sendMessage(input.trim(), language);
      const { content, citations } = parseCitations(response.response);

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: "bot",
        content,
        citations: [...citations, ...response.citations.filter((c) => !citations.includes(c))],
        chatId: response.chat_id,
        isGap: response.is_gap,
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: "bot",
        content: "Sorry, I encountered an error. Please try again.",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleRate = async (messageId: string, rating: number, chatId?: number) => {
    setMessages((prev) =>
      prev.map((msg) => (msg.id === messageId ? { ...msg, rating } : msg))
    );

    if (rating < 3) {
      setFeedbackModal({ isOpen: true, messageId, rating });
    } else if (chatId) {
      await submitFeedback({ chat_id: chatId, rating });
    }
  };

  const handleFeedbackSubmit = async (comment: string) => {
    const message = messages.find((m) => m.id === feedbackModal.messageId);
    if (message?.chatId) {
      await submitFeedback({
        chat_id: message.chatId,
        rating: feedbackModal.rating,
        comment,
      });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <header className="flex items-center gap-4 px-4 py-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => router.push("/")}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" />
        </button>
        <div>
          <h1 className="font-semibold text-slate-800 dark:text-white">
            Health Assistant
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Language: {language.toUpperCase()}
          </p>
        </div>
      </header>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 chat-scroll">
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] md:max-w-[70%] rounded-2xl px-4 py-3 ${
                  message.type === "user"
                    ? "bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white"
                    : "bg-teal-600 text-white"
                }`}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>

                {/* Citations */}
                {message.citations && message.citations.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-teal-500/30">
                    {message.citations.map((citation, idx) => (
                      <CitationBadge key={idx} source={citation} />
                    ))}
                  </div>
                )}

                {/* Star Rating for bot messages */}
                {message.type === "bot" && message.chatId && (
                  <div className="mt-3 pt-2 border-t border-teal-500/30">
                    <p className="text-xs text-teal-100 mb-1">Rate this response:</p>
                    <StarRating
                      currentRating={message.rating}
                      onRate={(rating) => handleRate(message.id, rating, message.chatId)}
                      disabled={!!message.rating}
                    />
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Loading indicator */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start"
          >
            <div className="bg-teal-600 rounded-2xl px-4 py-3 flex items-center gap-2">
              <Loader2 className="w-5 h-5 text-white animate-spin" />
              <span className="text-white">Thinking...</span>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
        <div className="flex gap-3 max-w-4xl mx-auto">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Type your question..."
            disabled={isLoading}
            className="flex-1 px-4 py-3 rounded-full border border-slate-300 dark:border-slate-600
                       bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-white
                       placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500
                       disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="p-3 rounded-full bg-teal-600 text-white hover:bg-teal-700
                       transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-center text-slate-400 mt-2">
          For informational purposes only. Consult a healthcare professional for medical advice.
        </p>
      </div>

      {/* Feedback Modal */}
      <FeedbackModal
        isOpen={feedbackModal.isOpen}
        onClose={() => setFeedbackModal({ isOpen: false, messageId: "", rating: 0 })}
        onSubmit={handleFeedbackSubmit}
        rating={feedbackModal.rating}
      />
    </div>
  );
}
