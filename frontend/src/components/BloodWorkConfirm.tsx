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
}

const FERTILITY_MARKERS: FertilityMarker[] = [
  { name: "AMH", unit: "ng/mL" },
  { name: "FSH", unit: "mIU/mL" },
  { name: "LH", unit: "mIU/mL" },
  { name: "Estradiol", unit: "pg/mL" },
  { name: "TSH", unit: "uIU/mL" },
  { name: "Prolactin", unit: "ng/mL" },
];

const TREATMENT_OPTIONS = [
  "IVF",
  "IUI",
  "ICSI",
  "Ovulation Induction",
  "Egg Freezing",
  "Not currently in treatment",
  "Other",
];

export default function BloodWorkConfirm({
  initialData,
  onConfirm,
  onCancel,
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
          Review Lab Results
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          Confirm the extracted data or add missing fertility markers below.
        </p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-5 pr-1 -mr-1">
        {/* Treatment selector (optional) */}
        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-slate-400 block mb-2 px-1">
            Current Treatment{" "}
            <span className="text-slate-300 font-normal normal-case">(optional)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {TREATMENT_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => setTreatment(treatment === opt ? "" : opt)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all active:scale-95 ${
                  treatment === opt
                    ? "bg-[#3231b1] text-white border-[#3231b1] dark:bg-[#86eae9] dark:text-[#1a1a1a] dark:border-[#86eae9]"
                    : "bg-white dark:bg-white/5 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:border-[#3231b1] dark:hover:border-[#86eae9]"
                }`}
              >
                {opt}
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
                Recommended Additions
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
              Extracted Tests
            </span>
            <button
              onClick={handleAddManual}
              className="text-xs font-bold text-[#ff7a55] hover:underline flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Add Custom
            </button>
          </div>

          {results.length === 0 ? (
            <div className="text-center py-8 bg-white dark:bg-white/5 rounded-2xl border border-dashed border-slate-300">
              <p className="text-sm text-slate-400 italic">
                No data found in PDF. Add markers manually above.
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
                      placeholder="Test Name"
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
                        placeholder="Unit"
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
          <Check className="w-5 h-5" /> Confirm &amp; Start Analysis
        </button>
      </div>
    </div>
  );
}
