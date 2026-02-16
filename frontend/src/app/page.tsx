"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

const LANGUAGES = [
  { code: "en", name: "English", label: "English", flag: "🇬🇧" },
  { code: "es", name: "Spanish", label: "Español", flag: "🇪🇸" },
  { code: "ja", name: "Japanese", label: "日本語", flag: "🇯🇵" },
  { code: "hi", name: "Hindi", label: "हिन्दी", flag: "🇮🇳" },
  { code: "ta", name: "Tamil", label: "தமிழ்", flag: "🇮🇳" },
  { code: "te", name: "Telugu", label: "తెలుగు", flag: "🇮🇳" },
  { code: "ml", name: "Malayalam", label: "മലയാളം", flag: "🇮🇳" },
];

export default function LanguageSelection() {
  const router = useRouter();

  const handleSelect = (lang: string) => {
    localStorage.setItem("izana_language", lang);
    router.push("/chat");
  };

  return (
    <div className="min-h-screen bg-[#f9f9f9] dark:bg-[#212121] flex flex-col items-center justify-center p-6 antialiased">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="text-center mb-10 max-w-2xl mx-auto flex flex-col items-center"
      >
        <img
          src="/logo.png"
          alt="Izana AI"
          className="h-20 md:h-28 object-contain mb-8 dark:invert"
        />

        <div className="bg-white dark:bg-[#3231b1]/10 p-6 rounded-3xl border border-[#86eae9]/30 dark:border-[#3231b1]/30 shadow-[0_4px_20px_rgb(0,0,0,0.02)] mb-8">
          <p className="text-[15px] md:text-base text-[#212121] dark:text-[#f9f9f9] leading-relaxed font-medium">
            We believe every couple deserves to feel supported and confident on
            their path to parenthood. By acting as your safe, anonymous
            companion, Izana helps you navigate complex fertility treatments with
            clarity — empowering you to make informed decisions and achieve the
            highest possible success rates.
          </p>
        </div>

        <p className="text-sm font-bold text-[#3231b1] dark:text-[#86eae9] uppercase tracking-widest mb-2">
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
            className="bg-white dark:bg-[#212121] p-5 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(255,122,85,0.15)] border border-[#f9f9f9] dark:border-[#3231b1]/30 transition-all flex flex-col items-center gap-2 group"
          >
            <span className="text-3xl mb-1 grayscale opacity-80 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-300">
              {lang.flag}
            </span>
            <span className="font-semibold text-[15px] text-[#212121] dark:text-[#f9f9f9] group-hover:text-[#3231b1] dark:group-hover:text-[#86eae9] transition-colors">
              {lang.label}
            </span>
            <span className="text-[11px] text-[#212121]/50 dark:text-[#f9f9f9]/50 font-medium">
              {lang.name}
            </span>
          </motion.button>
        ))}
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mt-12 text-[10px] text-[#212121]/40 dark:text-[#f9f9f9]/40 uppercase tracking-widest font-semibold"
      >
        &copy; 2026 Izana AI &bull; Secure &amp; Private
      </motion.p>
    </div>
  );
}
