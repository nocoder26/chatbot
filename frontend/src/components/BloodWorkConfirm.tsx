import React, { useState, useMemo } from "react";
import { Trash2, Plus, X, AlertCircle, Check } from "lucide-react";
import { type LabResult } from "@/lib/api";

interface FertilityMarker {
  name: string;
  unit: string;
}

interface BloodWorkConfirmProps {
  initialData: { results: LabResult[] };
  onConfirm: (data: { results: LabResult[]; treatment: string }) => void;
  onCancel: () => void;
  lang?: string;
}

const BWC_T: Record<string, Record<string, string>> = {
  en: { reviewTitle: "Review Lab Results", reviewDesc: "Confirm the extracted data or add missing fertility markers below.", currentTreatment: "Current Treatment", optional: "(optional)", recommended: "Recommended Additions", extracted: "Extracted Tests", addCustom: "Add Custom", noData: "No data found in PDF. Add markers manually above.", testName: "Test Name", unit: "Unit", confirm: "Confirm & Start Analysis", notInTreatment: "Not currently in treatment", other: "Other", ovulationInduction: "Ovulation Induction", eggFreezing: "Egg Freezing" },
  ta: { reviewTitle: "ஆய்வக முடிவுகளை சரிபார்க்கவும்", reviewDesc: "பிரித்தெடுக்கப்பட்ட தரவை உறுதிப்படுத்தவும் அல்லது விடுபட்ட குறிப்பான்களைச் சேர்க்கவும்.", currentTreatment: "தற்போதைய சிகிச்சை", optional: "(விருப்பத்தேர்வு)", recommended: "பரிந்துரைக்கப்பட்ட சேர்த்தல்கள்", extracted: "பிரித்தெடுக்கப்பட்ட சோதனைகள்", addCustom: "தனிப்பயன் சேர்", noData: "PDF இல் தரவு இல்லை. குறிப்பான்களை கைமுறையாக சேர்க்கவும்.", testName: "பரிசோதனை", unit: "அலகு", confirm: "உறுதிப்படுத்து & பகுப்பாய்வு", notInTreatment: "சிகிச்சையில் இல்லை", other: "மற்றவை", ovulationInduction: "கருமுட்டை தூண்டுதல்", eggFreezing: "முட்டை உறைவிப்பு" },
  hi: { reviewTitle: "लैब रिपोर्ट की समीक्षा", reviewDesc: "निकाले गए डेटा की पुष्टि करें या लापता मार्कर जोड़ें।", currentTreatment: "वर्तमान उपचार", optional: "(वैकल्पिक)", recommended: "अनुशंसित जोड़", extracted: "निकाले गए परीक्षण", addCustom: "कस्टम जोड़ें", noData: "PDF में डेटा नहीं मिला। मार्कर मैनुअली जोड़ें।", testName: "परीक्षण नाम", unit: "इकाई", confirm: "पुष्टि करें और विश्लेषण शुरू करें", notInTreatment: "उपचार में नहीं", other: "अन्य", ovulationInduction: "ओव्यूलेशन इंडक्शन", eggFreezing: "एग फ्रीजिंग" },
  te: { reviewTitle: "ల్యాబ్ ఫలితాలను సమీక్షించండి", reviewDesc: "సేకరించిన డేటాను ధృవీకరించండి లేదా తప్పిపోయిన మార్కర్‌లను జోడించండి.", currentTreatment: "ప్రస్తుత చికిత్స", optional: "(ఐచ్ఛికం)", recommended: "సిఫార్సు చేసిన చేర్పులు", extracted: "సేకరించిన పరీక్షలు", addCustom: "అనుకూల జోడింపు", noData: "PDF లో డేటా లేదు. మార్కర్‌లను మాన్యువల్‌గా జోడించండి.", testName: "పరీక్ష పేరు", unit: "యూనిట్", confirm: "ధృవీకరించి విశ్లేషణ ప్రారంభించండి", notInTreatment: "చికిత్సలో లేరు", other: "ఇతరం", ovulationInduction: "అండోత్సర్గ ప్రేరణ", eggFreezing: "ఎగ్ ఫ్రీజింగ్" },
  ml: { reviewTitle: "ലാബ് ഫലങ്ങൾ അവലോകനം ചെയ്യുക", reviewDesc: "എക്‌സ്‌ട്രാക്‌ട് ചെയ്‌ത ഡാറ്റ സ്ഥിരീകരിക്കുക അല്ലെങ്കിൽ നഷ്‌ടമായ മാർക്കറുകൾ ചേർക്കുക.", currentTreatment: "നിലവിലെ ചികിത്സ", optional: "(ഓപ്ഷണൽ)", recommended: "ശുപാർശ ചെയ്യുന്ന കൂട്ടിച്ചേർക്കലുകൾ", extracted: "എക്‌സ്‌ട്രാക്‌ട് ചെയ്‌ത ടെസ്‌റ്റുകൾ", addCustom: "ഇഷ്‌ടാനുസൃതം ചേർക്കുക", noData: "PDF-ൽ ഡാറ്റ കണ്ടെത്തിയില്ല. മാർക്കറുകൾ സ്വമേധയാ ചേർക്കുക.", testName: "ടെസ്‌റ്റ് പേര്", unit: "യൂണിറ്റ്", confirm: "സ്ഥിരീകരിച്ച് വിശകലനം ആരംഭിക്കുക", notInTreatment: "ചികിത്സയിലല്ല", other: "മറ്റുള്ളവ", ovulationInduction: "ഓവുലേഷൻ ഇൻഡക്ഷൻ", eggFreezing: "എഗ്ഗ് ഫ്രീസിംഗ്" },
  es: { reviewTitle: "Revisar resultados", reviewDesc: "Confirma los datos extraídos o agrega marcadores faltantes.", currentTreatment: "Tratamiento actual", optional: "(opcional)", recommended: "Adiciones recomendadas", extracted: "Pruebas extraídas", addCustom: "Agregar personalizado", noData: "No se encontraron datos en el PDF. Agrega marcadores manualmente.", testName: "Nombre del test", unit: "Unidad", confirm: "Confirmar e iniciar análisis", notInTreatment: "Sin tratamiento actual", other: "Otro", ovulationInduction: "Inducción de ovulación", eggFreezing: "Congelación de óvulos" },
  ja: { reviewTitle: "検査結果の確認", reviewDesc: "抽出データを確認するか、不足マーカーを追加してください。", currentTreatment: "現在の治療", optional: "(任意)", recommended: "追加推奨", extracted: "抽出された検査", addCustom: "カスタム追加", noData: "PDFにデータがありません。マーカーを手動で追加してください。", testName: "検査名", unit: "単位", confirm: "確認して分析開始", notInTreatment: "治療中ではない", other: "その他", ovulationInduction: "排卵誘発", eggFreezing: "卵子凍結" },
  fr: { reviewTitle: "Vérifier les résultats", reviewDesc: "Confirmez les données extraites ou ajoutez les marqueurs manquants.", currentTreatment: "Traitement actuel", optional: "(facultatif)", recommended: "Ajouts recommandés", extracted: "Tests extraits", addCustom: "Ajouter personnalisé", noData: "Aucune donnée trouvée dans le PDF. Ajoutez les marqueurs manuellement.", testName: "Nom du test", unit: "Unité", confirm: "Confirmer et lancer l'analyse", notInTreatment: "Pas de traitement en cours", other: "Autre", ovulationInduction: "Induction d'ovulation", eggFreezing: "Congélation d'ovocytes" },
  pt: { reviewTitle: "Revisar resultados", reviewDesc: "Confirme os dados extraídos ou adicione marcadores em falta.", currentTreatment: "Tratamento atual", optional: "(opcional)", recommended: "Adições recomendadas", extracted: "Testes extraídos", addCustom: "Adicionar personalizado", noData: "Nenhum dado encontrado no PDF. Adicione marcadores manualmente.", testName: "Nome do teste", unit: "Unidade", confirm: "Confirmar e iniciar análise", notInTreatment: "Sem tratamento atual", other: "Outro", ovulationInduction: "Indução de ovulação", eggFreezing: "Congelamento de óvulos" },
};

