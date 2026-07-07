import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from "recharts";
import {
  Users, Wallet, TrendingUp, UserPlus, UserX, Shield,
  Loader2, AlertTriangle, Calendar,
} from "lucide-react";
import { fetchAdminStats, type AdminStats } from "@/lib/adminStatsApi";

export default function Dashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  const formatMonth = (m: string) => { const [y, mo] = m.split("-"); return `${mo}.${y.slice(2)}`; };
  const revChartData = stats.revenueByMonth.map((r) => ({ ...r, label: formatMonth(r.month) }));
  const regChartData = stats.registrationsByMonth.map((r) => ({ ...r, label: formatMonth(r.month) }));

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-8 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-ink">Дашборд</h1>
          <p className="text-sm text-muted mt-1">Огляд ключових показників платформи</p>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {[
            { icon: Wallet,   label: "MRR",        value: `₴${stats.mrr.toLocaleString("uk-UA")}`,                       sub: "щомісячний дохід",    color: "text-success", bg: "!bg-success-bg" },
            { icon: TrendingUp, label: "Дохід всього", value: `₴${stats.totalRevenue.toLocaleString("uk-UA")}`,             sub: "всі підписки",       color: "text-primary", bg: "!bg-surface-hover" },
            { icon: Users,     label: "Активні",     value: stats.activeUsers,                                            sub: `з ${stats.totalUsers}`, color: "text-primary", bg: "!bg-surface-hover" },
            { icon: UserPlus,  label: "Нових за міс", value: stats.newThisMonth,                                          sub: "цей місяць",         color: "text-success", bg: "!bg-success-bg" },
            { icon: UserX,     label: "Неактивні",    value: stats.inactiveUsers,                                         sub: "прострочені",        color: "text-danger",  bg: "!bg-danger-bg" },
            { icon: Shield,    label: "Адмінів",      value: stats.adminUsers,                                            sub: "в системі",          color: "text-warning", bg: "!bg-warning-bg" },
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
            <h3 className="text-lg font-semibold text-ink mb-1">Дохід по місяцях</h3>
            <p className="text-xs text-muted mb-4">MRR динаміка за останні 12 місяців</p>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={revChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}₴`} />
                <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid #E5E7EB", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", fontSize: "12px" }} formatter={(value: any) => [`₴${Number(value).toLocaleString("uk-UA")}`, "Дохід"]} />
                <Line type="monotone" dataKey="revenue" stroke="#16A34A" strokeWidth={2} dot={{ r: 3, fill: "#16A34A" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="card-admin p-6">
            <h3 className="text-lg font-semibold text-ink mb-1">Нові реєстрації</h3>
            <p className="text-xs text-muted mb-4">Нові користувачі по місяцях</p>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={regChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid #E5E7EB", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", fontSize: "12px" }} formatter={(value: any) => [`${value}`, "Реєстрацій"]} />
                <Bar dataKey="count" fill="#447afc" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Bottom: Top Users + Expiring ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card-admin p-6">
            <h3 className="text-lg font-semibold text-ink mb-4">ТОП-5 за доходом</h3>
            {stats.topUsers.length === 0 ? (
              <p className="text-sm text-muted">Немає даних</p>
            ) : (
              <div className="space-y-3">
                {stats.topUsers.map((u, i) => (
                  <div key={u.username} className="flex items-center justify-between py-2 border-b border-hairline last:border-0">
                    <div className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? "bg-warning text-white" : i === 1 ? "bg-subtle/30 text-muted" : i === 2 ? "bg-amber-100 text-amber-700" : "bg-surface-subtle text-muted"}`}>{i + 1}</span>
                      <div>
                        <span className="text-sm font-medium text-ink">{u.username}</span>
                        {u.telegram && <p className="text-xs text-subtle">{u.telegram}</p>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-sm font-semibold text-ink">₴{u.revenue}/міс</span>
                      <p className="text-xs text-subtle">до {u.endDate}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card-admin p-6">
            <h3 className="text-lg font-semibold text-ink mb-4">Закінчуються (≤7 днів)</h3>
            {stats.expiringSubscriptions.length === 0 ? (
              <p className="text-sm text-muted">Немає підписок, що закінчуються</p>
            ) : (
              <div className="space-y-3">
                {stats.expiringSubscriptions.map((s, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-hairline last:border-0">
                    <div className="flex items-center gap-3">
                      <Calendar className="h-4 w-4 text-warning shrink-0" strokeWidth={1.5} />
                      <div>
                        <p className="text-sm font-medium text-ink">{s.username}</p>
                        {s.telegram && <p className="text-xs text-subtle">{s.telegram}</p>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm text-warning font-medium">{s.endDate}</p>
                      <p className="text-xs text-subtle">₴{s.priceMonth}/міс</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
