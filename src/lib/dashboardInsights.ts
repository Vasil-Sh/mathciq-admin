// Pure helpers for the Dashboard data blocks (plans, recent payments,
// retention, churn risk, attention alerts). No invented numbers: every
// value comes from /admin/stats, /admin/users, /admin/parsers or
// /admin/support-tickets.
import { api } from "@/lib/apiClient";
import { getDaysUntilExpiry, parseDate } from "@/lib/adminUtils";
import { isoDate, shortDate } from "@/lib/subscriptions";
import type { AdminUserOverview } from "@/types";

export const INACTIVE_DAYS = 14;
export const LOSS_STREAK = 5;

export const plural = (n: number, one: string, few: string, many: string) =>
  n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many;

export const initials = (name: string) => name.replace(/^@/, "").slice(0, 2).toUpperCase();

/** Telegram deep link from a stored handle ("@name", "name" or a t.me URL). */
export function telegramLink(handle?: string | null): string | null {
  const h = (handle || "").trim().replace(/^https?:\/\/t\.me\//, "").replace(/^@/, "");
  return /^[A-Za-z0-9_]{3,}$/.test(h) ? `https://t.me/${h}` : null;
}

const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const daysSince = (value: string) => { const d = parseDate(value); return d ? Math.floor((today().getTime() - d.getTime()) / 864e5) : null; };

export const PLAN_ORDER = ["pro", "basic", "trial"] as const;
export const PLAN_NAMES: Record<string, string> = { pro: "Pro", basic: "Базова", trial: "Пробний" };
export const PLAN_COLORS: Record<string, string> = { pro: "#5b8cff", basic: "#a3c0ff", trial: "#3a4253" };
export const planOf = (u: Pick<AdminUserOverview, "plan" | "priceMonth">) =>
  u.plan === "pro" || u.plan === "basic" ? u.plan : u.plan === "trial" || !Number(u.priceMonth) ? "trial" : Number(u.priceMonth) >= 600 ? "pro" : "basic";
export const isPaidPlan = (u: AdminUserOverview) => planOf(u) !== "trial";
const isActive = (u: AdminUserOverview) => u.role === "user" && getDaysUntilExpiry(u.endDate) >= 0;

/** "Pro · 600 ₴" / "Пробний" for one user. */
export function planText(u?: AdminUserOverview | null, price?: number | string): string {
  const p = u ? planOf(u) : Number(price) ? "basic" : "trial";
  const amount = Number(u?.priceMonth ?? price) || 0;
  return p === "trial" ? PLAN_NAMES.trial : `${PLAN_NAMES[p]}${amount ? ` · ${Math.round(amount).toLocaleString("uk-UA")} ₴` : ""}`;
}

export interface PlanRow { plan: string; label: string; count: number }

/** Active users by plan; the label carries the most common price of that plan. */
export function activePlans(overview: AdminUserOverview[]): PlanRow[] {
  const active = overview.filter(isActive);
  return PLAN_ORDER.map((plan) => {
    const list = active.filter((u) => planOf(u) === plan);
    const prices = new Map<number, number>();
    list.forEach((u) => { const p = Number(u.priceMonth) || 0; if (p) prices.set(p, (prices.get(p) || 0) + 1); });
    const price = [...prices.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return { plan, label: plan === "trial" || !price ? PLAN_NAMES[plan] : `${PLAN_NAMES[plan]} · ${price.toLocaleString("uk-UA")} ₴`, count: list.length };
  }).filter((p) => p.count > 0);
}

/** "сьогодні" / "вчора" / "8 лист." for a YYYY-MM-DD date. */
export function relDay(value: string): string {
  const t = isoDate(today());
  const y = new Date(today()); y.setDate(y.getDate() - 1);
  if (value === t) return "сьогодні";
  if (value === isoDate(y)) return "вчора";
  return shortDate(value);
}

/** "18 хв тому" / "3 год тому" / "2 дні тому" for an ISO timestamp. */
export function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "";
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} хв тому`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} год тому`;
  const d = Math.round(h / 24);
  return `${d} ${plural(d, "день", "дні", "днів")} тому`;
}

const tenure = (u: AdminUserOverview) => {
  const start = parseDate(u.startDate || u.createdAt), end = parseDate(u.endDate);
  if (!start || !end) return "";
  const months = Math.round((end.getTime() - start.getTime()) / (30.4 * 864e5));
  return months < 1 ? "з нами менше місяця" : `з нами ${months} міс.`;
};

export interface ChurnedRow { user: AdminUserOverview; ended: string; tenure: string }

/** Expired users who never extended (same rule as stats.retention.churned), latest first. */
export function churnedUsers(overview: AdminUserOverview[]): ChurnedRow[] {
  return overview
    .filter((u) => u.role === "user" && getDaysUntilExpiry(u.endDate) < 0 && getDaysUntilExpiry(u.endDate) > -999 && !(u.extensions > 0))
    .sort((a, b) => b.endDate.localeCompare(a.endDate))
    .map((user) => ({ user, ended: shortDate(user.endDate), tenure: tenure(user) }));
}

export interface RiskRow { user: AdminUserOverview; idleDays: number | null; streak: number; inactive: boolean; losing: boolean; daysLeft: number }

/** Active paid users with no bets for INACTIVE_DAYS+ or LOSS_STREAK+ losses in a row. */
export function churnRisk(overview: AdminUserOverview[]): RiskRow[] {
  return overview
    .filter((u) => isActive(u) && isPaidPlan(u))
    .map((user) => {
      const idleDays = daysSince(user.lastBetDate || user.startDate || user.createdAt);
      const streak = Number(user.lossStreak) || 0;
      return { user, idleDays, streak, inactive: idleDays !== null && idleDays >= INACTIVE_DAYS, losing: streak >= LOSS_STREAK, daysLeft: getDaysUntilExpiry(user.endDate) };
    })
    .filter((r) => r.inactive || r.losing)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

export const idleText = (r: RiskRow) =>
  r.user.lastBetDate ? `${r.idleDays} ${plural(r.idleDays || 0, "день", "дні", "днів")} без ставок` : `${r.idleDays} ${plural(r.idleDays || 0, "день", "дні", "днів")} без жодної ставки`;
export const streakText = (n: number) => `${n} ${plural(n, "програш", "програші", "програшів")} поспіль`;

// ── Attention sources ──

export interface ParserState { name: string; open: boolean; failures: number; failures24h: number; lastFailure: string }
export interface SupportTicket { id: string; username: string; subject: string; createdAt: string }

export const PARSER_NAMES: Record<string, string> = {
  hltv_scraper: "HLTV",
  tipsgg_fetch_cs2_matches: "Tips.gg · CS2",
  tipsgg_fetch_dota2_matches: "Tips.gg · Dota 2",
};

export async function fetchParsers(): Promise<ParserState[]> {
  const data = await api.get<{ parsers: ParserState[] }>("/admin/parsers");
  return data.parsers || [];
}

export async function fetchOpenTickets(): Promise<SupportTicket[]> {
  const data = await api.get<{ tickets: SupportTicket[] }>("/admin/support-tickets?status=open");
  return data.tickets || [];
}
