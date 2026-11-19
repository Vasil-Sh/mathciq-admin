// Оплати: types and pure helpers for the Payments screen.
import { api } from "@/lib/apiClient";

export type PayStatus = "recorded" | "cancelled" | "refunded";
export interface PaymentRow {
  id: string; userId: number | null; username: string; amount: string; currency: string;
  paidOn: string; periodStart: string; periodEnd: string; note: string; extendSubscription: boolean;
  createdBy: string; createdAt: string; status: PayStatus;
  cancelledBy: string | null; cancelledAt: string | null; cancelReason: string | null;
  paymentMethod: string; refundedAmount: string | null; refundReason: string | null; refundedAt: string | null; refundedBy: string | null;
  promoCode: string;
}
export interface PromoCode {
  id: string; code: string; discountPercent: number; plan: "trial" | "basic" | "pro";
  startsOn: string | null; endsOn: string | null; usageLimit: number | null; usedCount: number; active: boolean; createdAt: string;
}

export const kyivToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export const kyivMonth = () => kyivToday().slice(0, 7);
export const shiftMonth = (m: string, d: number) => { const [y, mo] = m.split("-").map(Number); const t = new Date(Date.UTC(y, mo - 1 + d, 1)); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`; };
const MONTHS = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
const MONTHS_GEN = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
export const monthName = (m: string) => `${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;
export const monthShort = (m: string) => MONTHS[Number(m.slice(5)) - 1].toLowerCase();
export const monthGen = (m: string) => MONTHS_GEN[Number(m.slice(5)) - 1];
export const money = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString("uk-UA")} ₴`;
const SHORT = ["січ.", "лют.", "бер.", "квіт.", "трав.", "черв.", "лип.", "серп.", "вер.", "жовт.", "лист.", "груд."];
export const dShort = (v?: string | null) => { if (!v) return "—"; const [, m, d] = v.slice(0, 10).split("-"); return `${Number(d)} ${SHORT[Number(m) - 1]}`; };
export const period = (a: string, b: string) => `${dShort(a)} — ${dShort(b)}`;

export const STATUS: Record<PayStatus, { label: string; cls: string }> = {
  recorded: { label: "Записано", cls: "v3-pst-ok" },
  cancelled: { label: "Скасовано", cls: "v3-pst-cancel" },
  refunded: { label: "Повернено", cls: "v3-pst-refund" },
};

/** «Сьогодні», «Вчора» або «8 листопада» — групи в мобільному списку. */
export function dayLabel(iso: string) {
  const t = kyivToday();
  if (iso === t) return "Сьогодні";
  const y = new Date(`${t}T12:00:00Z`); y.setUTCDate(y.getUTCDate() - 1);
  if (iso === y.toISOString().slice(0, 10)) return "Вчора";
  return `${Number(iso.slice(8, 10))} ${MONTHS_GEN[Number(iso.slice(5, 7)) - 1]}`;
}

/** All payments for a month (or all time) — the API pages by 20. */
export async function fetchPayments(month: string, status = ""): Promise<{ payments: PaymentRow[]; recorded: number; refunded: number }> {
  const out: PaymentRow[] = [];
  let summary = { recorded: "0", refunded: "0" };
  for (let page = 1; page <= 25; page++) {
    const q = new URLSearchParams({ page: String(page) });
    if (month) q.set("month", month);
    if (status) q.set("status", status);
    const r = await api.get<{ payments: PaymentRow[]; hasMore: boolean; summary: { recorded: string; refunded: string } }>(`/admin/payments?${q}`);
    out.push(...r.payments);
    if (page === 1) summary = r.summary;
    if (!r.hasMore) break;
  }
  return { payments: out, recorded: Number(summary.recorded) || 0, refunded: Number(summary.refunded) || 0 };
}
export const fetchPromoCodes = () => api.get<{ promoCodes: PromoCode[] }>("/admin/promo-codes").then((r) => r.promoCodes);

export type PromoState = "live" | "scheduled" | "ended" | "off";
export function promoState(p: PromoCode, today = kyivToday()): PromoState {
  if (!p.active) return "off";
  if (p.startsOn && p.startsOn > today) return "scheduled";
  if ((p.endsOn && p.endsOn < today) || (p.usageLimit != null && p.usedCount >= p.usageLimit)) return "ended";
  return "live";
}
export const PROMO_UI: Record<PromoState, { label: string; cls: string }> = {
  live: { label: "Діє", cls: "v3-pst-ok" }, scheduled: { label: "Заплановано", cls: "v3-pst-plan" }, ended: { label: "Завершено", cls: "v3-pst-cancel" }, off: { label: "Вимкнено", cls: "v3-pst-cancel" },
};
export const PLAN_LABEL: Record<string, string> = { trial: "Пробний", basic: "Базова", pro: "Pro" };
export const pct = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);

/** Change vs the previous period, always in %. From 0 to something = +100%, 0 → 0 = 0%. */
export const deltaVs = (cur: number, prev: number): { d: number | null } =>
  prev > 0 ? { d: Math.round(((cur - prev) / prev) * 1000) / 10 } : cur > 0 ? { d: 100 } : { d: 0 };
