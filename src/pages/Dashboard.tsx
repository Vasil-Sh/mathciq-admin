import { useEffect, useState } from "react";
import {
  Users, Wallet, UserPlus, UserX, Shield,
  Loader2, AlertTriangle, MoveUpRight, Filter, CheckCircle, RefreshCw,
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
  const [lastUpdate, setLastUpdate] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async (showLoading = false) => {
    if (showLoading) setRefreshing(true);
    try {
      const data = await fetchAdminStats();
      setStats(data);
      setError("");
      setLastUpdate(new Date().toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }));
    } catch (e) {
      if (showLoading) setError((e as Error).message || "Помилка завантаження");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

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

  // Build lookup maps for chart — fill all months, even those with 0 values
  const revByMonthLookup: Record<string, number> = Object.fromEntries(filteredRev.map(r => [r.month, r.revenue]));
  const regByMonthLookup: Record<string, number> = Object.fromEntries(filteredReg.map(r => [r.month, r.count]));

  let revCum = 0;
  const revChartData = allMonths.map((m) => {
    const rev = revByMonthLookup[m] || 0;
    const year = m.split("-")[0]?.slice(2);
    return { month: m, label: `${formatMonthName(m)}'${year}`, revenue: rev, cumulative: (revCum += rev) };
  });
  const revTotal = revCum;

  let cum = 0;
  const regChartData = allMonths.map((m) => {
    const count = regByMonthLookup[m] || 0;
    const year = m.split("-")[0]?.slice(2);
    if (count > 0) cum += count;
    return { month: m, label: `${formatMonthName(m)}'${year}`, count, cumulative: count > 0 ? cum : null };
  });
  const regTotal = cum;

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
            <div className="flex items-center gap-2 mt-1">
              <p className="text-sm text-muted">Огляд ключових показників платформи</p>
              {lastUpdate && (
                <span className="text-xs text-subtle">· Оновлено: {lastUpdate}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-hairline bg-white text-sm text-body hover:border-primary/60 hover:text-ink transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} strokeWidth={1.5} />
              <span className="text-xs font-medium">Оновити</span>
            </button>
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

        {/* ── Combined Data Table ── */}
        <div className="card-admin p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <h3 className="text-lg font-semibold text-ink">Дохід та реєстрації по місяцях</h3>
              <p className="text-xs text-muted mt-0.5">
                ₴{revTotal.toLocaleString("uk-UA")} всього · {regTotal} користувачів · <span className="text-success">ARPU ₴{regTotal > 0 ? Math.round(revTotal / regTotal).toLocaleString("uk-UA") : "—"}</span>
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-hairline text-muted text-xs uppercase tracking-wider">
                  <th className="text-left py-2.5 pr-4 font-semibold">Місяць</th>
                  <th className="text-right py-2.5 px-4 font-semibold border-l border-hairline">Дохід</th>
                  <th className="text-right py-2.5 px-4 font-semibold border-l border-hairline">Нових користувачів</th>
                  <th className="text-right py-2.5 px-4 font-semibold border-l border-hairline">ARPU</th>
                  <th className="text-right py-2.5 pl-4 font-semibold border-l border-hairline">Накопичено</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {revChartData.map((r, i) => {
                  const reg = regByMonthLookup[r.month] || 0;
                  const arpu = reg > 0 ? Math.round(r.revenue / reg) : 0;
                  const isCurrentMonth = r.month === `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
                  return (
                    <tr key={r.month} className={`transition-colors ${isCurrentMonth ? "bg-primary/5" : "hover:bg-surface-subtle"}`}>
                      <td className={`py-2.5 pr-4 font-medium text-ink ${isCurrentMonth ? "text-primary" : ""}`}>
                        {isCurrentMonth && <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary mr-2 align-middle" />}
                        {r.label}
                        {isCurrentMonth && <span className="text-[10px] text-primary ml-1.5 font-normal">поточний</span>}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-success font-semibold border-l border-hairline">
                        {r.revenue > 0 ? `₴${r.revenue.toLocaleString("uk-UA")}` : <span className="text-subtle font-normal">—</span>}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-primary font-semibold border-l border-hairline">
                        {reg > 0 ? reg : <span className="text-subtle font-normal">—</span>}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-ink border-l border-hairline">
                        {arpu > 0 ? `₴${arpu.toLocaleString("uk-UA")}` : <span className="text-subtle font-normal">—</span>}
                      </td>
                      <td className="py-2.5 pl-4 text-right tabular-nums text-ink font-medium border-l border-hairline">₴{r.cumulative.toLocaleString("uk-UA")}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-hairline bg-surface-subtle font-semibold">
                  <td className="py-2.5 pr-4 text-ink">Всього</td>
                  <td className="py-2.5 px-4 text-right tabular-nums text-success border-l border-hairline">₴{revTotal.toLocaleString("uk-UA")}</td>
                  <td className="py-2.5 px-4 text-right tabular-nums text-primary border-l border-hairline">{regTotal}</td>
                  <td className="py-2.5 px-4 text-right tabular-nums text-ink border-l border-hairline">₴{regTotal > 0 ? Math.round(revTotal / regTotal).toLocaleString("uk-UA") : "—"}</td>
                  <td className="py-2.5 pl-4 text-right tabular-nums text-ink border-l border-hairline">₴{revTotal.toLocaleString("uk-UA")}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ── Expiring subscriptions ── */}
        <div className="grid grid-cols-1 gap-6">
        <div className="card-admin p-6 flex flex-col">
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
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
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
