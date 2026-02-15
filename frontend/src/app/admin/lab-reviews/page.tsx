"use client";
import { useState, useEffect } from 'react';

export default function LabReviewPage() {
  const [pendingCases, setPendingCases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch the 20 vectors from your new backend route
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/pending-clinical`)
      .then(res => res.json())
      .then(data => {
        setPendingCases(data.cases || []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="p-10 bg-slate-50 min-h-screen">
      <h1 className="text-3xl font-bold text-slate-800 mb-8">Clinical Lab Review</h1>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="p-4 font-semibold text-slate-600">Patient Case / Scenario</th>
              <th className="p-4 font-semibold text-slate-600">AI Summary</th>
              <th className="p-4 font-semibold text-slate-600">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3} className="p-10 text-center text-slate-400">Loading staging data...</td></tr>
            ) : pendingCases.map((c: any) => (
              <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="p-4 text-sm font-bold text-teal-700">{c.scenario}</td>
                <td className="p-4 text-sm text-slate-600">{c.text}</td>
                <td className="p-4">
                  <button className="bg-teal-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-teal-700 transition shadow-sm">
                    Verify & Promote
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
