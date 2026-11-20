import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, Check, ExternalLink, History, Plus, RefreshCw, RotateCcw, Search, Shield, Trash2, WifiOff, X } from "lucide-react";
import { toast } from "sonner";
import PillTrack from "@/components/PillTrack";
import RollingNumber from "@/components/RollingNumber";
import UserAvatar from "@/components/UserAvatar";
import { Dropdown } from "@/components/ui/dropdown";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DateField } from "@/components/ui/date-field";
import { useMedia, useOnline } from "@/hooks/useMediaOnline";
import { fetchUserBets, fetchUsersOverview } from "@/lib/adminBetsApi";
import {
  createAlias, createManualMatch, deleteAlias, deleteManualMatch, fetchAliases, fetchAvailability, fetchFeeds, fetchHistory, fetchLinks, fetchOverrides,
  fetchParserEvents, linkMatch, logoKey, patchMatch, rerunParser, resetMatch, resolveLogos, type AdminStatus, type HourStat, type MatchOverride, type ParserEvent, type TeamAlias,
} from "@/lib/adminMatchesApi";
import { fetchParsers, PARSER_ISSUE, PARSER_NAMES, parserHealth, plural, type ParserState } from "@/lib/dashboardInsights";
import {
  addDays, ago, baseNorm, betMatches, dayShort, GAME_LABEL, initials, isFallbackLogo, isoToKyiv, kyivDay, kyivToIso, linkKey, manualGroups, normTeam, setAliases, STATUS_LABEL, teamsFrom,
  type Game, type ManualGroup, type Match, type MStatus, type Team,
} from "@/lib/matchesModel";
import type { AdminUserBet } from "@/types";

type Tab = "matches" | "parsers" | "manual" | "teams";
type Day = "today" | "tomorrow" | "week";
type UBet = AdminUserBet & { username: string; telegram?: string | null };

