import { useEffect, useState } from "react";
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart, Line,
} from "recharts";
import {
  Users, Wallet, TrendingUp, UserPlus, UserX, Shield, Clock, Zap,
  Loader2, AlertTriangle, MoveUpRight, Filter, CheckCircle, Crown,
} from "lucide-react";
import { fetchAdminStats, type AdminStats } from "@/lib/adminStatsApi";
import { getDaysUntilExpiry } from "@/lib/adminUtils";

const UA_MONTHS = ["Січ", "Лют", "Бер", "Кві", "Тра", "Чер", "Лип", "Сер", "Вер", "Жов", "Лис", "Гру"];

function formatMonthName(m: string) {
  const [y, mo] = m.split("-");
  return UA_MONTHS[parseInt(mo, 10) - 1] ?? mo;
}

export default function Dashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [monthFilter, setMonthFilter] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchAdminStats();
        setStats(data);
      } catch (e) {
        setError((e as Error).message || "Помилка завантаження");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Set default filter to current month after stats load
  useEffect(() => {
    if (!stats || monthFilter) return;
    const now = new Date();
    const curr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const all = [...new Set([
      ...stats.revenueByMonth.map(r => r.month),
      ...stats.registrationsByMonth.map(r => r.month),
    ])];
    setMonthFilter(all.includes(curr) ? curr : "all");
  }, [stats, monthFilter]);

  // Close filter dropdown on outside click
  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('[data-filter-dropdown]')) setFilterOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [filterOpen]);

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="text-center text-muted">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-danger" />
          <p>{error || "Немає даних"}</p>
        </div>
      </div>
    );
  }

  // Filter chart data by selected month
  const allMonths = [...new Set([
    ...stats.revenueByMonth.map(r => r.month),
    ...stats.registrationsByMonth.map(r => r.month),
  ])].sort();

  // Build lookup maps for month-based data
  const regByMonth = Object.fromEntries(stats.registrationsByMonth.map(r => [r.month, r.count]));
  const revByMonth = Object.fromEntries(stats.revenueByMonth.map(r => [r.month, r.revenue]));

  // Month filter pills
  const monthOptions = [
    { key: "all", label: "Всі", reg: stats.registrationsByMonth.reduce((s, r) => s + r.count, 0), rev: stats.totalRevenue },
    ...allMonths.map(m => ({ key: m, label: formatMonthName(m), year: m.split("-")[0]?.slice(2), reg: regByMonth[m] || 0, rev: revByMonth[m] || 0 })),
  ];

  const monthFilter_ = monthFilter || "all";

  const filteredRev = monthFilter_ === "all"
    ? stats.revenueByMonth
    : stats.revenueByMonth.filter(r => r.month <= monthFilter_);
  const filteredReg = monthFilter_ === "all"
    ? stats.registrationsByMonth
    : stats.registrationsByMonth.filter(r => r.month <= monthFilter_);

  let revCum = 0;
  const revChartData = filteredRev.map((r) => ({ ...r, label: formatMonthName(r.month), cumulative: (revCum += r.revenue) }));
  const revTotal = filteredRev.reduce((s, r) => s + r.revenue, 0);
  const revBest = filteredRev.length > 0 ? [...filteredRev].sort((a, b) => b.revenue - a.revenue)[0] : null;
  const regTotal = filteredReg.reduce((sum, r) => sum + r.count, 0);
  const regBest = filteredReg.length > 0 ? [...filteredReg].sort((a, b) => b.count - a.count)[0] : null;
  // Fill all months in range, even those with 0 registrations
  const regByMonthLookup: Record<string, number> = Object.fromEntries(filteredReg.map(r => [r.month, r.count]));
  let cum = 0;
  const regChartData = allMonths.map((m) => {
    const count = regByMonthLookup[m] || 0;
    return { month: m, label: formatMonthName(m), count, cumulative: (cum += count) };
  });

  // Filtered KPI values
  const isAll = monthFilter_ === "all";
  const kpiMrr = isAll ? stats.mrr : (revByMonth[monthFilter_] || 0);
  const kpiNewMonth = isAll ? stats.newThisMonth : (regByMonth[monthFilter_] || 0);

  const currLabel = monthFilter_ === "all"
    ? "Всі"
    : `${formatMonthName(monthFilter_)}'${monthFilter_.split("-")[0]?.slice(2)}`;

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-8 py-8 space-y-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-ink">Дашборд</h1>
            <p className="text-sm text-muted mt-1">Огляд ключових показників платформи</p>
          </div>
          <div className="relative" data-filter-dropdown>
            <button
              onClick={() => setFilterOpen(!filterOpen)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-hairline bg-white text-sm text-body hover:border-primary/60 hover:text-ink transition-colors"
            >
              <Filter className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span className="font-medium">{currLabel}</span>
            </button>

            {filterOpen && (
              <div className="absolute right-0 top-full mt-2 z-50 bg-white border border-hairline rounded-2xl shadow-lg p-2 w-56 max-h-[340px] overflow-y-auto">
                {monthOptions.map((mo) => {
                  const isActive = monthFilter_ === mo.key;
                  return (
                    <button
                      key={mo.key}
                      onClick={() => { setMonthFilter(mo.key); setFilterOpen(false); }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-colors mb-1 last:mb-0 ${
                        isActive
                          ? "bg-primary text-white"
                          : "hover:bg-surface-subtle text-body"
                      }`}
                    >
                      <span className="font-medium">
                        {mo.key === "all" ? "Всі місяці" : `${mo.label}'${mo.year}`}
                      </span>
                      <span className="flex items-center gap-2 text-xs opacity-70 ml-2 shrink-0">
                        <span className="flex items-center gap-0.5">
                          <MoveUpRight className="h-2.5 w-2.5" strokeWidth={2.5} />
                          {mo.reg}
                        </span>
                        {mo.rev > 0 && <span>· ₴{mo.rev}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {[
            { icon: Wallet,   label: isAll ? "MRR" : "Дохід за міс",  value: `₴${kpiMrr.toLocaleString("uk-UA")}`,                    sub: isAll ? "щомісячний дохід" : "обраний місяць", color: "text-success", bg: "!bg-success-bg" },
            { icon: Users,     label: "Активні",     value: stats.activeUsers,                                                        sub: `з ${stats.totalUsers}`,                       color: "text-primary", bg: "!bg-surface-hover" },
            { icon: UserPlus,  label: isAll ? "Нових за міс" : "Нові за міс", value: kpiNewMonth,                                     sub: isAll ? "цей місяць" : currLabel,              color: "text-success", bg: "!bg-success-bg" },
            { icon: Shield,    label: "Адмінів",      value: stats.adminUsers,                                                        sub: "в системі",                                    color: "text-warning", bg: "!bg-warning-bg" },
            { icon: UserX,     label: "Неактивні",    value: stats.inactiveUsers,                                                     sub: "прострочені",                                  color: "text-danger",  bg: "!bg-danger-bg" },
          ].map(({ icon: Icon, label, value, sub, color, bg }) => (
            <div key={label} className="card-admin p-5 flex flex-col gap-2">
              <div className={`w-9 h-9 rounded-btn ${bg} flex items-center justify-center`}>
                <Icon className={`h-[18px] w-[18px] ${color}`} strokeWidth={1.5} />
              </div>
              <p className="text-xs text-muted">{label}</p>
              <p className="text-xl font-bold text-ink tracking-tight">{value}</p>
              {sub && <p className="text-xs text-subtle">{sub}</p>}
            </div>
          ))}
        </div>

        {/* ── Charts: Revenue by month + Registrations ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card-admin p-6">
            <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
              <h3 className="text-lg font-semibold text-ink">Дохід по місяцях</h3>
              <div className="flex items-center gap-2">
                {revBest && (
                  <div className="flex items-center gap-1 px-2.5 py-1 bg-success-bg rounded-full">
                    <TrendingUp className="h-3 w-3 text-success" strokeWidth={2.5} />
                    <span className="text-xs font-bold text-success">₴{revBest.revenue.toLocaleString("uk-UA")}</span>
                    <span className="text-[10px] text-muted">{formatMonthName(revBest.month)}</span>
                  </div>
                )}
                <div className="flex items-center gap-1 px-2.5 py-1 bg-surface-hover rounded-full">
                  <span className="text-xs font-bold text-ink">₴{revTotal.toLocaleString("uk-UA")}</span>
                  <span className="text-[10px] text-muted">всього</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 mb-4">
              <p className="text-xs text-muted">
                {monthFilter_ === "all" ? "За весь період" : `Дані до ${formatMonthName(monthFilter_)}'${monthFilter_.split("-")[0]?.slice(2)}`}
              </p>
              <span className="text-subtle text-[10px]">·</span>
              <p className="text-xs text-muted">
                Стовпці — місяць, лінія — накопичено
              </p>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={revChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e6e5" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}₴`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#a8a29e" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}₴`} />
                <Tooltip
                  contentStyle={{ borderRadius: "12px", border: "1px solid #e8e6e5", boxShadow: "0 4px 16px rgba(0,0,0,0.06)", fontSize: "12px" }}
                  formatter={(value: any, name: string) => [`₴${Number(value).toLocaleString("uk-UA")}`, name === "cumulative" ? "Накопичено" : "За місяць"]}
                />
                <Bar yAxisId="left" dataKey="revenue" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={40} name="revenue" />
                <Line yAxisId="right" type="monotone" dataKey="cumulative" stroke="#0c0a09" strokeWidth={2} dot={{ r: 3, fill: "#0c0a09" }} name="cumulative" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="card-admin p-6">
            <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
              <h3 className="text-lg font-semibold text-ink">Нові реєстрації</h3>
              <div className="flex items-center gap-2">
                {regBest && (
                  <div className="flex items-center gap-1 px-2.5 py-1 bg-primary/10 rounded-full">
                    <MoveUpRight className="h-3 w-3 text-primary" strokeWidth={2.5} />
                    <span className="text-xs font-bold text-primary">{regBest.count}</span>
                    <span className="text-[10px] text-muted">{formatMonthName(regBest.month)}</span>
                  </div>
                )}
                <div className="flex items-center gap-1 px-2.5 py-1 bg-surface-hover rounded-full">
                  <span className="text-xs font-bold text-ink">{regTotal}</span>
                  <span className="text-[10px] text-muted">{isAll ? "всього" : "накопичено"}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 mb-4">
              <p className="text-xs text-muted">
                {monthFilter_ === "all" ? "За весь період" : `Дані до ${formatMonthName(monthFilter_)}'${monthFilter_.split("-")[0]?.slice(2)}`}
              </p>
              <span className="text-subtle text-[10px]">·</span>
              <p className="text-xs text-muted">Стовпці — місяць, лінія — накопичено</p>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={regChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e6e5" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#a8a29e" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: "12px", border: "1px solid #e8e6e5", boxShadow: "0 4px 16px rgba(0,0,0,0.06)", fontSize: "12px" }}
                  formatter={(value: any, name: string) => [value, name === "cumulative" ? "Накопичено" : "Нових за місяць"]}
                />
                <Bar yAxisId="left" dataKey="count" fill="#3ba6f1" radius={[4, 4, 0, 0]} maxBarSize={40} name="count" />
                <Line yAxisId="right" type="monotone" dataKey="cumulative" stroke="#0c0a09" strokeWidth={2} dot={{ r: 3, fill: "#0c0a09" }} name="cumulative" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Top users + Expiring subscriptions ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top users */}
          <div className="card-admin p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-ink">Топ платники</h3>
                <p className="text-xs text-muted mt-0.5">За загальним доходом</p>
              </div>
              {stats.topUsers.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 px-2.5 py-1 bg-surface-hover rounded-full">
                    <span className="text-xs font-bold text-ink">₴{stats.topUsers.reduce((s, u) => s + u.revenue, 0).toLocaleString("uk-UA")}</span>
                    <span className="text-[10px] text-muted">разом</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-warning/10 rounded-full">
                    <Crown className="h-3 w-3 text-warning" strokeWidth={2} />
                    <span className="text-xs text-muted">топ-{stats.topUsers.length}</span>
                  </div>
                </div>
              )}
            </div>
            {stats.topUsers.length === 0 ? (
              <p className="text-sm text-muted py-8 text-center">Немає даних</p>
            ) : (
              (() => {
                const topTotal = stats.topUsers.reduce((s, u) => s + u.revenue, 0);
                return (
                  <div className="space-y-2">
                    {stats.topUsers.map((u, i) => {
                      const pct = topTotal > 0 ? Math.round((u.revenue / topTotal) * 100) : 0;
                      const days = getDaysUntilExpiry(u.endDate);
                      const isActive = days >= 0;
                      return (
                        <div key={i} className={`p-3 rounded-xl bg-surface-subtle border-2 ${isActive ? "border-success/30" : "border-danger/30"}`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-btn flex items-center justify-center text-xs font-bold shrink-0 bg-primary/10 text-primary">
                                {i + 1}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-ink truncate">{u.username}</p>
                                {u.telegram && <p className="text-xs text-subtle truncate">{u.telegram}</p>}
                              </div>
                            </div>
                            <div className="text-right shrink-0 ml-3 flex items-center gap-2">
                              <div>
                                <p className="text-sm font-semibold text-ink">₴{u.revenue.toLocaleString("uk-UA")}</p>
                                <p className="text-[10px] text-muted">{pct}% від топ-{stats.topUsers.length}</p>
                              </div>
                            </div>
                          </div>
                          {/* Progress bar */}
                          <div className="relative w-full h-1.5 bg-surface-hover rounded-full overflow-hidden mb-2">
                            <div
                              className="absolute left-0 top-0 h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, backgroundColor: isActive ? "#22c55e" : "#ef4444" }}
                            />
                          </div>
                          {/* Bottom row: status, end date */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                isActive ? "bg-success-bg text-success" : "bg-danger-bg text-danger"
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-success" : "bg-danger"}`} />
                                {isActive ? "Активна" : "Прострочена"}
                              </span>
                              {isActive && days <= 14 && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-warning-bg text-warning">
                                  <Clock className="h-2.5 w-2.5" strokeWidth={2} />
                                  {days} {days === 1 ? "день" : days >= 2 && days <= 4 ? "дні" : "днів"}
                                </span>
                              )}
                              {isActive && days > 14 && (
                                <span className="text-[10px] text-subtle flex items-center gap-1">
                                  <Zap className="h-2.5 w-2.5" strokeWidth={1.5} />
                                  {days} днів
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-muted">до {u.endDate}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}
          </div>

          {/* Expiring subscriptions */}
        <div className="card-admin p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-ink">Підписки, що закінчуються</h3>
              <p className="text-xs text-muted mt-0.5">≤7 днів</p>
            </div>
            {stats.expiringSubscriptions.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 px-2.5 py-1 bg-warning/10 rounded-full">
                  <span className="text-xs font-bold text-warning">₴{stats.expiringSubscriptions.reduce((s, u) => s + (u.priceMonth || 0), 0).toLocaleString("uk-UA")}</span>
                  <span className="text-[10px] text-muted">під ризиком</span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-warning-bg rounded-full">
                  <AlertTriangle className="h-3 w-3 text-warning" strokeWidth={2} />
                  <span className="text-xs font-bold text-warning">{stats.expiringSubscriptions.length}</span>
                  <span className="text-[10px] text-muted">{stats.expiringSubscriptions.length === 1 ? "підписка" : stats.expiringSubscriptions.length >= 2 && stats.expiringSubscriptions.length <= 4 ? "підписки" : "підписок"}</span>
                </div>
              </div>
            )}
          </div>
          {stats.expiringSubscriptions.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <div className="w-14 h-14 rounded-2xl bg-success-bg flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-success" strokeWidth={1.5} />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-ink">Все добре!</p>
                <p className="text-xs text-muted mt-1">Усі підписки активні, найближчі 7 днів — без ризиків</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {stats.expiringSubscriptions
                .slice()
                .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime())
                .map((s, i) => {
                const daysLeft = Math.ceil((new Date(s.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                const isUrgent = daysLeft <= 3;
                const pctLeft = Math.max(0, Math.min(100, Math.round((daysLeft / 7) * 100)));
                return (
                  <div key={i} className={`p-3 rounded-xl border-2 ${isUrgent ? "bg-danger-bg/20 border-danger/30" : "bg-warning-bg/20 border-warning/20"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold ${isUrgent ? "bg-danger-bg text-danger" : "bg-warning-bg text-warning"}`}>
                          {daysLeft}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink truncate">{s.username}</p>
                          {s.telegram && <p className="text-xs text-subtle truncate">{s.telegram}</p>}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className={`text-sm font-semibold ${isUrgent ? "text-danger" : "text-warning"}`}>{s.endDate}</p>
                        <p className="text-xs text-subtle">₴{Number(s.priceMonth || 0).toLocaleString("uk-UA")}/міс</p>
                      </div>
                    </div>
                    {/* Days-left progress bar */}
                    <div className="relative w-full h-1.5 bg-surface-hover rounded-full overflow-hidden mb-2">
                      <div
                        className={`absolute left-0 top-0 h-full rounded-full transition-all ${isUrgent ? "bg-danger" : "bg-warning"}`}
                        style={{ width: `${pctLeft}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-medium ${isUrgent ? "text-danger" : "text-warning"}`}>
                        {daysLeft <= 0 ? "🔴 Прострочена сьогодні" : daysLeft === 1 ? "⚠️ Залишився 1 день!" : `Залишилось ${daysLeft} ${daysLeft >= 2 && daysLeft <= 4 ? "дні" : "днів"}`}
                      </span>
                      <span className="text-[10px] text-muted">{pctLeft}% періоду</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
