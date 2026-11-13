import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, CircleCheck, RefreshCw, TrendingUp, UserPlus, Users, Wallet } from "lucide-react";
import { fetchAdminStats, type AdminStats } from "@/lib/adminStatsApi";
import { authService } from "@/lib/authService";
import { downloadCsv } from "@/lib/csv";
import { daysLabel, expiringUsers, extendedEndDate, money, shortDate } from "@/lib/subscriptions";
import ExtendConfirmDialog from "@/components/ExtendConfirmDialog";
import type { AdminUser } from "@/types";

const MONTHS = ["Січ", "Лют", "Бер", "Кві", "Тра", "Чер", "Лип", "Сер", "Вер", "Жов", "Лис", "Гру"];
const MONTHS_FULL = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
const EXTEND_DAYS = 30;
const PLAN_COLORS = ["#5b8cff", "#a3c0ff", "#3a4253", "#7fdcaa", "#f0a03c"];

const monthIdx = (m: string) => Number(m.slice(5, 7)) - 1;
const shortK = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1).replace(".", ",")}k` : String(Math.round(v)));

function kyivNow() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Kyiv", year: "numeric", month: "numeric" }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  return { year, month, key: `${year}-${String(month).padStart(2, "0")}` };
}

export default function Dashboard() {
  const now = kyivNow();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersError, setUsersError] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");
  const [period, setPeriod] = useState<string>(now.key); // "year" or YYYY-MM
  const [mode, setMode] = useState<"pay" | "est">("pay");
  const [activeOnly, setActiveOnly] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [extending, setExtending] = useState(false);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    const [s, u] = await Promise.allSettled([fetchAdminStats(), authService.fetchUsers()]);
    if (s.status === "fulfilled") { setStats(s.value); setError(""); } else setError((s.reason as Error)?.message || "Помилка завантаження");
    if (u.status === "fulfilled") { setUsers(u.value); setUsersError(false); } else setUsersError(true);
    setUpdatedAt(new Date().toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }));
    setLoading(false);
    setRefreshing(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const expiring = useMemo(() => expiringUsers(users, 7), [users]);

  const view = useMemo(() => {
    if (!stats) return null;
    const pay = Object.fromEntries((stats.paymentsByMonth || []).map((r) => [r.month, r]));
    const est = Object.fromEntries(stats.revenueByMonth.map((r) => [r.month, r.revenue]));
    const reg = Object.fromEntries(stats.registrationsByMonth.map((r) => [r.month, r.count]));
    const year = now.year;
    const months = Array.from({ length: now.month }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
    const series = months.map((m) => ({ m, v: mode === "pay" ? pay[m]?.amount || 0 : est[m] || 0 }));
    const max = Math.max(1, ...series.map((s) => s.v));
    const selected = period === "year" ? months : [period];
    const paid = selected.reduce((s, m) => s + (pay[m]?.amount || 0), 0);
    const paidCount = selected.reduce((s, m) => s + (pay[m]?.count || 0), 0);
    const report = months.map((m, i) => {
      const prev = i > 0 ? pay[months[i - 1]]?.amount || 0 : null;
      const cur = pay[m]?.amount || 0;
      const delta = prev === null || prev === 0 ? null : Math.round(((cur - prev) / prev) * 1000) / 10;
      return { m, name: MONTHS_FULL[monthIdx(m)], paid: cur, est: est[m] || 0, users: reg[m] || 0, delta, current: m === now.key };
    }).reverse();
    const plans = [...(stats.planDistribution || [])].sort((a, b) => b.price - a.price);
    const planTotal = plans.reduce((s, p) => s + p.count, 0);
    const paidUsers = plans.filter((p) => p.price > 0).reduce((s, p) => s + p.count, 0);
    return { series, max, paid, paidCount, report, plans, planTotal, paidUsers, total: series.reduce((s, x) => s + x.v, 0), year };
  }, [stats, mode, period, now.key, now.month, now.year]);

  const firstChip = Math.max(0, now.month - 3);
  const periodChips = [{ key: "year", label: "Поточний рік" }, ...Array.from({ length: now.month - firstChip }, (_, i) => {
    const mi = firstChip + i;
    return { key: `${now.year}-${String(mi + 1).padStart(2, "0")}`, label: MONTHS_FULL[mi] };
  })];
  const periodLabel = period === "year" ? `${now.year} рік` : `${MONTHS_FULL[monthIdx(period)]} ${period.slice(0, 4)}`;

  async function extendSelected(ids: number[]) {
    const targets = expiring.filter((e) => ids.includes(e.user.id));
    setExtending(true);
    const done: { id: number; prev: string }[] = [];
    for (const { user } of targets) {
      try {
        await authService.updateUser(user.id, { endDate: extendedEndDate(user.endDate, EXTEND_DAYS) });
        done.push({ id: user.id, prev: user.endDate });
      } catch { /* reported below */ }
    }
    setExtending(false);
    setConfirmOpen(false);
    await load();
    if (done.length < targets.length) toast.error(`Не вдалося продовжити ${targets.length - done.length} з ${targets.length}`, { description: "Решту продовжено. Спробуйте ще раз для тих, що залишились." });
    if (done.length) {
      toast.success(`Продовжено ${done.length} ${done.length === 1 ? "підписку" : done.length < 5 ? "підписки" : "підписок"} на ${EXTEND_DAYS} днів`, {
        description: targets.filter((t) => done.some((d) => d.id === t.user.id)).map((t) => `@${t.user.username}`).join(", "),
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

  if (loading) return <div className="v3-page"><p className="v3-loading" role="status">Завантаження аналітики…</p></div>;
  if (!stats || !view) {
    return (
      <div className="v3-page">
        <section className="v3-hero"><h1 className="v3-title">Дашборд</h1></section>
        <div className="v3-wcard v3-error" role="alert"><AlertTriangle size={22} /><div><strong>Не вдалося завантажити статистику</strong><p>{error}</p></div><button type="button" className="v3-btn v3-btn-dark" onClick={() => load(true)} disabled={refreshing}>Спробувати знову</button></div>
      </div>
    );
  }

  const kpis = [
    { icon: Wallet, label: "Отримані оплати", value: money(view.paid), note: `${periodLabel} · ${view.paidCount} оплат`, to: "/users", hero: true },
    { icon: TrendingUp, label: "Вартість підписок", value: money(stats.mrr), note: "розрахунок · активні сьогодні", to: "/users?role=user&status=active" },
    { icon: Users, label: "Активні користувачі", value: String(stats.activeUsers), note: `з ${stats.totalUsers} · без адміністраторів`, to: "/users?role=user&status=active" },
    { icon: UserPlus, label: "Нові цього місяця", value: String(stats.newThisMonth), note: "нові облікові записи", to: "/users?role=user&status=all&new=month" },
  ];
  const report = activeOnly ? view.report.filter((r) => r.paid || r.users) : view.report;
  const totals = view.report.reduce((t, r) => ({ paid: t.paid + r.paid, users: t.users + r.users }), { paid: 0, users: 0 });

  return (
    <div className="v3-page v3-dash">
      <section className="v3-hero v3-hero-row">
        <div>
          <h1 className="v3-title">Дашборд</h1>
          <p className="v3-subtitle">Оплати, підписки й активність MatchIQ — за обраний період.{updatedAt && <span className="v3-dim"> · Оновлено {updatedAt}</span>}</p>
        </div>
        <div className="v3-chips" role="group" aria-label="Період">
          {periodChips.map((c) => <button key={c.key} type="button" className={`v3-chip${period === c.key ? " is-on" : ""}`} aria-pressed={period === c.key} onClick={() => setPeriod(c.key)}>{c.label}</button>)}
          <button type="button" className="v3-chip" onClick={() => load(true)} disabled={refreshing}><RefreshCw size={14} className={refreshing ? "animate-spin" : ""} aria-hidden="true" />Оновити</button>
        </div>
      </section>

      {error && <div className="v3-stale" role="alert"><AlertTriangle size={18} aria-hidden="true" /><span>Не вдалося оновити статистику — показано дані на {updatedAt}. {error}</span><button type="button" onClick={() => load(true)}>Повторити</button></div>}

      <section className="v3-kpis">
        {kpis.map(({ icon: Icon, label, value, note, to, hero }) => (
          <Link key={label} to={to} className={`v3-kpi${hero ? " is-hero" : ""}`}>
            <span className="v3-kpi-l"><span className="v3-kpi-ico"><Icon size={16} aria-hidden="true" /></span>{label}</span>
            <strong className="v3-kpi-v">{value}</strong>
            <span className="v3-kpi-n">{note}</span>
          </Link>
        ))}
      </section>

      <section className="v3-dash-main">
        <div className="v3-dcard v3-chart-card">
          <div className="v3-card-head">
            <div>
              <h2 className="v3-h2">{mode === "pay" ? "Оплати" : "Вартість підписок"} за місяцями</h2>
              <p className="v3-note">{mode === "pay" ? "Ручний облік, без скасованих оплат" : "Оцінка за поточними тарифами, не платежі"}</p>
            </div>
            <div className="v3-seg" role="group" aria-label="Показник графіка">
              <button type="button" className={mode === "pay" ? "is-on" : ""} aria-pressed={mode === "pay"} onClick={() => setMode("pay")}>Оплати</button>
              <button type="button" className={mode === "est" ? "is-on" : ""} aria-pressed={mode === "est"} onClick={() => setMode("est")}>Вартість підписок</button>
            </div>
          </div>
          <div className="v3-chart-total"><strong>{money(view.total)}</strong><span>за {view.year} рік</span></div>
          <div className="v3-bars" role="img" aria-label={`Графік: ${view.series.map((s) => `${MONTHS[monthIdx(s.m)]} ${money(s.v)}`).join(", ")}`}>
            {view.series.map((s) => {
              const on = period === s.m || (period === "year" && s.m === now.key);
              return (
                <div key={s.m} className="v3-bar-col">
                  <span className={`v3-bar-val${on ? " is-on" : ""}`}>{s.v ? shortK(s.v) : "—"}</span>
                  <div className={`v3-bar${on ? " is-on" : ""}`} style={{ height: `${Math.max(4, Math.round((s.v / view.max) * 86))}%` }} />
                  <span className="v3-bar-m">{MONTHS[monthIdx(s.m)]}</span>
                </div>
              );
            })}
          </div>
          <div className="v3-plans">
            <div className="v3-plans-head"><h3>Користувачі за тарифами</h3><span>{view.planTotal} на тарифах · {view.paidUsers} платних</span></div>
            {view.planTotal ? <>
              <div className="v3-plan-bar" aria-hidden="true">{view.plans.map((p, i) => <span key={p.price} style={{ flex: p.count, background: p.price === 0 ? "repeating-linear-gradient(135deg,#3a4253 0 4px,#232a37 4px 8px)" : PLAN_COLORS[i % PLAN_COLORS.length] }} />)}</div>
              <ul className="v3-plan-legend">
                {view.plans.map((p, i) => <li key={p.price}><span className="v3-dot" style={{ background: p.price === 0 ? "#3a4253" : PLAN_COLORS[i % PLAN_COLORS.length] }} /><span>{p.price ? `${p.price} ₴ / 30 днів` : "Без оплати"}</span><strong>{p.count}</strong><small>{Math.round((p.count / view.planTotal) * 100)}%</small></li>)}
              </ul>
            </> : <p className="v3-note">Розподіл з’явиться, коли будуть користувачі на тарифах.</p>}
          </div>
        </div>

        <aside className="v3-wcard v3-attention">
          <div className="v3-attn-head"><h2 className="v3-h2">Потребує уваги</h2>{!!expiring.length && <span className="v3-tag v3-tag-red">{expiring.length}</span>}</div>
          <p className="v3-note-dark">Підписки, що закінчуються за 7 днів</p>
          {usersError ? <p className="v3-note-dark">Не вдалося завантажити користувачів. <button type="button" className="v3-link-btn" onClick={() => load(true)}>Повторити</button></p>
            : expiring.length ? <>
              <ul className="v3-exp-list">
                {expiring.map(({ user, days }) => (
                  <li key={user.id}>
                    <Link to={`/users?q=${encodeURIComponent(user.username)}`} className="v3-exp-row">
                      <span className="v3-av" aria-hidden="true">{user.username.slice(0, 2).toUpperCase()}</span>
                      <span className="v3-exp-who"><strong>@{user.username}</strong><small>{Number(user.priceMonth) ? `${user.priceMonth} ₴` : "Без оплати"} · до {shortDate(user.endDate)}</small></span>
                      <span className={`v3-tag ${days <= 2 ? "v3-tag-red" : days <= 4 ? "v3-tag-amber" : "v3-tag-gray"}`}>{daysLabel(days)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <button type="button" className="v3-btn v3-btn-dark v3-btn-block" onClick={() => setConfirmOpen(true)}>Продовжити всім на +{EXTEND_DAYS} днів…</button>
            </> : <div className="v3-calm"><CircleCheck size={22} aria-hidden="true" /><span>Усе спокійно — за 7 днів жодна підписка не закінчується.</span></div>}
        </aside>
      </section>

      <section className="v3-wcard">
        <div className="v3-card-head">
          <div><h2 className="v3-h2">Помісячний звіт</h2><p className="v3-note-dark">Оплати, вартість підписок і нові реєстрації · {view.year}</p></div>
          <div className="v3-head-actions">
            <div className="v3-seg v3-seg-light" role="group" aria-label="Місяці у звіті">
              <button type="button" className={!activeOnly ? "is-on" : ""} aria-pressed={!activeOnly} onClick={() => setActiveOnly(false)}>Усі місяці <span>{view.report.length}</span></button>
              <button type="button" className={activeOnly ? "is-on" : ""} aria-pressed={activeOnly} onClick={() => setActiveOnly(true)}>З активністю <span>{view.report.filter((r) => r.paid || r.users).length}</span></button>
            </div>
            <button type="button" className="v3-btn v3-btn-outline" onClick={exportCsv}>Експорт CSV</button>
          </div>
        </div>
        <div className="v3-table-scroll" role="region" aria-label="Помісячний звіт" tabIndex={0}>
          <table className="v3-table">
            <thead><tr><th scope="col">Місяць</th><th scope="col">Отримані оплати</th><th scope="col" className="v3-hide-sm">Вартість підписок*</th><th scope="col">Нові</th><th scope="col" className="v3-hide-sm">До попереднього</th></tr></thead>
            <tbody>
              {report.map((r) => (
                <tr key={r.m}>
                  <th scope="row"><span className="v3-month">{r.name}{r.current && <span className="v3-tag">Поточний</span>}</span></th>
                  <td className="v3-num v3-strong">{money(r.paid)}</td>
                  <td className="v3-num v3-dim2 v3-hide-sm">{money(r.est)}</td>
                  <td className="v3-num">{r.users}</td>
                  <td className={`v3-num v3-strong v3-hide-sm ${r.delta === null ? "" : r.delta >= 0 ? "v3-up" : "v3-down"}`}>{r.delta === null ? "—" : `${r.delta > 0 ? "+" : r.delta < 0 ? "−" : ""}${Math.abs(r.delta).toLocaleString("uk-UA")}%`}{r.current && r.delta !== null && <small className="v3-dim2"> неповний</small>}</td>
                </tr>
              ))}
              {!report.length && <tr><td colSpan={5} className="v3-empty-cell">У {view.year} році ще немає оплат і реєстрацій.</td></tr>}
            </tbody>
            <tfoot><tr><th scope="row">Підсумок · {view.report.length} міс.</th><td className="v3-num">{money(totals.paid)}</td><td className="v3-num v3-dim2 v3-hide-sm">—</td><td className="v3-num">{totals.users}</td><td className="v3-num v3-hide-sm">—</td></tr></tfoot>
          </table>
        </div>
        <p className="v3-note-dark v3-foot-note">* Розрахунок за поточними тарифами, не облік оплат.</p>
      </section>

      <ExtendConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen} items={expiring} days={EXTEND_DAYS} busy={extending} onConfirm={extendSelected} />
    </div>
  );
}
