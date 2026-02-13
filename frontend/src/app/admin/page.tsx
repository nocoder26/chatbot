"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Lock, AlertTriangle, MessageSquare, LogOut, RefreshCw, BarChart3, Star } from "lucide-react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const ADMIN_PIN = "1234";

// --- COMPONENTS ---

// A custom CSS-only Bar Chart component to avoid installing heavy libraries
const SimpleBarChart = ({ data, color = "bg-teal-500" }: { data: number[], color?: string }) => {
  const max = Math.max(...data);
  return (
    <div className="flex items-end gap-2 h-32 pt-4">
      {data.map((value, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
          <div className="text-xs font-bold text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">{value}</div>
          <div 
            className={`w-full rounded-t-lg ${color} opacity-80 hover:opacity-100 transition-all`}
            style={{ height: `${(value / (max || 1)) * 100}%` }}
          ></div>
          <div className="text-xs text-slate-400 font-medium">{i + 1}★</div>
        </div>
      ))}
    </div>
  );
};

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
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-lg w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <div className="p-3 bg-teal-100 dark:bg-teal-900 rounded-full">
            <Lock className="w-8 h-8 text-teal-600 dark:text-teal-400" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-center text-slate-800 dark:text-white mb-6">Izana Admin</h1>
        <form onSubmit={handleSubmit}>
          <input type="password" value={pin} onChange={(e) => { setPin(e.target.value); setError(false); }} placeholder="Enter PIN" className={`w-full px-4 py-3 rounded-lg border ${error ? "border-red-500" : "border-slate-300 dark:border-slate-600"} bg-white dark:bg-slate-700 text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-teal-500`} maxLength={4} />
          {error && <p className="text-red-500 text-sm text-center mt-2">Incorrect PIN</p>}
          <button type="submit" className="w-full mt-4 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium">Access Dashboard</button>
        </form>
      </motion.div>
    </div>
  );
}

function Dashboard() {
  const [activeTab, setActiveTab] = useState<"overview" | "gaps" | "feedback">("overview");
  const [stats, setStats] = useState<any>({ gaps: [], feedback: [] });
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/stats`);
      if (response.ok) setStats(await response.json());
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { fetchStats(); }, []);

  // Calculate Chart Data
  const ratingCounts = [0, 0, 0, 0, 0];
  stats.feedback.forEach((f: any) => {
    if (f.rating >= 1 && f.rating <= 5) ratingCounts[f.rating - 1]++;
  });

  const avgRating = stats.feedback.length 
    ? (stats.feedback.reduce((a: number, b: any) => a + b.rating, 0) / stats.feedback.length).toFixed(1) 
    : "0.0";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <header className="bg-white dark:bg-slate-800 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            Izana Intelligence
            {loading && <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />}
          </h1>
          <button onClick={() => { localStorage.removeItem("adminAuthenticated"); window.location.reload(); }} className="flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 transition-colors text-sm">
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        
        {/* KEY METRICS CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-sm text-slate-500 uppercase tracking-wider font-semibold">Avg Quality Score</p>
                <p className="text-3xl font-bold text-slate-800 dark:text-white mt-1">{avgRating}</p>
              </div>
              <div className="p-2 bg-yellow-100 rounded-lg"><Star className="w-5 h-5 text-yellow-600" /></div>
            </div>
            <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-yellow-500" style={{ width: `${(Number(avgRating)/5)*100}%` }}></div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-sm text-slate-500 uppercase tracking-wider font-semibold">Knowledge Gaps</p>
                <p className="text-3xl font-bold text-slate-800 dark:text-white mt-1">{stats.gaps.length}</p>
              </div>
              <div className="p-2 bg-red-100 rounded-lg"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
            </div>
             <p className="text-xs text-slate-400">Questions needing content updates</p>
          </div>

          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
             <p className="text-sm text-slate-500 uppercase tracking-wider font-semibold mb-2">Rating Distribution</p>
             <SimpleBarChart data={ratingCounts} />
          </div>
        </div>

        {/* TABS */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden border border-slate-200 dark:border-slate-700">
          <div className="flex border-b border-slate-200 dark:border-slate-700">
            <button onClick={() => setActiveTab("gaps")} className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${activeTab === "gaps" ? "text-red-600 border-b-2 border-red-600 bg-red-50 dark:bg-red-900/10" : "text-slate-500"}`}>
              🔴 Knowledge Gaps
            </button>
            <button onClick={() => setActiveTab("feedback")} className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${activeTab === "feedback" ? "text-teal-600 border-b-2 border-teal-600 bg-teal-50 dark:bg-teal-900/10" : "text-slate-500"}`}>
              💬 User Feedback
            </button>
          </div>

          <div className="overflow-x-auto p-2">
            {activeTab === "gaps" ? (
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-700/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Time</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Question</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {stats.gaps.slice().reverse().map((gap: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{new Date(gap.timestamp).toLocaleDateString()}</td>
                      <td className="px-6 py-4 text-sm font-medium text-slate-800 dark:text-slate-200">{gap.question}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm"><span className="px-2 py-1 rounded-full bg-red-100 text-red-800 text-xs">{gap.score.toFixed(2)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-700/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Rating</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Reason</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Question / Answer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {stats.feedback.slice().reverse().map((fb: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${fb.rating >= 4 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{fb.rating} ★</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{fb.reason || "No reason provided"}</td>
                      <td className="px-6 py-4 text-sm text-slate-500 max-w-xs truncate">{fb.question}</td>
                    </tr>
                  ))}
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
    setIsAuthenticated(localStorage.getItem("adminAuthenticated") === "true");
    setChecking(false);
  }, []);
  if (checking) return null;
  return isAuthenticated ? <Dashboard /> : <PinEntry onSuccess={() => setIsAuthenticated(true)} />;
}
