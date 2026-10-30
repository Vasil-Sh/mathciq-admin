import MonthlyReport from "./MonthlyReport";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronDown, Layers3, Trophy, UserPlus } from "lucide-react";
import type { AdminStats } from "@/lib/adminStatsApi";
import { parseDate } from "@/lib/adminUtils";

interface Props {
  stats: AdminStats;
  months: { month: string; label: string; revenue: number; paidUsers: number }[];
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
  const plans = [...(stats.planDistribution || [])].sort((a, b) => b.count - a.count);
  const planTotal = plans.reduce((total, plan) => total + plan.count, 0);
  const recent = (stats.recentRegistrations || []).slice(0,3);

  return <>


    <div className="dashboard-recent">




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
    <div className="dashboard-extra">
    <MonthlyReport previousRevenue={Object.fromEntries(stats.revenueByMonth.map(row=>[row.month,row.revenue]))} months={months} registrations={registrations} revenueTotal={revenueTotal} registrationTotal={registrationTotal} />
    <details className="card-admin monthly-report">
      <summary className="monthly-heading">
        <span className="monthly-heading-icon"><Layers3 size={20} /></span>
        <span className="monthly-heading-text"><strong>Тарифний розподіл</strong><span>Поточні тарифи всіх користувачів</span></span>
        <span className="monthly-period-count">{plans.length} тарифів</span>
        <span className="monthly-disclosure"><ChevronDown size={15} /></span>
      </summary>
      <section className="detail-panel">
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
    </details>
    </div>
  </>;
}
