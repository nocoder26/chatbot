"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Shuffle, Shield, Lock, Eye, EyeOff } from "lucide-react";
import {
  fetchRegisterOptions,
  registerAnonymous,
  checkAuthMethods,
  loginWithPassphrase,
  grantConsent,
} from "@/lib/api";

const LANGUAGES = [
  { code: "en", name: "English", label: "English", flag: "🇬🇧" },
  { code: "es", name: "Spanish", label: "Español", flag: "🇪🇸" },
  { code: "ja", name: "Japanese", label: "日本語", flag: "🇯🇵" },
  { code: "hi", name: "Hindi", label: "हिन्दी", flag: "🇮🇳" },
  { code: "ta", name: "Tamil", label: "தமிழ்", flag: "🇮🇳" },
  { code: "te", name: "Telugu", label: "తెలుగు", flag: "🇮🇳" },
  { code: "ml", name: "Malayalam", label: "മലയാളം", flag: "🇮🇳" },
  { code: "fr", name: "French", label: "Français", flag: "🇫🇷" },
  { code: "pt", name: "Portuguese", label: "Português", flag: "🇵🇹" },
];

const FALLBACK_USERNAMES = ["GratefulPanda", "RadiantDolphin", "PeacefulStar", "KindHeart", "WiseCloud"];
const FALLBACK_AVATARS = [
  "https://api.dicebear.com/9.x/avataaars/svg?seed=1",
  "https://api.dicebear.com/9.x/avataaars/svg?seed=2",
  "https://api.dicebear.com/9.x/avataaars/svg?seed=3",
  "https://api.dicebear.com/9.x/avataaars/svg?seed=4",
  "https://api.dicebear.com/9.x/avataaars/svg?seed=5",
  "https://api.dicebear.com/9.x/avataaars/svg?seed=6",
];

