import type { AdminUserBet, AdminUserOverview } from "@/types";

/** A plain user with sane defaults; override what the test is about. */
export function user(o: Partial<AdminUserOverview> = {}): AdminUserOverview {
  return {
    id: 1, username: "player", role: "user", telegram: "", priceMonth: 0,
    startDate: "2026-11-01", endDate: "2026-12-01", createdAt: "2026-11-01",
    betCount: 0, wins: 0, losses: 0, pending: 0, totalStaked: 0, totalProfit: 0,
    winRate: 0, roi: 0, initialBank: 0, manualAdjustments: 0, currentBank: 0, lossStreak: 0,
    plan: "basic", lastBetDate: "", extensions: 0, lastPaymentDate: "", games: [],
    ...o,
  } as AdminUserOverview;
}

export function bet(o: Partial<AdminUserBet> = {}): AdminUserBet {
  return {
    id: "1", match: "NaVi — FaZe", team1: "NaVi", team2: "FaZe", betType: "Match Winner - NaVi",
    odds: 2, amount: 100, stake: null, date: "2026-11-10", result: "Win", profit: 100, game: "cs2",
    currency: "UAH", strategy: "", createdAt: "2026-11-10T10:00:00Z",
    ...o,
  } as AdminUserBet;
}