const TABS: { key: Tab; label: string }[] = [
  { key: "matches", label: "Матчі" }, { key: "parsers", label: "Парсери" }, { key: "manual", label: "Додані вручну" }, { key: "teams", label: "Команди" },
];
const ST_CLS: Record<MStatus, string> = { plan: "v3-tag-blue", live: "v3-tag-red", done: "v3-tag-gray", moved: "v3-tag-amber", off: "v3-tag-cancel" };
/** Статус у ручних правках: як у дизайні — 4 сегменти. */
const EDIT_ST: { key: AdminStatus; m: MStatus; label: string }[] = [
  { key: "upcoming", m: "plan", label: "Заплановано" }, { key: "postponed", m: "moved", label: "Перенесено" }, { key: "cancelled", m: "off", label: "Скасовано" }, { key: "finished", m: "done", label: "Завершено" },
];
const TO_ADMIN: Record<MStatus, AdminStatus> = { plan: "upcoming", live: "live", done: "finished", moved: "postponed", off: "cancelled" };
const EV_LABEL: Record<ParserEvent["event"], string> = { success: "Оновлено", failure: "Помилка", rerun: "Запуск вручну" };
/** Поле часу: лише цифри, двокрапка ставиться сама («1930» → «19:30»). */
const hhmmInput = (v: string) => { const d = v.replace(/\D/g, "").slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d; };
const errText = (e: unknown, d = "Сервер не відповів") => (e instanceof Error && e.message ? e.message : d);
const PARSER_META: Record<string, { ini: string; color: string; site: string; game: string; feed: Game | "hltv" }> = {
  hltv_scraper: { ini: "HL", color: "#2450c4", site: "hltv.org", game: "CS2", feed: "hltv" },
  tipsgg_fetch_cs2_matches: { ini: "TI", color: "#7a4fd0", site: "tips.gg", game: "CS2", feed: "cs2" },
  tipsgg_fetch_dota2_matches: { ini: "TI", color: "#c2410c", site: "tips.gg", game: "Dota 2", feed: "dota2" },
};
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
  const [hourSel, setHourSel] = useState<number | null>(null); // tapped hour on the 24-h bars
  const [legendSel, setLegendSel] = useState<"ok" | "mix" | "bad" | "none" | null>(null); // legend filter on the bars
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
  // Адмінські дані: псевдоніми, правки, рішення, журнал парсерів
  const [aliases, setAliasList] = useState<TeamAlias[]>([]);
  const [overrides, setOverrides] = useState<MatchOverride[] | null>(null);
  const [decided, setDecided] = useState<Set<string>>(new Set());
  const [events, setEvents] = useState<Record<string, ParserEvent[]>>({});
  const [avail, setAvail] = useState<Record<string, HourStat[]>>({});
  const [logFor, setLogFor] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ id: string; st: AdminStatus; date: string; time: string; s1: string; s2: string } | null>(null);
  const [saving, setSaving] = useState<string>("");
  const [ask, setAsk] = useState<string>("");
  const [addOpen, setAddOpen] = useState(false);
  const [mergeFor, setMergeFor] = useState<Team | null>(null);

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

  const loadAdmin = useCallback(async () => {
    const [al, ov, ln] = await Promise.all([fetchAliases().catch(() => null), fetchOverrides().catch(() => null), fetchLinks().catch(() => null)]);
    if (al) { setAliases(al); setAliasList(al); }
    setOverrides(ov);
    if (ln) setDecided(new Set(ln.filter((l) => l.decision !== "pending").map((l) => l.linkKey)));
  }, []);
  useEffect(() => { load(); loadAdmin(); fetchHistory(30).then(setHistory).catch(() => {}); }, [load, loadAdmin]);
  // Журнал і погодинна доступність кожного парсера
  const parserNames = (parsers || []).map((p) => p.name).join(",");
  const loadLogs = useCallback(async () => {
    const names = parserNames ? parserNames.split(",") : [];
    const res = await Promise.all(names.map(async (n) => [n, await fetchParserEvents(n, 100).catch(() => null), await fetchAvailability(n, 24).catch(() => null)] as const));
    setEvents(Object.fromEntries(res.filter((x) => x[1]).map((x) => [x[0], x[1]!])));
    setAvail(Object.fromEntries(res.filter((x) => x[2]).map((x) => [x[0], x[2]!])));
  }, [parserNames]);
  useEffect(() => { if (parserNames) loadLogs(); }, [parserNames, loadLogs]);
  // Телефон: рядок вкладок гортається до активної
  useEffect(() => { document.querySelector(".v3-mx-tabs .is-on")?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }); }, [tab]);
  // Phone tab strip: fade only the edge that has more tabs behind it (no fade over a fully visible tab)
  const tabsEl = useRef<HTMLDivElement | null>(null);
  const [tabFade, setTabFade] = useState({ l: false, r: true });
  const edgeFade = (el: HTMLElement) => { const l = el.scrollLeft > 4, r = el.scrollLeft + el.clientWidth < el.scrollWidth - 4; setTabFade((o) => (o.l === l && o.r === r ? o : { l, r })); };

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
  // Logos for teams the feeds sent without one (e.g. matches added by hand) — same packs the app uses
  const [logoMap, setLogoMap] = useState<Record<string, string>>({});
  const [logoTried] = useState(() => new Set<string>());
  useEffect(() => {
    const need = new Map<string, { name: string; game: Game }>();
    for (const m of [...(matches || []), ...history]) for (const [n, l] of [[m.t1, m.logo1], [m.t2, m.logo2]] as const) {
      const k = logoKey(m.game, n); if (n && isFallbackLogo(l) && !logoTried.has(k)) need.set(k, { name: n, game: m.game });
    }
    if (!need.size) return;
    need.forEach((_, k) => logoTried.add(k));
    resolveLogos([...need.values()]).then((found) => { if (Object.keys(found).length) setLogoMap((o) => ({ ...o, ...found })); }).catch(() => {});
  }, [matches, history, logoTried]);
  const withLogo = useCallback((m: Match): Match => {
    const l1 = isFallbackLogo(m.logo1) ? logoMap[logoKey(m.game, m.t1)] : undefined, l2 = isFallbackLogo(m.logo2) ? logoMap[logoKey(m.game, m.t2)] : undefined;
    return l1 || l2 ? { ...m, logo1: l1 || m.logo1, logo2: l2 || m.logo2 } : m;
  }, [logoMap]);
  const all = useMemo(() => (matches || []).map(withLogo), [matches, withLogo]);
  const recent = useMemo(() => { const from = addDays(today, -14); return (bets || []).filter((b) => String(b.date).slice(0, 10) >= from); }, [bets, today]);
  const betsFor = useCallback((m: Match) => recent.filter((b) => betMatches(b, m)), [recent]);
  const known = useMemo(() => [...all, ...history.map(withLogo)], [all, history, withLogo]);
  const groups = useMemo(() => (bets ? manualGroups(recent, known).filter((x) => !decided.has(linkKey(x.game, x.t1, x.t2, x.day))) : []), [bets, recent, known, decided, aliases]);
  const teams = useMemo(() => teamsFrom(known), [known, aliases]);
  const ovOf = (m: Match) => overrides?.find((o) => o.game === m.game && o.matchId === m.raw) || null;

  const todayM = all.filter((m) => m.day === today);
  const liveN = all.filter((m) => m.status === "live").length;
  // Matches each parser brought for today (HLTV / tips.gg CS2 / tips.gg Dota 2)
  const cntFor = (name: string) => { const f = (PARSER_META[name] || { feed: "cs2" as const }).feed; return f === "hltv" ? todayM.filter((m) => m.source === "HLTV").length : todayM.filter((m) => m.game === f && m.source === "tips.gg").length; };
  /** down / flaky from the breaker; idle = no errors, but nothing came in today (e.g. the source blocks us). */
  const pState = (p: ParserState): "down" | "flaky" | "idle" | "ok" => { const h = parserHealth(p); return h !== "ok" ? h : matches && cntFor(p.name) === 0 ? "idle" : "ok"; };
  const down = (parsers || []).filter((p) => pState(p) !== "ok");
  const issueText = (p: ParserState) => `${PARSER_NAMES[p.name] || p.name} ${PARSER_ISSUE[pState(p) as "down" | "flaky" | "idle"]}`;
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

  // ── Ручні правки матчу ──
  const formOf = (m: Match) => {
    if (edit?.id === m.id) return edit;
    const local = m.ts ? isoToKyiv(m.ts) : "";
    return { id: m.id, st: TO_ADMIN[m.status], date: local.slice(0, 10), time: local.slice(11, 16), s1: m.s1 == null ? "" : String(m.s1), s2: m.s2 == null ? "" : String(m.s2) };
  };
  const setForm = (m: Match, patch: Partial<NonNullable<typeof edit>>) => setEdit({ ...formOf(m), ...patch });
  const saveEdit = async (m: Match) => {
    const f = formOf(m), ov = ovOf(m), cur = formOf({ ...m, id: "" });
    const timeChanged = f.date !== cur.date || f.time !== cur.time;
    const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.min(99, parseInt(v, 10) || 0)));
    const body = {
      status: f.st !== cur.st || ov?.status ? f.st : null,
      startDate: f.date && f.time && (timeChanged || ov?.startDate) ? kyivToIso(`${f.date}T${f.time}`) : null,
      score1: num(f.s1), score2: num(f.s2),
    };
    if (!body.status && !body.startDate && body.score1 === m.s1 && body.score2 === m.s2) { toast("Змін немає", { description: "Поля збігаються з даними парсера" }); return; }
    setSaving(m.id);
    try {
      await patchMatch(m.game, m.raw, body);
      await Promise.all([load(), loadAdmin()]);
      setEdit(null);
      toast.success("Правку збережено", { description: `${m.t1} vs ${m.t2} · застосунок показує її замість даних ${m.source}` });
    } catch (e) { toast.error("Не вдалося зберегти правку", { description: errText(e) }); }
    setSaving("");
  };
  const resetEdit = async (m: Match) => {
    setSaving(m.id);
    try {
      await resetMatch(m.game, m.raw);
      await Promise.all([load(), loadAdmin()]);
      setEdit(null);
      toast.success("Правку скинуто", { description: `Знову дані з ${m.source}` });
    } catch (e) {
      if ((e as { status?: number })?.status === 404) { setEdit(null); toast("Ручних правок немає", { description: "Матч і так показує дані парсера" }); }
      else toast.error("Не вдалося скинути правку", { description: errText(e) });
    }
    setSaving("");
  };
  const removeManual = async (m: Match) => {
    if (ask !== `del:${m.id}`) { setAsk(`del:${m.id}`); window.setTimeout(() => setAsk((a) => (a === `del:${m.id}` ? "" : a)), 4000); return; }
    setAsk(""); setSaving(m.id);
    try {
      await deleteManualMatch(m.raw);
      await load();
      setSelId(null); setSheet(false);
      toast.success("Матч видалено", { description: `${m.t1} vs ${m.t2} більше не показується в застосунку` });
    } catch (e) { toast.error("Не вдалося видалити матч", { description: errText(e) }); }
    setSaving("");
  };

  // ── Додані вручну: об’єднати / це інший матч ──
  const decide = async (x: ManualGroup, kind: "merge" | "unlink") => {
    setSaving(`${kind}:${x.key}`);
    try {
      await linkMatch(kind, { game: x.game, team1: x.t1, team2: x.t2, date: x.day, officialId: kind === "merge" ? x.official?.raw ?? null : null });
      setDecided((d) => new Set(d).add(linkKey(x.game, x.t1, x.t2, x.day)));
      setSelGroup(null); setSheet(false);
      toast.success(kind === "merge" ? "Об’єднано" : "Позначено як інший матч", { description: kind === "merge" && x.official ? `${x.t1} vs ${x.t2} → ${x.official.t1} vs ${x.official.t2}` : `${x.t1} vs ${x.t2} · ${x.bets.length} ${plural(x.bets.length, "запис", "записи", "записів")}` });
    } catch (e) { toast.error("Не вдалося зберегти рішення", { description: errText(e) }); }
    setSaving("");
  };

  // ── Команди: псевдоніми ──
  const addAliases = async (t: Team, names: string[]) => {
    const list = [...new Set(names.map((n) => n.trim()).filter((n) => n && baseNorm(n) !== baseNorm(t.name)))];
    if (!list.length) return;
    setSaving(`team:${t.key}`);
    try {
      for (const a of list) await createAlias({ game: t.game, canonical: t.name, alias: a });
      await loadAdmin();
      setMergeFor(null);
      toast.success(list.length > 1 ? `Додано ${list.length} написання` : "Написання додано", { description: `${list.join(", ")} → ${t.name}` });
    } catch (e) { toast.error("Не вдалося зберегти псевдонім", { description: errText(e) }); }
    setSaving("");
  };
  const removeAlias = async (a: TeamAlias) => {
    setSaving(`alias:${a.id}`);
    try { await deleteAlias(a.id); await loadAdmin(); toast.success("Псевдонім видалено", { description: `«${a.alias}» знову окрема назва` }); }
    catch (e) { toast.error("Не вдалося видалити псевдонім", { description: errText(e) }); }
    setSaving("");
  };

  const sums = [
    { k: "today", label: "Матчів сьогодні", v: matches ? String(todayM.length) : "—", n: matches ? `CS2 ${todayM.filter((m) => m.game === "cs2").length} · Dota 2 ${todayM.filter((m) => m.game === "dota2").length} · наживо ${liveN}` : "…", go: () => { setTab("matches"); setDay("today"); setSt("all"); }, on: tab === "matches" },
    { k: "parsers", label: "Парсери", v: parsers ? (down.length ? `${down.length} ${plural(down.length, "проблема", "проблеми", "проблем")}` : "Працюють") : "—", n: parsers ? (down.length ? down.map(issueText).join(" · ") : `${parsers.reduce((a, p) => a + p.failures24h, 0)} збоїв за 24 год`) : "…", bad: down.length > 0, go: () => setTab("parsers"), on: tab === "parsers" },
    { k: "bets", label: "Записів на сьогодні", v: todayBets == null ? "…" : String(todayBets), n: todayBets == null ? "рахуємо зі ставок користувачів" : `на ${todayM.length} ${plural(todayM.length, "матч", "матчі", "матчів")} сьогодні`, go: undefined, on: false },
    { k: "manual", label: "Додані вручну", v: bets ? String(groups.length) : "…", n: bets ? (groups.length ? "немає в стрічках парсерів" : "усі записи на своїх матчах") : "шукаємо в записах", amber: groups.length > 0, go: () => setTab("manual"), on: tab === "manual" },
  ];
  const tabN: Record<Tab, number | null> = { matches: matches ? todayM.length : null, parsers: parsers ? down.length || parsers.length : null, manual: bets ? groups.length : null, teams: matches ? teams.length : null };

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
        {m.manual ? (
          <div className="v3-mx-edit">
            <span className="v3-mx-elegend">Доданий вручну</span>
            <p>Матч додав адмін — у застосунку він показується як звичайний, поруч із матчами з парсерів.</p>
            <button type="button" className={`v3-btn v3-btn-danger-outline v3-pay-cx${ask === `del:${m.id}` ? " is-ask" : ""}`} disabled={!online || saving === m.id} onClick={() => removeManual(m)}><Trash2 size={15} aria-hidden="true" />{ask === `del:${m.id}` ? "Точно видалити?" : "Видалити матч"}</button>
          </div>
        ) : (() => {
          const f = formOf(m), ov = ovOf(m), busyM = saving === m.id;
          return (
            <form className="v3-mx-edit" onSubmit={(e) => { e.preventDefault(); saveEdit(m); }}>
              <span className="v3-mx-elegend">Ручні правки{ov && <span className="v3-tag v3-tag-amber">Змінено · @{ov.decidedBy}</span>}</span>
              <fieldset disabled={!online || busyM} className="v3-mx-efs">
                <div className="v3-mx-segd" role="group" aria-label="Статус матчу">
                  <PillTrack active={f.st} />
                  {EDIT_ST.map((x) => <button key={x.key} type="button" className={f.st === x.key ? "is-on" : ""} aria-pressed={f.st === x.key} onClick={() => setForm(m, { st: x.key })}>{x.label}</button>)}
                </div>
                <div className="v3-mx-ef">
                  <div className="v3-field"><label id={`ed-d-${m.id}`}>Дата</label><DateField id={`ed-date-${m.id}`} labelledBy={`ed-d-${m.id}`} value={f.date} onChange={(v) => setForm(m, { date: v })} /></div>
                  <div className="v3-field"><label htmlFor={`ed-t-${m.id}`}>Час</label><input id={`ed-t-${m.id}`} inputMode="numeric" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" title="Година й хвилини, напр. 19:30" placeholder="19:00" maxLength={5} value={f.time} onChange={(e) => setForm(m, { time: hhmmInput(e.target.value) })} /></div>
                  <div className="v3-field"><span className="v3-label" id={`ed-s-${m.id}`}>Рахунок</span><span className="v3-mx-sc" role="group" aria-labelledby={`ed-s-${m.id}`}><input inputMode="numeric" pattern="[0-9]{0,2}" aria-label={`Рахунок ${m.t1}`} value={f.s1} onChange={(e) => setForm(m, { s1: e.target.value.replace(/\D/g, "").slice(0, 2) })} placeholder="—" /><b aria-hidden="true">:</b><input inputMode="numeric" pattern="[0-9]{0,2}" aria-label={`Рахунок ${m.t2}`} value={f.s2} onChange={(e) => setForm(m, { s2: e.target.value.replace(/\D/g, "").slice(0, 2) })} placeholder="—" /></span></div>
                </div>
                <div className="v3-mx-acts2">
                  <button type="button" className="v3-btn v3-btn-ghost-dark" disabled={!ov && overrides !== null && edit?.id !== m.id} onClick={() => (ov || overrides === null ? resetEdit(m) : setEdit(null))}><RotateCcw size={15} aria-hidden="true" />{ov || overrides === null ? "Скинути правку" : "Скасувати"}</button>
                  <button type="submit" className="v3-btn v3-btn-primary">{busyM ? <span className="v3-mx-spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}{busyM ? "Зберігаємо…" : "Зберегти"}</button>
                </div>
              </fieldset>
              <p>Правка накладається на дані {m.source}: застосунок показує її, доки її не скинуть. Час — київський.</p>
            </form>
          );
        })()}
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
      {(() => { const focus = down[0]?.name || (avail.hltv_scraper ? "hltv_scraper" : Object.keys(avail)[0]); const a = focus ? avail[focus] : undefined; if (!a) return null;
        const byHour = new Map(a.map((h) => [h.hour.slice(11, 13), h]));
        const hours = Array.from({ length: 24 }, (_, i) => { const d = new Date(Date.now() - (23 - i) * 36e5); const hh = isoToKyiv(d.getTime()).slice(11, 13); const h = byHour.get(hh); return { hh, s: !h ? "none" : h.failure && h.success ? "mix" : h.failure ? "bad" : "ok", h }; });
        return (
          <div className="v3-dcard v3-mx-up">
            <div className="v3-mx-uph"><strong>{PARSER_NAMES[focus] || focus} за 24 години</strong>
              <div className="v3-mx-legend" role="group" aria-label="Показати години зі статусом">
                {([["ok", "успішно"], ["mix", "із повторами"], ["bad", "помилка"], ["none", "немає даних"]] as const).map(([k, l]) => {
                  const last = hours.map((x) => x.s).lastIndexOf(k);
                  return <button key={k} type="button" className={legendSel === k ? "is-on" : ""} aria-pressed={legendSel === k} disabled={last < 0} title={last < 0 ? "За 24 години такого не було" : `Остання година зі статусом «${l}»`}
                    onClick={() => { if (legendSel === k) { setLegendSel(null); setHourSel(null); } else { setLegendSel(k); setHourSel(last); } }}><i className={`is-${k}`} />{l}</button>;
                })}
              </div>
            </div>
            <div className="v3-mx-bars" role="group" aria-label="Години">{hours.map((x, i) => <button type="button" key={i} className={`v3-mx-bar is-${x.s}${hourSel === i ? " is-sel" : ""}${legendSel && legendSel !== x.s ? " is-dim" : ""}`} style={{ animationDelay: `${i * 30}ms` }} aria-pressed={hourSel === i} aria-label={`${x.hh}:00`} onClick={() => { setLegendSel(null); setHourSel(hourSel === i ? null : i); }} />)}</div>
            {hourSel !== null && hours[hourSel] && (() => { const x = hours[hourSel]; const next = String((Number(x.hh) + 1) % 24).padStart(2, "0"); return (
              <p className="v3-mx-hinfo" aria-live="polite"><strong>{x.hh}:00–{next}:00</strong>{x.h ? <>
                {(x.h.success > 0 || !x.h.failure) && <span className="is-ok">{x.h.success} {plural(x.h.success, "успішний запуск", "успішні запуски", "успішних запусків")}</span>}
                {x.h.failure > 0 && <span className="is-bad">{x.h.failure} {plural(x.h.failure, "помилка", "помилки", "помилок")}</span>}</> : <span>немає даних — парсер у цю годину не запускався</span>}</p>
            ); })()}
            <div className="v3-mx-axis"><span>{hours[0].hh}:00</span><span>{hours[6].hh}:00</span><span>{hours[12].hh}:00</span><span>{hours[18].hh}:00</span><span>зараз</span></div>
          </div>
        ); })()}
      {parsers === null ? Array.from({ length: 2 }, (_, i) => <div key={i} className="v3-wcard v3-mx-pcard is-skel" aria-hidden="true"><span className="v3-skel v3-skel-light" style={{ width: "40%" }} /><span className="v3-skel v3-skel-light" /><span className="v3-skel v3-skel-light" style={{ width: "70%" }} /></div>)
        : parsers.map((p, i) => {
          const meta = PARSER_META[p.name] || { ini: initials(p.name), color: "#5f6878", site: p.name, game: "", feed: "cs2" as const };
          const cnt = cntFor(p.name);
          const ps = pState(p);
          const r = running[p.name];
          return (
            <div key={p.name} className={`v3-wcard v3-mx-pcard${ps === "down" ? " is-err" : ""}`} style={{ animationDelay: `${i * 60}ms` }}>
              <div className="v3-mx-ph">
                <span className="v3-mx-pav" style={{ background: meta.color }}>{meta.ini}</span>
                <span><strong>{PARSER_NAMES[p.name] || p.name}</strong><small>{meta.site}{meta.game && ` · ${meta.game}`}</small></span>
                <span key={ps} className={`v3-tag v3-mx-flip ${ps === "down" ? "v3-tag-red" : ps === "ok" ? "v3-tag-green" : "v3-tag-amber"}`}><i className={`v3-mx-dot${ps === "down" || ps === "flaky" ? " is-pulse" : ""}`} aria-hidden="true" />{ps === "down" ? "Помилка" : ps === "flaky" ? "Збої" : ps === "idle" ? "Без даних" : "Працює"}</span>
              </div>
              <div className="v3-mx-pkv">
                <div><span>Останній збій</span><strong className={p.open ? "is-bad" : ""}>{p.lastFailure ? ago(p.lastFailure) : "не було"}</strong></div>
                <div><span>Збоїв за 24 год</span><strong>{p.failures24h}</strong></div>
                <div><span>Матчів сьогодні</span><strong>{matches ? cnt : "…"}</strong></div>
              </div>
              {(() => { const ev = events[p.name]; return ev ? (
                <div className="v3-mx-ev"><strong>Останні події</strong>{ev.length ? ev.slice(0, 4).map((e, k) => <div key={e.id} className={`v3-mx-evr is-${e.event}`} style={{ animationDelay: `${150 + k * 45}ms` }}><span>{new Date(e.createdAt).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}</span><span>{EV_LABEL[e.event]}{e.message && e.message !== "OK" ? ` · ${e.message}` : ""}</span></div>) : <p className="v3-mx-pnote">Подій ще немає — журнал почне наповнюватися з наступних запусків.</p>}</div>
              ) : null; })()}
              <p className="v3-mx-pnote">{p.open ? `Запобіжник спрацював після ${p.failures} ${plural(p.failures, "невдалої спроби", "невдалих спроб", "невдалих спроб")} — застосунок показує останні отримані дані. «Запустити зараз» скидає його, і наступний запит піде одразу.` : ps === "flaky" ? `Останні запуски завершуються помилкою (${ago(p.lastFailure)}), парсер повторює спроби. Поки так, у меню біля «Матчі» стоїть «!».` : ps === "idle" ? "Помилок немає, але сьогодні джерело не повернуло жодного матчу — найчастіше це блокування з боку сайту. Застосунок показує останні отримані дані." : "Дані оновлюються автоматично. Якщо джерело мовчатиме, тут з’явиться помилка, а в меню — позначка «!»."}</p>
              <div className="v3-mx-pacts">
                <button type="button" className={`v3-btn ${p.open ? "v3-btn-primary" : "v3-btn-dark"}`} disabled={!online || r === "busy"} onClick={() => rerun(p.name)}>
                  {r === "busy" ? <span className="v3-mx-spin" aria-hidden="true" /> : r === "done" ? <Check size={15} aria-hidden="true" className="v3-mx-ok" /> : <RefreshCw size={15} aria-hidden="true" />}
                  {r === "busy" ? "Запускаємо…" : r === "done" ? "Запущено" : "Запустити зараз"}
                </button>
                <button type="button" className="v3-btn v3-btn-outline" disabled={!events[p.name]} onClick={() => setLogFor(p.name)}><History size={15} aria-hidden="true" />Повний лог</button>
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
      <div className="v3-mx-acts2">
        <button type="button" className="v3-btn v3-btn-ghost-dark" disabled={!online || !!saving} onClick={() => decide(x, "unlink")}>{saving === `unlink:${x.key}` && <span className="v3-mx-spin" aria-hidden="true" />}Це інший матч</button>
        <button type="button" className="v3-btn v3-btn-primary" disabled={!online || !x.official || !!saving} onClick={() => decide(x, "merge")}>{saving === `merge:${x.key}` ? <span className="v3-mx-spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}Об’єднати</button>
      </div>
      <p className="v3-mx-hint">{x.official ? "«Об’єднати» зв’яже записи користувачів з офіційним матчем. «Це інший матч» — матч справжній, просто його немає в джерелах." : "Схожого офіційного матчу немає — об’єднувати нема з чим. Якщо матч справжній, позначте «Це інший матч»."}</p>
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
  const tList = teams.filter((t) => (tf === "all" || (tf === "dup" ? t.variants.length > 0 : isFallbackLogo(t.logo))) && (!tn || `${t.name} ${t.variants.join(" ")} ${t.aliases.join(" ")}`.toLowerCase().includes(tn)));
  const tSel = tList.find((t) => t.key === selTeam) || (wide ? tList[0] : undefined) || null;
  const teamDetail = (t: Team) => (
    <div className="v3-mx-detail">
      <div className="v3-mx-th"><Logo src={t.logo} name={t.name} size={52} /><div><h2>{t.name}</h2><span>{GAME_LABEL[t.game]} · {t.matches} {plural(t.matches, "матч", "матчі", "матчів")} за 30 днів</span></div></div>
      <div className="v3-mx-kv"><div><span>Останній матч</span><strong>{t.last ? dayShort(t.last) : "—"}</strong></div><div><span>Логотип</span><strong>{isFallbackLogo(t.logo) ? "немає" : "є"}</strong></div></div>
      {(() => { const tn = normTeam(t.name); const mine = known.filter((m) => m.game === t.game && (normTeam(m.t1) === tn || normTeam(m.t2) === tn)); const now = Date.now();
        const m = mine.filter((x) => x.ts >= now).sort((a, b) => a.ts - b.ts)[0] || mine.sort((a, b) => b.ts - a.ts)[0]; if (!m) return null;
        const first = normTeam(m.t1) === tn; const [n1, l1, n2, l2] = first ? [m.t1, m.logo1, m.t2, m.logo2] : [m.t2, m.logo2, m.t1, m.logo1];
        return (<div className="v3-mx-al"><small>Як виглядає на шкалі матчів</small><div className="v3-mx-strip"><Logo src={l1} name={n1} size={26} /><strong>{n1}</strong><span>{m.day === today ? m.time : `${dayShort(m.day)}, ${m.time}`}</span><Logo src={l2} name={n2} size={26} /><strong>{n2}</strong></div></div>);
      })()}
      {(() => { const own = aliases.filter((a) => a.game === t.game && baseNorm(a.canonical) === baseNorm(t.name)); return (
        <div className="v3-mx-al"><small>Псевдоніми — так команду називають джерела</small><div>{own.map((a) => <span key={a.id} className="v3-mx-chip is-alias">{a.alias}<button type="button" aria-label={`Прибрати псевдонім ${a.alias}`} disabled={!online || saving === `alias:${a.id}`} onClick={() => removeAlias(a)}><X size={12} aria-hidden="true" /></button></span>)}{t.variants.map((v) => <span key={v} className="v3-mx-chip is-new" title="Нове написання з джерел — підтвердіть «Це одна команда»">{v}</span>)}<button type="button" className="v3-mx-aladd" disabled={!online} onClick={() => setMergeFor(t)}>+ псевдонім</button></div></div>
      ); })()}
      <div className="v3-mx-acts2">
        <button type="button" className="v3-btn v3-btn-ghost-dark" disabled={!online} onClick={() => setMergeFor(t)}><Plus size={15} aria-hidden="true" />Об’єднати з…</button>
        <button type="button" className="v3-btn v3-btn-primary" disabled={!online || !t.variants.length || saving === `team:${t.key}`} onClick={() => addAliases(t, t.variants)}>{saving === `team:${t.key}` ? <span className="v3-mx-spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}Це одна команда</button>
      </div>
      <p className="v3-mx-hint">Псевдонім — інше написання «{t.name}»: записи й матчі з будь-яким написанням рахуються як одна команда.</p>
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
        {wide && <div className="v3-pay-th v3-mx-trow"><span>Команда</span><span>Псевдоніми з джерел</span><span>Гра</span><span>Матчів</span><span className="v3-pay-r">Останній</span></div>}
        {matches === null ? skelRows(5) : tList.length ? (wide ? <div className="v3-pay-rows a">{tList.slice(0, 80).map((t, i) => (
          <button key={t.key} type="button" className={`v3-pay-row v3-mx-trow${tSel?.key === t.key ? " is-sel" : ""}`} style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }} onClick={() => setSelTeam(t.key)}>
            <span className="v3-mx-tname"><Logo src={t.logo} name={t.name} size={28} /><strong>{t.name}</strong>{t.variants.length > 0 && <span className="v3-tag v3-tag-amber">Дублікат?</span>}</span>
            <span className="v3-mx-vars">{t.aliases.length + t.variants.length ? [...t.aliases, ...t.variants].slice(0, 3).map((v) => <span key={v} className="v3-mx-chip">{v}</span>) : <small>—</small>}</span>
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
          <p className="v3-subtitle"><span className="v3-hide-mobile">Дані з tips.gg і HLTV, записи користувачів і довідник команд. Час — київський.</span><span className="v3-only-mobile">{tab === "parsers" ? (down.length ? `${down.length} ${plural(down.length, "джерело", "джерела", "джерел")} з проблемою` : "Усі джерела працюють") : tab === "manual" ? "Чекають об’єднання" : tab === "teams" ? `${teams.length} у довіднику` : `Сьогодні ${todayM.length} · наживо ${liveN}`}</span></p>
        </div>
        <div className="v3-chips">
          <button type="button" className={`v3-chip v3-mx-rf${busy ? " is-busy" : ""}`} disabled={!online || busy} onClick={refresh} aria-label="Оновити з джерел">
            {done ? <Check size={15} className="v3-mx-ok" aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}<span className="v3-hide-mobile">{busy ? "Оновлюємо…" : done ? "Оновлено" : "Оновити з джерел"}</span>
          </button>
          <button type="button" className="v3-btn v3-btn-primary v3-mx-plus" disabled={!online} onClick={() => setAddOpen(true)} aria-label="Додати матч"><Plus size={17} aria-hidden="true" /><span className="v3-hide-mobile">Додати матч</span></button>
        </div>
      </section>

      {!online && <div className="v3-offline-users" role="status"><WifiOff size={16} aria-hidden="true" /><span>Немає інтернету. Матчі станом на {updatedAt || "останнє оновлення"}.</span></div>}
      {error && matches !== null && <div className="v3-stale" role="alert"><AlertTriangle size={18} aria-hidden="true" /><span>Не вдалося оновити: {error}.</span><button type="button" className="v3-btn v3-btn-ghost-dark" onClick={() => load()}>Спробувати ще раз</button></div>}
      {failed.length === 1 && <div className="v3-stale" role="status"><AlertTriangle size={18} aria-hidden="true" /><span>Стрічка {GAME_LABEL[failed[0]]} не відповіла — показуємо лише {GAME_LABEL[failed[0] === "cs2" ? "dota2" : "cs2"]}.</span></div>}
      {down.length > 0 && tab === "matches" && <button type="button" className="v3-mx-alert" onClick={() => setTab("parsers")}><i aria-hidden="true" /><span>{down.map(issueText).join(", ")}{down[0].lastFailure && pState(down[0]) !== "idle" ? ` · ${ago(down[0].lastFailure)}` : ""}. Дані можуть бути застарілими.</span><b>Парсери →</b></button>}

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

        <div className={`v3-mx-tabsw${tabFade.l ? " fade-l" : ""}${tabFade.r ? " fade-r" : ""}`} onScroll={(e) => edgeFade(e.currentTarget)} ref={(el) => { if (el && !tabsEl.current) { tabsEl.current = el; edgeFade(el); } }}>
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

      <AddMatchDialog open={addOpen} onOpenChange={setAddOpen} onDone={async (m) => { await load(); setTab("matches"); setDay(m.startDate && kyivDay(new Date(m.startDate)) === today ? "today" : "week"); setSelId(`${m.game}:${m.id}`); setRk((x) => x + 1); }} />

      <Dialog open={!!logFor} onOpenChange={(o) => !o && setLogFor(null)}>
        <DialogContent className="v3-modal sm:max-w-[560px]">
          <DialogTitle className="v3-modal-title">Повний лог · {logFor ? PARSER_NAMES[logFor] || logFor : ""}</DialogTitle>
          <DialogDescription className="v3-modal-sub">Останні {logFor ? (events[logFor] || []).length : 0} подій. Однакові події частіше ніж раз на хвилину зливаються в одну.</DialogDescription>
          <div className="v3-mx-log">{logFor && (events[logFor] || []).map((e) => <div key={e.id} className={`v3-mx-evr is-${e.event}`}><span>{new Date(e.createdAt).toLocaleString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span><span>{EV_LABEL[e.event]}{e.message && e.message !== "OK" ? ` · ${e.message}` : ""}</span></div>)}{logFor && !(events[logFor] || []).length && <p className="v3-mx-pnote">Подій ще немає.</p>}</div>
          <div className="v3-modal-foot"><span className="v3-hint">Час — київський</span><div className="v3-modal-actions"><button type="button" className="v3-btn v3-btn-ghost" onClick={() => setLogFor(null)}>Закрити</button></div></div>
        </DialogContent>
      </Dialog>

      <MergeTeamDialog team={mergeFor} teams={teams} busy={!!mergeFor && saving === `team:${mergeFor.key}`} onClose={() => setMergeFor(null)} onPick={(t, names) => addAliases(t, names)} />

      {!wide && <Dialog open={sheet && !!sheetBody} onOpenChange={setSheet}><DialogContent className="v3-sheet v3-pay-sheet v3-mx-sheet"><DialogTitle className="sr-only">Деталі</DialogTitle><DialogDescription className="sr-only">Деталі матчу</DialogDescription>{sheetBody}</DialogContent></Dialog>}
    </div>
  );
}

/** «Додати матч»: матч, якого немає в джерелах, з’явиться в стрічці застосунку. */
function AddMatchDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: (m: { id: string; game: Game; startDate: string }) => void | Promise<void> }) {
  const blank = () => ({ game: "cs2" as Game, t1: "", t2: "", tour: "", bo: "BO3", date: kyivDay(), time: "19:00" });
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { if (open) { setF(blank()); setErr(""); } }, [open]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.t1.trim() || !f.t2.trim()) { setErr("Вкажіть обидві команди"); return; }
    if (baseNorm(f.t1) === baseNorm(f.t2)) { setErr("Команди мають відрізнятися"); return; }
    setBusy(true); setErr("");
    try {
      const m = await createManualMatch({ game: f.game, team1: f.t1.trim(), team2: f.t2.trim(), tournament: f.tour.trim() || undefined, bo: f.bo, startDate: kyivToIso(`${f.date}T${f.time}`) });
      onOpenChange(false);
      toast.success("Матч додано", { description: `${m.team1} vs ${m.team2} · ${dayShort(f.date)}, ${f.time}` });
      await onDone(m);
    } catch (e2) { setErr(errText(e2, "Не вдалося додати матч")); }
    setBusy(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="v3-modal sm:max-w-[520px]">
        <DialogTitle className="v3-modal-title">Додати матч</DialogTitle>
        <DialogDescription className="v3-modal-sub">Для матчу, якого немає в tips.gg і HLTV. Застосунок покаже його в розкладі разом з іншими.</DialogDescription>
        <form onSubmit={save} className="v3-form">
          <fieldset disabled={busy} className="v3-form-grid">
            <div className="v3-field v3-span2"><span className="v3-label" id="am-g">Гра</span><div className="v3-chipset" role="group" aria-labelledby="am-g">{(["cs2", "dota2"] as Game[]).map((g) => <button key={g} type="button" className={f.game === g ? "is-on" : ""} aria-pressed={f.game === g} onClick={() => setF({ ...f, game: g })}>{GAME_LABEL[g]}</button>)}</div></div>
            <div className="v3-field"><label htmlFor="am-t1">Команда 1</label><input id="am-t1" required maxLength={200} value={f.t1} onChange={(e) => setF({ ...f, t1: e.target.value })} placeholder="NAVI" autoComplete="off" /></div>
            <div className="v3-field"><label htmlFor="am-t2">Команда 2</label><input id="am-t2" required maxLength={200} value={f.t2} onChange={(e) => setF({ ...f, t2: e.target.value })} placeholder="FaZe" autoComplete="off" /></div>
            <div className="v3-field v3-span2"><label htmlFor="am-tour">Турнір</label><input id="am-tour" maxLength={500} value={f.tour} onChange={(e) => setF({ ...f, tour: e.target.value })} placeholder="Необов’язково" autoComplete="off" /></div>
            <div className="v3-field"><label id="am-d">Дата</label><DateField id="am-date" labelledBy="am-d" required value={f.date} onChange={(v) => setF({ ...f, date: v })} /></div>
            <div className="v3-field"><label htmlFor="am-time">Час (Київ)</label><input id="am-time" required inputMode="numeric" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" title="Година й хвилини, напр. 19:30" placeholder="19:00" maxLength={5} value={f.time} onChange={(e) => setF({ ...f, time: hhmmInput(e.target.value) })} /></div>
            <div className="v3-field v3-span2"><span className="v3-label" id="am-bo">Формат</span><div className="v3-chipset" role="group" aria-labelledby="am-bo">{["BO1", "BO2", "BO3", "BO5"].map((b) => <button key={b} type="button" className={f.bo === b ? "is-on" : ""} aria-pressed={f.bo === b} onClick={() => setF({ ...f, bo: b })}>{b}</button>)}</div></div>
          </fieldset>
          {err && <span className="v3-field-error" role="alert">{err}</span>}
          <div className="v3-modal-foot">
            <span className="v3-hint">Запишеться в журнал дій</span>
            <div className="v3-modal-actions">
              <button type="button" className="v3-btn v3-btn-ghost" onClick={() => onOpenChange(false)} disabled={busy}>Скасувати</button>
              <button type="submit" className="v3-btn v3-btn-primary" disabled={busy}>{busy ? "Додаємо…" : "Додати матч"}</button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** «Об’єднати з…»: інша команда (або написання) стає псевдонімом цієї. */
function MergeTeamDialog({ team, teams, busy, onClose, onPick }: { team: Team | null; teams: Team[]; busy: boolean; onClose: () => void; onPick: (t: Team, names: string[]) => void }) {
  const [q, setQ] = useState("");
  useEffect(() => { setQ(""); }, [team]);
  if (!team) return <Dialog open={false} onOpenChange={onClose}><DialogContent className="v3-modal" /></Dialog>;
  const n = q.trim().toLowerCase();
  const list = teams.filter((t) => t.game === team.game && t.key !== team.key && (!n || `${t.name} ${t.variants.join(" ")}`.toLowerCase().includes(n))).slice(0, 8);
  const free = q.trim() && !teams.some((t) => t.game === team.game && baseNorm(t.name) === baseNorm(q)) ? q.trim() : "";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="v3-modal sm:max-w-[480px]">
        <DialogTitle className="v3-modal-title">Об’єднати з «{team.name}»</DialogTitle>
        <DialogDescription className="v3-modal-sub">Обрана команда стане іншим написанням «{team.name}» ({GAME_LABEL[team.game]}).</DialogDescription>
        <label className="v3-search v3-mx-msearch"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Пошук команди" placeholder="Назва або написання" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></label>
        <ul className="v3-mx-pick">
          {list.map((t) => <li key={t.key}><button type="button" disabled={busy} onClick={() => onPick(team, [t.name, ...t.variants])}><Logo src={t.logo} name={t.name} size={28} /><span><strong>{t.name}</strong><small>{t.matches} {plural(t.matches, "матч", "матчі", "матчів")}{t.variants.length ? ` · також ${t.variants.join(", ")}` : ""}</small></span></button></li>)}
          {free && <li><button type="button" disabled={busy} onClick={() => onPick(team, [free])}><span className="v3-mx-lg is-ini" style={{ width: 28, height: 28 }} aria-hidden="true"><Plus size={14} /></span><span><strong>Додати написання «{free}»</strong><small>Якого ще немає в стрічках</small></span></button></li>}
          {!list.length && !free && <li className="v3-mx-pnote">Інших команд {GAME_LABEL[team.game]} не знайдено.</li>}
        </ul>
        <div className="v3-modal-foot"><span className="v3-hint">Запишеться в журнал дій</span><div className="v3-modal-actions"><button type="button" className="v3-btn v3-btn-ghost" onClick={onClose} disabled={busy}>Скасувати</button></div></div>
      </DialogContent>
    </Dialog>
  );
}