function bwcT(key: string, lang: string): string {
  return BWC_T[lang]?.[key] || BWC_T.en[key] || key;
}

const FERTILITY_MARKERS: FertilityMarker[] = [
  { name: "AMH", unit: "ng/mL" },
  { name: "FSH", unit: "mIU/mL" },
  { name: "LH", unit: "mIU/mL" },
  { name: "Estradiol", unit: "pg/mL" },
  { name: "TSH", unit: "uIU/mL" },
  { name: "Prolactin", unit: "ng/mL" },
];

function getTreatmentOptions(lang: string) {
  return [
    { value: "IVF", label: "IVF" },
    { value: "IUI", label: "IUI" },
    { value: "ICSI", label: "ICSI" },
    { value: "Ovulation Induction", label: bwcT("ovulationInduction", lang) },
    { value: "Egg Freezing", label: bwcT("eggFreezing", lang) },
    { value: "Not currently in treatment", label: bwcT("notInTreatment", lang) },
    { value: "Other", label: bwcT("other", lang) },
  ];
}

export default function BloodWorkConfirm({
  initialData,
  onConfirm,
  onCancel,
  lang = "en",
}: BloodWorkConfirmProps) {
  const [results, setResults] = useState<LabResult[]>(
    initialData?.results || []
  );
  const [treatment, setTreatment] = useState("");

  const missingMarkers = useMemo(() => {
    const existingNames = results.map((r) => r.name.toUpperCase());
    return FERTILITY_MARKERS.filter(
      (m) =>
        !existingNames.some((name) => name.includes(m.name.toUpperCase()))
    );
  }, [results]);

  const handleRowChange = (
    index: number,
    field: keyof LabResult,
    value: string
  ) => {
    const updated = [...results];
    updated[index] = { ...updated[index], [field]: value };
    setResults(updated);
  };

  const handleDelete = (index: number) => {
    setResults(results.filter((_, i) => i !== index));
  };

  const handleAddMissing = (marker: FertilityMarker) => {
    setResults([
      { name: marker.name, value: "", unit: marker.unit },
      ...results,
    ]);
  };

  const handleAddManual = () => {
    setResults([{ name: "", value: "", unit: "" }, ...results]);
  };

  return (
    <div className="p-5 sm:p-6 bg-[#f9f9f9] dark:bg-[#1a1a1a] shadow-2xl rounded-2xl sm:rounded-[2rem] border border-black/5 dark:border-white/5 w-full max-h-[80vh] flex flex-col relative">
      {/* Header */}
      <div className="shrink-0 mb-4 pr-8">
        <button
          onClick={onCancel}
          className="absolute right-4 top-4 sm:right-6 sm:top-6 p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors z-10"
        >
          <X className="w-5 h-5 text-slate-400" />
        </button>
        <h2 className="text-xl sm:text-2xl font-bold text-[#3231b1] dark:text-[#86eae9] tracking-tight">
          {bwcT("reviewTitle", lang)}
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          {bwcT("reviewDesc", lang)}
        </p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-5 pr-1 -mr-1">
        {/* Treatment selector (optional) */}
        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-slate-400 block mb-2 px-1">
            {bwcT("currentTreatment", lang)}{" "}
            <span className="text-slate-300 font-normal normal-case">{bwcT("optional", lang)}</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {getTreatmentOptions(lang).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTreatment(treatment === opt.value ? "" : opt.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all active:scale-95 ${
                  treatment === opt.value
                    ? "bg-[#3231b1] text-white border-[#3231b1] dark:bg-[#86eae9] dark:text-[#1a1a1a] dark:border-[#86eae9]"
                    : "bg-white dark:bg-white/5 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:border-[#3231b1] dark:hover:border-[#86eae9]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Missing Markers Section */}
        {missingMarkers.length > 0 && (
          <div className="bg-[#3231b1]/5 dark:bg-[#86eae9]/5 rounded-2xl p-4 border border-[#3231b1]/10 dark:border-[#86eae9]/10">
            <div className="flex items-center gap-2 mb-3 text-[#3231b1] dark:text-[#86eae9]">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="text-xs font-bold uppercase tracking-widest">
                {bwcT("recommended", lang)}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {missingMarkers.map((marker, i) => (
                <button
                  key={i}
                  onClick={() => handleAddMissing(marker)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-white/10 rounded-full text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 hover:border-[#ff7a55] hover:text-[#ff7a55] transition-all shadow-sm active:scale-95"
                >
                  <Plus className="w-3 h-3" /> {marker.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Data Grid */}
        <div>
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
              {bwcT("extracted", lang)}
            </span>
            <button
              onClick={handleAddManual}
              className="text-xs font-bold text-[#ff7a55] hover:underline flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> {bwcT("addCustom", lang)}
            </button>
          </div>

          {results.length === 0 ? (
            <div className="text-center py-8 bg-white dark:bg-white/5 rounded-2xl border border-dashed border-slate-300">
              <p className="text-sm text-slate-400 italic">
                {bwcT("noData", lang)}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {results.map((row, i) => (
                <div
                  key={i}
                  className="group relative bg-white dark:bg-white/5 p-3 rounded-xl border border-slate-200 dark:border-white/10 hover:border-[#3231b1] dark:hover:border-[#86eae9] transition-all shadow-sm"
                >
                  <div className="flex flex-col gap-0.5">
                    <input
                      value={row.name}
                      onChange={(e) =>
                        handleRowChange(i, "name", e.target.value)
                      }
                      placeholder={bwcT("testName", lang)}
                      className="bg-transparent text-[11px] font-bold uppercase tracking-tight text-[#3231b1] dark:text-[#86eae9] focus:outline-none w-full"
                    />
                    <div className="flex items-end gap-2">
                      <input
                        value={row.value}
                        onChange={(e) =>
                          handleRowChange(i, "value", e.target.value)
                        }
                        placeholder="0.0"
                        className="bg-transparent text-lg font-bold text-slate-800 dark:text-white focus:outline-none w-20"
                      />
                      <input
                        value={row.unit}
                        onChange={(e) =>
                          handleRowChange(i, "unit", e.target.value)
                        }
                        placeholder={bwcT("unit", lang)}
                        className="bg-transparent text-[10px] font-medium text-slate-400 mb-0.5 focus:outline-none w-full"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(i)}
                    className="absolute top-2.5 right-2.5 p-1 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Action Footer */}
      <div className="shrink-0 pt-4 mt-2 border-t border-slate-200 dark:border-white/10">
        <button
          onClick={() => onConfirm({ results, treatment })}
          disabled={results.length === 0}
          className="w-full bg-gradient-to-r from-[#3231b1] to-[#230871] dark:from-[#86eae9] dark:to-[#5fc3c2] text-white dark:text-[#1a1a1a] font-bold py-3.5 rounded-2xl hover:opacity-90 transition-all shadow-lg active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 text-sm sm:text-base"
        >
          <Check className="w-5 h-5" /> {bwcT("confirm", lang)}
        </button>
      </div>
    </div>
  );
}
