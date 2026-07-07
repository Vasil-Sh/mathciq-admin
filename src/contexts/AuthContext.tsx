// ── Auth Context — admin-only (no regular users allowed) ──

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { authService } from "@/lib/authService";
import { clearToken } from "@/lib/apiClient";
import type { LoginResult } from "@/types";

interface AuthUser {
  username: string;
  role: "admin";
}

interface AuthContextType {
  user: AuthUser | null;
  isAdmin: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  isVerifying: boolean;
  login: (username: string, password: string) => Promise<LoginResult>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

function getStoredUser(): AuthUser | null {
  const username = localStorage.getItem("username");
  const role = localStorage.getItem("userRole");
  const token = localStorage.getItem("authToken");
  // Only allow admin role
  if (username && role === "admin" && token) {
    return { username, role: "admin" };
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser);
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(!!getStoredUser());

  // Validate token on mount
  useEffect(() => {
    const token = localStorage.getItem("authToken");
    if (!token) {
      setIsVerifying(false);
      return;
    }

    const base = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
    (async () => {
      try {
        const res = await fetch(`${base}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Token invalid");
        const data = await res.json();

        // Kick out non-admins
        if (data.role !== "admin") {
          clearToken();
          setUser(null);
          return;
        }

        setUser({ username: data.username, role: "admin" });
        localStorage.setItem("userRole", "admin");
        localStorage.setItem("username", data.username);
      } catch {
        clearToken();
        setUser(null);
      } finally {
        setIsVerifying(false);
      }
    })();
  }, []);

  // Listen for storage changes + auth:logout events
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "authToken" && !e.newValue) {
        setUser(null);
      }
    };
    const handleLogout = () => setUser(null);

    window.addEventListener("storage", handleStorage);
    window.addEventListener("auth:logout", handleLogout);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("auth:logout", handleLogout);
    };
  }, []);

  const login = useCallback(
    async (username: string, password: string): Promise<LoginResult> => {
      setIsLoading(true);
      try {
        const result = await authService.login(username, password);
        if (result.success) {
          setUser({ username, role: "admin" });
        }
        return result;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const logout = useCallback(() => {
    authService.logout();
    setUser(null);
    window.dispatchEvent(new Event("auth:logout"));
  }, []);

  const value: AuthContextType = {
    user,
    isAdmin: !!user,
    isAuthenticated: !!user,
    isLoading,
    isVerifying,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
