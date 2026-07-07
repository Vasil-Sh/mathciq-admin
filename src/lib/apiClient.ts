// ── API Client — same as main app, JWT-based ──

const BASE =
  import.meta.env.VITE_API_URL || "http://localhost:3001/api";

let authToken: string | null = localStorage.getItem("authToken");
let refreshToken: string | null = localStorage.getItem("refreshToken");

export function setTokens(access: string, refresh: string) {
  authToken = access;
  refreshToken = refresh;
  localStorage.setItem("authToken", access);
  localStorage.setItem("refreshToken", refresh);
}

export function clearToken() {
  authToken = null;
  refreshToken = null;
  localStorage.removeItem("authToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("username");
  localStorage.removeItem("userRole");
}

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.token) {
      setTokens(data.token, data.refreshToken || refreshToken);
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

  let res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Auto-refresh on 401
  if (res.status === 401 && refreshToken) {
    const ok = await refreshAccessToken();
    if (ok) {
      headers["Authorization"] = `Bearer ${authToken}`;
      res = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const error: Error & { status?: number; data?: unknown } = new Error(
      (err as { error?: string }).error ||
        (err as { message?: string }).message ||
        `HTTP ${res.status}`
    );
    error.status = res.status;
    error.data = err;
    throw error;
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) =>
    request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) =>
    request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
