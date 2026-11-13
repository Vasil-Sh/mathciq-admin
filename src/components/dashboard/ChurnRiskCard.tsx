import { useState } from "react";
import { Link } from "react-router-dom";
import { shortDate } from "@/lib/subscriptions";
import { relDay } from "@/lib/dashboardInsights";
import { idleText, plural, streakText, telegramLink, type RiskRow } from "@/lib/dashboardInsights";
import UserAvatar from "@/components/UserAvatar";

type Tab = "all" | "idle" | "streak";
const LIMIT = 5;
const MOBILE_LIMIT = 3;

/** «Ризик відтоку» — white card, from /admin/users (lastBetDate, lossStreak). */
export default function ChurnRiskCard({ rows, inactiveDays, lossStreak, thresholdsFromSettings }: { rows: RiskRow[]; inactiveDays: number; lossStreak: number; thresholdsFromSettings: boolean }) {
  const [tab, setTab] = useState<Tab>("all");
  const [expanded, setExpanded] = useState(false);
  const idle = rows.filter((r) => r.inactive);
  const streak = rows.filter((r) => r.losing);
  const list = tab === "idle" ? idle : tab === "streak" ? streak : rows;
  const shown = expanded ? list : list.slice(0, LIMIT);
  const tabs: { key: Tab; label: string; short: string; n: number }[] = [
    { key: "all", label: "Усі", short: "Усі", n: rows.length },
    { key: "idle", label: "Неактивні", short: "Неактивні", n: idle.length },
    { key: "streak", label: "Серія програшів", short: "Серія", n: streak.length },
  ];

  const signals = (r: RiskRow) => (
    <>
      {r.losing && tab !== "idle" && <span className="v3-tag v3-tag-red">{streakText(r.streak)}</span>}
      {r.inactive && tab !== "streak" && <span className="v3-tag v3-tag-gray">{idleText(r)}</span>}
    </>
  );

  return (
    <section className="v3-wcard v3-risk-card" aria-labelledby="risk-title">
      <div className="v3-card-head">
        <div>
          <div className="v3-attn-head"><h2 id="risk-title" className="v3-h2">Ризик відтоку</h2>{rows.length > 0 && <span className="v3-tag v3-tag-red v3-only-mobile">{rows.length}</span>}</div>
          <p className="v3-note-dark"><span className="v3-hide-mobile">Платні користувачі, які можуть не продовжити — за даними ставок</span><span className="v3-only-mobile">За даними ставок: неактивні й серії програшів</span></p>
        </div>
        <div className="v3-seg v3-seg-soft" role="group" aria-label="Причина ризику">
          {tabs.map((t) => (
            <button key={t.key} type="button" className={tab === t.key ? "is-on" : ""} aria-pressed={tab === t.key} onClick={() => { setTab(t.key); setExpanded(false); }}>
              <span className="v3-hide-mobile">{t.label}</span><span className="v3-only-mobile">{t.short}</span> <span className="v3-seg-n">{t.n}</span>
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <p className="v3-risk-empty">{rows.length === 0 ? "Зараз ризикових платних користувачів немає." : "У цій категорії нікого немає."}</p>
      ) : (
        <>
          <div key={`t-${tab}`} className="v3-risk-table v3-hide-mobile" role="table" aria-label="Ризик відтоку">
            <div className="v3-risk-row v3-risk-th" role="row"><span role="columnheader">Користувач</span><span role="columnheader">Сигнал</span><span role="columnheader" className="v3-only-wide">Остання ставка</span><span role="columnheader">Підписка</span><span role="columnheader"><span className="sr-only">Дія</span></span></div>
            {shown.map((r) => {
              const tg = telegramLink(r.user.telegram);
              return (
                <div key={r.user.id} className="v3-risk-row" role="row">
                  <span role="cell" className="v3-risk-who"><UserAvatar username={r.user.username} telegram={r.user.telegram} /><Link to={`/users?q=${encodeURIComponent(r.user.username)}`}><strong>@{r.user.username}</strong></Link></span>
                  <span role="cell" className="v3-risk-sig">{signals(r)}</span>
                  <span role="cell" className="v3-risk-end v3-only-wide">{r.user.lastBetDate ? relDay(r.user.lastBetDate) : "ще не ставив"}</span>
                  <span role="cell" className={r.daysLeft <= 7 ? "v3-risk-end is-soon" : "v3-risk-end"}>до {shortDate(r.user.endDate)}</span>
                  <span role="cell">{tg ? <a href={tg} target="_blank" rel="noreferrer" className="v3-btn-pill">Написати</a> : null}</span>
                </div>
              );
            })}
          </div>

          <ul key={`c-${tab}`} className="v3-risk-cards v3-only-mobile">
            {(expanded ? list : list.slice(0, MOBILE_LIMIT)).map((r) => {
              const tg = telegramLink(r.user.telegram);
              return (
                <li key={r.user.id}>
                  <UserAvatar username={r.user.username} telegram={r.user.telegram} />
                  <span className="v3-ret-who"><strong>@{r.user.username}</strong><small className={r.losing && tab !== "idle" ? "is-red" : undefined}>{r.losing && tab !== "idle" ? streakText(r.streak) : idleText(r)} · до {shortDate(r.user.endDate)}</small></span>
                  {tg && <a href={tg} target="_blank" rel="noreferrer" className="v3-btn-pill">Написати</a>}
                </li>
              );
            })}
          </ul>

          {list.length > LIMIT && <button type="button" className="v3-link-btn v3-risk-more v3-hide-mobile" onClick={() => setExpanded((v) => !v)}>{expanded ? "Згорнути" : `Показати всіх ${list.length}`}</button>}
          {list.length > MOBILE_LIMIT && <button type="button" className="v3-btn v3-btn-outline v3-btn-block v3-only-mobile v3-risk-all" onClick={() => setExpanded((v) => !v)}>{expanded ? "Згорнути" : `Усі ${list.length} ${plural(list.length, "користувач", "користувачі", "користувачів")} →`}</button>}
        </>
      )}

      <p className="v3-note-dark v3-risk-foot v3-hide-mobile">Неактивні — {inactiveDays}+ днів без нових ставок. Серія — {lossStreak}+ програшів поспіль.{thresholdsFromSettings && <> Пороги можна змінити в <Link to="/settings" className="v3-inline-link">Налаштуваннях</Link>.</>}</p>
    </section>
  );
}
