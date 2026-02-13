"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Lock, AlertTriangle, MessageSquare, LogOut, RefreshCw } from "lucide-react";

// Matches your Vercel env variable setup
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const ADMIN_PIN = "1234"; // Simple security

// --- MATCHING BACKEND DATA STRUCTURE ---
interface GapItem {
  timestamp: string;
  question: string;
  score: number;
}

interface FeedbackItem {
  timestamp: string;
  question: string;
  rating: number;
  reason?: string;
}

interface AdminStats {
  gaps: GapItem[];
  feedback: FeedbackItem[];
}

function PinEntry({ onSuccess }: { onSuccess: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === ADMIN_PIN) {
      localStorage.setItem("adminAuthenticated", "true");
      onSuccess();
    } else {
      setError(true);
      setPin("");
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
          Admin Access
        </h1>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value);
              setError(false);
            }}
            placeholder="Enter PIN"
            className={`w-full px-4 py-3 rounded-lg border ${
              error
                ? "border-red-500 focus:ring-red-500"
                : "border-slate-300 dark:border-slate-600 focus:ring-teal-500"
            } bg-white dark:bg-slate-700 text-slate-800 dark:text-white
            text-center text-2xl tracking-widest
            focus:outline-none focus:ring-2`}
            maxLength={4}
          />
          {error && (
            <p className="text-red-500 text-sm text-center mt-2">
              Incorrect PIN
            </p>
          )}
          <button
            type="submit"
            className="w-full mt-4 py-3 bg-teal-600 text-white rounded-lg
                       hover:bg-teal-700 transition-colors font-medium"
          >
            Access Dashboard
          </button>
        </form>
      </motion.div>
    </div>
  );
}

function Dashboard() {
  const [activeTab, setActiveTab] = useState<"gaps" | "feedback">("gaps");
  const [stats, setStats] = useState<AdminStats>({ gaps: [], feedback: [] });
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/stats`);
      if (response.ok) {
        const data = await response.json();
        // Backend returns { gaps: [], feedback: [] }
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to load stats", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("adminAuthenticated");
    window.location.reload();
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            Admin Dashboard
            {loading && <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />}
          </h1>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchStats}
              className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg dark:text-slate-300 dark:hover:bg-slate-700"
              title="Refresh Data"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-600
                         text-slate-700 dark:text-slate-300 rounded-lg
                         hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-sm"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Knowledge Gaps Detected</p>
                <p className="text-3xl font-bold text-slate-800 dark:text-white">
                  {stats.gaps.length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-teal-100 dark:bg-teal-900/30 rounded-lg">
                <MessageSquare className="w-6 h-6 text-teal-600 dark:text-teal-400" />
              </div>
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">User Feedback Received</p>
                <p className="text-3xl font-bold text-slate-800 dark:text-white">
                  {stats.feedback.length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden border border-slate-200 dark:border-slate-700">
          <div className="flex border-b border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setActiveTab("gaps")}
              className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
                activeTab === "gaps"
                  ? "text-red-600 border-b-2 border-red-600 bg-red-50 dark:bg-red-900/10"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              Knowledge Gaps (Low Context Score)
            </button>
            <button
              onClick={() => setActiveTab("feedback")}
              className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
                activeTab === "feedback"
                  ? "text-teal-600 border-b-2 border-teal-600 bg-teal-50 dark:bg-teal-900/10"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              User Ratings & Feedback
            </button>
          </div>

          {/* Table Content */}
          <div className="overflow-x-auto">
            {activeTab === "gaps" ? (
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-700/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Time</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Unanswered Question</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Context Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {stats.gaps.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-slate-500">No gaps recorded yet. Good job!</td>
                    </tr>
                  ) : (
                    stats.gaps.slice().reverse().map((gap, i) => (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{formatDate(gap.timestamp)}</td>
                        <td className="px-6 py-4 text-sm text-slate-800 dark:text-slate-200 font-medium">{gap.question}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                            gap.score < 0.5 ? "bg-red-100 text-red-800" : "bg-orange-100 text-orange-800"
                          }`}>
                            {gap.score.toFixed(4)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-700/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Time</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Rating</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Question</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Reason/Comment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {stats.feedback.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-slate-500">No feedback yet.</td>
                    </tr>
                  ) : (
                    stats.feedback.slice().reverse().map((fb, i) => (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{formatDate(fb.timestamp)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                            fb.rating >= 4 ? "bg-green-100 text-green-800" : 
                            fb.rating === 3 ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"
                          }`}>
                            {fb.rating} ★
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-800 dark:text-slate-200">{fb.question}</td>
                        <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400 italic">
                          {fb.reason || "-"}
                        </td>
                      </tr>
                    ))
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

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const auth = localStorage.getItem("adminAuthenticated");
    setIsAuthenticated(auth === "true");
    setChecking(false);
  }, []);

  if (checking) return null;

  if (!isAuthenticated) {
    return <PinEntry onSuccess={() => setIsAuthenticated(true)} />;
  }

  return <Dashboard />;
}
