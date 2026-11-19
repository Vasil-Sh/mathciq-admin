import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, Check, ExternalLink, Lock, Plus, RefreshCw, Search, Shield, WifiOff, X } from "lucide-react";
import { toast } from "sonner";
import PillTrack from "@/components/PillTrack";
import RollingNumber from "@/components/RollingNumber";
import UserAvatar from "@/components/UserAvatar";
import { Dropdown } from "@/components/ui/dropdown";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useMedia, useOnline } from "@/hooks/useMediaOnline";
import { fetchUserBets, fetchUsersOverview } from "@/lib/adminBetsApi";
import { fetchFeeds, fetchHistory, rerunParser } from "@/lib/adminMatchesApi";
import { fetchParsers, PARSER_NAMES, plural, type ParserState } from "@/lib/dashboardInsights";
import {
  addDays, ago, betMatches, dayShort, GAME_LABEL, initials, isFallbackLogo, kyivDay, manualGroups, STATUS_LABEL, teamsFrom,
  type Game, type ManualGroup, type Match, type MStatus, type Team,
} from "@/lib/matchesModel";
import type { AdminUserBet } from "@/types";

type Tab = "matches" | "parsers" | "manual" | "teams";
type Day = "today" | "tomorrow" | "week";
type UBet = AdminUserBet & { username: string; telegram?: string | null };

const TABS: { key: Tab; label: string }[] = [
  { key: "matches", label: "Матчі" }, { key: "parsers", label: "Парсери" }, { key: "manual", label: "Додані вручну" }, { key: "teams", label: "Команди" },
];
const ST_CLS: Record<MStatus, string> = { plan: "v3-tag-blue", live: "v3-tag-red", done: "v3-tag-gray" };
const PARSER_META: Record<string, { ini: string; color: string; site: string; game: string; feed: Game | "hltv" }> = {
  hltv_scraper: { ini: "HL", color: "#2450c4", site: "hltv.org", game: "CS2", feed: "hltv" },
  tipsgg_fetch_cs2_matches: { ini: "TI", color: "#7a4fd0", site: "tips.gg", game: "CS2", feed: "cs2" },
  tipsgg_fetch_dota2_matches: { ini: "TI", color: "#c2410c", site: "tips.gg", game: "Dota 2", feed: "dota2" },
};
/** Що бекенд ще не вміє — дії неактивні, пояснення в підказці й у картці. */
const NO_API = "Потрібен ендпоінт на бекенді — поки що дані лише з парсерів";
const hhmm = () => new Date().toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
const resLabel = (r: string) => (r === "Win" ? ["Виграш", "v3-tag-green"] : r === "Loss" ? ["Програш", "v3-tag-red"] : ["Очікує", "v3-tag-amber"]);

function Logo({ src, name, size = 24 }: { src: string | null; name: string; size?: number }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) return <span className="v3-mx-lg is-ini" style={{ width: size, height: size }} aria-hidden="true">{initials(name)}</span>;
  return <img className="v3-mx-lg" src={src} alt="" width={size} height={size} loading="lazy" onError={() => setBad(true)} />;
}
function Teams({ m }: { m: Pick<Match, "t1" | "t2" | "logo1" | "logo2"> }) {
  return <span className="v3-mx-teams"><span><Logo src={m.logo1} name={m.t1} /><strong>{m.t1}</strong></span><span><Logo src={m.logo2} name={m.t2} /><strong>{m.t2}</strong></span></span>;
}
function Score({ m }: { m: Match }) {
  const has = m.s1 != null && m.s2 != null && (m.status !== "plan" || (m.s1 || 0) + (m.s2 || 0) > 0);
  return <span className="v3-mx-score" aria-label={has ? `Рахунок ${m.s1}:${m.s2}` : "Рахунку ще немає"}><b>{has ? m.s1 : "—"}</b><b>{has ? m.s2 : "—"}</b></span>;
}
function StatusTag({ s }: { s: MStatus }) {
  return <span className={`v3-tag ${ST_CLS[s]}${s === "live" ? " v3-mx-live" : ""}`}>{s === "live" && <i aria-hidden="true" />}{STATUS_LABEL[s]}</span>;
}

