import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Gamepad2 } from "lucide-react";
import { api } from "@/lib/apiClient";
import { plural } from "@/lib/dashboardInsights";

/** GET /admin/matches-week */
interface WeekReport {
  from: string; to: string; since: string | null;
  total: number; cs2: number; dota2: number;
  finished: number; noScore: number; withOdds: number;
  scoreDelayMin: number | null; lateScores: number;
  days: { day: string; total: number; noScore: number; withOdds: number }[];
}

const dShort = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("uk-UA", { day: "numeric", month: "short", timeZone: "UTC" });
const mins = (m: number) => (m < 60 ? `${m} хв` : `${Math.floor(m / 60)} год${m % 60 ? ` ${m % 60} хв` : ""}`);

/** «Матчі за 7 днів» (phone dashboard): what the parsers collected — total, without a score, with odds, score delay. */
export default function MatchesWeekCard() {
  const [r, setR] = useState<WeekReport | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let live = true;
    api.get<WeekReport>("/admin/matches-week").then((x) => { if (live) setR(x); }).catch(() => { if (live) setErr(true); });
    return () => { live = false; };
  }, []);
  if (err) return null;
  const max = r ? Math.max(1, ...r.days.map((d) => d.total)) : 1;
  const partial = r?.since && r.since > r.from;
  const oddsPct = r && r.total ? Math.round((r.withOdds / r.total) * 100) : 0;
  return (
    <Link to="/matches?tab=parsers" className="v3-wcard v3-mw" aria-label="Матчі за 7 днів — відкрити парсери">
      <div className="v3-mw-h">
        <span className="v3-kpi-l"><span className="v3-kpi-ico"><Gamepad2 size={16} aria-hidden="true" /></span>Матчі за 7 днів</span>
        <ChevronRight size={18} aria-hidden="true" />
      </div>
      {!r ? <div className="v3-mw-skel" aria-hidden="true"><i /><i /><i /><i /></div> : (
        <>
          <div className="v3-mw-grid">
            <div><b>{r.total}</b><small>зібрано · CS2 {r.cs2} · Dota 2 {r.dota2}</small></div>
            <div><b className={r.noScore ? "is-bad" : "is-ok"}>{r.noScore}</b><small>завершені без рахунку{r.finished ? ` з ${r.finished}` : ""}</small></div>
            <div><b>{r.withOdds}<em>{r.total ? ` · ${oddsPct}%` : ""}</em></b><small>з коефіцієнтами</small></div>
            <div><b>{r.scoreDelayMin == null ? "—" : mins(r.scoreDelayMin)}</b><small>{r.lateScores ? `рахунок після завершення · ${r.lateScores} ${plural(r.lateScores, "матч", "матчі", "матчів")}` : "рахунок одразу з завершенням"}</small></div>
          </div>
          <div className="v3-mw-bars" aria-hidden="true">{r.days.map((d) => <span key={d.day} title={`${dShort(d.day)}: ${d.total}`}><i style={{ height: `${Math.round((d.total / max) * 100)}%` }}>{d.withOdds > 0 && <u style={{ height: `${Math.round((d.withOdds / Math.max(1, d.total)) * 100)}%` }} />}</i><small>{new Date(`${d.day}T12:00:00Z`).toLocaleDateString("uk-UA", { weekday: "short", timeZone: "UTC" })}</small></span>)}</div>
          <p className="v3-mw-note">{partial ? `Рахуємо з ${dShort(r.since!)} — тиждень заповниться до ${dShort(new Date(Date.parse(`${r.since}T12:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10))}. ` : ""}Темніша частина стовпчика — матчі з коефіцієнтами.</p>
        </>
      )}
    </Link>
  );
}
