import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, ArrowRight, CalendarDays, CheckCircle2, ChevronDown, FileBarChart2, Layers3, Trophy, UserPlus, Clock3, Wallet, TrendingUp, Users } from "lucide-react";
import type { AdminStats } from "@/lib/adminStatsApi";
import { getDaysUntilExpiry, parseDate } from "@/lib/adminUtils";

interface Props {
  stats: AdminStats;
  months: { month: string; label: string; revenue: number }[];
  registrations: Record<string, number>;
  revenueTotal: number;
  registrationTotal: number;
}

const money = (value: number) => `₴${value.toLocaleString("uk-UA")}`;
const planColors = ["#4278f5", "#8aabfa", "#39a792", "#e5b45f", "#9881c9"];

function PanelHeading({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <header className="detail-panel-heading">
    <span className="detail-panel-icon">{icon}</span>
    <div className="min-w-0 flex-1"><h2>{title}</h2><p>{description}</p></div>
    {action}
  </header>;
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="detail-empty">{children}</div>;
}

function displayDate(value: string) {
  const date = parseDate(value);
  return date ? date.toLocaleDateString("uk-UA", { day: "numeric", month: "short", year: "numeric" }) : value;
}

export default function DashboardDetails({ stats, months, registrations, revenueTotal, registrationTotal }: Props) {
  const maxRevenue = Math.max(1, ...months.map(m => m.revenue));
  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const plans = [...(stats.planDistribution || [])].sort((a, b) => b.count - a.count);
  const planTotal = plans.reduce((total, plan) => total + plan.count, 0);
  const arpu = registrationTotal > 0 ? Math.round(revenueTotal / registrationTotal) : null;
  const recent = stats.recentRegistrations || [];
  const expiring = [...stats.expiringSubscriptions].sort((a, b) => getDaysUntilExpiry(a.endDate) - getDaysUntilExpiry(b.endDate));

  return <>
    <details className="card-admin report-panel">
      <summary>
        <span className="detail-panel-icon"><FileBarChart2 size={20} /></span>
        <span className="report-title"><strong>Помісячний звіт</strong><span>Дохід, реєстрації та динаміка платформи</span></span>
        <span className="report-count">{months.length} міс.</span>
        <span className="report-toggle"><ChevronDown size={16} /></span>
      </summary>
      <div className="report-scroll" role="region" aria-label="Помісячний звіт — прокрутіть для перегляду всіх колонок" tabIndex={0}>
        <table className="report-table">
          <thead><tr><th scope="col"><span className="report-th"><CalendarDays size={13} />Місяць</span></th><th scope="col"><span className="report-th"><Wallet size={13} />Дохід</span></th><th scope="col"><span className="report-th"><TrendingUp size={13} />Зміна</span></th><th scope="col"><span className="report-th"><Users size={13} />Нові користувачі</span></th><th scope="col"><span className="report-th"><Trophy size={13} />Дохід на кор.</span></th></tr></thead>
          <tbody>
            {months.map((month, i) => {
              const previous = i > 0 ? months[i - 1].revenue : 0;
              const change = previous > 0 ? Math.round((month.revenue - previous) / previous * 100) : null;
              const count = registrations[month.month] || 0;
              const current = month.month === currentMonth;
              return <tr key={month.month} className={current ? "report-current" : undefined}>
                <th scope="row"><span className="report-month">{month.label}{current && <span className="current-label">Поточний</span>}</span></th>
                <td><div className="report-revenue"><strong>{money(month.revenue)}</strong></div></td>
                <td>{change === null ? <span className="text-subtle">—</span> : <span className={`change-badge ${change > 0 ? "is-up" : change < 0 ? "is-down" : "is-flat"}`}>
                  {change > 0 ? <ArrowUpRight size={12} /> : change < 0 ? <ArrowDownRight size={12} /> : null}{change > 0 ? "+" : ""}{change}%
                </span>}</td>
                <td>{count > 0 ? <span className="registration-count">+{count}</span> : <span className="text-subtle">—</span>}</td>
                <td>{count > 0 ? money(Math.round(month.revenue / count)) : <span className="text-subtle">—</span>}</td>
              </tr>;
            })}
            {!months.length && <tr><td colSpan={5}><Empty>Дані за місяцями ще не з’явилися</Empty></td></tr>}
          </tbody>
          <tfoot><tr><th scope="row">Підсумок за період</th><td>{money(revenueTotal)}</td><td>—</td><td>{registrationTotal}</td><td className="report-arpu">{arpu === null ? "—" : money(arpu)}</td></tr></tfoot>
        </table>
      </div>
    </details>

    <div className="detail-panels">
      <section className="card-admin detail-panel">
        <PanelHeading icon={<Layers3 size={19} />} title="Тарифний розподіл" description="Як розподілені користувачі" />
        {plans.length ? <div className="plan-content">
          <div className="plan-total"><strong>{planTotal}</strong><span>користувачів на тарифах</span></div>
          <div className="plan-stack" aria-hidden="true">{plans.map((plan, i) => <span key={plan.price} style={{ width: `${planTotal ? plan.count / planTotal * 100 : 0}%`, background: planColors[i % planColors.length] }} />)}</div>
          <div className="plan-list">{plans.map((plan, i) => <div className="plan-row" key={plan.price}>
            <span className="plan-dot" style={{ background: planColors[i % planColors.length] }} />
            <div><strong>{money(plan.price)}<small> / міс.</small></strong><span>{plan.count} користувачів</span></div>
            <span className="plan-percentage">{planTotal ? Math.round(plan.count / planTotal * 100) : 0}%</span>
          </div>)}</div>
        </div> : <Empty>Розподіл з’явиться, коли будуть дані про тарифи</Empty>}
      </section>

      <section className="card-admin detail-panel">
        <PanelHeading icon={<Trophy size={19} />} title="Топ дохід" description="Користувачі з найбільшим доходом" />
        {stats.topUsers.length ? <ol className="people-list">{stats.topUsers.map((person, i) => <li key={person.username}>
          <span className={`rank-number ${i === 0 ? "rank-first" : ""}`}>{i === 0 ? <Trophy size={14} aria-label="Перше місце" /> : String(i + 1).padStart(2, "0")}</span>
          <span className="person-avatar" aria-hidden="true">{person.username.slice(0, 1).toUpperCase()}</span>
          <div className="person-name"><strong title={person.username}>{person.username}</strong><span>{person.telegram || "Користувач MatchIQ"}</span></div>
          <strong className="person-amount">{money(person.revenue)}</strong>
        </li>)}</ol> : <Empty>Рейтинг з’явиться після надходження даних</Empty>}
      </section>

      <section className="card-admin detail-panel">
        <PanelHeading icon={<UserPlus size={19} />} title="Останні реєстрації" description="Нові користувачі платформи" action={<Link to="/users" className="panel-link" aria-label="Переглянути користувачів"><ArrowRight size={17} /></Link>} />
        {recent.length ? <ul className="people-list recent-list">{recent.map((person, i) => <li key={person.username + i}>
          <span className="person-avatar recent-avatar" aria-hidden="true">{person.username.slice(0, 1).toUpperCase()}</span>
          <div className="person-name"><strong title={person.username}>{person.username}</strong><span>{displayDate(person.date)}</span></div>
          <span className="person-plan">{person.price == null ? "—" : money(person.price)}<small>/ міс.</small></span>
        </li>)}</ul> : <Empty>Нові реєстрації відображатимуться тут</Empty>}
        {!!recent.length && <Link to="/users" className="panel-footer-link">Усі користувачі<ArrowRight size={14} /></Link>}
      </section>
    </div>

    <section className="card-admin expiry-panel">
      <PanelHeading icon={<CalendarDays size={19} />} title="Підписки, що закінчуються" description="Контроль термінів і своєчасне продовження" action={<span className="period-label"><Clock3 size={13} />Наступні 7 днів</span>} />
      {!expiring.length ? <div className="expiry-clear">
        <span className="expiry-check"><CheckCircle2 size={25} /></span>
        <div><h3>Найближчим часом продовжень немає</h3><p>Жодна підписка не закінчується протягом наступних 7 днів.</p></div>
        <span className="clear-status"><span />Без нагадувань</span>
      </div> : <div className="expiry-content">
        <p className="expiry-summary"><strong>{expiring.length}</strong> підписок потребують уваги <span>· {money(expiring.reduce((sum, person) => sum + Number(person.priceMonth || 0), 0))} / міс.</span></p>
        <div className="expiry-grid">{expiring.map((person, i) => {
          const days = getDaysUntilExpiry(person.endDate);
          return <div key={person.username + i} className={`expiry-item ${days <= 3 ? "is-urgent" : ""}`}>
            <span className="expiry-days"><strong>{Math.max(0, days)}</strong><span>днів</span></span>
            <div className="person-name"><strong>{person.username}</strong><span>{person.telegram || displayDate(person.endDate)}</span></div>
            <div className="expiry-date"><strong>{days < 0 ? "Прострочена" : days === 0 ? "Сьогодні" : displayDate(person.endDate)}</strong><span>{money(Number(person.priceMonth || 0))} / міс.</span></div>
          </div>;
        })}</div>
      </div>}
    </section>
  </>;
}