export default function Matches() {
  const wide = useMedia("(min-width: 1180px)");
  const online = useOnline();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => { const t = params.get("tab"); return t === "parsers" || t === "manual" || t === "teams" ? t : "matches"; });
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [failed, setFailed] = useState<Game[]>([]);
  const [history, setHistory] = useState<Match[]>([]);
  const [parsers, setParsers] = useState<ParserState[] | null>(null);
  const [bets, setBets] = useState<UBet[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");
  const [rk, setRk] = useState(0);
  // Матчі
  const [q, setQ] = useState("");
  const [day, setDay] = useState<Day>("today");
  const [game, setGame] = useState<"all" | Game>("all");
  const [st, setSt] = useState<"all" | MStatus>("all");
  const [selId, setSelId] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [shown, setShown] = useState(12);
  // Парсери
  const [running, setRunning] = useState<Record<string, "busy" | "done">>({});
  // Додані вручну
  const [selGroup, setSelGroup] = useState<string | null>(null);
  // Команди
  const [tq, setTq] = useState("");
  const [tf, setTf] = useState<"all" | "dup" | "logo">("all");
  const [selTeam, setSelTeam] = useState<string | null>(null);

  const load = useCallback(async (opts: { force?: boolean } = {}) => {
    try {
      const [feeds, ps] = await Promise.all([fetchFeeds(opts.force), fetchParsers().catch(() => null)]);
      setMatches(feeds.matches); setFailed(feeds.failed); if (ps) setParsers(ps);
      setError(""); setUpdatedAt(hhmm());
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося завантажити матчі");
      return false;
    }
  }, []);

  useEffect(() => { load(); fetchHistory(30).then(setHistory).catch(() => {}); }, [load]);
  // Телефон: рядок вкладок гортається до активної
  useEffect(() => { document.querySelector(".v3-mx-tabs .is-on")?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" }); }, [tab]);

  // Ставки користувачів (у фоні): записи на матч і матчі, введені вручну
  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const users = (await fetchUsersOverview()).filter((u) => (u.betCount || 0) > 0)
          .sort((a, b) => String(b.lastBetDate || "").localeCompare(String(a.lastBetDate || ""))).slice(0, 60);
        const out: UBet[] = [];
        for (let i = 0; i < users.length; i += 4) {
          const part = await Promise.all(users.slice(i, i + 4).map((u) => fetchUserBets(u.id).then((bs) => bs.map((b) => ({ ...b, username: u.username, telegram: u.telegram }))).catch(() => [] as UBet[])));
          part.forEach((p) => out.push(...p));
          if (off) return;
        }
        if (!off) setBets(out);
      } catch { if (!off) setBets([]); }
    })();
    return () => { off = true; };
  }, []);

  const today = kyivDay();
  const all = matches || [];
  const recent = useMemo(() => { const from = addDays(today, -14); return (bets || []).filter((b) => String(b.date).slice(0, 10) >= from); }, [bets, today]);
  const betsFor = useCallback((m: Match) => recent.filter((b) => betMatches(b, m)), [recent]);
  const known = useMemo(() => [...all, ...history], [all, history]);
  const groups = useMemo(() => (bets ? manualGroups(recent, known) : []), [bets, recent, known]);
  const teams = useMemo(() => teamsFrom(known), [known]);

  const todayM = all.filter((m) => m.day === today);
  const liveN = all.filter((m) => m.status === "live").length;
  const down = (parsers || []).filter((p) => p.open);
  const todayBets = bets ? todayM.reduce((a, m) => a + betsFor(m).length, 0) : null;

  // ── Матчі: фільтри ──
  const inDay = (m: Match, d: Day) => (d === "today" ? m.day === today : d === "tomorrow" ? m.day === addDays(today, 1) : m.day >= today && m.day <= addDays(today, 6));
  const needle = q.trim().toLowerCase();
  const list = all.filter((m) => inDay(m, day) && (game === "all" || m.game === game) && (st === "all" || m.status === st)
    && (!needle || `${m.t1} ${m.t2} ${m.tournament}`.toLowerCase().includes(needle)));
  const dayN = (d: Day) => all.filter((m) => inDay(m, d) && (game === "all" || m.game === game)).length;
  const sel = list.find((m) => m.id === selId) || (wide ? list[0] : undefined) || null;

  const refresh = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await load({ force: true });
    setBusy(false);
    if (ok) { setDone(true); setRk((x) => x + 1); window.setTimeout(() => setDone(false), 1400); toast.success("Дані оновлено", { description: `Станом на ${hhmm()}` }); }
    else toast.error("Не вдалося оновити", { description: "Показуємо останні отримані дані" });
  };

  const rerun = async (name: string) => {
    if (running[name] === "busy") return;
    setRunning((r) => ({ ...r, [name]: "busy" }));
    try {
      await rerunParser(name);
      await load();
      setRunning((r) => ({ ...r, [name]: "done" }));
      toast.success(`${PARSER_NAMES[name] || name}: запуск`, { description: "Запобіжник скинуто — наступний запит до джерела піде одразу" });
      window.setTimeout(() => setRunning((r) => { const n = { ...r }; delete n[name]; return n; }), 1800);
    } catch (e) {
      setRunning((r) => { const n = { ...r }; delete n[name]; return n; });
      toast.error("Не вдалося запустити", { description: e instanceof Error ? e.message : "Сервер не відповів" });
    }
  };

  const sums = [
    { k: "today", label: "Матчів сьогодні", v: matches ? String(todayM.length) : "—", n: matches ? `CS2 ${todayM.filter((m) => m.game === "cs2").length} · Dota 2 ${todayM.filter((m) => m.game === "dota2").length} · наживо ${liveN}` : "…", go: () => { setTab("matches"); setDay("today"); setSt("all"); }, on: tab === "matches" },
    { k: "parsers", label: "Парсери", v: parsers ? (down.length ? `${down.length} ${plural(down.length, "помилка", "помилки", "помилок")}` : "Працюють") : "—", n: parsers ? (down.length ? down.map((p) => `${PARSER_NAMES[p.name] || p.name} не відповідає`).join(" · ") : `${parsers.reduce((a, p) => a + p.failures24h, 0)} збоїв за 24 год`) : "…", bad: down.length > 0, go: () => setTab("parsers"), on: tab === "parsers" },
    { k: "bets", label: "Записів на сьогодні", v: todayBets == null ? "…" : String(todayBets), n: todayBets == null ? "рахуємо зі ставок користувачів" : `на ${todayM.length} ${plural(todayM.length, "матч", "матчі", "матчів")} сьогодні`, go: undefined, on: false },
    { k: "manual", label: "Додані вручну", v: bets ? String(groups.length) : "…", n: bets ? (groups.length ? "немає в стрічках парсерів" : "усі записи на своїх матчах") : "шукаємо в записах", amber: groups.length > 0, go: () => setTab("manual"), on: tab === "manual" },
  ];
  const tabN: Record<Tab, number | null> = { matches: matches ? todayM.length : null, parsers: parsers ? down.length || parsers.length : null, manual: bets ? groups.length : null, teams: teams.length || null };

  // ── Деталі матчу (бічна панель / шторка) ──
  const detail = (m: Match) => {
    const bs = betsFor(m);
    return (
      <div className="v3-mx-detail">
        <div className="v3-mx-dh"><span>{[m.tournament || "Турнір не вказано", GAME_LABEL[m.game], m.bo].filter(Boolean).join(" · ")}</span><StatusTag s={m.status} /></div>
        <h2>{m.t1} vs {m.t2}</h2>
        <div className="v3-mx-kv">
          <div><span>Початок</span><strong>{dayShort(m.day)} · {m.time}</strong></div>
          <div><span>Рахунок</span><strong>{m.s1 != null && m.s2 != null && m.status !== "plan" ? `${m.s1} : ${m.s2}` : "—"}</strong></div>
          <div><span>Джерело</span><strong>{m.link ? <a href={m.link} target="_blank" rel="noreferrer" className="v3-mx-src">{m.source}<ExternalLink size={13} aria-hidden="true" /></a> : m.source}</strong></div>
          <div><span>Записів</span><strong>{bets ? bs.length : "…"}</strong></div>
        </div>
        {bs.length > 0 && (
          <div className="v3-mx-recs">
            {bs.slice(0, 6).map((b) => { const [l, c] = resLabel(b.result); return <div key={b.id} className="v3-mx-rec"><UserAvatar username={b.username} telegram={b.telegram} /><span><strong>@{b.username}</strong><small>{b.betType} · {b.odds}</small></span><span className={`v3-tag ${c}`}>{l}</span></div>; })}
            {bs.length > 6 && <span className="v3-mx-more">і ще {bs.length - 6}</span>}
          </div>
        )}
        <fieldset className="v3-mx-edit" disabled>
          <legend><Lock size={13} aria-hidden="true" />Ручні правки</legend>
          <div className="v3-mx-segd" aria-hidden="true">{(["Заплановано", "Перенесено", "Скасовано", "Завершено"]).map((s) => <span key={s} className={s === "Заплановано" && m.status === "plan" || s === "Завершено" && m.status === "done" ? "is-on" : ""}>{s}</span>)}</div>
          <p>Перенести, скасувати чи виправити рахунок можна буде, щойно бекенд отримає ендпоінт для ручних правок матчу. Зараз час, статус і рахунок приходять лише з {m.source}.</p>
        </fieldset>
      </div>
    );
  };

  const empty = (title: string, text: string, icon?: ReactNode) => <div className="v3-pay-empty">{icon && <span className="v3-empty-ic v3-float" aria-hidden="true">{icon}</span>}<strong>{title}</strong><span>{text}</span></div>;
  const skelRows = (n: number) => Array.from({ length: n }, (_, i) => <div key={i} className="v3-pay-row v3-mx-row is-skel" aria-hidden="true"><span className="v3-skel v3-skel-light" /><span className="v3-skel v3-skel-light" style={{ width: "70%" }} /><span className="v3-skel v3-skel-light" /><span className="v3-skel v3-skel-light" /><span className="v3-skel v3-skel-light" style={{ height: 22, borderRadius: 999 }} /><span className="v3-skel v3-skel-light" /><span className="v3-skel v3-skel-light" /></div>);
  const dayOpts = [{ key: "today" as Day, label: "Сьогодні" }, { key: "tomorrow" as Day, label: "Завтра" }, { key: "week" as Day, label: "Тиждень" }];
  const gameOpts = [{ value: "all" as const, label: "CS2 і Dota 2" }, { value: "cs2" as const, label: "CS2" }, { value: "dota2" as const, label: "Dota 2" }];
  const stOpts = [{ value: "all" as const, label: "Усі статуси" }, ...(["plan", "live", "done"] as MStatus[]).map((s) => ({ value: s, label: `${STATUS_LABEL[s]} · ${all.filter((m) => inDay(m, day) && m.status === s).length}` }))];
  const noMatchesText = needle ? `За «${q.trim()}» матчів немає.` : day === "today" ? "На сьогодні в стрічках матчів немає." : "У стрічках поки немає матчів на ці дні.";

  const matchesTab = wide ? (
    <section className="v3-pay-main">
      <div className="v3-wcard v3-pay-list" aria-busy={matches === null}>
        <div className="v3-pay-tools">
          <label className="v3-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Пошук матчів" placeholder="Команда або турнір" value={q} onChange={(e) => { setQ(e.target.value); setRk((x) => x + 1); }} />{q && <button type="button" onClick={() => setQ("")} aria-label="Очистити пошук"><X size={14} /></button>}</label>
          <div className="v3-seg v3-seg-soft" role="group" aria-label="День">
            <PillTrack active={day} />
            {dayOpts.map((d) => <button key={d.key} type="button" className={day === d.key ? "is-on" : ""} aria-pressed={day === d.key} onClick={() => { setDay(d.key); setRk((x) => x + 1); }}>{d.label} <span className="v3-seg-n">{dayN(d.key)}</span></button>)}
          </div>
          <Dropdown className="is-light" ariaLabel="Гра" value={game} onChange={(v) => { setGame(v); setRk((x) => x + 1); }} options={gameOpts} />
          <Dropdown className="is-light" ariaLabel="Статус" value={st} onChange={(v) => { setSt(v); setRk((x) => x + 1); }} options={stOpts} />
        </div>
        <div className="v3-pay-th v3-mx-row" role="row"><span>Час</span><span>Матч</span><span /><span>Турнір</span><span>Статус</span><span>Джерело</span><span className="v3-pay-r">Записів</span></div>
        {matches === null ? skelRows(6) : list.length ? <div className={`v3-pay-rows ${rk % 2 ? "a" : "b"}`}>{list.map((m, i) => {
          const on = sel?.id === m.id;
          return (
            <button key={m.id} type="button" className={`v3-pay-row v3-mx-row${on ? " is-sel" : ""}`} style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }} aria-pressed={on} onClick={() => setSelId(m.id)}>
              <span className="v3-mx-time">{day === "today" ? m.time : <>{m.time}<small>{dayShort(m.day)}</small></>}</span>
              <Teams m={m} />
              <Score m={m} />
              <span className="v3-mx-tour"><strong>{m.tournament || "—"}</strong><small>{[GAME_LABEL[m.game], m.bo].filter(Boolean).join(" · ")}</small></span>
              <span><StatusTag s={m.status} /></span>
              <span className="v3-pay-by">{m.source}</span>
              <span className="v3-pay-r v3-mx-n">{bets ? betsFor(m).length : "…"}</span>
            </button>
          );
        })}</div> : empty("Матчів немає", noMatchesText)}
        {matches !== null && <div className="v3-pay-foot"><span>Показано <b>{list.length}</b> із <b>{all.length}</b>{updatedAt && <> · оновлено о {updatedAt}</>}</span><span>Час — київський</span></div>}
      </div>
      <aside className="v3-dcard v3-pay-aside">{sel ? detail(sel) : <div className="v3-pay-empty is-dark"><span>Оберіть матч, щоб побачити деталі.</span></div>}</aside>
    </section>
  ) : (
    <div className="v3-pay-m">
      <label className="v3-msearch"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Пошук матчів" placeholder="Команда або турнір" value={q} onChange={(e) => { setQ(e.target.value); setRk((x) => x + 1); }} />{q && <button type="button" onClick={() => setQ("")} aria-label="Очистити пошук"><X size={14} /></button>}</label>
      <div className="v3-pay-mf">
        <Dropdown className="v3-mselect-dd" ariaLabel="День" value={day} onChange={(v) => { setDay(v); setShown(12); setRk((x) => x + 1); }} options={dayOpts.map((d) => ({ value: d.key, label: `${d.label} · ${dayN(d.key)}` }))} />
        <Dropdown className="v3-mselect-dd" ariaLabel="Статус" value={st} onChange={(v) => { setSt(v); setRk((x) => x + 1); }} options={stOpts} />
      </div>
      <ul className={`v3-pay-mlist v3-mx-mlist ${rk % 2 ? "a" : "b"}`}>
        {matches === null ? Array.from({ length: 5 }, (_, i) => <li key={i} className="v3-pay-mcard is-skel" aria-hidden="true"><span className="v3-skel v3-skel-light" style={{ width: "55%" }} /><span className="v3-skel v3-skel-light" style={{ width: 60 }} /></li>)
          : list.length ? list.slice(0, shown).map((m, i) => (
            <li key={m.id} style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}><button type="button" className="v3-pay-mcard v3-mx-mcard" onClick={() => { setSelId(m.id); setSheet(true); }}>
              <span className="v3-mx-mcard-l"><Teams m={m} /><small>{day === "today" ? m.time : `${dayShort(m.day)} · ${m.time}`} · {m.tournament || GAME_LABEL[m.game]}{bets && betsFor(m).length ? ` · ${betsFor(m).length} ${plural(betsFor(m).length, "запис", "записи", "записів")}` : ""}</small></span>
              <span className="v3-mx-mcard-r"><Score m={m} /><StatusTag s={m.status} /></span>
            </button></li>
          )) : <li className="v3-wcard v3-pay-mnone">{empty("Матчів немає", noMatchesText)}</li>}
      </ul>
      {list.length > shown && <button type="button" className="v3-btn v3-btn-ghost-dark v3-btn-block" onClick={() => setShown(shown + 12)}>Показати ще {Math.min(12, list.length - shown)}</button>}
    </div>
  );

  // ── Парсери ──
  const parsersTab = (
    <section className="v3-mx-parsers">
      {parsers === null ? Array.from({ length: 2 }, (_, i) => <div key={i} className="v3-wcard v3-mx-pcard is-skel" aria-hidden="true"><span className="v3-skel v3-skel-light" style={{ width: "40%" }} /><span className="v3-skel v3-skel-light" /><span className="v3-skel v3-skel-light" style={{ width: "70%" }} /></div>)
        : parsers.map((p, i) => {
          const meta = PARSER_META[p.name] || { ini: initials(p.name), color: "#5f6878", site: p.name, game: "", feed: "cs2" as const };
          const cnt = meta.feed === "hltv" ? todayM.filter((m) => m.source === "HLTV").length : todayM.filter((m) => m.game === meta.feed && m.source === "tips.gg").length;
          const r = running[p.name];
          return (
            <div key={p.name} className={`v3-wcard v3-mx-pcard${p.open ? " is-err" : ""}`} style={{ animationDelay: `${i * 60}ms` }}>
              <div className="v3-mx-ph">
                <span className="v3-mx-pav" style={{ background: meta.color }}>{meta.ini}</span>
                <span><strong>{PARSER_NAMES[p.name] || p.name}</strong><small>{meta.site}{meta.game && ` · ${meta.game}`}</small></span>
                <span key={String(p.open)} className={`v3-tag v3-mx-flip ${p.open ? "v3-tag-red" : "v3-tag-green"}`}><i className={`v3-mx-dot${p.open ? " is-pulse" : ""}`} aria-hidden="true" />{p.open ? "Помилка" : "Працює"}</span>
              </div>
              <div className="v3-mx-pkv">
                <div><span>Останній збій</span><strong className={p.open ? "is-bad" : ""}>{p.lastFailure ? ago(p.lastFailure) : "не було"}</strong></div>
                <div><span>Збоїв за 24 год</span><strong>{p.failures24h}</strong></div>
                <div><span>Матчів сьогодні</span><strong>{matches ? cnt : "…"}</strong></div>
              </div>
              <p className="v3-mx-pnote">{p.open ? `Запобіжник спрацював після ${p.failures} ${plural(p.failures, "невдалої спроби", "невдалих спроб", "невдалих спроб")} — застосунок показує останні отримані дані. «Запустити зараз» скидає його, і наступний запит піде одразу.` : "Дані оновлюються автоматично. Якщо джерело мовчатиме, тут з’явиться помилка, а в меню — позначка «!»."}</p>
              <div className="v3-mx-pacts">
                <button type="button" className={`v3-btn ${p.open ? "v3-btn-primary" : "v3-btn-dark"}${r === "busy" ? " is-busy" : ""}`} disabled={!online || r === "busy"} onClick={() => rerun(p.name)}>
                  {r === "busy" ? <span className="v3-mx-spin" aria-hidden="true" /> : r === "done" ? <Check size={15} aria-hidden="true" className="v3-mx-ok" /> : <RefreshCw size={15} aria-hidden="true" />}
                  {r === "busy" ? "Запускаємо…" : r === "done" ? "Запущено" : "Запустити зараз"}
                </button>
              </div>
            </div>
          );
        })}
      <div className="v3-dcard v3-mx-pfoot"><Shield size={18} aria-hidden="true" /><span>Якщо парсер не відповідає, у меню біля «Матчі» з’являється «!», а на дашборді — пункт у «Потребує уваги». Поки джерело не працює, у застосунку видно останні дані з позначкою часу.</span></div>
    </section>
  );

  // ── Додані вручну ──
  const g = groups.find((x) => x.key === selGroup) || (wide ? groups[0] : undefined) || null;
  const groupDetail = (x: ManualGroup) => (
    <div className="v3-mx-detail">
      <div className="v3-mx-dh"><span>ВРУЧНУ · {x.bets.length} {plural(x.bets.length, "запис", "записи", "записів")}</span><span className={`v3-tag ${x.official ? "v3-tag-amber" : "v3-tag-gray"}`}>{x.official ? "Чекає" : "Без пари"}</span></div>
      <div className="v3-mx-cmp">
        <div className="is-dark"><small>Як ввів користувач</small><strong>{x.t1} vs {x.t2}</strong><span>{dayShort(x.day)} · {GAME_LABEL[x.game]}</span></div>
        <div className="is-light"><small>{x.official ? `${x.official.source} · офіційний · схожість ${x.score}%` : "Офіційний"}</small><strong>{x.official ? `${x.official.t1} vs ${x.official.t2}` : "не знайдено"}</strong><span>{x.official ? `${dayShort(x.official.day)} · ${x.official.time} · ${x.official.tournament || GAME_LABEL[x.official.game]}` : "Чекаємо, поки з’явиться в джерелах"}</span></div>
      </div>
      <div className="v3-mx-recs">
        {x.bets.slice(0, 6).map((b) => { const [l, c] = resLabel(b.result); return <div key={b.id} className="v3-mx-rec"><UserAvatar username={b.username} telegram={b.telegram} /><span><strong>@{b.username}</strong><small>{b.betType} · {b.odds} · {Number(b.amount).toLocaleString("uk-UA")} ₴</small></span><span className={`v3-tag ${c}`}>{l}</span></div>; })}
        {x.bets.length > 6 && <span className="v3-mx-more">і ще {x.bets.length - 6}</span>}
      </div>
      <div className="v3-mx-acts2"><button type="button" className="v3-btn v3-btn-ghost-dark" disabled title={NO_API}>Це інший матч</button><button type="button" className="v3-btn v3-btn-primary" disabled title={NO_API}>Об’єднати</button></div>
      <p className="v3-mx-hint"><Lock size={13} aria-hidden="true" />Об’єднання з’явиться з ендпоінтом на бекенді — тоді результат прийде в записи автоматично.</p>
    </div>
  );
  const manualTab = bets === null ? <div className="v3-wcard v3-pay-list">{skelRows(4)}</div> : !groups.length ? (
    <section className="v3-mx-zero">
      <div className="v3-wcard v3-mx-zero-card"><span className="v3-empty-ic v3-float v3-halo" aria-hidden="true"><Check size={22} /></span><strong>Усі матчі на своїх місцях</strong><p>За останні 14 днів немає записів на матчі, яких би не було в стрічках tips.gg і HLTV. Коли користувач введе матч сам, він з’явиться тут разом зі схожим офіційним.</p></div>
      <div className="v3-dcard v3-mx-zero-st"><strong>Перевірено</strong><div><span>Записів за 14 днів</span><b>{recent.length}</b></div><div><span>Матчів у стрічках і історії</span><b>{known.length}</b></div></div>
    </section>
  ) : wide ? (
    <section className="v3-pay-main">
      <div className="v3-wcard v3-pay-list">
        <div className="v3-mx-lh"><h2>Матчі, яких немає в стрічках</h2><p>Користувач ввів матч сам. Поруч — найсхожіший офіційний, з яким його варто об’єднати.</p></div>
        <div className="v3-pay-th v3-mx-grow"><span>Як ввів користувач</span><span>Записів</span><span>Схожий офіційний</span><span className="v3-pay-r">Стан</span></div>
        <div className="v3-pay-rows a">{groups.map((x, i) => (
          <button key={x.key} type="button" className={`v3-pay-row v3-mx-grow${g?.key === x.key ? " is-sel" : ""}`} style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }} onClick={() => setSelGroup(x.key)}>
            <span className="v3-mx-tour"><strong>{x.t1} vs {x.t2}</strong><small>{dayShort(x.day)} · {GAME_LABEL[x.game]}</small></span>
            <span>{x.bets.length}</span>
            <span className="v3-mx-tour"><strong>{x.official ? `${x.official.t1} vs ${x.official.t2}` : "не знайдено"}</strong><small>{x.official ? `${x.official.source} · ${x.score}%` : "—"}</small></span>
            <span className="v3-pay-r"><span className={`v3-tag ${x.official ? "v3-tag-amber" : "v3-tag-gray"}`}>{x.official ? "Чекає" : "Без пари"}</span></span>
          </button>
        ))}</div>
      </div>
      <aside className="v3-dcard v3-pay-aside">{g && groupDetail(g)}</aside>
    </section>
  ) : (
    <ul className="v3-pay-mlist a">{groups.map((x, i) => (
      <li key={x.key} style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}><button type="button" className="v3-pay-mcard v3-mx-mcard" onClick={() => { setSelGroup(x.key); setSheet(true); }}>
        <span className="v3-mx-mcard-l"><strong>{x.t1} vs {x.t2}</strong><small>{dayShort(x.day)} · {x.bets.length} {plural(x.bets.length, "запис", "записи", "записів")} · {x.official ? `схожий: ${x.official.t1} vs ${x.official.t2}` : "схожого немає"}</small></span>
        <span className={`v3-tag ${x.official ? "v3-tag-amber" : "v3-tag-gray"}`}>{x.official ? "Чекає" : "Без пари"}</span>
      </button></li>
    ))}</ul>
  );

  // ── Команди ──
  const tn = tq.trim().toLowerCase();
  const tList = teams.filter((t) => (tf === "all" || (tf === "dup" ? t.variants.length > 0 : isFallbackLogo(t.logo))) && (!tn || `${t.name} ${t.variants.join(" ")}`.toLowerCase().includes(tn)));
  const tSel = tList.find((t) => t.key === selTeam) || (wide ? tList[0] : undefined) || null;
  const teamDetail = (t: Team) => (
    <div className="v3-mx-detail">
      <div className="v3-mx-th"><Logo src={t.logo} name={t.name} size={52} /><div><h2>{t.name}</h2><span>{GAME_LABEL[t.game]} · {t.matches} {plural(t.matches, "матч", "матчі", "матчів")} за 30 днів</span></div></div>
      <div className="v3-mx-kv"><div><span>Останній матч</span><strong>{t.last ? dayShort(t.last) : "—"}</strong></div><div><span>Логотип</span><strong>{isFallbackLogo(t.logo) ? "немає" : "є"}</strong></div></div>
      <div className="v3-mx-al"><small>Інші написання в стрічках</small>{t.variants.length ? <div>{t.variants.map((v) => <span key={v} className="v3-mx-chip">{v}</span>)}</div> : <span>Лише одне написання</span>}</div>
      <div className="v3-mx-acts2"><button type="button" className="v3-btn v3-btn-ghost-dark" disabled title={NO_API}>Об’єднати з…</button><button type="button" className="v3-btn v3-btn-primary" disabled title={NO_API}>Зберегти</button></div>
      <p className="v3-mx-hint"><Lock size={13} aria-hidden="true" />Довідник збирається зі стрічок і історії матчів. Псевдоніми й об’єднання дублікатів — з ендпоінтом на бекенді.</p>
    </div>
  );
  const tfOpts = [{ key: "all" as const, label: "Усі", n: teams.length }, { key: "dup" as const, label: "Дублікати", n: teams.filter((t) => t.variants.length).length }, { key: "logo" as const, label: "Без логотипа", n: teams.filter((t) => isFallbackLogo(t.logo)).length }];
  const teamsTab = (
    <section className={wide ? "v3-pay-main" : "v3-pay-m"}>
      <div className={wide ? "v3-wcard v3-pay-list" : ""}>
        <div className={wide ? "v3-pay-tools" : "v3-mx-mtools"}>
          <label className={wide ? "v3-search" : "v3-msearch"}><Search size={16} aria-hidden="true" /><input type="search" aria-label="Пошук команди" placeholder="Назва або написання" value={tq} onChange={(e) => setTq(e.target.value)} />{tq && <button type="button" onClick={() => setTq("")} aria-label="Очистити пошук"><X size={14} /></button>}</label>
          {wide ? <div className="v3-seg v3-seg-soft" role="group" aria-label="Фільтр"><PillTrack active={tf} />{tfOpts.map((f) => <button key={f.key} type="button" className={tf === f.key ? "is-on" : ""} aria-pressed={tf === f.key} onClick={() => setTf(f.key)}>{f.label} <span className="v3-seg-n">{f.n}</span></button>)}</div>
            : <Dropdown className="v3-mselect-dd" ariaLabel="Фільтр" value={tf} onChange={(v) => setTf(v)} options={tfOpts.map((f) => ({ value: f.key, label: `${f.label} · ${f.n}` }))} />}
        </div>
        {wide && <div className="v3-pay-th v3-mx-trow"><span>Команда</span><span>Інші написання</span><span>Гра</span><span>Матчів</span><span className="v3-pay-r">Останній</span></div>}
        {matches === null ? skelRows(5) : tList.length ? (wide ? <div className="v3-pay-rows a">{tList.slice(0, 80).map((t, i) => (
          <button key={t.key} type="button" className={`v3-pay-row v3-mx-trow${tSel?.key === t.key ? " is-sel" : ""}`} style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }} onClick={() => setSelTeam(t.key)}>
            <span className="v3-mx-tname"><Logo src={t.logo} name={t.name} size={28} /><strong>{t.name}</strong>{t.variants.length > 0 && <span className="v3-tag v3-tag-amber">Дублікат?</span>}</span>
            <span className="v3-mx-vars">{t.variants.length ? t.variants.slice(0, 3).map((v) => <span key={v} className="v3-mx-chip">{v}</span>) : <small>—</small>}</span>
            <span>{GAME_LABEL[t.game]}</span><span>{t.matches}</span><span className="v3-pay-r v3-pay-by">{t.last ? dayShort(t.last) : "—"}</span>
          </button>
        ))}</div> : <ul className="v3-pay-mlist a">{tList.slice(0, 60).map((t, i) => (
          <li key={t.key} style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}><button type="button" className="v3-pay-mcard v3-mx-mcard" onClick={() => { setSelTeam(t.key); setSheet(true); }}>
            <Logo src={t.logo} name={t.name} size={38} />
            <span className="v3-mx-mcard-l"><strong>{t.name}</strong><small>{GAME_LABEL[t.game]} · {t.matches} {plural(t.matches, "матч", "матчі", "матчів")}{t.variants.length ? ` · також «${t.variants[0]}»` : ""}</small></span>
            {t.variants.length > 0 && <span className="v3-tag v3-tag-amber">Дублікат?</span>}
          </button></li>
        ))}</ul>) : empty("Нічого не знайдено", tn ? `За «${tq.trim()}» команд немає.` : "У цьому фільтрі команд немає.")}
      </div>
      {wide && <aside className="v3-dcard v3-pay-aside">{tSel ? teamDetail(tSel) : <div className="v3-pay-empty is-dark"><span>Оберіть команду.</span></div>}</aside>}
    </section>
  );

  const sheetBody = tab === "manual" ? (groups.find((x) => x.key === selGroup) ? groupDetail(groups.find((x) => x.key === selGroup)!) : null)
    : tab === "teams" ? (teams.find((t) => t.key === selTeam) ? teamDetail(teams.find((t) => t.key === selTeam)!) : null)
    : (all.find((m) => m.id === selId) ? detail(all.find((m) => m.id === selId)!) : null);

  return (
    <div className="v3-page v3-pay v3-mx">
      <section className="v3-hero v3-hero-row">
        <div>
          <h1 className="v3-title">Матчі</h1>
          <p className="v3-subtitle"><span className="v3-hide-mobile">Дані з tips.gg і HLTV, записи користувачів і довідник команд. Час — київський.</span><span className="v3-only-mobile">{tab === "parsers" ? (down.length ? `${down.length} ${plural(down.length, "джерело", "джерела", "джерел")} з помилкою` : "Усі джерела працюють") : tab === "manual" ? "Чекають об’єднання" : tab === "teams" ? `${teams.length} у довіднику` : `Сьогодні ${todayM.length} · наживо ${liveN}`}</span></p>
        </div>
        <div className="v3-chips">
          <button type="button" className={`v3-chip v3-mx-rf${busy ? " is-busy" : ""}`} disabled={!online || busy} onClick={refresh} aria-label="Оновити з джерел">
            {done ? <Check size={15} className="v3-mx-ok" aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}<span className="v3-hide-mobile">{busy ? "Оновлюємо…" : done ? "Оновлено" : "Оновити з джерел"}</span>
          </button>
          <button type="button" className="v3-btn v3-btn-primary v3-hide-mobile" disabled title={NO_API}><Plus size={17} aria-hidden="true" />Додати матч</button>
        </div>
      </section>

      {!online && <div className="v3-offline-users" role="status"><WifiOff size={16} aria-hidden="true" /><span>Немає інтернету. Матчі станом на {updatedAt || "останнє оновлення"}.</span></div>}
      {error && matches !== null && <div className="v3-stale" role="alert"><AlertTriangle size={18} aria-hidden="true" /><span>Не вдалося оновити: {error}.</span><button type="button" className="v3-btn v3-btn-ghost-dark" onClick={() => load()}>Спробувати ще раз</button></div>}
      {failed.length === 1 && <div className="v3-stale" role="status"><AlertTriangle size={18} aria-hidden="true" /><span>Стрічка {GAME_LABEL[failed[0]]} не відповіла — показуємо лише {GAME_LABEL[failed[0] === "cs2" ? "dota2" : "cs2"]}.</span></div>}
      {down.length > 0 && tab === "matches" && <button type="button" className="v3-mx-alert" onClick={() => setTab("parsers")}><i aria-hidden="true" /><span>{down.map((p) => PARSER_NAMES[p.name] || p.name).join(", ")} не {down.length > 1 ? "відповідають" : "відповідає"}{down[0].lastFailure ? ` · ${ago(down[0].lastFailure)}` : ""}. Дані можуть бути застарілими.</span><b>Парсери →</b></button>}

      {error && matches === null ? (
        <div className="v3-dcard v3-uerror" role="alert"><span className="v3-uerror-ico" aria-hidden="true">!</span><strong>Не вдалося завантажити матчі</strong><span>Стрічки tips.gg і HLTV не відповіли.</span><code className="v3-uerror-det">{error}</code><div><button type="button" className="v3-btn v3-btn-blue" onClick={() => load()}>Спробувати ще раз</button></div></div>
      ) : <>
        <section className="v3-sums v3-pay-sums v3-mx-sums" aria-label="Підсумки">
          {sums.map((s) => (
            <button key={s.k} type="button" className={`v3-sum${s.on ? " is-on" : ""}${s.go ? "" : " is-static"}`} aria-pressed={s.on} onClick={s.go} disabled={!s.go}>
              <span className="v3-sum-l">{s.label}</span>
              <strong className={`v3-sum-v${s.bad && !s.on ? " v3-mx-bad" : ""}${s.amber && !s.on ? " v3-mx-amber" : ""}`}><RollingNumber key={`${s.k}-${s.v}`} text={s.v} /></strong>
              <span className="v3-sum-n"><span className="v3-pay-note">{s.n}</span></span>
            </button>
          ))}
        </section>

        <div className="v3-mx-tabsw">
          <div className="v3-pay-tabs v3-mx-tabs" role="tablist" aria-label="Розділи матчів">
            <PillTrack active={tab} />
            {TABS.map((t) => <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`v3-pay-tab${tab === t.key ? " is-on" : ""}${t.key === "parsers" && down.length ? " is-err" : ""}`} onClick={() => setTab(t.key)}><span className="v3-pay-tab-n">{tabN[t.key] ?? "…"}</span>{t.label}</button>)}
          </div>
        </div>

        <div key={tab} className="v3-pay-pane">
          {tab === "matches" && matchesTab}
          {tab === "parsers" && parsersTab}
          {tab === "manual" && manualTab}
          {tab === "teams" && teamsTab}
        </div>
      </>}

      {!wide && <Dialog open={sheet && !!sheetBody} onOpenChange={setSheet}><DialogContent className="v3-sheet v3-pay-sheet v3-mx-sheet"><DialogTitle className="sr-only">Деталі</DialogTitle><DialogDescription className="sr-only">Деталі матчу</DialogDescription>{sheetBody}</DialogContent></Dialog>}
    </div>
  );
}
