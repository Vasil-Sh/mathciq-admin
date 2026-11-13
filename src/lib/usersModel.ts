// Presentation model for the «Користувачі» screen (list rows, card, filters).
// Everything is derived from GET /admin/users (overview) + settings — no invented values.
import type { AdminUserOverview, AppSettings } from "@/types";
import { getDaysUntilExpiry, parseDate } from "@/lib/adminUtils";
import { shortDate } from "@/lib/subscriptions";
import { plural } from "@/lib/dashboardInsights";

export type UStatus = "admin" | "blocked" | "cancelled" | "trial" | "ended" | "urgent" | "soon" | "active";
export type UFilter = "all" | "paid" | "trial" | "basic" | "pro" | "ended" | "cancelled" | "closed";

export const STATUS_UI: Record<UStatus, { label: string; cls: string }> = {
  admin: { label: "Адмін", cls: "v3-st-admin" },
  blocked: { label: "Блок", cls: "v3-st-trial" },
  cancelled: { label: "Скасована", cls: "v3-st-cancelled" },
  trial: { label: "Пробний", cls: "v3-st-trial" },
  ended: { label: "Закінчилась", cls: "v3-st-ended" },
  urgent: { label: "Закінчується", cls: "v3-st-urgent" },
  soon: { label: "Закінчується", cls: "v3-st-soon" },
  active: { label: "Активна", cls: "v3-st-active" },
};

const PLAN_NAME: Record<string, string> = { trial: "Пробний", basic: "Базова", pro: "Pro" };
export const planName = (p?: string) => PLAN_NAME[p || ""] || "Пробний";
const fullDate = (v?: string) => { const d = v ? parseDate(v) : null; return d ? d.toLocaleDateString("uk-UA", { day: "numeric", month: "short", year: "numeric" }).replace(" р.", "") : ""; };
export const longDate = fullDate;
const isoToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export const isAdmin = (u: AdminUserOverview) => u.role === "admin";
export const daysLeft = (u: AdminUserOverview) => getDaysUntilExpiry(u.endDate);
const NO_END = -9999;

/** Cancelled subscription that already closed (now, a refund, or the period has ended). */
export function isCancelled(u: AdminUserOverview): boolean {
  const ended = daysLeft(u) < 0 && daysLeft(u) > NO_END;
  if (u.subscriptionCancelledAt) return u.subscriptionCancelMode === "now" || ended;
  return !!u.cancelledAt && ended;
}
/** Cancelled «at period end» but still running. */
export const endsWithoutRenewal = (u: AdminUserOverview) => !!u.subscriptionCancelledAt && u.subscriptionCancelMode === "end" && daysLeft(u) >= 0;

export function statusOf(u: AdminUserOverview): UStatus {
  if (isAdmin(u)) return "admin";
  if (u.selfLimitedUntil) return "blocked";
  if (isCancelled(u)) return "cancelled";
  const d = daysLeft(u);
  if (!u.endDate || d < 0) return "ended";
  if (u.plan === "trial" && !u.proUntil) return "trial";
  if (d <= 2) return "urgent";
  if (d <= 7) return "soon";
  return "active";
}

export function matches(u: AdminUserOverview, f: UFilter): boolean {
  const s = statusOf(u);
  switch (f) {
    case "all": return true;
    case "paid": return !isAdmin(u) && (u.plan === "basic" || u.plan === "pro") && ["active", "soon", "urgent"].includes(s);
    case "trial": return s === "trial";
    case "basic": return !isAdmin(u) && u.plan === "basic" && !["ended", "cancelled"].includes(s);
    case "pro": return !isAdmin(u) && u.plan === "pro" && !["ended", "cancelled"].includes(s);
    case "ended": return s === "ended";
    case "cancelled": return s === "cancelled";
    case "closed": return s === "ended" || s === "cancelled";
  }
}

