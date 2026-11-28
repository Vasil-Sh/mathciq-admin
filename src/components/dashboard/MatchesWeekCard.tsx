import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Gamepad2 } from "lucide-react";
import { api } from "@/lib/apiClient";
import { useMedia } from "@/hooks/useMediaOnline";
import { MatchesDayDialog } from "@/components/dashboard/WebDialogs";
import { plural } from "@/lib/dashboardInsights";

/** GET /admin/matches-week */
interface WeekReport {
  from: string; to: string; since: string | null;
  total: number; cs2: number; dota2: number;
  finished: number; noScore: number; withOdds: number;
  scoreDelayMin: number | null; lateScores: number;
  days: { day: string; total: number; noScore: number; withOdds: number }[];
  bySource?: { source: string; n: number }[];
}

const SOURCE: Record<string, string> = { liquipedia: "Liquipedia", liquipedia_page: "сторінки турнірів", pandascore: "PandaScore", cito: "Cito", oddspapi: "OddsPapi", manual: "вручну", other: "інше" };

const dShort = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("uk-UA", { day: "numeric", month: "short", timeZone: "UTC" });
const mins = (m: number) => (m < 60 ? `${m} хв` : `${Math.floor(m / 60)} год${m % 60 ? ` ${m % 60} хв` : ""}`);

/** «Матчі за 7 днів» (phone dashboard): what the parsers collected — total, without a score, with odds, score delay. */
export default function MatchesWeekCard() {
  const [r, setR] = useState<WeekReport | null>(null);
  const [err, setErr] = useState(false);
  const web = useMedia("(min-width: 768px)");
  const [day, setDay] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    api.get<WeekReport>("/admin/matches-week").then((x) => { if (live) { if (Array.isArray(x?.days)) setR(x); else setErr(true); } }).catch(() => { if (live) setErr(true); });
    return () => { live = false; };
  }, []);
  if (err) return null;
  const max = r ? Math.max(1, ...r.days.map((d) => d.total)) : 1;
  const partial = r?.since && r.since > r.from;
  const oddsPct = r && r.total ? Math.round((r.withOdds / r.total) * 100) : 0;
  return (
    <Wrap web={web}>
      <div className="v3-mw-h">
        <span className="v3-kpi-l"><span className="v3-kpi-ico"><Gamepad2 size={16} aria-hidden="true" /></span>Матчі за 7 днів</span>
        <Link to="/matches?tab=parsers" className="v3-mw-go" aria-label="Відкрити парсери"><ChevronRight size={18} aria-hidden="true" /></Link>
      </div>
      {!r ? <div className="v3-mw-skel" aria-hidden="true"><i /><i /><i /><i /></div> : (
        <>
          <div className="v3-mw-grid">
            <div><b>{r.total}</b><small>зібрано · CS2 {r.cs2} · Dota 2 {r.dota2}</small></div>
            <div><b className={r.noScore ? "is-bad" : "is-ok"}>{r.noScore}</b><small>завершені без рахунку{r.finished ? ` з ${r.finished}` : ""}</small></div>
            <div><b>{r.withOdds}<em>{r.total ? ` · ${oddsPct}%` : ""}</em></b><small>з коефіцієнтами</small></div>
            <div><b>{r.scoreDelayMin == null ? "—" : mins(r.scoreDelayMin)}</b><small>{r.lateScores ? `рахунок після завершення · ${r.lateScores} ${plural(r.lateScores, "матч", "матчі", "матчів")}` : "рахунок одразу з завершенням"}</small></div>
          </div>
          <div className="v3-mw-bars" role="group" aria-label="Матчі за днями — оберіть день">{r.days.map((d) => { const pick = () => setDay(web ? d.day : day === d.day ? null : d.day); return <span key={d.day} title={`${dShort(d.day)}: ${d.total}`} className={!web && day === d.day ? "is-sel" : day && !web ? "is-dim" : undefined} role="button" tabIndex={0} aria-pressed={web ? undefined : day === d.day} aria-label={`${dShort(d.day)}: ${d.total} матчів`} onClick={pick} onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } }}><i style={{ height: `${Math.round((d.total / max) * 100)}%` }}>{d.withOdds > 0 && <u style={{ height: `${Math.round((d.withOdds / Math.max(1, d.total)) * 100)}%` }} />}</i><small>{new Date(`${d.day}T12:00:00Z`).toLocaleDateString("uk-UA", { weekday: "short", timeZone: "UTC" })}</small></span>; })}</div>
          {!web && day && (() => { const d = r.days.find((x) => x.day === day); if (!d) return null; const pct = d.total ? Math.round((d.withOdds / d.total) * 100) : 0; return (
            <div className="v3-mw-day" aria-live="polite"><b>{new Date(`${d.day}T12:00:00Z`).toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}</b>
              <ul><li><span>Зібрано</span><b>{d.total} {plural(d.total, "матч", "матчі", "матчів")}</b></li><li><span>Без рахунку</span><b className={d.noScore ? "is-bad" : "is-ok"}>{d.noScore}</b></li><li><span>З коефіцієнтами</span><b>{d.withOdds}{d.total ? ` · ${pct}%` : ""}</b></li></ul></div>
          ); })()}
          {!!r.bySource?.length && <div className="v3-mw-src"><small>Звідки матчі</small><ul>{r.bySource.map((x) => <li key={x.source}><span>{SOURCE[x.source] || x.source}</span><b>{x.n}</b></li>)}</ul></div>}
          <p className="v3-mw-note">{partial ? `Рахуємо з ${dShort(r.since!)} — тиждень заповниться до ${dShort(new Date(Date.parse(`${r.since}T12:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10))}. ` : ""}Темніша частина стовпчика — матчі з коефіцієнтами.</p>
        </>
      )}
      {web && r && <MatchesDayDialog open={!!day} onOpenChange={(o) => { if (!o) setDay(null); }} day={r.days.find((d) => d.day === day) || null} bySource={r.bySource} sourceName={(s) => SOURCE[s] || s} since={r.since} />}
    </Wrap>
  );
}

/** a card: its bars show a day (phone: under the bars, web: a dialog), the arrow opens the parsers */
function Wrap({ children }: { web: boolean; children: React.ReactNode }) {
  return <section className="v3-wcard v3-mw" aria-label="Матчі за 7 днів">{children}</section>;
}
