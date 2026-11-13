import { Link } from "react-router-dom";
import { telegramLink, type ChurnedRow } from "@/lib/dashboardInsights";
import UserAvatar from "@/components/UserAvatar";

const MONTHS = ["Січ", "Лют", "Бер", "Кві", "Тра", "Чер", "Лип", "Сер", "Вер", "Жов", "Лис", "Гру"];
const MONTHS_FULL = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
const mIdx = (m: string) => Number(m.slice(5, 7)) - 1;
/** `count` month keys ending one month after `last` (i.e. including the current month). */
function lastMonths(last: string, count: number): string[] {
  const y = Number(last.slice(0, 4)), i = mIdx(last) + 1; // current month = focus + 1
  return Array.from({ length: count }, (_, k) => { const d = new Date(y, i - (count - 1) + k, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });
}

interface Props {
  retained: number;
  churned: number;
  /** ended = not renewed, renewed = renewed (backend naming). */
  byMonth?: { month: string; ended: number; renewed: number }[];
  focusMonth: string; // YYYY-MM shown in the tiles
  list: ChurnedRow[] | null; // null — overview failed to load
}

/** «Утримання» — dark card. Per-month numbers from stats.retention.byMonth, the list from /admin/users. */
export default function RetentionCard({ retained, churned, byMonth, focusMonth, list }: Props) {
  // Always show 6 months (empty ones as «—»), even before the backend has any renewal history.
  const keys = (byMonth && byMonth.length ? byMonth.map((m) => m.month) : lastMonths(focusMonth, 6));
  const months = keys.map((key) => byMonth?.find((m) => m.month === key) || { month: key, ended: 0, renewed: 0 }).map((m) => {
    const total = m.ended + m.renewed;
    return { ...m, total, rate: total ? Math.round((m.renewed / total) * 100) : null };
  });
  const focus = months.find((m) => m.month === focusMonth && m.total > 0);
  // Tiles: the focus month when it has data, otherwise all-time totals.
  const t = focus ? { renewed: focus.renewed, lost: focus.ended, total: focus.total, rate: focus.rate ?? 0, label: MONTHS_FULL[mIdx(focus.month)] }
    : { renewed: retained, lost: churned, total: retained + churned, rate: retained + churned ? Math.round((retained / (retained + churned)) * 100) : 0, label: "за весь час" };
  const withData = months.filter((m) => m.rate !== null);
  const avg = withData.length ? Math.round(withData.reduce((s, m) => s + (m.rate || 0), 0) / withData.length) : null;
  const showBars = months.length > 0;
  const shown = (list || []).slice(0, 3);

  return (
    <section className="v3-dcard v3-ret-card" aria-labelledby="ret-title">
      <div className="v3-card-head">
        <div>
          <h2 id="ret-title" className="v3-h2">Утримання</h2>
          <p className="v3-note v3-hide-mobile"><span className="v3-hide-wide">Хто продовжив підписку після її закінчення</span><span className="v3-only-wide">Хто продовжив підписку</span> · {t.label}</p>
        </div>
        <Link to="/users?status=expired" className="v3-ret-more v3-hide-mobile v3-hide-wide">Деталі →</Link>
        <span className="v3-note v3-only-mobile">{t.label}</span>
      </div>

      <strong className="v3-ret-big v3-only-wide">{t.rate}%</strong>
      <div className="v3-ret-tiles v3-hide-mobile">
        <div className="v3-hide-wide"><span>Утримання</span><strong className="is-blue">{t.rate}%</strong></div>
        <div><span>Продовжили</span><strong>{t.renewed}<small> з {t.total}</small></strong></div>
        <div><span>Відтік</span><strong className={t.lost ? "is-red" : undefined}>{t.lost}</strong></div>
      </div>
      <div className="v3-ret-mobile v3-only-mobile">
        <div>
          <strong>{t.rate}%</strong>
          <span>продовжили {t.renewed} з {t.total} · відтік <b>{t.lost}</b></span>
        </div>
        {showBars && (
          <div className="v3-ret-mini" aria-hidden="true">
            {months.map((m) => <i key={m.month} className={m.month === focus?.month ? "is-on" : undefined} style={{ height: `${Math.max(6, m.rate ?? 0)}%` }} />)}
          </div>
        )}
      </div>

      {showBars && (
        <div className="v3-hide-mobile v3-ret-chart">
          <div className="v3-ret-bars-head v3-hide-wide"><span>Утримання за 6 місяців</span><span>{avg !== null ? `середнє ${avg}%` : "даних за ці місяці ще немає"}</span></div>
          <div className="v3-ret-bars" role="img" aria-label={`Утримання за місяцями: ${months.map((m) => `${MONTHS[mIdx(m.month)]} ${m.rate === null ? "немає даних" : `${m.rate}%`}`).join(", ")}`}>
            {months.map((m) => {
              const on = m.month === focus?.month;
              return (
                <div key={m.month} className="v3-ret-col">
                  <span className={on ? "is-on" : undefined}>{m.rate === null ? "—" : `${m.rate}%`}</span>
                  <div className={`v3-ret-bar${on ? " is-on" : ""}`} style={{ height: m.rate === null ? "4%" : `${Math.max(6, m.rate)}%` }} />
                </div>
              );
            })}
          </div>
          <div className="v3-ret-months">{months.map((m) => <span key={m.month} className={m.month === focus?.month ? "is-on" : undefined}>{MONTHS[mIdx(m.month)]}</span>)}</div>
        </div>
      )}

      {((list && shown.length > 0) || avg !== null) && (
        <div className="v3-ret-side">
          {list && shown.length > 0 && <div className="v3-ret-side-head v3-hide-mobile"><h3 className="v3-ret-sub">Не продовжили</h3><Link to="/users?status=expired" className="v3-ret-more v3-only-wide">Усі →</Link></div>}
          <ul className="v3-ret-list">
            {shown.map(({ user, ended, tenure }) => {
              const tg = telegramLink(user.telegram);
              return (
                <li key={user.id}>
                  <UserAvatar username={user.username} telegram={user.telegram} className="v3-av-dark" />
                  <span className="v3-ret-who">
                    <Link to={`/users?q=${encodeURIComponent(user.username)}`}><strong>@{user.username}</strong></Link>
                    <small><span className="v3-hide-mobile v3-hide-wide">закінчилась {ended}{tenure && ` · ${tenure}`}</span><span className="v3-only-wide">{ended}{tenure && ` · ${tenure.replace(/^з нами (.+)$/, "$1 з нами")}`}</span><span className="v3-only-mobile">не продовжив · {ended}</span></small>
                  </span>
                  {tg && <a href={tg} target="_blank" rel="noreferrer" className="v3-btn-pill v3-btn-pill-dark">Написати</a>}
                </li>
              );
            })}
          </ul>
          {avg !== null && <p className="v3-note v3-ret-avg v3-only-wide">Середнє утримання за 6 місяців — {avg}%.</p>}
        </div>
      )}
    </section>
  );
}
