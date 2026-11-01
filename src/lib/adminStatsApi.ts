import { api } from "./apiClient";

export interface AdminStats {
  /** Year of the monthly series. */
  year: number;
  paymentsByMonth: {month:string;amount:number;count:number}[];
  totalUsers: number; activeUsers: number; adminUsers: number; inactiveUsers: number;
  newThisMonth: number; mrr: number;
  revenueByMonth: { month: string; revenue: number; paidUsers: number }[];
  registrationsByMonth: { month: string; count: number }[];
  recentRegistrations: { username: string; date: string; price: number }[];
  planDistribution: { price: number; count: number }[];
}

/** @param year report year for the monthly series (default: current year). */
export async function fetchAdminStats(year?: number): Promise<AdminStats> {
  return api.get<AdminStats>(year ? `/admin/stats?year=${year}` : "/admin/stats");
}
