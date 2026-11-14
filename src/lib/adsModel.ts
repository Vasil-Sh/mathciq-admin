import { api } from "./apiClient";
import { kyivToday } from "./bannersModel";
import { plural } from "./dashboardInsights";

/* ── Types ── */
export interface Bookmaker {
  id: string; name: string; licenseNumber: string; licenseUntil: string | null; moderationText: string;
  link: string; buttonText: string; clickPrice: number | null; showOddsInList: boolean; showMatchDetails: boolean;
  active: boolean; createdAt?: string; updatedAt?: string;
}
export type BookmakerInput = Omit<Bookmaker, "id" | "createdAt" | "updatedAt">;
export interface Promo {
  id: string; name: string; handle: string; subscribers: number | null; description: string;
  placement: "telegram-top" | "match-details"; game: "" | "CS2" | "Dota 2"; startsOn: string | null; endsOn: string | null;
  active: boolean; reviewStatus: "pending" | "approved" | "rejected"; rejectReason: string; priceNote: string;
  createdAt?: string; updatedAt?: string;
}
export type PromoInput = Omit<Promo, "id" | "createdAt" | "updatedAt">;
export interface AdStats {
  from: string; to: string;
  totals: { impressions: number; clicks: number; uniqueUsers: number };
  previous: { from: string; impressions: number; clicks: number };
  daily: { day: string; impressions: number; clicks: number }[];
  rows: { placement: string; entityId: string; impressions: number; clicks: number }[];
}

/* ── API ── */
export const fetchBookmakers = async () => (await api.get<{ bookmakers: Bookmaker[] }>("/admin/bookmakers")).bookmakers || [];
export const saveBookmaker = async (id: string | null, b: Partial<BookmakerInput>) => id
  ? (await api.put<{ bookmaker: Bookmaker }>(`/admin/bookmakers/${id}`, b)).bookmaker
  : (await api.post<{ bookmaker: Bookmaker }>("/admin/bookmakers", b)).bookmaker;
export const deleteBookmaker = (id: string) => api.delete(`/admin/bookmakers/${id}`);
export const fetchPromos = async () => (await api.get<{ promos: Promo[] }>("/admin/telegram-promos")).promos || [];
export const savePromo = async (id: string | null, p: Partial<PromoInput>) => id
  ? (await api.put<{ promo: Promo }>(`/admin/telegram-promos/${id}`, p)).promo
  : (await api.post<{ promo: Promo }>("/admin/telegram-promos", p)).promo;
export const deletePromo = (id: string) => api.delete(`/admin/telegram-promos/${id}`);
export const fetchAdStats = (q: { days?: number; from?: string; to?: string }) =>
  api.get<AdStats>(`/admin/ad-stats?${q.from && q.to ? `from=${q.from}&to=${q.to}` : `days=${q.days || 14}`}`);

/* ── Helpers ── */
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
export const nf = (n: number) => Math.round(n).toLocaleString("uk-UA");
export const ctr = (clicks: number, imp: number) => (imp ? `${((clicks / imp) * 100).toFixed(1).replace(".", ",")}%` : "—");
export const dmy = (iso: string) => iso.split("-").reverse().join(".");
export const pctChange = (cur: number, prev: number) => (prev ? Math.round(((cur - prev) / prev) * 100) : null);

/** Words the ads may not use (promises of profit, bonuses, «free»). */
const FORBIDDEN: [RegExp, string][] = [
  [/бонус\p{L}*/giu, "Бонуси й подарунки за реєстрацію — заборонено"],
  [/подарун\p{L}*/giu, "Бонуси й подарунки за реєстрацію — заборонено"],
  [/безплатн\p{L}*|безкоштовн\p{L}*|без ризик\p{L}*/giu, "«Безплатно», «без ризику» — заборонено"],
  [/заробіт\p{L}*|заробля\p{L}*|прибут\p{L}*|гарантован\p{L}*|договірн\p{L}*/giu, "Обіцянки заробітку чи прибутку — заборонено"],
];
export function textIssues(text: string) {
  const hits: { from: number; to: number }[] = []; const rules = new Set<string>();
  for (const [re, rule] of FORBIDDEN) { re.lastIndex = 0; let m: RegExpExecArray | null; while ((m = re.exec(text))) { hits.push({ from: m.index, to: m.index + m[0].length }); rules.add(rule); } }
  return { hits: hits.sort((a, b) => a.from - b.from), rules: [...rules] };
}

