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
  localStorage.removeItem("isOwner");
}

/** Current access token (for raw fetch calls such as multipart uploads). */
export function getAuthToken(): string | null {
  return authToken;
}

export function getApiBase(): string {
  return BASE;
}

// One refresh at a time: parallel requests that hit 401 together share the
// same in-flight refresh instead of each sending their own.
let refreshInFlight: Promise<boolean> | null = null;

function refreshAccessToken(): Promise<boolean> {
  if (!refreshToken) return Promise.resolve(false);
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function doRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.token) {
      setTokens(data.token, data.refreshToken || refreshToken || "");
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

/** Session is gone for good: drop tokens and let AuthContext send the user to /login. */
function endSession() {
  clearToken();
  window.dispatchEvent(new CustomEvent("auth:logout", { detail: { reason: "expired" } }));
}

/** Sends a request with auth, refreshing the token once on 401. Throws on non-2xx. */
async function send(method: string, path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  // Only a request made with a session can "lose" it — a wrong password on
  // /auth/login also returns 401 and must not trigger a logout.
  const hadSession = !!authToken;

  let res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Auto-refresh on 401
  if (res.status === 401 && hadSession) {
    const ok = await refreshAccessToken();
    if (ok) {
      headers["Authorization"] = `Bearer ${authToken}`;
      res = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    }
    if (res.status === 401) endSession();
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
  return res;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await send(method, path, body);
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
  /** GET a file (e.g. CSV export) with the same auth + token refresh as JSON calls. */
  download: async (path: string): Promise<Blob> => (await send("GET", path)).blob(),
};
