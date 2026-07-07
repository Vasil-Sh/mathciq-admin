import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import {
  Users, Wallet, BarChart3, MessageCircle,
  Trophy, DollarSign, Loader2, AlertTriangle, Calendar,
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

  const winRate = stats.betsThisWeek > 0
    ? Math.round((stats.winsThisWeek / stats.betsThisWeek) * 100)
    : 0;

  const formatMonth = (m: string) => { const [y, mo] = m.split("-"); return `${mo}.${y.slice(2)}`; };
  const chartData = stats.registrationsByMonth.map((r) => ({ ...r, label: formatMonth(r.month) }));

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-8 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-ink">Дашборд</h1>
          <p className="text-sm text-muted mt-1">Огляд ключових показників платформи</p>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { icon: Wallet, label: "MRR", value: `₴${stats.mrr.toLocaleString("uk-UA")}`, sub: "від активних", color: "text-success", bg: "!bg-success-bg" },
            { icon: Users, label: "Активні", value: stats.activeUsers, sub: `з ${stats.totalUsers}`, color: "text-primary", bg: "!bg-surface-hover" },
            { icon: BarChart3, label: "Ставок за тиждень", value: stats.betsThisWeek, sub: `${winRate}% win rate`, color: "text-warning", bg: "!bg-warning-bg" },
            { icon: DollarSign, label: "Profit загалом", value: `${stats.totalProfit >= 0 ? "+" : ""}₴${stats.totalProfit.toLocaleString("uk-UA")}`, sub: "", color: stats.totalProfit >= 0 ? "text-success" : "text-danger", bg: stats.totalProfit >= 0 ? "!bg-success-bg" : "!bg-danger-bg" },
            { icon: MessageCircle, label: "Telegram-груп", value: stats.telegramGroups, sub: "підключено", color: "text-primary", bg: "!bg-surface-hover" },
            { icon: Trophy, label: "Адмінів", value: stats.adminUsers, sub: "в системі", color: "text-warning", bg: "!bg-warning-bg" },
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

        {/* ── Chart + Win/Loss ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="card-admin p-6 lg:col-span-2">
            <h3 className="text-lg font-semibold text-ink mb-1">Реєстрації по місяцях</h3>
            <p className="text-xs text-muted mb-4">Нові користувачі за останні 12 місяців</p>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: "12px", border: "1px solid #E5E7EB", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", fontSize: "12px" }}
                />
                <Bar dataKey="count" fill="#447afc" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card-admin p-6 flex flex-col items-center justify-center">
            <h3 className="text-lg font-semibold text-ink mb-1 text-center">Win Rate (тиждень)</h3>
            <p className="text-xs text-muted mb-3">{stats.betsThisWeek} ставок за 7 днів</p>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={[
                    { name: "Win", value: stats.winsThisWeek },
                    { name: "Loss", value: stats.lossesThisWeek },
                    { name: "Pending", value: Math.max(0, stats.betsThisWeek - stats.winsThisWeek - stats.lossesThisWeek) },
                  ].filter(d => d.value > 0)}
                  cx="50%" cy="50%" innerRadius={45} outerRadius={75}
                  dataKey="value" strokeWidth={0}
                >
                  <Cell fill="#16A34A" /><Cell fill="#DC2626" /><Cell fill="#9CA3AF" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1.5 text-xs"><span className="w-3 h-3 rounded-full bg-success" /><span className="text-muted">Win</span><span className="font-semibold text-ink">{stats.winsThisWeek}</span></div>
              <div className="flex items-center gap-1.5 text-xs"><span className="w-3 h-3 rounded-full bg-danger" /><span className="text-muted">Loss</span><span className="font-semibold text-ink">{stats.lossesThisWeek}</span></div>
            </div>
          </div>
        </div>

        {/* ── Bottom: Top Users + Expiring ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card-admin p-6">
            <h3 className="text-lg font-semibold text-ink mb-4">ТОП-5 за ставками</h3>
            {stats.topUsers.length === 0 ? (
              <p className="text-sm text-muted">Немає даних</p>
            ) : (
              <div className="space-y-3">
                {stats.topUsers.map((u, i) => (
                  <div key={u.username} className="flex items-center justify-between py-2 border-b border-hairline last:border-0">
                    <div className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? "bg-warning text-white" : i === 1 ? "bg-subtle/30 text-muted" : i === 2 ? "bg-amber-100 text-amber-700" : "bg-surface-subtle text-muted"}`}>{i + 1}</span>
                      <span className="text-sm font-medium text-ink">{u.username}</span>
                    </div>
                    <span className="text-sm text-muted">{u.betCount} ставок</span>
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
