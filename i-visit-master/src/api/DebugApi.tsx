// src/api/DebugApi.tsx
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export interface DebugOverstayLogRequest {
  visitorId: number;
  passId: number;
  hoursAgo: number;
}

export interface DebugOverstayLogResponse {
  logId: number;
  visitorId: number;
  passId: number | null;
  status: string;
  activeStart: string;
  hoursAgo: number;
}

export interface DebugArchiveLogRequest {
  visitorId: number;
  daysAgoEnded: number;
}

export interface DebugArchiveLogResponse {
  logId: number;
  visitorId: number;
  status: string;
  activeStart: string;
  activeEnd: string;
  daysAgoEnded: number;
}

export async function createDebugOverstayLog(
  payload: DebugOverstayLogRequest
): Promise<DebugOverstayLogResponse> {
  const res = await fetch(`${API_BASE_URL}/api/debug/overstay-log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "Failed to create debug overstay log.");
  }

  return res.json();
}

export async function createDebugArchiveLog(
  payload: DebugArchiveLogRequest
): Promise<DebugArchiveLogResponse> {
  const res = await fetch(`${API_BASE_URL}/api/debug/archive-log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "Failed to create debug archive log.");
  }

  return res.json();
}
