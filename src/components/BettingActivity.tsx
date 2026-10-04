import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CircleDollarSign,
  Flame,
  ListChecks,
  TrendingUp,
  Wallet,
  Activity,
} from "lucide-react";
import { fetchUsersOverview } from "@/lib/adminBetsApi";
import type { AdminUserOverview } from "@/types";

const money = (n: number, signed = false) => {
  const sign = signed ? (n > 0 ? "+" : n < 0 ? "−" : "") : "";
  return `${sign}₴${Math.round(Math.abs(n)).toLocaleString("uk-UA")}`;
};

/**
 * Compact betting-activity summary on the dashboard. Pulls the same
 * `/admin/users` data as the "Ставки" screen, so no extra backend work.
 */
export default function BettingActivity() {
  const [users, setUsers] = useState<AdminUserOverview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsersOverview()
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, []);

  const totals = users.reduce(
    (acc, u) => {
      acc.bets += u.betCount;
      acc.staked += u.totalStaked;
      acc.profit += u.totalProfit;
      if (u.betCount > 0) acc.players += 1;
      return acc;
    },
    { bets: 0, staked: 0, profit: 0, players: 0 },
  );

  const tilted = users
    .filter((u) => u.lossStreak >= 3)
    .sort((a, b) => b.lossStreak - a.lossStreak)
    .slice(0, 3);

  return (
    <section className="card-admin betting-activity">
      <header className="betting-activity-heading">
        <span className="detail-panel-icon"><Activity size={19} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="panel-title">Активність ставок</h2>
          <p className="panel-description">Обіг і профіт користувачів за весь час</p>
        </div>
        <Link to="/bets" className="panel-link" aria-label="Переглянути ставки користувачів">
          <ArrowRight size={17} />
        </Link>
      </header>

      {loading ? (
        <div className="betting-activity-loading">Завантаження…</div>
      ) : (
        <>
          <div className="betting-activity-stats">
            <div className="betting-activity-stat">
              <span className="betting-activity-icon"><ListChecks size={16} /></span>
              <div>
                <strong>{totals.bets}</strong>
                <span>ставок</span>
              </div>
            </div>
            <div className="betting-activity-stat">
              <span className="betting-activity-icon"><Wallet size={16} /></span>
              <div>
                <strong>{money(totals.staked)}</strong>
                <span>обіг</span>
              </div>
            </div>
            <div className="betting-activity-stat">
              <span className={`betting-activity-icon ${totals.profit >= 0 ? "is-positive" : "is-negative"}`}>
                <TrendingUp size={16} />
              </span>
              <div>
                <strong className={totals.profit >= 0 ? "text-success" : "text-danger"}>
                  {money(totals.profit, true)}
                </strong>
                <span>профіт</span>
              </div>
            </div>
            <div className="betting-activity-stat">
              <span className="betting-activity-icon"><CircleDollarSign size={16} /></span>
              <div>
                <strong>{totals.players}</strong>
                <span>грають</span>
              </div>
            </div>
          </div>

          {tilted.length > 0 ? (
            <div className="betting-activity-tilt">
              <div className="betting-activity-tilt-title">
                <Flame size={14} />
                Серії програшів
              </div>
              <ul>
                {tilted.map((u) => (
                  <li key={u.id}>
                    <span className="betting-activity-avatar">{u.username.charAt(0).toUpperCase()}</span>
                    <span className="betting-activity-name">{u.username}</span>
                    <span className="betting-activity-streak">{u.lossStreak}L</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="betting-activity-empty">
              Усі гравці в нормі — серійних програшів немає.
            </div>
          )}
        </>
      )}

      <Link to="/bets" className="panel-footer-link">
        Детальніше про ставки
        <ArrowRight size={14} />
      </Link>
    </section>
  );
}
