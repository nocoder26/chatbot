import React, { useState, useMemo } from 'react';
import { Trash2, Plus, X, AlertCircle, Check } from 'lucide-react';

// Master list of crucial fertility parameters to check against
const FERTILITY_MARKERS = [
  { name: "AMH", unit: "ng/mL" },
  { name: "FSH", unit: "mIU/mL" },
  { name: "LH", unit: "mIU/mL" },
  { name: "Estradiol", unit: "pg/mL" },
  { name: "TSH", unit: "uIU/mL" },
  { name: "Prolactin", unit: "ng/mL" }
];

export default function BloodWorkConfirm({ initialData, onConfirm, onCancel }: any) {
  const [results, setResults] = useState<any[]>(initialData?.results || []);

  // Compute which fertility markers are missing from the current results
  const missingMarkers = useMemo(() => {
    const existingNames = results.map(r => r.name.toUpperCase());
    return FERTILITY_MARKERS.filter(m => !existingNames.some(name => name.includes(m.name.toUpperCase())));
  }, [results]);

  const handleRowChange = (index: number, field: string, value: string) => {
    const updated = [...results];
    updated[index][field] = value;
    setResults(updated);
  };

  const handleDelete = (index: number) => {
    setResults(results.filter((_, i) => i !== index));
  };

  const handleAddMissing = (marker: { name: string, unit: string }) => {
    setResults([{ name: marker.name, value: "", unit: marker.unit }, ...results]);
  };

  const handleAddManual = () => {
    setResults([{ name: "", value: "", unit: "" }, ...results]);
  };

  return (
    <div className="p-6 bg-[#f9f9f9] dark:bg-[#1a1a1a] shadow-2xl rounded-[2rem] border border-black/5 dark:border-white/5 max-w-2xl w-full max-h-[90vh] flex flex-col relative overflow-hidden">
      
      {/* Header */}
      <div className="shrink-0 mb-6 pr-8">
        <button onClick={onCancel} className="absolute right-6 top-6 p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
          <X className="w-5 h-5 text-slate-400" />
        </button>
        <h2 className="text-2xl font-bold text-[#3231b1] dark:text-[#86eae9] tracking-tight">Review Lab Results</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Confirm the extracted data or add missing fertility markers below.</p>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-8 pr-2">
        
        {/* SECTION 1: MISSING FERTILITY MARKERS */}
        {missingMarkers.length > 0 && (
          <div className="bg-[#3231b1]/5 dark:bg-[#86eae9]/5 rounded-3xl p-5 border border-[#3231b1]/10 dark:border-[#86eae9]/10">
            <div className="flex items-center gap-2 mb-4 text-[#3231b1] dark:text-[#86eae9]">
              <AlertCircle className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-widest">Recommended Additions</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {missingMarkers.map((marker, i) => (
                <button
                  key={i}
                  onClick={() => handleAddMissing(marker)}
                  className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-white/10 rounded-full text-sm font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 hover:border-[#ff7a55] hover:text-[#ff7a55] transition-all shadow-sm active:scale-95"
                >
                  <Plus className="w-3 h-3" /> {marker.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* SECTION 2: THE DATA GRID */}
        <div>
          <div className="flex items-center justify-between mb-4 px-2">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Extracted Tests</span>
            <button onClick={handleAddManual} className="text-xs font-bold text-[#ff7a55] hover:underline flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add Custom
            </button>
          </div>
          
          {results.length === 0 ? (
            <div className="text-center py-10 bg-white dark:bg-white/5 rounded-3xl border border-dashed border-slate-300">
               <p className="text-sm text-slate-400 italic">No data found in PDF.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {results.map((row, i) => (
                <div key={i} className="group relative bg-white dark:bg-white/5 p-4 rounded-2xl border border-slate-200 dark:border-white/10 hover:border-[#3231b1] dark:hover:border-[#86eae9] transition-all shadow-sm">
                  <div className="flex flex-col gap-1">
                    <input 
                      value={row.name} 
                      onChange={(e) => handleRowChange(i, 'name', e.target.value)}
                      placeholder="Test Name"
                      className="bg-transparent text-xs font-bold uppercase tracking-tight text-[#3231b1] dark:text-[#86eae9] focus:outline-none w-full"
                    />
                    <div className="flex items-end gap-2">
                      <input 
                        value={row.value} 
                        onChange={(e) => handleRowChange(i, 'value', e.target.value)}
                        placeholder="0.0"
                        className="bg-transparent text-xl font-bold text-slate-800 dark:text-white focus:outline-none w-24"
                      />
                      <input 
                        value={row.unit} 
                        onChange={(e) => handleRowChange(i, 'unit', e.target.value)}
                        placeholder="Unit"
                        className="bg-transparent text-[10px] font-medium text-slate-400 mb-1 focus:outline-none w-full"
                      />
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDelete(i)}
                    className="absolute top-3 right-3 p-1.5 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all"
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
      <div className="shrink-0 pt-6 mt-2 border-t border-slate-200 dark:border-white/10">
        <button 
          onClick={() => onConfirm({ results })}
          disabled={results.length === 0}
          className="w-full bg-gradient-to-r from-[#3231b1] to-[#230871] dark:from-[#86eae9] dark:to-[#5fc3c2] text-white dark:text-[#1a1a1a] font-bold py-4 rounded-2xl hover:opacity-90 transition-all shadow-lg active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Check className="w-5 h-5" /> Confirm & Start Analysis
        </button>
      </div>
    </div>
  );
}
