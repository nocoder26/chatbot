"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, MessageSquare, Eye, Trash2, Loader2, TestTube, AlertCircle, Shield } from "lucide-react";
import { Download, ShieldAlert } from "lucide-react";
import { fetchUserProfile, deleteChat, exportUserData, deleteUserData, type UserProfile } from "@/lib/api";

const PT: Record<string, Record<string, string>> = {
  en: { dashboard: "Your Private Dashboard", autoDelete: "All data auto-deleted in 24 hours", conversations: "Your Conversations", noChats: "No conversations in the last 24 hours.", startChat: "Start a new chat", bloodwork: "Your Bloodwork", noBloodwork: "No bloodwork reports in the last 24 hours.", uploadBloodwork: "Upload bloodwork in chat", uploaded: "Uploaded", dataRights: "Your Data Rights", gdprNote: "Under GDPR, you have the right to access, export, or delete all your data at any time.", downloadData: "Download My Data", deleteData: "Delete All My Data", deleteWarning: "This will permanently delete all your data including conversations, bloodwork reports, and account. This action cannot be undone.", confirmDelete: "Confirm Delete", deleting: "Deleting...", cancel: "Cancel", retry: "Retry", loadError: "Could not load your profile. The server may be starting up — please try again in a moment.", exportFailed: "Export failed. Please try again.", deleteFailed: "Deletion failed. Please try again.", inRange: "In Range", outOfRange: "Out of Range", newChat: "New chat" },
  es: { dashboard: "Tu panel privado", autoDelete: "Todos los datos se eliminan en 24 horas", conversations: "Tus conversaciones", noChats: "Sin conversaciones en las últimas 24 horas.", startChat: "Iniciar un nuevo chat", bloodwork: "Tus análisis de sangre", noBloodwork: "Sin informes de análisis en las últimas 24 horas.", uploadBloodwork: "Subir análisis en el chat", uploaded: "Subido", dataRights: "Tus derechos de datos", gdprNote: "Según el RGPD, tienes derecho a acceder, exportar o eliminar todos tus datos en cualquier momento.", downloadData: "Descargar mis datos", deleteData: "Eliminar todos mis datos", deleteWarning: "Esto eliminará permanentemente todos tus datos incluyendo conversaciones, análisis y cuenta. Esta acción no se puede deshacer.", confirmDelete: "Confirmar eliminación", deleting: "Eliminando...", cancel: "Cancelar", retry: "Reintentar", loadError: "No se pudo cargar tu perfil. Inténtalo de nuevo.", exportFailed: "Exportación fallida.", deleteFailed: "Eliminación fallida.", inRange: "En rango", outOfRange: "Fuera de rango", newChat: "Nueva conversación" },
  ja: { dashboard: "プライベートダッシュボード", autoDelete: "全データは24時間で自動削除", conversations: "会話", noChats: "過去24時間に会話はありません。", startChat: "新しいチャットを開始", bloodwork: "血液検査", noBloodwork: "過去24時間に血液検査レポートはありません。", uploadBloodwork: "チャットで血液検査をアップロード", uploaded: "アップロード済み", dataRights: "データの権利", gdprNote: "GDPRに基づき、いつでもデータのアクセス、エクスポート、削除を要求できます。", downloadData: "データをダウンロード", deleteData: "すべてのデータを削除", deleteWarning: "会話、血液検査レポート、アカウントを含むすべてのデータが完全に削除されます。この操作は取り消せません。", confirmDelete: "削除を確認", deleting: "削除中...", cancel: "キャンセル", retry: "再試行", loadError: "プロフィールを読み込めませんでした。", exportFailed: "エクスポートに失敗しました。", deleteFailed: "削除に失敗しました。", inRange: "正常範囲内", outOfRange: "範囲外", newChat: "新しいチャット" },
  hi: { dashboard: "आपका निजी डैशबोर्ड", autoDelete: "सभी डेटा 24 घंटे में स्वतः हटाया जाता है", conversations: "आपकी बातचीत", noChats: "पिछले 24 घंटों में कोई बातचीत नहीं।", startChat: "नई चैट शुरू करें", bloodwork: "आपकी रक्त जांच", noBloodwork: "पिछले 24 घंटों में कोई रक्त जांच रिपोर्ट नहीं।", uploadBloodwork: "चैट में रक्त जांच अपलोड करें", uploaded: "अपलोड किया गया", dataRights: "आपके डेटा अधिकार", gdprNote: "GDPR के तहत, आपको किसी भी समय अपने डेटा तक पहुंचने, निर्यात करने या हटाने का अधिकार है।", downloadData: "मेरा डेटा डाउनलोड करें", deleteData: "मेरा सारा डेटा हटाएं", deleteWarning: "यह आपकी सभी बातचीत, रक्त जांच रिपोर्ट और खाते सहित सभी डेटा स्थायी रूप से हटा देगा।", confirmDelete: "हटाने की पुष्टि करें", deleting: "हटा रहे हैं...", cancel: "रद्द करें", retry: "पुनः प्रयास करें", loadError: "प्रोफ़ाइल लोड नहीं हो सका।", exportFailed: "निर्यात विफल।", deleteFailed: "हटाना विफल।", inRange: "सामान्य सीमा में", outOfRange: "सीमा से बाहर", newChat: "नई चैट" },
  ta: { dashboard: "உங்கள் தனிப்பட்ட டாஷ்போர்டு", autoDelete: "அனைத்து தரவும் 24 மணிநேரத்தில் நீக்கப்படும்", conversations: "உங்கள் உரையாடல்கள்", noChats: "கடந்த 24 மணிநேரத்தில் உரையாடல்கள் இல்லை.", startChat: "புதிய அரட்டையைத் தொடங்கு", bloodwork: "உங்கள் இரத்தப் பரிசோதனை", noBloodwork: "கடந்த 24 மணிநேரத்தில் இரத்தப் பரிசோதனை அறிக்கைகள் இல்லை.", uploadBloodwork: "அரட்டையில் இரத்தப் பரிசோதனையைப் பதிவேற்றவும்", uploaded: "பதிவேற்றப்பட்டது", dataRights: "உங்கள் தரவு உரிமைகள்", gdprNote: "GDPR இன் கீழ், உங்கள் தரவை அணுக, ஏற்றுமதி செய்ய அல்லது நீக்க உரிமை உண்டு.", downloadData: "தரவைப் பதிவிறக்கு", deleteData: "எல்லா தரவையும் நீக்கு", deleteWarning: "இது உரையாடல்கள், அறிக்கைகள் மற்றும் கணக்கு உள்ளிட்ட அனைத்து தரவையும் நிரந்தரமாக நீக்கும்.", confirmDelete: "நீக்குதலை உறுதிப்படுத்து", deleting: "நீக்குகிறது...", cancel: "ரத்துசெய்", retry: "மீண்டும் முயற்சி", loadError: "சுயவிவரத்தை ஏற்ற முடியவில்லை.", exportFailed: "ஏற்றுமதி தோல்வி.", deleteFailed: "நீக்குதல் தோல்வி.", inRange: "இயல்பான வரம்பில்", outOfRange: "வரம்புக்கு வெளியே", newChat: "புதிய அரட்டை" },
  te: { dashboard: "మీ ప్రైవేట్ డ్యాష్‌బోర్డ్", autoDelete: "మొత్తం డేటా 24 గంటల్లో తొలగించబడుతుంది", conversations: "మీ సంభాషణలు", noChats: "గత 24 గంటల్లో సంభాషణలు లేవు.", startChat: "కొత్త చాట్ ప్రారంభించండి", bloodwork: "మీ రక్త పరీక్ష", noBloodwork: "గత 24 గంటల్లో రక్త పరీక్ష నివేదికలు లేవు.", uploadBloodwork: "చాట్‌లో రక్త పరీక్ష అప్‌లోడ్ చేయండి", uploaded: "అప్‌లోడ్ చేయబడింది", dataRights: "మీ డేటా హక్కులు", gdprNote: "GDPR ప్రకారం, మీ డేటాను ఏ సమయంలోనైనా యాక్సెస్ చేయడం, ఎగుమతి చేయడం లేదా తొలగించడం మీ హక్కు.", downloadData: "డేటా డౌన్‌లోడ్", deleteData: "మొత్తం డేటా తొలగించు", deleteWarning: "ఇది సంభాషణలు, నివేదికలు మరియు ఖాతాతో సహా మొత్తం డేటాను శాశ్వతంగా తొలగిస్తుంది.", confirmDelete: "తొలగింపు నిర్ధారించు", deleting: "తొలగిస్తోంది...", cancel: "రద్దు", retry: "మళ్ళీ ప్రయత్నించు", loadError: "ప్రొఫైల్ లోడ్ చేయడం సాధ్యపడలేదు.", exportFailed: "ఎగుమతి విఫలం.", deleteFailed: "తొలగింపు విఫలం.", inRange: "సాధారణ పరిధిలో", outOfRange: "పరిధి బయట", newChat: "కొత్త చాట్" },
  ml: { dashboard: "നിങ്ങളുടെ സ്വകാര്യ ഡാഷ്ബോർഡ്", autoDelete: "എല്ലാ ഡാറ്റയും 24 മണിക്കൂറിൽ ഇല്ലാതാക്കും", conversations: "നിങ്ങളുടെ സംഭാഷണങ്ങൾ", noChats: "കഴിഞ്ഞ 24 മണിക്കൂറിൽ സംഭാഷണങ്ങളില്ല.", startChat: "പുതിയ ചാറ്റ് ആരംഭിക്കുക", bloodwork: "നിങ്ങളുടെ രക്ത പരിശോധന", noBloodwork: "കഴിഞ്ഞ 24 മണിക്കൂറിൽ റിപ്പോർട്ടുകളില്ല.", uploadBloodwork: "ചാറ്റിൽ രക്ത പരിശോധന അപ്‌ലോഡ് ചെയ്യുക", uploaded: "അപ്‌ലോഡ് ചെയ്തു", dataRights: "നിങ്ങളുടെ ഡാറ്റ അവകാശങ്ങൾ", gdprNote: "GDPR പ്രകാരം, നിങ്ങളുടെ ഡാറ്റ ആക്‌സസ് ചെയ്യാനും എക്‌സ്‌പോർട്ട് ചെയ്യാനും ഇല്ലാതാക്കാനും നിങ്ങൾക്ക് അവകാശമുണ്ട്.", downloadData: "ഡാറ്റ ഡൗൺലോഡ്", deleteData: "എല്ലാ ഡാറ്റയും ഇല്ലാതാക്കുക", deleteWarning: "ഇത് സംഭാഷണങ്ങൾ, റിപ്പോർട്ടുകൾ, അക്കൗണ്ട് ഉൾപ്പെടെ എല്ലാ ഡാറ്റയും ശാശ്വതമായി ഇല്ലാതാക്കും.", confirmDelete: "ഇല്ലാതാക്കൽ സ്ഥിരീകരിക്കുക", deleting: "ഇല്ലാതാക്കുന്നു...", cancel: "റദ്ദാക്കുക", retry: "വീണ്ടും ശ്രമിക്കുക", loadError: "പ്രൊഫൈൽ ലോഡ് ചെയ്യാൻ കഴിഞ്ഞില്ല.", exportFailed: "എക്‌സ്‌പോർട്ട് പരാജയപ്പെട്ടു.", deleteFailed: "ഇല്ലാതാക്കൽ പരാജയപ്പെട്ടു.", inRange: "സാധാരണ പരിധിയിൽ", outOfRange: "പരിധിക്ക് പുറത്ത്", newChat: "പുതിയ ചാറ്റ്" },
  fr: { dashboard: "Votre tableau de bord privé", autoDelete: "Toutes les données supprimées en 24 heures", conversations: "Vos conversations", noChats: "Aucune conversation dans les dernières 24 heures.", startChat: "Démarrer une conversation", bloodwork: "Vos analyses sanguines", noBloodwork: "Aucun rapport d'analyse dans les dernières 24 heures.", uploadBloodwork: "Télécharger une analyse dans le chat", uploaded: "Téléchargé le", dataRights: "Vos droits sur les données", gdprNote: "Conformément au RGPD, vous avez le droit d'accéder, d'exporter ou de supprimer vos données à tout moment.", downloadData: "Télécharger mes données", deleteData: "Supprimer toutes mes données", deleteWarning: "Cela supprimera définitivement toutes vos données, y compris les conversations, rapports et compte.", confirmDelete: "Confirmer la suppression", deleting: "Suppression...", cancel: "Annuler", retry: "Réessayer", loadError: "Impossible de charger votre profil.", exportFailed: "Échec de l'export.", deleteFailed: "Échec de la suppression.", inRange: "Dans la norme", outOfRange: "Hors norme", newChat: "Nouvelle conversation" },
  pt: { dashboard: "Seu painel privado", autoDelete: "Todos os dados excluídos em 24 horas", conversations: "Suas conversas", noChats: "Sem conversas nas últimas 24 horas.", startChat: "Iniciar uma conversa", bloodwork: "Seus exames de sangue", noBloodwork: "Sem relatórios de exames nas últimas 24 horas.", uploadBloodwork: "Enviar exame no chat", uploaded: "Enviado em", dataRights: "Seus direitos de dados", gdprNote: "De acordo com o RGPD, você tem o direito de acessar, exportar ou excluir seus dados a qualquer momento.", downloadData: "Baixar meus dados", deleteData: "Excluir todos os meus dados", deleteWarning: "Isso excluirá permanentemente todos os seus dados, incluindo conversas, relatórios e conta.", confirmDelete: "Confirmar exclusão", deleting: "Excluindo...", cancel: "Cancelar", retry: "Tentar novamente", loadError: "Não foi possível carregar seu perfil.", exportFailed: "Falha na exportação.", deleteFailed: "Falha na exclusão.", inRange: "Dentro da faixa", outOfRange: "Fora da faixa", newChat: "Nova conversa" },
};

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [gdprAction, setGdprAction] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [lang] = useState(() => (typeof window !== "undefined" ? localStorage.getItem("izana_language") : null) || "en");
  const pt = (key: string) => PT[lang]?.[key] || PT.en[key] || key;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const token = localStorage.getItem("izana_token");
        const userStr = localStorage.getItem("izana_user");
        const user = userStr ? JSON.parse(userStr) : null;
        if (!token || !user?.username) {
          localStorage.removeItem("izana_token");
          localStorage.removeItem("izana_user");
          localStorage.removeItem("izana_language");
          router.push("/");
          return;
        }
        const data = await fetchUserProfile(user.username);
        if (!cancelled) setProfile(data);
      } catch (err) {
        console.error("Profile load error:", err);
        if (!cancelled) {
          setError(PT[lang]?.loadError || PT.en.loadError);
          setProfile(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [router]);

  const handleDeleteChat = async (chatId: string) => {
    if (!profile?.user?.username) return;
    setDeletingId(chatId);
    try {
      await deleteChat(profile.user.username, chatId);
      setProfile((p) =>
        p ? { ...p, chats: p.chats.filter((c) => c.id !== chatId) } : null
      );
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleViewChat = (chatId: string) => {
    router.push(`/chat?chatId=${chatId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-izana-light dark:bg-izana-dark flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-izana-primary dark:text-izana-teal" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-izana-light dark:bg-izana-dark">
      <header className="flex items-center gap-4 px-4 py-3 border-b border-black/5 dark:border-white/5 bg-white/50 dark:bg-white/5 backdrop-blur-sm">
        <button
          onClick={() => router.push("/chat")}
          className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-izana-dark dark:text-izana-light">
            {pt("dashboard")}
          </h1>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Shield className="w-3 h-3 text-izana-teal" />
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">
              {pt("autoDelete")}
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-6 space-y-10">
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl"
          >
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-amber-700 dark:text-amber-300">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="text-xs font-bold text-amber-600 dark:text-amber-400 mt-1 hover:underline"
              >
                {pt("retry")}
              </button>
            </div>
          </motion.div>
        )}

        {/* Your Conversations */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-5 h-5 text-izana-primary dark:text-izana-teal" />
            <h2 className="text-lg font-bold text-izana-dark dark:text-izana-light">
              {pt("conversations")}
            </h2>
          </div>
          {!profile?.chats?.length ? (
            <div className="p-6 bg-white dark:bg-[#2a2a2a] rounded-2xl border border-black/5 dark:border-white/5 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {pt("noChats")}
              </p>
              <button
                onClick={() => router.push("/chat")}
                className="mt-3 text-sm font-bold text-izana-primary dark:text-izana-teal hover:underline"
              >
                {pt("startChat")}
              </button>
            </div>
          ) : (
            <ul className="space-y-3">
              {profile.chats.map((chat) => (
                <motion.li
                  key={chat.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between p-4 bg-white dark:bg-[#2a2a2a] rounded-2xl border border-black/5 dark:border-white/5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-izana-dark dark:text-izana-light truncate">
                      {chat.title === "New chat" ? pt("newChat") : chat.title}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(chat.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0 ml-3">
                    <button
                      onClick={() => handleViewChat(chat.id)}
                      className="p-2 rounded-xl bg-izana-primary/10 dark:bg-izana-teal/10 text-izana-primary dark:text-izana-teal hover:opacity-80"
                      aria-label="View"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteChat(chat.id)}
                      disabled={deletingId === chat.id}
                      className="p-2 rounded-xl bg-red-500/10 text-red-500 hover:opacity-80 disabled:opacity-50"
                      aria-label="Delete"
                    >
                      {deletingId === chat.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </motion.li>
              ))}
            </ul>
          )}
        </section>

        {/* Your Bloodwork */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <TestTube className="w-5 h-5 text-izana-primary dark:text-izana-teal" />
            <h2 className="text-lg font-bold text-izana-dark dark:text-izana-light">
              {pt("bloodwork")}
            </h2>
          </div>
          {!profile?.bloodwork?.length ? (
            <div className="p-6 bg-white dark:bg-[#2a2a2a] rounded-2xl border border-black/5 dark:border-white/5 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {pt("noBloodwork")}
              </p>
              <button
                onClick={() => router.push("/chat")}
                className="mt-3 text-sm font-bold text-izana-primary dark:text-izana-teal hover:underline"
              >
                {pt("uploadBloodwork")}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {profile.bloodwork.map((report) => (
                <motion.div
                  key={report.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-white dark:bg-[#2a2a2a] rounded-2xl border border-black/5 dark:border-white/5"
                >
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    {pt("uploaded")} {new Date(report.createdAt).toLocaleString()}
                  </p>
                  {report.summary && (
                    <p className="text-sm text-izana-dark dark:text-izana-light mb-4 italic border-l-2 border-izana-primary/30 dark:border-izana-teal/30 pl-3">
                      {report.summary}
                    </p>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {(report.results as { name: string; value: string; unit: string; status?: string }[]).map(
                      (r, i) => (
                        <div
                          key={i}
                          className={`p-3 rounded-xl font-medium text-sm ${
                            r.status === "Out of Range"
                              ? "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
                              : "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20"
                          }`}
                        >
                          <p className="font-bold">{r.name}</p>
                          <p className="text-base">{r.value} {r.unit}</p>
                          <p className="text-xs opacity-80 mt-0.5">
                            {r.status === "Out of Range" ? pt("outOfRange") : pt("inRange")}
                          </p>
                        </div>
                      )
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </section>

        {/* GDPR Data Rights */}
        <section className="mt-8 p-5 rounded-2xl bg-white dark:bg-[#2a2a2a] border border-black/5 dark:border-white/5">
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert className="w-5 h-5 text-izana-primary dark:text-izana-teal" />
            <h2 className="text-sm font-bold text-izana-dark dark:text-izana-light uppercase tracking-widest">
              {pt("dataRights")}
            </h2>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            {pt("gdprNote")}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={async () => {
                setGdprAction("export");
                try {
                  const blob = await exportUserData();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "izana-data-export.json";
                  a.click();
                  URL.revokeObjectURL(url);
                } catch {
                  alert(pt("exportFailed"));
                } finally {
                  setGdprAction(null);
                }
              }}
              disabled={gdprAction === "export"}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-izana-primary/10 text-izana-primary dark:bg-izana-teal/10 dark:text-izana-teal hover:bg-izana-primary/20 dark:hover:bg-izana-teal/20 transition-colors disabled:opacity-50"
            >
              {gdprAction === "export" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {pt("downloadData")}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              {pt("deleteData")}
            </button>
          </div>

          {showDeleteConfirm && (
            <div className="mt-4 p-4 rounded-xl border-2 border-red-500/30 bg-red-50 dark:bg-red-900/10">
              <p className="text-sm text-red-700 dark:text-red-300 font-medium mb-3">
                {pt("deleteWarning")}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    setGdprAction("delete");
                    try {
                      await deleteUserData();
                      localStorage.removeItem("izana_token");
                      localStorage.removeItem("izana_user");
                      localStorage.removeItem("izana_language");
                      router.push("/");
                    } catch {
                      alert(pt("deleteFailed"));
                      setGdprAction(null);
                    }
                  }}
                  disabled={gdprAction === "delete"}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {gdprAction === "delete" ? pt("deleting") : pt("confirmDelete")}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  {pt("cancel")}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
