import { api } from "./apiClient";

export interface AdminStats {
  paymentsByMonth: {month:string;amount:number;count:number}[];
  totalUsers: number; activeUsers: number; adminUsers: number; inactiveUsers: number;
  newThisMonth: number; mrr: number;
  revenueByMonth: { month: string; revenue: number; paidUsers: number }[];
  registrationsByMonth: { month: string; count: number }[];
  recentRegistrations: { username: string; date: string; price: number }[];
  planDistribution: { plan: string; label: string; count: number; price: number }[];
  conversion: { trial: number; paid: number };
  cancellations: { total: number; byMonth: { month: string; count: number }[] };
  refunds: { total: number; month: number; byMonth: { month: string; amount: number; count: number }[] };
  recentPayments: { id: string; username: string; amount: number; paidOn: string; status: string; extendSubscription: boolean }[];
  retention: { retained: number; churned: number };
  selfLimitations: number;
  aiUsage: { calls: number; costUsd: number; tokens: number; today: { calls: number; costUsd: number }; byMonth: { month: string; costUsd: number }[] };
  parserFailures24h: number;
  openSupportTickets: number;
  unverifiedAge: number;
}

export async function fetchAdminStats(): Promise<AdminStats> {
  return api.get<AdminStats>("/admin/stats");
}
