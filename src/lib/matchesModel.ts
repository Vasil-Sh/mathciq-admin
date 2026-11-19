// ── Матчі: нормалізація стрічок tips.gg / HLTV, команди, ставки «вручну» ──
import type { AdminUserBet } from "@/types";

export type Game = "cs2" | "dota2";
export type MStatus = "plan" | "live" | "done";

/** Як приходить із GET /cs2-matches, /dota2-matches (TipsGgMatch). */
export interface FeedMatch {
  id: string;
  date: string;
  link?: string;
  type?: string;
  score1: number | null;
  score2: number | null;
  nameTeam1: string;
  nameTeam2: string;
  logoTeam1: string | null;
  logoTeam2: string | null;
  tournament?: string;
  stage?: string;
  status: "upcoming" | "live" | "finished";
  startDate?: string;
}

/** Як приходить із GET /matches-history. */
export interface HistoryMatch {
  id: string;
  game: string;
  team1: string;
  team2: string;
  date: string;
  score1: number | null;
  score2: number | null;
  status: string;
  tournament?: string;
  matchType?: string;
  logoTeam1?: string | null;
  logoTeam2?: string | null;
}

export interface Match {
  id: string;
  game: Game;
  day: string; // YYYY-MM-DD за Києвом
  time: string; // HH:MM за Києвом
  ts: number;
  t1: string;
  t2: string;
  logo1: string | null;
  logo2: string | null;
  s1: number | null;
  s2: number | null;
  tournament: string;
  bo: string;
  status: MStatus;
  source: "HLTV" | "tips.gg";
  link: string;
}

export const GAME_LABEL: Record<Game, string> = { cs2: "CS2", dota2: "Dota 2" };
export const STATUS_LABEL: Record<MStatus, string> = { plan: "Заплановано", live: "Наживо", done: "Завершено" };

const KYIV = "Europe/Kyiv";
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: KYIV, year: "numeric", month: "2-digit", day: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("uk-UA", { timeZone: KYIV, hour: "2-digit", minute: "2-digit", hour12: false });

export const kyivDay = (d: Date = new Date()) => dayFmt.format(d);
export const addDays = (day: string, n: number) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const dayShort = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("uk-UA", { day: "numeric", month: "short", timeZone: "UTC" });

/** Відносні шляхи логотипів (/api/v1/...) — від хоста бекенду. */
export function absLogo(url: string | null | undefined, apiBase: string): string | null {
  if (!url) return null;
  if (/^(https?:|data:)/.test(url)) return url;
  if (url.startsWith("/")) { try { return new URL(apiBase).origin + url; } catch { return url; } }
  return url;
}

/** Логотип-заглушка бекенду (SVG з ініціалами) — вважаємо «без логотипа». */
export const isFallbackLogo = (url: string | null) => !url || url.startsWith("data:") || /fallback|placeholder/i.test(url);

export function fromFeed(m: FeedMatch, game: Game, apiBase: string): Match {
  const start = m.startDate ? new Date(m.startDate) : new Date(`${m.date}T00:00:00Z`);
  const ok = !Number.isNaN(start.getTime());
  return {
    id: `${game}:${m.id}`,
    game,
    day: ok && m.startDate ? kyivDay(start) : m.date,
    time: ok && m.startDate ? timeFmt.format(start) : "—",
    ts: ok ? start.getTime() : 0,
    t1: String(m.nameTeam1 ?? ""),
    t2: String(m.nameTeam2 ?? ""),
    logo1: absLogo(m.logoTeam1, apiBase),
    logo2: absLogo(m.logoTeam2, apiBase),
    s1: m.score1,
    s2: m.score2,
    tournament: String(m.tournament ?? ""),
    bo: (m.type || "").toUpperCase(),
    status: m.status === "live" ? "live" : m.status === "finished" ? "done" : "plan",
    source: /hltv/i.test(m.link || "") ? "HLTV" : "tips.gg",
    link: m.link || "",
  };
}

export function fromHistory(m: HistoryMatch, apiBase: string): Match {
  const game: Game = m.game === "cs2" ? "cs2" : "dota2";
  return {
    id: `${game}:h:${m.id}`, game, day: String(m.date).slice(0, 10), time: "—", ts: new Date(`${String(m.date).slice(0, 10)}T00:00:00Z`).getTime(),
    t1: String(m.team1), t2: String(m.team2), logo1: absLogo(m.logoTeam1, apiBase), logo2: absLogo(m.logoTeam2, apiBase),
    s1: m.score1, s2: m.score2, tournament: String(m.tournament ?? ""), bo: (m.matchType || "").toUpperCase(), status: "done", source: "tips.gg", link: "",
  };
}

/** Назва команди для порівняння: без регістру, пробілів, «team», «esports», «gaming». */
export function normTeam(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/\b(team|esports?|gaming|club|academy)\b/g, (w) => (w === "academy" ? "academy" : ""))
    .replace(/[^a-z0-9а-яіїєґ]+/g, "");
}

