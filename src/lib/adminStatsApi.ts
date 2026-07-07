// ── Admin Stats API ──

import { api } from "./apiClient";

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  adminUsers: number;
  inactiveUsers: number;
  mrr: number;
  betsThisWeek: number;
  winsThisWeek: number;
  lossesThisWeek: number;
  totalProfit: number;
  telegramGroups: number;
  registrationsByMonth: { month: string; count: number }[];
  topUsers: { username: string; betCount: number }[];
  expiringSubscriptions: {
    username: string;
    telegram: string;
    endDate: string;
    priceMonth: number;
  }[];
}

export async function fetchAdminStats(): Promise<AdminStats> {
  return api.get<AdminStats>("/admin/stats");
}