const T: Record<string, Record<string, string>> = {
  en: {
    selectLang: "Select your language", continue: "Continue", back: "Back",
    alreadyHaveAccount: "I already have an account",
    privacyTitle: "Privacy & Consent", privacyDesc: "Please review how we handle your data",
    privacyIntro: "We collect conversation data and bloodwork analysis to provide you with personalised health guidance.",
    b1: "Your data is pseudonymised — linked to a random ID, not your identity.",
    b2: "Operational data is automatically deleted after 24 hours.",
    b3: "Anonymised data may be retained for up to 18 months to improve chatbot accuracy.",
    b4: "You can request deletion of all your data at any time from your profile.",
    b5: "Your data is never shared with third parties.",
    b6: "All data is encrypted at rest (AES-256) and in transit (TLS).",
    consentCheckbox: "I consent to the processing and analysis of my anonymised data",
    iAgree: "I Agree — Continue",
    createProfile: "Create your anonymous profile", pickUsername: "Pick a username",
    shuffle: "Shuffle", pickAvatar: "Pick an avatar",
    secureTitle: "Secure your account", secureDesc: "Create a passphrase to protect your anonymous session.",
    passphrasePlaceholder: "Create passphrase (min 8 chars)", confirmPassphrase: "Confirm passphrase",
    secureBtn: "Secure with passphrase", skipSecurity: "Skip for now (less secure)",
    welcomeBack: "Welcome back", enterUsername: "Enter your username to access your session",
    yourUsername: "Your username", signIn: "Sign in",
    tryDifferent: "Try a different username", newAccount: "Create a new account instead",
    loggingInAs: "Logging in as", enterPassphrase: "Enter your passphrase",
    noPassphrase: "This account has no passphrase set. Please create a new account.",
    badge1: "End-to-end anonymous", badge2: "No email required", badge3: "Auto-deleted in 24h",
    subtitle: "Your fertility journey, completely private",
    passphraseMinErr: "Passphrase must be at least 8 characters.",
    passphraseMismatch: "Passphrases do not match.",
    regFailed: "Registration failed — please try again.",
    noAccount: "No account found with this username.",
    checkFailed: "Could not check account. Please try again.",
    loginFailed: "Login failed.",
  },
  es: {
    selectLang: "Selecciona tu idioma", continue: "Continuar", back: "Volver",
    alreadyHaveAccount: "Ya tengo una cuenta",
    privacyTitle: "Privacidad y consentimiento", privacyDesc: "Revisa cómo manejamos tus datos",
    privacyIntro: "Recopilamos datos de conversación y análisis de sangre para brindarte orientación de salud personalizada.",
    b1: "Tus datos están seudonimizados — vinculados a un ID aleatorio, no a tu identidad.",
    b2: "Los datos operativos se eliminan automáticamente después de 24 horas.",
    b3: "Los datos anonimizados pueden conservarse hasta 18 meses para mejorar la precisión del chatbot.",
    b4: "Puedes solicitar la eliminación de todos tus datos en cualquier momento desde tu perfil.",
    b5: "Tus datos nunca se comparten con terceros.",
    b6: "Todos los datos están cifrados en reposo (AES-256) y en tránsito (TLS).",
    consentCheckbox: "Consiento el procesamiento y análisis de mis datos anonimizados",
    iAgree: "Acepto — Continuar",
    createProfile: "Crea tu perfil anónimo", pickUsername: "Elige un nombre de usuario",
    shuffle: "Aleatorio", pickAvatar: "Elige un avatar",
    secureTitle: "Protege tu cuenta", secureDesc: "Crea una contraseña para proteger tu sesión anónima.",
    passphrasePlaceholder: "Crear contraseña (mín. 8 caracteres)", confirmPassphrase: "Confirmar contraseña",
    secureBtn: "Proteger con contraseña", skipSecurity: "Omitir por ahora (menos seguro)",
    welcomeBack: "Bienvenido de vuelta", enterUsername: "Ingresa tu nombre de usuario para acceder a tu sesión",
    yourUsername: "Tu nombre de usuario", signIn: "Iniciar sesión",
    tryDifferent: "Probar con otro nombre", newAccount: "Crear una nueva cuenta",
    loggingInAs: "Iniciando sesión como", enterPassphrase: "Ingresa tu contraseña",
    noPassphrase: "Esta cuenta no tiene contraseña. Por favor crea una nueva cuenta.",
    badge1: "Anónimo de extremo a extremo", badge2: "Sin correo electrónico", badge3: "Eliminado en 24h",
    subtitle: "Tu camino de fertilidad, completamente privado",
    passphraseMinErr: "La contraseña debe tener al menos 8 caracteres.",
    passphraseMismatch: "Las contraseñas no coinciden.",
    regFailed: "Registro fallido — inténtalo de nuevo.",
    noAccount: "No se encontró cuenta con este nombre.", checkFailed: "No se pudo verificar. Inténtalo de nuevo.",
    loginFailed: "Error de inicio de sesión.",
  },
  ja: {
    selectLang: "言語を選択", continue: "続ける", back: "戻る",
    alreadyHaveAccount: "すでにアカウントを持っています",
    privacyTitle: "プライバシーと同意", privacyDesc: "データの取り扱いについてご確認ください",
    privacyIntro: "パーソナライズされた健康ガイダンスを提供するために、会話データと血液検査分析を収集しています。",
    b1: "データは仮名化されています — ランダムなIDに紐付けられ、あなたの身元とは結びつきません。",
    b2: "運用データは24時間後に自動削除されます。",
    b3: "匿名化されたデータはチャットボットの精度向上のため最大18ヶ月保持される場合があります。",
    b4: "プロフィールからいつでもすべてのデータの削除を要求できます。",
    b5: "データは第三者と共有されることはありません。",
    b6: "すべてのデータは保存時（AES-256）および転送時（TLS）に暗号化されています。",
    consentCheckbox: "匿名化データの処理と分析に同意します",
    iAgree: "同意して続ける",
    createProfile: "匿名プロフィールを作成", pickUsername: "ユーザー名を選択",
    shuffle: "シャッフル", pickAvatar: "アバターを選択",
    secureTitle: "アカウントを保護", secureDesc: "匿名セッションを保護するパスフレーズを作成してください。",
    passphrasePlaceholder: "パスフレーズを作成（8文字以上）", confirmPassphrase: "パスフレーズを確認",
    secureBtn: "パスフレーズで保護", skipSecurity: "今はスキップ（安全性が低い）",
    welcomeBack: "おかえりなさい", enterUsername: "ユーザー名を入力してセッションにアクセス",
    yourUsername: "ユーザー名", signIn: "サインイン",
    tryDifferent: "別のユーザー名を試す", newAccount: "新しいアカウントを作成",
    loggingInAs: "ログイン中：", enterPassphrase: "パスフレーズを入力",
    noPassphrase: "このアカウントにはパスフレーズが設定されていません。新しいアカウントを作成してください。",
    badge1: "完全匿名", badge2: "メール不要", badge3: "24時間で自動削除",
    subtitle: "あなたの妊活、完全にプライベートに",
    passphraseMinErr: "パスフレーズは8文字以上必要です。",
    passphraseMismatch: "パスフレーズが一致しません。",
    regFailed: "登録に失敗しました。もう一度お試しください。",
    noAccount: "このユーザー名のアカウントが見つかりません。", checkFailed: "確認できませんでした。もう一度お試しください。",
    loginFailed: "ログインに失敗しました。",
  },
  hi: {
    selectLang: "अपनी भाषा चुनें", continue: "जारी रखें", back: "वापस",
    alreadyHaveAccount: "मेरे पास पहले से खाता है",
    privacyTitle: "गोपनीयता और सहमति", privacyDesc: "कृपया समीक्षा करें कि हम आपके डेटा को कैसे संभालते हैं",
    privacyIntro: "हम आपको व्यक्तिगत स्वास्थ्य मार्गदर्शन प्रदान करने के लिए बातचीत डेटा और रक्त परीक्षण विश्लेषण एकत्र करते हैं।",
    b1: "आपका डेटा छद्मनामित है — एक यादृच्छिक आईडी से जुड़ा है, आपकी पहचान से नहीं।",
    b2: "परिचालन डेटा 24 घंटे बाद स्वचालित रूप से हटा दिया जाता है।",
    b3: "चैटबॉट सटीकता में सुधार के लिए अनाम डेटा 18 महीने तक रखा जा सकता है।",
    b4: "आप अपनी प्रोफ़ाइल से किसी भी समय अपने सभी डेटा को हटाने का अनुरोध कर सकते हैं।",
    b5: "आपका डेटा कभी भी तीसरे पक्ष के साथ साझा नहीं किया जाता।",
    b6: "सभी डेटा विश्राम (AES-256) और पारगमन (TLS) में एन्क्रिप्टेड है।",
    consentCheckbox: "मैं अपने अनाम डेटा के प्रसंस्करण और विश्लेषण के लिए सहमत हूं",
    iAgree: "मैं सहमत हूं — जारी रखें",
    createProfile: "अपनी अनाम प्रोफ़ाइल बनाएं", pickUsername: "उपयोगकर्ता नाम चुनें",
    shuffle: "बदलें", pickAvatar: "अवतार चुनें",
    secureTitle: "अपना खाता सुरक्षित करें", secureDesc: "अपने अनाम सत्र की सुरक्षा के लिए पासफ़्रेज़ बनाएं।",
    passphrasePlaceholder: "पासफ़्रेज़ बनाएं (न्यूनतम 8 अक्षर)", confirmPassphrase: "पासफ़्रेज़ की पुष्टि करें",
    secureBtn: "पासफ़्रेज़ से सुरक्षित करें", skipSecurity: "अभी छोड़ें (कम सुरक्षित)",
    welcomeBack: "वापस स्वागत है", enterUsername: "अपने सत्र तक पहुंचने के लिए उपयोगकर्ता नाम दर्ज करें",
    yourUsername: "आपका उपयोगकर्ता नाम", signIn: "साइन इन",
    tryDifferent: "दूसरा नाम आज़माएं", newAccount: "नया खाता बनाएं",
    loggingInAs: "के रूप में लॉग इन", enterPassphrase: "अपना पासफ़्रेज़ दर्ज करें",
    noPassphrase: "इस खाते में पासफ़्रेज़ सेट नहीं है। कृपया नया खाता बनाएं।",
    badge1: "पूर्ण गुमनाम", badge2: "ईमेल आवश्यक नहीं", badge3: "24 घंटे में स्वतः हटाया गया",
    subtitle: "आपकी प्रजनन यात्रा, पूरी तरह निजी",
    passphraseMinErr: "पासफ़्रेज़ कम से कम 8 अक्षर का होना चाहिए।",
    passphraseMismatch: "पासफ़्रेज़ मेल नहीं खाते।",
    regFailed: "पंजीकरण विफल — कृपया पुनः प्रयास करें।",
    noAccount: "इस नाम से कोई खाता नहीं मिला।", checkFailed: "जाँच नहीं हो सकी। पुनः प्रयास करें।",
    loginFailed: "लॉगिन विफल।",
  },
  ta: {
    selectLang: "உங்கள் மொழியைத் தேர்ந்தெடுக்கவும்", continue: "தொடரவும்", back: "பின்னால்",
    alreadyHaveAccount: "எனக்கு ஏற்கனவே கணக்கு உள்ளது",
    privacyTitle: "தனியுரிமை & ஒப்புதல்", privacyDesc: "உங்கள் தரவை நாங்கள் எவ்வாறு கையாளுகிறோம் என்பதை மதிப்பாய்வு செய்யுங்கள்",
    privacyIntro: "தனிப்பயனாக்கப்பட்ட சுகாதார வழிகாட்டுதலை வழங்க உரையாடல் தரவு மற்றும் இரத்தப் பரிசோதனை பகுப்பாய்வை சேகரிக்கிறோம்.",
    b1: "உங்கள் தரவு புனைப்பெயரிடப்பட்டது — சீரற்ற ஐடியுடன் இணைக்கப்பட்டுள்ளது.",
    b2: "செயல்பாட்டு தரவு 24 மணி நேரத்தில் தானாக நீக்கப்படும்.",
    b3: "அநாமதேய தரவு சாட்போட் துல்லியத்தை மேம்படுத்த 18 மாதங்கள் வரை வைக்கப்படலாம்.",
    b4: "உங்கள் சுயவிவரத்திலிருந்து எந்த நேரத்திலும் நீக்குதலைக் கோரலாம்.",
    b5: "உங்கள் தரவு மூன்றாம் தரப்பினருடன் பகிரப்படாது.",
    b6: "எல்லா தரவும் ஓய்வு (AES-256) மற்றும் பரிமாற்றத்தில் (TLS) மறைகுறியாக்கப்பட்டுள்ளது.",
    consentCheckbox: "எனது அநாமதேய தரவின் செயலாக்கம் மற்றும் பகுப்பாய்வுக்கு நான் ஒப்புக்கொள்கிறேன்",
    iAgree: "நான் ஒப்புக்கொள்கிறேன் — தொடரவும்",
    createProfile: "உங்கள் அநாமதேய சுயவிவரத்தை உருவாக்கவும்", pickUsername: "பயனர்பெயரைத் தேர்ந்தெடுக்கவும்",
    shuffle: "கலக்கு", pickAvatar: "அவதாரத்தைத் தேர்ந்தெடுக்கவும்",
    secureTitle: "உங்கள் கணக்கைப் பாதுகாக்கவும்", secureDesc: "உங்கள் அநாமதேய அமர்வைப் பாதுகாக்க கடவுச்சொல்லை உருவாக்கவும்.",
    passphrasePlaceholder: "கடவுச்சொல் உருவாக்கவும் (குறைந்தது 8 எழுத்துகள்)", confirmPassphrase: "கடவுச்சொல்லை உறுதிப்படுத்தவும்",
    secureBtn: "கடவுச்சொல்லுடன் பாதுகாக்கவும்", skipSecurity: "இப்போது தவிர்க்கவும் (குறைவான பாதுகாப்பு)",
    welcomeBack: "மீண்டும் வரவேற்கிறோம்", enterUsername: "உங்கள் அமர்வை அணுக பயனர்பெயரை உள்ளிடவும்",
    yourUsername: "உங்கள் பயனர்பெயர்", signIn: "உள்நுழைக",
    tryDifferent: "வேறு பெயரை முயற்சிக்கவும்", newAccount: "புதிய கணக்கு உருவாக்கவும்",
    loggingInAs: "உள்நுழைகிறது:", enterPassphrase: "கடவுச்சொல்லை உள்ளிடவும்",
    noPassphrase: "இந்தக் கணக்கில் கடவுச்சொல் இல்லை. புதிய கணக்கு உருவாக்கவும்.",
    badge1: "முழுமையான அநாமதேயம்", badge2: "மின்னஞ்சல் தேவையில்லை", badge3: "24 மணிநேரத்தில் நீக்கப்படும்",
    subtitle: "உங்கள் கருவுறுதல் பயணம், முற்றிலும் தனிப்பட்டது",
    passphraseMinErr: "கடவுச்சொல் குறைந்தது 8 எழுத்துகள் இருக்க வேண்டும்.",
    passphraseMismatch: "கடவுச்சொற்கள் பொருந்தவில்லை.",
    regFailed: "பதிவு தோல்வி — மீண்டும் முயற்சிக்கவும்.",
    noAccount: "இந்தப் பெயரில் கணக்கு இல்லை.", checkFailed: "சரிபார்க்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.",
    loginFailed: "உள்நுழைவு தோல்வி.",
  },
  te: {
    selectLang: "మీ భాషను ఎంచుకోండి", continue: "కొనసాగించు", back: "వెనక్కి",
    alreadyHaveAccount: "నాకు ఇప్పటికే ఖాతా ఉంది",
    privacyTitle: "గోప్యత & సమ్మతి", privacyDesc: "మీ డేటాను మేము ఎలా నిర్వహిస్తామో సమీక్షించండి",
    privacyIntro: "వ్యక్తిగతీకరించిన ఆరోగ్య మార్గదర్శకత్వం అందించడానికి సంభాషణ డేటా మరియు రక్త పరీక్ష విశ్లేషణను సేకరిస్తాము.",
    b1: "మీ డేటా మారుపేరుతో ఉంటుంది — యాదృచ్ఛిక IDకి లింక్ చేయబడింది.",
    b2: "కార్యాచరణ డేటా 24 గంటల తర్వాత స్వయంచాలకంగా తొలగించబడుతుంది.",
    b3: "అనామక డేటా చాట్‌బాట్ ఖచ్చితత్వాన్ని మెరుగుపరచడానికి 18 నెలల వరకు ఉంచబడవచ్చు.",
    b4: "మీ ప్రొఫైల్ నుండి ఎప్పుడైనా తొలగింపును అభ్యర్థించవచ్చు.",
    b5: "మీ డేటా మూడవ పక్షాలతో ఎప్పుడూ భాగస్వామ్యం చేయబడదు.",
    b6: "మొత్తం డేటా విశ్రాంతిలో (AES-256) మరియు రవాణాలో (TLS) ఎన్‌క్రిప్ట్ చేయబడింది.",
    consentCheckbox: "నా అనామక డేటా ప్రాసెసింగ్ మరియు విశ్లేషణకు నేను అంగీకరిస్తున్నాను",
    iAgree: "నేను అంగీకరిస్తున్నాను — కొనసాగించు",
    createProfile: "మీ అనామక ప్రొఫైల్‌ను సృష్టించండి", pickUsername: "వినియోగదారు పేరు ఎంచుకోండి",
    shuffle: "షఫుల్", pickAvatar: "అవతార్ ఎంచుకోండి",
    secureTitle: "మీ ఖాతాను భద్రపరచండి", secureDesc: "మీ అనామక సెషన్‌ను రక్షించడానికి పాస్‌ఫ్రేజ్ సృష్టించండి.",
    passphrasePlaceholder: "పాస్‌ఫ్రేజ్ సృష్టించండి (కనీసం 8 అక్షరాలు)", confirmPassphrase: "పాస్‌ఫ్రేజ్ నిర్ధారించండి",
    secureBtn: "పాస్‌ఫ్రేజ్‌తో భద్రపరచండి", skipSecurity: "ఇప్పుడు దాటవేయండి (తక్కువ భద్రత)",
    welcomeBack: "తిరిగి స్వాగతం", enterUsername: "మీ సెషన్‌ను యాక్సెస్ చేయడానికి వినియోగదారు పేరు నమోదు చేయండి",
    yourUsername: "మీ వినియోగదారు పేరు", signIn: "సైన్ ఇన్",
    tryDifferent: "వేరే పేరు ప్రయత్నించండి", newAccount: "కొత్త ఖాతా సృష్టించండి",
    loggingInAs: "లాగిన్ అవుతోంది:", enterPassphrase: "మీ పాస్‌ఫ్రేజ్ నమోదు చేయండి",
    noPassphrase: "ఈ ఖాతాలో పాస్‌ఫ్రేజ్ లేదు. కొత్త ఖాతా సృష్టించండి.",
    badge1: "పూర్తి అనామకత్వం", badge2: "ఇమెయిల్ అవసరం లేదు", badge3: "24 గంటల్లో తొలగించబడుతుంది",
    subtitle: "మీ సంతానోత్పత్తి ప్రయాణం, పూర్తిగా ప్రైవేట్",
    passphraseMinErr: "పాస్‌ఫ్రేజ్ కనీసం 8 అక్షరాలు ఉండాలి.",
    passphraseMismatch: "పాస్‌ఫ్రేజ్‌లు సరిపోలడం లేదు.",
    regFailed: "నమోదు విఫలమైంది — దయచేసి మళ్లీ ప్రయత్నించండి.",
    noAccount: "ఈ పేరుతో ఖాతా కనుగొనబడలేదు.", checkFailed: "తనిఖీ చేయడం సాధ్యపడలేదు.",
    loginFailed: "లాగిన్ విఫలమైంది.",
  },
  ml: {
    selectLang: "നിങ്ങളുടെ ഭാഷ തിരഞ്ഞെടുക്കുക", continue: "തുടരുക", back: "പിന്നോട്ട്",
    alreadyHaveAccount: "എനിക്ക് ഇതിനകം അക്കൗണ്ട് ഉണ്ട്",
    privacyTitle: "സ്വകാര്യത & സമ്മതം", privacyDesc: "നിങ്ങളുടെ ഡാറ്റ ഞങ്ങൾ എങ്ങനെ കൈകാര്യം ചെയ്യുന്നുവെന്ന് അവലോകനം ചെയ്യുക",
    privacyIntro: "വ്യക്തിഗതമാക്കിയ ആരോഗ്യ മാർഗ്ഗനിർദ്ദേശം നൽകാൻ ഞങ്ങൾ സംഭാഷണ ഡാറ്റയും രക്ത പരിശോധന വിശകലനവും ശേഖരിക്കുന്നു.",
    b1: "നിങ്ങളുടെ ഡാറ്റ ഗുപ്തനാമമാക്കിയിരിക്കുന്നു — റാൻഡം ഐഡിയുമായി ലിങ്ക് ചെയ്തിരിക്കുന്നു.",
    b2: "പ്രവർത്തന ഡാറ്റ 24 മണിക്കൂറിനുള്ളിൽ സ്വയമേവ ഇല്ലാതാക്കും.",
    b3: "അജ്ഞാത ഡാറ്റ ചാറ്റ്ബോട്ട് കൃത്യത മെച്ചപ്പെടുത്താൻ 18 മാസം വരെ സൂക്ഷിക്കാം.",
    b4: "നിങ്ങളുടെ പ്രൊഫൈലിൽ നിന്ന് ഏത് സമയത്തും ഇല്ലാതാക്കൽ അഭ്യർത്ഥിക്കാം.",
    b5: "നിങ്ങളുടെ ഡാറ്റ ഒരിക്കലും മൂന്നാം കക്ഷികളുമായി പങ്കിടില്ല.",
    b6: "എല്ലാ ഡാറ്റയും വിശ്രമത്തിൽ (AES-256) ട്രാൻസിറ്റിൽ (TLS) എൻക്രിപ്റ്റ് ചെയ്തിരിക്കുന്നു.",
    consentCheckbox: "എന്റെ അജ്ഞാത ഡാറ്റയുടെ പ്രോസസ്സിംഗിനും വിശകലനത്തിനും ഞാൻ സമ്മതിക്കുന്നു",
    iAgree: "ഞാൻ സമ്മതിക്കുന്നു — തുടരുക",
    createProfile: "നിങ്ങളുടെ അജ്ഞാത പ്രൊഫൈൽ സൃഷ്ടിക്കുക", pickUsername: "ഉപയോക്തൃനാമം തിരഞ്ഞെടുക്കുക",
    shuffle: "ഷഫിൾ", pickAvatar: "അവതാർ തിരഞ്ഞെടുക്കുക",
    secureTitle: "നിങ്ങളുടെ അക്കൗണ്ട് സുരക്ഷിതമാക്കുക", secureDesc: "നിങ്ങളുടെ അജ്ഞാത സെഷൻ സംരക്ഷിക്കാൻ പാസ്ഫ്രെയ്സ് സൃഷ്ടിക്കുക.",
    passphrasePlaceholder: "പാസ്ഫ്രെയ്സ് സൃഷ്ടിക്കുക (കുറഞ്ഞത് 8 അക്ഷരങ്ങൾ)", confirmPassphrase: "പാസ്ഫ്രെയ്സ് സ്ഥിരീകരിക്കുക",
    secureBtn: "പാസ്ഫ്രെയ്സ് ഉപയോഗിച്ച് സുരക്ഷിതമാക്കുക", skipSecurity: "ഇപ്പോൾ ഒഴിവാക്കുക (കുറവ് സുരക്ഷിതം)",
    welcomeBack: "തിരികെ സ്വാഗതം", enterUsername: "നിങ്ങളുടെ സെഷൻ ആക്സസ് ചെയ്യാൻ ഉപയോക്തൃനാമം നൽകുക",
    yourUsername: "നിങ്ങളുടെ ഉപയോക്തൃനാമം", signIn: "സൈൻ ഇൻ",
    tryDifferent: "മറ്റൊരു പേര് ശ്രമിക്കുക", newAccount: "പുതിയ അക്കൗണ്ട് സൃഷ്ടിക്കുക",
    loggingInAs: "ലോഗിൻ ചെയ്യുന്നു:", enterPassphrase: "നിങ്ങളുടെ പാസ്ഫ്രെയ്സ് നൽകുക",
    noPassphrase: "ഈ അക്കൗണ്ടിൽ പാസ്ഫ്രെയ്സ് ഇല്ല. പുതിയ അക്കൗണ്ട് സൃഷ്ടിക്കുക.",
    badge1: "സമ്പൂർണ്ണ അജ്ഞാതത്വം", badge2: "ഇമെയിൽ ആവശ്യമില്ല", badge3: "24 മണിക്കൂറിൽ ഇല്ലാതാക്കും",
    subtitle: "നിങ്ങളുടെ ഫെർട്ടിലിറ്റി യാത്ര, പൂർണ്ണമായും സ്വകാര്യം",
    passphraseMinErr: "പാസ്ഫ്രെയ്സ് കുറഞ്ഞത് 8 അക്ഷരങ്ങൾ ആവശ്യമാണ്.",
    passphraseMismatch: "പാസ്ഫ്രെയ്സുകൾ പൊരുത്തപ്പെടുന്നില്ല.",
    regFailed: "രജിസ്ട്രേഷൻ പരാജയപ്പെട്ടു — വീണ്ടും ശ്രമിക്കുക.",
    noAccount: "ഈ പേരിൽ അക്കൗണ്ട് കണ്ടെത്തിയില്ല.", checkFailed: "പരിശോധിക്കാൻ കഴിഞ്ഞില്ല.",
    loginFailed: "ലോഗിൻ പരാജയപ്പെട്ടു.",
  },
  fr: {
    selectLang: "Sélectionnez votre langue", continue: "Continuer", back: "Retour",
    alreadyHaveAccount: "J'ai déjà un compte",
    privacyTitle: "Confidentialité et consentement", privacyDesc: "Veuillez vérifier comment nous traitons vos données",
    privacyIntro: "Nous collectons les données de conversation et d'analyse sanguine pour vous fournir des conseils de santé personnalisés.",
    b1: "Vos données sont pseudonymisées — liées à un identifiant aléatoire, pas à votre identité.",
    b2: "Les données opérationnelles sont automatiquement supprimées après 24 heures.",
    b3: "Les données anonymisées peuvent être conservées jusqu'à 18 mois pour améliorer la précision du chatbot.",
    b4: "Vous pouvez demander la suppression de toutes vos données à tout moment depuis votre profil.",
    b5: "Vos données ne sont jamais partagées avec des tiers.",
    b6: "Toutes les données sont chiffrées au repos (AES-256) et en transit (TLS).",
    consentCheckbox: "Je consens au traitement et à l'analyse de mes données anonymisées",
    iAgree: "J'accepte — Continuer",
    createProfile: "Créez votre profil anonyme", pickUsername: "Choisissez un nom d'utilisateur",
    shuffle: "Mélanger", pickAvatar: "Choisissez un avatar",
    secureTitle: "Sécurisez votre compte", secureDesc: "Créez une phrase de passe pour protéger votre session anonyme.",
    passphrasePlaceholder: "Créer une phrase de passe (min. 8 caractères)", confirmPassphrase: "Confirmer la phrase de passe",
    secureBtn: "Sécuriser avec phrase de passe", skipSecurity: "Passer pour l'instant (moins sécurisé)",
    welcomeBack: "Bienvenue", enterUsername: "Entrez votre nom d'utilisateur pour accéder à votre session",
    yourUsername: "Votre nom d'utilisateur", signIn: "Se connecter",
    tryDifferent: "Essayer un autre nom", newAccount: "Créer un nouveau compte",
    loggingInAs: "Connexion en tant que", enterPassphrase: "Entrez votre phrase de passe",
    noPassphrase: "Ce compte n'a pas de phrase de passe. Veuillez créer un nouveau compte.",
    badge1: "Anonymat de bout en bout", badge2: "Pas d'email requis", badge3: "Supprimé en 24h",
    subtitle: "Votre parcours de fertilité, totalement privé",
    passphraseMinErr: "La phrase de passe doit contenir au moins 8 caractères.",
    passphraseMismatch: "Les phrases de passe ne correspondent pas.",
    regFailed: "Inscription échouée — veuillez réessayer.",
    noAccount: "Aucun compte trouvé avec ce nom.", checkFailed: "Vérification impossible. Réessayez.",
    loginFailed: "Échec de la connexion.",
  },
  pt: {
    selectLang: "Selecione seu idioma", continue: "Continuar", back: "Voltar",
    alreadyHaveAccount: "Já tenho uma conta",
    privacyTitle: "Privacidade e consentimento", privacyDesc: "Veja como lidamos com seus dados",
    privacyIntro: "Coletamos dados de conversa e análise sanguínea para fornecer orientação de saúde personalizada.",
    b1: "Seus dados são pseudonimizados — vinculados a um ID aleatório, não à sua identidade.",
    b2: "Dados operacionais são excluídos automaticamente após 24 horas.",
    b3: "Dados anonimizados podem ser mantidos por até 18 meses para melhorar a precisão do chatbot.",
    b4: "Você pode solicitar a exclusão de todos os seus dados a qualquer momento no seu perfil.",
    b5: "Seus dados nunca são compartilhados com terceiros.",
    b6: "Todos os dados são criptografados em repouso (AES-256) e em trânsito (TLS).",
    consentCheckbox: "Consinto com o processamento e análise dos meus dados anonimizados",
    iAgree: "Concordo — Continuar",
    createProfile: "Crie seu perfil anônimo", pickUsername: "Escolha um nome de usuário",
    shuffle: "Embaralhar", pickAvatar: "Escolha um avatar",
    secureTitle: "Proteja sua conta", secureDesc: "Crie uma frase-senha para proteger sua sessão anônima.",
    passphrasePlaceholder: "Criar frase-senha (mín. 8 caracteres)", confirmPassphrase: "Confirmar frase-senha",
    secureBtn: "Proteger com frase-senha", skipSecurity: "Pular por enquanto (menos seguro)",
    welcomeBack: "Bem-vindo de volta", enterUsername: "Digite seu nome de usuário para acessar sua sessão",
    yourUsername: "Seu nome de usuário", signIn: "Entrar",
    tryDifferent: "Tentar outro nome", newAccount: "Criar uma nova conta",
    loggingInAs: "Entrando como", enterPassphrase: "Digite sua frase-senha",
    noPassphrase: "Esta conta não tem frase-senha. Crie uma nova conta.",
    badge1: "Anonimato ponta a ponta", badge2: "Sem email necessário", badge3: "Excluído em 24h",
    subtitle: "Sua jornada de fertilidade, totalmente privada",
    passphraseMinErr: "A frase-senha deve ter pelo menos 8 caracteres.",
    passphraseMismatch: "As frases-senha não coincidem.",
    regFailed: "Registro falhou — tente novamente.",
    noAccount: "Nenhuma conta encontrada com este nome.", checkFailed: "Não foi possível verificar. Tente novamente.",
    loginFailed: "Falha no login.",
  },
};

