import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, Check, ChevronRight, MinusCircle, RefreshCw, Sparkles, TrendingUp, UserPlus, Users, Wallet, WifiOff } from "lucide-react";
import { fetchAdminStats, type AdminStats } from "@/lib/adminStatsApi";
import { authService } from "@/lib/authService";
import { downloadCsv } from "@/lib/csv";
import { daysLabel, expiringUsers, extendedEndDate, money, shortDate } from "@/lib/subscriptions";
import ExtendConfirmDialog from "@/components/ExtendConfirmDialog";
import RetentionCard from "@/components/dashboard/RetentionCard";
import ChurnRiskCard from "@/components/dashboard/ChurnRiskCard";
import PeriodMenu from "@/components/dashboard/PeriodMenu";
import UserAvatar from "@/components/UserAvatar";
import { fetchUsersOverview } from "@/lib/adminBetsApi";
import { fetchSettings } from "@/lib/adminSettingsApi";
import { activePlans, ago, churnedUsers, churnRisk, fetchOpenTickets, fetchParsers, INACTIVE_DAYS, LOSS_STREAK, PARSER_NAMES, PLAN_COLORS, PLAN_NAMES, periodLabel as limitLabel, planText, plural, relDay, type ParserState, type SupportTicket } from "@/lib/dashboardInsights";
import type { AdminUser, AdminUserOverview, AppSettings } from "@/types";

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
  const [period, setPeriod] = useState<string>(now.key);
  const [mode, setMode] = useState<"pay" | "est">("pay");
  const [activeOnly, setActiveOnly] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [extending, setExtending] = useState(false);
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
    if (s.status === "fulfilled") { setStats(s.value); setError(""); setUpdatedAt(hhmm()); }
    else setError((s.reason as Error)?.message || "Сервер не відповідає");
    if (u.status === "fulfilled") { setUsers(u.value); setUsersError(false); } else setUsersError(true);
    setLoading(false);
    setRefreshing(false);
  }, []);
  useEffect(() => { load(); }, [load]);
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

  const view = useMemo(() => {
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
    if (period !== "year") {
      const prev = pay[prevKey(period)]?.amount || 0;
      paidDelta = prev ? Math.round(((paid - prev) / prev) * 1000) / 10 : null;
    }
    const report = months.map((m, i) => {
      const prev = i > 0 ? pay[months[i - 1]]?.amount || 0 : null;
      const cur = pay[m]?.amount || 0;
      const current = m === now.key;
      const delta = current || prev === null || prev === 0 ? null : Math.round(((cur - prev) / prev) * 1000) / 10;
      return { m, name: MONTHS_FULL[monthIdx(m)], paid: cur, est: est[m] || 0, users: reg[m] || 0, delta, current };
    }).reverse();
    // Active users by plan from /admin/users; fallback — all users by plan from /admin/stats.
    const plans = overview ? activePlans(overview) : (stats.planDistribution || []).filter((p) => p.count > 0).map((p) => ({ plan: p.plan, label: p.label, count: p.count }));
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
    return { pay, est, reg, series, max, paid, paidCount, paidDelta, report, plans, planTotal, prevReg, cancels: cancelled + refundCount, refundCount, refundAmount, prevCancelled, ai, aiCalls, total: months.reduce((s, m) => s + (mode === "pay" ? pay[m]?.amount || 0 : est[m] || 0), 0), year };
  }, [stats, overview, mode, period, now.key, now.month, now.year]);

  const firstChip = Math.max(0, now.month - 3);
  const recentChips = Array.from({ length: now.month - firstChip }, (_, i) => ({ key: monthKey(now.year, firstChip + i), label: MONTHS_FULL[firstChip + i] }));
  // A month picked on the chart that is older than the last three also gets a chip.
  const extraChip = period !== "year" && !recentChips.some((c) => c.key === period) ? [{ key: period, label: MONTHS_FULL[monthIdx(period)] }] : [];
  const periodChips = [{ key: "year", label: "Поточний рік" }, ...extraChip, ...recentChips];
  // Mobile list: the whole year so far, newest first.
  const periodOptions = [{ key: "year", label: "Поточний рік" }, ...Array.from({ length: now.month }, (_, i) => ({ key: monthKey(now.year, now.month - 1 - i), label: `${MONTHS_FULL[now.month - 1 - i]} ${now.year}` }))];
  const periodLabel = period === "year" ? `${now.year} рік` : `${MONTHS_FULL[monthIdx(period)]} ${period.slice(0, 4)}`;

  async function extendSelected(ids: number[]) {
    const targets = expiring.filter((e) => ids.includes(e.user.id));
    setExtending(true);
    const done: { id: number; prev: string; name: string }[] = [];
    for (const { user } of targets) {
      try {
        await authService.updateUser(user.id, { endDate: extendedEndDate(user.endDate, EXTEND_DAYS) });
        done.push({ id: user.id, prev: user.endDate, name: user.username });
      } catch { /* reported below */ }
    }
    setExtending(false);
    setConfirmOpen(false);
    await load();
    if (done.length < targets.length) toast.error(`Не вдалося продовжити ${targets.length - done.length} з ${targets.length}`, { description: "Решту продовжено. Спробуйте ще раз для тих, що залишились." });
    if (done.length) {
      toast.success(`Продовжено ${done.length} ${done.length === 1 ? "підписку" : done.length < 5 ? "підписки" : "підписок"} на ${EXTEND_DAYS} днів`, {
        description: done.map((d) => `@${d.name}`).join(", "),
        duration: 10_000, className: "v3-toast-10s",
        action: {
          label: "Скасувати",
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
    downloadCsv(`matchiq-report-${view.year}.csv`, ["Місяць", "Отримані оплати, ₴", "Вартість підписок, ₴", "Нові користувачі", "До попереднього, %"],
      [...view.report].reverse().map((r) => [`${r.name} ${view.year}`, r.paid, r.est, r.users, r.delta ?? ""]));
  }

  const emptyPlatform = !!stats && stats.totalUsers - stats.adminUsers <= 0;
  const header = (
    <section className="v3-hero v3-hero-row">
      <div>
        <h1 className="v3-title">Дашборд</h1>
        <p className="v3-subtitle">
          {emptyPlatform
            ? <><span className="v3-hide-mobile">Тут з’являться оплати, підписки й активність, щойно на платформі будуть перші користувачі.</span><span className="v3-only-mobile">Показники з’являться після перших користувачів і оплат.</span></>
            : <>Оплати, підписки й активність MatchIQ — за обраний період.{updatedAt && <span className="v3-dim"> · Оновлено {updatedAt}</span>}</>}
        </p>
      </div>
      <div className="v3-chips" role="group" aria-label="Період">
        {periodChips.map((c) => <button key={c.key} type="button" className={`v3-chip v3-hide-mobile${period === c.key ? " is-on" : ""}`} aria-pressed={period === c.key} onClick={() => setPeriod(c.key)}>{c.label}</button>)}
        <div className="v3-only-mobile v3-period-wrap"><PeriodMenu value={period} options={periodOptions} onChange={setPeriod} /></div>
        <button type="button" className="v3-chip v3-refresh" onClick={() => load(true)} disabled={refreshing || !online} aria-label="Оновити дані"><RefreshCw size={14} className={refreshing ? "animate-spin" : ""} aria-hidden="true" /><span className="v3-hide-mobile">Оновити</span></button>
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

  const regularUsers = stats.totalUsers - stats.adminUsers;
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
  const recentPaid = (stats.recentPayments || []).filter((p) => p.status === "recorded").slice(0, 3);
  const churned = overview ? churnedUsers(overview) : null;
  const risk = overview ? churnRisk(overview, inactiveDays, lossStreak) : null;
  const retTotal = (stats.retention?.retained || 0) + (stats.retention?.churned || 0);
  const prevMonthIdx = monthIdx(prevKey(now.key));
  const kpis = [
    { icon: Wallet, label: "Отримані оплати", short: "Отримані оплати", value: money(view.paid), note: isEmpty ? "оплат ще не додано" : `${periodLabel} · ${view.paidCount} ${payWord(view.paidCount)}`, delta: view.paidDelta, deltaNote: period !== "year" ? `до ${MONTHS_GEN[monthIdx(prevKey(period))]}` : "", to: "/users", hero: !isEmpty },
    { icon: TrendingUp, label: "Вартість підписок / міс.", short: "Підписки / міс.", value: money(stats.mrr), note: isEmpty ? "немає активних підписок" : "розрахунок за тарифами", to: "/users?role=user&status=active" },
    { icon: Users, label: "Активні користувачі", short: "Активні", value: String(stats.activeUsers), note: isEmpty ? "без адміністраторів" : `з ${regularUsers}`, to: "/users?role=user&status=active" },
    { icon: UserPlus, label: "Нові цього місяця", short: "Нові цього місяця", value: String(stats.newThisMonth), note: isEmpty ? "реєстрацій ще немає" : `${view.prevReg} у ${MONTHS_LOC[prevMonthIdx]}`, to: "/users?role=user&status=all&new=month" },
  ];
  const report = activeOnly ? view.report.filter((r) => r.paid || r.users) : view.report;
  const totals = view.report.reduce((t, r) => ({ paid: t.paid + r.paid, users: t.users + r.users }), { paid: 0, users: 0 });
  const chartEmpty = view.total === 0;
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
  const calmCard = (
    <aside className="v3-dcard v3-calm-card" aria-label="Потребує уваги">
      <span className="v3-calm-ico"><Check size={26} strokeWidth={1.8} aria-hidden="true" /></span>
      <h2>Усе спокійно</h2>
      <p><span className="v3-hide-mobile">Підписок, що закінчуються за 7 днів, і незавершених дій немає.</span><span className="v3-only-mobile">Немає підписок, що закінчуються</span></p>
    </aside>
  );

  return (
    <div className="v3-page v3-dash">
      {header}

      {!online && <div className="v3-stale v3-offline" role="status"><WifiOff size={18} aria-hidden="true" /><span><b>Немає інтернету.</b> Показуємо дані з останнього оновлення{updatedAt ? ` о ${updatedAt}` : ""}. Продовження й зміни запрацюють після відновлення зв’язку, автооновлення призупинено.</span><button type="button" onClick={() => load(true)}>Перевірити ще раз</button></div>}
      {online && error && <div className="v3-stale" role="alert"><AlertTriangle size={18} aria-hidden="true" /><span><b>Не вдалося оновити статистику.</b> Показуємо дані станом на {updatedAt}. Нові оплати з’являться після відновлення.</span><button type="button" onClick={() => load(true)}>Спробувати ще раз</button></div>}

      <div className={`v3-dash-top${isEmpty ? " is-empty" : ""}`}>
      <section className="v3-kpis">
        {kpis.map(({ icon: Icon, label, short, value, note, delta, deltaNote, to, hero }) => (
          <Link key={label} to={to} className={`v3-kpi${hero ? " is-hero" : ""}`}>
            <span className="v3-kpi-l"><span className="v3-kpi-ico"><Icon size={16} aria-hidden="true" /></span><span className="v3-hide-mobile">{label}</span><span className="v3-only-mobile">{short}</span></span>
            <strong className="v3-kpi-v">{value}</strong>
            <span className="v3-kpi-n">{note}{delta != null && <> · <span className={`v3-kpi-delta ${delta >= 0 ? "is-up" : "is-down"}`}>{pct(delta)}</span> {deltaNote}</>}</span>
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
          {conv && <Link to="/users" className="v3-kpi">
            <span className="v3-kpi-l"><span className="v3-kpi-ico"><ArrowRight size={16} aria-hidden="true" /></span>Пробний → платний</span>
            <strong className="v3-kpi-v">{convPct === null ? "—" : <>{convPct}<small className="v3-kpi-unit">%</small></>}</strong>
            <span className="v3-kpi-bar v3-hide-mobile" aria-hidden="true"><span style={{ width: `${convPct || 0}%` }} /></span>
            <span className="v3-kpi-n"><span className="v3-hide-mobile">{c30 && c30.trialEnded ? `${c30.converted} з ${c30.trialEnded} за 30 днів` : "за 30 днів пробних не закінчувалось"} · </span>{conv.trial ? `зараз на пробному ${conv.trial}` : "на пробному нікого"}</span>
          </Link>}
          <Link to="/payments" className="v3-kpi">
            <span className="v3-kpi-l"><span className="v3-kpi-ico"><MinusCircle size={16} aria-hidden="true" /></span>Скасування</span>
            <strong className={`v3-kpi-v${view.cancels ? " is-red" : ""}`}>{view.cancels}</strong>
            <span className="v3-kpi-n">
              <span className="v3-hide-mobile">{periodShort} · {view.refundCount ? `${view.refundCount} з поверненням ${money(view.refundAmount)}` : "без повернень"}{period !== "year" && ` · у ${MONTHS_LOC[monthIdx(prevKey(period))]} ${view.prevCancelled}`}</span>
              <span className="v3-only-mobile">{view.refundAmount ? `повернено ${money(view.refundAmount)}` : "без повернень"}</span>
            </span>
          </Link>
          {stats.aiUsage && <Link to="/settings" className="v3-kpi v3-kpi-wide-sm v3-kpi-ai">
            <span className="v3-kpi-l"><span className="v3-kpi-ico"><Sparkles size={16} aria-hidden="true" /></span>Витрата AI<span className="v3-only-mobile v3-kpi-l-tail">· {periodShort.toLowerCase()}</span></span>
            <strong className="v3-kpi-v">{rate ? <>≈ {Math.round(view.ai * rate).toLocaleString("uk-UA")}<small className="v3-kpi-unit"> ₴</small></> : usd(view.ai)}</strong>
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
            <div className="v3-seg" role="group" aria-label="Показник графіка">
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
                <span className="v3-chart-empty-ico" aria-hidden="true"><Wallet size={24} strokeWidth={1.8} /></span>
                <strong>{mode === "pay" ? "Оплат ще немає" : "Активних підписок ще немає"}</strong>
                <span className="v3-hide-mobile">Додайте першу оплату в картці користувача — графік і звіт заповняться автоматично.</span>
                <span className="v3-only-mobile">Графік заповниться після першої оплати</span>
                <Link to="/users" className="v3-btn v3-btn-primary v3-btn-sm v3-hide-mobile">Додати оплату</Link>
              </div>
            )}
          </div>
          {!isEmpty && (view.planTotal > 0 || recentPaid.length > 0) && (
            <div className="v3-chart-foot">
              {view.planTotal > 0 && (
                <div className="v3-plans">
                  <div className="v3-plans-head"><h3>{overview ? "Активні за тарифами" : "Користувачі за тарифами"}</h3><span>{view.planTotal} {overview ? plural(view.planTotal, "активний", "активні", "активних") : "усього"}</span></div>
                  <div className="v3-plan-bar" aria-hidden="true">{view.plans.map((p) => <span key={p.plan} style={{ flex: p.count, background: p.plan === "trial" ? "repeating-linear-gradient(135deg,#3a4253 0 4px,#232a37 4px 8px)" : PLAN_COLORS[p.plan] || "#7fdcaa" }} />)}</div>
                  <ul className="v3-plan-legend">
                    {view.plans.map((p) => <li key={p.plan}><span className="v3-dot" style={{ background: PLAN_COLORS[p.plan] || "#7fdcaa" }} /><span>{p.label}</span><strong>{p.count}</strong><small>{Math.round((p.count / view.planTotal) * 100)}%</small></li>)}
                  </ul>
                </div>
              )}
              {recentPaid.length > 0 && (
                <div className="v3-paylist v3-hide-mobile">
                  <div className="v3-plans-head"><h3>Останні оплати</h3><Link to="/payments" className="v3-head-link">Усі оплати →</Link></div>
                  <ul>
                    {recentPaid.map((p) => (
                      <li key={p.id}>
                        <UserAvatar username={p.username} telegram={byName.get(p.username)?.telegram} className="v3-av-sm" />
                        <span className="v3-pay-who"><strong>@{p.username}</strong><small>{[p.plan ? PLAN_NAMES[p.plan] : byName.has(p.username) ? planText(byName.get(p.username)).split(" · ")[0] : "", p.promoCode, relDay(p.paidOn)].filter(Boolean).join(" · ")}</small></span>
                        <span className="v3-pay-amt">+{money(p.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {!isEmpty && (!attentionCount && !usersError ? calmCard : <aside className="v3-wcard v3-attention">
          <div className="v3-attn-head"><h2 className="v3-h2">Потребує уваги</h2>{attentionCount > 0 && <span className="v3-tag v3-tag-red">{attentionCount}</span>}</div>
          <p className="v3-note-dark v3-hide-mobile">Збої, звернення, вік і підписки</p>
          {alerts.length > 0 && (
            <ul className="v3-alerts">
              {alerts.map((al) => (
                <li key={al.key}>
                  <Link to={al.to} className="v3-alert-row">
                    <span className={`v3-alert-dot is-${al.dot}`} aria-hidden="true" />
                    <span className="v3-exp-who"><strong>{al.title}</strong><small>{al.sub}</small></span>
                    <span className="v3-alert-cta"><span className="v3-hide-mobile">{al.cta} </span>→</span>
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
                    <Link to={`/users?q=${encodeURIComponent(user.username)}`} className="v3-exp-row">
                      <UserAvatar username={user.username} telegram={byId.get(user.id)?.telegram} />
                      <span className="v3-exp-who"><strong>@{user.username}</strong><small>{planText(byId.get(user.id), user.priceMonth)} · до {shortDate(user.endDate)}</small></span>
                      <span className={`v3-tag ${days <= 2 ? "v3-tag-red" : days <= 4 ? "v3-tag-amber" : "v3-tag-gray"}`}>{daysLabel(days)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              {expiring.length > 3 && <Link to="/users?status=active" className="v3-only-mobile v3-more-link">Усі {expiring.length} користувачі →</Link>}
              <button type="button" className="v3-btn v3-btn-dark v3-btn-block" disabled={!online} title={online ? undefined : "Запрацює після відновлення зв’язку"} onClick={() => setConfirmOpen(true)}>Продовжити всім на +{EXTEND_DAYS} днів…</button>
            </> : null}
        </aside>)}
      </section>
      </div>

      {!isEmpty && (retTotal > 0 || (risk && overview)) && (
        <section className="v3-dash-pair">
          {retTotal > 0 && <RetentionCard retained={stats.retention.retained} churned={stats.retention.churned} byMonth={stats.retention.byMonth} focusMonth={period === "year" || period === now.key ? prevKey(now.key) : period} list={churned} />}
          {risk && <ChurnRiskCard rows={risk} inactiveDays={inactiveDays} lossStreak={lossStreak} thresholdsFromSettings={!!settings?.churnInactiveDays} />}
        </section>
      )}

      {!isEmpty && <section className="v3-wcard">
        <div className="v3-card-head">
          <div><h2 className="v3-h2">Помісячний звіт</h2><p className="v3-note-dark">Оплати, вартість підписок і нові реєстрації</p></div>
          <div className="v3-head-actions v3-hide-mobile">
            <div className="v3-seg v3-seg-light" role="group" aria-label="Місяці у звіті">
              <button type="button" className={!activeOnly ? "is-on" : ""} aria-pressed={!activeOnly} onClick={() => setActiveOnly(false)}>Усі місяці <span>{view.report.length}</span></button>
              <button type="button" className={activeOnly ? "is-on" : ""} aria-pressed={activeOnly} onClick={() => setActiveOnly(true)}>З активністю <span>{view.report.filter((r) => r.paid || r.users).length}</span></button>
            </div>
            <button type="button" className="v3-btn v3-btn-outline" onClick={exportCsv}>Експорт CSV</button>
          </div>
        </div>

        <div className="v3-table-scroll v3-hide-mobile" role="region" aria-label="Помісячний звіт" tabIndex={0}>
          <table className="v3-table">
            <thead><tr><th scope="col">Місяць</th><th scope="col">Отримані оплати</th><th scope="col">Вартість підписок*</th><th scope="col">Нові користувачі</th><th scope="col">До попереднього</th></tr></thead>
            <tbody>
              {report.map((r) => (
                <tr key={r.m}>
                  <th scope="row"><span className="v3-month">{r.name}{r.current && <span className="v3-tag">Поточний</span>}</span></th>
                  <td className="v3-num v3-strong">{money(r.paid)}</td>
                  <td className="v3-num v3-dim2">{money(r.est)}</td>
                  <td className="v3-num">{r.users}</td>
                  <td className={`v3-num v3-strong ${r.delta === null ? "v3-dim2" : r.delta >= 0 ? "v3-up" : "v3-down"}`}>{r.delta === null ? "—" : pct(r.delta)}</td>
                </tr>
              ))}
              {!report.length && <tr><td colSpan={5} className="v3-empty-cell">У {view.year} році ще немає оплат і реєстрацій.</td></tr>}
            </tbody>
            <tfoot><tr><th scope="row">Підсумок · {view.report.length} міс.</th><td className="v3-num">{money(totals.paid)}</td><td className="v3-num v3-dim2">—</td><td className="v3-num">{totals.users}</td><td className="v3-num">—</td></tr></tfoot>
          </table>
        </div>

        <ul className="v3-report-cards v3-only-mobile">
          {view.report.slice(0, 3).map((r) => (
            <li key={r.m}>
              <div><strong>{r.name}{r.current && <span className="v3-tag">Поточний</span>}</strong><small>{r.users} нових{r.delta !== null && <> · <span className={r.delta >= 0 ? "v3-up" : "v3-down"}>{pct(r.delta)}</span></>}</small></div>
              <b>{money(r.paid)}</b>
            </li>
          ))}
        </ul>
        <p className="v3-note-dark v3-foot-note v3-hide-mobile">* Розрахунок за поточними тарифами, не облік оплат.</p>
      </section>}

      {isEmpty && <div className="v3-dcard v3-calm-row v3-only-mobile"><span className="v3-calm-ico" aria-hidden="true"><Check size={18} strokeWidth={2} /></span><div><strong>Усе спокійно</strong><small>Немає підписок, що закінчуються</small></div></div>}
      {isEmpty && <Link to="/users" className="v3-btn v3-btn-primary v3-btn-block v3-only-mobile v3-mobile-cta">Створити першого користувача</Link>}

      <ExtendConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen} items={expiring} days={EXTEND_DAYS} busy={extending} onConfirm={extendSelected} />
    </div>
  );
}
