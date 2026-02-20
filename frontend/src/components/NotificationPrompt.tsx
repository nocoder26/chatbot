"use client";

import { useState, useEffect } from "react";
import { Bell, X } from "lucide-react";
import { fetchVapidKey, subscribePush } from "@/lib/api";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
}

export default function NotificationPrompt() {
  const [visible, setVisible] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const dismissed = localStorage.getItem("izana_push_dismissed");
    if (dismissed === "true") return;

    navigator.serviceWorker.register("/sw.js").then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        setSubscribed(true);
        return;
      }
      const token = localStorage.getItem("izana_token");
      if (token) {
        setTimeout(() => setVisible(true), 5000);
      }
    }).catch(() => {});
  }, []);

  const handleEnable = async () => {
    setLoading(true);
    try {
      const { publicKey } = await fetchVapidKey();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
      });
      await subscribePush(sub.toJSON());
      setSubscribed(true);
      setVisible(false);
    } catch (err) {
      console.error("Push subscribe error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    setVisible(false);
    localStorage.setItem("izana_push_dismissed", "true");
  };

  if (!visible || subscribed) return null;

  return (
    <div className="fixed bottom-20 right-4 z-[9998] max-w-xs animate-in slide-in-from-right pointer-events-none">
      <div className="bg-white dark:bg-[#2a2a2a] rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 p-4 pointer-events-auto">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-izana-indigo/10 rounded-full shrink-0">
            <Bell className="w-5 h-5 text-izana-indigo" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-izana-dark dark:text-izana-light">Stay Updated</p>
            <p className="text-xs text-gray-500 mt-0.5">Get gentle reminders about your health journey.</p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleEnable}
                disabled={loading}
                className="px-3 py-1.5 bg-izana-indigo text-white text-xs rounded-lg hover:opacity-90 disabled:opacity-50 font-medium"
              >
                {loading ? "..." : "Enable"}
              </button>
              <button
                onClick={handleDismiss}
                className="px-3 py-1.5 text-gray-500 text-xs hover:text-gray-700 font-medium"
              >
                Not now
              </button>
            </div>
          </div>
          <button onClick={handleDismiss} className="text-gray-400 hover:text-gray-600 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
