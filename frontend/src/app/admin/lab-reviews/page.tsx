"use client";

import { useState, useEffect } from "react";
import { fetchAdminStats, type AdminGap } from "@/lib/api";

export default function KnowledgeGapsPage() {
  const [gaps, setGaps] = useState<AdminGap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const adminKey = localStorage.getItem("izana_admin_key") || "";

    fetchAdminStats(adminKey)
      .then((data) => {
        const sortedGaps = (data.gaps || []).sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        setGaps(sortedGaps);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch gaps", err);
        setError("Failed to load data. Please ensure you are authenticated.");
        setLoading(false);
      });
  }, []);

  return (
    <div className="p-10 bg-slate-50 min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800">Knowledge Gaps</h1>
        <p className="text-slate-500 mt-2">
          Track scenarios where the AI lacked sufficient knowledge base data.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="p-4 font-semibold text-slate-600 w-32">Date</th>
              <th className="p-4 font-semibold text-slate-600 w-32">
                Gap Type
              </th>
              <th className="p-4 font-semibold text-slate-600">
                Missing Context / User Query
              </th>
              <th className="p-4 font-semibold text-slate-600 w-24">
                Confidence
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="p-10 text-center text-slate-400">
                  Loading gap logs...
                </td>
              </tr>
            ) : gaps.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-10 text-center text-slate-400">
                  No knowledge gaps detected yet.
                </td>
              </tr>
            ) : (
              gaps.map((g, idx) => (
                <tr
                  key={idx}
                  className="border-b border-slate-100 hover:bg-slate-50"
                >
                  <td className="p-4 text-xs text-slate-500 font-mono">
                    {new Date(g.timestamp).toLocaleDateString()}
                    <br />
                    {new Date(g.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="p-4 text-xs font-bold">
                    <span
                      className={`px-2 py-1 rounded-full ${
                        g.type === "Blood Work Gap"
                          ? "bg-orange-100 text-orange-800"
                          : "bg-slate-100 text-slate-800"
                      }`}
                    >
                      {g.type || "General"}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-slate-700 font-medium">
                    {g.question}
                  </td>
                  <td className="p-4 text-sm text-red-500 font-bold">
                    {((g.score || 0) * 100).toFixed(1)}%
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