const pair = (a: string, b: string) => [normTeam(a), normTeam(b)].sort().join("|");
const near = (a: string, b: string) => !!a && !!b && (a === b || (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a))));

/** Чи ставка стосується матчу (обидві команди збігаються, дата ±1 день). */
export function betMatches(b: Pick<AdminUserBet, "team1" | "team2" | "date">, m: Pick<Match, "t1" | "t2" | "day">): boolean {
  if (!b.team1 || !b.team2) return false;
  const d = String(b.date).slice(0, 10);
  if (d && Math.abs(new Date(d).getTime() - new Date(m.day).getTime()) > 36e5 * 36) return false;
  const x = [normTeam(b.team1), normTeam(b.team2)], y = [normTeam(m.t1), normTeam(m.t2)];
  return (near(x[0], y[0]) && near(x[1], y[1])) || (near(x[0], y[1]) && near(x[1], y[0]));
}

export interface ManualGroup {
  key: string;
  t1: string;
  t2: string;
  day: string;
  game: Game;
  bets: (AdminUserBet & { username: string; telegram?: string | null })[];
  official: Match | null;
  /** 0–100: наскільки схожий найближчий офіційний матч. */
  score: number;
}

/** Схожість двох назв матчу: 100 — обидві команди збігаються точно, 80+ — за префіксом. */
function similarity(b: { t1: string; t2: string }, m: Match): number {
  const x = [normTeam(b.t1), normTeam(b.t2)], y = [normTeam(m.t1), normTeam(m.t2)];
  const one = (a: string, c: string) => (a === c ? 50 : near(a, c) ? 42 : 0);
  return Math.max(one(x[0], y[0]) + one(x[1], y[1]), one(x[0], y[1]) + one(x[1], y[0]));
}

/**
 * Ставки на матчі, яких немає в стрічках (користувач ввів матч сам).
 * Групуємо за парою команд і днем, шукаємо схожий офіційний матч.
 */
export function manualGroups(bets: (AdminUserBet & { username: string; telegram?: string | null })[], matches: Match[]): ManualGroup[] {
  const groups = new Map<string, ManualGroup>();
  for (const b of bets) {
    if (!b.team1 || !b.team2) continue;
    const day = String(b.date).slice(0, 10);
    if (matches.some((m) => betMatches(b, m))) continue;
    const key = `${pair(b.team1, b.team2)}@${day}`;
    const g = groups.get(key) || { key, t1: b.team1, t2: b.team2, day, game: /dota/i.test(b.game) ? "dota2" : "cs2", bets: [], official: null, score: 0 } as ManualGroup;
    g.bets.push(b);
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    let best: Match | null = null, bs = 0;
    for (const m of matches) {
      if (m.game !== g.game) continue;
      if (Math.abs(new Date(m.day).getTime() - new Date(g.day).getTime()) > 36e5 * 72) continue;
      const s = similarity(g, m);
      if (s > bs) { bs = s; best = m; }
    }
    if (bs >= 42) { g.official = best; g.score = bs; }
  }
  return [...groups.values()].sort((a, b) => b.day.localeCompare(a.day) || b.bets.length - a.bets.length);
}

export interface Team {
  key: string;
  name: string;
  game: Game;
  logo: string | null;
  matches: number;
  last: string;
  /** Інші написання цієї ж команди в стрічках (кандидати в дублікати). */
  variants: string[];
}

/** Довідник команд зі стрічок і історії: одна команда — одна нормалізована назва в межах гри. */
export function teamsFrom(matches: Match[]): Team[] {
  const map = new Map<string, Team & { names: Map<string, number> }>();
  const add = (name: string, logo: string | null, m: Match) => {
    if (!name.trim()) return;
    const key = `${m.game}:${normTeam(name)}`;
    const t = map.get(key) || { key, name, game: m.game, logo: null, matches: 0, last: "", variants: [], names: new Map() };
    t.matches += 1;
    t.names.set(name, (t.names.get(name) || 0) + 1);
    if (!t.logo || (isFallbackLogo(t.logo) && !isFallbackLogo(logo))) t.logo = logo;
    if (m.day > t.last) t.last = m.day;
    map.set(key, t);
  };
  for (const m of matches) { add(m.t1, m.logo1, m); add(m.t2, m.logo2, m); }
  return [...map.values()].map((t) => {
    const names = [...t.names.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
    return { key: t.key, name: names[0], game: t.game, logo: t.logo, matches: t.matches, last: t.last, variants: names.slice(1) };
  }).sort((a, b) => b.matches - a.matches || a.name.localeCompare(b.name));
}

export const initials = (s: string) => (s.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2) || s.slice(0, 2)).toUpperCase();

/** Чіп «через N хв» / «N хв тому» для часу події. */
export function ago(iso: string, now = Date.now()): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const min = Math.round((now - t) / 60000);
  if (min < 1) return "щойно";
  if (min < 60) return `${min} хв тому`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} год тому`;
  return new Date(t).toLocaleDateString("uk-UA", { day: "numeric", month: "short" });
}
