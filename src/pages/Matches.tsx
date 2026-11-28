import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { publishMatchCounts } from "@/lib/navCounts";
import { useSearchParams } from "react-router-dom";
import { Activity, AlertTriangle, Trophy, CalendarX2, CalendarDays, Check, ChevronDown, ChevronRight, CircleDollarSign, ExternalLink, ListFilter, Filter, History, Info, Send, Upload, LayoutGrid, Link2, List, Pencil, Play, Plus, RefreshCw, RotateCcw, Search, Shield, Square, Trash2, Users, WifiOff, X } from "lucide-react";
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
  fetchHiddenTeams, fetchTeamLogos, saveTeamLogo, deleteTeamLogo, logoFileToDataUrl, logoNorm, fetchDistinct, addDistinct, removeDistinct, type DistinctPair, fetchParserEvents, fetchMatchChanges, refreshParser, type MatchChange, fetchTeamCatalog, hideTeam, type HiddenTeam, linkMatch, unhideTeam, logoKey, patchMatch, setPagesMode, type PagesMode, rerunParser, resetMatch, startParser, stopParser, resolveLogos, type AdminStatus, type HourStat, type MatchOverride, type ParserEvent, type TeamAlias,
} from "@/lib/adminMatchesApi";
import { fetchParsersFull, resolveScoreIssue, PARSER_ISSUE, type ScoreIssue, PARSER_NAMES, parserHealth, plural, type OddsMiss, type ParserState } from "@/lib/dashboardInsights";
import {
  addDays, ago, baseNorm, betMatches, dayShort, GAME_LABEL, initials, isFallbackLogo, isoToKyiv, kyivDay, kyivToIso, linkKey, manualGroups, mergeCatalog, normTeam, oddsMove, setAliases, similarity, STATUS_LABEL, teamsFrom,
  type CatalogTeam, type Game, type ManualGroup, type Match, type MStatus, type Team,
} from "@/lib/matchesModel";
import type { AdminUserBet } from "@/types";
import { usePageSearch, isPhoneWidth } from "@/lib/pageSearch";
import { WModal, DeleteAsk } from "@/components/ads/web/AdsWebShared";

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
const PARSER_META: Record<string, { ini: string; color: string; site: string; game: string; feed: Game | "hltv" | "oddspapi" | "opendota" | "liquipedia" | "cito" | "pandascore" | "polymarket" }> = {
  hltv_scraper: { ini: "HL", color: "#2450c4", site: "hltv.org", game: "CS2", feed: "hltv" },
  tipsgg_fetch_cs2_matches: { ini: "TI", color: "#7a4fd0", site: "tips.gg", game: "CS2", feed: "cs2" },
  tipsgg_fetch_dota2_matches: { ini: "TI", color: "#c2410c", site: "tips.gg", game: "Dota 2", feed: "dota2" },
  liquipedia: { ini: "LP", color: "#2b6cb0", site: "liquipedia.net", game: "CS2 · Dota 2", feed: "liquipedia" },
  oddspapi: { ini: "OP", color: "#0f7b5f", site: "oddspapi.io", game: "коефіцієнти", feed: "oddspapi" },
  pandascore: { ini: "PS", color: "#c2410c", site: "pandascore.co", game: "CS2 · Dota 2 · розклад", feed: "pandascore" },
  cito: { ini: "CT", color: "#7a4fd0", site: "citoapi.com", game: "CS2 · розклад", feed: "cito" },
  opendota: { ini: "OD", color: "#a33a2b", site: "opendota.com", game: "Dota 2 · рахунок", feed: "opendota" },
  polymarket: { ini: "PM", color: "#2e5cff", site: "polymarket.com", game: "коефіцієнти · біржа прогнозів", feed: "polymarket" },
};
/** Tournament icon before its name; a neutral cup when the sources gave none or it failed to load (keeps the line aligned). */
function TourIcon({ src }: { src?: string | null }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [src]);
  return src && !bad
    ? <img className="v3-tour-ic" src={src} alt="" loading="lazy" onError={() => setBad(true)} />
    : <span className="v3-tour-ic is-none" aria-hidden="true"><Trophy size={9} strokeWidth={2.4} /></span>;
}

