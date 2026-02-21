import {
  startRegistration,
  startAuthentication,
} from "@simplewebauthn/browser";

/**
 * Runtime API URL resolver.
 */
export function resolveApiUrl(path: string): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host.endsWith(".vercel.app") || host.endsWith(".vercel.sh")) {
      return path;
    }
  }
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
  return `${base}${path}`;
}

// --- Types ---

export interface LabResult {
  name: string;
  value: string;
  unit: string;
}

export interface ChatPayload {
  message: string;
  language: string;
  chatId?: string;
  clinical_data?: { results: LabResult[] } | null;
  treatment?: string;
}

// PHASE 5: KB reference type for chat responses
export interface KBReference {
  doc_id: string;
  chunk_id: string;
  score: number;
  text_preview?: string;
}

export interface ChatResponse {
  response: string;
  citations: string[];
  suggested_questions: string[];
  offTopic?: boolean;
  kbReferences?: KBReference[];
  kbGap?: boolean;
}

export interface FeedbackPayload {
  question: string;
  answer: string;
  rating: number;
  reason: string;
  suggested_questions: string[];
}

export interface BloodWorkResponse {
  results: LabResult[];
  summary?: string;
  fertility_note?: string;
  suggested_questions?: string[];
  error?: string;
}

export interface BloodWorkResultWithStatus extends LabResult {
  status?: "In Range" | "Out of Range";
}

export interface UserProfile {
  user: { id: string; username: string; avatarUrl: string | null };
  chats: {
    id: string;
    title: string;
    createdAt: string;
    messageCount: number;
  }[];
  bloodwork: {
    id: string;
    results: BloodWorkResultWithStatus[];
    summary: string | null;
    createdAt: string;
  }[];
}

export interface KbSource {
  document: string;
  frequency: number;
  keywords: string[];
}

export interface InsufficientKbItem {
  id: string;
  query_text: string;
  reason: string;
  score: number;
  top_context?: string[];
  timestamp: string;
}

export interface SourceRankItem {
  document: string;
  frequency: number;
}

export interface AdminStats {
  gaps: AdminGap[];
  gapsChat: AdminGap[];
  gapsBloodwork: AdminGap[];
  feedback: AdminFeedback[];
  doc_usage: AdminDocUsage[];
  kb_sources?: KbSource[];
  insufficient_kb?: InsufficientKbItem[];
  sources_ranking?: SourceRankItem[];
}

export interface AdminGap {
  id?: string;
  timestamp: string;
  question: string;
  score: number;
  type: string;
  marker?: string | null;
  source?: string;
}

export interface AdminFeedback {
  timestamp: string;
  rating: number;
  question: string;
  reason: string;
}

export interface AdminDocUsage {
  document: string;
  question?: string;
  timestamp?: string;
}

export interface UserAnalytics {
  activeUsers: number;
  totalConversations: number;
  totalBloodwork: number;
  recentActivities: {
    id: string;
    userId: string;
    type: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }[];
  topQuestionCategories: { category: string; count: number }[];
  bloodworkPatterns: { marker: string; count: number }[];
  sentimentBreakdown?: { positive: number; negative: number; neutral: number };
  avgSessionDuration?: number;
  deviceBreakdown?: {
    browsers: Record<string, number>;
    os: Record<string, number>;
    screens: Record<string, number>;
    timezones: Record<string, number>;
  };
}

export interface AdminUser {
  userId: string;
  fullId: string;
  createdAt: string;
  messageCount: number;
  chatCount: number;
  bloodworkCount: number;
  activityCount: number;
  avgRating: number | null;
  lastActiveAt: string;
  sessionDuration: number;
  thumbsUp: number;
  thumbsDown: number;
}

export interface AuthCheckResult {
  exists: boolean;
  hasPasskey: boolean;
  hasPassphrase: boolean;
}

// --- Helper ---

