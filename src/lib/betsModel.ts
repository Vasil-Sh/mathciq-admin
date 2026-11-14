import type { AdminUserBet, AdminUserOverview } from "@/types";
import { plural } from "@/lib/dashboardInsights";

/** Normalised game label: "cs2" / "CS 2" → "CS2", "dota2" → "Dota 2"; anything else stays as written. */
export function gameLabel(raw: string): string {
  const k = (raw || "").toLowerCase().replace(/[\s_-]/g, "");
  if (k === "cs2" || k === "cs" || k === "csgo" || k === "counterstrike2") return "CS2";
  if (k === "dota2" || k === "dota") return "Dota 2";
  return raw || "—";
}

const nf = (n: number, digits = 0) => Math.abs(n).toLocaleString("uk-UA", { maximumFractionDigits: digits, minimumFractionDigits: digits });
const sym = (c?: string) => (c === "USD" ? "$" : c === "EUR" ? "€" : "₴");

export const money = (n: number, currency?: string) => `${n < 0 ? "−" : ""}${nf(Math.round(n))} ${sym(currency)}`;
export const signedMoney = (n: number, currency?: string) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${nf(Math.round(n))} ${sym(currency)}`;
export const signedPct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${nf(n, 1)}%`;
export const odds = (n: number) => (Number.isFinite(n) && n > 0 ? n.toFixed(2).replace(".", ",") : "—");

export type Sort = "bets" | "staked" | "profit" | "wr";

export interface Stats { bets: number; wins: number; losses: number; pending: number; staked: number; profit: number; wr: number; roi: number }

/** Stats of a user, for all games or for one game (by normalised label). */
export function statsFor(u: AdminUserOverview, game: string): Stats {
  if (game === "all") return { bets: u.betCount, wins: u.wins, losses: u.losses, pending: u.pending, staked: u.totalStaked, profit: u.totalProfit, wr: u.winRate, roi: u.roi };
  const gs = (u.games || []).filter((g) => gameLabel(g.game) === game);
  const sum = (f: (g: (typeof gs)[number]) => number) => gs.reduce((a, g) => a + (Number(f(g)) || 0), 0);
  const wins = sum((g) => g.wins), losses = sum((g) => g.losses), staked = sum((g) => g.staked), profit = sum((g) => g.profit);
  return { bets: sum((g) => g.bets), wins, losses, pending: sum((g) => g.pending), staked, profit, wr: wins + losses ? (wins / (wins + losses)) * 100 : 0, roi: staked ? (profit / staked) * 100 : 0 };
}

export const userGames = (u: AdminUserOverview) => Array.from(new Set((u.games || []).filter((g) => g.bets > 0).map((g) => gameLabel(g.game))));

/** Express bets keep the legs in `betType`: "Експрес 3x | 1. A vs B | П1 @1.55 • 2. …". */
export const isExpress = (b: AdminUserBet) => b.betType.startsWith("Експрес") || b.match.startsWith("Експрес");

export interface Leg { match: string; pick: string; odds: string }
export function parseLegs(text: string): Leg[] {
  return text.split("•").map((s) => s.trim()).filter(Boolean).map((s) => {
    const c = s.replace(/^Експрес\s*\S*\s*\|\s*/, "").trim();
    const m = c.match(/^(?:\d+\.\s*)?(.*?)\s*\|\s*(.*?)\s*@\s*([\d.,]+)\s*$/);
    return m ? { match: m[1].replace(/\s+vs\s+/i, " — "), pick: m[2], odds: odds(Number(m[3].replace(",", "."))) } : { match: c, pick: "", odds: "" };
  });
}

export function betView(b: AdminUserBet) {
  const exp = isExpress(b);
  const legs = exp ? parseLegs(b.betType) : [];
  const title = exp ? (b.match || b.betType.split("|")[0] || "Експрес").trim() : b.team1 && b.team2 ? `${b.team1} — ${b.team2}` : (b.match || "—").replace(/\s+vs\s+/i, " — ");
  const pick = exp ? (legs.length ? `${legs.length} ${plural(legs.length, "подія", "події", "подій")}` : "Експрес") : b.betType;
  const [y, mo, d] = (b.date || "").slice(0, 10).split("-");
  const day = d && mo ? `${d}.${mo}` : "—";
  const t = b.createdAt ? new Date(b.createdAt) : null;
  const time = t && !isNaN(t.getTime()) ? t.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }) : "";
  const res = b.result === "Win" ? "win" : b.result === "Loss" ? "loss" : b.result === "Pending" ? "pending" : "other";
  const status = res === "win" ? "Виграш" : res === "loss" ? "Програш" : res === "pending" ? "Очікує" : b.result || "—";
  const profit = res === "pending" ? "—" : signedMoney(b.profit, b.currency);
  return { exp, legs, title, pick, day, year: y, time, res, status, profit, game: gameLabel(b.game), odds: odds(b.odds), amount: money(b.amount, b.currency) };
}
