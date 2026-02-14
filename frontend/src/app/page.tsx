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
    // Matched the calming blush background from the chat screen
    <div className="min-h-screen bg-[#FDFBF7] dark:bg-slate-900 flex flex-col items-center justify-center p-6 antialiased">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="text-center mb-10 max-w-2xl mx-auto"
      >
        <div className="bg-white dark:bg-slate-800 p-4 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.06)] inline-block mb-6">
          <Globe className="w-10 h-10 text-teal-600 dark:text-teal-400" />
        </div>
        
        <h1 className="text-3xl md:text-4xl font-bold text-slate-800 dark:text-white mb-6 tracking-tight">
          Welcome to Izana AI
        </h1>
        
        {/* THE GOLDEN CIRCLE VALUE PROPOSITION */}
        <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm p-6 rounded-3xl border border-teal-100/50 dark:border-slate-700 shadow-[0_4px_20px_rgb(0,0,0,0.02)] mb-8">
          <p className="text-[15px] md:text-base text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
            We believe every couple deserves to feel supported and confident on their path to parenthood. 
            By acting as your safe, anonymous companion, Izana helps you navigate complex fertility treatments 
            with clarity—empowering you to make informed decisions and achieve the highest possible success rates.
          </p>
        </div>

        <p className="text-sm font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
          Select your language
        </p>
      </motion.div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 max-w-2xl w-full">
        {LANGUAGES.map((lang, i) => (
          <motion.button
            key={lang.code}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => handleSelect(lang.code)}
            className="bg-white dark:bg-slate-800 p-5 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-slate-100 dark:border-slate-700 transition-all flex flex-col items-center gap-2 group"
          >
            <span className="text-3xl mb-1 grayscale opacity-80 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-300">
              {lang.flag}
            </span>
            <span className="font-semibold text-[15px] text-slate-700 dark:text-slate-200 group-hover:text-teal-600 transition-colors">
              {lang.label}
            </span>
            <span className="text-[11px] text-slate-400 font-medium">
              {lang.name}
            </span>
          </motion.button>
        ))}
      </div>
      
      <motion.p 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mt-12 text-[10px] text-slate-400 uppercase tracking-widest font-semibold"
      >
        © 2026 Izana AI • Secure & Private
      </motion.p>
    </div>
  );
}
