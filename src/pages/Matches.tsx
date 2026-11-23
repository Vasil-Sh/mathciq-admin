import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { publishMatchCounts } from "@/lib/navCounts";
import { useSearchParams } from "react-router-dom";
import { Activity, AlertTriangle, CalendarX2, CalendarDays, Check, ChevronDown, ChevronRight, CircleDollarSign, ExternalLink, ListFilter, Filter, History, Info, Send, Upload, LayoutGrid, Link2, List, Play, Plus, RefreshCw, RotateCcw, Search, Shield, Square, Trash2, Users, WifiOff, X } from "lucide-react";
import { toast } from "sonner";
import PillTrack from "@/components/PillTrack";
import RollingNumber from "@/components/RollingNumber";
import UserAvatar from "@/components/UserAvatar";
import { ConfirmDialog, ConfirmSheet } from "@/components/ui/confirm-dialog";
import { Dropdown } from "@/components/ui/dropdown";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DateField } from "@/components/ui/date-field";
import { useMedia, useOnline } from "@/hooks/useMediaOnline";
import { fetchUserBets, fetchUsersOverview } from "@/lib/adminBetsApi";
import {
  createAlias, createManualMatch, deleteAlias, deleteManualMatch, fetchAliases, fetchAvailability, fetchFeeds, fetchHistory, fetchLinks, fetchOverrides,
  fetchHiddenTeams, fetchTeamLogos, saveTeamLogo, deleteTeamLogo, logoFileToDataUrl, logoNorm, fetchDistinct, addDistinct, removeDistinct, type DistinctPair, fetchParserEvents, fetchTeamCatalog, hideTeam, type HiddenTeam, linkMatch, unhideTeam, logoKey, patchMatch, rerunParser, resetMatch, startParser, stopParser, resolveLogos, type AdminStatus, type HourStat, type MatchOverride, type ParserEvent, type TeamAlias,
} from "@/lib/adminMatchesApi";
import { fetchParsers, PARSER_ISSUE, PARSER_NAMES, parserHealth, plural, type ParserState } from "@/lib/dashboardInsights";
import {
  addDays, ago, baseNorm, betMatches, dayShort, GAME_LABEL, initials, isFallbackLogo, isoToKyiv, kyivDay, kyivToIso, linkKey, manualGroups, mergeCatalog, normTeam, setAliases, similarity, STATUS_LABEL, teamsFrom,
  type CatalogTeam, type Game, type ManualGroup, type Match, type MStatus, type Team,
} from "@/lib/matchesModel";
import type { AdminUserBet } from "@/types";
import { usePageSearch, isPhoneWidth } from "@/lib/pageSearch";

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
const PARSER_META: Record<string, { ini: string; color: string; site: string; game: string; feed: Game | "hltv" | "oddspapi" | "opendota" | "liquipedia" }> = {
  hltv_scraper: { ini: "HL", color: "#2450c4", site: "hltv.org", game: "CS2", feed: "hltv" },
  tipsgg_fetch_cs2_matches: { ini: "TI", color: "#7a4fd0", site: "tips.gg", game: "CS2", feed: "cs2" },
  tipsgg_fetch_dota2_matches: { ini: "TI", color: "#c2410c", site: "tips.gg", game: "Dota 2", feed: "dota2" },
  liquipedia: { ini: "LP", color: "#2b6cb0", site: "liquipedia.net", game: "CS2 · Dota 2", feed: "liquipedia" },
  oddspapi: { ini: "OP", color: "#0f7b5f", site: "oddspapi.io", game: "коефіцієнти", feed: "oddspapi" },
  opendota: { ini: "OD", color: "#a33a2b", site: "opendota.com", game: "Dota 2 · рахунок", feed: "opendota" },
};
const hhmm = () => new Date().toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
const resLabel = (r: string) => (r === "Win" ? ["Виграш", "v3-tag-green"] : r === "Loss" ? ["Програш", "v3-tag-red"] : ["Очікує", "v3-tag-amber"]);

