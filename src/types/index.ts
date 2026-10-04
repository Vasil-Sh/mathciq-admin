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

// ── Betting monitoring (admin) ──

export interface AdminUserOverview {
  id: number;
  username: string;
  role: string;
  telegram: string;
  priceMonth: number;
  startDate: string;
  endDate: string;
  createdAt: string;
  betCount: number;
  wins: number;
  losses: number;
  pending: number;
  totalStaked: number;
  totalProfit: number;
  winRate: number;
  roi: number;
  initialBank: number;
  manualAdjustments: number;
  currentBank: number;
}

export interface AdminUserBet {
  id: string;
  match: string;
  team1: string;
  team2: string;
  betType: string;
  odds: number;
  amount: number;
  stake: number | null;
  date: string;
  result: string;
  profit: number;
  game: string;
  currency: string;
  strategy: string;
  createdAt: string;
}
