import React, { useState } from 'react';
import { Trash2, Plus, X } from 'lucide-react';

export default function BloodWorkConfirm({ initialData, onConfirm, onCancel }: any) {
  // Extract results array, fallback to empty array if undefined
  const [results, setResults] = useState<any[]>(initialData?.results || []);

  const handleRowChange = (index: number, field: string, value: string) => {
    const updated = [...results];
    updated[index][field] = value;
    setResults(updated);
  };

  const handleDelete = (index: number) => {
    setResults(results.filter((_, i) => i !== index));
  };

  const handleAddRow = () => {
    setResults([...results, { name: "", value: "", unit: "" }]);
  };

  return (
    <div className="p-6 bg-white dark:bg-[#212121] shadow-2xl rounded-3xl border border-black/10 dark:border-white/10 max-w-lg w-full max-h-[85vh] overflow-y-auto relative">
      <button onClick={onCancel} className="absolute right-4 top-4 p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
        <X className="w-5 h-5 text-[#212121]/50 dark:text-[#f9f9f9]/50" />
      </button>
      
      <h2 className="text-xl font-bold text-[#3231b1] dark:text-[#86eae9] mb-1">Verify Extracted Data</h2>
      <p className="text-[13px] text-[#212121]/60 dark:text-[#f9f9f9]/60 mb-6 leading-snug">
        We extracted these values from your image. Please correct any errors or add missing tests before we analyze your results.
      </p>
      
      <div className="space-y-3">
        {results.length === 0 && (
          <p className="text-sm text-red-500 italic py-4">No tests found. Please add them manually or try a clearer photo.</p>
        )}
        {results.map((row, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input 
              value={row.name} 
              placeholder="Test Name (e.g. FSH)"
              onChange={(e) => handleRowChange(i, 'name', e.target.value)}
              className="flex-1 p-2.5 border border-black/10 dark:border-white/10 rounded-xl text-sm font-medium bg-[#f9f9f9] dark:bg-[#3231b1]/20 text-[#212121] dark:text-white focus:outline-none focus:ring-1 focus:ring-[#ff7a55] transition-all"
            />
            <input 
              value={row.value} 
              placeholder="Value"
              onChange={(e) => handleRowChange(i, 'value', e.target.value)}
              className="w-20 p-2.5 border border-black/10 dark:border-white/10 rounded-xl text-sm bg-[#f9f9f9] dark:bg-[#3231b1]/20 text-[#212121] dark:text-white focus:outline-none focus:ring-1 focus:ring-[#ff7a55] transition-all"
            />
            <input 
              value={row.unit} 
              placeholder="Unit"
              onChange={(e) => handleRowChange(i, 'unit', e.target.value)}
              className="w-20 p-2.5 border border-black/10 dark:border-white/10 rounded-xl text-sm text-[#212121]/60 dark:text-white/60 bg-[#f9f9f9] dark:bg-[#3231b1]/20 focus:outline-none focus:ring-1 focus:ring-[#ff7a55] transition-all"
            />
            <button onClick={() => handleDelete(i)} className="p-2 text-red-400 hover:text-red-600 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <button onClick={handleAddRow} className="mt-5 flex items-center gap-2 text-xs text-[#3231b1] dark:text-[#86eae9] font-bold hover:opacity-70 transition-opacity uppercase tracking-wider">
        <Plus className="w-4 h-4" /> Add Test Manually
      </button>

      <button 
        onClick={() => onConfirm({ results })}
        disabled={results.length === 0}
        className="w-full mt-8 bg-[#3231b1] dark:bg-[#86eae9] text-white dark:text-[#212121] font-bold py-3.5 rounded-xl hover:opacity-90 transition-all shadow-[0_8px_30px_rgb(50,49,177,0.2)] active:scale-95 disabled:opacity-50"
      >
        Confirm & Analyze
      </button>
    </div>
  );
}