function Logo({ src, name, size = 24 }: { src: string | null; name: string; size?: number }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) return <span className="v3-mx-lg is-ini" style={{ width: size, height: size }} aria-hidden="true">{initials(name)}</span>;
  return <img className="v3-mx-lg" src={src} alt="" width={size} height={size} style={{ padding: Math.max(2, Math.round(size * 0.13)) }} loading="lazy" onError={() => setBad(true)} />;
}
function GameIco({ g }: { g: Game }) {
  return <i className={`v3-mx-gm is-${g}`} aria-hidden="true" />;
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
  const phone = useMedia("(max-width: 767px)");
  const online = useOnline();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => { const t = params.get("tab"); return t === "parsers" || t === "manual" || t === "teams" ? t : "matches"; });
  // the phone menu links to /matches?tab=… — follow it when Matches is already open
  useEffect(() => { const t = params.get("tab"); setTab(t === "parsers" || t === "manual" || t === "teams" ? t : "matches"); }, [params]);
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
  // Телефон (design MatchesMobile*): список або плитки, шторка «Фільтр», правка в окремій шторці
  const [mView, setMView] = useState<"list" | "grid">(() => { try { return localStorage.getItem("mx-match-view") === "grid" ? "grid" : "list"; } catch { return "list"; } });
  const pickView = (v: "list" | "grid") => { setMView(v); setRk((x) => x + 1); try { localStorage.setItem("mx-match-view", v); } catch { /* private mode */ } };
  const [filtOpen, setFiltOpen] = useState(false);
  const [phoneEdit, setPhoneEdit] = useState(false);
  // Парсери
  const [running, setRunning] = useState<Record<string, "busy" | "done">>({});
  // Додані вручну
  const [selGroup, setSelGroup] = useState<string | null>(null);
  // Команди
  const [tq, setTq] = useState("");
  const pageSearch = usePageSearch(tab === "teams" ? "Команда або псевдонім" : "Команда або турнір");
  useEffect(() => { if (!isPhoneWidth()) return; if (tab === "teams") setTq(pageSearch.q); else { setQ(pageSearch.q); setRk((x) => x + 1); } }, [pageSearch.q]); // eslint-disable-line react-hooks/exhaustive-deps
  const [tf, setTf] = useState<"all" | "dup" | "logo">("all");
  const [tg, setTg] = useState<"all" | Game>("all");
  const [tLimit, setTLimit] = useState(80);
  // Телефон: команди списком або блоками по дві в ряд (запам’ятовуємо вибір)
  const [tView, setTView] = useState<"list" | "grid">(() => { try { const v = localStorage.getItem("mx-team-view"); return v === "grid" || v === "list" ? v : isPhoneWidth() ? "grid" : "list"; } catch { return "list"; } });
  const flipView = () => setTView((v) => { const n = v === "list" ? "grid" : "list"; try { localStorage.setItem("mx-team-view", n); } catch { /* private mode */ } return n; });
  useEffect(() => setTLimit(80), [tq, tf, tg]);
  // Усі команди з пакетів логотипів — довідник не тільки з тих, що грали останні 30 днів
  const [catalog, setCatalog] = useState<CatalogTeam[]>([]);
  // Команди, видалені з довідника (розпалися, але лишились у пакеті логотипів)
  const [hidden, setHidden] = useState<HiddenTeam[]>([]);
  useEffect(() => { fetchHiddenTeams().then(setHidden).catch(() => {}); fetchDistinct().then(setDistinct).catch(() => {}); fetchTeamLogos().then(setOwnLogos).catch(() => {}); }, []);
  useEffect(() => { let off = false; fetchTeamCatalog().then((c) => { if (!off) setCatalog(c); }).catch(() => {}); return () => { off = true; }; }, []);
  const [selTeam, setSelTeam] = useState<string | null>(null);
  // Адмінські дані: псевдоніми, правки, рішення, журнал парсерів
  const [aliases, setAliasList] = useState<TeamAlias[]>([]);
  const [overrides, setOverrides] = useState<MatchOverride[] | null>(null);
  const [decided, setDecided] = useState<Set<string>>(new Set());
  const [events, setEvents] = useState<Record<string, ParserEvent[]>>({});
  const [avail, setAvail] = useState<Record<string, HourStat[]>>({});
  const [hourFor, setHourFor] = useState<{ p: string; k: number } | null>(null);
  const [logFor, setLogFor] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ id: string; st: AdminStatus; date: string; time: string; s1: string; s2: string } | null>(null);
  const [saving, setSaving] = useState<string>("");
  const [ask, setAsk] = useState<string>("");
  const [addOpen, setAddOpen] = useState(false);
  const [mergeFor, setMergeFor] = useState<Team | null>(null);
  // phone confirmations (design): stop a parser, delete a match, merge a manual match; picker when no similar official match
  const [stopAsk, setStopAsk] = useState<string | null>(null);
  const [delAsk, setDelAsk] = useState<Match | null>(null);
  const [mergeAsk, setMergeAsk] = useState<{ x: ManualGroup; target: Match } | null>(null);
  const [pickFor, setPickFor] = useState<ManualGroup | null>(null);
  const [distinct, setDistinct] = useState<DistinctPair[]>([]);
  // «Змінити логотип»: game:norm → URL of the admin's own logo
  const [ownLogos, setOwnLogos] = useState<Record<string, string>>({});
  const logoInput = useRef<HTMLInputElement>(null);
  const [logoFor, setLogoFor] = useState<Team | null>(null);

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
  const teams = useMemo(() => {
    const off = new Set(hidden.map((h) => `${h.game}:${normTeam(h.name)}`));
    const not = new Set(distinct.map((d) => `${d.game}:${normTeam(d.name)}|${d.variant}`));
    const own = (t: Team) => [t.name, ...t.aliases, ...t.variants].map((n) => ownLogos[`${t.game}:${logoNorm(n)}`]).find(Boolean);
    return mergeCatalog(teamsFrom(known), catalog).filter((t) => !off.has(t.key)).map((t) => {
      const v = t.variants.some((x) => not.has(`${t.key}|${x}`)) ? t.variants.filter((x) => !not.has(`${t.key}|${x}`)) : t.variants;
      const lg = own(t);
      return v === t.variants && !lg ? t : { ...t, variants: v, logo: lg || t.logo, ownLogo: !!lg };
    });
  }, [known, catalog, aliases, hidden, distinct, ownLogos]);
  /** Upload the picked image as this team's logo — for every spelling the directory knows. */
  const uploadLogo = async (t: Team, file: File) => {
    setSaving(`logo:${t.key}`);
    try {
      const dataUrl = await logoFileToDataUrl(file);
      const names = [t.name, ...t.aliases, ...t.variants, ...aliases.filter((a) => a.game === t.game && baseNorm(a.canonical) === baseNorm(t.name)).map((a) => a.alias)];
      const url = await saveTeamLogo({ game: t.game, names, dataUrl });
      setOwnLogos((m) => { const n = { ...m }; for (const x of names) n[`${t.game}:${logoNorm(x)}`] = url; return n; });
      toast.success("Логотип оновлено", { description: `${t.name} — у матчах, історії й профілях застосунку` });
      load();
    } catch (e) { toast.error("Не вдалося змінити логотип", { description: errText(e) }); }
    setSaving("");
  };
  const resetLogo = async (t: Team) => {
    setSaving(`logo:${t.key}`);
    try {
      const names = [t.name, ...t.aliases, ...t.variants].filter((n) => ownLogos[`${t.game}:${logoNorm(n)}`]);
      await deleteTeamLogo(t.game, names);
      setOwnLogos((m) => { const n = { ...m }; for (const x of names) delete n[`${t.game}:${logoNorm(x)}`]; return n; });
      toast.success("Повернуто логотип із пакета", { description: t.name });
      load();
    } catch (e) { toast.error("Не вдалося повернути логотип", { description: errText(e) }); }
    setSaving("");
  };
  const ovOf = (m: Match) => overrides?.find((o) => o.game === m.game && o.matchId === m.raw) || null;

  const todayM = all.filter((m) => m.day === today);
  const liveN = all.filter((m) => m.status === "live").length;
  // Matches each parser brought for today (HLTV / tips.gg CS2 / tips.gg Dota 2)
  const cntFor = (name: string, list: Match[] = todayM) => { const f = (PARSER_META[name] || { feed: "cs2" as const }).feed; return f === "hltv" ? list.filter((m) => m.source === "HLTV").length : f === "liquipedia" ? list.filter((m) => m.source === "Liquipedia").length : f === "oddspapi" ? list.filter((m) => m.odds || m.source === "OddsPapi").length : f === "opendota" ? list.filter((m) => m.game === "dota2" && (m.source === "Liquipedia" || m.source === "OddsPapi")).length : list.filter((m) => m.game === f && m.source === "tips.gg").length; };
  /** down / flaky from the breaker; idle = no errors, but nothing came in today (e.g. the source blocks us). */
  const pState = (p: ParserState): "paused" | "down" | "flaky" | "idle" | "ok" => { if (p.paused) return "paused"; const h = parserHealth(p); return h !== "ok" ? h : matches && cntFor(p.name) === 0 ? "idle" : "ok"; };
  const down = (parsers || []).filter((p) => { const st = pState(p); return st !== "ok" && st !== "paused"; });
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

  const [stopping, setStopping] = useState("");
  const setPaused = (name: string, paused: boolean) => setParsers((ps) => ps && ps.map((x) => (x.name === name ? { ...x, paused, pausedAt: paused ? new Date().toISOString() : "", pausedBy: paused ? x.pausedBy : "" } : x)));
  const stopOrStart = async (name: string, stop: boolean) => {
    if (stopping) return;
    setStopping(name); setPaused(name, stop);
    try {
      await (stop ? stopParser(name) : startParser(name));
      if (stop) toast.success(`${PARSER_NAMES[name] || name} зупинено`, { description: "Він не звертається до джерела, застосунок показує останні збережені дані", action: { label: "Запустити", onClick: () => stopOrStart(name, false) } });
      else toast.success(`${PARSER_NAMES[name] || name} запущено`, { description: "Наступний запит до джерела піде як завжди" });
      await load();
    } catch (e) {
      setPaused(name, !stop);
      toast.error(stop ? "Не вдалося зупинити" : "Не вдалося запустити", { description: e instanceof Error ? e.message : "Сервер не відповів" });
    }
    setStopping("");
  };
  /** «Надіслати»: the log as text — the share sheet (Telegram etc.) on the phone, otherwise Telegram's share link / the clipboard. */
  const shareLog = async (name: string) => {
    const p = parsers?.find((x) => x.name === name);
    const fmt = (iso: string) => new Date(iso).toLocaleString("uk-UA", { timeZone: "Europe/Kyiv", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    const head = [
      `MatchIQ · лог ${PARSER_NAMES[name] || name} · ${fmt(new Date().toISOString())} (Київ)`,
      p ? `Стан: ${p.paused ? "зупинено вручну" : p.open ? "помилка (запобіжник)" : "працює"} · збоїв за 24 год: ${p.failures24h}${p.lastFailure ? ` · останній збій ${fmt(p.lastFailure)}` : ""}` : "",
      matches ? `Матчів сьогодні з цього джерела: ${cntFor(name)}` : "",
    ].filter(Boolean);
    const lines = (events[name] || []).map((e) => `${fmt(e.createdAt)}  ${EV_LABEL[e.event]}${e.message && e.message !== "OK" ? ` · ${e.message}` : ""}`);
    const text = [...head, "", ...lines].join("\n");
    const title = `Лог ${PARSER_NAMES[name] || name}`;
    try {
      if (navigator.share) {
        // a long log goes as a .txt file when the device can share files (Telegram shows it as a document)
        const file = new File([text], `matchiq-${name}-log.txt`, { type: "text/plain" });
        if (text.length > 3500 && navigator.canShare?.({ files: [file] })) await navigator.share({ title, files: [file] });
        else await navigator.share({ title, text });
        return;
      }
    } catch (e) { if ((e as Error)?.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(text); toast.success("Лог скопійовано", { description: "Відкриваємо Telegram — вставте його в чат" }); } catch { /* no clipboard: Telegram's own share link still carries the start of the text */ }
    window.open(`https://t.me/share/url?url=${encodeURIComponent(" ")}&text=${encodeURIComponent(text.slice(0, 3000))}`, "_blank", "noopener");
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
      setEdit(null); setPhoneEdit(false);
      toast.success("Правку збережено", { description: `${m.t1} vs ${m.t2} · застосунок показує її замість даних ${m.source}` });
    } catch (e) { toast.error("Не вдалося зберегти правку", { description: errText(e) }); }
    setSaving("");
  };
  const resetEdit = async (m: Match) => {
    setSaving(m.id);
    try {
      await resetMatch(m.game, m.raw);
      await Promise.all([load(), loadAdmin()]);
      setEdit(null); setPhoneEdit(false);
      toast.success("Правку скинуто", { description: `Знову дані з ${m.source}` });
    } catch (e) {
      if ((e as { status?: number })?.status === 404) { setEdit(null); toast("Ручних правок немає", { description: "Матч і так показує дані парсера" }); }
      else toast.error("Не вдалося скинути правку", { description: errText(e) });
    }
    setSaving("");
  };
  const [delTeam, setDelTeam] = useState<Team | null>(null);
  const removeTeam = async (t: Team) => {
    setSaving(t.key);
    try {
      const h = await hideTeam({ game: t.game, name: t.name });
      setHidden((xs) => [...xs.filter((x) => x.id !== h.id), h]);
      setDelTeam(null); setSelTeam(null); setSheet(false);
      toast.success("Команду видалено з довідника", {
        description: `${t.name} · ${GAME_LABEL[t.game]}`,
        action: { label: "Повернути", onClick: async () => { try { await unhideTeam(h.id); setHidden((xs) => xs.filter((x) => x.id !== h.id)); toast.info("Команду повернуто", { description: t.name }); } catch (e) { toast.error("Не вдалося повернути", { description: errText(e) }); } } },
      });
    } catch (e) { toast.error("Не вдалося видалити команду", { description: errText(e) }); }
    setSaving("");
  };
  /** «Видалити матч» (phone, after the confirmation): a manual one is deleted; a feed one is hidden from the schedule — undo in the toast. */
  const removeMatch = async (m: Match) => {
    if (m.manual) { setAsk(`del:${m.id}`); await removeManual(m, true); setDelAsk(null); return; }
    const was = ovOf(m);
    setSaving(m.id);
    try {
      await patchMatch(m.game, m.raw, { status: "hidden", startDate: null, score1: null, score2: null });
      setDelAsk(null); setSelId(null); setSheet(false);
      await load();
      toast.success("Матч видалено", {
        description: `${m.t1} vs ${m.t2} більше не показується в застосунку`,
        action: { label: "Повернути", onClick: async () => {
          try {
            if (was) await patchMatch(m.game, m.raw, { status: was.status, startDate: was.startDate, score1: was.score1, score2: was.score2 });
            else await resetMatch(m.game, m.raw);
            await load(); toast.info("Матч повернуто", { description: `${m.t1} vs ${m.t2}` });
          } catch (e) { toast.error("Не вдалося повернути", { description: errText(e) }); }
        } },
      });
    } catch (e) { toast.error("Не вдалося видалити матч", { description: errText(e) }); }
    setSaving("");
  };
  const removeManual = async (m: Match, sure = false) => {
    if (!sure && ask !== `del:${m.id}`) { setAsk(`del:${m.id}`); window.setTimeout(() => setAsk((a) => (a === `del:${m.id}` ? "" : a)), 4000); return; }
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
  const decide = async (x: ManualGroup, kind: "merge" | "unlink", target: Match | null = x.official) => {
    setSaving(`${kind}:${x.key}`);
    try {
      await linkMatch(kind, { game: x.game, team1: x.t1, team2: x.t2, date: x.day, officialId: kind === "merge" ? target?.raw ?? null : null });
      setMergeAsk(null); setPickFor(null);
      setDecided((d) => new Set(d).add(linkKey(x.game, x.t1, x.t2, x.day)));
      setSelGroup(null); setSheet(false);
      toast.success(kind === "merge" ? "Об’єднано" : "Позначено як інший матч", { description: kind === "merge" && target ? `${x.t1} vs ${x.t2} → ${target.t1} vs ${target.t2}` : `${x.t1} vs ${x.t2} · ${x.bets.length} ${plural(x.bets.length, "запис", "записи", "записів")}` });
    } catch (e) { toast.error("Не вдалося зберегти рішення", { description: errText(e) }); }
    setSaving("");
  };

  // ── Команди: псевдоніми ──
  const addAliases = async (t: Team, names: string[]) => {
    // exact spelling: «Parivision» for «PARIVISION» differs only in case, and is still a spelling to record
    const list = [...new Set(names.map((n) => n.trim()).filter((n) => n && n !== t.name))];
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
    { k: "parsers", label: "Парсери", v: parsers ? (!parsers.length ? "Немає" : !down.length && parsers.every((p) => p.paused) ? "Зупинені" : down.length ? `${down.length} ${plural(down.length, "проблема", "проблеми", "проблем")}` : "Працюють") : "—", n: parsers ? (!parsers.length ? "бекенд не повідомив про джерела" : !down.length && parsers.some((p) => p.paused) ? `${parsers.filter((p) => p.paused).length} з ${parsers.length} зупинено вручну` : down.length ? down.map(issueText).join(" · ") : `${parsers.reduce((a, p) => a + p.failures24h, 0)} збоїв за 24 год`) : "…", bad: down.length > 0, go: () => setTab("parsers"), on: tab === "parsers" },
    { k: "bets", label: "Записів на сьогодні", v: todayBets == null ? "…" : String(todayBets), n: todayBets == null ? "рахуємо зі ставок користувачів" : `на ${todayM.length} ${plural(todayM.length, "матч", "матчі", "матчів")} сьогодні`, go: undefined, on: false },
    { k: "manual", label: "Додані вручну", v: bets ? String(groups.length) : "…", n: bets ? (groups.length ? "немає в стрічках парсерів" : "усі записи на своїх матчах") : "шукаємо в записах", amber: groups.length > 0, go: () => setTab("manual"), on: tab === "manual" },
  ];
  const tabN: Record<Tab, number | null> = { matches: matches ? todayM.length : null, parsers: parsers ? down.length || parsers.length : null, manual: bets ? groups.length : null, teams: matches ? teams.length : null };
  // phone: «Матчі · N» counts every match in the feed (all days), not just today
  const tabCount = (k: Tab) => (phone && k === "matches" && matches ? all.filter((m) => game === "all" || m.game === game).length : tabN[k]);
  useEffect(() => { publishMatchCounts(tabN); }, [tabN.matches, tabN.parsers, tabN.manual, tabN.teams]); // eslint-disable-line react-hooks/exhaustive-deps

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
                  <div className="v3-field"><label htmlFor={`ed-t-${m.id}`}>Час</label><input id={`ed-t-${m.id}`} {...timeAttrs()} pattern="([01][0-9]|2[0-3]):[0-5][0-9]" title="Година й хвилини, напр. 19:30" placeholder="19:00" maxLength={5} value={f.time} onChange={(e) => setForm(m, { time: hhmmInput(e.target.value) })} /></div>
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

  const empty = (title: string, text: string, icon: ReactNode = <Search size={22} />) => <div className="v3-pay-empty v3-mx-none"><span className="v3-empty-ic v3-float v3-halo" aria-hidden="true">{icon}</span><strong>{title}</strong><span>{text}</span></div>;
  const skelRows = (n: number) => Array.from({ length: n }, (_, i) => <div key={i} className="v3-pay-row v3-mx-row is-skel" aria-hidden="true"><span className="v3-skel v3-skel-light" /><span className="v3-skel v3-skel-light" style={{ width: "70%" }} /><span className="v3-skel v3-skel-light" /><span className="v3-skel v3-skel-light" /><span className="v3-skel v3-skel-light" style={{ height: 22, borderRadius: 999 }} /><span className="v3-skel v3-skel-light" /><span className="v3-skel v3-skel-light" /></div>);
  const dayOpts = [{ key: "today" as Day, label: "Сьогодні" }, { key: "tomorrow" as Day, label: "Завтра" }, { key: "week" as Day, label: "Тиждень" }];
  const gameOpts = [{ value: "all" as const, label: "CS2 і Dota 2" }, { value: "cs2" as const, label: "CS2" }, { value: "dota2" as const, label: "Dota 2" }];
  const stOpts = [{ value: "all" as const, label: "Усі статуси" }, ...(["plan", "live", "done"] as MStatus[]).map((s) => ({ value: s, label: `${STATUS_LABEL[s]} · ${all.filter((m) => inDay(m, day) && m.status === s).length}` }))];
  const noMatchesText = needle ? `За «${q.trim()}» матчів немає.` : day === "today" ? "На сьогодні в стрічках матчів немає." : "У стрічках поки немає матчів на ці дні.";

  // ── Телефон: «Матчі» (designs MatchesMobile / Grid / Filter / Detail / Edit / Search / Empty) ──
  const uahSum = (bs: UBet[]) => `${Math.round(bs.reduce((a, b) => a + (Number(b.amount) || 0), 0)).toLocaleString("uk-UA")} ₴`;
  const gChip = (g: Game) => <span className={`v3-mxp-g is-${g}`}>{GAME_LABEL[g]}</span>;
  const head = (m: Match) => m.status === "live" ? <span className="v3-mxp-live"><i aria-hidden="true" />НАЖИВО</span>
    : m.status === "plan" ? <span className="v3-mxp-time">{day === "today" && m.day === today ? m.time : `${dayShort(m.day)} · ${m.time}`}</span>
    : <span className={`v3-mxp-st is-${m.status}`}>{STATUS_LABEL[m.status]}</span>;
  const hasScore = (m: Match) => m.s1 != null && m.s2 != null && (m.status !== "plan" || (m.s1 || 0) + (m.s2 || 0) > 0);
  const chips = (m: Match) => { const bs = bets ? betsFor(m) : []; const ov = ovOf(m); return (bs.length > 0 || ov) ? <span className="v3-mxp-chips">
    {bs.length > 0 && <span className="v3-mxp-bets"><CircleDollarSign size={13} aria-hidden="true" />{mView === "grid" ? `${bs.length} · ${uahSum(bs)}` : `${bs.length} ${plural(bs.length, "ставка", "ставки", "ставок")} · ${uahSum(bs)}`}</span>}
    {ov && mView === "list" && <span className="v3-mxp-ov">Змінено вручну</span>}
  </span> : null; };
  const openM = (m: Match) => { setSelId(m.id); setPhoneEdit(false); setSheet(true); };
  const mCard = (m: Match, i: number) => {
    const sc = hasScore(m), dim = m.status === "moved" || m.status === "off";
    return mView === "grid" ? (
      <button key={m.id} type="button" className={`v3-mxp-tile is-${m.status}`} style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }} onClick={() => openM(m)}>
        <span className="v3-mxp-th">{head(m)}{gChip(m.game)}</span>
        <span className="v3-mxp-tm"><Logo src={m.logo1} name={m.t1} size={30} /><b aria-label={sc ? `Рахунок ${m.s1}:${m.s2}` : "Рахунку ще немає"}>{sc ? `${m.s1} : ${m.s2}` : "– : –"}</b><Logo src={m.logo2} name={m.t2} size={30} /></span>
        <span className="v3-mxp-tn"><strong>{m.t1}</strong><strong>{m.t2}</strong></span>
        <small className="v3-mxp-tt">{m.tournament || GAME_LABEL[m.game]}</small>
        {chips(m)}
      </button>
    ) : (
      <button key={m.id} type="button" className={`v3-mxp-card is-${m.status}`} style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }} onClick={() => openM(m)}>
        <span className="v3-mxp-ch">{head(m)}{gChip(m.game)}<span className="v3-mxp-tour">{[m.tournament, m.bo].filter(Boolean).join(" · ")}</span><ChevronRight size={15} className="v3-mxp-chev" aria-hidden="true" /></span>
        {[[m.t1, m.logo1, m.s1], [m.t2, m.logo2, m.s2]].map(([n, l, s], k) => (
          <span key={k} className={`v3-mxp-team${dim ? " is-dim" : ""}${m.status === "off" ? " is-off" : ""}`}><Logo src={l as string | null} name={n as string} size={22} /><strong>{n as string}</strong><b>{sc ? String(s) : ""}</b></span>
        ))}
        {chips(m)}
      </button>
    );
  };
  const groupsOf = (xs: Match[]) => {
    const live = xs.filter((m) => m.status === "live"), plan = xs.filter((m) => m.status === "plan"), rest = xs.filter((m) => m.status !== "live" && m.status !== "plan");
    return [["Наживо", live], [day === "today" ? "Сьогодні" : "Заплановані", plan], ["Завершені", rest]] as [string, Match[]][];
  };
  const fCount = (g: "all" | Game, s: "all" | MStatus) => all.filter((m) => inDay(m, day) && (g === "all" || m.game === g) && (s === "all" || m.status === s) && (!needle || `${m.t1} ${m.t2} ${m.tournament}`.toLowerCase().includes(needle))).length;
  /** How many cards the tiles show for «shown»: cut groups are rounded up to an even count. */
  const shownGrid = (() => { let left = shown, n = 0; for (const [, xs] of groupsOf(list)) { if (!xs.length || left <= 0) continue; let k = Math.min(left, xs.length); if (k < xs.length && k % 2) k++; left -= k; n += k; } return n; })();
  const phoneMatchesTab = (
    <div className="v3-mxp">
      <div className="v3-mxp-bar">
        <div className="v3-mxp-days" role="group" aria-label="День">{dayOpts.map((d) => <button key={d.key} type="button" className={day === d.key ? "is-on" : ""} aria-pressed={day === d.key} onClick={() => { setDay(d.key); setShown(12); setRk((x) => x + 1); }}>{d.label}{matches && <b>{dayN(d.key)}</b>}</button>)}</div>
        <button type="button" className={`v3-mxp-fbtn${game !== "all" || st !== "all" ? " is-on" : ""}`} aria-label="Фільтр" aria-haspopup="dialog" onClick={() => setFiltOpen(true)}><Filter size={16} aria-hidden="true" /></button>
        <div className="v3-mxp-view" role="group" aria-label="Вигляд"><button type="button" className={mView === "list" ? "is-on" : ""} aria-pressed={mView === "list"} aria-label="Списком" onClick={() => pickView("list")}><List size={15} aria-hidden="true" /></button><button type="button" className={mView === "grid" ? "is-on" : ""} aria-pressed={mView === "grid"} aria-label="Плитками" onClick={() => pickView("grid")}><LayoutGrid size={15} aria-hidden="true" /></button></div>
      </div>
      {needle && list.length > 0 && <p className="v3-mxp-found" role="status">Знайдено {list.length} · за командою або турніром</p>}
      {matches === null ? <div className="v3-mxp-list" aria-hidden="true">{Array.from({ length: 4 }, (_, i) => <div key={i} className="v3-mxp-card is-skel"><span className="v3-skel v3-skel-light" style={{ width: "50%" }} /><span className="v3-skel v3-skel-light" style={{ width: "40%" }} /><span className="v3-skel v3-skel-light" style={{ width: "40%" }} /></div>)}</div>
        : !list.length ? <div className="v3-mxp-none">
            <span className="v3-mxp-none-ic" aria-hidden="true">{needle ? <Search size={20} /> : <CalendarDays size={20} />}</span>
            <strong>{needle ? "Нічого не знайдено" : "Матчів немає"}</strong>
            <span>{needle ? `За «${q.trim()}» матчів немає.` : day === "today" ? "На сьогодні в стрічках матчів немає. Подивіться «Завтра» або «Тиждень»." : day === "tomorrow" ? "На завтра в стрічках матчів немає. Подивіться «Тиждень»." : "У стрічках поки немає матчів на ці дні."}</span>
            {needle ? <button type="button" onClick={() => { setQ(""); pageSearch.setQ(""); pageSearch.setOpen(false); }}>Скинути пошук</button>
              : game !== "all" || st !== "all" ? <button type="button" onClick={() => { setGame("all"); setSt("all"); }}>Скинути фільтр</button>
              : day !== "week" ? <button type="button" onClick={() => { setDay("week"); setRk((x) => x + 1); }}>Тиждень</button> : null}
          </div>
        : <div key={rk} className={`v3-mxp-list${mView === "grid" ? " is-grid" : ""}`}>{(() => { let i = 0; const out: ReactNode[] = []; let left = shown;
            for (const [title, xs] of groupsOf(list)) { if (!xs.length || left <= 0) continue;
              // tiles: a cut group keeps an even number of cards, so the last row has no hole
              let part = xs.slice(0, left); if (mView === "grid" && part.length < xs.length && part.length % 2) part = xs.slice(0, part.length + 1); left -= part.length;
              out.push(<p key={`h-${title}`} className="v3-mxp-gh">{title}</p>);
              out.push(<div key={`g-${title}`} className="v3-mxp-grp">{part.map((m) => mCard(m, i++))}</div>); }
            return out; })()}</div>}
      {(() => { const vis = Math.min(list.length, mView === "grid" ? shownGrid : shown); return list.length > vis && <button type="button" className="v3-mxp-more" onClick={() => setShown(vis + 12)}>Показати ще {Math.min(12, list.length - vis)}</button>; })()}
      <Dialog open={filtOpen} onOpenChange={setFiltOpen}>
        <DialogContent className="v3-sheet v3-pay-sheet v3-mxp-filt">
          <div className="v3-mxp-fh"><DialogTitle>Фільтр</DialogTitle>{(game !== "all" || st !== "all") && <button type="button" onClick={() => { setGame("all"); setSt("all"); setRk((x) => x + 1); }}>Скинути</button>}</div>
          <DialogDescription className="sr-only">Гра і статус матчів</DialogDescription>
          <span className="v3-mxp-fl">Гра</span>
          <div className="v3-mxp-seg" role="group" aria-label="Гра"><PillTrack active={game} />{([["all", "Усі"], ["cs2", "CS2"], ["dota2", "Dota 2"]] as const).map(([k, l]) => <button key={k} type="button" className={game === k ? "is-on" : ""} aria-pressed={game === k} onClick={() => { setGame(k); setRk((x) => x + 1); }}>{l}</button>)}</div>
          <span className="v3-mxp-fl">Статус</span>
          <div className="v3-mxp-sts" role="group" aria-label="Статус">{([["all", "Усі статуси"], ["live", STATUS_LABEL.live], ["plan", STATUS_LABEL.plan], ["done", STATUS_LABEL.done], ["moved", STATUS_LABEL.moved]] as [("all" | MStatus), string][]).map(([k, l]) => { const n = fCount(game, k); return (
            <button key={k} type="button" className={`${st === k ? "is-on" : ""}${n === 0 && k !== "all" ? " is-zero" : ""}`} aria-pressed={st === k} onClick={() => { setSt(k); setRk((x) => x + 1); }}>{k !== "all" && <i className={`is-${k}`} aria-hidden="true" />}<span>{l}</span><b>{n}</b>{st === k && <Check size={16} aria-hidden="true" />}</button>
          ); })}</div>
          <button type="button" className="v3-mxp-apply" onClick={() => setFiltOpen(false)}>Показати {list.length} {plural(list.length, "матч", "матчі", "матчів")}</button>
        </DialogContent>
      </Dialog>
    </div>
  );
  const phoneDetail = (m: Match) => {
    const bs = betsFor(m), sc = hasScore(m), ov = ovOf(m);
    return (
      <div className="v3-mxp-det">
        <div className="v3-mxp-dh">{head(m)}{gChip(m.game)}</div>
        <div className="v3-mxp-vs">
          <span><Logo src={m.logo1} name={m.t1} size={44} /><strong>{m.t1}</strong></span>
          <b aria-label={sc ? `Рахунок ${m.s1}:${m.s2}` : "Рахунку ще немає"}>{sc ? `${m.s1} : ${m.s2}` : "– : –"}</b>
          <span><Logo src={m.logo2} name={m.t2} size={44} /><strong>{m.t2}</strong></span>
        </div>
        <dl className="v3-mxp-kv">
          <div><dt>Турнір</dt><dd>{[m.tournament || "не вказано", m.bo].filter(Boolean).join(" · ")}</dd></div>
          <div><dt>Початок</dt><dd>{m.day === today ? m.time : `${dayShort(m.day)} · ${m.time}`} · Київ</dd></div>
          <div><dt>Джерело</dt><dd>{m.link ? <a href={m.link} target="_blank" rel="noreferrer">{m.source}<ExternalLink size={12} aria-hidden="true" /></a> : m.source}{updatedAt ? ` · оновлено ${updatedAt}` : ""}</dd></div>
          {ov && <div><dt>Правка</dt><dd>@{ov.decidedBy}</dd></div>}
        </dl>
        <p className="v3-mxp-bh">Ставки користувачів · {bets ? bs.length : "…"}</p>
        {bs.length > 0 ? <div className="v3-mxp-bl">{bs.slice(0, 8).map((b) => <div key={b.id}><span><b>@{b.username}</b> {b.betType} · {b.odds}</span><strong>{b.currency === "USD" ? `${Number(b.amount).toLocaleString("uk-UA")} ₴` : `${Number(b.amount).toLocaleString("uk-UA")} ₴`}</strong></div>)}{bs.length > 8 && <small>і ще {bs.length - 8}</small>}</div>
          : bets && <p className="v3-mxp-bnone">На цей матч ще ніхто не ставив.</p>}
        <div className="v3-mxp-acts">
          {!m.manual && <button type="button" className="is-grey" disabled={!online} onClick={() => setPhoneEdit(true)}>Редагувати</button>}
          <button type="button" className="is-red" disabled={!online || saving === m.id} onClick={() => setDelAsk(m)}>Видалити матч</button>
        </div>
      </div>
    );
  };
  const phoneEditBody = (m: Match) => {
    const f = formOf(m), ov = ovOf(m), busyM = saving === m.id;
    return (
      <form className="v3-mxp-ed" onSubmit={(e) => { e.preventDefault(); saveEdit(m); }}>
        <div className="v3-mxp-eh"><strong>Редагувати матч</strong><small>{m.t1} — {m.t2}{m.tournament ? ` · ${m.tournament}` : ""}</small></div>
        <p className="v3-mxp-enote"><AlertTriangle size={14} aria-hidden="true" />Ручна правка лежить поверх даних парсера. Нові дані з джерела її не перезапишуть.</p>
        <fieldset disabled={!online || busyM} className="v3-mxp-efs">
          <div className="v3-mxp-eg"><span className="v3-mxp-egt">Час і статус</span>
            <div className="v3-mxp-e2">
              <div className="v3-field"><label id={`pe-d-${m.id}`}>Дата</label><DateField id={`pe-date-${m.id}`} labelledBy={`pe-d-${m.id}`} value={f.date} onChange={(v) => setForm(m, { date: v })} /></div>
              <div className="v3-field"><label htmlFor={`pe-t-${m.id}`}>Час (Київ)</label><input id={`pe-t-${m.id}`} {...timeAttrs()} pattern="([01][0-9]|2[0-3]):[0-5][0-9]" placeholder="19:00" maxLength={5} value={f.time} onChange={(e) => setForm(m, { time: hhmmInput(e.target.value) })} /></div>
            </div>
            {!ov && <span className="v3-mxp-was">Зараз {m.time} у {m.source}</span>}
            <div className="v3-field v3-mxp-stf"><span className="v3-label" id={`pe-st-${m.id}`}>Статус</span>
              {/* chips right in the sheet — a second sheet on top of this one glitched on the phone */}
              <div className="v3-mxp-stchips" role="radiogroup" aria-labelledby={`pe-st-${m.id}`}>{[EDIT_ST[0], { key: "live" as AdminStatus, m: "live" as MStatus, label: "Наживо" }, ...EDIT_ST.slice(1)].map((x) => <button key={x.key} type="button" role="radio" aria-checked={f.st === x.key} className={f.st === x.key ? "is-on" : ""} onClick={() => setForm(m, { st: x.key })}>{x.label}</button>)}</div></div>
          </div>
          <div className="v3-mxp-eg"><span className="v3-mxp-egt">Рахунок</span>
            <div className="v3-mxp-e2">
              <div className="v3-field"><label htmlFor={`pe-s1-${m.id}`}>{m.t1}</label><input id={`pe-s1-${m.id}`} inputMode="numeric" pattern="[0-9]{0,2}" value={f.s1} onChange={(e) => setForm(m, { s1: e.target.value.replace(/\D/g, "").slice(0, 2) })} placeholder="—" /></div>
              <div className="v3-field"><label htmlFor={`pe-s2-${m.id}`}>{m.t2}</label><input id={`pe-s2-${m.id}`} inputMode="numeric" pattern="[0-9]{0,2}" value={f.s2} onChange={(e) => setForm(m, { s2: e.target.value.replace(/\D/g, "").slice(0, 2) })} placeholder="—" /></div>
            </div>
          </div>
          <div className="v3-mxp-acts">
            <button type="button" className="is-grey" onClick={() => { if (ov || overrides === null) resetEdit(m); else { setEdit(null); setPhoneEdit(false); } }}>{ov || overrides === null ? "Скинути правку" : "Скасувати"}</button>
            <button type="submit" className="is-green">{busyM ? "Зберігаємо…" : "Зберегти"}</button>
          </div>
          <p className="v3-mxp-hint">Запишеться в журнал дій</p>
        </fieldset>
      </form>
    );
  };

  const matchesTab = phone ? phoneMatchesTab : wide ? (
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
        })}</div> : empty("Матчів немає", noMatchesText, <CalendarX2 size={22} />)}
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
          )) : <li className="v3-wcard v3-pay-mnone">{empty("Матчів немає", noMatchesText, <CalendarX2 size={22} />)}</li>}
      </ul>
      {list.length > shown && <button type="button" className="v3-btn v3-btn-ghost-dark v3-btn-block" onClick={() => setShown(shown + 12)}>Показати ще {Math.min(12, list.length - shown)}</button>}
    </div>
  );

  // ── Телефон: «Парсери» (design MatchesMobileParsers): картка на джерело — стан, Стоп/Запустити, 24 години, два числа ──
  const hoursOf = (name: string) => { const a = avail[name] || []; const byHour = new Map(a.map((h) => [h.hour.slice(11, 13), h]));
    return Array.from({ length: 24 }, (_, i) => { const d = new Date(Date.now() - (23 - i) * 36e5); const hh = isoToKyiv(d.getTime()).slice(11, 13); const h = byHour.get(hh); return { hh, ok: h?.success ?? 0, bad: h?.failure ?? 0, s: !h ? "none" : h.failure && h.success ? "mix" : h.failure ? "bad" : "ok" }; }); };
  const hourText = (h: { ok: number; bad: number; s: string }) => h.s === "none" ? "запусків не було"
    : [h.ok ? `${h.ok} ${plural(h.ok, "успішний запуск", "успішні запуски", "успішних запусків")}` : "", h.bad ? `${h.bad} ${plural(h.bad, "збій", "збої", "збоїв")}` : ""].filter(Boolean).join(" · ");
  const phoneParsers = (
    <section className="v3-mxp-ps">
      {parsers === null ? Array.from({ length: 2 }, (_, i) => <div key={i} className="v3-mxp-pc is-skel" aria-hidden="true"><span className="v3-skel v3-skel-light" style={{ width: "40%" }} /><span className="v3-skel v3-skel-light" /><span className="v3-skel v3-skel-light" style={{ width: "70%" }} /></div>)
        : !parsers.length ? <div className="v3-mxp-none"><span className="v3-mxp-none-ic" aria-hidden="true"><Activity size={20} /></span><strong>Парсерів немає</strong><span>Бекенд не повідомив про жодне джерело матчів. Щойно парсер запуститься, він з’явиться тут.</span></div>
        : parsers.map((p, i) => {
          const meta = PARSER_META[p.name] || { ini: initials(p.name), color: "#5f6878", site: p.name, game: "", feed: "cs2" as const };
          const ps = pState(p), r = running[p.name], cnt = cntFor(p.name), hrs = hoursOf(p.name);
          return (
            <div key={p.name} className={`v3-mxp-pc${ps === "paused" ? " is-paused" : ""}`} style={{ animationDelay: `${i * 60}ms` }}>
              <div className="v3-mxp-ph">
                <strong>{PARSER_NAMES[p.name] || p.name}</strong>
                <span key={ps} className={`v3-mxp-pst is-${ps}`}><i aria-hidden="true" />{ps === "down" ? "Помилка" : ps === "flaky" ? "Збої" : ps === "idle" ? "Без даних" : ps === "paused" ? "Зупинено" : "Працює"}</span>
                <span className="v3-mxp-pa">
                  {events[p.name] && <button type="button" className="v3-mxp-plog" onClick={() => setLogFor(p.name)} aria-label={`Інформація й лог · ${PARSER_NAMES[p.name] || p.name}`}><Info size={16} aria-hidden="true" /></button>}
                  {p.paused ? <button type="button" className="v3-mxp-pgo" disabled={!online || stopping === p.name} onClick={() => stopOrStart(p.name, false)}><Play size={13} aria-hidden="true" />Запустити</button>
                    : <button type="button" className="v3-mxp-pstop" disabled={!online || stopping === p.name} onClick={() => setStopAsk(p.name)} aria-label={`Зупинити ${PARSER_NAMES[p.name] || p.name}`}><i aria-hidden="true"><Square size={7} fill="currentColor" /></i>Стоп</button>}
                </span>
              </div>
              <small className="v3-mxp-psub">{p.paused ? `${meta.game || meta.site} · зупинено вручну${p.pausedBy ? ` @${p.pausedBy}` : ""}` : ps === "down" || ps === "flaky" ? `${meta.game || meta.site} · не відповідає${p.lastFailure ? ` · ${ago(p.lastFailure)}` : ""}` : `${meta.game || meta.site} · ${matches ? `${cnt} ${plural(cnt, "матч", "матчі", "матчів")} сьогодні` : "…"}`}</small>
              {/* tap an hour — what happened in it */}
              <div className="v3-mxp-bars" role="group" aria-label="Останні 24 години">{hrs.map((h, k) => <button type="button" key={k} className={`is-${p.paused ? "none" : h.s}${hourFor?.p === p.name && hourFor.k === k ? " is-pick" : ""}`} aria-label={`${h.hh}:00 — ${hourText(h)}`} onClick={() => setHourFor(hourFor?.p === p.name && hourFor.k === k ? null : { p: p.name, k })} />)}</div>
              {hourFor?.p === p.name && hrs[hourFor.k] && <div key={hourFor.k} className={`v3-mxp-hour is-${hrs[hourFor.k].s}`} role="status" style={{ ["--x" as string]: `${(hourFor.k + .5) / 24 * 100}%` }}><b>{hrs[hourFor.k].hh}:00–{String((+hrs[hourFor.k].hh + 1) % 24).padStart(2, "0")}:00</b><span>{hourText(hrs[hourFor.k])}</span></div>}
              <div className="v3-mxp-axis"><span>24 год тому</span><span>зараз</span></div>
              <div className="v3-mxp-ptiles">
                <div><span>Збоїв за 24 год</span><b className={p.failures24h > 0 ? "is-bad" : ""}>{p.failures24h}</b></div>
                <div><span>Останній збій</span><b>{p.lastFailure ? ago(p.lastFailure) : "—"}</b></div>
                <div><span>Зібрано матчів</span><b>{matches ? cntFor(p.name, all) : "…"}</b></div>
              </div>
              {/* OddsPapi only adds prices: where they get lost — schedule → priced → our matches */}
              {p.odds && !p.paused && <p className="v3-mxp-podds">У розкладі {p.odds.scheduled} · з коефіцієнтами {p.odds.priced} · у наших матчах {p.odds.matched}<small>Запитів {p.odds.used} з {p.odds.budget} за місяць{p.odds.oddsAt ? ` · коефіцієнти ${ago(p.odds.oddsAt)}` : p.odds.fixturesAt ? ` · розклад ${ago(p.odds.fixturesAt)}` : ""}</small></p>}
              {p.open && !p.paused && <button type="button" className="v3-mxp-prun" disabled={!online || r === "busy"} onClick={() => rerun(p.name)}>{r === "busy" ? "Запускаємо…" : r === "done" ? "Запущено" : "Запустити зараз"}</button>}
            </div>
          );
        })}
    </section>
  );
  // ── Парсери ──
  const parsersTab = phone ? phoneParsers : (
    <section className="v3-mx-parsers">
      {(() => { const focus = down[0]?.name || (avail.hltv_scraper ? "hltv_scraper" : Object.keys(avail)[0]); const a = focus ? avail[focus] : undefined; if (!a) return null;
        const byHour = new Map(a.map((h) => [h.hour.slice(11, 13), h]));
        const hours = Array.from({ length: 24 }, (_, i) => { const d = new Date(Date.now() - (23 - i) * 36e5); const hh = isoToKyiv(d.getTime()).slice(11, 13); const h = byHour.get(hh); return { hh, s: !h ? "none" : h.failure && h.success ? "mix" : h.failure ? "bad" : "ok", h }; });
        const allStopped = !!parsers?.length && parsers.every((p) => p.paused);
        const fStopped = allStopped || !!parsers?.find((p) => p.name === focus)?.paused;
        return (
          <div className={`v3-dcard v3-mx-up${fStopped ? " is-stopped" : ""}`}>
            {fStopped && <div className="v3-mx-upstop" role="status"><span className="v3-mx-upstop-ico" aria-hidden="true"><Square size={12} fill="currentColor" /></span><span><strong>{allStopped ? "Усі парсери зупинені" : `${PARSER_NAMES[focus] || focus} зупинено`}</strong><small>Запитів до джерел немає — нові години не з’являться, поки парсер не запустять. Нижче — що було до зупинки.</small></span></div>}
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
        : !parsers.length ? <div className="v3-wcard v3-mx-pnone">{empty("Парсерів немає", "Бекенд не повідомив про жодне джерело матчів. Щойно парсер запуститься, він з’явиться тут.", <Activity size={22} />)}</div>
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
                <span key={ps} className={`v3-tag v3-mx-flip ${ps === "down" ? "v3-tag-red" : ps === "ok" ? "v3-tag-green" : ps === "paused" ? "v3-tag-gray" : "v3-tag-amber"}`}><i className={`v3-mx-dot${ps === "down" || ps === "flaky" ? " is-pulse" : ""}`} aria-hidden="true" />{ps === "down" ? "Помилка" : ps === "flaky" ? "Збої" : ps === "idle" ? "Без даних" : ps === "paused" ? "Зупинено" : "Працює"}</span>
                {ps !== "paused" && <button type="button" className="v3-mx-pstop" disabled={!online || stopping === p.name} onClick={() => stopOrStart(p.name, true)} aria-label={`Зупинити ${PARSER_NAMES[p.name] || p.name}`}><Square size={11} fill="currentColor" aria-hidden="true" />Стоп</button>}
              </div>
              <div className="v3-mx-pkv">
                <div><span>Останній збій</span><strong className={p.open ? "is-bad" : ""}>{p.lastFailure ? ago(p.lastFailure) : "не було"}</strong></div>
                <div><span>Збоїв за 24 год</span><strong>{p.failures24h}</strong></div>
                <div><span>Матчів сьогодні</span><strong>{matches ? cnt : "…"}</strong></div>
              </div>
              {(() => { const ev = events[p.name]; return ev ? (
                <div className="v3-mx-ev"><strong>Останні події</strong>{ev.length ? ev.slice(0, 4).map((e, k) => <div key={e.id} className={`v3-mx-evr is-${e.event}`} style={{ animationDelay: `${150 + k * 45}ms` }}><span>{new Date(e.createdAt).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}</span><span>{EV_LABEL[e.event]}{e.message && e.message !== "OK" ? ` · ${e.message}` : ""}</span></div>) : <p className="v3-mx-pnote">Подій ще немає — журнал почне наповнюватися з наступних запусків.</p>}</div>
              ) : null; })()}
              <p className="v3-mx-pnote">{p.paused ? `Зупинено вручну${p.pausedBy ? ` (@${p.pausedBy})` : ""}${p.pausedAt ? ` ${ago(p.pausedAt)}` : ""}. Парсер не звертається до джерела і не рахує збоїв — застосунок показує останні збережені дані. «Запустити» вмикає його знову.` : p.open ? `Запобіжник спрацював після ${p.failures} ${plural(p.failures, "невдалої спроби", "невдалих спроб", "невдалих спроб")} — застосунок показує останні отримані дані. «Запустити зараз» скидає його, і наступний запит піде одразу.` : ps === "flaky" ? `Останні запуски завершуються помилкою (${ago(p.lastFailure)}), парсер повторює спроби. Поки так, у меню біля «Матчі» стоїть «!».` : ps === "idle" ? "Помилок немає, але сьогодні джерело не повернуло жодного матчу — найчастіше це блокування з боку сайту. Застосунок показує останні отримані дані." : "Дані оновлюються автоматично. Якщо джерело мовчатиме, тут з’явиться помилка, а в меню — позначка «!»."}</p>
              <div className="v3-mx-pacts">
                {p.paused ? <button type="button" className="v3-btn v3-btn-primary" disabled={!online || stopping === p.name} onClick={() => stopOrStart(p.name, false)}>{stopping === p.name ? <span className="v3-mx-spin" aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}Запустити</button> :
                <button type="button" className={`v3-btn ${p.open ? "v3-btn-primary" : "v3-btn-dark"}`} disabled={!online || r === "busy"} onClick={() => rerun(p.name)}>
                  {r === "busy" ? <span className="v3-mx-spin" aria-hidden="true" /> : r === "done" ? <Check size={15} aria-hidden="true" className="v3-mx-ok" /> : <RefreshCw size={15} aria-hidden="true" />}
                  {r === "busy" ? "Запускаємо…" : r === "done" ? "Запущено" : "Запустити зараз"}
                </button>}
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
  const manualTab = bets === null ? <div className="v3-wcard v3-pay-list">{skelRows(4)}</div> : !groups.length ? (phone ? (
    /* phone: the same empty state as «Матчі» / «Парсери» */
    <div className="v3-mxp-none">
      <span className="v3-mxp-none-ic is-ok" aria-hidden="true"><Check size={20} /></span>
      <strong>Усі матчі на своїх місцях</strong>
      <span>За 14 днів немає записів на матчі, яких би не було в стрічках. Перевірено {recent.length} {plural(recent.length, "запис", "записи", "записів")}.</span>
    </div>
  ) : (
    <section className="v3-mx-zero">
      <div className="v3-wcard v3-mx-zero-card"><span className="v3-empty-ic v3-float v3-halo" aria-hidden="true"><Check size={22} /></span><strong>Усі матчі на своїх місцях</strong><p>За останні 14 днів немає записів на матчі, яких би не було в стрічках tips.gg і HLTV. Коли користувач введе матч сам, він з’явиться тут разом зі схожим офіційним.</p></div>
      <div className="v3-dcard v3-mx-zero-st"><strong>Перевірено</strong><div><span>Записів за 14 днів</span><b>{recent.length}</b></div><div><span>Матчів у стрічках і історії</span><b>{known.length}</b></div></div>
    </section>
  )) : wide ? (
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
  ) : phone ? (
    /* design MatchesMobileManual: the comparison and the two buttons right in the card */
    <section className="v3-mxp-man">
      <p className="v3-mxp-gh">Матчі, яких немає в стрічках · 14 днів</p>
      {groups.map((x, i) => (
        <div key={x.key} className="v3-mxp-mg" style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}>
          <div className="v3-mxp-mgh">{gChip(x.game)}<span>{x.day === today ? "сьогодні" : dayShort(x.day)} · {x.bets.length} {plural(x.bets.length, "запис", "записи", "записів")}</span><span className={`v3-mxp-mst${x.official ? "" : " is-none"}`}><i aria-hidden="true" />{x.official ? "Чекає" : "Без пари"}</span></div>
          <div className="v3-mxp-mbox"><small>Як ввів користувач · @{x.bets[0]?.username}</small><strong>{x.t1} vs {x.t2}</strong></div>
          <div className={`v3-mxp-mbox is-off${x.official ? "" : " is-empty"}`}><small>{x.official ? "Схожий офіційний" : "Схожого офіційного немає"}</small><strong>{x.official ? `${x.official.t1} — ${x.official.t2}${x.official.tournament ? ` · ${x.official.tournament}` : ""} · ${x.official.time}` : "Чекаємо, поки з’явиться в стрічках"}</strong></div>
          <div className="v3-mxp-acts">
            <button type="button" className="is-grey" disabled={!online || !!saving} onClick={() => decide(x, "unlink")}>{saving === `unlink:${x.key}` ? "Зберігаємо…" : "Інший матч"}</button>
            <button type="button" className="is-dark" disabled={!online || !!saving} onClick={() => (x.official ? setMergeAsk({ x, target: x.official }) : setPickFor(x))}>{saving === `merge:${x.key}` ? "Об’єднуємо…" : "Об’єднати"}</button>
          </div>
        </div>
      ))}
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
  const teamsG = tg === "all" ? teams : teams.filter((t) => t.game === tg);
  /** Last finished matches of a team, oldest → newest: W (перемога) / L (поразка) / D (нічия). */
  /** Last 5 finished matches, newest first: result, opponent, score from this team's side, day. */
  const teamLast = (t: Team) => { const tn = normTeam(t.name);
    return known.filter((m) => m.game === t.game && m.status === "done" && m.s1 != null && m.s2 != null && (m.s1 || m.s2) && (normTeam(m.t1) === tn || normTeam(m.t2) === tn))
      .sort((a, b) => b.ts - a.ts).filter((m, i, xs) => xs.findIndex((y) => y.id === m.id) === i).slice(0, 5)
      .map((m) => { const first = normTeam(m.t1) === tn; const a = first ? m.s1! : m.s2!, b = first ? m.s2! : m.s1!;
        return { id: m.id, r: (a > b ? "W" : a < b ? "L" : "D") as "W" | "L" | "D", opp: first ? m.t2 : m.t1, oppLogo: first ? m.logo2 : m.logo1, score: `${a}:${b}`, day: m.day, tour: m.tournament }; }); };
  /** The same as letters, oldest → newest (the last one on the right). */
  const teamForm = (t: Team) => teamLast(t).reverse().map((x) => x.r);
  /** Where a spelling came from: the first match in the feeds that used it. */
  const spellingFrom = (t: Team, v: string) => { const m = known.filter((x) => x.game === t.game && (x.t1 === v || x.t2 === v)).sort((a, b) => a.ts - b.ts)[0]; return m ? `${m.source} · з ${dayShort(m.day)}` : "зі стрічок"; };
  const notSame = async (t: Team, v: string) => {
    setSaving(`dist:${t.key}|${v}`);
    try {
      const d = await addDistinct({ game: t.game, name: t.name, variant: v });
      setDistinct((xs) => [...xs, d]);
      toast.success("Позначено як різні команди", { description: `${t.name} ≠ ${v}`, action: { label: "Повернути", onClick: async () => { try { await removeDistinct(d.id); setDistinct((xs) => xs.filter((x) => x.id !== d.id)); } catch (e) { toast.error("Не вдалося повернути", { description: errText(e) }); } } } });
    } catch (e) { toast.error("Не вдалося зберегти", { description: errText(e) }); }
    setSaving("");
  };
  const tgOpts = gameOpts.map((g) => ({ value: g.value, label: `${g.value === "all" ? "Усі ігри" : g.label} · ${g.value === "all" ? teams.length : teams.filter((t) => t.game === g.value).length}` }));
  const tList = teamsG.filter((t) => (tf === "all" || (tf === "dup" ? t.variants.length > 0 : isFallbackLogo(t.logo))) && (!tn || `${t.name} ${t.variants.join(" ")} ${t.aliases.join(" ")}`.toLowerCase().includes(tn)));
  const tSel = tList.find((t) => t.key === selTeam) || (wide ? tList[0] : undefined) || null;
  const teamDetail = (t: Team) => (
    <div className="v3-mx-detail">
      <div className="v3-mx-th"><Logo src={t.logo} name={t.name} size={52} /><div><h2>{t.name}</h2><span>{GAME_LABEL[t.game]} · {t.matches} {plural(t.matches, "матч", "матчі", "матчів")} за 30 днів</span></div>
        {t.matches === 0 && <button type="button" className="v3-mx-tdel" disabled={!online || saving === t.key} onClick={() => setDelTeam(t)} aria-label={`Видалити ${t.name} з довідника`} title="Видалити з довідника"><Trash2 size={16} aria-hidden="true" /></button>}</div>
      <div className="v3-mx-kv is-3"><div><span>Останній матч</span><strong>{t.last ? dayShort(t.last) : "—"}</strong></div><div><span>Рейтинг</span><strong>{t.rank != null ? `#${t.rank}` : "—"}</strong></div><div><span>Логотип</span><strong>{isFallbackLogo(t.logo) ? "немає" : "є"}</strong></div></div>
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
        {/* phone: no new spellings — nothing to confirm, so no greyed-out button */}
        {(!phone || t.variants.length > 0) && <button type="button" className="v3-btn v3-btn-primary" disabled={!online || !t.variants.length || saving === `team:${t.key}`} onClick={() => addAliases(t, t.variants)}>{saving === `team:${t.key}` ? <span className="v3-mx-spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}Це одна команда</button>}
      </div>
      <p className="v3-mx-hint">Псевдонім — інше написання «{t.name}»: записи й матчі з будь-яким написанням рахуються як одна команда.</p>
    </div>
  );
  /** Phone team card — design MxTeam: centered head, spellings, the new-spelling note, «Це одна команда», «Приховати команду». */
  const phoneTeamDetail = (t: Team) => {
    const own = aliases.filter((a) => a.game === t.game && baseNorm(a.canonical) === baseNorm(t.name));
    const f = teamForm(t);
    return (
      <div className="v3-mxt">
        <Logo src={t.logo} name={t.name} size={56} />
        <h2>{t.name}</h2>
        <p>{[GAME_LABEL[t.game], t.rank != null ? `#${t.rank} у рейтингу` : "", t.last ? (t.last === today ? "останній матч сьогодні" : `останній матч ${dayShort(t.last)}`) : `${t.matches} ${plural(t.matches, "матч", "матчі", "матчів")}`].filter(Boolean).join(" · ")}</p>
        {f.length > 0 && <div className="v3-mxt-last">
          <small>Останні матчі · нові зверху</small>
          <ul>{teamLast(t).map((x) => (
            <li key={x.id}>
              <i className={`is-${x.r}`} aria-label={x.r === "W" ? "перемога" : x.r === "L" ? "поразка" : "нічия"}>{x.r}</i>
              <span><strong>vs {x.opp}</strong><small>{x.day === today ? "сьогодні" : dayShort(x.day)}{x.tour ? ` · ${x.tour}` : ""}</small></span>
              <b>{x.score}</b>
            </li>
          ))}</ul>
        </div>}
        <div className="v3-mxt-al">
          <small>Псевдоніми — так команду називають джерела</small>
          <div>
            {own.map((a) => <span key={a.id} className="v3-mxt-chip">{a.alias}<button type="button" aria-label={`Прибрати псевдонім ${a.alias}`} disabled={!online || saving === `alias:${a.id}`} onClick={() => removeAlias(a)}><X size={12} aria-hidden="true" /></button></span>)}
            {t.aliases.filter((n) => !own.some((a) => a.alias === n)).map((n) => <span key={n} className="v3-mxt-chip">{n}</span>)}
            <button type="button" className="v3-mxt-add" disabled={!online} onClick={() => setMergeFor(t)}>+ Додати</button>
          </div>
        </div>
        {t.variants.length > 0 && <p className="v3-csheet-note"><b aria-hidden="true">!</b><span>Нове написання з джерел — {t.variants.map((v) => `«${v}»`).join(", ")} · підтвердьте «Це одна команда»</span></p>}
        <div className="v3-mxt-acts">
          <button type="button" className="v3-csheet-no" disabled={!online || saving === `logo:${t.key}`} onClick={() => { setLogoFor(t); logoInput.current?.click(); }}><Upload size={16} aria-hidden="true" />{saving === `logo:${t.key}` ? "Завантажуємо…" : "Змінити логотип"}</button>
          {t.variants.length > 0 && <button type="button" className="v3-csheet-go is-green" disabled={!online || saving === `team:${t.key}`} onClick={() => addAliases(t, t.variants)}>{saving === `team:${t.key}` ? "Зберігаємо…" : "Це одна команда"}</button>}
        </div>
        {t.variants.length > 0 && <button type="button" className="v3-mxt-link" disabled={!online || !!saving} onClick={() => notSame(t, t.variants[0])}>Це різні команди</button>}
        {(t as Team & { ownLogo?: boolean }).ownLogo && <button type="button" className="v3-mxt-link" disabled={!online || !!saving} onClick={() => resetLogo(t)}>Повернути логотип із пакета</button>}
        <button type="button" className="v3-mxt-hide" disabled={!online || saving === t.key} onClick={() => setDelTeam(t)}>Приховати команду</button>
      </div>
    );
  };
  const tfOpts = [{ key: "all" as const, label: "Усі", n: teamsG.length }, { key: "dup" as const, label: "Дублікати", n: teamsG.filter((t) => t.variants.length).length }, { key: "logo" as const, label: "Без логотипа", n: teamsG.filter((t) => isFallbackLogo(t.logo)).length }];
  const teamsTab = (
    <section className={wide ? "v3-pay-main" : "v3-pay-m"}>
      <div className={wide ? "v3-wcard v3-pay-list" : ""}>
        <div className={wide ? "v3-pay-tools" : "v3-mx-mtools"}>
          {phone ? (
            <div className="v3-mxp-bar">
              <div className="v3-mxp-tchips" role="group" aria-label="Фільтр">{([["all", "Усі", null], ["logo", "Без лого", tfOpts[2].n], ["dup", "Дублікати", tfOpts[1].n]] as [typeof tf, string, number | null][]).map(([k, l, n]) => <button key={k} type="button" className={tf === k ? "is-on" : ""} aria-pressed={tf === k} onClick={() => setTf(k)}>{n ? <b>{n}</b> : null}{l}</button>)}</div>
              {/* «Дублікати» are pair cards — no list / tiles there, so the switch is greyed out */}
              <div className={`v3-mxp-view${tf === "dup" ? " is-off" : ""}`} role="group" aria-label="Вигляд" title={tf === "dup" ? "У «Дублікатах» лише картки пар" : undefined}><button type="button" disabled={tf === "dup"} className={tView === "list" && tf !== "dup" ? "is-on" : ""} aria-pressed={tView === "list"} aria-label="Списком" onClick={() => tView !== "list" && flipView()}><List size={15} aria-hidden="true" /></button><button type="button" disabled={tf === "dup"} className={tView === "grid" && tf !== "dup" ? "is-on" : ""} aria-pressed={tView === "grid"} aria-label="Плитками" onClick={() => tView !== "grid" && flipView()}><LayoutGrid size={15} aria-hidden="true" /></button></div>
            </div>
          ) : (() => { const sb = <label className={wide ? "v3-search" : "v3-msearch"}><Search size={16} aria-hidden="true" /><input type="search" aria-label="Пошук команди" placeholder="Назва або написання" value={tq} onChange={(e) => setTq(e.target.value)} />{tq && <button type="button" onClick={() => setTq("")} aria-label="Очистити пошук"><X size={14} /></button>}</label>;
            return wide ? sb : <div className="v3-mx-srow">{sb}<button type="button" className="v3-mx-vbtn" onClick={flipView} aria-label={tView === "list" ? "Показати блоками" : "Показати списком"} title={tView === "list" ? "Блоки" : "Список"}><span key={tView} className="v3-mx-vico">{tView === "list" ? <LayoutGrid size={18} /> : <List size={18} />}</span></button></div>; })()}
          {phone ? null : wide ? <div className="v3-seg v3-seg-soft" role="group" aria-label="Фільтр"><PillTrack active={tf} />{tfOpts.map((f) => <button key={f.key} type="button" className={tf === f.key ? "is-on" : ""} aria-pressed={tf === f.key} onClick={() => setTf(f.key)}>{f.label} <span className="v3-seg-n">{f.n}</span></button>)}</div>
            : <div className="v3-pay-mf"><Dropdown className="v3-mselect-dd" ariaLabel="Фільтр" value={tf} onChange={(v) => setTf(v)} options={tfOpts.map((f) => ({ value: f.key, label: `${f.label} · ${f.n}` }))} /><Dropdown className="v3-mselect-dd" ariaLabel="Гра" align="right" value={tg} onChange={(v) => setTg(v)} options={tgOpts} /></div>}
          {wide && <Dropdown className="is-light" ariaLabel="Гра" value={tg} onChange={(v) => setTg(v)} options={tgOpts} />}
        </div>
        {wide && <div className="v3-pay-th v3-mx-trow"><span>Команда</span><span>Псевдоніми з джерел</span><span>Гра</span><span>Матчів</span><span className="v3-pay-r">Останній</span></div>}
        {matches === null ? (wide ? skelRows(5) : <ul className="v3-pay-mlist" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <li key={i}><div className="v3-pay-mcard v3-mx-mcard v3-mx-mskel"><span className="v3-skel v3-skel-light" /><span className="v3-mx-mcard-l"><span className="v3-skel v3-skel-light" style={{ width: "55%" }} /><span className="v3-skel v3-skel-light" style={{ width: "35%" }} /></span></div></li>)}</ul>) : tList.length ? (<>{wide ? <div className="v3-pay-rows a">{tList.slice(0, tLimit).map((t, i) => (
          <button key={t.key} type="button" className={`v3-pay-row v3-mx-trow${tSel?.key === t.key ? " is-sel" : ""}`} style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }} onClick={() => setSelTeam(t.key)}>
            <span className="v3-mx-tname"><Logo src={t.logo} name={t.name} size={28} /><strong>{t.name}</strong>{t.variants.length > 0 && <span className="v3-tag v3-tag-amber">Дублікат?</span>}</span>
            <span className="v3-mx-vars">{t.aliases.length + t.variants.length ? [...t.aliases, ...t.variants].slice(0, 3).map((v) => <span key={v} className="v3-mx-chip">{v}</span>) : <small>—</small>}</span>
            <span><GameIco g={t.game} />{GAME_LABEL[t.game]}</span><span>{t.matches}</span><span className="v3-pay-r v3-pay-by">{t.last ? dayShort(t.last) : "—"}</span>
          </button>
        ))}</div> : phone && tf === "dup" ? (
          /* design «Дублікати»: one card per new spelling — the directory name = the new one, «Різні команди» / «Це одна команда» */
          <div className="v3-mx-dups">{tList.slice(0, tLimit).flatMap((t) => t.variants.map((v) => ({ t, v }))).map(({ t, v }, i) => { const busyK = saving === `team:${t.key}` || saving === `dist:${t.key}|${v}`; return (
            <div key={`${t.key}|${v}`} className="v3-mx-dup" style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}>
              <div className="v3-mx-duph">{gChip(t.game)}<span>{spellingFrom(t, v)}</span></div>
              <div className="v3-mx-dupcmp"><button type="button" onClick={() => { setSelTeam(t.key); setSheet(true); }}><strong>{t.name}</strong><small>у довіднику</small></button><i aria-hidden="true">=</i><div className="is-new"><strong>{v}</strong><small>нове написання</small></div></div>
              <div className="v3-mxp-acts">
                <button type="button" className="is-grey" disabled={!online || busyK} onClick={() => notSame(t, v)}>{saving === `dist:${t.key}|${v}` ? "Зберігаємо…" : "Різні команди"}</button>
                <button type="button" className="is-dark" disabled={!online || busyK} onClick={() => addAliases(t, [v])}>{saving === `team:${t.key}` ? "Зберігаємо…" : "Це одна команда"}</button>
              </div>
            </div>
          ); })}</div>
        ) : <ul key={tView} className={`v3-pay-mlist a${tView === "grid" ? " v3-mx-tgrid" : ""}`}>{tList.slice(0, tLimit).map((t, i) => (
          <li key={t.key} style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}><button type="button" className="v3-pay-mcard v3-mx-mcard" onClick={() => { setSelTeam(t.key); setSheet(true); }}>
            <Logo src={t.logo} name={t.name} size={38} />
            <span className="v3-mx-mcard-l"><strong>{t.name}</strong><small><GameIco g={t.game} />{GAME_LABEL[t.game]} · {t.matches || t.rank == null ? `${t.matches} ${plural(t.matches, "матч", "матчі", "матчів")}` : `#${t.rank} у рейтингу`}{t.variants.length ? ` · також «${t.variants[0]}»` : ""}</small>
              {/* phone: the form of the last finished matches */}
              {phone && (() => { const f = teamForm(t); return f.length ? <span className="v3-mx-form" aria-label={`Останні матчі: ${f.map((x) => (x === "W" ? "перемога" : x === "L" ? "поразка" : "нічия")).join(", ")}`}>{f.map((x, k) => <i key={k} className={`is-${x}`}>{x}</i>)}</span> : null; })()}</span>
            {t.variants.length > 0 && <span className="v3-tag v3-tag-amber">Дублікат?</span>}
          </button></li>
        ))}</ul>}{tList.length > tLimit && <button type="button" className={wide ? "v3-ab-more v3-mx-more" : "v3-bt-allbtn v3-mx-mmore"} onClick={() => setTLimit((n) => n + 80)}>Показати ще {Math.min(80, tList.length - tLimit)} з {tList.length - tLimit}{!wide && <ChevronDown size={15} aria-hidden="true" />}</button>}</>) : (() => { const e = (teams.length ? empty("Нічого не знайдено", tn ? `За «${tq.trim()}» команд немає.` : "У цьому фільтрі команд немає.", <Users size={22} />) : empty("Команд ще немає", "Довідник заповнюється з матчів і пакетів логотипів. Якщо тут порожньо — бекенд ще не розпакував логотипи або стрічки недоступні.", <Users size={22} />)); if (phone) return <div className="v3-mxp-none"><span className="v3-mxp-none-ic" aria-hidden="true">{tn ? <Search size={20} /> : tf === "dup" ? <Check size={20} /> : <Users size={20} />}</span><strong>{!teams.length ? "Команд ще немає" : tn ? "Нічого не знайдено" : tf === "dup" ? "Дублікатів немає" : tf === "logo" ? "Усі з логотипом" : "Команд немає"}</strong><span>{!teams.length ? "Довідник заповнюється з матчів і пакетів логотипів." : tn ? `За «${tq.trim()}» команд немає.` : tf === "dup" ? "Нових написань у стрічках немає — кожна команда записана одним ім’ям." : tf === "logo" ? "У кожної команди в довіднику є логотип." : "У цьому фільтрі команд немає."}</span>{(tn || tf !== "all") && teams.length > 0 && <button type="button" onClick={() => { setTf("all"); setTq(""); pageSearch.setQ(""); pageSearch.setOpen(false); }}>Показати всі</button>}</div>; return wide ? e : <div className="v3-wcard v3-pay-mnone">{e}</div>; })()}
      </div>
      {wide && <aside className="v3-dcard v3-pay-aside">{tSel ? teamDetail(tSel) : <div className="v3-pay-empty is-dark"><span>Оберіть команду.</span></div>}</aside>}
    </section>
  );

  const sheetBody = tab === "manual" ? (groups.find((x) => x.key === selGroup) ? groupDetail(groups.find((x) => x.key === selGroup)!) : null)
    : tab === "teams" ? (teams.find((t) => t.key === selTeam) ? (phone ? phoneTeamDetail : teamDetail)(teams.find((t) => t.key === selTeam)!) : null)
    : (all.find((m) => m.id === selId) ? (phone ? (phoneEdit ? phoneEditBody(all.find((m) => m.id === selId)!) : phoneDetail(all.find((m) => m.id === selId)!)) : detail(all.find((m) => m.id === selId)!)) : null);

  return (
    <div className="v3-page v3-pay v3-mx">
      <section className="v3-hero v3-hero-row">
        <div>
          <h1 className="v3-title">Матчі</h1>
          <p className="v3-subtitle"><span className="v3-hide-mobile">Дані з tips.gg і HLTV, записи користувачів і довідник команд. Час — київський.</span><span className="v3-only-mobile">{tab === "parsers" ? (down.length ? `${down.length} ${plural(down.length, "джерело", "джерела", "джерел")} з проблемою` : parsers?.length && parsers.every((p) => p.paused) ? "Усі парсери зупинені вручну" : "Усі джерела працюють") : tab === "manual" ? "Чекають об’єднання" : tab === "teams" ? `${teams.length} у довіднику` : `Сьогодні ${todayM.length} · наживо ${liveN}${phone && updatedAt ? ` · оновлено ${updatedAt}` : ""}`}</span></p>
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
      {down.length > 0 && tab === "matches" && <button type="button" className="v3-mx-alert" onClick={() => setTab("parsers")}><i aria-hidden="true" /><span>{down.map(issueText).join(", ")}{down[0].lastFailure && pState(down[0]) !== "idle" ? ` · ${ago(down[0].lastFailure)}` : ""}<small>{phone ? "дані можуть бути застарілими" : ". Дані можуть бути застарілими."}</small></span><b>{phone ? <>Парсери<ChevronRight size={15} aria-hidden="true" /></> : "Парсери →"}</b></button>}

      {error && matches === null ? (
        <div className="v3-dcard v3-uerror" role="alert"><span className="v3-uerror-ico" aria-hidden="true">!</span><strong>Не вдалося завантажити матчі</strong><span>Стрічки tips.gg і HLTV не відповіли.</span><code className="v3-uerror-det">{error}</code><div><button type="button" className="v3-btn v3-btn-blue" onClick={() => load()}>Спробувати ще раз</button></div></div>
      ) : <>
        <section className="v3-sums v3-pay-sums v3-mx-sums" aria-label="Підсумки">
          {/* only numbers here — the tabs below switch sections; the first card is the blue one, as on the other screens */}
          {/* phone: the second card is always the parsers state */}
          {(phone ? [sums[0], sums[1]] : sums).map((s, i) => (
            <div key={s.k} className={`v3-sum is-static${i === 0 ? " is-on" : ""}`}>
              <span className="v3-sum-l">{s.label}</span>
              <strong className={`v3-sum-v${s.bad && i ? " v3-mx-bad" : ""}${s.amber && i ? " v3-mx-amber" : ""}`}><RollingNumber key={`${s.k}-${s.v}`} text={s.v} /></strong>
              <span className="v3-sum-n"><span className="v3-pay-note">{s.n}</span></span>
            </div>
          ))}
        </section>

        <div className={`v3-mx-tabsw${tabFade.l ? " fade-l" : ""}${tabFade.r ? " fade-r" : ""}`} onScroll={(e) => edgeFade(e.currentTarget)} ref={(el) => { if (el && !tabsEl.current) { tabsEl.current = el; edgeFade(el); } }}>
          <div className="v3-pay-tabs v3-mx-tabs" role="tablist" aria-label="Розділи матчів">
            <PillTrack active={tab} />
            {TABS.map((t) => <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`v3-pay-tab${tab === t.key ? " is-on" : ""}${t.key === "parsers" && down.length ? " is-err" : ""}`} onClick={() => setTab(t.key)}><span className="v3-pay-tab-n">{tabCount(t.key) ?? "…"}</span><span className={phone ? "v3-hide-mobile" : undefined}>{t.label}</span>{phone && <span>{t.key === "manual" ? "Вручну" : t.label}{(t.key === "matches" || t.key === "manual") && tabCount(t.key) != null ? ` · ${tabCount(t.key)}` : ""}</span>}</button>)}
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
          <div className="v3-modal-foot"><span className="v3-hint">Час — київський</span><div className="v3-modal-actions"><button type="button" className="v3-btn v3-btn-ghost" onClick={() => setLogFor(null)}>Закрити</button><button type="button" className="v3-btn v3-btn-primary v3-mx-logsend" disabled={!logFor || !(events[logFor] || []).length} onClick={() => logFor && shareLog(logFor)}><Send size={15} aria-hidden="true" />Надіслати</button></div></div>
        </DialogContent>
      </Dialog>

      <MergeTeamDialog team={mergeFor} teams={teams} busy={!!mergeFor && saving === `team:${mergeFor.key}`} onClose={() => setMergeFor(null)} onPick={(t, names) => addAliases(t, names)} />

      {/* phone confirmations — design «Зупинити HLTV?», «Видалити матч?», «Об’єднати з офіційним?», «Об’єднати з…» */}
      <ConfirmSheet open={!!stopAsk} tone="dark" icon={<span className="v3-csheet-bar" />} title={`Зупинити ${stopAsk ? PARSER_NAMES[stopAsk] || stopAsk : ""}?`}
        text="Запитів до джерела не буде, поки не запустите знову. У застосунку лишаться останні дані з позначкою часу."
        confirm="Зупинити" confirmIcon={<span className="v3-csheet-stop" aria-hidden="true" />} busy={!!stopAsk && stopping === stopAsk} busyText="Зупиняємо…"
        onOpenChange={(o) => { if (!o) setStopAsk(null); }} onConfirm={async () => { if (!stopAsk) return; await stopOrStart(stopAsk, true); setStopAsk(null); }}>
        {parsers && parsers.length > 1 && <p className="v3-csheet-note"><b aria-hidden="true">!</b><span>Якщо зупинити всі {parsers.length} — у меню біля «Матчі» з’явиться знак «стоп».</span></p>}
      </ConfirmSheet>
      <ConfirmSheet open={!!delAsk} icon={<Trash2 size={22} />} title="Видалити матч?"
        text={delAsk ? `${delAsk.t1} — ${delAsk.t2} зникне з розкладу в застосунку.${betsFor(delAsk).length ? ` ${betsFor(delAsk).length} ${plural(betsFor(delAsk).length, "ставка лишиться", "ставки лишаться", "ставок лишаться")} в записах користувачів.` : ""}${delAsk.manual ? "" : " Повернути можна кнопкою в сповіщенні."}` : ""}
        confirm="Видалити" busy={!!delAsk && saving === delAsk.id} busyText="Видаляємо…"
        onOpenChange={(o) => { if (!o) setDelAsk(null); }} onConfirm={() => delAsk && removeMatch(delAsk)} />
      <ConfirmSheet open={!!mergeAsk} tone="green" icon={<Link2 size={22} />} title="Об’єднати з офіційним?"
        text={mergeAsk ? `${mergeAsk.x.bets.length} ${plural(mergeAsk.x.bets.length, "запис користувача перейде", "записи користувачів перейдуть", "записів користувачів перейдуть")} на матч зі стрічки. Ставки порахуються за його результатом.` : ""}
        confirm="Об’єднати" busy={!!mergeAsk && saving === `merge:${mergeAsk.x.key}`} busyText="Об’єднуємо…"
        onOpenChange={(o) => { if (!o) setMergeAsk(null); }} onConfirm={() => mergeAsk && decide(mergeAsk.x, "merge", mergeAsk.target)}>
        {mergeAsk && <div className="v3-csheet-cmp">
          <div><small>Як ввів користувач · @{mergeAsk.x.bets[0]?.username}</small><strong>{mergeAsk.x.t1} vs {mergeAsk.x.t2}</strong></div>
          <i aria-hidden="true">↓</i>
          <div className="is-off"><small>Офіційний · {mergeAsk.target.source}</small><strong>{mergeAsk.target.t1} — {mergeAsk.target.t2}{mergeAsk.target.tournament ? ` · ${mergeAsk.target.tournament}` : ""} · {mergeAsk.target.time}</strong></div>
        </div>}
      </ConfirmSheet>
      {/* «Змінити логотип»: the system picker (photos or files) */}
      <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f && logoFor) uploadLogo(logoFor, f); }} />
      <PickMatchSheet group={pickFor} known={known} today={today} busy={!!pickFor && saving === `merge:${pickFor.key}`} onClose={() => setPickFor(null)} onPick={(x, m) => decide(x, "merge", m)} />

      {phone ? <ConfirmSheet open={!!delTeam} icon={<Trash2 size={22} />} title={`Приховати ${delTeam?.name || "команду"}?`}
        text={<>Команда зникне з довідника «Команди»{delTeam ? ` (${GAME_LABEL[delTeam.game]})` : ""}. Логотип і матчі не зміняться. Повернути можна кнопкою в сповіщенні.</>}
        confirm="Приховати" busy={!!delTeam && saving === delTeam.key} busyText="Приховуємо…"
        onOpenChange={(o) => { if (!o) setDelTeam(null); }} onConfirm={() => delTeam && removeTeam(delTeam)} /> :
      <ConfirmDialog open={!!delTeam} busy={!!delTeam && saving === delTeam.key} onOpenChange={(o) => { if (!o) setDelTeam(null); }} onConfirm={() => delTeam && removeTeam(delTeam)}
        title={`Видалити ${delTeam?.name || "команду"}?`} confirm="Видалити з довідника" busyText="Видаляємо…"
        text={<>Команда зникне з довідника «Команди»{delTeam ? ` (${GAME_LABEL[delTeam.game]})` : ""}. Логотип і матчі не зміняться. Повернути можна одразу після видалення — кнопкою в сповіщенні.</>} />}
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
      <DialogContent className="v3-modal v3-am sm:max-w-[520px]">
        <DialogTitle className="v3-modal-title">Додати матч</DialogTitle>
        <DialogDescription className="v3-modal-sub"><span className="v3-hide-mobile">Для матчу, якого немає в tips.gg і HLTV. Застосунок покаже його в розкладі разом з іншими.</span><span className="v3-only-mobile">Якого ще немає в стрічках</span></DialogDescription>
        <form onSubmit={save} className="v3-form">
          <fieldset disabled={busy} className="v3-form-grid">
            <div className="v3-amg">
            <div className="v3-field v3-span2"><span className="v3-label" id="am-g">Гра</span><div className="v3-chipset" role="group" aria-labelledby="am-g">{(["cs2", "dota2"] as Game[]).map((g) => <button key={g} type="button" className={f.game === g ? "is-on" : ""} aria-pressed={f.game === g} onClick={() => setF({ ...f, game: g })}>{GAME_LABEL[g]}</button>)}</div></div>
            </div>
            <div className="v3-amg"><p className="v3-amg-t v3-only-mobile">Команди</p>
            <div className="v3-field"><label htmlFor="am-t1">Команда 1</label><input id="am-t1" required maxLength={200} value={f.t1} onChange={(e) => setF({ ...f, t1: e.target.value })} placeholder="NAVI" autoComplete="off" /></div>
            <div className="v3-field"><label htmlFor="am-t2">Команда 2</label><input id="am-t2" required maxLength={200} value={f.t2} onChange={(e) => setF({ ...f, t2: e.target.value })} placeholder="FaZe" autoComplete="off" /></div>
            <div className="v3-field v3-span2"><label htmlFor="am-tour">Турнір</label><input id="am-tour" maxLength={500} value={f.tour} onChange={(e) => setF({ ...f, tour: e.target.value })} placeholder="Необов’язково" autoComplete="off" /></div>
            </div>
            <div className="v3-amg"><p className="v3-amg-t v3-only-mobile">Час</p>
            <div className="v3-field"><label id="am-d">Дата</label><DateField id="am-date" labelledBy="am-d" required value={f.date} onChange={(v) => setF({ ...f, date: v })} /></div>
            <div className="v3-field"><label htmlFor="am-time">Час (Київ)</label><input id="am-time" required {...timeAttrs()} pattern="([01][0-9]|2[0-3]):[0-5][0-9]" title="Година й хвилини, напр. 19:30" placeholder="19:00" maxLength={5} value={f.time} onChange={(e) => setF({ ...f, time: hhmmInput(e.target.value) })} /></div>
            <div className="v3-field v3-span2"><span className="v3-label" id="am-bo">Формат</span><div className="v3-chipset" role="group" aria-labelledby="am-bo">{["BO1", "BO2", "BO3", "BO5"].map((b) => <button key={b} type="button" className={f.bo === b ? "is-on" : ""} aria-pressed={f.bo === b} onClick={() => setF({ ...f, bo: b })}>{b}</button>)}</div></div>
            </div>
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

