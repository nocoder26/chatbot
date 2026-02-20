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
  Users,
  Activity,
  ChevronRight,
  Eye,
  EyeOff,
  Monitor,
  Trash2,
} from "lucide-react";
import {
  verifyAdminPin,
  fetchAdminStats,
  fetchUserAnalytics,
  fetchUserDrillDown,
  fetchAdminUsers,
  fetchPendingImprovements,
  approveGap,
  dismissGap,
  clearAdminTestData,
  type AdminStats,
  type AdminGap,
  type AdminFeedback,
  type AdminDocUsage,
  type UserAnalytics,
  type AdminUser,
  type PendingImprovement,
} from "@/lib/api";

// --- BAR CHART ---
function SimpleBarChart({ data, color = "bg-izana-primary" }: { data: number[]; color?: string }) {
  const max = Math.max(...data);
  return (
    <div className="flex items-end gap-2 h-32 pt-4">
      {data.map((value, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
          <div className="text-xs font-bold text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">{value}</div>
          <div
            className={`w-full rounded-t-lg ${color} opacity-80 hover:opacity-100 transition-all`}
            style={{ height: `${(value / (max || 1)) * 100}%` }}
          />
          <div className="text-xs text-gray-400 font-medium">{i + 1}</div>
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
  const [showPin, setShowPin] = useState(false);

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
    <div className="min-h-screen flex items-center justify-center bg-izana-light dark:bg-izana-dark">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-[#2a2a2a] p-8 rounded-2xl shadow-lg w-full max-w-sm border border-black/5 dark:border-white/5"
      >
        <div className="flex justify-center mb-6">
          <div className="p-3 bg-izana-indigo/10 rounded-full">
            <Lock className="w-8 h-8 text-izana-indigo dark:text-izana-teal" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-center text-izana-dark dark:text-izana-light mb-6">
          Izana Admin
        </h1>
        <form onSubmit={handleSubmit}>
          <div className="relative">
            <input
              type={showPin ? "text" : "password"}
              value={pin}
              onChange={(e) => { setPin(e.target.value); setError(""); }}
              placeholder="Enter PIN"
              className={`w-full px-4 py-3 pr-10 rounded-xl border ${
                error ? "border-red-500" : "border-gray-200 dark:border-[#404040]"
              } bg-white dark:bg-[#333] text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-izana-indigo/50`}
              maxLength={20}
              disabled={loading}
            />
            <button type="button" onClick={() => setShowPin(!showPin)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {error && <p className="text-red-500 text-sm text-center mt-2">{error}</p>}
          <button
            type="submit"
            disabled={loading || !pin}
            className="w-full mt-4 py-3 bg-izana-indigo text-white rounded-xl hover:opacity-90 transition-opacity font-medium disabled:opacity-50"
          >
            {loading ? "Verifying..." : "Access Dashboard"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

// --- DASHBOARD ---
function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

function Dashboard({ adminKey }: { adminKey: string }) {
  const [activeTab, setActiveTab] = useState<"gaps" | "feedback" | "documents" | "analytics" | "users">("gaps");
  const [stats, setStats] = useState<AdminStats>({ gaps: [], gapsChat: [], gapsBloodwork: [], feedback: [], doc_usage: [], kb_sources: [], insufficient_kb: [], sources_ranking: [] });
  const [analytics, setAnalytics] = useState<UserAnalytics | null>(null);
  const [userList, setUserList] = useState<AdminUser[]>([]);
  const [drillDown, setDrillDown] = useState<Record<string, unknown> | null>(null);
  const [drillDownLoading, setDrillDownLoading] = useState(false);
  const [userSortKey, setUserSortKey] = useState<keyof AdminUser>("activityCount");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [pendingImprovements, setPendingImprovements] = useState<PendingImprovement[]>([]);
  const [answerDraft, setAnswerDraft] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [clearLoading, setClearLoading] = useState(false);
  const [clearResult, setClearResult] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [statsData, analyticsData, usersData, improvementsData] = await Promise.all([
        fetchAdminStats(adminKey),
        fetchUserAnalytics(adminKey),
        fetchAdminUsers(adminKey),
        fetchPendingImprovements(adminKey).catch(() => ({ total: 0, items: [] })),
      ]);
      setStats(statsData);
      setAnalytics(analyticsData);
      setUserList(usersData.users || []);
      setPendingImprovements(improvementsData.items || []);
      setLastUpdated(new Date());
    } catch (err) {
      if (err instanceof Error && err.message.includes("Unauthorized")) {
        handleLogout();
        return;
      }
      setError("Failed to load data. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [adminKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogout = () => {
    localStorage.removeItem("izana_admin_key");
    window.location.reload();
  };

  const handleDrillDown = async (userId: string) => {
    setDrillDownLoading(true);
    try {
      const data = await fetchUserDrillDown(adminKey, userId);
      setDrillDown(data);
    } catch (err) {
      console.error("Drill-down error:", err);
    } finally {
      setDrillDownLoading(false);
    }
  };

  const handleApproveGap = async (gapId: string) => {
    const answer = answerDraft[gapId];
    if (!answer?.trim()) return;
    setActionLoading(gapId);
    try {
      await approveGap(adminKey, gapId, answer.trim());
      setPendingImprovements((prev) => prev.filter((p) => p.id !== gapId));
      setAnswerDraft((prev) => { const n = { ...prev }; delete n[gapId]; return n; });
    } catch (err) { console.error("Approve error:", err); }
    finally { setActionLoading(null); }
  };

  const handleDismissGap = async (gapId: string) => {
    setActionLoading(gapId);
    try {
      await dismissGap(adminKey, gapId);
      setPendingImprovements((prev) => prev.filter((p) => p.id !== gapId));
    } catch (err) { console.error("Dismiss error:", err); }
    finally { setActionLoading(null); }
  };

  const handleClearTestData = async () => {
    if (!confirm("Clear all users, chats, messages, bloodwork, activities, and consent? This cannot be undone. Use only for test environments.")) return;
    setClearLoading(true);
    setClearResult(null);
    try {
      const result = await clearAdminTestData(adminKey, { includeTier2And3: true });
      const msg = `Cleared: ${result.deleted.users} users, ${result.deleted.chats} chats, ${result.deleted.messages} messages, ${result.deleted.activities} activities.`;
      setClearResult(msg);
      await loadData();
    } catch (err) {
      setClearResult(err instanceof Error ? err.message : "Failed to clear data");
    } finally {
      setClearLoading(false);
    }
  };

  const ratingCounts = [0, 0, 0, 0, 0];
  stats.feedback.forEach((f: AdminFeedback) => {
    if (f.rating >= 1 && f.rating <= 5) ratingCounts[f.rating - 1]++;
  });
  const avgRating = stats.feedback.length
    ? (stats.feedback.reduce((a: number, b: AdminFeedback) => a + b.rating, 0) / stats.feedback.length).toFixed(1)
    : "0.0";

  const docCounts: Record<string, number> = {};
  stats.doc_usage.forEach((log) => {
    const docName = log.document || "Unknown";
    docCounts[docName] = (docCounts[docName] || 0) + 1;
  });
  const sortedDocs = Object.entries(docCounts).sort((a, b) => b[1] - a[1]);

  const sortedUserList = [...userList].sort((a, b) => {
    const aVal = a[userSortKey];
    const bVal = b[userSortKey];
    if (typeof aVal === "number" && typeof bVal === "number") return bVal - aVal;
    if (typeof aVal === "string" && typeof bVal === "string") return bVal.localeCompare(aVal);
    return 0;
  });

  const tabs = [
    { id: "gaps" as const, label: "Knowledge Gaps", color: "text-red-500 border-red-500 bg-red-50 dark:bg-red-900/10" },
    { id: "documents" as const, label: "Document Usage & KB Sources", color: "text-izana-indigo border-izana-indigo bg-izana-indigo/5" },
    { id: "feedback" as const, label: "User Feedback", color: "text-izana-teal border-izana-teal bg-izana-teal/10" },
    { id: "analytics" as const, label: "User Analytics", color: "text-izana-coral border-izana-coral bg-izana-coral/10" },
    { id: "users" as const, label: "Users", color: "text-purple-600 border-purple-600 bg-purple-50 dark:bg-purple-900/10" },
  ];

  const gapsChat = stats.gapsChat ?? stats.gaps.filter((g: AdminGap) => (g.source || "chat") === "chat");
  const gapsBloodwork = stats.gapsBloodwork ?? stats.gaps.filter((g: AdminGap) => g.source === "bloodwork");

  return (
    <div className="min-h-screen bg-izana-light dark:bg-izana-dark">
      <header className="bg-gradient-to-r from-izana-indigo to-izana-primary shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            Izana Intelligence Dashboard
            {loading && <RefreshCw className="w-4 h-4 animate-spin text-white/60" />}
          </h1>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-white/50 hidden sm:inline">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button onClick={loadData} disabled={loading} className="flex items-center gap-2 px-3 py-2 text-sm border border-white/20 text-white rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
            <button onClick={handleClearTestData} disabled={clearLoading} className="flex items-center gap-2 px-3 py-2 text-sm border border-red-300 text-red-100 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50" title="Clear all test data (users, chats, messages, activities). Use only in test environments.">
              <Trash2 className="w-4 h-4" /> {clearLoading ? "Clearing..." : "Clear test data"}
            </button>
            <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 border border-white/20 text-white rounded-lg hover:bg-white/10 transition-colors text-sm">
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {error && <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-xl border border-red-200">{error}</div>}
        {clearResult && (
          <div className={`mb-4 p-4 rounded-xl border ${clearResult.startsWith("Cleared:") ? "bg-green-50 text-green-800 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
            {clearResult}
            <button type="button" onClick={() => setClearResult(null)} className="ml-2 text-sm underline">Dismiss</button>
          </div>
        )}

        {/* KEY METRICS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white dark:bg-[#2a2a2a] p-6 rounded-2xl shadow-sm border border-black/5 dark:border-white/5">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-sm text-gray-500 uppercase tracking-wider font-semibold">Avg Quality</p>
                <p className="text-3xl font-bold text-izana-dark dark:text-izana-light mt-1">{avgRating} <span className="text-lg text-gray-400">/ 5</span></p>
              </div>
              <div className="p-2 bg-yellow-100 rounded-lg"><Star className="w-5 h-5 text-yellow-600" /></div>
            </div>
          </div>
          <div className="bg-white dark:bg-[#2a2a2a] p-6 rounded-2xl shadow-sm border border-black/5 dark:border-white/5">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-sm text-gray-500 uppercase tracking-wider font-semibold">Knowledge Gaps</p>
                <p className="text-3xl font-bold text-izana-dark dark:text-izana-light mt-1">{stats.gaps.length}</p>
              </div>
              <div className="p-2 bg-red-100 rounded-lg"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
            </div>
          </div>
          <div className="bg-white dark:bg-[#2a2a2a] p-6 rounded-2xl shadow-sm border border-black/5 dark:border-white/5">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-sm text-gray-500 uppercase tracking-wider font-semibold">Active Users (24h)</p>
                <p className="text-3xl font-bold text-izana-dark dark:text-izana-light mt-1">{analytics?.activeUsers ?? "-"}</p>
              </div>
              <div className="p-2 bg-izana-teal/20 rounded-lg"><Users className="w-5 h-5 text-izana-primary" /></div>
            </div>
          </div>
          <div className="bg-white dark:bg-[#2a2a2a] p-6 rounded-2xl shadow-sm border border-black/5 dark:border-white/5">
            <p className="text-sm text-gray-500 uppercase tracking-wider font-semibold mb-2">Sentiment</p>
            <SimpleBarChart data={ratingCounts} />
          </div>
        </div>

        {/* TABS */}
        <div className="bg-white dark:bg-[#2a2a2a] rounded-2xl shadow-sm overflow-hidden border border-black/5 dark:border-white/5">
          <div className="flex border-b border-gray-200 dark:border-[#404040] overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setDrillDown(null); }}
                className={`flex-1 px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.id ? `${tab.color} border-b-2` : "text-gray-500"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto p-2">
            {/* KNOWLEDGE GAPS — separate Chat vs Bloodwork */}
            {activeTab === "gaps" && (
              <>
              <div className="p-4 space-y-8">
                <section>
                  <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-izana-indigo" /> Chat knowledge gaps
                  </h4>
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-[#333]">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Query</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Confidence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-[#404040]">
                      {gapsChat.slice().reverse().map((gap: AdminGap, i: number) => (
                        <tr key={`chat-${i}`} className="hover:bg-gray-50 dark:hover:bg-[#333]">
                          <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 font-mono">
                            {new Date(gap.timestamp).toLocaleDateString()}<br />
                            {new Date(gap.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <span className="px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-max bg-gray-100 text-gray-800">
                              <MessageSquare className="w-3 h-3" />{gap.type || "General"}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-izana-dark dark:text-izana-light">{gap.question}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-red-500 font-bold">{((gap.score || 0) * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                      {gapsChat.length === 0 && (
                        <tr><td colSpan={4} className="p-6 text-center text-gray-400">No chat knowledge gaps.</td></tr>
                      )}
                    </tbody>
                  </table>
                </section>
                <section>
                  <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <TestTube className="w-4 h-4 text-izana-coral" /> Bloodwork knowledge gaps
                  </h4>
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-[#333]">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Marker</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Query</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Confidence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-[#404040]">
                      {gapsBloodwork.slice().reverse().map((gap: AdminGap, i: number) => (
                        <tr key={`bw-${i}`} className="hover:bg-gray-50 dark:hover:bg-[#333]">
                          <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 font-mono">
                            {new Date(gap.timestamp).toLocaleDateString()}<br />
                            {new Date(gap.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <span className="px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-max bg-orange-100 text-orange-800">
                              <TestTube className="w-3 h-3" />{gap.marker || gap.type || "—"}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-izana-dark dark:text-izana-light">{gap.question}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-red-500 font-bold">{((gap.score || 0) * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                      {gapsBloodwork.length === 0 && (
                        <tr><td colSpan={4} className="p-6 text-center text-gray-400">No bloodwork knowledge gaps.</td></tr>
                      )}
                    </tbody>
                  </table>
                </section>
                {(stats.insufficient_kb && stats.insufficient_kb.length > 0) && (
                  <section>
                    <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500" /> Insufficient KB (retrieval pipeline)
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Queries where KB context was partial; answer used general knowledge.</p>
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-[#333]">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Query</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">Score</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-[#404040]">
                        {stats.insufficient_kb.slice().reverse().map((item) => (
                          <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-[#333]">
                            <td className="px-6 py-3 whitespace-nowrap text-xs text-gray-500">{new Date(item.timestamp).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</td>
                            <td className="px-6 py-3 text-sm text-izana-dark dark:text-izana-light max-w-md truncate" title={item.query_text}>{item.query_text || "—"}</td>
                            <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-400">{item.reason || "—"}</td>
                            <td className="px-6 py-3 text-sm font-medium text-amber-600">{(item.score * 100).toFixed(0)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                )}
              </div>

              {pendingImprovements.length > 0 && (
                <div className="mt-6 px-4">
                  <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">
                    Pending KB Improvements ({pendingImprovements.length})
                  </h4>
                  <div className="space-y-3">
                    {pendingImprovements.map((item) => (
                      <div key={item.id} className="p-4 bg-yellow-50 dark:bg-yellow-900/10 rounded-xl border border-yellow-200 dark:border-yellow-700/30">
                        <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                          <div>
                            <p className="text-sm font-medium text-izana-dark dark:text-izana-light">{item.question}</p>
                            <div className="flex gap-2 mt-1">
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-[#333] text-gray-600 dark:text-gray-400 font-medium">
                                {item.source}
                              </span>
                              {item.marker && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
                                  Marker: {item.marker}
                                </span>
                              )}
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                                {((item.confidence || 0) * 100).toFixed(0)}% match
                              </span>
                            </div>
                          </div>
                          <span className="text-[10px] text-gray-400">{new Date(item.timestamp).toLocaleString()}</span>
                        </div>
                        <textarea
                          value={answerDraft[item.id] || ""}
                          onChange={(e) => setAnswerDraft((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          placeholder="Provide a knowledge base answer to approve..."
                          rows={2}
                          className="w-full mt-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-[#404040] bg-white dark:bg-[#333] text-sm focus:outline-none focus:ring-2 focus:ring-izana-indigo/50"
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => handleApproveGap(item.id)}
                            disabled={actionLoading === item.id || !answerDraft[item.id]?.trim()}
                            className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
                          >
                            {actionLoading === item.id ? "..." : "Approve & Add to KB"}
                          </button>
                          <button
                            onClick={() => handleDismissGap(item.id)}
                            disabled={actionLoading === item.id}
                            className="px-3 py-1.5 bg-gray-200 dark:bg-[#404040] text-gray-600 dark:text-gray-300 text-xs rounded-lg hover:bg-gray-300 dark:hover:bg-[#555] disabled:opacity-50 font-medium"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              </>
            )}

            {/* DOCUMENT USAGE & KB SOURCES */}
            {activeTab === "documents" && (
              <div className="p-4 space-y-8">
                {stats.sources_ranking && stats.sources_ranking.length > 0 && (
                  <section>
                    <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Sources ranking (retrieval pipeline)</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">KB sources used in final context, by frequency.</p>
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-[#333]">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase w-28">Used</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-[#404040]">
                        {stats.sources_ranking.map((s, i) => (
                          <tr key={i} className="hover:bg-gray-50 dark:hover:bg-[#333]">
                            <td className="px-6 py-3 text-sm font-medium text-izana-dark dark:text-izana-light flex items-center gap-2">
                              <BookOpen className="w-4 h-4 text-izana-indigo" />{s.document}
                            </td>
                            <td className="px-6 py-3 text-sm font-bold text-izana-indigo">{s.frequency}x</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                )}
                <section>
                  <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Document usage (cited in responses)</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Documents from the knowledge base that were used to answer queries (when match score ≥ 85%).</p>
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-[#333]">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase w-32">Cited</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-[#404040]">
                      {sortedDocs.map(([docName, count], i) => (
                        <tr key={i} className="hover:bg-gray-50 dark:hover:bg-[#333]">
                          <td className="px-6 py-4 text-sm font-medium text-izana-dark dark:text-izana-light flex items-center gap-2">
                            <BookOpen className="w-4 h-4 text-izana-indigo" />{docName}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-izana-indigo font-bold">{count}x</td>
                        </tr>
                      ))}
                      {sortedDocs.length === 0 && (
                        <tr><td colSpan={2} className="p-8 text-center text-gray-400">No documents cited yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </section>
                {stats.kb_sources && stats.kb_sources.length > 0 && (
                  <section>
                    <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Knowledge base sources (frequency & keywords)</h4>
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-[#333]">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Document</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">Frequency</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Keywords / queries used for</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-[#404040]">
                        {stats.kb_sources.map((kb, i) => (
                          <tr key={i} className="hover:bg-gray-50 dark:hover:bg-[#333]">
                            <td className="px-6 py-4 text-sm font-medium text-izana-dark dark:text-izana-light flex items-center gap-2">
                              <BookOpen className="w-4 h-4 text-izana-indigo" />{kb.document}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-izana-indigo">{kb.frequency}</td>
                            <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                              {(kb.keywords || []).slice(0, 20).join(", ")}
                              {(kb.keywords?.length || 0) > 20 ? " …" : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                )}
                <section>
                  <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Which queries used which sources</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Recent query–source pairs (each row is a response that used a KB document).</p>
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-[#333]">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Query</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase w-28">When</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-[#404040]">
                      {(stats.doc_usage || []).slice(0, 50).map((u: AdminDocUsage, i: number) => (
                        <tr key={i} className="hover:bg-gray-50 dark:hover:bg-[#333]">
                          <td className="px-6 py-3 text-sm text-izana-dark dark:text-izana-light max-w-md truncate" title={u.question || ""}>{u.question || "—"}</td>
                          <td className="px-6 py-3 text-sm font-medium text-izana-indigo flex items-center gap-1">
                            <BookOpen className="w-3.5 h-3.5 shrink-0" />{u.document}
                          </td>
                          <td className="px-6 py-3 text-xs text-gray-500 whitespace-nowrap">
                            {u.timestamp ? new Date(u.timestamp).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—"}
                          </td>
                        </tr>
                      ))}
                      {(!stats.doc_usage || stats.doc_usage.length === 0) && (
                        <tr><td colSpan={3} className="p-8 text-center text-gray-400">No query–source pairs yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </section>
              </div>
            )}

            {/* USER FEEDBACK */}
            {activeTab === "feedback" && (
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-[#333]">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rating</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Query</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-[#404040]">
                  {stats.feedback.slice().reverse().map((fb: AdminFeedback, i: number) => (
                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-[#333]">
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${fb.rating >= 4 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                          {fb.rating}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 font-medium">{fb.reason || <span className="text-gray-400 italic">No reason</span>}</td>
                      <td className="px-6 py-4 text-sm text-gray-500 max-w-md truncate" title={fb.question}>{fb.question}</td>
                    </tr>
                  ))}
                  {stats.feedback.length === 0 && (
                    <tr><td colSpan={3} className="p-8 text-center text-gray-400">No feedback received yet.</td></tr>
                  )}
                </tbody>
              </table>
            )}

            {/* USER ANALYTICS */}
            {activeTab === "analytics" && (
              <div className="p-6">
                {drillDown ? (
                  <div className="space-y-4">
                    <button onClick={() => setDrillDown(null)} className="text-sm text-izana-primary dark:text-izana-teal hover:underline flex items-center gap-1">
                      Back to overview
                    </button>
                    <h3 className="font-bold text-lg text-izana-dark dark:text-izana-light">
                      Session: {(drillDown as { userId?: string }).userId || "Unknown"}
                    </h3>
                    {Array.isArray((drillDown as { chats?: unknown[] }).chats) && ((drillDown as { chats: { id: string; title: string; messages: { role: string; content: string }[] }[] }).chats).map((chat) => (
                      <div key={chat.id} className="p-4 bg-gray-50 dark:bg-[#333] rounded-xl">
                        <p className="font-bold text-sm mb-2">{chat.title}</p>
                        {chat.messages?.map((m: { role: string; content: string }, mi: number) => (
                          <p key={mi} className={`text-xs mb-1 ${m.role === "user" ? "text-izana-primary" : "text-gray-600 dark:text-gray-400"}`}>
                            <strong>{m.role === "user" ? "User" : "AI"}:</strong> {m.content.slice(0, 200)}
                          </p>
                        ))}
                      </div>
                    ))}
                    {Array.isArray((drillDown as { bloodwork?: unknown[] }).bloodwork) && ((drillDown as { bloodwork: { id: string; summary: string | null; results: unknown }[] }).bloodwork).map((bw) => (
                      <div key={bw.id} className="p-4 bg-gray-50 dark:bg-[#333] rounded-xl">
                        <p className="font-bold text-sm mb-1">Bloodwork Upload</p>
                        <p className="text-xs text-gray-500">{bw.summary || "No summary"}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
                      <div className="p-4 bg-izana-primary/5 rounded-xl text-center">
                        <p className="text-2xl font-bold text-izana-primary">{analytics?.totalConversations ?? 0}</p>
                        <p className="text-xs text-gray-500 mt-1">Conversations (24h)</p>
                      </div>
                      <div className="p-4 bg-izana-coral/5 rounded-xl text-center">
                        <p className="text-2xl font-bold text-izana-coral">{analytics?.totalBloodwork ?? 0}</p>
                        <p className="text-xs text-gray-500 mt-1">Bloodwork Uploads</p>
                      </div>
                      <div className="p-4 bg-izana-teal/10 rounded-xl text-center">
                        <p className="text-2xl font-bold text-izana-primary dark:text-izana-teal">{analytics?.activeUsers ?? 0}</p>
                        <p className="text-xs text-gray-500 mt-1">Active Users</p>
                      </div>
                      <div className="p-4 bg-green-50 dark:bg-green-900/10 rounded-xl text-center">
                        <p className="text-2xl font-bold text-green-600">{analytics?.avgSessionDuration ? formatDuration(analytics.avgSessionDuration) : "—"}</p>
                        <p className="text-xs text-gray-500 mt-1">Avg Session</p>
                      </div>
                    </div>

                    {analytics?.sentimentBreakdown && (
                      <div className="mb-6">
                        <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Sentiment Breakdown</h4>
                        <div className="flex gap-4">
                          <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-900/10 rounded-xl">
                            <span className="text-green-600 font-bold">{analytics.sentimentBreakdown.positive}</span>
                            <span className="text-xs text-gray-500">Positive</span>
                          </div>
                          <div className="flex items-center gap-2 px-3 py-2 bg-yellow-50 dark:bg-yellow-900/10 rounded-xl">
                            <span className="text-yellow-600 font-bold">{analytics.sentimentBreakdown.neutral}</span>
                            <span className="text-xs text-gray-500">Neutral</span>
                          </div>
                          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/10 rounded-xl">
                            <span className="text-red-600 font-bold">{analytics.sentimentBreakdown.negative}</span>
                            <span className="text-xs text-gray-500">Negative</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {analytics?.topQuestionCategories && analytics.topQuestionCategories.length > 0 && (
                      <div className="mb-6">
                        <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                          <MessageSquare className="w-4 h-4 text-izana-indigo" /> Chat — Top question categories
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {analytics.topQuestionCategories.map((cat, i) => (
                            <span key={i} className="px-3 py-1.5 bg-izana-primary/10 text-izana-primary dark:text-izana-teal rounded-full text-xs font-medium">
                              {cat.category} ({cat.count})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {analytics?.bloodworkPatterns && analytics.bloodworkPatterns.length > 0 && (
                      <div className="mb-6">
                        <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                          <TestTube className="w-4 h-4 text-izana-coral" /> Bloodwork — Common out-of-range markers
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {analytics.bloodworkPatterns.map((p, i) => (
                            <span key={i} className="px-3 py-1.5 bg-red-500/10 text-red-600 rounded-full text-xs font-medium">
                              {p.marker} ({p.count})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {analytics?.deviceBreakdown && Object.keys(analytics.deviceBreakdown.browsers).length > 0 && (
                      <div className="mb-6">
                        <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                          <Monitor className="w-4 h-4" /> Device Info (GDPR Consented)
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="p-3 bg-gray-50 dark:bg-[#333] rounded-xl">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Browsers</p>
                            {Object.entries(analytics.deviceBreakdown.browsers).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
                              <div key={name} className="flex justify-between text-xs py-0.5">
                                <span className="text-gray-600 dark:text-gray-300">{name}</span>
                                <span className="font-bold text-izana-primary dark:text-izana-teal">{count}</span>
                              </div>
                            ))}
                          </div>
                          <div className="p-3 bg-gray-50 dark:bg-[#333] rounded-xl">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Operating Systems</p>
                            {Object.entries(analytics.deviceBreakdown.os).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
                              <div key={name} className="flex justify-between text-xs py-0.5">
                                <span className="text-gray-600 dark:text-gray-300">{name}</span>
                                <span className="font-bold text-izana-primary dark:text-izana-teal">{count}</span>
                              </div>
                            ))}
                          </div>
                          <div className="p-3 bg-gray-50 dark:bg-[#333] rounded-xl">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Timezones</p>
                            {Object.entries(analytics.deviceBreakdown.timezones).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => (
                              <div key={name} className="flex justify-between text-xs py-0.5">
                                <span className="text-gray-600 dark:text-gray-300 truncate mr-2">{name}</span>
                                <span className="font-bold text-izana-primary dark:text-izana-teal shrink-0">{count}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Recent Activity</h4>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {analytics?.recentActivities?.map((a) => (
                        <div
                          key={a.id}
                          className="flex items-center justify-between p-3 bg-gray-50 dark:bg-[#333] rounded-xl hover:bg-gray-100 dark:hover:bg-[#3a3a3a] transition-colors cursor-pointer"
                          onClick={() => handleDrillDown(a.userId)}
                        >
                          <div className="flex items-center gap-3">
                            <Activity className="w-4 h-4 text-gray-400" />
                            <div>
                              <p className="text-xs font-mono text-gray-500">{a.userId}</p>
                              <p className="text-sm font-medium text-izana-dark dark:text-izana-light">{a.type.replace(/_/g, " ")}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">{new Date(a.createdAt).toLocaleTimeString()}</span>
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          </div>
                        </div>
                      ))}
                      {(!analytics?.recentActivities || analytics.recentActivities.length === 0) && (
                        <p className="text-center text-gray-400 py-8">No recent activity.</p>
                      )}
                    </div>
                    {drillDownLoading && (
                      <div className="text-center py-4">
                        <RefreshCw className="w-5 h-5 animate-spin text-gray-400 mx-auto" />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* USERS LIST */}
            {activeTab === "users" && (
              <div className="p-2">
                {drillDown ? (
                  <div className="p-6 space-y-4">
                    <button onClick={() => setDrillDown(null)} className="text-sm text-izana-primary dark:text-izana-teal hover:underline flex items-center gap-1">
                      Back to user list
                    </button>
                    <h3 className="font-bold text-lg text-izana-dark dark:text-izana-light">
                      {(drillDown as { userId?: string }).userId || "Unknown"}
                    </h3>
                    {Array.isArray((drillDown as { chats?: unknown[] }).chats) && ((drillDown as { chats: { id: string; title: string; messages: { role: string; content: string }[] }[] }).chats).map((chat) => (
                      <div key={chat.id} className="p-4 bg-gray-50 dark:bg-[#333] rounded-xl">
                        <p className="font-bold text-sm mb-2">{chat.title}</p>
                        {chat.messages?.map((m: { role: string; content: string }, mi: number) => (
                          <p key={mi} className={`text-xs mb-1 ${m.role === "user" ? "text-izana-primary" : "text-gray-600 dark:text-gray-400"}`}>
                            <strong>{m.role === "user" ? "User" : "AI"}:</strong> {m.content.slice(0, 200)}
                          </p>
                        ))}
                      </div>
                    ))}
                    {Array.isArray((drillDown as { bloodwork?: unknown[] }).bloodwork) && ((drillDown as { bloodwork: { id: string; summary: string | null; results: unknown }[] }).bloodwork).map((bw) => (
                      <div key={bw.id} className="p-4 bg-gray-50 dark:bg-[#333] rounded-xl">
                        <p className="font-bold text-sm mb-1">Bloodwork Upload</p>
                        <p className="text-xs text-gray-500">{bw.summary || "No summary"}</p>
                      </div>
                    ))}
                    {Array.isArray((drillDown as { activities?: unknown[] }).activities) && (
                      <div>
                        <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Activity Log</h4>
                        <div className="space-y-1 max-h-64 overflow-y-auto">
                          {((drillDown as { activities: { id: string; type: string; createdAt: string; metadata: Record<string, unknown> }[] }).activities).map((act) => (
                            <div key={act.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-[#333] rounded-lg text-xs">
                              <span className="font-medium">{act.type.replace(/_/g, " ")}</span>
                              <span className="text-gray-400">{new Date(act.createdAt).toLocaleTimeString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="px-4 py-3 flex items-center gap-2 text-xs text-gray-500">
                      <span>Sort by:</span>
                      {(["activityCount", "messageCount", "chatCount", "bloodworkCount", "sessionDuration"] as const).map((key) => (
                        <button
                          key={key}
                          onClick={() => setUserSortKey(key)}
                          className={`px-2 py-1 rounded-lg transition-colors ${userSortKey === key ? "bg-izana-primary text-white" : "bg-gray-100 dark:bg-[#333] hover:bg-gray-200"}`}
                        >
                          {key === "activityCount" ? "Activity" : key === "messageCount" ? "Messages" : key === "chatCount" ? "Chats" : key === "bloodworkCount" ? "Bloodwork" : "Session"}
                        </button>
                      ))}
                    </div>
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-[#333]">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Joined</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Msgs</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Chats</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Blood</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Rating</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Sentiment</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Active</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Session</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-[#404040]">
                        {sortedUserList.map((u) => (
                          <tr
                            key={u.userId}
                            className="hover:bg-gray-50 dark:hover:bg-[#333] cursor-pointer transition-colors"
                            onClick={() => handleDrillDown(u.userId)}
                          >
                            <td className="px-4 py-3 text-xs font-mono text-izana-primary dark:text-izana-teal">{u.userId}</td>
                            <td className="px-4 py-3 text-xs text-gray-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                            <td className="px-4 py-3 text-center text-sm font-bold">{u.messageCount}</td>
                            <td className="px-4 py-3 text-center text-sm">{u.chatCount}</td>
                            <td className="px-4 py-3 text-center text-sm">{u.bloodworkCount}</td>
                            <td className="px-4 py-3 text-center text-sm">
                              {u.avgRating !== null ? (
                                <span className={`font-bold ${u.avgRating >= 4 ? "text-green-600" : u.avgRating >= 3 ? "text-yellow-600" : "text-red-600"}`}>
                                  {u.avgRating}
                                </span>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-center text-xs">
                              <span className="text-green-600">{u.thumbsUp}</span>
                              <span className="text-gray-300 mx-1">/</span>
                              <span className="text-red-500">{u.thumbsDown}</span>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-500">{new Date(u.lastActiveAt).toLocaleTimeString()}</td>
                            <td className="px-4 py-3 text-xs font-medium">{formatDuration(u.sessionDuration)}</td>
                          </tr>
                        ))}
                        {sortedUserList.length === 0 && (
                          <tr><td colSpan={9} className="p-8 text-center text-gray-400">No users in the last 24 hours.</td></tr>
                        )}
                      </tbody>
                    </table>
                    {drillDownLoading && (
                      <div className="text-center py-4">
                        <RefreshCw className="w-5 h-5 animate-spin text-gray-400 mx-auto" />
                      </div>
                    )}
                  </>
                )}
              </div>
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
    if (savedKey !== null && savedKey.length > 0) {
      setAdminKey(savedKey);
    }
    setChecking(false);
  }, []);

  if (checking) return null;

  return adminKey !== null ? (
    <Dashboard adminKey={adminKey} />
  ) : (
    <PinEntry onSuccess={(key) => setAdminKey(key)} />
  );
}
