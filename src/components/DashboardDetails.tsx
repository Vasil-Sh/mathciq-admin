import MonthlyReport from "./MonthlyReport";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Layers3, Trophy, UserPlus } from "lucide-react";
import type { AdminStats } from "@/lib/adminStatsApi";
import { parseDate } from "@/lib/adminUtils";

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
  const plans = [...(stats.planDistribution || [])].sort((a, b) => b.count - a.count);
  const planTotal = plans.reduce((total, plan) => total + plan.count, 0);
  const recent = stats.recentRegistrations || [];

  return <>
    <MonthlyReport months={months} registrations={registrations} revenueTotal={revenueTotal} registrationTotal={registrationTotal} />

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


  </>;
}
