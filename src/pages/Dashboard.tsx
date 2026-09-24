import DashboardDetails from "@/components/DashboardDetails";
import { useEffect, useState } from "react";
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import {
  Users, Wallet, UserPlus, UserX, Shield,
  Loader2, AlertTriangle, MoveUpRight, Filter, RefreshCw,
} from "lucide-react";
import { fetchAdminStats, type AdminStats } from "@/lib/adminStatsApi";


const UA_MONTHS = ["Січ", "Лют", "Бер", "Кві", "Тра", "Чер", "Лип", "Сер", "Вер", "Жов", "Лис", "Гру"];
const UA_MONTHS_FULL = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];

function formatMonthName(m: string) {
  const [y, mo] = m.split("-");
  return UA_MONTHS[parseInt(mo, 10) - 1] ?? mo;
}

function formatMonthFullName(m: string) {
  const [y, mo] = m.split("-");
  return UA_MONTHS_FULL[parseInt(mo, 10) - 1] ?? mo;
}

function formatMonthFull(m: string) {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("uk-UA", { month: "long", year: "numeric" });
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
      setError((e as Error).message || "Помилка завантаження");
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
    { key: "all", label: "Всі", year: "", reg: stats.registrationsByMonth.reduce((s, r) => s + r.count, 0), rev: stats.totalRevenue },
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
  const revChartData = allMonths.filter(m => monthFilter_ === "all" || m <= monthFilter_).map((m) => {
    const rev = revByMonthLookup[m] || 0;
    return { month: m, label: formatMonthFull(m), revenue: rev, cumulative: (revCum += rev) };
  });
  const revTotal = revCum;
  const bestMonth = [...revChartData].filter(r => r.revenue > 0).sort((a, b) => b.revenue - a.revenue)[0] || null;

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
    ? "Всі місяці"
    : `${formatMonthFullName(monthFilter_)} ${monthFilter_.split("-")[0]}`;

  return (
    <div className="dashboard-page">
      <div className="page-container space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="page-eyebrow">АНАЛІТИКА ПЛАТФОРМИ</p>
            <h1 className="page-title">Дашборд</h1>
            <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-2">
              <p className="text-xs text-muted">Ваш бізнес у цифрах. Усе під контролем.</p>
              {lastUpdate && (
                <span className="text-xs text-subtle">· Оновлено: {lastUpdate}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-btn bg-primary text-white text-sm hover:bg-primary-hover transition-colors disabled:opacity-50 shadow-primary-glow"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} strokeWidth={1.5} />
              <span className="text-sm font-medium">Оновити</span>
            </button>
          <div className="relative" data-filter-dropdown>
            <button
              onClick={() => setFilterOpen(!filterOpen)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-btn bg-primary text-white text-sm hover:bg-primary-hover transition-colors shadow-primary-glow"
            >
              <Filter className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span className="text-sm font-medium">{currLabel}</span>
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
        <div className="dashboard-summary-grid">
          {[
            { icon: Wallet,   label: isAll ? "MRR" : "Дохід за міс", value: `₴${kpiMrr.toLocaleString("uk-UA")}`, note: isAll ? "щомісячний дохід" : currLabel, tone: "user-summary--green" },
            { icon: Users,    label: "Активні",     value: stats.activeUsers,                       note: `з ${stats.totalUsers}`,                    tone: "" },
            { icon: UserPlus, label: isAll ? "Нових за міс" : "Нові за міс", value: kpiNewMonth,   note: isAll ? "цей місяць" : currLabel,              tone: "user-summary--green" },
            { icon: Shield,   label: "Адмінів",      value: stats.adminUsers,                       note: "в системі",                                  tone: "user-summary--amber" },
            { icon: UserX,    label: "Неактивні",    value: stats.inactiveUsers,                    note: "прострочені",                                tone: "user-summary--rose" },
          ].map(({ icon: Icon, label, value, note, tone }) => (
            <section key={label} className={`card-admin user-summary ${tone}`}>
              <div className="user-summary-top"><span className="user-summary-icon"><Icon size={19} strokeWidth={1.7} /></span><h2>{label}</h2></div>
              <strong className="user-summary-value">{value}</strong>
              <p className="user-summary-note"><span />{note}</p>
            </section>
          ))}
        </div>

        <div className="analytics-grid">
          <section className="card-admin chart-card" aria-label="Динаміка доходу">
            <div className="flex items-start justify-between gap-3"><div><h2 className="panel-title">Динаміка доходу</h2><p className="panel-description">{isAll ? "За весь період" : `До ${formatMonthFull(monthFilter_)}`} · помісячно</p></div><span className="flex items-center gap-2 text-[10px] text-muted"><span className="legend-dot bg-primary" />Дохід</span></div>
            <div className="mt-5 flex items-baseline gap-2"><strong className="text-[28px] font-semibold tracking-tight">₴{revTotal.toLocaleString("uk-UA")}</strong><span className="text-[11px] text-muted">за період</span></div>
            {revChartData.length ? <div className="chart-frame"><ResponsiveContainer width="100%" height="100%"><AreaChart data={revChartData} margin={{ top: 10, right: 16, bottom: 0, left: 0 }} accessibilityLayer>
              <defs><linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4278f5" stopOpacity={.22} /><stop offset="100%" stopColor="#4278f5" stopOpacity={.01} /></linearGradient></defs>
              <CartesianGrid vertical={false} stroke="#eaf0f7" strokeDasharray="4 5" />
              <XAxis dataKey="month" tickFormatter={m => `${formatMonthName(m)} '${m.slice(2,4)}`} axisLine={false} tickLine={false} tick={{ fill: "#7b8ba4", fontSize: 10 }} tickMargin={12} minTickGap={25} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "#7b8ba4", fontSize: 10 }} width={48} tickFormatter={v => `₴${v}`} />
              <Tooltip labelFormatter={label => formatMonthFull(String(label))} formatter={value => [`₴${Number(value).toLocaleString("uk-UA")}`, "Дохід"]} contentStyle={{ borderRadius: 12, border: "1px solid #e8edf5", fontSize: 12, boxShadow: "0 8px 24px #15244a12" }} />
              <Area type="monotone" dataKey="revenue" stroke="#4278f5" strokeWidth={2.5} fill="url(#revenue-fill)" dot={{ r: 3, fill: "#4278f5", strokeWidth: 2, stroke: "white" }} activeDot={{ r: 5 }} isAnimationActive={false} />
            </AreaChart></ResponsiveContainer></div> : <div className="chart-empty">Дані про дохід з’являться тут</div>}
          </section>
          <section className="card-admin chart-card activity-panel">
            <header><h2 className="panel-title">Активність користувачів</h2><p className="panel-description">Поточний стан платформи</p></header>
            <div className="activity-ring" style={{ background: `conic-gradient(#4278f5 ${stats.totalUsers ? Math.min(100, stats.activeUsers / stats.totalUsers * 100) : 0}%, #edf1f8 0)` }}><div className="activity-ring-center"><strong>{stats.totalUsers ? Math.round(stats.activeUsers / stats.totalUsers * 100) : 0}%</strong><span>активних</span></div></div>
            <div><div className="legend-row"><span><i className="legend-dot bg-primary" />Активні</span><strong>{stats.activeUsers}</strong></div><div className="legend-row"><span><i className="legend-dot bg-slate-300" />Неактивні</span><strong>{stats.inactiveUsers}</strong></div><div className="legend-row border-t border-hairline mt-2 pt-3"><span>Всього користувачів</span><strong>{stats.totalUsers}</strong></div></div>
          </section>
        </div>
        <DashboardDetails stats={stats} months={revChartData} registrations={regByMonthLookup} revenueTotal={revTotal} registrationTotal={regTotal} />
      </div>
    </div>
  );
}
