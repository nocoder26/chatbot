const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// --- Types ---

export interface LabResult {
  name: string;
  value: string;
  unit: string;
}

export interface ChatPayload {
  message: string;
  language: string;
  clinical_data?: { results: LabResult[] } | null;
  treatment?: string;
}

export interface ChatResponse {
  response: string;
  citations: string[];
  suggested_questions: string[];
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
  error?: string;
}

export interface AdminStats {
  gaps: AdminGap[];
  feedback: AdminFeedback[];
  doc_usage: AdminDocUsage[];
}

export interface AdminGap {
  timestamp: string;
  question: string;
  score: number;
  type: string;
}

export interface AdminFeedback {
  timestamp: string;
  rating: number;
  question: string;
  reason: string;
}

export interface AdminDocUsage {
  timestamp: string;
  document: string;
}

// --- API Functions ---

export async function sendChatMessage(payload: ChatPayload): Promise<ChatResponse> {
  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "Unknown error");
    throw new Error(`Chat request failed (${response.status}): ${detail}`);
  }

  return response.json();
}

export async function submitFeedback(feedback: FeedbackPayload): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(feedback),
  });

  if (!response.ok) {
    throw new Error("Failed to submit feedback");
  }
}

export async function analyzeBloodWork(file: File): Promise<BloodWorkResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/analyze-bloodwork`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "Unknown error");
    throw new Error(`Blood work analysis failed (${response.status}): ${detail}`);
  }

  return response.json();
}

export async function verifyAdminPin(pin: string): Promise<{ authenticated: boolean; admin_key: string }> {
  const response = await fetch(`${API_BASE_URL}/admin/verify-pin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  });

  if (!response.ok) {
    throw new Error("Authentication failed");
  }

  return response.json();
}

export async function fetchAdminStats(adminKey: string): Promise<AdminStats> {
  const response = await fetch(`${API_BASE_URL}/admin/stats`, {
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
