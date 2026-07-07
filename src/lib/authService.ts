// ── Auth Service — admin-only login & user management ──

import { api, setTokens, clearToken } from "./apiClient";
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
      }

      return { success: true, isAdmin: true };
    } catch (err: unknown) {
      const error = err as Error;
      return {
        success: false,
        error: error.message || "Помилка з'єднання. Спробуйте ще раз.",
      };
    }
  }

  async fetchUsers(): Promise<AdminUser[]> {
    try {
      return await api.get<AdminUser[]>("/auth/users");
    } catch {
      return [];
    }
  }

  async createUser(user: {
    username: string;
    telegram: string;
    role: string;
    priceMonth: string;
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

  logout() {
    clearToken();
  }
}

export const authService = new AuthService();
