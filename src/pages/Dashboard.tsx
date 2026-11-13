import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, BadgeCheck, Ban, Check, RefreshCw, Sparkles, TrendingUp, UserPlus, Users, Wallet, WifiOff } from "lucide-react";
import { fetchAdminStats, type AdminStats } from "@/lib/adminStatsApi";
import { authService } from "@/lib/authService";
import { downloadCsv } from "@/lib/csv";
import { daysLabel, expiringUsers, extendedEndDate, money, shortDate } from "@/lib/subscriptions";
import ExtendConfirmDialog from "@/components/ExtendConfirmDialog";
import type { AdminUser } from "@/types";

const MONTHS = ["Січ", "Лют", "Бер", "Кві", "Тра", "Чер", "Лип", "Сер", "Вер", "Жов", "Лис", "Гру"];
const MONTHS_FULL = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
const MONTHS_LOC = ["січні", "лютому", "березні", "квітні", "травні", "червні", "липні", "серпні", "вересні", "жовтні", "листопаді", "грудні"];
const MONTHS_GEN = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
const EXTEND_DAYS = 30;
const REFRESH_MS = 60_000;
const PLAN_COLORS = ["#5b8cff", "#a3c0ff", "#7fdcaa", "#f0a03c"];

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

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    const [s, u] = await Promise.allSettled([fetchAdminStats(), authService.fetchUsers()]);
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
    const plans = [...(stats.planDistribution || [])].filter((p) => p.count > 0).sort((a, b) => b.price - a.price);
    const planTotal = plans.reduce((s, p) => s + p.count, 0);
    const prevReg = reg[prevKey(now.key)] || 0;
    return { series, max, paid, paidCount, paidDelta, report, plans, planTotal, prevReg, total: months.reduce((s, m) => s + (mode === "pay" ? pay[m]?.amount || 0 : est[m] || 0), 0), year };
  }, [stats, mode, period, now.key, now.month, now.year]);

  const firstChip = Math.max(0, now.month - 3);
  const periodChips = [{ key: "year", label: "Поточний рік" }, ...Array.from({ length: now.month - firstChip }, (_, i) => ({ key: monthKey(now.year, firstChip + i), label: MONTHS_FULL[firstChip + i] }))];
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
        duration: 10_000,
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
        <label className="v3-period-select v3-only-mobile"><span>Період</span>
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            {periodChips.map((c) => <option key={c.key} value={c.key}>{c.key === "year" ? "Поточний рік" : `${c.label} ${now.year}`}</option>)}
          </select>
        </label>
        <button type="button" className="v3-chip" onClick={() => load(true)} disabled={refreshing || !online}><RefreshCw size={14} className={refreshing ? "animate-spin" : ""} aria-hidden="true" />Оновити</button>
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
  const paidPlans = (stats.planDistribution || []).filter((p) => p.price > 0).reduce((s, p) => s + p.count, 0);
  const trialPlans = (stats.planDistribution || []).filter((p) => p.price === 0).reduce((s, p) => s + p.count, 0);
  const planCount = paidPlans + trialPlans;
  const conversion = planCount > 0 ? Math.round((paidPlans / planCount) * 100) : 0;
  const hasSecondaryAlerts = (stats.openSupportTickets ?? 0) > 0 || (stats.parserFailures24h ?? 0) > 0 || (stats.selfLimitations ?? 0) > 0 || (stats.unverifiedAge ?? 0) > 0;
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

      <section className="v3-kpis">
        {kpis.map(({ icon: Icon, label, short, value, note, delta, deltaNote, to, hero }) => (
          <Link key={label} to={to} className={`v3-kpi${hero ? " is-hero" : ""}`}>
            <span className="v3-kpi-l"><span className="v3-kpi-ico"><Icon size={16} aria-hidden="true" /></span><span className="v3-hide-mobile">{label}</span><span className="v3-only-mobile">{short}</span></span>
            <strong className="v3-kpi-v">{value}</strong>
            <span className="v3-kpi-n">{note}{delta != null && <> · <span className={`v3-kpi-delta ${delta >= 0 ? "is-up" : "is-down"}`}>{pct(delta)}</span> {deltaNote}</>}</span>
          </Link>
        ))}
      </section>

      {!isEmpty && (
        <section className="v3-kpis v3-kpis-second">
          <div className="v3-kpi">
            <span className="v3-kpi-l"><span className="v3-kpi-ico"><BadgeCheck size={16} aria-hidden="true" /></span><span className="v3-hide-mobile">Пробний → платний</span><span className="v3-only-mobile">Конверсія</span></span>
            <strong className="v3-kpi-v">{conversion}%</strong>
            <span className="v3-kpi-n">{paidPlans} платних · {trialPlans} пробних</span>
          </div>
          <div className="v3-kpi">
            <span className="v3-kpi-l"><span className="v3-kpi-ico"><Ban size={16} aria-hidden="true" /></span><span className="v3-hide-mobile">Скасовані оплати</span><span className="v3-only-mobile">Скасування</span></span>
            <strong className="v3-kpi-v">{stats.cancellations?.total ?? 0}</strong>
            <span className="v3-kpi-n">за весь час</span>
          </div>
          <div className="v3-kpi">
            <span className="v3-kpi-l"><span className="v3-kpi-ico"><Sparkles size={16} aria-hidden="true" /></span><span className="v3-hide-mobile">Витрати AI</span><span className="v3-only-mobile">AI</span></span>
            <strong className="v3-kpi-v">${(stats.aiUsage?.costUsd ?? 0).toFixed(2)}</strong>
            <span className="v3-kpi-n">{(stats.aiUsage?.calls ?? 0)} викликів · {(stats.aiUsage?.tokens ?? 0).toLocaleString("uk-UA")} токенів</span>
          </div>
        </section>
      )}

      {isEmpty && <section className="v3-dash-main">
        <section className="v3-wcard v3-onboard">
          <div>
            <span className="v3-tag">Перші кроки</span>
            <h2><span className="v3-hide-mobile">Налаштуйте платформу за 3 кроки</span><span className="v3-only-mobile">Налаштуйте платформу</span></h2>
            <p className="v3-note-dark"><span className="v3-hide-mobile">Коли з’явиться перший користувач з оплатою, дашборд почне рахувати показники автоматично.</span><span className="v3-only-mobile">Три кроки — і дашборд почне рахувати показники.</span></p>
          </div>
          <ol className="v3-steps">
            <li><span>1</span><div><strong><span className="v3-hide-mobile">Перевірте тариф і тривалість підписки</span><span className="v3-only-mobile">Тариф і тривалість</span></strong><small className="v3-hide-mobile">Ціна за замовчуванням і кількість днів</small></div><Link to="/settings" className="v3-btn v3-btn-ghost v3-btn-sm">Налаштування</Link></li>
            <li><span>2</span><div><strong><span className="v3-hide-mobile">Створіть першого користувача</span><span className="v3-only-mobile">Перший користувач</span></strong><small>Логін, Telegram, тариф</small></div><Link to="/users" className="v3-btn v3-btn-primary v3-btn-sm">Створити</Link></li>
            <li><span>3</span><div><strong><span className="v3-hide-mobile">Додайте банер на екран «Матчі»</span><span className="v3-only-mobile">Банер у «Матчах»</span></strong><small><span className="v3-hide-mobile">2 слоти · мітка «Реклама · 21+»</span><span className="v3-only-mobile">«Матчі» · 2 слоти</span></small></div><Link to="/banners" className="v3-btn v3-btn-ghost v3-btn-sm">Банери</Link></li>
          </ol>
        </section>
        {calmCard}
      </section>}

      <section className="v3-dash-main">
        <div className="v3-dcard v3-chart-card">
          <div className="v3-card-head">
            <div>
              <h2 className="v3-h2">{mode === "pay" ? "Оплати" : "Вартість підписок"} за місяцями</h2>
              <p className="v3-note">{mode === "pay" ? "Ручний облік, без скасованих оплат" : "Оцінка за поточними тарифами, не платежі"} · {view.year}</p>
            </div>
            <div className="v3-seg" role="group" aria-label="Показник графіка">
              <button type="button" className={mode === "pay" ? "is-on" : ""} aria-pressed={mode === "pay"} onClick={() => setMode("pay")}>Оплати</button>
              <button type="button" className={mode === "est" ? "is-on" : ""} aria-pressed={mode === "est"} onClick={() => setMode("est")}><span className="v3-hide-mobile">Вартість підписок</span><span className="v3-only-mobile">Підписки</span></button>
            </div>
          </div>
          <div className="v3-chart-total"><strong>{money(view.total)}</strong><span>за рік</span></div>
          <div className="v3-bars-wrap">
            <div className="v3-bars" role="img" aria-label={`Графік: ${view.series.filter((s) => !s.future).map((s) => `${MONTHS[monthIdx(s.m)]} ${money(s.v)}`).join(", ")}`}>
              {view.series.map((s, i) => {
                const on = period === s.m || (period === "year" && s.m === now.key);
                const hideMobile = i < now.month - 6 || s.future;
                return (
                  <div key={s.m} className={`v3-bar-col${hideMobile ? " v3-hide-mobile" : ""}`}>
                    <span className={`v3-bar-val${on ? " is-on" : ""}`}>{s.future ? "" : s.v ? shortK(s.v) : "—"}</span>
                    <div className={`v3-bar${on ? " is-on" : ""}${s.future ? " is-future" : ""}`} style={{ height: s.future ? "6%" : `${Math.max(4, Math.round((s.v / view.max) * 86))}%` }} />
                    <span className="v3-bar-m">{MONTHS[monthIdx(s.m)]}</span>
                  </div>
                );
              })}
            </div>
            {chartEmpty && (
              <div className="v3-chart-empty">
                <strong>{mode === "pay" ? "Оплат ще немає" : "Активних підписок ще немає"}</strong>
                <span className="v3-hide-mobile">Додайте першу оплату в картці користувача — графік і звіт заповняться автоматично.</span>
                <span className="v3-only-mobile">Графік заповниться після першої оплати</span>
                <Link to="/users" className="v3-btn v3-btn-primary v3-btn-sm v3-hide-mobile">Додати оплату</Link>
              </div>
            )}
          </div>
          {view.planTotal > 0 && (
            <div className="v3-plans">
              <div className="v3-plans-head"><h3>Активні за тарифами</h3><span>{view.planTotal} активні</span></div>
              <div className="v3-plan-bar" aria-hidden="true">{view.plans.map((p, i) => <span key={p.plan} style={{ flex: p.count, background: p.plan === "trial" ? "repeating-linear-gradient(135deg,#3a4253 0 4px,#232a37 4px 8px)" : PLAN_COLORS[i % PLAN_COLORS.length] }} />)}</div>
              <ul className="v3-plan-legend">
                {view.plans.map((p, i) => <li key={p.plan}><span className="v3-dot" style={{ background: p.plan === "trial" ? "#3a4253" : PLAN_COLORS[i % PLAN_COLORS.length] }} /><span>{p.label || "Без оплати"}</span><strong>{p.count}</strong><small>{Math.round((p.count / view.planTotal) * 100)}%</small></li>)}
              </ul>
            </div>
          )}

          {stats.recentPayments?.length > 0 && (
            <div className="v3-paylist">
              <div className="v3-plans-head"><h3>Останні оплати</h3></div>
              <ul>
                {stats.recentPayments.map((p) => (
                  <li key={p.id}>
                    <span className="v3-pay-who"><strong>@{p.username}</strong><small>{shortDate(p.paidOn)}</small></span>
                    <span className="v3-pay-amt">{money(p.amount)}</span>
                    {p.status === "cancelled" && <span className="v3-tag v3-tag-red">Скасовано</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="v3-retention">
            <div className="v3-plans-head"><h3>Утримання</h3></div>
            <div className="v3-ret-grid">
              <div><strong>{stats.retention?.retained ?? 0}</strong><span>продовжили підписку</span></div>
              <div><strong>{stats.retention?.churned ?? 0}</strong><span>не продовжили</span></div>
            </div>
          </div>
        </div>

        {!isEmpty && (!expiring.length && !usersError && !hasSecondaryAlerts ? calmCard : <aside className="v3-wcard v3-attention">
          <div className="v3-attn-head"><h2 className="v3-h2">Потребує уваги</h2>{!!expiring.length && <span className="v3-tag v3-tag-red">{expiring.length}</span>}</div>
          {usersError ? <p className="v3-note-dark">Не вдалося завантажити користувачів. <button type="button" className="v3-link-btn" onClick={() => load(true)}>Повторити</button></p>
            : expiring.length ? <>
              <p className="v3-note-dark">Підписки, що закінчуються за 7 днів</p>
              <ul className="v3-exp-list">
                {expiring.map(({ user, days }, i) => (
                  <li key={user.id} className={i >= 3 ? "v3-hide-mobile" : undefined}>
                    <Link to={`/users?q=${encodeURIComponent(user.username)}`} className="v3-exp-row">
                      <span className="v3-av" aria-hidden="true">{user.username.slice(0, 2).toUpperCase()}</span>
                      <span className="v3-exp-who"><strong>@{user.username}</strong><small>{Number(user.priceMonth) ? `${user.priceMonth} ₴` : "Без оплати"} · до {shortDate(user.endDate)}</small></span>
                      <span className={`v3-tag ${days <= 2 ? "v3-tag-red" : days <= 4 ? "v3-tag-amber" : "v3-tag-gray"}`}>{daysLabel(days)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              {expiring.length > 3 && <Link to="/users?status=active" className="v3-only-mobile v3-more-link">Усі {expiring.length} користувачі →</Link>}
              <button type="button" className="v3-btn v3-btn-dark v3-btn-block" disabled={!online} title={online ? undefined : "Запрацює після відновлення зв’язку"} onClick={() => setConfirmOpen(true)}>Продовжити всім на +{EXTEND_DAYS} днів…</button>
            </> : null}
          {hasSecondaryAlerts && (
            <div className="v3-attn-more">
              <p className="v3-note-dark">Інші сповіщення</p>
              <ul className="v3-alert-list">
                {(stats.openSupportTickets ?? 0) > 0 && <li><span className="v3-tag v3-tag-amber">Звернення</span><span>{stats.openSupportTickets} відкритих</span></li>}
                {(stats.parserFailures24h ?? 0) > 0 && <li><span className="v3-tag v3-tag-red">Парсери</span><span>{stats.parserFailures24h} збоїв за 24 год</span></li>}
                {(stats.selfLimitations ?? 0) > 0 && <li><span className="v3-tag v3-tag-gray">Самообмеження</span><span>{stats.selfLimitations} активних</span></li>}
                {(stats.unverifiedAge ?? 0) > 0 && <li><span className="v3-tag v3-tag-amber">Вік</span><span>{stats.unverifiedAge} без підтвердження</span></li>}
              </ul>
            </div>
          )}
        </aside>)}
      </section>

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

      {isEmpty && <Link to="/users" className="v3-btn v3-btn-primary v3-btn-block v3-only-mobile v3-mobile-cta">Створити першого користувача</Link>}

      <ExtendConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen} items={expiring} days={EXTEND_DAYS} busy={extending} onConfirm={extendSelected} />
    </div>
  );
}
