"use client";
import { useState } from 'react';

export default function LabReviewPage() {
  return (
    <div className="p-10 bg-slate-50 min-h-screen">
      <h1 className="text-3xl font-bold text-slate-800 mb-8">Clinical Lab Review</h1>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="p-4 font-semibold text-slate-600">Patient Data</th>
              <th className="p-4 font-semibold text-slate-600">AI Interpretation</th>
              <th className="p-4 font-semibold text-slate-600">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-100">
              <td className="p-4 text-sm font-mono text-slate-700">FSH: 5.4, AMH: 0.8</td>
              <td className="p-4 text-sm text-slate-600 italic">"Results suggest diminished reserve..."</td>
              <td className="p-4">
                <button className="bg-teal-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-teal-700 transition">
                  Verify & Teach Bot
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}