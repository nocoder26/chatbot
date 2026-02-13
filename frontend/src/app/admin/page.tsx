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
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-
