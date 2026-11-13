import { Link } from "react-router-dom";
import { initials, telegramLink, type ChurnedRow } from "@/lib/dashboardInsights";

interface Props {
  retained: number;
  churned: number;
  list: ChurnedRow[] | null; // null — overview failed to load
}

/** «Утримання» — dark card. Totals from /admin/stats, the list from /admin/users. */
export default function RetentionCard({ retained, churned, list }: Props) {
  const total = retained + churned;
  const rate = total ? Math.round((retained / total) * 100) : 0;
  const shown = (list || []).slice(0, 3);
  return (
    <section className="v3-dcard v3-ret-card" aria-labelledby="ret-title">
      <div className="v3-card-head">
        <div>
          <h2 id="ret-title" className="v3-h2">Утримання</h2>
          <p className="v3-note v3-hide-mobile">Хто продовжив підписку після її закінчення · за весь час</p>
        </div>
        <Link to="/users?status=expired" className="v3-ret-more v3-hide-mobile">Деталі →</Link>
        <span className="v3-note v3-only-mobile">за весь час</span>
      </div>

      <div className="v3-ret-tiles v3-hide-mobile">
        <div><span>Утримання</span><strong className="is-blue">{rate}%</strong></div>
        <div><span>Продовжили</span><strong>{retained}<small> з {total}</small></strong></div>
        <div><span>Відтік</span><strong className={churned ? "is-red" : undefined}>{churned}</strong></div>
      </div>
      <div className="v3-ret-mobile v3-only-mobile">
        <strong>{rate}%</strong>
        <span>продовжили {retained} з {total} · відтік <b>{churned}</b></span>
      </div>

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