function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("izana_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

// --- Auth: Registration & Login ---

export async function fetchRegisterOptions(): Promise<{
  usernames: string[];
  avatarUrls: string[];
}> {
  const response = await fetch(resolveApiUrl("/api/register-options"));
  if (!response.ok) {
    throw new Error("Failed to fetch registration options");
  }
  return response.json();
}

function getStoredDeviceInfo(): Record<string, string> | undefined {
  if (typeof window === "undefined") return undefined;
  const consent = localStorage.getItem("izana_cookie_consent");
  if (consent !== "all") return undefined;
  try {
    return JSON.parse(localStorage.getItem("izana_device_info") || "");
  } catch {
    return undefined;
  }
}

export async function registerAnonymous(payload: {
  username: string;
  avatarUrl: string;
  passphrase?: string;
}): Promise<{
  token: string;
  user: { id: string; username: string; avatarUrl: string | null };
}> {
  const deviceInfo = getStoredDeviceInfo();
  const response = await fetch(resolveApiUrl("/api/register-anonymous"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, ...(deviceInfo && { deviceInfo }) }),
  });
  if (!response.ok) {
    const err = await response
      .json()
      .catch(() => ({ error: "Registration failed" }));
    throw new Error(err.error || "Registration failed");
  }
  return response.json();
}

export async function checkAuthMethods(
  username: string
): Promise<AuthCheckResult> {
  const response = await fetch(resolveApiUrl("/api/auth/passkey/check"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  if (!response.ok) {
    throw new Error("Auth check failed");
  }
  return response.json();
}

export async function loginWithPassphrase(
  username: string,
  passphrase: string
): Promise<{
  token: string;
  user: { id: string; username: string; avatarUrl: string | null };
}> {
  const deviceInfo = getStoredDeviceInfo();
  const response = await fetch(resolveApiUrl("/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, passphrase, ...(deviceInfo && { deviceInfo }) }),
  });
  if (!response.ok) {
    const err = await response
      .json()
      .catch(() => ({ error: "Login failed" }));
    throw new Error(err.error || "Login failed");
  }
  return response.json();
}

// --- Passkey Registration ---

export async function passkeyRegister(
  username: string,
  avatarUrl?: string
): Promise<{
  token: string;
  user: { id: string; username: string; avatarUrl: string | null };
}> {
  // Step 1: Get registration options from server
  const optionsRes = await fetch(
    resolveApiUrl("/api/auth/passkey/register-options"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    }
  );
  if (!optionsRes.ok) {
    const err = await optionsRes.json().catch(() => ({ error: "Failed" }));
    throw new Error(err.error || "Failed to get passkey options");
  }
  const options = await optionsRes.json();

  // Step 2: Create credential via browser WebAuthn API
  const attestation = await startRegistration({ optionsJSON: options });

  // Step 3: Verify with server and get JWT
  const verifyRes = await fetch(
    resolveApiUrl("/api/auth/passkey/register-verify"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, attestation, avatarUrl }),
    }
  );
  if (!verifyRes.ok) {
    const err = await verifyRes.json().catch(() => ({ error: "Failed" }));
    throw new Error(err.error || "Passkey registration failed");
  }
  return verifyRes.json();
}

// --- Passkey Login ---

export async function passkeyLogin(username: string): Promise<{
  token: string;
  user: { id: string; username: string; avatarUrl: string | null };
}> {
  // Step 1: Get authentication options
  const optionsRes = await fetch(
    resolveApiUrl("/api/auth/passkey/login-options"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    }
  );
  if (!optionsRes.ok) {
    const err = await optionsRes.json().catch(() => ({ error: "Failed" }));
    throw new Error(err.error || "Failed to get login options");
  }
  const options = await optionsRes.json();

  // Step 2: Authenticate via browser WebAuthn API
  const assertion = await startAuthentication({ optionsJSON: options });

  // Step 3: Verify with server
  const verifyRes = await fetch(
    resolveApiUrl("/api/auth/passkey/login-verify"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, assertion }),
    }
  );
  if (!verifyRes.ok) {
    const err = await verifyRes.json().catch(() => ({ error: "Failed" }));
    throw new Error(err.error || "Passkey login failed");
  }
  return verifyRes.json();
}

