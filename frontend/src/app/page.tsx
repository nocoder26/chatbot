"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Globe } from "lucide-react";

// The supported languages
const LANGUAGES = [
  { code: "en", name: "English", label: "English", flag: "🇬🇧" },
  { code: "es", name: "Spanish", label: "Español", flag: "🇪🇸" },
  { code: "ja", name: "Japanese", label: "日本語", flag: "🇯🇵" },
  { code: "zh", name: "Mandarin", label: "普通话", flag: "🇨🇳" },
  { code: "hi", name: "Hindi", label: "हिन्दी", flag: "🇮🇳" },
  { code: "ta", name: "Tamil", label: "தமிழ்", flag: "🇮🇳" },
  { code: "te", name: "Telugu", label: "తెలుగు", flag: "🇮🇳" },
  { code: "ml", name: "Malayalam", label: "മലയാളം", flag: "🇮🇳" },
  { code: "bn", name: "Bangla", label: "বাংলা", flag: "🇧🇩" },
];

export default function LanguageSelection() {
  const router = useRouter();

  const handleSelect = (lang: string) => {
    localStorage.setItem("izana_language", lang);
    router.push("/chat");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex flex-col items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-10"
      >
        <div className="bg-white dark:bg-slate-800 p-4 rounded-full shadow-lg inline-block mb-4">
          <Globe className="w-12 h-12 text-teal-600" />
        </div>
        <h1 className="text-4xl font-bold text-slate-800 dark:text-white mb-2">Welcome to Izana AI</h1>
        <p className="text-slate-500 dark:text-slate-400">Please select your preferred language</p>
      </motion.div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-2xl w-full">
        {LANGUAGES.map((lang) => (
          <motion.button
            key={lang.code}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleSelect(lang.code)}
            className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm hover:shadow-xl border border-slate-100 dark:border-slate-700 transition-all flex flex-col items-center gap-2 group"
          >
            <span className="text-4xl mb-2 grayscale group-hover:grayscale-0 transition-all">{lang.flag}</span>
            <span className="font-semibold text-slate-700 dark:text-slate-200 group-hover:text-teal-600">{lang.label}</span>
            <span className="text-xs text-slate-400">{lang.name}</span>
          </motion.button>
        ))}
      </div>
      
      <p className="mt-12 text-xs text-slate-400">© 2026 Izana AI. Secure & Private.</p>
    </div>
  );
}