/** 02:00–06:00 Kyiv: the backend slows the parsers down (live matches still refresh as by day). */
const kyivNight = () => { const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Kyiv", hour: "2-digit", hourCycle: "h23" }).format(new Date())); return h >= 2 && h < 6; };
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
  const [missOpen, setMissOpen] = useState(false);
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const [linked, setLinked] = useState<Record<string, "busy" | "done">>({});
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
  const [tFiltOpen, setTFiltOpen] = useState(false);
  // phone «Парсери»: the parsers by what they bring — matches or odds
  const [pKind, setPKind] = useState<"matches" | "odds">("matches");
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
  const [stopFor, setStopFor] = useState<"1h" | "morning" | "forever">("1h");
  const [delAsk, setDelAsk] = useState<Match | null>(null);
  const [mergeAsk, setMergeAsk] = useState<{ x: ManualGroup; target: Match } | null>(null);
  const [pickFor, setPickFor] = useState<ManualGroup | null>(null);
  const [distinct, setDistinct] = useState<DistinctPair[]>([]);
  // «Змінити логотип»: game:norm → URL of the admin's own logo
  const [ownLogos, setOwnLogos] = useState<Record<string, string>>({});
  const logoInput = useRef<HTMLInputElement>(null);
  const [issues, setIssues] = useState<ScoreIssue[]>([]);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [wEdit, setWEdit] = useState<string | null>(null);
  const [wIssueKey, setWIssue] = useState<string | null>(null);
  const [wPick, setWPick] = useState("ours");
  const [wLogF, setWLogF] = useState<"all" | "fail" | "admin">("all");
  const [issueBusy, setIssueBusy] = useState<string | null>(null);
  const [pagesBusy, setPagesBusy] = useState(false);
  const changePagesMode = async (mode: PagesMode) => {
    setPagesBusy(true);
    try {
      await setPagesMode(mode);
      setParsers((ps) => ps && ps.map((x) => (x.name === "liquipedia" && x.pages ? { ...x, pages: { ...x.pages, mode } } : x)));
      toast.success(mode === "on" ? "Матчі сторінок додаються завжди" : mode === "off" ? "Сторінки турнірів вимкнено" : "Сторінки — автоматично", { description: "Стрічка оновиться за кілька хвилин" });
    } catch (e) { toast.error("Не вдалося", { description: e instanceof Error ? e.message : "" }); }
    setPagesBusy(false);
  };
  /** «Правильний рахунок»: a score of another source becomes the match's score (an admin override, as «Редагувати» does);
   *  Liquipedia's — nothing changes. Either way the item leaves the list. */
  const settleIssue = async (x: ScoreIssue, score: string | null) => {
    const key = `${x.kind}-${x.id}`;
    setIssueBusy(key);
    try {
      if (score) {
        const [s1, s2] = score.split(":").map(Number);
        await patchMatch(x.game, x.id, { status: "finished" as AdminStatus, startDate: null, score1: s1, score2: s2 });
      }
      await resolveScoreIssue(x.kind, x.id);
      setIssues((xs) => xs.filter((y) => !(y.kind === x.kind && y.id === x.id)));
      toast.success(score ? `Рахунок ${score} збережено` : x.kind === "closed" ? "Позначено як перевірене" : "Лишили рахунок Liquipedia");
      if (score) void load();
    } catch (e) { toast.error("Не вдалося", { description: e instanceof Error ? e.message : "" }); }
    setIssueBusy(null);
  };
  const [logoFor, setLogoFor] = useState<Team | null>(null);

  const load = useCallback(async (opts: { force?: boolean } = {}) => {
    try {
      const [feeds, pf] = await Promise.all([fetchFeeds(opts.force), fetchParsersFull().catch(() => null)]);
      setMatches(feeds.matches); setFailed(feeds.failed); if (pf) { setParsers(pf.parsers); setIssues(pf.scoreIssues); }
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
  const all = useMemo(() => {
    const list = (matches || []).map(withLogo);
    // a tournament icon one source gave serves every match of that tournament (another source may have none)
    const tourKey = (m: Match) => `${m.game}:${m.tournament.toLowerCase().replace(/[^a-z0-9а-яіїєґ]+/gi, "")}`;
    const icons = new Map<string, string>();
    for (const m of list) if (m.tourLogo && m.tournament && !icons.has(tourKey(m))) icons.set(tourKey(m), m.tourLogo);
    return list.map((m) => (!m.tourLogo && m.tournament && icons.has(tourKey(m)) ? { ...m, tourLogo: icons.get(tourKey(m))! } : m));
  }, [matches, withLogo]);
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

  // a match still live after midnight (started «yesterday») stays in «Сьогодні» until it ends
  const todayM = all.filter((m) => m.day === today || m.status === "live");
  const liveN = all.filter((m) => m.status === "live").length;
  // Matches each parser brought for today (HLTV / tips.gg CS2 / tips.gg Dota 2)
  const cntFor = (name: string, list: Match[] = todayM) => { const f = (PARSER_META[name] || { feed: "cs2" as const }).feed; return f === "hltv" ? list.filter((m) => m.source === "HLTV").length : f === "liquipedia" ? list.filter((m) => m.source === "Liquipedia").length : f === "cito" ? list.filter((m) => m.source === "Cito").length : f === "pandascore" ? list.filter((m) => m.source === "PandaScore").length : f === "oddspapi" ? list.filter((m) => m.odds || m.source === "OddsPapi").length : f === "polymarket" ? (parsers?.find((x) => x.name === "polymarket")?.polymarket?.matched ?? 0) : f === "opendota" ? list.filter((m) => m.game === "dota2" && (m.source === "Liquipedia" || m.source === "OddsPapi")).length : list.filter((m) => m.game === f && m.source === "tips.gg").length; };
  /** down / flaky from the breaker; idle = no errors, but nothing came in today (e.g. the source blocks us). */
  // OddsPapi → our match: name each differing team as an alias of ours (same team, other spelling)
  const missKey = (x: OddsMiss) => `${x.game}:${x.odds.team1}:${x.odds.team2}:${x.odds.start}`;
  const linkMiss = async (x: OddsMiss) => {
    if (!x.ours) return;
    const k = missKey(x), n = (v: string) => v.toLowerCase().replace(/\b(team|esports?|gaming|club|clan|academy)\b/g, "").replace(/[^a-z0-9]/g, "");
    const straight = n(x.odds.team1) === n(x.ours.team1) || n(x.odds.team2) === n(x.ours.team2) || !(n(x.odds.team1) === n(x.ours.team2) || n(x.odds.team2) === n(x.ours.team1));
    const pairs: [string, string][] = straight ? [[x.ours.team1, x.odds.team1], [x.ours.team2, x.odds.team2]] : [[x.ours.team1, x.odds.team2], [x.ours.team2, x.odds.team1]];
    setLinked((l) => ({ ...l, [k]: "busy" }));
    try {
      for (const [canonical, alias] of pairs) if (n(canonical) !== n(alias)) await createAlias({ game: x.game, canonical, alias });
      setLinked((l) => ({ ...l, [k]: "done" }));
      toast.success("Зв’язано", { description: "Коефіцієнти з’являться протягом 2 хвилин" });
    } catch (e) {
      setLinked((l) => { const c = { ...l }; delete c[k]; return c; });
      toast.error("Не вдалося зв’язати", { description: errText(e) });
    }
  };
  // Liquipedia refreshes every ~5 min: no success for 20 min with no error either = quietly stuck («Без оновлень N хв»)
  //   only while the feed is asking for data (askedAt within 5 min) — with no visitors the refresh sleeps on purpose
  const staleMin = (p: ParserState) => p.name === "liquipedia" && p.lastSuccess && p.askedAt && Date.now() - Date.parse(p.askedAt) < 5 * 60_000 ? Math.floor((Date.now() - Date.parse(p.lastSuccess)) / 60_000) : 0;
  const pState = (p: ParserState): "paused" | "down" | "flaky" | "idle" | "stale" | "ok" => { if (p.paused) return "paused"; const h = parserHealth(p); if (h !== "ok") return h; if (staleMin(p) >= 20) return "stale"; if (p.name === "pandascore") return p.pandascore && p.pandascore.at && !p.pandascore.cs2 && !p.pandascore.dota2 ? "idle" : "ok"; if (p.name === "cito") return p.cito && p.cito.upcomingAt && !p.cito.upcoming && !p.cito.recent ? "idle" : "ok"; return matches && cntFor(p.name, p.name === "oddspapi" ? all : todayM) === 0 ? "idle" : "ok"; };
  const staleText = (p: ParserState) => { const m = staleMin(p); return m < 60 ? `${m} хв` : `${Math.floor(m / 60)} год ${m % 60 ? `${m % 60} хв` : ""}`.trim(); };
  const down = (parsers || []).filter((p) => { const st = pState(p); return st !== "ok" && st !== "paused"; });
  const issueText = (p: ParserState) => { const st = pState(p); return `${PARSER_NAMES[p.name] || p.name} ${st === "stale" ? `без оновлень ${staleText(p)}` : PARSER_ISSUE[st as "down" | "flaky" | "idle"]}`; };
  const todayBets = bets ? todayM.reduce((a, m) => a + betsFor(m).length, 0) : null;

  // ── Матчі: фільтри ──
  const inDay = (m: Match, d: Day) => (d === "today" ? m.day === today || m.status === "live" : d === "tomorrow" ? m.day === addDays(today, 1) : (m.day >= today && m.day <= addDays(today, 6)) || m.status === "live");
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
  const [refreshing, setRefreshing] = useState("");
  const refreshNow = async (name: string) => {
    if (refreshing) return;
    setRefreshing(name);
    try {
      const r = await refreshParser(name);
      toast.success(`${PARSER_NAMES[name] || name}: оновлюємо`, { description: name === "oddspapi" ? `Витрачено ${r.cost} ${plural(r.cost, "запит", "запити", "запитів")} з місячного ліміту. Коефіцієнти з’являться за хвилину.` : name === "liquipedia" ? "Liquipedia просить паузу 31 с між запитами — обидві гри оновляться приблизно за хвилину." : "Наступний запит піде одразу." });
      window.setTimeout(() => { void load(); }, name === "liquipedia" ? 70_000 : 8_000);
    } catch (e) {
      toast.error("Не вдалося оновити", { description: e instanceof Error ? e.message : "Сервер не відповів" });
    }
    window.setTimeout(() => setRefreshing(""), 1200);
  };
  const setPaused = (name: string, paused: boolean) => setParsers((ps) => ps && ps.map((x) => (x.name === name ? { ...x, paused, pausedAt: paused ? new Date().toISOString() : "", pausedBy: paused ? x.pausedBy : "" } : x)));
  // minutes until 08:00 Kyiv (tomorrow if it is already past 08:00)
  const toMorning = () => { const kyiv = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Kyiv" })); const t = new Date(kyiv); t.setHours(8, 0, 0, 0); if (t <= kyiv) t.setDate(t.getDate() + 1); return Math.round((t.getTime() - kyiv.getTime()) / 60_000); };
  const stopOrStart = async (name: string, stop: boolean, minutes?: number) => {
    if (stopping) return;
    setStopping(name); setPaused(name, stop);
    try {
      await (stop ? stopParser(name, minutes) : startParser(name));
      if (stop) toast.success(`${PARSER_NAMES[name] || name} зупинено${minutes ? ` до ${new Date(Date.now() + minutes * 60_000).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv" })}` : ""}`, { description: minutes ? "Потім запуститься сам. Застосунок поки показує останні збережені дані" : "Він не звертається до джерела, застосунок показує останні збережені дані", action: { label: "Запустити", onClick: () => stopOrStart(name, false) } });
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
        <small className="v3-mxp-tt"><TourIcon src={m.tourLogo} /><span>{m.tournament || GAME_LABEL[m.game]}</span></small>
        <span className="v3-mxp-tm"><Logo src={m.logo1} name={m.t1} size={30} /><b aria-label={sc ? `Рахунок ${m.s1}:${m.s2}` : "Рахунку ще немає"}>{sc ? `${m.s1} : ${m.s2}` : "– : –"}</b><Logo src={m.logo2} name={m.t2} size={30} /></span>
        <span className="v3-mxp-tn"><strong>{m.t1}</strong><strong>{m.t2}</strong></span>
        {chips(m)}
      </button>
    ) : (
      <button key={m.id} type="button" className={`v3-mxp-card is-${m.status}`} style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }} onClick={() => openM(m)}>
        <span className="v3-mxp-ch">{head(m)}{gChip(m.game)}<span className="v3-mxp-tour"><TourIcon src={m.tourLogo} /><span>{[m.tournament, m.bo].filter(Boolean).join(" · ")}</span></span><ChevronRight size={15} className="v3-mxp-chev" aria-hidden="true" /></span>
        {[[m.t1, m.logo1, m.s1], [m.t2, m.logo2, m.s2]].map(([n, l, s], k) => (
          <span key={k} className={`v3-mxp-team${dim ? " is-dim" : ""}${m.status === "off" ? " is-off" : ""}`}><Logo src={l as string | null} name={n as string} size={22} /><strong>{n as string}</strong><b>{sc ? String(s) : ""}</b></span>
        ))}
        {chips(m)}
      </button>
    );
  };
  const groupsOf = (xs: Match[]) => {
    // «Тиждень»: by day — live matches sit first inside «Сьогодні», a separate «Наживо» group is only on «Сьогодні»
    if (day === "week") {
      const rank = (m: Match) => (m.status === "live" ? 0 : m.status === "plan" ? 1 : 2);
      const dayOf = (m: Match) => (m.status === "live" && m.day < today ? today : m.day); // live since yesterday — under «Сьогодні»
      const days = [...new Set(xs.map(dayOf))].sort();
      return days.map((d) => [d === today ? "Сьогодні" : d === addDays(today, 1) ? "Завтра" : dayShort(d), xs.filter((m) => dayOf(m) === d).sort((x, y) => rank(x) - rank(y))]) as [string, Match[]][];
    }
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
              out.push(<p key={`h-${title}`} className="v3-mxp-gh">{title}<span className="v3-mxp-ghn">{xs.length}</span></p>);
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
  /** Team from the directory by any of its spellings — the match sheet opens its card in «Команди». */
  const teamOf = (g: Game, name: string) => { const n = normTeam(name); return teams.find((t) => t.game === g && [t.name, ...t.aliases, ...t.variants].some((x) => normTeam(x) === n)); };
  const openTeam = (t: Team) => { setPhoneEdit(false); setTf("all"); setTq(""); setTab("teams"); setSelTeam(t.key); setSheet(true); };
  const vsSide = (m: Match, side: 1 | 2) => {
    const name = side === 1 ? m.t1 : m.t2, logo = side === 1 ? m.logo1 : m.logo2, t = teamOf(m.game, name);
    const inner = <><Logo src={logo} name={name} size={44} /><strong>{name}</strong></>;
    return t ? <button type="button" className="v3-mxp-vsteam" aria-label={`Відкрити команду ${t.name}`} onClick={() => openTeam(t)}>{inner}</button> : <span>{inner}</span>;
  };
  const phoneDetail = (m: Match) => {
    const bs = betsFor(m), sc = hasScore(m), ov = ovOf(m);
    return (
      <div className="v3-mxp-det">
        <div className="v3-mxp-dh">{head(m)}{gChip(m.game)}</div>
        <div className="v3-mxp-vs">
          {vsSide(m, 1)}
          <b aria-label={sc ? `Рахунок ${m.s1}:${m.s2}` : "Рахунку ще немає"}>{sc ? `${m.s1} : ${m.s2}` : "– : –"}</b>
          {vsSide(m, 2)}
        </div>
        <dl className="v3-mxp-kv">
          <div><dt>Турнір</dt><dd>{[m.tournament || "не вказано", m.stage, m.tier ? `тир ${m.tier}` : "", m.bo].filter(Boolean).join(" · ")}</dd></div>
          {m.maps && <div><dt>Карти</dt><dd className="v3-mxp-maps">{m.maps.map((x, k) => <span key={k}>{x.map} <b>{x.score1 ?? "–"}:{x.score2 ?? "–"}</b></span>)}</dd></div>}
          <div><dt>Початок</dt><dd>{m.day === today ? m.time : `${dayShort(m.day)} · ${m.time}`} · Київ</dd></div>
          {m.c1 != null && m.c2 != null && <div><dt>Коефіцієнти</dt><dd className="v3-mxp-odds">{([[m.c1, m.o1, m.t1], [m.c2, m.o2, m.t2]] as const).map(([c, o, t], k) => { const mv = oddsMove(c, o); return <span key={k} aria-label={`${t}: ${mv.now}${mv.from ? `, на відкритті ${mv.from}` : ""}`}><b>{mv.now}</b>{mv.dir && <i className={`is-${mv.dir}`}>{mv.dir === "down" ? "↓" : "↑"} з {mv.from}</i>}</span>; })}</dd></div>}
          {m.x1 != null && m.x2 != null && <div><dt>Закриття</dt><dd>{oddsMove(m.x1, null).now} · {oddsMove(m.x2, null).now}<small className="v3-mxp-ksub">остання ціна перед стартом</small></dd></div>}
          {(m.b1 && m.c1 != null && m.b1.c > m.c1) || (m.b2 && m.c2 != null && m.b2.c > m.c2) ? <div><dt>Найкращий</dt><dd>{[m.b1, m.b2].map((b, k) => b ? <span key={k} className="v3-mxp-best">{oddsMove(b.c, null).now} <small>{b.book}</small></span> : null)}</dd></div> : null}
          <div><dt>Джерело</dt><dd>{m.link ? <a href={m.link} target="_blank" rel="noreferrer">{m.source}<ExternalLink size={12} aria-hidden="true" /></a> : m.source}{updatedAt ? ` · оновлено ${updatedAt}` : ""}</dd></div>
          {ov && <div><dt>Правка</dt><dd>@{ov.decidedBy}</dd></div>}
        </dl>
        {!m.manual && !m.id.includes(":h:") && <MatchHistory game={m.game} id={m.raw} />}
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
        <p className="v3-mxp-enote"><AlertTriangle size={14} aria-hidden="true" />Рахунок діє, поки джерело не дасть свій.</p>
        <fieldset disabled={!online || busyM} className="v3-mxp-efs">
          <div className="v3-mxp-eg"><span className="v3-mxp-egt">Час і статус</span>
            <div className="v3-mxp-e2">
              <div className="v3-field"><label id={`pe-d-${m.id}`}>Дата</label><DateField id={`pe-date-${m.id}`} labelledBy={`pe-d-${m.id}`} value={f.date} onChange={(v) => setForm(m, { date: v })} /></div>
              <div className="v3-field"><label htmlFor={`pe-t-${m.id}`}>Час (Київ)</label><TimeInput id={`pe-t-${m.id}`} value={f.time} onChange={(v) => setForm(m, { time: v })} /></div>
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
  const SRC_NAME = { pandascore: "PandaScore", cito: "Cito" } as const;
  const conflictsN = issues.filter((x) => x.kind === "conflict").length;
  const isOddsP = (p: ParserState) => !!p.odds || p.name === "oddspapi" || p.name === "polymarket";
  const pKinds = [["matches", "Матчі", (parsers || []).filter((p) => !isOddsP(p)).length], ["odds", "Коефіцієнти", (parsers || []).filter(isOddsP).length]] as const;
  const phoneParsers = (
    <section className="v3-mxp-ps">
      <div className="v3-mxp-bar"><div className="v3-mxp-days is-teams is-two" role="group" aria-label="Тип парсерів">{pKinds.map(([k, l, n]) => <button key={k} type="button" className={pKind === k ? "is-on" : ""} aria-pressed={pKind === k} onClick={() => setPKind(k)}>{l}{parsers && <b>{n}</b>}</button>)}</div></div>
      {pKind === "matches" && issues.length > 0 && <button type="button" className={`v3-mxp-iss${conflictsN ? " is-warn" : ""}`} onClick={() => setIssuesOpen(true)}>
        <AlertTriangle size={16} aria-hidden="true" />
        <span><b>{conflictsN ? `Розбіжності рахунку · ${conflictsN}` : "Розбіжностей немає"}</b><small>{issues.length - conflictsN ? `закрито за PandaScore і Cito · ${issues.length - conflictsN}` : "джерела по-різному бачать рахунок — перевірте перед розрахунком ставок"}</small></span>
        <ChevronRight size={16} aria-hidden="true" />
      </button>}
      <Dialog open={issuesOpen} onOpenChange={setIssuesOpen}>
        <DialogContent className="v3-sheet v3-pay-sheet v3-mxp-isss">
          <DialogTitle>Рахунки між джерелами</DialogTitle>
          <p className="v3-mxp-isss-sub">За 7 днів. «Розбіжність» — Liquipedia та інше джерело дали різний рахунок. Оберіть правильний: він стане рахунком матчу в застосунку (як через «Редагувати»), а за ним підказується результат ставок. «Закрито» — Liquipedia мовчала, а PandaScore і Cito 2 год показували однаковий рахунок.</p>
          <ul>{issues.map((x) => (
            <li key={`${x.kind}-${x.id}`} className={`is-${x.kind}`}>
              <span className="v3-mxp-iss-k">{x.kind === "conflict" ? "Розбіжність" : "Закрито"} · {x.game === "cs2" ? "CS2" : "Dota 2"}</span>
              <strong>{x.team1} — {x.team2}</strong>
              <small>{x.tournament ? `${x.tournament} · ` : ""}{new Date(x.start).toLocaleString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv" })}</small>
              {x.kind === "conflict" ? <>
                <p className="v3-mxp-iss-q">Який рахунок правильний?</p>
                <div className="v3-mxp-iss-sc is-pick">
                  <button type="button" disabled={!online || issueBusy !== null} onClick={() => void settleIssue(x, null)}>Liquipedia <b>{x.ours}</b></button>
                  {x.theirs.map((t) => <button type="button" key={t.source} disabled={!online || issueBusy !== null} onClick={() => void settleIssue(x, t.score)}>{SRC_NAME[t.source]} <b>{t.score}</b></button>)}
                </div>
              </> : <>
                <div className="v3-mxp-iss-sc"><span>Закрито з <b>{x.ours}</b></span>{x.theirs.map((t) => <span key={t.source}>{SRC_NAME[t.source]} <b>{t.score}</b></span>)}</div>
                <button type="button" className="v3-mxp-iss-ok" disabled={!online || issueBusy !== null} onClick={() => void settleIssue(x, null)}><Check size={14} strokeWidth={2.6} aria-hidden="true" />Перевірено</button>
              </>}
            </li>
          ))}</ul>
        </DialogContent>
      </Dialog>
      {parsers === null ? Array.from({ length: 2 }, (_, i) => <div key={i} className="v3-mxp-pc is-skel" aria-hidden="true"><span className="v3-skel v3-skel-light" style={{ width: "40%" }} /><span className="v3-skel v3-skel-light" /><span className="v3-skel v3-skel-light" style={{ width: "70%" }} /></div>)
        : !parsers.length ? <div className="v3-mxp-none"><span className="v3-mxp-none-ic" aria-hidden="true"><Activity size={20} /></span><strong>Парсерів немає</strong><span>Бекенд не повідомив про жодне джерело матчів. Щойно парсер запуститься, він з’явиться тут.</span></div>
        : parsers.filter((p) => (pKind === "odds") === isOddsP(p)).map((p, i) => {
          const meta = PARSER_META[p.name] || { ini: initials(p.name), color: "#5f6878", site: p.name, game: "", feed: "cs2" as const };
          const ps = pState(p), r = running[p.name], cnt = cntFor(p.name), hrs = hoursOf(p.name);
          return (
            <div key={p.name} className={`v3-mxp-pc${ps === "paused" ? " is-paused" : ""}`} style={{ animationDelay: `${i * 60}ms` }}>
              <div className="v3-mxp-ph">
                <strong>{PARSER_NAMES[p.name] || p.name}</strong>
                <span key={ps} className={`v3-mxp-pst is-${ps}`}><i aria-hidden="true" />{ps === "down" ? "Помилка" : ps === "flaky" ? "Збої" : ps === "idle" ? "Без даних" : ps === "stale" ? `Без оновлень ${staleText(p)}` : ps === "paused" ? "Зупинено" : "Працює"}</span>
                <span className="v3-mxp-pa">
                  {events[p.name] && <button type="button" className="v3-mxp-plog" onClick={() => setLogFor(p.name)} aria-label={`Інформація й лог · ${PARSER_NAMES[p.name] || p.name}`}><Info size={16} aria-hidden="true" /></button>}
                  {p.paused ? <button type="button" className="v3-mxp-pgo" disabled={!online || stopping === p.name} onClick={() => stopOrStart(p.name, false)}><Play size={13} aria-hidden="true" />Запустити</button>
                    : <button type="button" className="v3-mxp-pstop" disabled={!online || stopping === p.name} onClick={() => setStopAsk(p.name)} aria-label={`Зупинити ${PARSER_NAMES[p.name] || p.name}`}><i aria-hidden="true"><Square size={7} fill="currentColor" /></i>Стоп</button>}
                </span>
              </div>
              <small className="v3-mxp-psub">{p.paused ? `${meta.game || meta.site} · ${p.pausedUntil ? `зупинено до ${new Date(p.pausedUntil).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv" })}, потім запуститься сам` : `зупинено вручну${p.pausedBy ? ` @${p.pausedBy}` : ""}`}` : ps === "down" || ps === "flaky" ? `${meta.game || meta.site} · не відповідає${p.lastFailure ? ` · ${ago(p.lastFailure)}` : ""}` : `${meta.game || meta.site} · ${!matches ? "…" : p.name === "oddspapi" ? (() => { const n = cntFor(p.name, all); return `${n} ${plural(n, "матч", "матчі", "матчів")} з коефіцієнтами`; })() : `${cnt} ${plural(cnt, "матч", "матчі", "матчів")} сьогодні`}`}</small>
              {/* tap an hour — what happened in it */}
              <div className="v3-mxp-bars" role="group" aria-label="Останні 24 години">{hrs.map((h, k) => <button type="button" key={k} className={`is-${p.paused ? "none" : h.s}${hourFor?.p === p.name && hourFor.k === k ? " is-pick" : ""}`} aria-label={`${h.hh}:00 — ${hourText(h)}`} onClick={() => setHourFor(hourFor?.p === p.name && hourFor.k === k ? null : { p: p.name, k })} />)}</div>
              {hourFor?.p === p.name && hrs[hourFor.k] && <div key={hourFor.k} className={`v3-mxp-hour is-${hrs[hourFor.k].s}`} role="status" style={{ ["--x" as string]: `${(hourFor.k + .5) / 24 * 100}%` }}><b>{hrs[hourFor.k].hh}:00–{String((+hrs[hourFor.k].hh + 1) % 24).padStart(2, "0")}:00</b><span>{hourText(hrs[hourFor.k])}</span></div>}
              <div className="v3-mxp-axis"><span>24 год тому</span><span>зараз</span></div>
              {/* 7 days: share of successful runs per day */}
              {p.week && p.week.some((d) => d.ok + d.fail > 0) && (() => { const ok = p.week.reduce((a, d) => a + d.ok, 0), all = p.week.reduce((a, d) => a + d.ok + d.fail, 0), pct = Math.floor((ok / all) * 1000) / 10; return (
                <div className="v3-mxp-week">
                  <div className="v3-mxp-wh"><span>7 днів</span><b className={pct >= 95 ? "is-ok" : pct >= 80 ? "is-mid" : "is-bad"}>{String(pct).replace(".", ",")}% успішних запусків</b></div>
                  <div className="v3-mxp-wd">{p.week.map((d) => { const n = d.ok + d.fail, r = n ? d.ok / n : -1; const lvl = r < 0 ? "none" : r >= .95 ? "ok" : r >= .8 ? "mid" : "bad"; const wd = new Date(`${d.day}T12:00:00Z`).toLocaleDateString("uk-UA", { weekday: "short", timeZone: "UTC" }); const key = `${p.name}:${d.day}`; return <button type="button" key={d.day} className={`is-${lvl}${dayOpen === key ? " is-sel" : ""}`} disabled={!d.fail} aria-pressed={dayOpen === key} aria-label={`${wd} ${d.day}: ${n ? `${d.ok} з ${n} успішно` : "запусків немає"}${d.fail ? ", показати збої" : ""}`} onClick={() => setDayOpen(dayOpen === key ? null : key)}><i />{wd}</button>; })}</div>
                  {(() => { const d = p.week.find((x) => `${p.name}:${x.day}` === dayOpen); if (!d) return null; return (
                    <div className="v3-mxp-wwhy">
                      <b>{new Date(`${d.day}T12:00:00Z`).toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })} · {d.fail} {plural(d.fail, "збій", "збої", "збоїв")} з {d.ok + d.fail}</b>
                      {(d.reasons || []).map((x) => <p key={x.message}><span>{x.message}</span><small>{x.n}× · {x.first === x.last ? x.first : `${x.first}–${x.last}`}</small></p>)}
                    </div>
                  ); })()}
                </div>
              ); })()}
              <div className="v3-mxp-ptiles">
                <div><span>Збоїв за 24 год</span><b className={p.failures24h > 0 ? "is-bad" : ""}>{p.failures24h}</b></div>
                <div><span>Останній збій</span><b>{p.lastFailure ? ago(p.lastFailure) : "—"}</b></div>
                <div><span>Зібрано матчів</span><b>{matches ? cntFor(p.name, all) : "…"}</b></div>
              </div>
              {/* OddsPapi only adds prices: where they get lost — schedule → priced → our matches */}
              {p.pages && (p.pages.pages > 0 || p.pages.mode === "off") && !p.paused && <div className="v3-mxp-podds"><p>Сторінки турнірів: {p.pages.pages} · +{p.pages.added} {plural(p.pages.added, "матч", "матчі", "матчів")}, яких немає в тікері</p><small>Тікер вміщує лише 50 найближчих матчів — решту розкладу беремо зі сторінок турнірів (кожна раз на годину){p.pages.checked ? ` · збіг із тікером ${p.pages.agreed} з ${p.pages.checked}` : ""}</small>{p.pages.trusted === false && p.pages.mode === "auto" && <p className="v3-mxp-pfall">Сторінки розходяться з тікером у часі, тож їхні матчі зараз не додаються. {p.pages.off?.length ? `Напр.: ${p.pages.off.slice(0, 2).join("; ")}.` : ""} Якщо розбіжності неважливі — оберіть «Завжди».</p>}<div className="v3-mxp-pmode" role="radiogroup" aria-label="Сторінки турнірів"><small>Додавати матчі сторінок</small><div>{([["auto", "Авто"], ["on", "Завжди"], ["off", "Вимкнено"]] as [PagesMode, string][]).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={(p.pages!.mode || "auto") === k} className={(p.pages!.mode || "auto") === k ? "is-on" : ""} disabled={!online || pagesBusy} onClick={() => void changePagesMode(k)}>{l}</button>)}</div><small className="v3-mxp-pmode-h">{(p.pages.mode || "auto") === "auto" ? "Поки збігаються з тікером (70%+)" : p.pages.mode === "on" ? "Завжди, навіть якщо розходяться з тікером" : "Сторінки не читаються — лише тікер"}</small></div>{!!p.pages.empty && <p className="v3-mxp-pfall">{p.pages.empty === p.pages.pages ? `Жодна сторінка турніру не дала матчів (${p.pages.pages})` : `${p.pages.empty} з ${p.pages.pages} сторінок турнірів без матчів`} — схоже, Liquipedia змінила розмітку сторінок. Тікер працює як раніше, а розбір сторінок треба оновити.</p>}</div>}
              {p.pandascore && !p.paused && !p.pandascore.at && <div className="v3-mxp-podds"><p>Ще не запитували після перезапуску сервера</p><small>Перший запит — коли в застосунку з’являться відвідувачі (без них оновлення спить)</small></div>}
              {p.pandascore && !p.paused && !!p.pandascore.at && <div className="v3-mxp-podds"><p>Матчів у PandaScore: CS2 {p.pandascore.cs2} · Dota 2 {p.pandascore.dota2} · додано до стрічки {p.pandascore.added.cs2 + p.pandascore.added.dota2} (решта вже є з Liquipedia)</p><small>{p.pandascore.aliases ? `Зв’язків команд додано автоматично: ${p.pandascore.aliases} · ` : ""}Запитів за останню годину {p.pandascore.callsThisHour} з 1000{p.pandascore.at ? ` · оновлено ${ago(p.pandascore.at)}` : ""}{p.pandascore.waiting ? " · наступне — коли в застосунку з’являться відвідувачі" : p.pandascore.nextAt ? ` · наступне о ${new Date(p.pandascore.nextAt).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv" })}` : ""}</small></div>}
              {p.polymarket && !p.paused && <div className="v3-mxp-podds"><p>{p.polymarket.at ? `Матчів на Polymarket ${p.polymarket.cs2 + p.polymarket.dota2} (CS2 ${p.polymarket.cs2} · Dota 2 ${p.polymarket.dota2}) · з цінами ${p.polymarket.priced} · на наших матчах ${p.polymarket.matched}` : "Ще не запитували"}</p><small>Без ключа й ліміту · ціни поруч із букмекерськими, не замість них{p.polymarket.at ? ` · оновлено ${ago(p.polymarket.at)}` : ""}{p.polymarket.nextAt ? ` · наступне о ${new Date(p.polymarket.nextAt).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv" })}` : ""}</small></div>}
              {p.cito && !p.paused && !p.cito.upcomingAt && <div className="v3-mxp-podds"><p>Ще не запитували</p><small>Перший запит — коли в застосунку з’являться відвідувачі (без них оновлення спить) · ліміт {p.cito.budget} на місяць</small></div>}
              {p.cito && !p.paused && !!p.cito.upcomingAt && <div className="v3-mxp-podds"><p>Матчів у Cito {p.cito.upcoming + p.cito.recent} · додано до стрічки {p.cito.added} (решта вже є з Liquipedia)</p><small>Запитів {p.cito.used} з {p.cito.budget} за місяць{p.cito.upcomingAt ? ` · розклад ${ago(p.cito.upcomingAt)}` : ""}{p.cito.nextAt ? ` · наступний о ${new Date(p.cito.nextAt).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv" })}` : ""}</small></div>}
              {p.odds && !p.paused && <div className="v3-mxp-podds"><p>У розкладі {p.odds.scheduled} · з коефіцієнтами {p.odds.priced} · у наших матчах {p.odds.matched}</p><small>Запитів {p.odds.used} з {p.odds.budget} за місяць{p.odds.accountAt ? " (дані OddsPapi)" : ""}{p.odds.oddsAt ? ` · коефіцієнти ${ago(p.odds.oddsAt)}` : p.odds.fixturesAt ? ` · розклад ${ago(p.odds.fixturesAt)}` : ""}{p.odds.nextOddsAt ? ` · наступні о ${new Date(p.odds.nextOddsAt).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv" })}` : ""}{p.odds.calls && Object.keys(p.odds.calls).length ? <span className="v3-mxp-pcalls">наш сервер цього місяця: {Object.entries(p.odds.calls).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k.replace(/^\//, "")} ${n}`).join(" · ")}</span> : null}</small>{!!p.odds.fallback && <p className="v3-mxp-pfall">Liquipedia не оновлюється — у стрічці {p.odds.fallback} {plural(p.odds.fallback, "матч", "матчі", "матчів")} з розкладу OddsPapi (без рахунку)</p>}{!!p.odds.unmatched?.length && <button type="button" className="v3-mxp-pmiss" onClick={() => setMissOpen(true)}><AlertTriangle size={14} aria-hidden="true" />Не знайшли наш матч: {p.odds.unmatched.length}<ChevronRight size={15} aria-hidden="true" /></button>}</div>}
              {p.open && !p.paused && <button type="button" className="v3-mxp-prun" disabled={!online || r === "busy"} onClick={() => rerun(p.name)}>{r === "busy" ? "Запускаємо…" : r === "done" ? "Запущено" : "Запустити зараз"}</button>}
              {/* «Оновити зараз»: fetch from the source now; OddsPapi says what it costs from the month's requests */}
              {!p.open && !p.paused && <button type="button" className="v3-mxp-pref" disabled={!online || refreshing === p.name || (p.name === "oddspapi" && !!p.odds && p.odds.used >= p.odds.budget) || (p.name === "cito" && !!p.cito && p.cito.left <= 2)} onClick={() => refreshNow(p.name)}><RefreshCw size={14} aria-hidden="true" className={refreshing === p.name ? "is-spin" : ""} />{refreshing === p.name ? "Оновлюємо…" : "Оновити зараз"}{p.name === "oddspapi" && p.odds?.refreshCost ? <small>{p.odds.refreshCost} {plural(p.odds.refreshCost, "запит", "запити", "запитів")} з ліміту</small> : p.name === "cito" ? <small>2 запити з ліміту</small> : p.name === "liquipedia" ? <small>≈ 1 хв</small> : null}</button>}
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
                <span key={ps} className={`v3-tag v3-mx-flip ${ps === "down" ? "v3-tag-red" : ps === "ok" ? "v3-tag-green" : ps === "paused" ? "v3-tag-gray" : "v3-tag-amber"}`}><i className={`v3-mx-dot${ps === "down" || ps === "flaky" ? " is-pulse" : ""}`} aria-hidden="true" />{ps === "down" ? "Помилка" : ps === "flaky" ? "Збої" : ps === "idle" ? "Без даних" : ps === "stale" ? `Без оновлень ${staleText(p)}` : ps === "paused" ? "Зупинено" : "Працює"}</span>
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
              <p className="v3-mx-pnote">{p.paused ? `Зупинено вручну${p.pausedBy ? ` (@${p.pausedBy})` : ""}${p.pausedAt ? ` ${ago(p.pausedAt)}` : ""}. Парсер не звертається до джерела і не рахує збоїв — застосунок показує останні збережені дані. «Запустити» вмикає його знову.` : p.open ? `Запобіжник спрацював після ${p.failures} ${plural(p.failures, "невдалої спроби", "невдалих спроб", "невдалих спроб")} — застосунок показує останні отримані дані. «Запустити зараз» скидає його, і наступний запит піде одразу.` : ps === "flaky" ? `Останні запуски завершуються помилкою (${ago(p.lastFailure)}), парсер повторює спроби. Поки так, у меню біля «Матчі» стоїть «!».` : ps === "stale" ? `Помилок немає, але Liquipedia не оновлювалась ${staleText(p)} (зазвичай — кожні 5 хв). Застосунок показує останні отримані дані; «Оновити зараз» запустить запит.` : ps === "idle" ? "Помилок немає, але сьогодні джерело не повернуло жодного матчу — найчастіше це блокування з боку сайту. Застосунок показує останні отримані дані." : "Дані оновлюються автоматично. Якщо джерело мовчатиме, тут з’явиться помилка, а в меню — позначка «!»."}</p>
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
      .sort((a, b) => b.ts - a.ts)
      // the same match from two sources (Liquipedia + PandaScore, an older id in the history): one opponent within 6 h,
      // or one opponent and the same score on the same day (sources that disagree on the start by hours)
      .filter((m, i, xs) => { const opp = (x: Match) => normTeam(normTeam(x.t1) === tn ? x.t2 : x.t1);
        const sc = (x: Match) => (normTeam(x.t1) === tn ? `${x.s1}:${x.s2}` : `${x.s2}:${x.s1}`);
        return !xs.slice(0, i).some((y) => y.id === m.id || (opp(y) === opp(m) && (Math.abs(y.ts - m.ts) < 6 * 3_600_000 || (y.day === m.day && sc(y) === sc(m))))); })
      .slice(0, 5)
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
            {own.map((a) => <span key={a.id} className="v3-mxt-chip" title={a.createdBy === "auto:pandascore" ? "Додано автоматично з PandaScore. Якщо це інша команда — приберіть: більше не повернеться." : undefined}>{a.alias}{a.createdBy === "auto:pandascore" && <em className="v3-mxt-auto">авто</em>}<button type="button" aria-label={`Прибрати псевдонім ${a.alias}`} disabled={!online || saving === `alias:${a.id}`} onClick={() => removeAlias(a)}><X size={12} aria-hidden="true" /></button></span>)}
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
              <div className="v3-mxp-days is-teams" role="group" aria-label="Фільтр">{([["all", "Усі", tfOpts[0].n], ["logo", "Без лого", tfOpts[2].n], ["dup", "Дублікати", tfOpts[1].n]] as [typeof tf, string, number][]).map(([k, l, n]) => <button key={k} type="button" className={tf === k ? "is-on" : ""} aria-pressed={tf === k} onClick={() => setTf(k)}>{l}<b>{n}</b></button>)}</div>
              <button type="button" className={`v3-mxp-fbtn${tg !== "all" ? " is-on" : ""}`} aria-label="Фільтр" aria-haspopup="dialog" onClick={() => setTFiltOpen(true)}><Filter size={16} aria-hidden="true" /></button>
              {/* «Дублікати» are pair cards — no list / tiles there, so the switch is greyed out */}
              <div className={`v3-mxp-view${tf === "dup" ? " is-off" : ""}`} role="group" aria-label="Вигляд" title={tf === "dup" ? "У «Дублікатах» лише картки пар" : undefined}><button type="button" disabled={tf === "dup"} className={tView === "list" && tf !== "dup" ? "is-on" : ""} aria-pressed={tView === "list"} aria-label="Списком" onClick={() => tView !== "list" && flipView()}><List size={15} aria-hidden="true" /></button><button type="button" disabled={tf === "dup"} className={tView === "grid" && tf !== "dup" ? "is-on" : ""} aria-pressed={tView === "grid"} aria-label="Плитками" onClick={() => tView !== "grid" && flipView()}><LayoutGrid size={15} aria-hidden="true" /></button></div>
              <Dialog open={tFiltOpen} onOpenChange={setTFiltOpen}>
                <DialogContent className="v3-sheet v3-pay-sheet v3-mxp-filt">
                  <div className="v3-mxp-fh"><DialogTitle>Фільтр</DialogTitle>{tg !== "all" && <button type="button" onClick={() => setTg("all")}>Скинути</button>}</div>
                  <DialogDescription className="sr-only">Гра команд</DialogDescription>
                  <span className="v3-mxp-fl">Гра</span>
                  <div className="v3-mxp-seg" role="group" aria-label="Гра"><PillTrack active={tg} />{([["all", "Усі"], ["cs2", "CS2"], ["dota2", "Dota 2"]] as const).map(([k, l]) => <button key={k} type="button" className={tg === k ? "is-on" : ""} aria-pressed={tg === k} onClick={() => setTg(k)}>{l}</button>)}</div>
                  <button type="button" className="v3-mxp-apply" onClick={() => setTFiltOpen(false)}>Показати {tList.length} {plural(tList.length, "команду", "команди", "команд")}</button>
                </DialogContent>
              </Dialog>
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
                <button type="button" className="is-green" disabled={!online || busyK} onClick={() => addAliases(t, [v])}>{saving === `team:${t.key}` ? "Зберігаємо…" : "Це одна команда"}</button>
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

  // ═════════════ WEB (≥768 px): light layout from the «Матчі · веб» designs ═════════════
  const wMoney = (bs: UBet[]) => { const uah = Math.round(bs.filter((b) => b.currency !== "USD").reduce((a, b) => a + (Number(b.amount) || 0), 0)); const usd = Math.round(bs.filter((b) => b.currency === "USD").reduce((a, b) => a + (Number(b.originalAmount ?? b.amount) || 0), 0)); return [uah ? `${uah.toLocaleString("uk-UA")} ₴` : "", usd ? `${usd} $` : ""].filter(Boolean).join(" · "); };
  const wTodayBets = bets ? todayM.flatMap((m) => betsFor(m)) : null;
  const wUsers = wTodayBets ? new Set(wTodayBets.map((b) => b.username)).size : 0;
  const wOk = (parsers || []).filter((p) => pState(p) === "ok").length;
  const wConf = issues.filter((x) => x.kind === "conflict");
  const wPaused = !!parsers?.length && parsers.every((p) => p.paused);
  const wKpis = [
    { k: "t", l: "Матчів сьогодні", v: matches ? String(todayM.length) : "…", n: matches ? (todayM.length ? `CS2 ${todayM.filter((m) => m.game === "cs2").length} · Dota 2 ${todayM.filter((m) => m.game === "dota2").length} · наживо ${liveN}` : "у стрічках порожньо") : "" },
    { k: "b", l: "Ставки на матчі сьогодні", v: wTodayBets ? String(wTodayBets.length) : "…", n: wTodayBets ? (wTodayBets.length ? `${wMoney(wTodayBets)} · ${wUsers} ${plural(wUsers, "користувач", "користувачі", "користувачів")}` : "ставок ще немає") : "" },
    { k: "p", l: "Парсери", v: parsers ? `${wOk} з ${parsers.length}` : "…", n: !parsers ? "" : wPaused ? `усі зупинені${updatedAt ? ` · дані на ${updatedAt}` : ""}` : down.length ? issueText(down[0]) : "усі працюють", bad: !!parsers && (down.length > 0 || wPaused) },
    { k: "c", l: "Розбіжності рахунку", v: String(wConf.length), n: wConf.length ? `${wConf[0].team1} — ${wConf[0].team2}` : "усе збігається", warn: wConf.length > 0 },
  ];
  const wTabs: { k: Tab; l: string; n: string }[] = [
    { k: "matches", l: "Матчі", n: matches ? String(todayM.length) : "…" },
    { k: "parsers", l: "Парсери", n: parsers ? `${wOk}/${parsers.length}` : "…" },
    { k: "manual", l: "Вручну", n: bets ? String(groups.length) : "…" },
    { k: "teams", l: "Команди", n: matches ? teams.length.toLocaleString("uk-UA") : "…" },
  ];
  const wSel = list.find((m) => m.id === selId) || list[0] || null;
  const wRank = (g: Game, name: string) => teamOf(g, name)?.rank ?? null;
  const wIn = (m: Match) => { const min = Math.round((m.ts - Date.now()) / 60000); return min > 0 && min < 24 * 60 ? `за ${min >= 60 ? `${Math.floor(min / 60)} год ` : ""}${min % 60} хв` : ""; };
  const wSt: Record<MStatus, string> = { plan: "is-blue", live: "is-red", done: "is-grey", moved: "is-amber", off: "is-red" };
  const wTag = (m: Match) => { const conf = wConf.some((x) => x.team1 === m.t1 && x.team2 === m.t2); return conf ? <span className="v3-uwt is-amber">Розбіжність</span> : <span className={`v3-uwt ${wSt[m.status]}`}>{STATUS_LABEL[m.status]}</span>; };
  const wTour = (m: Match) => <span className="v3-mxw-tour">{m.tourLogo ? <img src={m.tourLogo} alt="" /> : <i style={{ background: "#e5484d" }} aria-hidden="true">{initials(m.tournament || "?")}</i>}<b>{[m.tournament || "Турнір", m.bo].filter(Boolean).join(" · ")}</b></span>;
  const wGame = (g: Game) => <span className="v3-mxw-g">{GAME_LABEL[g]}</span>;
  const wRow = (m: Match, i: number) => {
    const bs = bets ? betsFor(m) : [], ov = ovOf(m), sc = hasScore(m);
    return (
      <button key={m.id} type="button" className={`v3-mxw-row${wSel?.id === m.id ? " is-sel" : ""}`} style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }} aria-pressed={wSel?.id === m.id} onClick={() => setSelId(m.id)}>
        <span className="v3-mxw-when">{m.status === "live" ? <><span className="v3-uwt is-red v3-mxw-live"><i aria-hidden="true" />НАЖИВО</span><small>{m.maps?.length ? `карта ${m.maps.length} з ${m.bo.replace(/\D/g, "") || "?"}` : ""}</small></>
          : m.status === "done" || m.status === "off" || m.status === "moved" ? <>{wTag(m)}<small>{m.time}</small></> : <><b>{m.time}</b><small>{wIn(m)}</small></>}</span>
        <span className="v3-mxw-mid">
          <span className="v3-mxw-th">{wTour(m)}{wGame(m.game)}</span>
          <span className="v3-mxw-team"><Logo src={m.logo1} name={m.t1} size={20} /><span className="v3-mxw-tn">{m.t1}</span>{sc && <b className={m.status === "live" && (m.s1 ?? 0) > (m.s2 ?? 0) ? "is-lead" : ""}>{m.s1}</b>}</span>
          <span className="v3-mxw-team"><Logo src={m.logo2} name={m.t2} size={20} /><span className="v3-mxw-tn">{m.t2}</span>{sc && <b className={m.status === "live" && (m.s2 ?? 0) > (m.s1 ?? 0) ? "is-lead" : ""}>{m.s2}</b>}</span>
        </span>
        <span className="v3-mxw-side">{bs.length ? <b>{bs.length} {plural(bs.length, "ставка", "ставки", "ставок")} · {wMoney(bs)}</b> : <small>без ставок</small>}{ov && <span className="v3-uwt is-violet">Змінено вручну</span>}<small>{m.source}{updatedAt ? ` · ${updatedAt}` : ""}</small></span>
      </button>
    );
  };
  const wCard = (m: Match, i: number) => {
    const bs = bets ? betsFor(m) : [], sc = hasScore(m);
    return (
      <button key={m.id} type="button" className={`v3-mxw-card${wSel?.id === m.id ? " is-sel" : ""}`} style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }} aria-pressed={wSel?.id === m.id} onClick={() => setSelId(m.id)}>
        <span className="v3-mxw-ch">{wTour(m)}{m.status === "plan" ? <b>{m.time}</b> : wTag(m)}</span>
        <span className="v3-mxw-vs"><span><Logo src={m.logo1} name={m.t1} size={36} /><small>{m.t1}</small></span><strong>{sc ? `${m.s1} : ${m.s2}` : "– : –"}</strong><span><Logo src={m.logo2} name={m.t2} size={36} /><small>{m.t2}</small></span></span>
        <span className="v3-mxw-cf">{wGame(m.game)}<small>{m.status === "live" ? (m.maps?.length ? `карта ${m.maps.length}` : "наживо") : m.status === "done" ? `завершено ${m.time}` : m.status === "plan" ? wIn(m) || dayShort(m.day) : dayShort(m.day)}</small><b>{bs.length ? `${bs.length} · ${wMoney(bs)}` : ""}</b></span>
      </button>
    );
  };
  const wDetail = (m: Match) => {
    const bs = betsFor(m), ov = ovOf(m), sc = hasScore(m), r1 = wRank(m.game, m.t1), r2 = wRank(m.game, m.t2);
    return (
      <aside key={m.id} className="v3-adw-card v3-mxw-det">
        <div className="v3-mxw-dh">{m.tourLogo ? <img src={m.tourLogo} alt="" /> : <i aria-hidden="true">{initials(m.tournament || "?")}</i>}<span className="v3-mxw-dt"><b>{m.tournament || "Турнір не вказано"}</b><small>{[GAME_LABEL[m.game], m.bo].filter(Boolean).join(" · ")}</small></span>{wTag(m)}</div>
        <div className="v3-mxw-board">
          <span><Logo src={m.logo1} name={m.t1} size={46} /><b>{m.t1}</b>{r1 && <small>#{r1} у рейтингу</small>}</span>
          <span className="v3-mxw-bsc"><strong>{sc ? `${m.s1} : ${m.s2}` : "– : –"}</strong><small>{m.status === "live" ? (m.maps?.length ? `карта ${m.maps.length} з ${m.bo.replace(/\D/g, "") || "?"}` : "наживо") : m.status === "done" ? `завершено ${m.time}` : m.time}</small></span>
          <span><Logo src={m.logo2} name={m.t2} size={46} /><b>{m.t2}</b>{r2 && <small>#{r2} у рейтингу</small>}</span>
        </div>
        {ov && <div className="v3-adw-warn"><AlertTriangle size={14} aria-hidden="true" />Змінено вручну · @{ov.decidedBy}. Дані парсера її не перезапишуть.</div>}
        <dl className="v3-adw-dl">
          <div><dt>Початок</dt><dd>{m.day === today ? "сьогодні" : dayShort(m.day)} {m.time} · Київ</dd></div>
          <div><dt>Джерело</dt><dd>{m.link ? <a href={m.link} target="_blank" rel="noreferrer">{m.source}</a> : m.source}{updatedAt ? ` · оновлено ${updatedAt}` : ""}</dd></div>
        </dl>
        <div className="v3-mxw-bh"><b>Ставки користувачів · {bets ? bs.length : "…"}</b><small>{bs.length ? wMoney(bs) : ""}</small></div>
        <div className="v3-mxw-bets">{bs.length ? bs.map((b) => <div key={b.id}><UserAvatar username={b.username} telegram={b.telegram} /><span><b>@{b.username}</b><small>{b.betType} · {Number(b.odds).toFixed(2)}</small></span><strong>{b.currency === "USD" ? `${b.originalAmount ?? b.amount} $` : `${Math.round(b.amount)} ₴`}</strong></div>) : <p className="v3-mxw-none">На цей матч ставок немає</p>}</div>
        <div className="v3-mxw-df">
          {!m.manual && <button type="button" className="v3-uwb" disabled={!online} onClick={() => { setEdit(formOf(m)); setWEdit(m.id); }}><Pencil size={14} aria-hidden="true" />Редагувати</button>}
          <button type="button" className="v3-uwb is-softred" disabled={!online} onClick={() => (m.manual ? removeManual(m, true) : setDelAsk(m))}>Видалити матч</button>
        </div>
      </aside>
    );
  };
  const wNoMatch = <div className="v3-adw-card v3-adw-empty"><span aria-hidden="true">{error && matches === null ? <AlertTriangle size={20} /> : <Trophy size={20} />}</span><strong>{error && matches === null ? "Не вдалося завантажити матчі" : needle ? "Нічого не знайдено" : "Матчів немає"}</strong><p>{error && matches === null ? "Джерела не відповіли. Спробуйте ще раз або перевірте вкладку «Парсери»." : noMatchesText}</p>{error && matches === null ? <button type="button" className="v3-uwb is-green" onClick={() => void load()}>Спробувати ще раз</button> : day !== "week" && !needle ? <button type="button" className="v3-uwb is-green" onClick={() => setDay("week")}>Показати тиждень</button> : null}</div>;
  const wMatches = (
    <>
      <div className="v3-mxw-filt">
        <div className="v3-spw-kinds" role="group" aria-label="День"><PillTrack active={day} />{dayOpts.map((d) => <button key={d.key} type="button" className={day === d.key ? "is-on" : ""} aria-pressed={day === d.key} onClick={() => setDay(d.key)}>{d.label}</button>)}</div>
        <div className="v3-spw-fchips" role="group" aria-label="Гра">{([["all", "Усі"], ["cs2", "CS2"], ["dota2", "Dota 2"]] as const).map(([k, l]) => <button key={k} type="button" className={game === k ? "is-on" : ""} aria-pressed={game === k} onClick={() => setGame(k)}>{l}<b>{fCount(k, st)}</b></button>)}</div>
        <div className="v3-spw-fchips" role="group" aria-label="Статус">{([["all", "Усі статуси"], ["live", "Наживо"], ["plan", "Заплановано"], ["done", "Завершені"]] as const).map(([k, l]) => <button key={k} type="button" className={st === k ? "is-on" : ""} aria-pressed={st === k} onClick={() => setSt(k)}>{l}<b>{fCount(game, k)}</b></button>)}</div>
        <div className="v3-mxw-view" role="group" aria-label="Вигляд"><button type="button" className={mView === "list" ? "is-on" : ""} aria-pressed={mView === "list"} aria-label="Списком" onClick={() => pickView("list")}><List size={15} /></button><button type="button" className={mView === "grid" ? "is-on" : ""} aria-pressed={mView === "grid"} aria-label="Блоками" onClick={() => pickView("grid")}><LayoutGrid size={15} /></button></div>
      </div>
      {wPaused ? <div className="v3-mxw-alert is-red"><AlertTriangle size={15} aria-hidden="true" /><span>Парсери зупинені · у застосунку дані на {updatedAt || "останнє оновлення"}</span><button type="button" className="v3-uwb is-white" onClick={() => setTab("parsers")}>Запустити →</button></div>
        : down.length > 0 ? <div className="v3-mxw-alert"><AlertTriangle size={15} aria-hidden="true" /><span>{down.map(issueText).join(", ")}</span><button type="button" className="v3-uwb is-white" onClick={() => { setTab("parsers"); setLogFor(down[0].name); }}>Лог →</button></div> : null}
      <section className="v3-mxw-split">
        {matches === null && !error ? <div className="v3-adw-card v3-adw-skel v3-mxw-list">{[0, 1, 2, 3, 4].map((i) => <i key={i} style={{ height: 56 }} />)}</div>
          : !list.length ? wNoMatch
          : <div key={`${day}-${game}-${st}-${mView}`} className={`v3-adw-card v3-mxw-list${mView === "grid" ? " is-grid" : ""}`}>
            {needle && <p className="v3-mxw-found">Знайдено {list.length} · за командою або турніром</p>}
            {groupsOf(list).filter(([, xs]) => xs.length).map(([label, xs]) => <section key={label}><h3 className={label === "Наживо" ? "is-live" : ""}>{label} <span>{xs.length}</span></h3><div className={mView === "grid" ? "v3-mxw-grid" : ""}>{xs.map(mView === "grid" ? wCard : wRow)}</div></section>)}
          </div>}
        {wSel ? wDetail(wSel) : <aside className="v3-adw-card v3-adw-empty"><span aria-hidden="true"><Trophy size={20} /></span><p>Виберіть матч ліворуч</p></aside>}
      </section>
    </>
  );
  // ── parsers ──
  const kyivH = Number(new Date().toLocaleString("en-US", { timeZone: "Europe/Kyiv", hour: "2-digit", hour12: false }));
  const wPCard = (p: ParserState, i: number) => {
    const meta = PARSER_META[p.name] || { ini: initials(p.name), color: "#5f6878", site: p.name, game: "", feed: "cs2" as const };
    const ps = pState(p), hrs = hoursOf(p.name), name = PARSER_NAMES[p.name] || p.name;
    const tag = ps === "ok" ? ["Працює", "is-green"] : ps === "paused" ? ["Зупинено", "is-grey"] : ps === "down" ? ["Помилка", "is-red"] : ps === "flaky" ? ["Збої", "is-amber"] : ps === "idle" ? ["Без даних", "is-amber"] : ["Без оновлень", "is-amber"];
    const line = p.paused ? `Зупинено вручну${p.pausedBy ? ` · @${p.pausedBy}` : ""}${p.pausedAt ? `, ${new Date(p.pausedAt).toLocaleString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv" })}` : ""}${p.pausedUntil ? ` · до ${new Date(p.pausedUntil).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv" })}` : ""}`
      : ps === "down" ? `Не відповідає${p.lastFailure ? ` ${ago(p.lastFailure).replace(" тому", "")}` : ""}${p.lastSuccess ? ` · у застосунку дані від ${isoToKyiv(p.lastSuccess).slice(11, 16)}` : ""}`
      : p.name === "liquipedia" ? "Тікер раз на 31 с · сторінки турнірів до 2 на гру за 20 хв" : p.pandascore ? "Списки раз на 10 хв · автопсевдоніми команд" : p.cito ? "Запити рівно розподілені на місяць" : isOddsP(p) ? "Коефіцієнти до матчів" : `Джерело · ${meta.site}`;
    const bar = p.pandascore ? { l: "Запитів за годину · запобіжник на 900", v: p.pandascore.callsThisHour, max: 1000, c: "#3a6df0" } : p.cito ? { l: "Запити цього місяця", v: p.cito.used, max: p.cito.budget, c: "#7c3aed" } : p.odds ? { l: "Запити цього місяця", v: p.odds.used, max: p.odds.budget, c: "#e8590c" } : null;
    const t3 = p.name === "liquipedia" && p.pages ? { l: "Збіг сторінок", v: p.pages.checked ? `${Math.round(((p.pages.agreed || 0) / p.pages.checked) * 100)}%` : "—" } : p.pandascore ? { l: "Псевдонімів", v: `+${p.pandascore.aliases ?? 0}` } : p.cito ? { l: "Закрив сам", v: String(p.cito.added) } : p.paused ? { l: "Зупинено", v: p.pausedAt ? ago(p.pausedAt).replace(" тому", "") : "—" } : { l: "Останній збій", v: p.lastFailure ? ago(p.lastFailure).replace(" тому", "") : "—" };
    return (
      <div key={p.name} className="v3-adw-card v3-mxw-pc" style={{ animationDelay: `${i * 40}ms` }}>
        <div className="v3-mxw-pch"><span><b>{name}</b><small>{meta.game || meta.site}</small></span><span className={`v3-uwt ${tag[1]}`}>{tag[0]}</span></div>
        <p className="v3-mxw-pline">{line}</p>
        {p.name === "liquipedia" && p.pages && <div className="v3-mxw-pmode"><b>Сторінки турнірів</b><div className="v3-adw-seg is-sm" role="group" aria-label="Сторінки турнірів"><PillTrack active={p.pages.mode || "auto"} />{([["auto", "Авто"], ["on", "Увімк."], ["off", "Вимк."]] as const).map(([k, l]) => <button key={k} type="button" disabled={pagesBusy || !online} className={(p.pages!.mode || "auto") === k ? "is-on" : ""} aria-pressed={(p.pages!.mode || "auto") === k} onClick={() => changePagesMode(k)}>{l}</button>)}</div></div>}
        {bar && <div className="v3-mxw-pbar"><span><small>{bar.l}</small><b>{bar.v} з {bar.max}</b></span><i><em style={{ width: `${Math.min(100, (bar.v / Math.max(1, bar.max)) * 100)}%`, background: bar.c }} /></i></div>}
        <div className="v3-mxw-hrs" role="img" aria-label={`Останні 24 години: ${hrs.filter((h) => h.s === "bad").length} годин зі збоями`}>{hrs.map((h, k) => <i key={k} className={`is-${p.paused && k > 20 ? "none" : h.s}`} title={`${h.hh}:00 · ${hourText(h)}`} />)}</div>
        <div className="v3-mxw-axis"><span>24 год тому</span><span>зараз</span></div>
        <div className="v3-mxw-tiles"><div><span>Матчів</span><b>{matches ? (cntFor(p.name, all) || "—") : "…"}</b></div><div><span>Збоїв · 24 год</span><b className={p.failures24h ? "is-bad" : ""}>{p.failures24h}</b></div><div><span>{t3.l}</span><b>{t3.v}</b></div></div>
        <div className="v3-mxw-pf">
          {p.paused ? <button type="button" className="v3-uwb is-green" disabled={!online || stopping === p.name} onClick={() => stopOrStart(p.name, false)}><Play size={13} aria-hidden="true" />Запустити</button>
            : ps === "down" ? <button type="button" className="v3-uwb is-blue" disabled={!online || running[p.name] === "busy"} onClick={() => rerun(p.name)}>{running[p.name] === "busy" ? "Перезапускаємо…" : "Перезапустити"}</button>
            : <button type="button" className="v3-uwb is-dark" disabled={!online || stopping === p.name} onClick={() => setStopAsk(p.name)}><i className="v3-mxw-stopic" aria-hidden="true" />Стоп</button>}
          <button type="button" className="v3-adw-kebb" aria-label={`Лог · ${name}`} onClick={() => setLogFor(p.name)}><Info size={15} /></button>
        </div>
      </div>
    );
  };
  const wParsers = (
    <>
      <div className="v3-mxw-night"><span aria-hidden="true">☾</span><span>Нічний режим 02:00–06:00 за Києвом — джерела опитуємо рідше. Повне оновлення щодня, швидке — кожні 15 хв, коли є ставки без результату.</span><span className="v3-uwt is-blue">{kyivH >= 2 && kyivH < 6 ? "Зараз ніч" : "Зараз день"}</span></div>
      {parsers === null ? <div className="v3-mxw-pgrid v3-adw-skel">{[0, 1, 2].map((i) => <div key={i} className="v3-adw-card"><i style={{ height: 160 }} /></div>)}</div>
        : !parsers.length ? <div className="v3-adw-card v3-adw-empty"><span aria-hidden="true"><Activity size={20} /></span><strong>Парсерів немає</strong><p>Бекенд не повідомив про жодне джерело матчів.</p></div>
        : <div className="v3-mxw-pgrid">
          {parsers.map(wPCard)}
          {issues.length > 0 && <div className={`v3-adw-card v3-mxw-pc v3-mxw-conf${wConf.length ? " is-warn" : ""}`}>
            <div className="v3-mxw-pch"><span><b>Розбіжності рахунку</b></span><span className={`v3-uwt ${wConf.length ? "is-amber" : "is-green"}`}>{wConf.length ? `${wConf.length} чекає` : "усе гаразд"}</span></div>
            <p className="v3-mxw-pline">Джерела дали різний результат — ставки не закриються, поки ви не оберете правильний.</p>
            {wConf[0] && <div className="v3-mxw-cbox"><b>{wConf[0].tournament || GAME_LABEL[wConf[0].game]}</b><strong>{wConf[0].team1} — {wConf[0].team2}</strong><span><small>Liquipedia</small><b>{wConf[0].ours}</b></span>{wConf[0].theirs.map((t) => <span key={t.source}><small>{t.source === "pandascore" ? "PandaScore" : "Cito"}</small><b>{t.score}</b></span>)}</div>}
            <div className="v3-mxw-pf"><button type="button" className="v3-uwb is-green" onClick={() => { setWIssue(wConf[0] ? `${wConf[0].kind}-${wConf[0].id}` : null); setIssuesOpen(true); }}>Обрати рахунок</button></div>
          </div>}
        </div>}
    </>
  );
  // ── manual ──
  const wManual = bets === null ? <div className="v3-adw-card v3-adw-skel">{[0, 1].map((i) => <i key={i} style={{ height: 90, marginBottom: 8 }} />)}</div> : !groups.length ? (
    <div className="v3-adw-card v3-adw-empty"><span aria-hidden="true"><Check size={20} /></span><strong>Усі матчі на своїх місцях</strong><p>За останні 14 днів немає записів на матчі, яких не було б у стрічках. Коли користувач введе матч сам, він з’явиться тут разом зі схожим офіційним.</p></div>
  ) : (
    <section className="v3-sw-two">
      <div className="v3-adw-card v3-mxw-man">
        <h2>Матчі, яких немає в стрічках <small>за 14 днів</small></h2>
        {groups.map((x, i) => (
          <div key={x.key} className="v3-mxw-grp" style={{ animationDelay: `${i * 40}ms` }}>
            <div className="v3-mxw-grph">{wGame(x.game)}<small>{x.day === today ? "сьогодні" : dayShort(x.day)} · {x.bets.length} {plural(x.bets.length, "запис", "записи", "записів")}</small><span className={`v3-uwt ${x.official ? "is-amber" : "is-grey"}`}>{x.official ? "Чекає" : "Без пари"}</span></div>
            <div className="v3-mxw-cmp">
              <div><small>Як ввів користувач · @{x.bets[0]?.username}</small><b>{x.t1} vs {x.t2}</b></div>
              <span aria-hidden="true">→</span>
              <div className={x.official ? "is-off" : "is-none"}>{x.official ? <><small>Схожий офіційний · {x.official.source}</small><b>{x.official.t1} — {x.official.t2}{x.official.tournament ? ` · ${x.official.tournament}` : ""} · {x.official.time}</b></> : <><small>Схожого матчу не знайшлося</small><b>Оберіть матч вручну</b></>}</div>
            </div>
            <div className="v3-mxw-grpf">
              <button type="button" className="v3-uwb" disabled={!online} onClick={() => setPickFor(x)}>Інший матч</button>
              {x.official && <button type="button" className="v3-uwb is-green" disabled={!online || saving === `merge:${x.key}`} onClick={() => setMergeAsk({ x, target: x.official! })}>Об’єднати</button>}
            </div>
          </div>
        ))}
      </div>
      <aside className="v3-adw-card v3-sw-card">
        <div className="v3-sw-ch"><div><h2>Як це працює</h2></div></div>
        <p className="v3-mxw-ptext">Коли користувач вводить матч сам, ми шукаємо схожий у стрічках. Після об’єднання його ставки рахуються за результатом офіційного матчу.</p>
        <div className="v3-adw-tiles is-two"><div><span>Чекають</span><b>{groups.length}</b></div><div><span>Об’єднано · 14 дн.</span><b>{decided.size}</b></div></div>
        <small className="v3-adw-note">Кожне об’єднання записується в журнал дій.</small>
      </aside>
    </section>
  );
  // ── teams ──
  const wT = tList.find((t) => t.key === selTeam) || tList[0] || null;
  const wTeamDet = (t: Team) => {
    const own = aliases.filter((a) => a.game === t.game && baseNorm(a.canonical) === baseNorm(t.name)), last = teamLast(t);
    return (
      <aside key={t.key} className="v3-adw-card v3-mxw-det">
        <div className="v3-mxw-dh is-team"><Logo src={t.logo} name={t.name} size={40} /><span className="v3-mxw-dt"><b>{t.name}</b><small>{GAME_LABEL[t.game]}{t.rank ? ` · #${t.rank} у рейтингу` : ""}{t.last ? ` · останній матч ${t.last === today ? "сьогодні" : dayShort(t.last)}` : ""}</small></span></div>
        <b className="v3-mxw-lbl">Псевдоніми — так команду називають джерела</b>
        <div className="v3-sw-words is-grey">
          {[t.name, ...t.aliases].map((n) => { const a = own.find((x) => baseNorm(x.alias) === baseNorm(n)); return <span key={n}>{n}{a && <button type="button" aria-label={`Прибрати «${n}»`} disabled={!online} onClick={() => removeAlias(a)}><X size={11} /></button>}</span>; })}
          <button type="button" className="is-add" disabled={!online} onClick={() => setMergeFor(t)}><Plus size={12} aria-hidden="true" />Додати</button>
        </div>
        {t.variants[0] && <div className="v3-mxw-newsp"><p>Нове написання з джерел — «{t.variants[0]}». Підтвердіть, якщо це та сама команда.</p><div><button type="button" className="v3-uwb is-white" disabled={!online || !!saving} onClick={() => notSame(t, t.variants[0])}>Різні команди</button><button type="button" className="v3-uwb is-green" disabled={!online || !!saving} onClick={() => addAliases(t, [t.variants[0]])}>Це одна команда</button></div></div>}
        <div className="v3-mxw-last"><small>Останні матчі</small>{last.length ? last.slice(0, 4).map((x) => <div key={x.id}><span>{x.day === today ? "сьогодні" : dayShort(x.day)} · {x.opp}</span><b className={x.r === "W" ? "is-win" : x.r === "L" ? "is-loss" : ""}>{x.score}</b></div>) : <span className="v3-mxw-none">ще немає завершених матчів</span>}</div>
        <div className="v3-mxw-df"><button type="button" className="v3-uwb" disabled={!online} onClick={() => { setLogoFor(t); logoInput.current?.click(); }}>Змінити логотип</button><button type="button" className="v3-uwb is-softred" disabled={!online} onClick={() => setDelTeam(t)}>Приховати команду</button></div>
      </aside>
    );
  };
  const wTeamsChips: [string, string, number, () => void, boolean][] = [
    ["all", "Усі", teams.length, () => { setTg("all"); setTf("all"); }, tg === "all" && tf === "all"],
    ["cs2", "CS2", teams.filter((t) => t.game === "cs2").length, () => { setTg("cs2"); setTf("all"); }, tg === "cs2" && tf === "all"],
    ["dota2", "Dota 2", teams.filter((t) => t.game === "dota2").length, () => { setTg("dota2"); setTf("all"); }, tg === "dota2" && tf === "all"],
    ["logo", "Без лого", teamsG.filter((t) => isFallbackLogo(t.logo)).length, () => setTf("logo"), tf === "logo"],
    ["dup", "Дублікати", teamsG.filter((t) => t.variants.length).length, () => setTf("dup"), tf === "dup"],
  ];
  const wDups = tList.flatMap((t) => t.variants.map((v) => ({ t, v })));
  const wTeams = (
    <>
      <div className="v3-mxw-filt">
        <div className="v3-spw-fchips" role="group" aria-label="Фільтр команд">{wTeamsChips.map(([k, l, n, go, on]) => <button key={k} type="button" className={on ? "is-on" : ""} aria-pressed={on} onClick={go}>{l}<b>{n.toLocaleString("uk-UA")}</b></button>)}</div>
        <small className="v3-mxw-tcount">{teams.length.toLocaleString("uk-UA")} у довіднику</small>
        <div className="v3-mxw-view" role="group" aria-label="Вигляд"><button type="button" className={tView === "list" ? "is-on" : ""} aria-pressed={tView === "list"} aria-label="Списком" onClick={() => tView !== "list" && flipView()}><List size={15} /></button><button type="button" className={tView === "grid" ? "is-on" : ""} aria-pressed={tView === "grid"} aria-label="Картками" onClick={() => tView !== "grid" && flipView()}><LayoutGrid size={15} /></button></div>
      </div>
      {tf === "dup" ? (
        <section className="v3-sw-two">
          <div className="v3-adw-card v3-mxw-man">
            <h2>Можливі дублікати <small>{wDups.length} {plural(wDups.length, "написання чекає", "написання чекають", "написань чекають")} рішення</small></h2>
            {!wDups.length ? <p className="v3-mxw-none">Нових написань немає</p> : wDups.slice(0, 40).map(({ t, v }, i) => (
              <div key={`${t.key}|${v}`} className="v3-mxw-grp" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                <div className="v3-mxw-grph">{wGame(t.game)}<small>{spellingFrom(t, v)}</small></div>
                <div className="v3-mxw-cmp"><div><b>{t.name}</b><small>у довіднику</small></div><span aria-hidden="true">=</span><div className="is-new"><b>{v}</b><small>нове написання</small></div></div>
                <div className="v3-mxw-grpf"><button type="button" className="v3-uwb" disabled={!online || !!saving} onClick={() => notSame(t, v)}>Різні команди</button><button type="button" className="v3-uwb is-green" disabled={!online || !!saving} onClick={() => addAliases(t, [v])}>Це одна команда</button></div>
              </div>
            ))}
          </div>
          <aside className="v3-adw-card v3-sw-card"><div className="v3-sw-ch"><div><h2>Чому це важливо</h2></div></div><p className="v3-mxw-ptext">Різні джерела пишуть назви по-різному. «Це одна команда» додає псевдонім — матчі з усіх джерел зіллються в один. «Різні команди» більше не питатиме про цю пару.</p><p className="v3-mxw-ptext">PandaScore додає псевдоніми сам, якщо назву вже бачили в інших джерелах — вони позначені «авто».</p></aside>
        </section>
      ) : (
        <section className="v3-mxw-split">
          {matches === null ? <div className="v3-adw-card v3-adw-skel v3-mxw-list">{[0, 1, 2, 3].map((i) => <i key={i} style={{ height: 40 }} />)}</div>
            : !tList.length ? <div className="v3-adw-card v3-adw-empty"><span aria-hidden="true"><Search size={20} /></span><strong>Команд не знайдено</strong><p>{tq.trim() ? `За «${tq.trim()}» немає ні назви, ні псевдоніма.` : "У цьому фільтрі порожньо."}</p></div>
            : tView === "grid" ? <div className="v3-adw-card v3-mxw-list"><div className="v3-mxw-tgrid">{tList.slice(0, tLimit).map((t, i) => <button key={t.key} type="button" className={`v3-mxw-tcard${wT?.key === t.key ? " is-sel" : ""}`} style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }} onClick={() => setSelTeam(t.key)}><Logo src={t.logo} name={t.name} size={40} /><b>{t.name}</b><small>{GAME_LABEL[t.game]}{t.rank ? ` · #${t.rank}` : ""} · {t.aliases.length + 1} {plural(t.aliases.length + 1, "псевдонім", "псевдоніми", "псевдонімів")}</small>{t.variants.length > 0 ? <span className="v3-uwt is-amber">{t.variants.length} {plural(t.variants.length, "написання", "написання", "написань")}</span> : isFallbackLogo(t.logo) ? <span className="v3-uwt is-grey">без лого</span> : null}</button>)}</div></div>
            : <div className="v3-adw-card v3-mxw-list"><div className="v3-adw-tr v3-mxw-tcols is-th"><span>Команда</span><span>Гра · рейтинг</span><span>Псевдоніми</span><span /></div>
              {tList.slice(0, tLimit).map((t, i) => <button key={t.key} type="button" className={`v3-adw-tr v3-mxw-tcols${wT?.key === t.key ? " is-sel" : ""}`} style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }} onClick={() => setSelTeam(t.key)}><span className="v3-adw-who"><Logo src={t.logo} name={t.name} size={26} /><strong>{t.name}</strong></span><span>{GAME_LABEL[t.game]}{t.rank ? ` · #${t.rank}` : ""}</span><span>{t.aliases.length + 1} {plural(t.aliases.length + 1, "псевдонім", "псевдоніми", "псевдонімів")}</span><span className="is-r">{t.variants.length > 0 ? <span className="v3-uwt is-amber">{t.variants.length} {plural(t.variants.length, "написання", "написання", "написань")}</span> : isFallbackLogo(t.logo) ? <span className="v3-uwt is-grey">без лого</span> : null}</span></button>)}
              {tList.length > tLimit && <button type="button" className="v3-uw-more" onClick={() => setTLimit((n) => n + 80)}>Показати ще {Math.min(80, tList.length - tLimit)}</button>}
            </div>}
          {wT ? wTeamDet(wT) : <aside className="v3-adw-card v3-adw-empty"><p>Виберіть команду</p></aside>}
        </section>
      )}
    </>
  );
  const wIss = issues.find((x) => `${x.kind}-${x.id}` === wIssueKey) || wConf[0] || issues[0] || null;
  const webPage = (
    <div className="v3-page v3-uw v3-mxw">
      <section className="v3-uw-hero">
        <div><h1>Матчі</h1><p>{wPaused ? `парсери зупинені · дані на ${updatedAt || "—"}` : error && matches === null ? "дані не оновились" : `Сьогодні ${todayM.length} · наживо ${liveN}${updatedAt ? ` · оновлено ${updatedAt}` : ""}`}</p></div>
        <div className="v3-uw-hacts"><button type="button" className="v3-uwb is-green" disabled={!online} onClick={() => setAddOpen(true)}><Plus size={15} aria-hidden="true" />Додати матч</button></div>
      </section>
      {!online && <div className="v3-uw-off" role="status"><WifiOff size={15} aria-hidden="true" /><span>Немає інтернету. Матчі станом на {updatedAt || "останнє оновлення"}.</span></div>}
      <section className="v3-pw-kpis" aria-label="Підсумки">{wKpis.map((x, i) => <div key={x.k} className={`v3-pw-kpi${i === 0 ? " is-on" : ""}`} style={{ animationDelay: `${i * 40}ms` }}><span>{x.l}</span><strong className={`${"bad" in x && x.bad ? "is-bad" : ""}${"warn" in x && x.warn ? " is-warn" : ""}`}>{x.v === "…" ? "…" : <RollingNumber key={`${x.k}-${x.v}`} text={x.v} />}</strong><small>{x.n}</small></div>)}</section>
      <div className="v3-uw-tools v3-mxw-tools">
        <div className="v3-uw-tabs" role="tablist" aria-label="Розділи матчів"><PillTrack active={tab} />{wTabs.map((t) => <button key={t.k} type="button" role="tab" aria-selected={tab === t.k} className={tab === t.k ? "is-on" : ""} onClick={() => setTab(t.k)}>{t.l}<span className="v3-pw-tn">{t.n}</span></button>)}</div>
        {(tab === "matches" || tab === "teams") && <label className="v3-uw-search v3-spw-search"><Search size={15} aria-hidden="true" /><input type="search" aria-label="Пошук" placeholder={tab === "teams" ? "Назва або псевдонім" : "Команда або турнір"} value={tab === "teams" ? tq : q} onChange={(e) => (tab === "teams" ? setTq(e.target.value) : setQ(e.target.value))} />{(tab === "teams" ? tq : q) && <button type="button" aria-label="Очистити" onClick={() => (tab === "teams" ? setTq("") : setQ(""))}><X size={13} /></button>}</label>}
      </div>
      <div key={tab}>{tab === "matches" ? wMatches : tab === "parsers" ? wParsers : tab === "manual" ? wManual : wTeams}</div>

      <AddMatchDialog open={addOpen} onOpenChange={setAddOpen} onDone={async (m) => { await load(); setTab("matches"); setDay(m.startDate && kyivDay(new Date(m.startDate)) === today ? "today" : "week"); setSelId(`${m.game}:${m.id}`); }} />
      {(() => { const m = all.find((x) => x.id === wEdit); if (!m) return null; const f = formOf(m), ov = ovOf(m); return (
        <WModal open onClose={() => { setWEdit(null); setEdit(null); }} width={560} title="Редагувати матч" sub={`${m.t1} — ${m.t2}${m.tournament ? ` · ${m.tournament}` : ""}${m.bo ? ` · ${m.bo}` : ""}`}>
          <div className="v3-adw-warn"><AlertTriangle size={14} aria-hidden="true" />Правка діє, поки джерело не дасть свій рахунок.</div>
          <span className="v3-adw-cap">Час і статус</span>
          <div className="v3-adwm-row">
            <div className="v3-uwm-f"><label id={`we-d-${m.id}`}>Дата</label><DateField id={`we-date-${m.id}`} labelledBy={`we-d-${m.id}`} value={f.date} onChange={(v) => setForm(m, { date: v })} /></div>
            <div className="v3-uwm-f"><label htmlFor={`we-t-${m.id}`}>Час (Київ)</label><input id={`we-t-${m.id}`} inputMode="numeric" placeholder="19:00" maxLength={5} value={f.time} onChange={(e) => setForm(m, { time: hhmmInput(e.target.value) })} />{ov?.startDate && <small>Було {m.time} у {m.source}</small>}</div>
          </div>
          <div className="v3-uwm-f"><label>Статус</label><div className="v3-mxw-stbtns">{EDIT_ST.map((x) => <button key={x.key} type="button" className={f.st === x.key ? "is-on" : ""} aria-pressed={f.st === x.key} onClick={() => setForm(m, { st: x.key })}>{x.label}</button>)}</div></div>
          <span className="v3-adw-cap">Рахунок</span>
          <div className="v3-mxw-scrow"><div className="v3-uwm-f"><label htmlFor={`we-s1-${m.id}`}>{m.t1}</label><input id={`we-s1-${m.id}`} inputMode="numeric" placeholder="—" value={f.s1} onChange={(e) => setForm(m, { s1: e.target.value.replace(/\D/g, "").slice(0, 2) })} /></div><span>:</span><div className="v3-uwm-f"><label htmlFor={`we-s2-${m.id}`}>{m.t2}</label><input id={`we-s2-${m.id}`} inputMode="numeric" placeholder="—" value={f.s2} onChange={(e) => setForm(m, { s2: e.target.value.replace(/\D/g, "").slice(0, 2) })} /></div></div>
          <div className="v3-uwm-foot"><span>Запишеться в журнал дій</span><div>{ov && <button type="button" className="v3-uwb" disabled={saving === m.id} onClick={async () => { await resetEdit(m); setWEdit(null); }}>Скинути правку</button>}<button type="button" className="v3-uwb is-green" disabled={!online || saving === m.id} onClick={async () => { await saveEdit(m); setWEdit(null); }}>{saving === m.id ? "Зберігаємо…" : "Зберегти"}</button></div></div>
        </WModal>
      ); })()}
      {wIss && <WModal open={issuesOpen} onClose={() => setIssuesOpen(false)} width={520} title="Розбіжність рахунку" sub={`${wIss.team1} — ${wIss.team2}${wIss.tournament ? ` · ${wIss.tournament}` : ""}`}>
        <div className="v3-mxw-ivs"><b>{wIss.team1}</b><small>{new Date(wIss.start).toLocaleString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv" })}</small><b>{wIss.team2}</b></div>
        <div className="v3-mxw-iopts" role="radiogroup" aria-label="Правильний рахунок">
          {[{ k: "ours", score: wIss.ours, src: "Liquipedia" }, ...wIss.theirs.map((t) => ({ k: t.source, score: t.score, src: t.source === "pandascore" ? "PandaScore" : "Cito" }))].map((o) => <button key={o.k} type="button" role="radio" aria-checked={wPick === o.k} className={wPick === o.k ? "is-on" : ""} onClick={() => setWPick(o.k)}><i aria-hidden="true" /><span><b>{o.score}</b><small>{o.src}</small></span></button>)}
        </div>
        <p className="v3-adw-note">Після вибору ставки закриються за цим рахунком.</p>
        <div className="v3-uwm-foot"><span>Рішення потрапить у журнал дій</span><div><button type="button" className="v3-uwb" onClick={() => setIssuesOpen(false)}>Пізніше</button><button type="button" className="v3-uwb is-green" disabled={!online || issueBusy !== null} onClick={async () => { const t = wIss.theirs.find((x) => x.source === wPick); await settleIssue(wIss, wPick === "ours" ? null : t?.score ?? null); setIssuesOpen(false); }}>Підтвердити {wPick === "ours" ? wIss.ours : wIss.theirs.find((x) => x.source === wPick)?.score || ""}</button></div></div>
      </WModal>}
      <Dialog open={!!logFor} onOpenChange={(o) => !o && setLogFor(null)}>
        <DialogContent className="v3-aupanel v3-mxw-log" onOpenAutoFocus={(e) => e.preventDefault()}>
          <div className="v3-adwm-h"><div><DialogTitle className="v3-modal-title">Повний лог · {logFor ? PARSER_NAMES[logFor] || logFor : ""}</DialogTitle><DialogDescription className="v3-modal-sub">Останні {logFor ? (events[logFor] || []).length : 0} подій. Однакові події частіше ніж раз на хвилину зливаються в одну.</DialogDescription></div><button type="button" className="v3-adwm-x" aria-label="Закрити" onClick={() => setLogFor(null)}><X size={16} /></button></div>
          {(() => { const ev = logFor ? events[logFor] || [] : []; return <div className="v3-spw-fchips" role="group" aria-label="Фільтр подій">{([["all", "Усі", ev.length], ["fail", "Помилки", ev.filter((e) => e.event === "failure").length], ["admin", "Дії адмінів", ev.filter((e) => e.event === "rerun").length]] as const).map(([k, l, n]) => <button key={k} type="button" className={wLogF === k ? "is-on" : ""} aria-pressed={wLogF === k} onClick={() => setWLogF(k)}>{l}<b>{n}</b></button>)}</div>; })()}
          <div className="v3-mxw-logs">{logFor && (events[logFor] || []).filter((e) => wLogF === "all" || (wLogF === "fail" ? e.event === "failure" : e.event === "rerun")).map((e) => <div key={e.id}><small>{new Date(e.createdAt).toLocaleString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv" })}</small><span><span className={`v3-uwt ${e.event === "failure" ? "is-red" : e.event === "success" ? "is-green" : "is-blue"}`}>{EV_LABEL[e.event]}</span><b>{e.message && e.message !== "OK" ? e.message : "—"}</b></span></div>)}{logFor && !(events[logFor] || []).length && <p className="v3-mxw-none">Подій ще немає</p>}</div>
          <div className="v3-uwm-foot"><span>Час — київський</span><div><button type="button" className="v3-uwb" onClick={() => logFor && shareLog(logFor)}>Копіювати</button>{logFor && <button type="button" className="v3-uwb is-blue" disabled={!online || running[logFor] === "busy"} onClick={() => rerun(logFor)}>Перезапустити</button>}</div></div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!stopAsk} onOpenChange={(o) => { if (!o) { setStopAsk(null); setStopFor("1h"); } }}>
        <DialogContent className="v3-modal v3-uwm v3-uwm-del v3-adw-del" style={{ maxWidth: 420 }} onOpenAutoFocus={(e) => e.preventDefault()}>
          <span className="v3-uwm-ico is-red" aria-hidden="true"><Square size={14} /></span>
          <DialogTitle className="v3-modal-title">Зупинити {stopAsk ? PARSER_NAMES[stopAsk] || stopAsk : ""}?</DialogTitle>
          <DialogDescription className="v3-modal-sub">{stopFor === "forever" ? "Запитів до джерела не буде, поки не запустите знову." : stopFor === "morning" ? "Запустимо самі о 08:00 за Києвом." : "Запустимо самі через годину."} У застосунку лишаться останні дані з позначкою часу.</DialogDescription>
          <div className="v3-adw-seg v3-mxw-stopseg" role="radiogroup" aria-label="На скільки зупинити"><PillTrack active={stopFor} />{([["1h", "На 1 годину"], ["morning", "До 08:00"], ["forever", "Доки не запущу"]] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={stopFor === k} className={stopFor === k ? "is-on" : ""} onClick={() => setStopFor(k)}>{l}</button>)}</div>
          {stopAsk === "liquipedia" && <div className="v3-adw-warn"><AlertTriangle size={14} aria-hidden="true" />Liquipedia — головне джерело. Матчі CS2 і Dota 2 оновлюватимуть лише PandaScore і Cito.</div>}
          <button type="button" className="v3-uwb is-red" disabled={!!stopAsk && stopping === stopAsk} onClick={async () => { if (!stopAsk) return; await stopOrStart(stopAsk, true, stopFor === "1h" ? 60 : stopFor === "morning" ? toMorning() : undefined); setStopAsk(null); setStopFor("1h"); }}>{stopping === stopAsk ? "Зупиняємо…" : "Зупинити"}</button>
          <button type="button" className="v3-uwb" onClick={() => { setStopAsk(null); setStopFor("1h"); }}>Скасувати</button>
        </DialogContent>
      </Dialog>
      <DeleteAsk open={!!delAsk} title="Видалити матч?" busy={!!delAsk && saving === delAsk.id} onClose={() => setDelAsk(null)} onDelete={() => delAsk && removeMatch(delAsk)} text={delAsk ? `${delAsk.t1} — ${delAsk.t2} зникне з розкладу в застосунку.${betsFor(delAsk).length ? ` ${betsFor(delAsk).length} ${plural(betsFor(delAsk).length, "ставка лишиться", "ставки лишаться", "ставок лишиться")} у користувачів.` : ""}` : ""} />
      <Dialog open={!!mergeAsk} onOpenChange={(o) => { if (!o) setMergeAsk(null); }}>
        <DialogContent className="v3-modal v3-uwm v3-uwm-del v3-adw-del" style={{ maxWidth: 420 }} onOpenAutoFocus={(e) => e.preventDefault()}>
          <span className="v3-uwm-ico is-blue" aria-hidden="true"><Link2 size={16} /></span>
          <DialogTitle className="v3-modal-title">Об’єднати з офіційним?</DialogTitle>
          <DialogDescription className="v3-modal-sub">{mergeAsk ? `${mergeAsk.x.bets.length} ${plural(mergeAsk.x.bets.length, "запис користувача перейде", "записи користувачів перейдуть", "записів користувачів перейдуть")} на матч зі стрічки. Ставки порахуються за його результатом.` : ""}</DialogDescription>
          {mergeAsk && <div className="v3-mxw-mcmp"><div><small>Як ввів користувач · @{mergeAsk.x.bets[0]?.username}</small><b>{mergeAsk.x.t1} vs {mergeAsk.x.t2}</b></div><span aria-hidden="true">↓</span><div className="is-off"><small>Офіційний · {mergeAsk.target.source}</small><b>{mergeAsk.target.t1} — {mergeAsk.target.t2}{mergeAsk.target.tournament ? ` · ${mergeAsk.target.tournament}` : ""} · {mergeAsk.target.time}</b></div></div>}
          <button type="button" className="v3-uwb is-green" disabled={!!mergeAsk && saving === `merge:${mergeAsk.x.key}`} onClick={async () => { if (mergeAsk) { await decide(mergeAsk.x, "merge", mergeAsk.target); setMergeAsk(null); } }}>{mergeAsk && saving === `merge:${mergeAsk.x.key}` ? "Об’єднуємо…" : "Об’єднати"}</button>
          <button type="button" className="v3-uwb" onClick={() => setMergeAsk(null)}>Скасувати</button>
        </DialogContent>
      </Dialog>
      <PickMatchSheet group={pickFor} known={known} today={today} busy={!!pickFor && saving === `merge:${pickFor.key}`} onClose={() => setPickFor(null)} onPick={(x, m) => decide(x, "merge", m)} />
      <MergeTeamDialog team={mergeFor} teams={teams} busy={!!mergeFor && saving === `team:${mergeFor.key}`} onClose={() => setMergeFor(null)} onPick={(t, names) => addAliases(t, names)} />
      <DeleteAsk open={!!delTeam} title={`Приховати ${delTeam?.name || "команду"}?`} busy={!!delTeam && saving === delTeam.key} onClose={() => setDelTeam(null)} onDelete={() => delTeam && removeTeam(delTeam)} text={<>Команда зникне з довідника «Команди»{delTeam ? ` (${GAME_LABEL[delTeam.game]})` : ""}. Логотип і матчі не зміняться.</>} />
      <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f && logoFor) uploadLogo(logoFor, f); }} />
    </div>
  );
  if (!phone) return webPage;
  return (
    <div className="v3-page v3-pay v3-mx">
      <section className="v3-hero v3-hero-row">
        <div>
          <h1 className="v3-title">Матчі</h1>
          <p className="v3-subtitle"><span className="v3-hide-mobile">Дані з tips.gg і HLTV, записи користувачів і довідник команд. Час — київський.</span><span className="v3-only-mobile">{tab === "parsers" ? (down.length ? `${down.length} ${plural(down.length, "джерело", "джерела", "джерел")} з проблемою` : parsers?.length && parsers.every((p) => p.paused) ? "Усі парсери зупинені вручну" : "Усі джерела працюють") + (kyivNight() ? " · нічний режим до 06:00" : "") : tab === "manual" ? "Чекають об’єднання" : tab === "teams" ? `${teams.length} у довіднику` : `Сьогодні ${todayM.length} · наживо ${liveN}${phone && updatedAt ? ` · оновлено ${updatedAt}` : ""}`}</span></p>
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
            {TABS.map((t) => <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`v3-pay-tab${tab === t.key ? " is-on" : ""}${t.key === "parsers" && down.length ? " is-err" : ""}`} onClick={() => setTab(t.key)}><span className="v3-pay-tab-n">{tabCount(t.key) ?? "…"}</span><span className={phone ? "v3-hide-mobile" : undefined}>{t.label}</span>{phone && <span>{t.key === "manual" ? "Вручну" : t.label}{(t.key === "matches" || t.key === "manual") && tabCount(t.key) != null ? ` · ${tabCount(t.key)}` : t.key === "parsers" && parsers?.length ? ` · ${parsers.length}` : ""}</span>}</button>)}
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

      {phone && <Dialog open={missOpen} onOpenChange={setMissOpen}>
        <DialogContent className="v3-sheet v3-pay-sheet v3-mxp-miss">
          <DialogTitle>Коефіцієнти без матчу</DialogTitle>
          <DialogDescription>OddsPapi має ціни на ці матчі, але назви команд не збіглися з нашими. «Зв’язати» запам’ятає назву — коефіцієнти з’являться протягом 2 хвилин і надалі підтягуватимуться самі.</DialogDescription>
          <div className="v3-mxp-mlist">{(parsers?.find((x) => x.name === "oddspapi")?.odds?.unmatched || []).map((x) => { const k = missKey(x), st = linked[k]; return (
            <div key={k} className="v3-mxp-mi">
              <div className="v3-mxp-mt"><span>{x.game === "cs2" ? "CS2" : "Dota 2"} · {new Date(x.odds.start).toLocaleString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv" })}</span><span>{x.odds.tournament}</span></div>
              <div className="v3-mxp-mrow"><small>OddsPapi</small><strong>{x.odds.team1} — {x.odds.team2}</strong><b>{x.odds.coeff1.toFixed(2)} · {x.odds.coeff2.toFixed(2)}</b></div>
              {x.ours ? <div className="v3-mxp-mrow"><small>Наш матч</small><strong>{x.ours.team1} — {x.ours.team2}</strong></div> : <p className="v3-mxp-mnone">Нашого матчу в цей час немає — Liquipedia його не показує.</p>}
              {x.ours && <button type="button" className={`v3-mxp-mlink${st === "done" ? " is-done" : ""}`} disabled={!online || !!st} onClick={() => linkMiss(x)}>{st === "done" ? <><Check size={15} aria-hidden="true" />Зв’язано</> : st === "busy" ? "Зв’язуємо…" : <><Link2 size={15} aria-hidden="true" />Зв’язати</>}</button>}
            </div>
          ); })}</div>
        </DialogContent>
      </Dialog>}

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
        text={stopFor === "forever" ? "Запитів до джерела не буде, поки не запустите знову. У застосунку лишаться останні дані з позначкою часу." : "Запитів до джерела не буде, а потім парсер запуститься сам. У застосунку поки лишаться останні дані."}
        confirm="Зупинити" confirmIcon={<span className="v3-csheet-stop" aria-hidden="true" />} busy={!!stopAsk && stopping === stopAsk} busyText="Зупиняємо…"
        onOpenChange={(o) => { if (!o) { setStopAsk(null); setStopFor("1h"); } }} onConfirm={async () => { if (!stopAsk) return; await stopOrStart(stopAsk, true, stopFor === "1h" ? 60 : stopFor === "morning" ? toMorning() : undefined); setStopAsk(null); setStopFor("1h"); }}>
        <div className="v3-csheet-seg" role="radiogroup" aria-label="На скільки зупинити">{([["1h", "На 1 годину"], ["morning", "До 08:00"], ["forever", "Доки не запущу"]] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={stopFor === k} className={stopFor === k ? "is-on" : ""} onClick={() => setStopFor(k)}>{l}</button>)}</div>
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
            <div className="v3-field"><label htmlFor="am-time">Час (Київ)</label><TimeInput id="am-time" required value={f.time} onChange={(v) => setF({ ...f, time: v })} /></div>
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

/** Time field. Phone: the value is our own text, laid out like the «Дата» button next to it, with the native
 *  time input invisible on top — a tap still opens the iOS wheel, but iOS no longer draws the value high and thin. */
function TimeInput({ id, value, required, onChange }: { id: string; value: string; required?: boolean; onChange: (v: string) => void }) {
  const common = { id, required, pattern: "([01][0-9]|2[0-3]):[0-5][0-9]", title: "Година й хвилини, напр. 19:30", placeholder: "19:00", maxLength: 5, value, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(hhmmInput(e.target.value)) };
  if (!isPhoneWidth()) return <input {...common} {...timeAttrs()} />;
  return (
    <span className="v3-date-btn v3-time-btn">
      <span aria-hidden="true" className={value ? "" : "is-ph"}>{value || "19:00"}</span>
      <input {...common} type="time" />
    </span>
  );
}

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

const FIELD_LABEL: Record<string, string> = { start: "Початок", status: "Статус", score: "Рахунок", odds: "Коефіцієнти", override: "Правка" };
const STATUS_UA: Record<string, string> = { upcoming: "заплановано", live: "наживо", finished: "завершено", postponed: "перенесено", cancelled: "скасовано" };
/** «Історія змін»: що змінилось у матчі, коли і хто — парсер чи адмін. Завантажується, коли розгорнути. */
function MatchHistory({ game, id }: { game: string; id: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<MatchChange[] | null>(null);
  useEffect(() => {
    if (!open || rows) return;
    let live = true;
    fetchMatchChanges(game, id).then((r) => { if (live) setRows(r); }).catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [open, rows, game, id]);
  const val = (f: string, v: string | null) => v == null ? "—" : f === "start" ? new Date(v).toLocaleString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv" }) : f === "status" ? STATUS_UA[v] || v : v;
  const src = (s: string) => s === "liquipedia" ? "Liquipedia" : s === "oddspapi" ? "OddsPapi" : s === "cito" ? "Cito" : s === "pandascore" ? "PandaScore" : s === "liquipedia/opendota" ? "Liquipedia / OpenDota" : s;
  return (
    <div className="v3-mxp-hist">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}><History size={15} aria-hidden="true" />Історія змін{rows ? ` · ${rows.length}` : ""}<ChevronDown size={15} aria-hidden="true" className={open ? "is-up" : ""} /></button>
      {open && (rows === null ? <p className="v3-mxp-hnone">Завантажуємо…</p> : rows.length === 0 ? <p className="v3-mxp-hnone">Змін ще не було — матч такий, яким прийшов від джерела.</p> : (
        <ol>{rows.map((r, k) => <li key={k}><span>{FIELD_LABEL[r.field] || r.field}: {r.oldValue != null && <s>{val(r.field, r.oldValue)}</s>} {val(r.field, r.newValue)}</span><small>{src(r.source)} · {new Date(r.at).toLocaleString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv" })}</small></li>)}</ol>
      ))}
    </div>
  );
}