// --- Chat ---

export interface ChatMessageFromServer {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

export interface ChatMessagesResponse {
  chatId: string;
  title: string;
  messages: ChatMessageFromServer[];
}

export async function fetchChatMessages(
  chatId: string
): Promise<ChatMessagesResponse> {
  const response = await fetch(
    resolveApiUrl(`/api/chat/${encodeURIComponent(chatId)}/messages`),
    { headers: getAuthHeaders() }
  );
  if (!response.ok) {
    if (response.status === 404) throw new Error("Chat not found");
    throw new Error("Failed to load chat messages");
  }
  return response.json();
}

export async function sendChatMessage(
  payload: ChatPayload,
  onChunk: (chunk: any) => void,
  onComplete: () => void,
  onError: (error: Error) => void
): Promise<void> {
  try {
    const response = await fetch(resolveApiUrl("/api/chat"), {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ ...payload, stream: true }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "Unknown error");
      onError(new Error(`Chat request failed (${response.status}): ${detail}`));
      return;
    }

    if (!response.body) {
      onError(new Error("Response body is null"));
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        onComplete();
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith("data: ")) {
          try {
            const data = JSON.parse(trimmedLine.slice(6));
            onChunk(data);
          } catch (e) {
            console.error("Failed to parse SSE data:", e);
          }
        }
      }
    }
  } catch (error) {
    onError(error as Error);
  }
}

export async function submitFeedback(
  feedback: FeedbackPayload
): Promise<void> {
  try {
    await fetch(resolveApiUrl("/api/feedback"), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(feedback),
    });
  } catch {
    // fire-and-forget
  }
}

export async function analyzeBloodWork(
  file: File,
  language: string = "en"
): Promise<BloodWorkResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("language", language);

  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("izana_token")
      : null;
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(resolveApiUrl("/api/analyze-bloodwork"), {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "Unknown error");
    throw new Error(
      `Blood work analysis failed (${response.status}): ${detail}`
    );
  }

  return response.json();
}

// --- Profile ---

export async function fetchUserProfile(
  username: string
): Promise<UserProfile> {
  const response = await fetch(
    resolveApiUrl(
      `/api/user-profile/${encodeURIComponent(username)}`
    ),
    { headers: getAuthHeaders() }
  );
  if (!response.ok) {
    throw new Error("Failed to fetch profile");
  }
  return response.json();
}

export async function deleteChat(
  username: string,
  chatId: string
): Promise<void> {
  const response = await fetch(
    resolveApiUrl(
      `/api/user-profile/${encodeURIComponent(username)}/chats/${chatId}`
    ),
    { method: "DELETE", headers: getAuthHeaders() }
  );
  if (!response.ok) {
    throw new Error("Failed to delete chat");
  }
}

// --- Admin ---

export async function verifyAdminPin(
  pin: string
): Promise<{ authenticated: boolean; admin_key: string }> {
  const response = await fetch(resolveApiUrl("/api/admin/verify-pin"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  });
  if (!response.ok) {
    throw new Error("Authentication failed");
  }
  return response.json();
}

export async function fetchAdminStats(
  adminKey: string
): Promise<AdminStats> {
  const response = await fetch(resolveApiUrl("/api/admin/stats"), {
    headers: { "X-Admin-Key": adminKey },
  });
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Unauthorized - invalid admin key");
    }
    throw new Error("Failed to fetch admin stats");
  }
  return response.json();
}

export async function fetchUserAnalytics(
  adminKey: string
): Promise<UserAnalytics> {
  const response = await fetch(
    resolveApiUrl("/api/admin/user-analytics"),
    { headers: { "X-Admin-Key": adminKey } }
  );
  if (!response.ok) {
    throw new Error("Failed to fetch user analytics");
  }
  return response.json();
}

export async function fetchUserDrillDown(
  adminKey: string,
  userId: string
): Promise<Record<string, unknown>> {
  const response = await fetch(
    resolveApiUrl(`/api/admin/user-analytics/${userId}`),
    { headers: { "X-Admin-Key": adminKey } }
  );
  if (!response.ok) {
    throw new Error("Failed to fetch user details");
  }
  return response.json();
}