type Step = "language" | "consent" | "registration" | "security" | "login";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("language");
  const [selectedLang, setSelectedLang] = useState<string | null>(null);
  const [usernames, setUsernames] = useState<string[]>([]);
  const [avatarUrls, setAvatarUrls] = useState<string[]>([]);
  const [selectedUsername, setSelectedUsername] = useState<string | null>(null);
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [shuffling, setShuffling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Security step
  const [passphrase, setPassphrase] = useState("");
  const [passphraseConfirm, setPassphraseConfirm] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);

  // Consent step
  const [consent, setConsent] = useState(false);

  // Login flow
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassphrase, setLoginPassphrase] = useState("");
  const [loginAuthInfo, setLoginAuthInfo] = useState<{ hasPasskey: boolean; hasPassphrase: boolean } | null>(null);
  const [loginStep, setLoginStep] = useState<"username" | "auth">("username");

  useEffect(() => {
    if (step !== "registration") return;
    let cancelled = false;
    setLoading(true);
    fetchRegisterOptions()
      .then((data) => {
        if (!cancelled) {
          setUsernames(data.usernames);
          setAvatarUrls(data.avatarUrls);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUsernames(FALLBACK_USERNAMES);
          setAvatarUrls(FALLBACK_AVATARS);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [step]);

  const handleLanguageContinue = () => {
    if (!selectedLang) return;
    localStorage.setItem("izana_language", selectedLang);
    setStep("consent");
  };

  const t = (key: string) => T[selectedLang || "en"]?.[key] || T.en[key] || key;

  const handleConsentContinue = () => {
    if (!consent) return;
    setStep("registration");
  };

  const handleShuffleNames = async () => {
    setShuffling(true);
    setError(null);
    setSelectedUsername(null);
    try {
      const data = await fetchRegisterOptions();
      setUsernames(data.usernames);
    } catch {
      setUsernames((prev) => [...prev].sort(() => Math.random() - 0.5));
    } finally {
      setShuffling(false);
    }
  };

  const handleRegistrationContinue = () => {
    if (!selectedUsername || !selectedAvatar) return;
    setStep("security");
  };

  const handlePassphraseRegister = async () => {
    if (!selectedUsername || !selectedAvatar) return;
    if (passphrase.length < 8) {
      setError(t("passphraseMinErr"));
      return;
    }
    if (passphrase !== passphraseConfirm) {
      setError(t("passphraseMismatch"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { token, user } = await registerAnonymous({
        username: selectedUsername,
        avatarUrl: selectedAvatar,
        passphrase,
      });
      localStorage.setItem("izana_token", token);
      localStorage.setItem("izana_user", JSON.stringify(user));
      await grantConsent({ healthDataConsent: consent, modelTrainingConsent: consent }).catch(() => {});
      router.push("/chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("regFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkipSecurity = async () => {
    if (!selectedUsername || !selectedAvatar) return;
    setSubmitting(true);
    setError(null);
    try {
      const { token, user } = await registerAnonymous({
        username: selectedUsername,
        avatarUrl: selectedAvatar,
      });
      localStorage.setItem("izana_token", token);
      localStorage.setItem("izana_user", JSON.stringify(user));
      await grantConsent({ healthDataConsent: consent, modelTrainingConsent: consent }).catch(() => {});
      router.push("/chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("regFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  // Login handlers
  const handleLoginCheckUsername = async () => {
    if (!loginUsername.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const info = await checkAuthMethods(loginUsername.trim());
      if (!info.exists) {
        setError(t("noAccount"));
      } else {
        setLoginAuthInfo(info);
        setLoginStep("auth");
      }
    } catch {
      setError(t("checkFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleLoginPassphrase = async () => {
    if (!loginPassphrase) return;
    setSubmitting(true);
    setError(null);
    try {
      const { token, user } = await loginWithPassphrase(loginUsername.trim(), loginPassphrase);
      localStorage.setItem("izana_token", token);
      localStorage.setItem("izana_user", JSON.stringify(user));
      localStorage.setItem("izana_language", selectedLang || "en");
      router.push("/chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loginFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const displayUsernames = usernames.length > 0 ? usernames : FALLBACK_USERNAMES;
  const displayAvatars = avatarUrls.length > 0 ? avatarUrls : FALLBACK_AVATARS;

  return (
    <div className="min-h-screen bg-izana-light dark:bg-izana-dark flex flex-col items-center p-6 antialiased">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-2xl w-full"
      >
        <img
          src="/logo.png"
          alt="Izana AI"
          className="h-16 md:h-20 object-contain mx-auto mb-4 dark:invert"
        />
        <p className="text-center text-sm text-izana-primary dark:text-izana-teal font-medium mb-6 tracking-wide">
          {t("subtitle")}
        </p>

        {/* Privacy badges */}
        <div className="flex justify-center gap-3 mb-8 flex-wrap">
          {[t("badge1"), t("badge2"), t("badge3")].map((badge) => (
            <span
              key={badge}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-izana-teal/10 text-izana-primary dark:text-izana-teal border border-izana-teal/20"
            >
              <Shield className="w-3 h-3" />
              {badge}
            </span>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* Step 1: Language */}
          {step === "language" && (
            <motion.div
              key="language"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <p className="text-sm font-bold text-izana-primary dark:text-izana-teal uppercase tracking-widest mb-2 text-center">
                {t("selectLang")}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 mb-6">
                {LANGUAGES.map((lang, i) => (
                  <motion.button
                    key={lang.code}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setSelectedLang(lang.code)}
                    className={`p-5 rounded-2xl shadow-sm border-2 transition-all flex flex-col items-center gap-2 ${
                      selectedLang === lang.code
                        ? "bg-izana-primary text-white border-izana-primary dark:bg-izana-teal dark:text-izana-dark dark:border-izana-teal"
                        : "bg-white dark:bg-[#2a2a2a] border-gray-200 dark:border-[#404040] text-izana-dark dark:text-izana-light hover:border-izana-primary/50 dark:hover:border-izana-teal/50"
                    }`}
                  >
                    <span className="text-3xl">{lang.flag}</span>
                    <span className="font-semibold text-[15px]">{lang.label}</span>
                  </motion.button>
                ))}
              </div>
              <button
                onClick={handleLanguageContinue}
                disabled={!selectedLang}
                className="w-full py-4 rounded-2xl font-bold text-lg text-white bg-izana-coral disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              >
                {t("continue")}
              </button>
              <button
                onClick={() => { setStep("login"); setError(null); }}
                className="w-full mt-3 py-3 rounded-2xl font-medium text-sm text-izana-primary dark:text-izana-teal border-2 border-izana-primary/20 dark:border-izana-teal/20 hover:bg-izana-primary/5 dark:hover:bg-izana-teal/5 transition-all"
              >
                {t("alreadyHaveAccount")}
              </button>
            </motion.div>
          )}

          {/* Step 1b: Consent */}
          {step === "consent" && (
            <motion.div
              key="consent"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              <div className="text-center mb-4">
                <div className="inline-flex p-3 bg-izana-teal/10 rounded-full mb-3">
                  <Shield className="w-8 h-8 text-izana-primary dark:text-izana-teal" />
                </div>
                <h1 className="text-xl md:text-2xl font-bold text-izana-dark dark:text-izana-light">
                  {t("privacyTitle")}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  {t("privacyDesc")}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white dark:bg-[#2a2a2a] border border-gray-200 dark:border-[#404040] text-sm text-gray-600 dark:text-gray-300 space-y-2">
                <p>{t("privacyIntro")}</p>
                <ul className="list-disc pl-5 space-y-1 text-xs">
                  <li>{t("b1")}</li>
                  <li>{t("b2")}</li>
                  <li>{t("b3")}</li>
                  <li>{t("b4")}</li>
                  <li>{t("b5")}</li>
                  <li>{t("b6")}</li>
                </ul>
              </div>

              <label className="flex items-start gap-3 p-4 rounded-2xl border-2 border-gray-200 dark:border-[#404040] bg-white dark:bg-[#2a2a2a] cursor-pointer hover:border-izana-primary/50 dark:hover:border-izana-teal/50 transition-all">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 w-5 h-5 accent-izana-coral flex-shrink-0"
                />
                <span className="text-sm text-izana-dark dark:text-izana-light">
                  {t("consentCheckbox")} <span className="text-red-500">*</span>
                </span>
              </label>

              <button
                onClick={handleConsentContinue}
                disabled={!consent}
                className="w-full py-4 rounded-2xl font-bold text-lg text-white bg-izana-coral disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              >
                {t("iAgree")}
              </button>
              <button
                onClick={() => { setStep("language"); setError(null); }}
                className="w-full py-2 text-sm text-gray-500 hover:text-izana-primary dark:hover:text-izana-teal transition-colors"
              >
                {t("back")}
              </button>
            </motion.div>
          )}

          {/* Step 2: Registration (username + avatar) */}
          {step === "registration" && (
            <motion.div
              key="registration"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              {loading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="w-10 h-10 animate-spin text-izana-primary dark:text-izana-teal" />
                </div>
              ) : (
                <>
                  <h1 className="text-xl md:text-2xl font-bold text-izana-dark dark:text-izana-light text-center mb-6">
                    {t("createProfile")}
                  </h1>

                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-izana-primary dark:text-izana-teal uppercase tracking-widest">
                      {t("pickUsername")}
                    </p>
                    <button
                      onClick={handleShuffleNames}
                      disabled={shuffling}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium bg-white dark:bg-[#2a2a2a] border border-gray-200 dark:border-[#404040] hover:border-izana-primary/50 dark:hover:border-izana-teal/50 transition-all disabled:opacity-50"
                    >
                      {shuffling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shuffle className="w-4 h-4" />}
                      {t("shuffle")}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
                    {displayUsernames.map((name, i) => (
                      <motion.button
                        key={name}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setSelectedUsername(name)}
                        className={`py-4 px-6 rounded-2xl font-bold text-lg transition-all border-2 ${
                          selectedUsername === name
                            ? "bg-izana-primary text-white border-izana-primary dark:bg-izana-teal dark:text-izana-dark dark:border-izana-teal"
                            : "bg-white dark:bg-[#2a2a2a] text-izana-dark dark:text-izana-light border-gray-200 dark:border-[#404040] hover:border-izana-primary/50 dark:hover:border-izana-teal/50"
                        }`}
                      >
                        {name}
                      </motion.button>
                    ))}
                  </div>

                  <p className="text-xs font-bold text-izana-primary dark:text-izana-teal uppercase tracking-widest mb-3">
                    {t("pickAvatar")}
                  </p>
                  <div className="grid grid-cols-6 gap-3 mb-8 max-w-sm mx-auto">
                    {displayAvatars.map((url, i) => (
                      <motion.button
                        key={url}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.1 + i * 0.03 }}
                        whileHover={{ scale: 1.08 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setSelectedAvatar(url)}
                        className={`rounded-full overflow-hidden border-2 transition-all aspect-square ${
                          selectedAvatar === url
                            ? "border-izana-primary dark:border-izana-teal ring-2 ring-izana-primary/30 dark:ring-izana-teal/30"
                            : "border-transparent hover:border-izana-primary/40 dark:hover:border-izana-teal/40"
                        }`}
                      >
                        <img src={url} alt={`Avatar ${i + 1}`} className="w-full h-full object-cover" />
                      </motion.button>
                    ))}
                  </div>

                  {error && (
                    <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm text-center">
                      {error}
                    </div>
                  )}

                  <button
                    onClick={handleRegistrationContinue}
                    disabled={!selectedUsername || !selectedAvatar}
                    className="w-full py-4 rounded-2xl font-bold text-lg text-white bg-izana-coral disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                  >
                    {t("continue")}
                  </button>
                  <button
                    onClick={() => { setStep("consent"); setError(null); }}
                    className="w-full mt-2 py-2 text-sm text-gray-500 hover:text-izana-primary dark:hover:text-izana-teal transition-colors"
                  >
                    {t("back")}
                  </button>
                </>
              )}
            </motion.div>
          )}

          {/* Step 3: Security (passphrase) */}
          {step === "security" && (
            <motion.div
              key="security"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              <div className="text-center mb-6">
                <div className="inline-flex p-3 bg-izana-teal/10 rounded-full mb-3">
                  <Shield className="w-8 h-8 text-izana-primary dark:text-izana-teal" />
                </div>
                <h1 className="text-xl md:text-2xl font-bold text-izana-dark dark:text-izana-light">
                  {t("secureTitle")}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  {t("secureDesc")}
                </p>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm text-center">
                  {error}
                </div>
              )}

              <div className="p-5 rounded-2xl border-2 border-izana-primary/30 dark:border-izana-teal/30 bg-izana-primary/5 dark:bg-izana-teal/5 space-y-3">
                <div className="flex items-center gap-3">
                  <Lock className="w-5 h-5 text-izana-primary dark:text-izana-teal flex-shrink-0" />
                  <p className="font-bold text-izana-dark dark:text-izana-light text-sm">
                    {t("secureBtn")}
                  </p>
                </div>
                <div className="relative">
                  <input
                    type={showPassphrase ? "text" : "password"}
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder={t("passphrasePlaceholder")}
                    className="w-full px-4 py-3 pr-10 rounded-xl border border-gray-200 dark:border-[#404040] bg-white dark:bg-[#2a2a2a] text-sm focus:outline-none focus:ring-2 focus:ring-izana-primary/50 dark:focus:ring-izana-teal/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassphrase(!showPassphrase)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <input
                  type="password"
                  value={passphraseConfirm}
                  onChange={(e) => setPassphraseConfirm(e.target.value)}
                    placeholder={t("confirmPassphrase")}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-[#404040] bg-white dark:bg-[#2a2a2a] text-sm focus:outline-none focus:ring-2 focus:ring-izana-primary/50 dark:focus:ring-izana-teal/50"
                />
                <button
                  onClick={handlePassphraseRegister}
                  disabled={submitting || passphrase.length < 8 || passphrase !== passphraseConfirm}
                  className="w-full py-3 rounded-xl font-bold text-white bg-izana-coral disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t("secureBtn")}
                </button>
              </div>

              <button
                onClick={handleSkipSecurity}
                disabled={submitting}
                className="w-full py-3 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t("skipSecurity")}
              </button>
              <button
                onClick={() => { setStep("registration"); setError(null); }}
                className="w-full py-2 text-sm text-gray-500 hover:text-izana-primary dark:hover:text-izana-teal transition-colors"
              >
                {t("back")}
              </button>
            </motion.div>
          )}

          {/* Login flow */}
          {step === "login" && (
            <motion.div
              key="login"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              <div className="text-center mb-6">
                <h1 className="text-xl md:text-2xl font-bold text-izana-dark dark:text-izana-light">
                  {t("welcomeBack")}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  {t("enterUsername")}
                </p>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm text-center">
                  {error}
                </div>
              )}

              {loginStep === "username" && (
                <>
                  <input
                    type="text"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    placeholder={t("yourUsername")}
                    className="w-full px-4 py-4 rounded-2xl border-2 border-gray-200 dark:border-[#404040] bg-white dark:bg-[#2a2a2a] text-center text-lg font-bold focus:outline-none focus:ring-2 focus:ring-izana-primary/50 dark:focus:ring-izana-teal/50"
                    onKeyDown={(e) => e.key === "Enter" && handleLoginCheckUsername()}
                  />
                  <button
                    onClick={handleLoginCheckUsername}
                    disabled={submitting || !loginUsername.trim()}
                    className="w-full py-4 rounded-2xl font-bold text-lg text-white bg-izana-coral disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                  >
                    {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : t("continue")}
                  </button>
                </>
              )}

              {loginStep === "auth" && loginAuthInfo && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                    {t("loggingInAs")} <span className="font-bold text-izana-dark dark:text-izana-light">{loginUsername}</span>
                  </p>

                  {loginAuthInfo.hasPassphrase ? (
                    <div className="space-y-2">
                      <input
                        type="password"
                        value={loginPassphrase}
                        onChange={(e) => setLoginPassphrase(e.target.value)}
                        placeholder={t("enterPassphrase")}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-[#404040] bg-white dark:bg-[#2a2a2a] text-sm focus:outline-none focus:ring-2 focus:ring-izana-primary/50 dark:focus:ring-izana-teal/50"
                        onKeyDown={(e) => e.key === "Enter" && handleLoginPassphrase()}
                      />
                      <button
                        onClick={handleLoginPassphrase}
                        disabled={submitting || !loginPassphrase}
                        className="w-full py-3 rounded-xl font-bold text-white bg-izana-coral disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                      >
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t("signIn")}
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-center text-gray-400">
                      {t("noPassphrase")}
                    </p>
                  )}

                  <button
                    onClick={() => { setLoginStep("username"); setLoginAuthInfo(null); setError(null); }}
                    className="w-full py-2 text-sm text-gray-500 hover:text-izana-primary dark:hover:text-izana-teal transition-colors"
                  >
                    {t("tryDifferent")}
                  </button>
                </div>
              )}

              <button
                onClick={() => { setStep("language"); setError(null); setLoginStep("username"); setLoginAuthInfo(null); }}
                className="w-full py-2 text-sm text-gray-500 hover:text-izana-primary dark:hover:text-izana-teal transition-colors"
              >
                {t("newAccount")}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="mt-12 text-center text-[10px] text-izana-dark/40 dark:text-izana-light/40 uppercase tracking-widest font-semibold">
          &copy; 2026 Izana AI &bull; Secure &amp; Private
        </p>
      </motion.div>
    </div>
  );
}
