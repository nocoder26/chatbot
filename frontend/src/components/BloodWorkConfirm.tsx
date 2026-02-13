import React, { useState } from 'react';
import { Trash2, Plus } from 'lucide-react';

export default function BloodWorkConfirm({ initialData, onConfirm }: any) {
  // 1. Handle the dynamic list of results
  const [results, setResults] = useState<any[]>(initialData?.results || []);
  const [cycleDay, setCycleDay] = useState(initialData?.cycle_day || 3);

  // 2. Allow editing specific cells (Name, Value, Unit)
  const handleRowChange = (index: number, field: string, value: string) => {
    const updated = [...results];
    updated[index][field] = value;
    setResults(updated);
  };

  // 3. Delete a row (garbage data)
  const handleDelete = (index: number) => {
    setResults(results.filter((_, i) => i !== index));
  };

  // 4. Add a missing row manually
  const handleAddRow = () => {
    setResults([...results, { name: "", value: "", unit: "", category: "General" }]);
  };

  return (
    <div className="p-6 bg-white shadow-xl rounded-2xl border border-teal-100 max-w-2xl mx-auto max-h-[80vh] overflow-y-auto">
      <h2 className="text-xl font-bold text-slate-800 mb-2">Verify Extracted Data</h2>
      <p className="text-sm text-slate-500 mb-6">We found {results.length} parameters. Please correct any errors.</p>
      
      {/* Cycle Day Context */}
      <div className="mb-6 p-4 bg-teal-50 rounded-xl">
        <label className="block text-sm font-bold text-teal-800 mb-1">Cycle Day</label>
        <p className="text-xs text-teal-600 mb-2">When was this blood drawn? (Day 3 is standard for baseline)</p>
        <select 
          value={cycleDay} 
          onChange={(e) => setCycleDay(Number(e.target.value))}
          className="w-full p-2 border border-teal-200 rounded-lg bg-white"
        >
          <option value={3}>Day 2-4 (Follicular/Baseline)</option>
          <option value={14}>Day 12-16 (Ovulation)</option>
          <option value={21}>Day 21 (Luteal/Progesterone)</option>
          <option value={0}>Unknown / Random Date</option>
        </select>
      </div>

      {/* Dynamic Rows */}
      <div className="space-y-3">
        {results.map((row, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input 
              value={row.name} 
              placeholder="Test Name"
              onChange={(e) => handleRowChange(i, 'name', e.target.value)}
              className="flex-1 p-2 border rounded-lg text-sm font-medium bg-slate-50"
            />
            <input 
              value={row.value} 
              placeholder="Value"
              onChange={(e) => handleRowChange(i, 'value', e.target.value)}
              className="w-20 p-2 border rounded-lg text-sm bg-slate-50"
            />
            <input 
              value={row.unit} 
              placeholder="Unit"
              onChange={(e) => handleRowChange(i, 'unit', e.target.value)}
              className="w-20 p-2 border rounded-lg text-sm text-slate-500 bg-slate-50"
            />
            <button onClick={() => handleDelete(i)} className="p-2 text-red-400 hover:text-red-600">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <button onClick={handleAddRow} className="mt-4 flex items-center gap-2 text-sm text-teal-600 font-medium hover:underline">
        <Plus className="w-4 h-4" /> Add Missing Test
      </button>

      <button 
        onClick={() => onConfirm({ results, cycle_day: cycleDay })}
        className="w-full mt-8 bg-teal-600 text-white font-bold py-3 rounded-xl hover:bg-teal-700 transition shadow-md"
      >
        Analyze Full Report →
      </button>
    </div>
  );
}