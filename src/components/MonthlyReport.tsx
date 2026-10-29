import { useMemo, useState } from "react";
import { ArrowDownUp, ChevronDown, FileBarChart2 } from "lucide-react";

interface Props {
  months: { month: string; label: string; revenue: number; paidUsers: number }[];
  previousRevenue: Record<string, number>;
  registrations: Record<string, number>;
  revenueTotal: number;
  registrationTotal: number;
}

const money = (amount: number) => `₴${amount.toLocaleString("uk-UA", {maximumFractionDigits:2})}`;

export default function MonthlyReport({ months, previousRevenue, registrations, revenueTotal, registrationTotal }: Props) {
  const [activeOnly, setActiveOnly] = useState(false);
  const [newestFirst, setNewestFirst] = useState(false);
  const current = new Intl.DateTimeFormat("en-CA", {timeZone:"Europe/Kyiv",year:"numeric",month:"2-digit"}).format(new Date());
  const rows = useMemo(() => {
    const chronological = [...months].sort((a, b) => a.month.localeCompare(b.month));
    return chronological.map((item) => {
      const [itemYear,itemMonth] = item.month.split("-").map(Number);
      const previousMonth = itemMonth === 1 ? `${itemYear - 1}-12` : `${itemYear}-${String(itemMonth - 1).padStart(2,"0")}`;
      const previous = previousRevenue[previousMonth] ?? null;
      const count = registrations[item.month] || 0;
      const [year, number] = item.month.split("-");
      const name = new Date(Number(year), Number(number) - 1, 1).toLocaleDateString("uk-UA", { month: "long" });
      return { ...item, name, year, number, count, previous, delta: previous === null ? null : item.revenue - previous, change: previous !== null && previous > 0 ? Math.round((item.revenue - previous) / previous * 100) : null, perUser: item.paidUsers > 0 ? item.revenue / item.paidUsers : null };
    });
  }, [months, registrations, previousRevenue]);
  const visible = rows.filter(row => !activeOnly || row.revenue !== 0 || row.count !== 0);
  const display = newestFirst ? [...visible].reverse() : visible;
  const activeCount = rows.filter(row => row.revenue !== 0 || row.count !== 0).length;


  return <details className="card-admin monthly-report">
    <summary className="monthly-heading">
      <span className="monthly-heading-icon"><FileBarChart2 size={20} /></span>
      <span className="monthly-heading-text"><strong>Помісячний звіт</strong><span>Розрахункова вартість підписок і нові реєстрації</span></span>
      <span className="monthly-period-count">{rows.length} міс.</span>
      <span className="monthly-disclosure"><ChevronDown size={15} /></span>
    </summary>
    <div className="monthly-toolbar">
      <div className="monthly-tabs" role="group" aria-label="Місяці у звіті"><button type="button" aria-pressed={!activeOnly} className={!activeOnly ? "selected" : ""} onClick={() => setActiveOnly(false)}>Усі місяці<span>{rows.length}</span></button><button type="button" aria-pressed={activeOnly} className={activeOnly ? "selected" : ""} onClick={() => setActiveOnly(true)}>З активністю<span>{activeCount}</span></button></div>
      <button type="button" className="monthly-order" onClick={() => setNewestFirst(value => !value)} aria-label={newestFirst ? "Сортування: новіші спочатку. Показати старіші спочатку" : "Сортування: старіші спочатку. Показати новіші спочатку"}><ArrowDownUp size={13} />{newestFirst ? "Новіші спочатку" : "Старіші спочатку"}</button>
    </div>
    <p className="monthly-mobile-hint">Прокрутіть таблицю вправо, щоб побачити всі показники →</p>
    <div className="monthly-scroll" role="region" aria-label="Таблиця помісячного звіту" tabIndex={0}>
      <table className="monthly-table">
        <thead><tr><th scope="col" aria-sort={newestFirst ? "descending" : "ascending"}>Місяць</th><th scope="col">Вартість підписок*</th><th scope="col">До попереднього місяця</th><th scope="col">Нові користувачі</th><th scope="col">На платного користувача</th></tr></thead>
        <tbody>{display.map(row => {
          const isCurrent = row.month === current;
          const inactive = row.revenue === 0 && row.count === 0;
          return <tr key={row.month} className={`${isCurrent ? "monthly-current" : ""} ${inactive ? "monthly-inactive" : ""}`}>
            <th scope="row"><div className="monthly-month"><span className="monthly-month-number" aria-hidden="true">{row.number}</span><div><strong>{row.name}</strong><span>{row.year}</span></div>{isCurrent && <span className="monthly-current-label"><i />Поточний</span>}</div></th>
            <td><strong className={`monthly-money ${row.revenue === 0 ? "is-zero" : ""}`}>{money(row.revenue)}</strong></td>
            <td><div className={`monthly-delta ${row.delta !== null && row.delta > 0 ? "is-up" : row.delta !== null && row.delta < 0 ? "is-down" : ""}`}>
              <strong>{row.delta === null ? "—" : `${row.delta > 0 ? "+" : row.delta < 0 ? "−" : ""}${money(Math.abs(row.delta))}`}</strong>
              <span>{row.previous === null ? "Немає даних за попередній місяць" : row.previous === 0 ? "Попередній місяць: ₴0" : `${(row.change ?? 0) > 0 ? "+" : ""}${row.change}%`}</span>
              {isCurrent && <small className="monthly-incomplete">Неповний місяць</small>}
            </div></td>
            <td>{row.count > 0 ? <span className="monthly-new-users">+{row.count}</span> : <span className="monthly-missing">0</span>}</td>
            <td>{row.perUser === null ? <span className="monthly-missing">—</span> : <span className="monthly-per-user">{money(row.perUser)}</span>}</td>
          </tr>;
        })}{!display.length && <tr><td colSpan={5}><div className="monthly-empty"><FileBarChart2 size={25} /><strong>{activeOnly ? "Місяців з активністю немає" : "Звіт поки порожній"}</strong><p>{activeOnly ? "У цьому періоді немає доходу та нових реєстрацій." : "Дані з’являться після надходження статистики."}</p>{activeOnly && <button type="button" onClick={() => setActiveOnly(false)}>Показати всі місяці</button>}</div></td></tr>}</tbody>
        <tfoot><tr><th scope="row"><div className="monthly-total-cell"><strong>Підсумок за період</strong><span>{rows.length} міс.</span></div></th><td>{money(revenueTotal)}</td><td><span className="monthly-missing">—</span></td><td>{registrationTotal}</td><td>—</td></tr></tfoot>
      </table>
    </div>
    <div className="monthly-caption"><span>Показано {display.length} із {rows.length} місяців</span><span>* Розрахунок за поточними тарифами. На користувача = вартість ÷ платні користувачі місяця; це не облік оплат.</span></div>
  </details>;
}
