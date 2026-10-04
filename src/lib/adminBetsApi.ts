import { api } from "./apiClient";
import type { AdminUserOverview, AdminUserBet } from "@/types";

/** All users with aggregated betting stats (bets, profit, win rate, ROI). */
export async function fetchUsersOverview(): Promise<AdminUserOverview[]> {
  const data = await api.get<{ users: AdminUserOverview[] }>("/admin/users");
  return data.users || [];
}

/** Individual bets for a single user. */
export async function fetchUserBets(userId: number): Promise<AdminUserBet[]> {
  const data = await api.get<{ bets: AdminUserBet[] }>(
    `/admin/users/${userId}/bets`
  );
  return data.bets || [];
}
