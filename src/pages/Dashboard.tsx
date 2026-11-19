import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, ArrowUp, Check, ChevronRight, Download, MinusCircle, RefreshCw, Sparkles, TrendingUp, UserPlus, Users, Wallet, WifiOff, UserCheck } from "lucide-react";
import { fetchAdminStats, type AdminStats } from "@/lib/adminStatsApi";
import { authService } from "@/lib/authService";
import { downloadCsv } from "@/lib/csv";
import { daysLabel, expiringUsers, extendedEndDate, money, shortDate } from "@/lib/subscriptions";
import ExtendConfirmDialog from "@/components/ExtendConfirmDialog";
import RetentionCard from "@/components/dashboard/RetentionCard";
import ChurnRiskCard from "@/components/dashboard/ChurnRiskCard";
import PeriodMenu from "@/components/dashboard/PeriodMenu";
import UserAvatar from "@/components/UserAvatar";
import RollingNumber from "@/components/RollingNumber";
import PlanDial from "@/components/dashboard/PlanDial";
import WriteButton from "@/components/dashboard/WriteButton";
import PillTrack from "@/components/PillTrack";
import SwipeRow from "@/components/dashboard/SwipeRow";
import { fetchUsersOverview } from "@/lib/adminBetsApi";
import { fetchSettings } from "@/lib/adminSettingsApi";
import { activePlans, ago, churnedUsers, churnRisk, fetchOpenTickets, fetchParsers, INACTIVE_DAYS, LOSS_STREAK, PARSER_NAMES, PLAN_COLORS, PLAN_NAMES, periodLabel as limitLabel, planText, plural, relDay, telegramLink, type ParserState, type SupportTicket } from "@/lib/dashboardInsights";
import type { AdminUser, AdminUserOverview, AppSettings } from "@/types";
import UndoRing from "@/components/UndoRing";
import ExportCsvButton from "@/components/ExportCsvButton";

const MONTHS = ["Січ", "Лют", "Бер", "Кві", "Тра", "Чер", "Лип", "Сер", "Вер", "Жов", "Лис", "Гру"];
const MONTHS_FULL = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
const MONTHS_LOC = ["січні", "лютому", "березні", "квітні", "травні", "червні", "липні", "серпні", "вересні", "жовтні", "листопаді", "грудні"];
const MONTHS_GEN = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
const EXTEND_DAYS = 30;
const REFRESH_MS = 60_000;

const monthIdx = (m: string) => Number(m.slice(5, 7)) - 1;
const monthKey = (y: number, i: number) => `${y}-${String(i + 1).padStart(2, "0")}`;
const prevKey = (m: string) => { const y = Number(m.slice(0, 4)), i = monthIdx(m); return i === 0 ? monthKey(y - 1, 11) : monthKey(y, i - 1); };
const shortK = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1).replace(".", ",")}k` : String(Math.round(v)));
const pct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("uk-UA", { maximumFractionDigits: 1 })}%`;
const payWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "оплата" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "оплати" : "оплат");
const hhmm = () => new Date().toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });

function kyivNow() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Kyiv", year: "numeric", month: "numeric" }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  return { year, month, key: monthKey(year, month - 1) };
}

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

