import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, ArrowDownUp, ChevronDown, FileBarChart2 } from "lucide-react";

interface Props {
  months: { month: string; label: string; revenue: number }[];
  registrations: Record<string, number>;
  revenueTotal: number;
  registrationTotal: number;
}

const money = (amount: number) => `₴${amount.toLocaleString("uk-UA")}`;

export default function MonthlyReport({ months, registrations, revenueTotal, registrationTotal }: Props) {
  const [activeOnly, setActiveOnly] = useState(false);
  const [newestFirst, setNewestFirst] = useState(true);
  const current = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const rows = useMemo(() => {
    const chronological = [...months].sort((a, b) => a.month.localeCompare(b.month));
    return chronological.map((item, index) => {
      const previous = index > 0 ? chronological[index - 1].revenue : null;
      const count = registrations[item.month] || 0;
      const [year, number] = item.month.split("-");
      const name = new Date(Number(year), Number(number) - 1, 1).toLocaleDateString("uk-UA", { month: "long" });
      return { ...item, name, year, number, count, change: previous !== null && previous > 0 ? Math.round((item.revenue - previous) / previous * 100) : null, perUser: count > 0 ? Math.round(item.revenue / count) : null };
    });
  }, [months, registrations]);
  const visible = rows.filter(row => !activeOnly || row.revenue !== 0 || row.count !== 0);
  if (newestFirst) visible.reverse();
  const activeCount = rows.filter(row => row.revenue !== 0 || row.count !== 0).length;
  const totalPerUser = registrationTotal > 0 ? Math.round(revenueTotal / registrationTotal) : null;

  return <details className="card-admin monthly-report">
    <summary className="monthly-heading">
      <span className="monthly-heading-icon"><FileBarChart2 size={20} /></span>
      <span className="monthly-heading-text"><strong>Помісячний звіт</strong><span>Дохід, реєстрації та динаміка платформи</span></span>
      <span className="monthly-period-count">{rows.length} міс.</span>
      <span className="monthly-disclosure"><span className="monthly-show">Переглянути</span><span className="monthly-hide">Згорнути</span><ChevronDown size={15} /></span>
    </summary>
    <div className="monthly-toolbar">
      <div className="monthly-tabs" role="group" aria-label="Місяці у звіті"><button type="button" aria-pressed={!activeOnly} className={!activeOnly ? "selected" : ""} onClick={() => setActiveOnly(false)}>Усі місяці<span>{rows.length}</span></button><button type="button" aria-pressed={activeOnly} className={activeOnly ? "selected" : ""} onClick={() => setActiveOnly(true)}>З активністю<span>{activeCount}</span></button></div>
      <button type="button" className="monthly-order" onClick={() => setNewestFirst(value => !value)} aria-label={newestFirst ? "Сортування: новіші спочатку. Показати старіші спочатку" : "Сортування: старіші спочатку. Показати новіші спочатку"}><ArrowDownUp size={13} />{newestFirst ? "Новіші спочатку" : "Старіші спочатку"}</button>
    </div>
    <p className="monthly-mobile-hint">Прокрутіть таблицю вправо, щоб побачити всі показники →</p>
    <div className="monthly-scroll" role="region" aria-label="Таблиця помісячного звіту" tabIndex={0}>
      <table className="monthly-table">
        <thead><tr><th scope="col" aria-sort={newestFirst ? "descending" : "ascending"}>Місяць</th><th scope="col">Дохід</th><th scope="col">Зміна <span>до попер. місяця</span></th><th scope="col">Нові користувачі</th><th scope="col">Дохід на користувача</th></tr></thead>
        <tbody>{visible.map(row => {
          const isCurrent = row.month === current;
          const inactive = row.revenue === 0 && row.count === 0;
          return <tr key={row.month} className={`${isCurrent ? "monthly-current" : ""} ${inactive ? "monthly-inactive" : ""}`}>
            <th scope="row"><div className="monthly-month"><span className="monthly-month-number" aria-hidden="true">{row.number}</span><div><strong>{row.name}</strong><span>{row.year}</span></div>{isCurrent && <span className="monthly-current-label"><i />Поточний</span>}</div></th>
            <td><strong className={`monthly-money ${row.revenue === 0 ? "is-zero" : ""}`}>{money(row.revenue)}</strong></td>
            <td>{row.change === null ? <span className="monthly-missing" title="Немає попереднього ненульового доходу для порівняння">—</span> : <span className={`monthly-change ${row.change > 0 ? "positive" : row.change < 0 ? "negative" : "neutral"}`}>{row.change > 0 ? <ArrowUpRight size={13} /> : row.change < 0 ? <ArrowDownRight size={13} /> : null}{row.change > 0 ? "+" : ""}{row.change.toLocaleString("uk-UA")}%</span>}</td>
            <td>{row.count > 0 ? <span className="monthly-new-users">+{row.count}</span> : <span className="monthly-missing">0</span>}</td>
            <td>{row.perUser === null ? <span className="monthly-missing">—</span> : <span className="monthly-per-user">{money(row.perUser)}</span>}</td>
          </tr>;
        })}{!visible.length && <tr><td colSpan={5}><div className="monthly-empty"><FileBarChart2 size={25} /><strong>{activeOnly ? "Місяців з активністю немає" : "Звіт поки порожній"}</strong><p>{activeOnly ? "У цьому періоді немає доходу та нових реєстрацій." : "Дані з’являться після надходження статистики."}</p>{activeOnly && <button type="button" onClick={() => setActiveOnly(false)}>Показати всі місяці</button>}</div></td></tr>}</tbody>
        <tfoot><tr><th scope="row"><strong>Підсумок за період</strong><span>{rows.length} міс.</span></th><td>{money(revenueTotal)}</td><td><span className="monthly-missing">—</span></td><td>{registrationTotal}</td><td>{totalPerUser === null ? "—" : money(totalPerUser)}</td></tr></tfoot>
      </table>
    </div>
    <div className="monthly-caption"><span>Показано {visible.length} із {rows.length} місяців</span><span>Дохід на користувача = дохід ÷ нові реєстрації</span></div>
  </details>;
}
