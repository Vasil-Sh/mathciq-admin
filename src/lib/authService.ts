// ── Auth Service — admin-only login & user management ──

import { api, setTokens, clearToken, getAuthToken, getApiBase } from "./apiClient";
import type { LoginResult, AdminUser } from "@/types";

class AuthService {
  async login(username: string, password: string): Promise<LoginResult> {
    try {
      const data = await api.post<{
        success: boolean;
        isAdmin?: boolean;
        token?: string;
        refreshToken?: string;
        error?: string;
        user?: { isOwner?: boolean };
      }>("/auth/login", { username, password });

      if (!data.success) {
        return {
          success: false,
          error: data.error || "Невірний логін або пароль",
        };
      }

      // Only admins allowed
      if (!data.isAdmin) {
        return {
          success: false,
          error: "Доступ лише для адміністраторів. Ваш обліковий запис не має прав адміністратора.",
        };
      }

      if (data.token) {
        setTokens(data.token, data.refreshToken || "");
        localStorage.setItem("userRole", "admin");
        localStorage.setItem("username", username);
        localStorage.setItem("isOwner", data.user?.isOwner ? "1" : "0");
      }

      return { success: true, isAdmin: true, isOwner: !!data.user?.isOwner };
    } catch (err: unknown) {
      const error = err as Error;
      return {
        success: false,
        error: error.message || "Помилка з'єднання. Спробуйте ще раз.",
      };
    }
  }

  /** Throws on failure — an empty array would look like "no users". */
  async fetchUsers(): Promise<AdminUser[]> {
    return api.get<AdminUser[]>("/auth/users");
  }

  async createUser(user: {
    username: string;
    telegram: string;
    role: string;
    priceMonth: string;
    startDate: string;
    endDate: string;
  }) {
    return api.post<{ username: string; password: string }>(
      "/auth/register",
      user
    );
  }

  async updateUser(id: number, updates: Partial<AdminUser>) {
    return api.put<{ success: boolean }>(`/auth/users/${id}`, updates);
  }

  async deleteUser(id: number) {
    return api.delete<{ success: boolean }>(`/auth/users/${id}`);
  }

  async resetPassword(id: number) {
    return api.post<{ username: string; password: string }>(`/auth/users/${id}/reset-password`);
  }

  /** Revokes the session on the server (incl. the refresh token), then clears it locally. */
  logout() {
    const refreshToken = localStorage.getItem("refreshToken");
    const accessToken = getAuthToken();
    // Plain fetch, not api.post: an expired access token must not trigger the
    // refresh/"session expired" flow during a normal logout. Fire-and-forget —
    // local logout never waits for the network.
    fetch(`${getApiBase()}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify(refreshToken ? { refreshToken } : {}),
      keepalive: true,
    }).catch(() => {});
    clearToken();
  }
}

export const authService = new AuthService();