/** Time field: on the phone the native wheel (no keyboard — it hid the field and threw the sheet back to «Гра»);
 * on desktop a text field that selects its value on focus, so typing replaces «19:00». */
const timeAttrs = () => isPhoneWidth()
  ? { type: "time" as const }
  : { type: "text" as const, inputMode: "numeric" as const, onFocus: (e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.select() };

/** «Об’єднати з…» (phone): no similar official match was found — pick one by hand. */
function PickMatchSheet({ group, known, today, busy, onClose, onPick }: { group: ManualGroup | null; known: Match[]; today: string; busy: boolean; onClose: () => void; onPick: (x: ManualGroup, m: Match) => void }) {
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<string | null>(null);
  useEffect(() => { setQ(""); setPick(null); }, [group?.key]);
  const list = useMemo(() => {
    if (!group) return [];
    const near = (d: string) => Math.abs((Date.parse(d) - Date.parse(group.day)) / 864e5) <= 7;
    const n = q.trim().toLowerCase();
    const seen = new Set<string>();
    return known.filter((m) => m.game === group.game && !m.manual && near(m.day) && (!n || `${m.t1} ${m.t2} ${m.tournament}`.toLowerCase().includes(n)))
      .filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)))
      .map((m) => ({ m, s: similarity(group, m) })).sort((a, b) => b.s - a.s || Math.abs(a.m.ts - Date.parse(group.day)) - Math.abs(b.m.ts - Date.parse(group.day))).slice(0, 30).map((x) => x.m);
  }, [group, known, q]);
  const sel = list.find((m) => m.id === pick) || null;
  return (
    <Dialog open={!!group} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="v3-modal v3-mxpick sm:max-w-[440px]" onOpenAutoFocus={(e) => { if (isPhoneWidth()) e.preventDefault(); }}>
        <DialogTitle className="v3-modal-title">Об’єднати з…</DialogTitle>
        <DialogDescription className="v3-modal-sub">{group ? `${group.t1} vs ${group.t2} · ` : ""}схожого матчу не знайшлось · оберіть вручну</DialogDescription>
        <label className="v3-mxpick-q"><Search size={16} aria-hidden="true" /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Команда або турнір" aria-label="Пошук матчу" /></label>
        <div className="v3-mxpick-list" role="radiogroup" aria-label="Матчі зі стрічок">
          {list.length ? list.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={pick === m.id} className={pick === m.id ? "is-on" : ""} onClick={() => setPick(m.id)}>
              <i aria-hidden="true" /><span><strong>{m.t1} — {m.t2}</strong><small>{GAME_LABEL[m.game]}{m.tournament ? ` · ${m.tournament}` : ""} · {m.day === today ? `сьогодні ${m.time}` : dayShort(m.day)}</small></span>
            </button>
          )) : <p className="v3-mxpick-none">{q.trim() ? `За «${q.trim()}» матчів немає.` : "У стрічках немає матчів цієї гри за ±7 днів."}</p>}
        </div>
        <div className="v3-mxpick-acts">
          <button type="button" className="v3-csheet-no" onClick={onClose} disabled={busy}>Скасувати</button>
          <button type="button" className="v3-csheet-go is-green" disabled={!sel || busy} onClick={() => group && sel && onPick(group, sel)}>{busy ? "Об’єднуємо…" : "Об’єднати"}</button>
        </div>
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