/** Plan column: name + price line. */
export function planCell(u: AdminUserOverview, st: AppSettings | null): { plan: string; price: string } {
  if (isAdmin(u)) return { plan: u.isOwner ? "Овнер" : "Адмін", price: "повний доступ" };
  if (u.proUntil) return { plan: "Pro", price: `видано до ${shortDate(u.proUntil)}` };
  if (u.plan === "trial") return { plan: `Пробний${st?.trialPlan ? ` · ${planName(st.trialPlan)}` : ""}`, price: `0 ₴${st?.trialDays ? ` · ${st.trialDays} днів` : ""}` };
  const price = Number(u.priceMonth) || (u.plan === "pro" ? st?.proPrice : st?.basicPrice) || 0;
  return { plan: planName(u.plan), price: price ? `${price.toLocaleString("uk-UA")} ₴` : "—" };
}

/** «Наступна оплата» column + its colour class. */
export function nextCell(u: AdminUserOverview): { text: string; cls: string } {
  const s = statusOf(u);
  const d = daysLeft(u);
  if (s === "admin") return { text: "—", cls: "" };
  if (s === "blocked") return { text: `— · самообмеження до ${shortDate(u.selfLimitedUntil!)}`, cls: "" };
  if (s === "cancelled") return { text: `— · скасовано ${shortDate(u.subscriptionCancelledAt || u.cancelledAt || u.endDate)}`, cls: "" };
  if (s === "ended") return { text: u.endDate ? `— · закінчилась ${shortDate(u.endDate)}` : "—", cls: "" };
  if (s === "trial") return { text: `${shortDate(u.endDate)} · кінець пробного`, cls: "" };
  if (endsWithoutRenewal(u)) return { text: `${shortDate(u.endDate)} · без продовження`, cls: "" };
  const when = d === 0 ? "сьогодні" : d === 1 ? "завтра" : `через ${d} ${plural(d, "день", "дні", "днів")}`;
  return { text: d <= 7 ? `${shortDate(u.endDate)} · ${when}` : shortDate(u.endDate), cls: s === "urgent" ? "is-urgent" : s === "soon" ? "is-soon" : "" };
}

/** Quick «+N днів» is offered when the subscription ends within 7 days or has ended (not blocked/cancelled/admin). */
export const canQuickExtend = (u: AdminUserOverview) => ["soon", "urgent", "ended"].includes(statusOf(u));

/** Tag inside the blue subscription block. */
export function leftTag(u: AdminUserOverview): string {
  const s = statusOf(u);
  if (s === "admin") return "повний доступ";
  if (s === "blocked") return "самообмеження";
  if (s === "cancelled") return u.refundedAmount ? `повернено ${u.refundedAmount.toLocaleString("uk-UA")} ₴` : "скасовано";
  const d = daysLeft(u);
  if (!u.endDate) return "без дати";
  if (d < 0) return "закінчилась";
  if (d === 0) return "останній день";
  return `ще ${d} ${plural(d, "день", "дні", "днів")}`;
}

/** Share of the current period that has passed (0–100). */
export function progress(u: AdminUserOverview): number {
  if (isAdmin(u)) return 100;
  const a = parseDate(u.startDate)?.getTime(), b = parseDate(u.endDate)?.getTime();
  if (!a || !b || b <= a) return daysLeft(u) < 0 ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round(((Date.now() - a) / (b - a)) * 100)));
}

/** «Пробний період» row in the profile. */
export function trialText(u: AdminUserOverview, st: AppSettings | null): string {
  if (isAdmin(u)) return "—";
  const end = u.trialEndDate || (u.plan === "trial" ? u.endDate : "");
  if (!end) return "не було";
  const days = st?.trialDays || 0;
  const endD = parseDate(end);
  const startD = endD && days ? new Date(endD.getTime() - days * 864e5) : null;
  const range = startD ? `${shortDate(startD.toISOString().slice(0, 10))} — ${shortDate(end)}` : `до ${shortDate(end)}`;
  return end >= isoToday() && u.plan === "trial" ? `зараз · ${range}` : range;
}

export const ageText = (u: AdminUserOverview) => u.ageConfirmed ? "21+ підтверджено" : "не підтверджено";
export const birthText = (u: AdminUserOverview) => u.birthDate ? u.birthDate.split("-").reverse().join(".") : "не вказано";
export const initials = (name: string) => (name || "?").replace(/^@/, "").slice(0, 2).toUpperCase();
export { isoToday };