export default function Dashboard() {
  const now = kyivNow();
  const online = useOnline();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersError, setUsersError] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");
  const [loadedAt, setLoadedAt] = useState(0);
  // Phone refresh button shows a tick after a manual refresh (same as on «Ставки»).
  const [refreshDone, setRefreshDone] = useState(false);
  const [period, setPeriod] = useState<string>(now.key);
  const [feed, setFeed] = useState<"pay" | "lost">("pay");
  const [mode, setMode] = useState<"pay" | "est">("pay");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [extending, setExtending] = useState(false);
  // «Продовжити всім»: кнопка → підтвердження в ній самій → прогрес по рядках → «Продовжено»
  const [extPhase, setExtPhase] = useState<"idle" | "ask" | "run" | "done">("idle");
  const [extDoneIds, setExtDoneIds] = useState<number[]>([]);
  // Фокус не губиться: «Так» отримує фокус у підтвердженні, після «Скасувати»/завершення — знову кнопка
  const xallBtnRef = useRef<HTMLButtonElement>(null);
  const xallYesRef = useRef<HTMLButtonElement>(null);
  const prevPhase = useRef(extPhase);
  useEffect(() => {
    const was = prevPhase.current; prevPhase.current = extPhase;
    if (extPhase === "ask") xallYesRef.current?.focus();
    else if (extPhase === "idle" && was !== "idle") {
      const a = document.activeElement;
      if (!a || a === document.body || a.closest(".v3-xall")) xallBtnRef.current?.focus();
    }
  }, [extPhase]);
  const [showDetails, setShowDetails] = useState(false);
  const [barOpen, setBarOpen] = useState<string | null>(null);
  // Bars grow from zero once data is in (and again when the chart mode changes).
  const [grown, setGrown] = useState(false);
  const [overview, setOverview] = useState<AdminUserOverview[] | null>(null);
  const [parsers, setParsers] = useState<ParserState[] | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    const [s, u, o, p, t, st] = await Promise.allSettled([fetchAdminStats(), authService.fetchUsers(), fetchUsersOverview(), fetchParsers(), fetchOpenTickets(), fetchSettings()]);
    // Optional sources: on failure keep the last good value (null on first load hides the block).
    if (o.status === "fulfilled") setOverview(o.value);
    if (p.status === "fulfilled") setParsers(p.value);
    if (t.status === "fulfilled") setTickets(t.value);
    if (st.status === "fulfilled") setSettings(st.value);
    if (s.status === "fulfilled") {
      setStats(s.value); setError(""); setUpdatedAt(hhmm()); setLoadedAt(Date.now());
      if (manual) { setRefreshDone(true); window.setTimeout(() => setRefreshDone(false), 1400); }
    }
    else setError((s.reason as Error)?.message || "Сервер не відповідає");
    if (u.status === "fulfilled") { setUsers(u.value); setUsersError(false); } else setUsersError(true);
    setLoading(false);
    setRefreshing(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  // Телефон: потягніть сторінку вниз з самого верху — дані оновляться (дизайн «Дашборд, мобільна»)
  const PULL_MAX = 110, PULL_GO = 70;
  const [pull, setPull] = useState(0);
  const [pulling, setPulling] = useState(false);
  const pullRef = useRef({ y0: 0, on: false, d: 0 });
  useEffect(() => {
    const mobile = () => window.matchMedia("(max-width: 767px)").matches;
    const start = (e: TouchEvent) => {
      if (!mobile() || window.scrollY > 0 || document.querySelector(".v3-cmd-backdrop, [role=dialog]")) return;
      pullRef.current = { y0: e.touches[0].clientY, on: true, d: 0 };
    };
    const move = (e: TouchEvent) => {
      if (!pullRef.current.on) return;
      const dy = e.touches[0].clientY - pullRef.current.y0;
      if (dy <= 0 || window.scrollY > 0) { if (pullRef.current.d) { pullRef.current.d = 0; setPull(0); setPulling(false); } return; }
      const d = Math.min(PULL_MAX, dy * 0.5);
      pullRef.current.d = d;
      setPulling(true);
      setPull(d);
    };
    const end = () => {
      if (!pullRef.current.on) return;
      const go = pullRef.current.d >= PULL_GO;
      pullRef.current.on = false;
      setPulling(false);
      if (go) { setPull(56); load(true).then(() => { setPull(0); toast.success("Дані оновлено", { id: "data-refreshed", description: `станом на ${hhmm()}` }); }); }
      else setPull(0);
    };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
    return () => { window.removeEventListener("touchstart", start); window.removeEventListener("touchmove", move); window.removeEventListener("touchend", end); window.removeEventListener("touchcancel", end); };
  }, [load]);
  useEffect(() => {
    if (!online) return;
    const id = window.setInterval(() => load(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [online, load]);

  const expiring = useMemo(() => expiringUsers(users, 7), [users]);
  useEffect(() => {
    if (!barOpen) return;
    const close = (e: MouseEvent) => { const t = e.target as HTMLElement; if (!t.closest?.(".v3-bar-pop") && (t.classList?.contains("v3-bar-backdrop") || !t.closest?.(".v3-bar-col"))) setBarOpen(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setBarOpen(null); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [barOpen]);
  useEffect(() => { setBarOpen(null); }, [mode]);
  useEffect(() => {
    if (!stats) return;
    setGrown(false);
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setGrown(true)));
    return () => cancelAnimationFrame(id);
  }, [stats ? 1 : 0, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const viewMemo = useMemo(() => {
    if (!stats) return null;
    const pay = Object.fromEntries((stats.paymentsByMonth || []).map((r) => [r.month, r]));
    const est = Object.fromEntries(stats.revenueByMonth.map((r) => [r.month, r.revenue]));
    const reg = Object.fromEntries(stats.registrationsByMonth.map((r) => [r.month, r.count]));
    const year = now.year;
    const all12 = Array.from({ length: 12 }, (_, i) => monthKey(year, i));
    const months = all12.slice(0, now.month);
    const series = all12.map((m, i) => ({ m, future: i >= now.month, v: mode === "pay" ? pay[m]?.amount || 0 : est[m] || 0 }));
    const max = Math.max(1, ...series.map((s) => s.v));
    const selected = period === "year" ? months : [period];
    const paid = selected.reduce((s, m) => s + (pay[m]?.amount || 0), 0);
    const paidCount = selected.reduce((s, m) => s + (pay[m]?.count || 0), 0);
    let paidDelta: number | null = null;
    let paidAbs = "";
    if (period !== "year") {
      const prev = pay[prevKey(period)]?.amount || 0;
      // Last month had nothing: a % cannot be counted, so the chip shows the amount itself («↑ +210 ₴»).
      paidDelta = prev ? Math.round(((paid - prev) / prev) * 1000) / 10 : paid > 0 ? 1 : 0;
      if (!prev) paidAbs = paid > 0 ? `+${money(paid)}` : "0%";
    }
    const report = months.map((m, i) => {
      const prev = i > 0 ? pay[months[i - 1]]?.amount || 0 : null;
      const cur = pay[m]?.amount || 0;
      const current = m === now.key;
      const delta = current || prev === null || prev === 0 ? null : Math.round(((cur - prev) / prev) * 1000) / 10;
      return { m, name: MONTHS_FULL[monthIdx(m)], paid: cur, est: est[m] || 0, users: reg[m] || 0, delta, current };
    }).reverse();
    // Active users by plan from /admin/users; fallback — all users by plan from /admin/stats.
    const plansRaw = overview ? activePlans(overview) : (stats.planDistribution || []).map((p) => ({ plan: p.plan, label: p.label, count: p.count }));
    // Завжди всі три тарифи (Pro, Базова, Пробний) — порожній тариф показуємо доріжкою без дуги
    const priceFor = (k: string) => (k === "pro" ? settings?.proPrice : k === "basic" ? settings?.basicPrice : undefined);
    const plans = (["pro", "basic", "trial"] as const).map((k) => plansRaw.find((p) => p.plan === k) || { plan: k, label: priceFor(k) ? `${PLAN_NAMES[k]} · ${Number(priceFor(k)).toLocaleString("uk-UA")} ₴` : PLAN_NAMES[k], count: 0 })
      .concat(plansRaw.filter((p) => !["pro", "basic", "trial"].includes(p.plan) && p.count > 0));
    const planTotal = plans.reduce((s, p) => s + p.count, 0);
    const sel = <T extends { month: string }>(rows?: T[]) => (rows || []).filter((r) => selected.includes(r.month));
    const prevSel = <T extends { month: string }>(rows?: T[]) => (period === "year" ? [] : (rows || []).filter((r) => r.month === prevKey(period)));
    const cancelled = sel(stats.cancellations?.byMonth).reduce((s, r) => s + r.count, 0);
    const refunds = sel(stats.refunds?.byMonth);
    const refundCount = refunds.reduce((s, r) => s + r.count, 0);
    const refundAmount = refunds.reduce((s, r) => s + r.amount, 0);
    const prevCancelled = prevSel(stats.cancellations?.byMonth).reduce((s, r) => s + r.count, 0) + prevSel(stats.refunds?.byMonth).reduce((s, r) => s + r.count, 0);
    const ai = sel(stats.aiUsage?.byMonth).reduce((s, r) => s + r.costUsd, 0);
    const aiCalls = sel(stats.aiUsage?.byMonth).reduce((s, r) => s + (r.calls || 0), 0);
    const prevReg = reg[prevKey(now.key)] || 0;
    return { pay, est, reg, series, max, paid, paidCount, paidDelta, paidAbs, report, plans, planTotal, prevReg, cancels: cancelled + refundCount, refundCount, refundAmount, prevCancelled, ai, aiCalls, total: months.reduce((s, m) => s + (mode === "pay" ? pay[m]?.amount || 0 : est[m] || 0), 0), year };
  }, [stats, overview, mode, period, now.key, now.month, now.year, settings]);
  const view = viewMemo;

  const firstChip = Math.max(0, now.month - 3);
  const recentChips = Array.from({ length: now.month - firstChip }, (_, i) => ({ key: monthKey(now.year, firstChip + i), label: MONTHS_FULL[firstChip + i] }));
  // A month picked on the chart that is older than the last three also gets a chip.
  const extraChip = period !== "year" && !recentChips.some((c) => c.key === period) ? [{ key: period, label: MONTHS_FULL[monthIdx(period)] }] : [];
  const periodChips = [{ key: "year", label: "Поточний рік" }, ...extraChip, ...recentChips];
  // Mobile list: the whole year so far, newest first.
  const periodOptions = [{ key: "year", label: "Поточний рік" }, ...Array.from({ length: now.month }, (_, i) => ({ key: monthKey(now.year, now.month - 1 - i), label: `${MONTHS_FULL[now.month - 1 - i]} ${now.year}` }))];
  const periodLabel = period === "year" ? `${now.year} рік` : `${MONTHS_FULL[monthIdx(period)]} ${period.slice(0, 4)}`;

  async function extendSelected(ids: number[], inline = false) {
    const targets = expiring.filter((e) => ids.includes(e.user.id));
    setExtending(true);
    if (inline) { setExtDoneIds([]); setExtPhase("run"); }
    const done: { id: number; prev: string; name: string }[] = [];
    for (const { user } of targets) {
      try {
        await authService.updateUser(user.id, { endDate: extendedEndDate(user.endDate, EXTEND_DAYS) });
        done.push({ id: user.id, prev: user.endDate, name: user.username });
        if (inline) setExtDoneIds((v) => [...v, user.id]);
      } catch { /* reported below */ }
    }
    setExtending(false);
    setConfirmOpen(false);
    if (inline) {
      setExtPhase(done.length ? "done" : "idle");
      // Дати час побачити зелені «+30 днів» у рядках, потім оновити список.
      await new Promise((r) => window.setTimeout(r, 1800));
    }
    await load();
    if (inline) { setExtPhase("idle"); setExtDoneIds([]); }
    if (done.length < targets.length) toast.error(`Не вдалося продовжити ${targets.length - done.length} з ${targets.length}`, { description: "Решту продовжено. Спробуйте ще раз для тих, що залишились." });
    if (done.length) {
      toast.success(`Продовжено ${done.length} ${plural(done.length, "підписку", "підписки", "підписок")} на ${EXTEND_DAYS} днів`, {
        description: done.map((d) => `@${d.name}`).join(", "),
        duration: Infinity,
        action: {
          label: <UndoRing />,
          onClick: async () => {
            const failed = (await Promise.allSettled(done.map((d) => authService.updateUser(d.id, { endDate: d.prev })))).filter((r) => r.status === "rejected").length;
            await load();
            if (failed) toast.error("Не всі дати вдалося повернути", { description: "Перевірте підписки в розділі «Користувачі»." });
            else toast.info("Продовження скасовано", { description: "Дати повернулись як були" });
          },
        },
      });
    }
  }

  function exportCsv() {
    if (!view) return;
    const v = view;
    toast.promise(new Promise<void>((resolve) => window.setTimeout(() => { doExport(v); resolve(); }, 700)), {
      loading: "Готуємо CSV…",
      success: `Звіт за ${v.year} рік завантажено`,
      error: "Не вдалося сформувати CSV",
    });
  }
  function doExport(view: NonNullable<typeof viewMemo>) {
    downloadCsv(`matchiq-report-${view.year}.csv`, ["Місяць", "Отримані оплати, ₴", "Вартість підписок, ₴", "Нові користувачі", "До попереднього, %"],
      [...view.report].reverse().map((r) => [`${r.name} ${view.year}`, r.paid, r.est, r.users, r.delta ?? ""]));
  }

  // /admin/stats counts totalUsers with role = 'user' only (admins are not in it), so no subtraction here.
  const emptyPlatform = !!stats && stats.totalUsers <= 0;
  const header = (
    <section className="v3-hero v3-hero-row">
      <div>
        <h1 className="v3-title">Дашборд</h1>
        <p className="v3-subtitle">
          {emptyPlatform
            ? <><span className="v3-hide-mobile">Тут з’являться оплати, підписки й активність, щойно на платформі будуть перші користувачі.</span><span className="v3-only-mobile">Показники з’являться після перших користувачів і оплат.</span></>
            : <>Оплати, підписки й активність MatchIQ — за обраний період.{updatedAt && <span className="v3-dim v3-only-mobile"> · Оновлено {updatedAt}</span>}</>}
        </p>
      </div>
      <div className="v3-chips" role="group" aria-label="Період">
        <div className="v3-seg v3-pseg v3-hide-mobile">
          <PillTrack active={`${period}-${periodChips.length}`} />
          {periodChips.map((c) => <button key={c.key} type="button" className={period === c.key ? "is-on" : ""} aria-pressed={period === c.key} onClick={() => setPeriod(c.key)}>{c.label}</button>)}
        </div>
        {updatedAt && <span className="v3-asof v3-hide-mobile">станом на {updatedAt}</span>}
        <div className="v3-only-mobile v3-period-wrap"><PeriodMenu value={period} options={periodOptions} onChange={setPeriod} /></div>
        {/* Phone: round button like on «Ставки» — arrows spin while loading, then a tick */}
        <button type="button" className="v3-bt-rfb v3-only-mobile" onClick={() => load(true)} disabled={refreshing || !online} aria-label={refreshing ? "Оновлюємо" : "Оновити"}>
          {refreshDone ? <Check size={15} className="v3-bt-ok" aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" className={`v3-bt-rf${refreshing ? " v3-bt-rot" : ""}`} />}
        </button>
        <button type="button" className="v3-chip v3-refresh v3-hide-mobile" onClick={() => load(true)} disabled={refreshing || !online} aria-label={`Оновити дані · автоматично раз на хвилину`} title="Автооновлення раз на хвилину">
          {/* Кільце: скільки лишилось до автооновлення; на паузі без зв'язку */}
          {loadedAt > 0 && online && !refreshing && <svg key={loadedAt} className="v3-ar-ring" width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="2.4" /><circle className="v3-ar-p" cx="10" cy="10" r="8" fill="none" stroke="#5a8cff" strokeWidth="2.4" strokeLinecap="round" style={{ animationDuration: `${REFRESH_MS}ms` }} /></svg>}
          <RefreshCw size={14} className={`v3-ref-ic${refreshing ? " animate-spin" : ""}`} aria-hidden="true" /><span className="v3-hide-mobile">Оновити</span>
        </button>
      </div>
    </section>
  );

  if (loading) {
    return (
      <div className="v3-page v3-dash" aria-busy="true">
        {header}
        <p className="sr-only" role="status">Завантаження аналітики…</p>
        <section className="v3-kpis">{[0, 1, 2, 3].map((i) => <div key={i} className="v3-kpi v3-skel-card"><span className="v3-skel" style={{ width: "50%" }} /><span className="v3-skel v3-skel-lg" /><span className="v3-skel" style={{ width: "70%" }} /></div>)}</section>
        <section className="v3-dash-main"><div className="v3-dcard v3-chart-card v3-skel-card" style={{ minHeight: 360 }} /><div className="v3-wcard v3-attention v3-skel-light" style={{ minHeight: 360 }} /></section>
      </div>
    );
  }

  if (!stats || !view) {
    return (
      <div className="v3-page v3-dash">
        {header}
        <div className="v3-wcard v3-error-card" role="alert">
          <span className="v3-error-ico"><AlertTriangle size={22} aria-hidden="true" /></span>
          <div>
            <h2>Не вдалося оновити статистику</h2>
            <p>Сервер повернув помилку. Дані в безпеці — спробуйте ще раз за хвилину.</p>
            {showDetails && <code className="v3-error-details">{error}</code>}
            <div className="v3-error-actions">
              <button type="button" className="v3-btn v3-btn-dark" onClick={() => load(true)} disabled={refreshing || !online}>Спробувати ще раз</button>
              <button type="button" className="v3-btn v3-btn-ghost" onClick={() => setShowDetails((v) => !v)} aria-expanded={showDetails}>Деталі</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const regularUsers = stats.totalUsers;
  const isEmpty = regularUsers <= 0;
  const byId = new Map((overview || []).map((u) => [u.id, u]));
  const byName = new Map((overview || []).map((u) => [u.username, u]));
  const periodShort = period === "year" ? `${now.year} рік` : MONTHS_FULL[monthIdx(period)];
  const usd = (n: number) => `$${n.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const rate = stats.aiUsage?.usdToUah || 0;
  const aiMoney = (n: number) => (rate ? `≈ ${money(n * rate)}` : usd(n));
  const conv = stats.conversion;
  const c30 = conv?.last30;
  const convPct = c30 && c30.trialEnded ? Math.round((c30.converted / c30.trialEnded) * 100) : null;
  const aiToday = stats.aiUsage?.today;
  const inactiveDays = settings?.churnInactiveDays || INACTIVE_DAYS;
  const lossStreak = settings?.churnLossStreak || LOSS_STREAK;

  type Alert = { key: string; dot: "red" | "blue" | "amber"; title: string; sub: string; to: string; cta: string };
  const alerts: Alert[] = [];
  if (parsers) {
    parsers.filter((p) => p.open || p.failures24h > 0).forEach((p) => {
      const name = PARSER_NAMES[p.name] || p.name;
      alerts.push({ key: `parser-${p.name}`, dot: "red", title: p.open ? `${name} не відповідає` : `${name}: ${p.failures24h} ${plural(p.failures24h, "збій", "збої", "збоїв")} за 24 год`, sub: p.lastFailure ? `остання помилка ${ago(p.lastFailure)}` : "парсер вимкнено після помилок", to: "/matches", cta: "Парсери" });
    });
  } else if (stats.parserFailures24h > 0) {
    alerts.push({ key: "parsers", dot: "red", title: `Збої парсерів · ${stats.parserFailures24h}`, sub: "за останні 24 години", to: "/matches", cta: "Парсери" });
  }
  const openTickets = tickets ? tickets.length : stats.openSupportTickets || 0;
  if (openTickets > 0) {
    const oldest = tickets && [...tickets].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    alerts.push({ key: "support", dot: "red", title: `${openTickets} ${plural(openTickets, "відкрите звернення", "відкриті звернення", "відкритих звернень")}`, sub: oldest ? `найстаріше — ${ago(oldest.createdAt)}${oldest.username ? ` · @${oldest.username}` : ""}` : "очікують відповіді", to: "/support", cta: "Підтримка" });
  }
  const selfLim = stats.selfLimitation;
  if (selfLim && (selfLim.new > 0 || selfLim.latest.length > 0)) {
    const top = selfLim.latest[0];
    alerts.push({
      key: "self", dot: "blue",
      title: selfLim.new > 1 ? `Нові запити на самообмеження · ${selfLim.new}` : selfLim.new === 1 ? "Новий запит на самообмеження" : "Самообмеження застосовано",
      sub: top ? `@${top.username} · ${limitLabel(top.periodDays)} · ${top.status === "applied" ? "застосовано" : "очікує рішення"}` : "очікує рішення",
      to: top ? `/users?q=${encodeURIComponent(top.username)}` : "/users", cta: "Переглянути",
    });
  }
  if (stats.unverifiedAge > 0) {
    const names = (stats.ageUnverified || []).map((a) => `@${a.username}`);
    alerts.push({ key: "age", dot: "amber", title: `Вік не підтверджено · ${stats.unverifiedAge}`, sub: names.length ? names.join(", ") + (stats.unverifiedAge > names.length ? ` і ще ${stats.unverifiedAge - names.length}` : "") : "очікує підтвердження", to: names.length === 1 ? `/users?q=${encodeURIComponent(names[0].slice(1))}` : "/users", cta: "Відкрити" });
  }
  const attentionCount = alerts.length + expiring.length;
  const recentPaidAll = (stats.recentPayments || []).filter((p) => p.status === "recorded").slice(0, 6);
  const recentPaid = recentPaidAll.slice(0, 3);
  const churned = overview ? churnedUsers(overview) : null;
  const risk = overview ? churnRisk(overview, inactiveDays, lossStreak) : null;
  const retTotal = (stats.retention?.retained || 0) + (stats.retention?.churned || 0);
  const prevMonthIdx = monthIdx(prevKey(now.key));
  const kpis = [
    { icon: Wallet, label: "Отримані оплати", short: "Отримані оплати", value: money(view.paid), note: isEmpty ? "оплат ще не додано" : `${periodLabel} · ${view.paidCount} ${payWord(view.paidCount)}`, delta: view.paidDelta, deltaAbs: view.paidAbs, deltaNote: period !== "year" ? `до ${MONTHS_GEN[monthIdx(prevKey(period))]}` : "", to: "/payments", hero: !isEmpty },
    { icon: TrendingUp, label: "Вартість підписок / міс.", short: "Підписки / міс.", value: money(stats.mrr), note: isEmpty ? "немає активних підписок" : "розрахунок за тарифами", to: "/users?status=paid" },
    { icon: Users, label: "Активні користувачі", short: "Активні", value: String(stats.activeUsers), note: isEmpty ? "без адміністраторів" : `з ${regularUsers}`, to: "/users?status=all" },
    { icon: UserPlus, label: "Нові цього місяця", short: "Нові цього місяця", value: String(stats.newThisMonth), note: isEmpty ? "реєстрацій ще немає" : `${view.prevReg} у ${MONTHS_LOC[prevMonthIdx]}`, to: "/users?status=all&sort=new" },
  ];
  const chartEmpty = view.total === 0;
  const barCmp = (i: number) => {
    const cur = view.series[i]?.v || 0, prev = i > 0 ? view.series[i - 1]?.v || 0 : 0;
    if (!prev) return "клік — деталі місяця";
    const d = Math.round(((cur - prev) / prev) * 1000) / 10;
    return `${pct(d)} до ${MONTHS_GEN[monthIdx(view.series[i - 1].m)]}`;
  };
  function monthPopover(m: string, i: number) {
    const name = MONTHS_FULL[monthIdx(m)];
    const p = view!.pay[m];
    const prev = view!.pay[prevKey(m)]?.amount || 0;
    const delta = prev && m !== now.key ? Math.round((((p?.amount || 0) - prev) / prev) * 1000) / 10 : null;
    const cancels = (stats!.cancellations?.byMonth || []).find((r) => r.month === m)?.count || 0;
    const refund = (stats!.refunds?.byMonth || []).find((r) => r.month === m);
    const ai = (stats!.aiUsage?.byMonth || []).find((r) => r.month === m);
    const rateUah = stats!.aiUsage?.usdToUah || 0;
    const side = i < 6 ? " is-right-of" : " is-left-of";
    return (
      <div className={`v3-bar-pop${side}`} role="dialog" aria-label={`${name} ${m.slice(0, 4)}`}>
        <div className="v3-bar-pop-head"><strong>{name} {m.slice(0, 4)}</strong>{m === now.key && <span className="v3-tag">Поточний</span>}</div>
        <dl>
          <div><dt>Отримані оплати</dt><dd>{money(p?.amount || 0)} <small>· {p?.count || 0} {payWord(p?.count || 0)}</small></dd></div>
          <div><dt>Вартість підписок</dt><dd>{money(view!.est[m] || 0)}</dd></div>
          <div><dt>Нові користувачі</dt><dd>{view!.reg[m] || 0}</dd></div>
          <div><dt>Скасування</dt><dd>{cancels + (refund?.count || 0)}{refund?.amount ? <small> · повернено {money(refund.amount)}</small> : null}</dd></div>
          {ai && <div><dt>Витрата AI</dt><dd>{rateUah ? `≈ ${money(ai.costUsd * rateUah)}` : `$${ai.costUsd.toFixed(2)}`}{ai.calls ? <small> · {ai.calls} {plural(ai.calls, "аналіз", "аналізи", "аналізів")}</small> : null}</dd></div>}
          {delta !== null && <div><dt>До {MONTHS_GEN[monthIdx(prevKey(m))]}</dt><dd className={delta >= 0 ? "v3-up-l" : "v3-down-l"}>{pct(delta)}</dd></div>}
        </dl>
        {period !== m && <button type="button" className="v3-btn v3-btn-blue v3-btn-sm v3-btn-block" onClick={() => { setPeriod(m); setBarOpen(null); }}>Показати {name.toLowerCase()} на дашборді</button>}
      </div>
    );
  }
  const calmSide = !attentionCount && !usersError;
  // Коли праворуч «Усе спокійно» (менша картка), у стрічці вистачає місця на 6 рядків
  const feedN = !attentionCount && !usersError ? 6 : 3;
  const feedPaid = recentPaidAll.slice(0, feedN);
  const lostList = (churned || []).slice(0, feedN);
  const feedTab = feed;
  const feedBlock = (
    <section className="v3-dcard v3-side-plans v3-side-pay v3-feed v3-hide-mobile" aria-label="Останні оплати й ті, хто не продовжив">
      <div className="v3-seg" role="group" aria-label="Що показати">
        <PillTrack active={feedTab} />
        <button type="button" className={feedTab === "pay" ? "is-on" : ""} aria-pressed={feedTab === "pay"} onClick={() => setFeed("pay")}>Останні оплати <span>{feedPaid.length}</span></button>
        <button type="button" className={feedTab === "lost" ? "is-on" : ""} aria-pressed={feedTab === "lost"} onClick={() => setFeed("lost")}>Не продовжили <span>{churned ? churned.length : 0}</span></button>
      </div>
      {feedTab === "pay" && !feedPaid.length ? (
        <div key="pay0" className="v3-feed-blank"><span className="v3-empty-halo" aria-hidden="true"><span className="v3-chart-empty-ico v3-empty-float"><Wallet size={20} strokeWidth={1.8} /></span></span><strong>Оплат ще немає</strong><small>Нові оплати з’являться тут одразу після запису в картці користувача.</small></div>
      ) : feedTab === "lost" && !lostList.length ? (
        <div key="lost0" className="v3-feed-blank"><span className="v3-empty-halo" aria-hidden="true"><span className="v3-chart-empty-ico v3-empty-float"><UserCheck size={20} strokeWidth={1.8} /></span></span><strong>Відтоку немає</strong><small>Усі, у кого закінчилась підписка, продовжили її.</small></div>
      ) : feedTab === "pay" ? (
        <ul key="pay" className="v3-feed-list">
          {feedPaid.map((p) => (
            <li key={p.id}>
              <UserAvatar username={p.username} telegram={byName.get(p.username)?.telegram} className="v3-av-sm" />
              <span className="v3-pay-who"><strong>@{p.username}</strong><small>{[p.plan ? PLAN_NAMES[p.plan] : byName.has(p.username) ? planText(byName.get(p.username)).split(" · ")[0] : "", p.promoCode, relDay(p.paidOn)].filter(Boolean).join(" · ")}</small></span>
              <span className="v3-pay-amt">+{money(p.amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <ul key="lost" className="v3-feed-list">
          {lostList.map(({ user, ended, tenure }) => {
            const tg = telegramLink(user.telegram);
            return (
              <li key={user.id}>
                <UserAvatar username={user.username} telegram={user.telegram} className="v3-av-sm" />
                <span className="v3-pay-who"><Link to={`/users?q=${encodeURIComponent(user.username)}`}><strong>@{user.username}</strong></Link><small>закінчилась {ended}{tenure && ` · ${tenure}`}</small></span>
                {tg && <WriteButton href={tg} dark />}
              </li>
            );
          })}
        </ul>
      )}
      <div className="v3-feed-foot"><Link to={feedTab === "pay" ? "/payments" : "/users?status=expired"} className="v3-head-link">{feedTab === "pay" ? "Усі оплати" : "Усі, хто не продовжив"} <span className="v3-ar" aria-hidden="true">→</span></Link></div>
    </section>
  );
  const retCard = retTotal > 0 ? <RetentionCard retained={stats.retention.retained} churned={stats.retention.churned} byMonth={stats.retention.byMonth} focusMonth={period === "year" || period === now.key ? prevKey(now.key) : period} list={churned} /> : null;
  const plansBlock = (cls: string) => (
                <div className={`v3-plans ${cls}`}>
                  <div className="v3-plans-head"><h3>{overview ? "Активні за тарифами" : "Користувачі за тарифами"}</h3><span>{view.planTotal} {overview ? plural(view.planTotal, "активний", "активні", "активних") : "усього"}</span></div>
                  <PlanDial plans={view.plans} colors={PLAN_COLORS} total={view.planTotal} unit={overview ? "активних" : "усього"} />
                  <p className="v3-dial-hint v3-hide-mobile">{view.planTotal > 0 ? "Оберіть рядок, щоб виділити кільце" : "Кільця заповняться з першими підписками"}</p>
                </div>
  );

  const nextRenewal = users.filter((u) => u.endDate && new Date(u.endDate).getTime() > Date.now()).sort((a, b) => a.endDate.localeCompare(b.endDate))[0];
  const parsersOk = parsers ? !parsers.some((p) => p.open || p.failures24h > 0) : stats.parserFailures24h === 0;
  const calmCompact = (
    <aside className="v3-wcard v3-calm-mini" aria-label="Потребує уваги">
      <div className="v3-calm-mini-head">
        <span className="v3-calm-ok"><Check size={18} strokeWidth={2.6} aria-hidden="true" /></span>
        <div><h2 className="v3-h2">Усе спокійно</h2><p className="v3-note-dark">Збоїв, звернень і підписок, що закінчуються за 7 днів, немає</p></div>
      </div>
      <div className="v3-calm-mini-grid">
        <div><span>Парсери</span><b>{parsersOk && <i className="v3-calm-dot" aria-hidden="true" />}{parsersOk ? "працюють" : "є збої"}</b></div>
        <div><span>Звернення</span><b>{openTickets ? `${openTickets} нових` : "0 нових"}</b></div>
        <div><span>Найближче</span><b>{nextRenewal ? shortDate(nextRenewal.endDate) : "—"}</b></div>
      </div>
      <Link to="/users?status=all" className="v3-head-link v3-calm-mini-link">Усі підписки <span className="v3-ar" aria-hidden="true">→</span></Link>
    </aside>
  );
  const calmCard = (
    <aside className="v3-dcard v3-calm-card" aria-label="Потребує уваги">
      <span className="v3-calm-ico"><Check size={26} strokeWidth={1.8} aria-hidden="true" /></span>
      <h2>Усе спокійно</h2>
      <p><span className="v3-hide-mobile">Підписок, що закінчуються за 7 днів, і незавершених дій немає.</span><span className="v3-only-mobile">Немає підписок, що закінчуються</span></p>
    </aside>
  );

  const ptrLabel = refreshing && pull ? "Оновлюємо…" : pull >= PULL_GO ? "Відпустіть, щоб оновити" : "Потягніть, щоб оновити";
  return (
    <div className={`v3-page v3-dash${pulling ? " is-pulling" : ""}`} style={pull ? { transform: `translateY(${pull}px)` } : undefined}>
      <div className="v3-ptr v3-only-mobile" aria-hidden={!pull} style={{ opacity: Math.min(1, pull / 40) }}>
        <svg className={refreshing && pull ? "is-spin" : ""} width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="2.6" /><circle cx="12" cy="12" r="9" fill="none" stroke="#5a8cff" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="56.5" strokeDashoffset={refreshing && pull ? 40 : 56.5 - Math.min(1, pull / PULL_GO) * 56.5} transform="rotate(-90 12 12)" /></svg>
        <span>{ptrLabel}</span>
      </div>
      {header}

      {!online && <div className="v3-stale v3-offline" role="status"><WifiOff size={18} aria-hidden="true" /><span><b>Немає інтернету.</b> Показуємо дані з останнього оновлення{updatedAt ? ` о ${updatedAt}` : ""}. Продовження й зміни запрацюють після відновлення зв’язку, автооновлення призупинено.</span><button type="button" onClick={() => load(true)}>Перевірити ще раз</button></div>}
      {online && error && <div className="v3-stale" role="alert"><AlertTriangle size={18} aria-hidden="true" /><span><b>Не вдалося оновити статистику.</b> Показуємо дані станом на {updatedAt}. Нові оплати з’являться після відновлення.</span><button type="button" onClick={() => load(true)}>Спробувати ще раз</button></div>}

      <div className={`v3-dash-top${isEmpty ? " is-empty" : ""}`}>
      <section className="v3-kpis">
        {kpis.map(({ icon: Icon, label, short, value, note, delta, deltaAbs, deltaNote, to, hero }) => (
          <Link key={label} to={to} className={`v3-kpi${hero ? " is-hero" : ""}`}>
            <span className="v3-kpi-l"><span className="v3-kpi-ico"><Icon size={16} aria-hidden="true" /></span><span className="v3-hide-mobile">{label}</span><span className="v3-only-mobile">{short}</span></span>
            <strong className="v3-kpi-v"><RollingNumber key={`${value}-${period}`} text={value} /></strong>
            <span className="v3-kpi-n">{delta != null && <><span className={`v3-dl ${hero ? "is-onblue " : ""}${delta === 0 ? "is-flat" : delta > 0 ? "is-up" : "is-down"}${delta < 0 ? " is-neg" : ""}`}><ArrowUp size={10} strokeWidth={3} aria-hidden="true" />{deltaAbs || pct(Math.abs(delta)).replace("+", "")}</span><span className="sr-only">{delta >= 0 ? "зростання" : "падіння"} </span>{deltaNote} · </>}{note}</span>
          </Link>
        ))}
      </section>

      {isEmpty && (
        <section className="v3-kpis v3-kpis-second">
          <div className="v3-kpi"><span className="v3-kpi-l"><span className="v3-kpi-ico"><ArrowRight size={16} aria-hidden="true" /></span>Пробний → платний</span><strong className="v3-kpi-v v3-dimv">—</strong><span className="v3-kpi-n">порахуємо після першого пробного</span></div>
          <div className="v3-kpi"><span className="v3-kpi-l"><span className="v3-kpi-ico"><MinusCircle size={16} aria-hidden="true" /></span>Скасування</span><strong className="v3-kpi-v v3-dimv">0</strong><span className="v3-kpi-n">скасувань і повернень немає</span></div>
          <div className="v3-kpi v3-kpi-wide-sm"><span className="v3-kpi-l"><span className="v3-kpi-ico"><Sparkles size={16} aria-hidden="true" /></span>Витрата AI<span className="v3-only-mobile v3-kpi-l-tail">· {periodShort.toLowerCase()}</span></span><strong className="v3-kpi-v v3-dimv">0<small className="v3-kpi-unit"> ₴</small></strong><span className="v3-kpi-n">аналізів ще не було</span></div>
        </section>
      )}
      {!isEmpty && (
        <section className="v3-kpis v3-kpis-second">
          {conv && <Link to="/users?status=trial" className="v3-kpi">
            <span className="v3-kpi-l"><span className="v3-kpi-ico"><ArrowRight size={16} aria-hidden="true" /></span>Пробний → платний</span>
            <strong className="v3-kpi-v">{convPct === null ? "—" : <><RollingNumber key={`cv-${convPct}`} text={String(convPct)} /><small className="v3-kpi-unit">%</small></>}</strong>
            <span className="v3-kpi-bar v3-hide-mobile" aria-hidden="true"><span className="v3-fill" style={{ width: `${convPct || 0}%` }} /></span>
            <span className="v3-kpi-n"><span className="v3-hide-mobile">{c30 && c30.trialEnded ? `${c30.converted} з ${c30.trialEnded} за 30 днів` : "за 30 днів пробних не закінчувалось"} · </span>{conv.trial ? `зараз на пробному ${conv.trial}` : "на пробному нікого"}</span>
          </Link>}
          <Link to="/payments?tab=ref" className="v3-kpi">
            <span className="v3-kpi-l"><span className="v3-kpi-ico"><MinusCircle size={16} aria-hidden="true" /></span>Скасування</span>
            <strong className={`v3-kpi-v${view.cancels ? " is-red" : ""}`}><RollingNumber key={`c-${view.cancels}-${period}`} text={String(view.cancels)} /></strong>
            <span className="v3-kpi-n">
              <span className="v3-hide-mobile">{periodShort} · {view.refundCount ? `${view.refundCount} з поверненням ${money(view.refundAmount)}` : "без повернень"}{period !== "year" && ` · у ${MONTHS_LOC[monthIdx(prevKey(period))]} ${view.prevCancelled}`}</span>
              <span className="v3-only-mobile">{view.refundAmount ? `повернено ${money(view.refundAmount)}` : "без повернень"}</span>
            </span>
          </Link>
          {stats.aiUsage && <Link to="/settings" className="v3-kpi v3-kpi-wide-sm v3-kpi-ai">
            <span className="v3-kpi-l"><span className="v3-kpi-ico"><Sparkles size={16} aria-hidden="true" /></span>Витрата AI<span className="v3-only-mobile v3-kpi-l-tail">· {periodShort.toLowerCase()}</span></span>
            <strong className="v3-kpi-v">{rate ? <>≈ <RollingNumber key={`ai-${period}-${Math.round(view.ai * rate)}`} text={Math.round(view.ai * rate).toLocaleString("uk-UA")} /><small className="v3-kpi-unit"> ₴</small></> : usd(view.ai)}</strong>
            <span className="v3-kpi-n">
              <span className="v3-hide-mobile">{periodShort} · {view.aiCalls} {plural(view.aiCalls, "аналіз", "аналізи", "аналізів")} · сьогодні {aiToday?.calls ?? 0} ({aiMoney(aiToday?.costUsd ?? 0)})</span>
              <span className="v3-only-mobile v3-kpi-ai-side">{view.aiCalls} {plural(view.aiCalls, "аналіз", "аналізи", "аналізів")}<br />сьогодні {aiToday?.calls ?? 0}</span>
            </span>
          </Link>}
        </section>
      )}

      {isEmpty && <section className="v3-dash-main v3-dash-onboard">
        <section className="v3-wcard v3-onboard">
          <div>
            <span className="v3-tag">Перші кроки</span>
            <h2><span className="v3-hide-mobile">Налаштуйте платформу за 3 кроки</span><span className="v3-only-mobile">Налаштуйте платформу</span></h2>
            <p className="v3-note-dark"><span className="v3-hide-mobile">Коли з’явиться перший користувач з оплатою, дашборд почне рахувати показники автоматично.</span><span className="v3-only-mobile">Три кроки — і дашборд почне рахувати показники.</span></p>
          </div>
          <ol className="v3-steps">
            <li><span>1</span><div><strong><span className="v3-hide-mobile">Перевірте тарифи й пробний період</span><span className="v3-only-mobile">Тарифи й пробний період</span></strong><small className="v3-hide-mobile">{settings?.basicPrice && settings?.proPrice ? `Базова ${settings.basicPrice} ₴ і Pro ${settings.proPrice} ₴ за 30 днів, пробний період` : "Базова й Pro за 30 днів, пробний період"}</small></div><Link to="/settings" className="v3-btn v3-btn-ghost v3-btn-sm"><span className="v3-hide-mobile">Налаштування</span><ChevronRight size={18} className="v3-only-mobile" aria-label="Налаштування" /></Link></li>
            <li><span>2</span><div><strong><span className="v3-hide-mobile">Створіть першого користувача</span><span className="v3-only-mobile">Перший користувач</span></strong><small>Логін, Telegram, план: пробний, Базова або Pro</small></div><Link to="/users" className="v3-btn v3-btn-primary v3-btn-sm"><span className="v3-hide-mobile">Створити</span><ChevronRight size={18} className="v3-only-mobile" aria-label="Створити" /></Link></li>
            <li><span>3</span><div><strong><span className="v3-hide-mobile">Додайте банер на екран «Матчі»</span><span className="v3-only-mobile">Банер у «Матчах»</span></strong><small><span className="v3-hide-mobile">Екран «Матчі» · 2 слоти · мітка «Реклама · 21+»</span><span className="v3-only-mobile">«Матчі» · 2 слоти</span></small></div><Link to="/banners" className="v3-btn v3-btn-ghost v3-btn-sm"><span className="v3-hide-mobile">Банери</span><ChevronRight size={18} className="v3-only-mobile" aria-label="Банери" /></Link></li>
          </ol>
        </section>
        <div className="v3-hide-mobile v3-calm-wrap">{calmCard}</div>
      </section>}

      <section className="v3-dash-main">
        <div className="v3-dcard v3-chart-card">
          <div className="v3-card-head">
            <div>
              <h2 className="v3-h2">{mode === "pay" ? "Оплати" : "Вартість підписок"} за місяцями</h2>
              <p className="v3-note">{isEmpty ? `${view.year} · ручний облік оплат` : <>{mode === "pay" ? "Ручний облік, без скасованих оплат" : "Оцінка за поточними тарифами, не платежі"} · {view.year}</>}</p>
            </div>
            <div className="v3-chart-tools">
            {!isEmpty && <div className="v3-chart-total v3-only-wide"><strong>{money(view.total)}</strong><span>за рік</span></div>}
            <ExportCsvButton className="v3-btn v3-btn-ghost-dark v3-export v3-hide-mobile" onClick={exportCsv} disabled={isEmpty} title={isEmpty ? "Експорт з’явиться після першої оплати" : undefined} />
            <div className="v3-seg" role="group" aria-label="Показник графіка">
              <PillTrack active={mode} />
              <button type="button" className={mode === "pay" ? "is-on" : ""} aria-pressed={mode === "pay"} onClick={() => setMode("pay")}>Оплати</button>
              <button type="button" className={mode === "est" ? "is-on" : ""} aria-pressed={mode === "est"} onClick={() => setMode("est")}><span className="v3-hide-mobile">Вартість підписок</span><span className="v3-only-mobile">Підписки</span></button>
            </div>
            </div>
          </div>
          {!isEmpty && <div className="v3-chart-total v3-hide-wide"><strong>{money(view.total)}</strong><span>за рік</span></div>}
          <div className={`v3-bars-wrap${chartEmpty ? " is-empty" : ""}`}>
            <div className="v3-bars" role="img" aria-label={`Графік: ${view.series.filter((s) => !s.future).map((s) => `${MONTHS[monthIdx(s.m)]} ${money(s.v)}`).join(", ")}`}>
              {view.series.map((s, i) => {
                const on = period === s.m || (period === "year" && s.m === now.key);
                const hideMobile = i < now.month - 6 || s.future;
                const open = barOpen === s.m;
                const h = s.future ? "6%" : `${Math.max(4, Math.round((s.v / view.max) * 86))}%`;
                const name = MONTHS_FULL[monthIdx(s.m)];
                return (
                  <div key={s.m} className={`v3-bar-col${hideMobile ? " v3-hide-mobile" : ""}${open ? " is-open" : ""}`} style={{ "--i": i } as React.CSSProperties}>
                    <span className={`v3-bar-val${on ? " is-on" : ""}`}>{s.future ? "" : s.v ? shortK(s.v) : "—"}</span>
                    {s.future ? (
                      <div className="v3-bar is-future" style={{ height: h }} />
                    ) : (
                      <div className="v3-bar-slot" style={{ height: grown ? h : "0%" }}>
                        <button type="button" className={`v3-bar${on ? " is-on" : ""}`} aria-expanded={open} aria-label={`${name}: ${money(s.v)} — деталі`} onClick={() => setBarOpen(open ? null : s.m)} />
                        {!open && <span className={`v3-bar-tip${i < 2 ? " is-l" : i > 9 ? " is-r" : ""}`} aria-hidden="true"><span>{name} {s.m.slice(0, 4)}</span><b>{money(s.v)}</b><span>{barCmp(i)}</span></span>}
                        {open && <div className="v3-bar-backdrop v3-only-mobile" aria-hidden="true" onClick={() => setBarOpen(null)} />}
                        {open && monthPopover(s.m, i)}
                      </div>
                    )}
                    <span className="v3-bar-m">{MONTHS[monthIdx(s.m)]}</span>
                  </div>
                );
              })}
            </div>
            {chartEmpty && (
              <div className="v3-chart-empty">
                <span className="v3-empty-halo" aria-hidden="true"><span className="v3-chart-empty-ico v3-empty-float"><Wallet size={24} strokeWidth={1.8} /></span></span>
                <strong>{mode === "pay" ? "Оплат ще немає" : "Активних підписок ще немає"}</strong>
                <span className="v3-hide-mobile">Додайте першу оплату в картці користувача — графік заповниться автоматично.</span>
                <span className="v3-only-mobile">Графік заповниться після першої оплати</span>
                <Link to="/users" className="v3-btn v3-btn-primary v3-btn-sm v3-hide-mobile">Додати оплату</Link>
              </div>
            )}
          </div>
        </div>

        {isEmpty && <div className="v3-dash-side v3-empty-side v3-hide-mobile">
          {calmCard}
          <section className="v3-dcard v3-side-plans">{plansBlock("")}</section>
          <section className="v3-dcard v3-side-plans v3-feed v3-feed-empty" aria-label="Останні оплати">
            <div className="v3-seg is-dim" aria-hidden="true"><button type="button" className="is-on" tabIndex={-1}>Останні оплати <span>0</span></button><button type="button" tabIndex={-1}>Не продовжили <span>0</span></button></div>
            <div className="v3-feed-blank"><span className="v3-empty-halo" aria-hidden="true"><span className="v3-chart-empty-ico v3-empty-float"><Wallet size={20} strokeWidth={1.8} /></span></span><strong>Тут з’являться оплати</strong><small>Останні оплати й ті, хто не продовжив підписку, — щойно будуть перші користувачі.</small></div>
          </section>
        </div>}
        {!isEmpty && retCard && <div className="v3-ret-slot v3-ret-top">{retCard}</div>}
        {!isEmpty && <div className={`v3-dash-side${calmSide ? " is-calm" : ""}`}>
        {!attentionCount && !usersError ? calmCompact : <aside className="v3-wcard v3-attention">
          <div className="v3-attn-head"><h2 className="v3-h2">Потребує уваги</h2>{attentionCount > 0 && <span className="v3-tag v3-tag-red">{attentionCount}</span>}</div>
          <p className="v3-note-dark v3-hide-mobile">Збої, звернення, вік і підписки</p>
          {alerts.length > 0 && (
            <ul className="v3-alerts">
              {alerts.map((al, ai) => (
                <li key={al.key}>
                  <Link to={al.to} className="v3-alert-row">
                    <span className={`v3-alert-dot is-${al.dot}${ai === 0 && al.dot === "red" ? " is-pulse" : ""}`} aria-hidden="true" style={{ animationDelay: `${ai * 0.4}s` }} />
                    <span className="v3-exp-who"><strong>{al.title}</strong><small>{al.sub}</small></span>
                    <span className="v3-alert-cta"><span className="v3-hide-mobile">{al.cta} </span><span className="v3-ar" aria-hidden="true">→</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {usersError ? <p className="v3-note-dark v3-attn-sub">Не вдалося завантажити користувачів. <button type="button" className="v3-link-btn" onClick={() => load(true)}>Повторити</button></p>
            : expiring.length ? <>
              <p className="v3-note-dark v3-attn-sub">Підписки, що закінчуються за 7 днів</p>
              <ul className="v3-exp-list">
                {expiring.map(({ user, days }, i) => (
                  <li key={user.id} className={i >= 3 ? "v3-hide-mobile" : undefined}>
                    <SwipeRow tg={telegramLink(byId.get(user.id)?.telegram || user.telegram)} onExtend={() => extendSelected([user.id])} extendLabel={`+${EXTEND_DAYS} днів`} hint={i === 0}>
                    <Link to={`/users?q=${encodeURIComponent(user.username)}`} className="v3-exp-row">
                      <UserAvatar username={user.username} telegram={byId.get(user.id)?.telegram} />
                      <span className="v3-exp-who"><strong>@{user.username}</strong><small>{planText(byId.get(user.id), user.priceMonth)} · до {shortDate(extDoneIds.includes(user.id) ? extendedEndDate(user.endDate, EXTEND_DAYS) : user.endDate)}</small></span>
                      {extDoneIds.includes(user.id)
                        ? <span className="v3-tag v3-tag-green v3-tag-pop">+{EXTEND_DAYS} днів</span>
                        : <span className={`v3-tag ${days <= 2 ? "v3-tag-red" : days <= 4 ? "v3-tag-amber" : "v3-tag-gray"}`}>{daysLabel(days)}</span>}
                    </Link>
                    </SwipeRow>
                  </li>
                ))}
              </ul>
              <p className="v3-only-mobile v3-swipe-note">Потягніть рядок вліво — «Написати» або «+{EXTEND_DAYS} днів»</p>
              {expiring.length > 3 && <Link to="/users?status=expiring" className="v3-only-mobile v3-more-link">Усі {expiring.length} {plural(expiring.length, "користувач", "користувачі", "користувачів")} <span className="v3-ar" aria-hidden="true">→</span></Link>}
              <div className="v3-xall">
                {extPhase === "idle" && (
                  <button ref={xallBtnRef} type="button" className="v3-xall-btn" disabled={!online} title={online ? undefined : "Запрацює після відновлення зв’язку"} onClick={() => setExtPhase("ask")}>
                    <span className="v3-xall-avs v3-hide-mobile" aria-hidden="true">{expiring.slice(0, 4).map(({ user }) => <UserAvatar key={user.id} username={user.username} telegram={byId.get(user.id)?.telegram} className="v3-xall-av" />)}</span>
                    <span className="v3-hide-mobile">Продовжити всім на +{EXTEND_DAYS} днів</span><span className="v3-only-mobile">Продовжити всім · +{EXTEND_DAYS} днів</span><span className="v3-xall-ar" aria-hidden="true">→</span>
                  </button>
                )}
                {extPhase === "ask" && (
                  <div className="v3-xall-ask" role="group" aria-label="Підтвердження продовження" onKeyDown={(e) => { if (e.key === "Escape") setExtPhase("idle"); }}>
                    <button type="button" className="v3-btn v3-btn-outline" onClick={() => setExtPhase("idle")}>Скасувати</button>
                    <button ref={xallYesRef} type="button" className="v3-btn v3-btn-primary" onClick={() => extendSelected(expiring.map((e) => e.user.id), true)}><span className="v3-hide-mobile">Так, продовжити {expiring.length} · +{EXTEND_DAYS} днів</span><span className="v3-only-mobile">Так, {expiring.length} · +{EXTEND_DAYS} днів</span></button>
                  </div>
                )}
                {(extPhase === "run" || extPhase === "done") && (
                  <div className={`v3-xall-run${extPhase === "done" ? " is-done" : ""}`} role="status">
                    <span className="v3-xall-fill" style={{ width: `${(extDoneIds.length / Math.max(1, expiring.length)) * 100}%` }} aria-hidden="true" />
                    <span className="v3-xall-lbl">{extPhase === "done" ? <><Check size={15} strokeWidth={3} aria-hidden="true" />Продовжено {extDoneIds.length} {plural(extDoneIds.length, "підписку", "підписки", "підписок")}</> : `Продовжуємо ${extDoneIds.length} з ${expiring.length}…`}</span>
                  </div>
                )}
                {extPhase === "idle" && <button type="button" className="v3-link-btn v3-xall-pick" disabled={!online} onClick={() => setConfirmOpen(true)}>Вибрати, кому продовжити</button>}
              </div>
            </> : null}
        </aside>}
        {view.planTotal > 0 && <section className="v3-dcard v3-side-plans">{view.planTotal > 0 && plansBlock("")}</section>}
        {feedBlock}
        </div>}
      </section>
      </div>

      {!isEmpty && (retTotal > 0 || (risk && overview)) && (
        <section className="v3-dash-pair">
          {retTotal > 0 && <div className="v3-ret-slot v3-ret-pair">{retCard}</div>}
          {risk && <ChurnRiskCard rows={risk} inactiveDays={inactiveDays} lossStreak={lossStreak} thresholdsFromSettings={!!settings?.churnInactiveDays} />}
        </section>
      )}


      {isEmpty && <div className="v3-dcard v3-calm-row v3-only-mobile"><span className="v3-calm-ico" aria-hidden="true"><Check size={18} strokeWidth={2} /></span><div><strong>Усе спокійно</strong><small>Немає підписок, що закінчуються</small></div></div>}
      {isEmpty && <Link to="/users" className="v3-btn v3-btn-primary v3-btn-block v3-only-mobile v3-mobile-cta">Створити першого користувача</Link>}

      <ExtendConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen} items={expiring} days={EXTEND_DAYS} busy={extending} onConfirm={extendSelected} />
    </div>
  );
}
