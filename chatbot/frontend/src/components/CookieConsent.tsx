"use client";

import { useState, useEffect } from "react";
import { Shield, X } from "lucide-react";

const STORAGE_KEY = "izana_cookie_consent";
const DEVICE_KEY = "izana_device_info";

const T: Record<string, { title: string; body: string; acceptAll: string; essentialOnly: string; learnMore: string }> = {
  en: { title: "Cookie & Privacy Notice", body: "We use essential cookies for authentication and optional analytics cookies to improve your experience. No personal data is shared with third parties.", acceptAll: "Accept All", essentialOnly: "Essential Only", learnMore: "Your data is auto-deleted within 24 hours." },
  ta: { title: "குக்கீ & தனியுரிமை அறிவிப்பு", body: "அங்கீகாரத்திற்கான அத்தியாவசிய குக்கீகளையும் உங்கள் அனுபவத்தை மேம்படுத்த விருப்ப பகுப்பாய்வு குக்கீகளையும் பயன்படுத்துகிறோம்.", acceptAll: "அனைத்தையும் ஏற்கவும்", essentialOnly: "அத்தியாவசியம் மட்டும்", learnMore: "உங்கள் தரவு 24 மணி நேரத்தில் தானாக நீக்கப்படும்." },
  hi: { title: "कुकी और गोपनीयता सूचना", body: "हम प्रमाणीकरण के लिए आवश्यक कुकीज़ और आपके अनुभव को बेहतर बनाने के लिए वैकल्पिक एनालिटिक्स कुकीज़ का उपयोग करते हैं।", acceptAll: "सभी स्वीकार करें", essentialOnly: "केवल आवश्यक", learnMore: "आपका डेटा 24 घंटे में स्वतः हटा दिया जाता है।" },
  te: { title: "కుకీ & గోప్యతా నోటీసు", body: "ధృవీకరణ కోసం అవసరమైన కుకీలు మరియు మీ అనుభవాన్ని మెరుగుపరచడానికి ఐచ్ఛిక అనలిటిక్స్ కుకీలను ఉపయోగిస్తాము.", acceptAll: "అన్నీ అంగీకరించు", essentialOnly: "అవసరమైనవి మాత్రమే", learnMore: "మీ డేటా 24 గంటల్లో స్వయంచాలకంగా తొలగించబడుతుంది." },
  ml: { title: "കുക്കി & സ്വകാര്യതാ അറിയിപ്പ്", body: "ഓതന്റിക്കേഷനു ആവശ്യമായ കുക്കികളും നിങ്ങളുടെ അനുഭവം മെച്ചപ്പെടുത്താൻ ഓപ്ഷണൽ അനലിറ്റിക്‌സ് കുക്കികളും ഉപയോഗിക്കുന്നു.", acceptAll: "എല്ലാം സ്വീകരിക്കുക", essentialOnly: "അവശ്യമായവ മാത്രം", learnMore: "നിങ്ങളുടെ ഡാറ്റ 24 മണിക്കൂറിനുള്ളിൽ സ്വയം ഇല്ലാതാക്കപ്പെടും." },
  es: { title: "Aviso de Cookies y Privacidad", body: "Usamos cookies esenciales para autenticación y cookies analíticas opcionales para mejorar tu experiencia.", acceptAll: "Aceptar todo", essentialOnly: "Solo esenciales", learnMore: "Tus datos se eliminan automáticamente en 24 horas." },
  ja: { title: "Cookie＆プライバシー通知", body: "認証用の必須Cookieと体験向上のためのオプション分析Cookieを使用しています。", acceptAll: "すべて許可", essentialOnly: "必須のみ", learnMore: "データは24時間以内に自動削除されます。" },
  fr: { title: "Avis Cookies & Confidentialité", body: "Nous utilisons des cookies essentiels pour l'authentification et des cookies analytiques optionnels pour améliorer votre expérience.", acceptAll: "Tout accepter", essentialOnly: "Essentiels uniquement", learnMore: "Vos données sont automatiquement supprimées sous 24 heures." },
  pt: { title: "Aviso de Cookies e Privacidade", body: "Usamos cookies essenciais para autenticação e cookies analíticos opcionais para melhorar sua experiência.", acceptAll: "Aceitar tudo", essentialOnly: "Apenas essenciais", learnMore: "Seus dados são excluídos automaticamente em 24 horas." },
};

function getDeviceInfo() {
  if (typeof window === "undefined") return null;
  const ua = navigator.userAgent;

  let browser = "Unknown";
  if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Edg")) browser = "Edge";
  else if (ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Safari")) browser = "Safari";

  let os = "Unknown";
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";

  return {
    browser,
    os,
    language: navigator.language,
    screen: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timestamp: new Date().toISOString(),
  };
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(STORAGE_KEY);
    if (!consent) {
      const timer = setTimeout(() => setVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleConsent = (level: "all" | "essential") => {
    localStorage.setItem(STORAGE_KEY, level);
    if (level === "all") {
      const info = getDeviceInfo();
      if (info) localStorage.setItem(DEVICE_KEY, JSON.stringify(info));
    }
    setVisible(false);
  };

  if (!visible) return null;

  const lang = (typeof window !== "undefined" && localStorage.getItem("izana_lang")) || "en";
  const t = T[lang] || T.en;

  return (
    <div className="fixed bottom-0 inset-x-0 z-[9999] p-4 sm:p-6 pointer-events-none" data-testid="cookie-consent-wrapper">
      <div className="max-w-2xl mx-auto bg-white dark:bg-[#2a2a2a] rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 p-5 sm:p-6 pointer-events-auto">
        <div className="flex items-start gap-3">
          <div className="shrink-0 p-2 bg-[#3231b1]/10 dark:bg-[#86eae9]/10 rounded-full">
            <Shield className="w-5 h-5 text-[#3231b1] dark:text-[#86eae9]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-bold text-[#1a1a1a] dark:text-white">{t.title}</h3>
              <button onClick={() => handleConsent("essential")} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-1">{t.body}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-3">{t.learnMore}</p>
            <div className="flex gap-2">
              <button
                onClick={() => handleConsent("all")}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-[#3231b1] to-[#230871] dark:from-[#86eae9] dark:to-[#5fc3c2] text-white dark:text-[#1a1a1a] text-xs font-bold rounded-xl hover:opacity-90 transition-opacity"
              >
                {t.acceptAll}
              </button>
              <button
                onClick={() => handleConsent("essential")}
                className="flex-1 px-4 py-2 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 text-xs font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-white/20 transition-colors"
              >
                {t.essentialOnly}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
