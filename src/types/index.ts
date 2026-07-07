// ── Shared types for MathIQ Admin ──

export interface AdminUser {
  id: number;
  username: string;
  role: string;
  telegram: string;
  priceMonth: string;
  startDate: string;
  endDate: string;
  createdAt?: string;
}

export interface UserData {
  id?: number;
  telegram: string;
  username: string;
  priceMonth: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  isAdmin: boolean;
  daysUntilExpiry?: number;
}

export interface LoginResult {
  success: boolean;
  error?: string;
  isAdmin?: boolean;
}

export type StatusFilter = "all" | "active" | "expired";
export type SortDirection = "asc" | "desc" | null;
