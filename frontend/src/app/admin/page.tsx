"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Lock,
  AlertTriangle,
  MessageSquare,
  LogOut,
  RefreshCw,
  Star,
  TestTube,
  BookOpen,
} from "lucide-react";
import {
  verifyAdminPin,
  fetchAdminStats,
  type AdminStats,
  type AdminGap,
  type AdminFeedback,
} from "@/lib/api";

// --- BAR CHART COMPONENT ---
function SimpleBarChart({
  data,
  color = "bg-teal-500",
}: {
  data: number[];
  color?: string;
}) {
  const max = Math.max(...data);
  return (
    <div className="flex items-end gap-2 h-32 pt-4">
      {data.map((value, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
          <div className="text-xs font-bold text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
            {value}
          </div>
          <div
            className={`w-full rounded-t-lg ${color} opacity-80 hover:opacity-100 transition-all`}
            style={{ height: `${(value / (max || 1)) * 100}%` }}
          />
          <div className="text-xs text-slate-400 font-medium">{i + 1}★</div>
        </div>
      ))}
    </div>
  );
}

// --- PIN ENTRY ---
function PinEntry({ onSuccess }: { onSuccess: (adminKey: string) => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await verifyAdminPin(pin);
      if (result.authenticated) {
        localStorage.setItem("izana_admin_key", result.admin_key);
        onSuccess(result.admin_key);
      }
    } catch {
      setError("Incorrect PIN");
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-lg w-full max-w-sm"
      >
        <div className="flex justify-center mb-6">
          <div className="p-3 bg-teal-100 dark:bg-teal-900 rounded-full">
            <Lock className="w-8 h-8 text-teal-600 dark:text-teal-400" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-center text-slate-800 dark:text-white mb-6">
          Izana Admin
        </h1>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value);
              setError("");
            }}
            placeholder="Enter PIN"
            className={`w-full px-4 py-3 rounded-lg border ${
              error
                ? "border-red-500"
                : "border-slate-300 dark:border-slate-600"
            } bg-white dark:bg-slate-700 text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-teal-500`}
            maxLength={20}
            disabled={loading}
          />
          {error && (
            <p className="text-red-500 text-sm text-center mt-2">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || !pin}
            className="w-full mt-4 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium disabled:opacity-50"
          >
            {loading ? "Verifying..." : "Access Dashboard"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

// --- DASHBOARD ---
function Dashboard({ adminKey }: { adminKey: string }) {
  const [activeTab, setActiveTab] = useState<
    "gaps" | "feedback" | "documents"
  >("gaps");
  const [stats, setStats] = useState<AdminStats>({
    gaps: [],
    feedback: [],
    doc_usage: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadStats = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAdminStats(adminKey);
      setStats(data);
    } catch (err) {
      if (err instanceof Error && err.message.includes("Unauthorized")) {
        handleLogout();
        return;
      }
      setError("Failed to load stats. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("izana_admin_key");
    window.location.reload();
  };

  // Compute rating distribution
  const ratingCounts = [0, 0, 0, 0, 0];
  stats.feedback.forEach((f: AdminFeedback) => {
    if (f.rating >= 1 && f.rating <= 5) ratingCounts[f.rating - 1]++;
  });

  const avgRating = stats.feedback.length
    ? (
        stats.feedback.reduce(
          (a: number, b: AdminFeedback) => a + b.rating,
          0
        ) / stats.feedback.length
      ).toFixed(1)
    : "0.0";

  // Compute document usage counts
  const docCounts: Record<string, number> = {};
  stats.doc_usage.forEach((log) => {
    const docName = log.document || "Unknown Document";
    docCounts[docName] = (docCounts[docName] || 0) + 1;
  });
  const sortedDocs = Object.entries(docCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <header className="bg-white dark:bg-slate-800 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            Izana Intelligence Dashboard
            {loading && (
              <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
            )}
          </h1>
          <div className="flex items-center gap-3">
            <button
              onClick={loadStats}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 transition-colors text-sm"
            >
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
            {error}
          </div>
        )}

        {/* KEY METRICS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-sm text-slate-500 uppercase tracking-wider font-semibold">
                  Avg Quality Score
                </p>
                <p className="text-3xl font-bold text-slate-800 dark:text-white mt-1">
                  {avgRating}{" "}
                  <span className="text-lg text-slate-400">/ 5</span>
                </p>
              </div>
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Star className="w-5 h-5 text-yellow-600" />
              </div>
            </div>
            <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-yellow-500 transition-all"
                style={{ width: `${(Number(avgRating) / 5) * 100}%` }}
              />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-sm text-slate-500 uppercase tracking-wider font-semibold">
                  Knowledge Gaps
                </p>
                <p className="text-3xl font-bold text-slate-800 dark:text-white mt-1">
                  {stats.gaps.length}
                </p>
              </div>
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
            </div>
            <p className="text-xs text-slate-400">
              Queries lacking high-confidence knowledge base data
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
            <p className="text-sm text-slate-500 uppercase tracking-wider font-semibold mb-2">
              Sentiment Distribution
            </p>
            <SimpleBarChart data={ratingCounts} />
          </div>
        </div>

        {/* TABS */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden border border-slate-200 dark:border-slate-700">
          <div className="flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
            <button
              onClick={() => setActiveTab("gaps")}
              className={`flex-1 px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === "gaps"
                  ? "text-red-600 border-b-2 border-red-600 bg-red-50 dark:bg-red-900/10"
                  : "text-slate-500"
              }`}
            >
              Knowledge Gaps
            </button>
            <button
              onClick={() => setActiveTab("documents")}
              className={`flex-1 px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === "documents"
                  ? "text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50 dark:bg-indigo-900/10"
                  : "text-slate-500"
              }`}
            >
              Document Usage
            </button>
            <button
              onClick={() => setActiveTab("feedback")}
              className={`flex-1 px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === "feedback"
                  ? "text-teal-600 border-b-2 border-teal-600 bg-teal-50 dark:bg-teal-900/10"
                  : "text-slate-500"
              }`}
            >
              User Feedback
            </button>
          </div>

          <div className="overflow-x-auto p-2">
            {/* KNOWLEDGE GAPS */}
            {activeTab === "gaps" && (
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-700/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                      Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                      Query
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                      Confidence
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {stats.gaps
                    .slice()
                    .reverse()
                    .map((gap: AdminGap, i: number) => (
                      <tr
                        key={i}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500 font-mono">
                          {new Date(gap.timestamp).toLocaleDateString()}
                          <br />
                          {new Date(gap.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-max ${
                              gap.type === "Blood Work Gap"
                                ? "bg-orange-100 text-orange-800"
                                : "bg-slate-100 text-slate-800"
                            }`}
                          >
                            {gap.type === "Blood Work Gap" ? (
                              <TestTube className="w-3 h-3" />
                            ) : (
                              <MessageSquare className="w-3 h-3" />
                            )}
                            {gap.type || "General"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-slate-800 dark:text-slate-200">
                          {gap.question}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-red-500 font-bold">
                          {((gap.score || 0) * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  {stats.gaps.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="p-8 text-center text-slate-400"
                      >
                        No knowledge gaps detected yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {/* DOCUMENT USAGE */}
            {activeTab === "documents" && (
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-700/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                      Knowledge Base Source
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase w-32">
                      Times Cited
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {sortedDocs.map(([docName, count], i) => (
                    <tr
                      key={i}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <td className="px-6 py-4 text-sm font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-indigo-400" />
                        {docName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-indigo-600 dark:text-indigo-400 font-bold">
                        {count} {count === 1 ? "time" : "times"}
                      </td>
                    </tr>
                  ))}
                  {sortedDocs.length === 0 && (
                    <tr>
                      <td
                        colSpan={2}
                        className="p-8 text-center text-slate-400"
                      >
                        No documents have been cited yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {/* USER FEEDBACK */}
            {activeTab === "feedback" && (
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-700/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                      Rating
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                      Reason
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                      User Query
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {stats.feedback
                    .slice()
                    .reverse()
                    .map((fb: AdminFeedback, i: number) => (
                      <tr
                        key={i}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-bold ${
                              fb.rating >= 4
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {fb.rating} ★
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 font-medium">
                          {fb.reason || (
                            <span className="text-slate-400 italic">
                              No reason provided
                            </span>
                          )}
                        </td>
                        <td
                          className="px-6 py-4 text-sm text-slate-500 max-w-md truncate"
                          title={fb.question}
                        >
                          {fb.question}
                        </td>
                      </tr>
                    ))}
                  {stats.feedback.length === 0 && (
                    <tr>
                      <td
                        colSpan={3}
                        className="p-8 text-center text-slate-400"
                      >
                        No user feedback received yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// --- MAIN PAGE ---
export default function AdminPage() {
  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const savedKey = localStorage.getItem("izana_admin_key");
    if (savedKey) {
      setAdminKey(savedKey);
    }
    setChecking(false);
  }, []);

  if (checking) return null;

  return adminKey ? (
    <Dashboard adminKey={adminKey} />
  ) : (
    <PinEntry onSuccess={(key) => setAdminKey(key)} />
  );
}
