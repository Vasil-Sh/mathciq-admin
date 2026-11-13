import { Link } from "react-router-dom";
import { initials, telegramLink, type ChurnedRow } from "@/lib/dashboardInsights";

const MONTHS = ["Січ", "Лют", "Бер", "Кві", "Тра", "Чер", "Лип", "Сер", "Вер", "Жов", "Лис", "Гру"];
const MONTHS_FULL = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
const mIdx = (m: string) => Number(m.slice(5, 7)) - 1;

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
  const months = (byMonth || []).map((m) => {
    const total = m.ended + m.renewed;
    return { ...m, total, rate: total ? Math.round((m.renewed / total) * 100) : null };
  });
  const focus = months.find((m) => m.month === focusMonth && m.total > 0);
  // Tiles: the focus month when it has data, otherwise all-time totals.
  const t = focus ? { renewed: focus.renewed, lost: focus.ended, total: focus.total, rate: focus.rate ?? 0, label: MONTHS_FULL[mIdx(focus.month)] }
    : { renewed: retained, lost: churned, total: retained + churned, rate: retained + churned ? Math.round((retained / (retained + churned)) * 100) : 0, label: "за весь час" };
  const withData = months.filter((m) => m.rate !== null);
  const avg = withData.length ? Math.round(withData.reduce((s, m) => s + (m.rate || 0), 0) / withData.length) : null;
  const showBars = withData.length > 0;
  const shown = (list || []).slice(0, 3);

  return (
    <section className="v3-dcard v3-ret-card" aria-labelledby="ret-title">
      <div className="v3-card-head">
        <div>
          <h2 id="ret-title" className="v3-h2">Утримання</h2>
          <p className="v3-note v3-hide-mobile">Хто продовжив підписку після її закінчення · {t.label}</p>
        </div>
        <Link to="/users?status=expired" className="v3-ret-more v3-hide-mobile">Деталі →</Link>
        <span className="v3-note v3-only-mobile">{t.label}</span>
      </div>

      <div className="v3-ret-tiles v3-hide-mobile">
        <div><span>Утримання</span><strong className="is-blue">{t.rate}%</strong></div>
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
        <div className="v3-hide-mobile">
          <div className="v3-ret-bars-head"><span>Утримання за 6 місяців</span>{avg !== null && <span>середнє {avg}%</span>}</div>
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

      {list && shown.length > 0 && (
        <div>
          <h3 className="v3-ret-sub v3-hide-mobile">Не продовжили</h3>
          <ul className="v3-ret-list">
            {shown.map(({ user, ended, tenure }) => {
              const tg = telegramLink(user.telegram);
              return (
                <li key={user.id}>
                  <span className="v3-av v3-av-dark" aria-hidden="true">{initials(user.username)}</span>
                  <span className="v3-ret-who">
                    <Link to={`/users?q=${encodeURIComponent(user.username)}`}><strong>@{user.username}</strong></Link>
                    <small><span className="v3-hide-mobile">закінчилась {ended}{tenure && ` · ${tenure}`}</span><span className="v3-only-mobile">не продовжив · {ended}</span></small>
                  </span>
                  {tg && <a href={tg} target="_blank" rel="noreferrer" className="v3-btn-pill v3-btn-pill-dark">Написати</a>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