export async function fetchAdminUsers(
  adminKey: string
): Promise<{ users: AdminUser[] }> {
  const response = await fetch(resolveApiUrl("/api/admin/users"), {
    headers: { "X-Admin-Key": adminKey },
  });
  if (!response.ok) {
    throw new Error("Failed to fetch users");
  }
  return response.json();
}

// --- GDPR Consent ---

export interface ConsentStatus {
  hasConsent: boolean;
  reason?: string;
  consentId?: string;
  version?: string;
  healthDataConsent?: boolean;
  modelTrainingConsent?: boolean;
  grantedAt?: string;
}

export async function grantConsent(payload: {
  healthDataConsent: boolean;
  modelTrainingConsent: boolean;
}): Promise<{ success: boolean; consentId: string; version: string }> {
  const response = await fetch(resolveApiUrl("/api/consent"), {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Failed" }));
    throw new Error(err.error || "Failed to record consent");
  }
  return response.json();
}

export async function fetchConsentStatus(): Promise<ConsentStatus> {
  const response = await fetch(resolveApiUrl("/api/consent/status"), {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Failed to check consent status");
  }
  return response.json();
}

export async function withdrawConsent(): Promise<{ success: boolean }> {
  const response = await fetch(resolveApiUrl("/api/consent/withdraw"), {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Failed to withdraw consent");
  }
  return response.json();
}

// --- GDPR User Rights ---

export async function exportUserData(): Promise<Blob> {
  const response = await fetch(resolveApiUrl("/api/gdpr/export"), {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Failed to export data");
  }
  return response.blob();
}

export async function deleteUserData(): Promise<{ success: boolean; deletionRequestId: string }> {
  const response = await fetch(resolveApiUrl("/api/gdpr/delete"), {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Failed to delete data");
  }
  return response.json();
}

export async function restrictProcessing(): Promise<{ success: boolean }> {
  const response = await fetch(resolveApiUrl("/api/gdpr/restrict"), {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error("Failed to restrict processing");
  }
  return response.json();
}

export async function rateMessage(messageId: string, rating: number): Promise<{ ok: boolean }> {
  const response = await fetch(resolveApiUrl("/api/chat/rate"), {
    method: "POST",
    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ messageId, rating }),
  });
  if (!response.ok) throw new Error("Failed to rate message");
  return response.json();
}

export async function fetchKnowledgeGaps(adminKey: string): Promise<{
  lowQualityResponses: Array<{ question: string; category: string; qualityScore: number }>;
  underperformingCategories: Array<{ category: string; avgScore: number; sampleCount: number }>;
  totalGaps: number;
}> {
  const response = await fetch(resolveApiUrl("/api/admin/knowledge-gaps"), {
    headers: { "x-admin-key": adminKey },
  });
  if (!response.ok) throw new Error("Failed to fetch knowledge gaps");
  return response.json();
}

export interface PendingImprovement {
  id: string;
  question: string;
  marker: string | null;
  source: string;
  category: string;
  confidence: number;
  timestamp: string;
}

export async function fetchPendingImprovements(adminKey: string): Promise<{ total: number; items: PendingImprovement[] }> {
  const response = await fetch(resolveApiUrl("/api/admin/pending-improvements"), {
    headers: { "X-Admin-Key": adminKey },
  });
  if (!response.ok) throw new Error("Failed to fetch pending improvements");
  return response.json();
}

export async function approveGap(adminKey: string, gapId: string, answer: string): Promise<{ ok: boolean }> {
  const response = await fetch(resolveApiUrl("/api/admin/approve-gap"), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
    body: JSON.stringify({ gapId, answer, action: "approve" }),
  });
  if (!response.ok) throw new Error("Failed to approve gap");
  return response.json();
}

export async function dismissGap(adminKey: string, gapId: string): Promise<{ ok: boolean }> {
  const response = await fetch(resolveApiUrl("/api/admin/approve-gap"), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
    body: JSON.stringify({ gapId, action: "dismiss" }),
  });
  if (!response.ok) throw new Error("Failed to dismiss gap");
  return response.json();
}

// PHASE 6: Query document tracking types and API
export interface QueryDocumentItem {
  id: string;
  timestamp: string;
  query: string;
  sources: { doc_id: string; score: number }[];
  sufficiency: string;
  usedGeneralKnowledge: boolean;
}

export interface QueryDocumentsResponse {
  total: number;
  items: QueryDocumentItem[];
}

export async function fetchQueryDocuments(adminKey: string): Promise<QueryDocumentsResponse> {
  const response = await fetch(resolveApiUrl("/api/admin/query-documents"), {
    headers: { "X-Admin-Key": adminKey },
  });
  if (!response.ok) throw new Error("Failed to fetch query documents");
  return response.json();
}

export type ClearTestDataResult = {
  ok: boolean;
  deleted: {
    messages: number;
    chats: number;
    bloodwork: number;
    activities: number;
    consents: number;
    pushSubs: number;
    webauthn: number;
    users: number;
    trainingFeedback?: number;
    anonymizedQA?: number;
    anonymizedBloodwork?: number;
    analytics?: number;
  };
};

export async function clearAdminTestData(
  adminKey: string,
  options?: { includeTier2And3?: boolean }
): Promise<ClearTestDataResult> {
  const response = await fetch(resolveApiUrl("/api/admin/clear-test-data"), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
    body: JSON.stringify(options ?? {}),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || err?.error || "Failed to clear test data");
  }
  return response.json();
}

// --- Valkey Real-time Stats (Phase 10) ---

export interface ValkeyStats {
  available: boolean;
  message?: string;
  gaps?: {
    total: number;
    by_source: Record<string, number>;
    avg_score: number;
    recent_queries: { query: string; score: number; source: string; timestamp: string }[];
  };
  sessions?: {
    active_count: number;
  };
  feedback?: {
    total: number;
    avg_rating: string;
    sentiment: { positive: number; neutral: number; negative: number };
  };
  telemetry?: {
    device_breakdown: {
      browsers: Record<string, number>;
      os: Record<string, number>;
      screens: Record<string, number>;
    };
  };
  training_data?: {
    files: { file: string; records: number; size_mb: string }[];
    total_records: number;
    total_size_mb: string;
  };
}

export async function fetchValkeyStats(adminKey: string): Promise<ValkeyStats> {
  const response = await fetch(resolveApiUrl("/api/admin/valkey-stats"), {
    headers: { "X-Admin-Key": adminKey },
  });
  if (!response.ok) throw new Error("Failed to fetch Valkey stats");
  return response.json();
}

export interface RealtimeGap {
  query: string;
  source: string;
  highest_score: number;
  treatment?: string;
  timestamp: string;
  chat_history_length: number;
}

export async function fetchRealtimeGaps(adminKey: string): Promise<{ total: number; gaps: RealtimeGap[] }> {
  const response = await fetch(resolveApiUrl("/api/admin/gaps-realtime"), {
    headers: { "X-Admin-Key": adminKey },
  });
  if (!response.ok) throw new Error("Failed to fetch realtime gaps");
  return response.json();
}

// --- Push Notifications (PWA) ---

export async function fetchVapidKey(): Promise<{ publicKey: string }> {
  const response = await fetch(resolveApiUrl("/api/push/vapid-key"));
  if (!response.ok) throw new Error("Push not available");
  return response.json();
}

export async function subscribePush(subscription: PushSubscriptionJSON): Promise<{ ok: boolean }> {
  const response = await fetch(resolveApiUrl("/api/push/subscribe"), {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ subscription }),
  });
  if (!response.ok) throw new Error("Push subscribe failed");
  return response.json();
}

export async function unsubscribePush(endpoint: string): Promise<{ ok: boolean }> {
  const response = await fetch(resolveApiUrl("/api/push/unsubscribe"), {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ endpoint }),
  });
  if (!response.ok) throw new Error("Push unsubscribe failed");
  return response.json();
}
