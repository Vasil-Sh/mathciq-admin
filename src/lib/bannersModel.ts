import type { Banner } from "@/types";
import { plural } from "@/lib/dashboardInsights";

export const SCREENS = [
  { id: "matches", label: "Матчі", before: "Зараз грають", mid: "Найближчі матчі", after: "Завершені матчі", s1: "Між «Зараз грають» і «Найближчі матчі»", s2: "Перед «Завершені матчі»" },
  { id: "journal", label: "Журнал ставок", before: "Підсумки", mid: "Ставки", after: "Кінець списку", s1: "Перед основним вмістом екрана", s2: "Після основного вмісту екрана" },
  { id: "analytics", label: "Аналітика", before: "Підсумки", mid: "Графіки", after: "Кінець екрана", s1: "Перед основним вмістом екрана", s2: "Після основного вмісту екрана" },
  { id: "strategies", label: "Стратегії", before: "Мої стратегії", mid: "Список", after: "Кінець екрана", s1: "Перед основним вмістом екрана", s2: "Після основного вмісту екрана" },
  { id: "risky-teams", label: "Ризиковані команди", before: "Команди", mid: "Список", after: "Кінець екрана", s1: "Перед основним вмістом екрана", s2: "Після основного вмісту екрана" },
] as const;
export const screenOf = (id?: string) => SCREENS.find((s) => s.id === (id || "matches")) || SCREENS[0];
export const slotName = (slot: number) => (slot === 2 ? "Слот 2 · нижній" : "Слот 1 · верхній");
export const slotWhere = (screen: string | undefined, slot: number) => (slot === 2 ? screenOf(screen).s2 : screenOf(screen).s1);

/** Today in Kyiv as YYYY-MM-DD. */
export const kyivToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export type BStatus = "live" | "sched" | "off" | "done";
export const STATUS: Record<BStatus | "free", { label: string; cls: string }> = {
  live: { label: "Показується", cls: "is-live" },
  sched: { label: "Заплановано", cls: "is-sched" },
  off: { label: "Вимкнено", cls: "is-off" },
  done: { label: "Завершено", cls: "is-done" },
  free: { label: "Порожній", cls: "is-off" },
};
export function statusOf(b: Banner, today = kyivToday()): BStatus {
  if (b.endsOn && b.endsOn < today) return "done";
  if (!b.active) return "off";
  if (b.startsOn && b.startsOn > today) return "sched";
  return "live";
}

const MONTHS = ["січ.", "лют.", "бер.", "квіт.", "трав.", "черв.", "лип.", "серп.", "вер.", "жовт.", "лист.", "груд."];
const dm = (iso: string) => { const [, m, d] = iso.split("-").map(Number); return { d, m }; };
export const shortDay = (iso: string) => { const { d, m } = dm(iso); return `${d} ${MONTHS[m - 1]}`; };
export function periodText(b: { startsOn?: string | null; endsOn?: string | null }) {
  const s = b.startsOn, e = b.endsOn;
  if (!s && !e) return "без обмежень";
  if (s && !e) return `з ${shortDay(s)}`;
  if (!s && e) return `до ${shortDay(e)}`;
  const a = dm(s!), z = dm(e!);
  return a.m === z.m && s!.slice(0, 4) === e!.slice(0, 4) ? `${a.d} — ${z.d} ${MONTHS[z.m - 1]}` : `${shortDay(s!)} — ${shortDay(e!)}`;
}
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);

/** «ще 22 дні» / «завершився вчора» / «почнеться через 3 дні» + progress 0–100. */
export function timeline(b: Banner, today = kyivToday()) {
  const st = statusOf(b, today);
  let left = "без обмежень", prog = 0;
  if (b.endsOn && b.endsOn < today) {
    const n = days(b.endsOn, today);
    left = n === 1 ? "завершився вчора" : `завершився ${n} ${plural(n, "день", "дні", "днів")} тому`; prog = 100;
  } else if (b.startsOn && b.startsOn > today) {
    const n = days(today, b.startsOn);
    left = n === 1 ? "почнеться завтра" : `почнеться через ${n} ${plural(n, "день", "дні", "днів")}`; prog = 0;
  } else if (b.endsOn) {
    const n = days(today, b.endsOn) + 1;
    left = n === 1 ? "останній день" : `ще ${n} ${plural(n, "день", "дні", "днів")}`;
    if (b.startsOn) { const total = days(b.startsOn, b.endsOn) + 1; prog = Math.min(100, Math.max(0, Math.round(((total - n) / total) * 100))); }
  }
  return { st, left, prog };
}

export const overlaps = (a: { startsOn?: string | null; endsOn?: string | null }, b: { startsOn?: string | null; endsOn?: string | null }) =>
  (a.startsOn || "0000-01-01") <= (b.endsOn || "9999-12-31") && (b.startsOn || "0000-01-01") <= (a.endsOn || "9999-12-31");

/** What a slot card shows: live → scheduled (soonest) → recently finished; plus what comes next. */
export function slotState(list: Banner[], screen: string, slot: number, today = kyivToday()) {
  const inSlot = list.filter((b) => (b.screen || "matches") === screen && (b.slot ?? 1) === slot);
  const by = (st: BStatus) => inSlot.filter((b) => statusOf(b, today) === st);
  const live = by("live")[0];
  const sched = by("sched").sort((a, b) => (a.startsOn || "").localeCompare(b.startsOn || ""));
  const done = by("done").sort((a, b) => (b.endsOn || "").localeCompare(a.endsOn || ""));
  const recentDone = done.find((b) => b.endsOn && days(b.endsOn, today) <= 14);
  const current = live || sched[0] || recentDone || null;
  const upcoming = inSlot
    .filter((b) => b !== current && (b.startsOn ? b.startsOn > today : false) && statusOf(b, today) !== "done")
    .sort((a, b) => (a.startsOn || "").localeCompare(b.startsOn || ""))[0];
  const last = done[0] || inSlot.filter((b) => b !== current).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))[0] || null;
  return { current, upcoming: upcoming || null, last, occupied: !!(live || sched[0]) };
}

export const MAX_BYTES = 1.5 * 1024 * 1024;
export const ACCEPT = ["image/png", "image/jpeg", "image/webp"];
export const fmtBytes = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} МБ` : `${Math.round(n / 1024)} КБ`);