export type LicState = "none" | "expired" | "soon" | "ok";
export function licenseState(b: Pick<Bookmaker, "licenseNumber" | "licenseUntil">, today = kyivToday()): { st: LicState; left: number | null } {
  if (!b.licenseNumber.trim()) return { st: "none", left: null };
  if (!b.licenseUntil) return { st: "ok", left: null };
  const left = days(today, b.licenseUntil);
  return { st: left < 0 ? "expired" : left <= 30 ? "soon" : "ok", left };
}
export type BmStatus = "live" | "soon" | "draft" | "expired" | "off";
export function bookmakerStatus(b: Bookmaker, today = kyivToday()): BmStatus {
  const l = licenseState(b, today).st;
  if (l === "none" || !b.link) return "draft";
  if (l === "expired") return "expired";
  if (!b.active) return "off";
  return l === "soon" ? "soon" : "live";
}
export const BM_STATUS: Record<BmStatus, { label: string; cls: string }> = {
  live: { label: "Показується", cls: "is-live" }, soon: { label: "Ліцензія спливає", cls: "is-done" },
  draft: { label: "Чернетка", cls: "is-red" }, expired: { label: "Ліцензія минула", cls: "is-red" }, off: { label: "Вимкнено", cls: "is-off" },
};
export function licenseLine(b: Bookmaker, today = kyivToday()) {
  const { st, left } = licenseState(b, today);
  if (st === "none") return { main: "не вказано", sub: "без ліцензії не показується", tone: "bad" as const };
  const main = `№ ${b.licenseNumber}${b.licenseUntil ? ` · до ${dmy(b.licenseUntil)}` : ""}`;
  if (st === "expired") return { main, sub: "ліцензія минула — не показується", tone: "bad" as const };
  if (st === "soon") return { main, sub: `закінчується через ${left} ${plural(left!, "день", "дні", "днів")}`, tone: "warn" as const };
  return { main, sub: b.licenseUntil ? "діє" : "термін не вказано", tone: b.licenseUntil ? "ok" as const : "warn" as const };
}

export type PrStatus = "live" | "sched" | "done" | "off" | "pending" | "rejected";
export function promoStatus(p: Promo, today = kyivToday()): PrStatus {
  if (p.reviewStatus === "rejected") return "rejected";
  if (p.reviewStatus === "pending") return "pending";
  if (p.endsOn && p.endsOn < today) return "done";
  if (!p.active) return "off";
  if (p.startsOn && p.startsOn > today) return "sched";
  return "live";
}
export const PR_STATUS: Record<PrStatus, { label: string; cls: string }> = {
  live: { label: "Показується", cls: "is-live" }, sched: { label: "Заплановано", cls: "is-sched" }, done: { label: "Завершено", cls: "is-done" },
  off: { label: "Вимкнено", cls: "is-off" }, pending: { label: "На перевірці", cls: "is-done" }, rejected: { label: "Відхилено", cls: "is-red" },
};
export const placeLabel = (p: Pick<Promo, "placement" | "game">) => (p.placement === "telegram-top" ? "Telegram · верх списку" : `Деталі матчу${p.game ? ` · ${p.game}` : ""}`);
export const subsText = (n: number | null) => (n == null ? "" : n >= 1000 ? `${(n / 1000).toFixed(1).replace(".0", "").replace(".", ",")} тис.` : String(n));
export const initials = (name: string) => { const w = name.split(/\s+/).filter(Boolean); return (w.length > 1 ? w.slice(0, 2).map((x) => x[0]).join("") : (w[0] || "?").slice(0, 2)).toUpperCase(); };
const PALETTE = ["#3a6df0", "#7a4fd0", "#1f7a3d", "#c2410c", "#0e7490", "#9a2a17"];
export const colorOf = (s: string) => PALETTE[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];

/** Events for an entity over the stats period. */
export function entityStats(stats: AdStats | null, prefix: string, id?: string) {
  const rows = (stats?.rows || []).filter((r) => r.placement.startsWith(prefix) && (id === undefined || r.entityId === id));
  return rows.reduce((a, r) => ({ impressions: a.impressions + r.impressions, clicks: a.clicks + r.clicks }), { impressions: 0, clicks: 0 });
}
