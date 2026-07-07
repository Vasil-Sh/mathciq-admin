import { api } from "./apiClient";

export interface AdminStats {
  totalUsers: number; activeUsers: number; adminUsers: number; inactiveUsers: number;
  newThisMonth: number; mrr: number; totalRevenue: number;
  revenueByMonth: { month: string; revenue: number }[];
  registrationsByMonth: { month: string; count: number }[];
  topUsers: { username: string; telegram: string; revenue: number; endDate: string }[];
  expiringSubscriptions: { username: string; telegram: string; endDate: string; priceMonth: number }[];
}

export async function fetchAdminStats(): Promise<AdminStats> {
  return api.get<AdminStats>("/admin/stats");
}
