// ── Матчі: нормалізація стрічок tips.gg / HLTV, команди, ставки «вручну» ──
import type { AdminUserBet } from "@/types";

export type Game = "cs2" | "dota2";
export type MStatus = "plan" | "live" | "done" | "moved" | "off";

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
  /** postponed / cancelled — лише з ручних правок адміна. */
  status: "upcoming" | "live" | "finished" | "postponed" | "cancelled";
  startDate?: string;
  coeff1?: number | null;
  coeff2?: number | null;
  openCoeff1?: number | null;
  openCoeff2?: number | null;
  closeCoeff1?: number | null;
  closeCoeff2?: number | null;
  bestCoeff1?: number | null;
  bestCoeff2?: number | null;
  bestBook1?: string | null;
  bestBook2?: string | null;
  tier?: "S" | "A" | "B" | "C" | "D" | null;
  maps?: { map: string; score1: number | null; score2: number | null }[];
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
  source: "HLTV" | "tips.gg" | "OddsPapi" | "Liquipedia" | "Cito" | "PandaScore" | "Вручну";
  link: string;
  /** id у стрічці без префікса гри — для ручних правок. */
  raw: string;
  /** Матч, доданий адміном (manual-…). */
  manual: boolean;
  /** Є коефіцієнти букмекера (OddsPapi / tips.gg). */
  odds?: boolean;
  /** Коефіцієнти на перемогу зараз і на відкритті лінії (рух коефіцієнтів). */
  c1?: number | null; c2?: number | null; o1?: number | null; o2?: number | null;
  /** Закриття (остання ціна перед стартом) і найкращий коефіцієнт серед букмекерів. */
  x1?: number | null; x2?: number | null; b1?: { c: number; book: string } | null; b2?: { c: number; book: string } | null;
  stage?: string; tier?: string | null;
  maps?: { map: string; score1: number | null; score2: number | null }[];
}

export const GAME_LABEL: Record<Game, string> = { cs2: "CS2", dota2: "Dota 2" };
export const STATUS_LABEL: Record<MStatus, string> = { plan: "Заплановано", live: "Наживо", done: "Завершено", moved: "Перенесено", off: "Скасовано" };

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
    status: m.status === "live" ? "live" : m.status === "finished" ? "done" : m.status === "postponed" ? "moved" : m.status === "cancelled" ? "off" : "plan",
    source: String(m.id).startsWith("manual-") ? "Вручну" : String(m.id).startsWith("op-") ? "OddsPapi" : String(m.id).startsWith("ct-") ? "Cito" : String(m.id).startsWith("ps-") ? "PandaScore" : String(m.id).startsWith("lp-") ? "Liquipedia" : /hltv/i.test(m.link || "") ? "HLTV" : "tips.gg",
    link: m.link || "",
    odds: m.coeff1 != null && m.coeff2 != null,
    c1: m.coeff1 ?? null, c2: m.coeff2 ?? null, o1: m.openCoeff1 ?? null, o2: m.openCoeff2 ?? null,
    x1: m.closeCoeff1 ?? null, x2: m.closeCoeff2 ?? null,
    b1: m.bestCoeff1 != null && m.bestBook1 ? { c: m.bestCoeff1, book: m.bestBook1 } : null,
    b2: m.bestCoeff2 != null && m.bestBook2 ? { c: m.bestCoeff2, book: m.bestBook2 } : null,
    stage: m.stage || "", tier: m.tier ?? null, maps: m.maps?.length ? m.maps : undefined,
    raw: String(m.id),
    manual: String(m.id).startsWith("manual-"),
  };
}

export function fromHistory(m: HistoryMatch, apiBase: string): Match {
  const game: Game = m.game === "cs2" ? "cs2" : "dota2";
  return {
    id: `${game}:h:${m.id}`, game, day: String(m.date).slice(0, 10), time: "—", ts: new Date(`${String(m.date).slice(0, 10)}T00:00:00Z`).getTime(),
    t1: String(m.team1), t2: String(m.team2), logo1: absLogo(m.logoTeam1, apiBase), logo2: absLogo(m.logoTeam2, apiBase),
    s1: m.score1, s2: m.score2, tournament: String(m.tournament ?? ""), bo: (m.matchType || "").toUpperCase(), status: "done", source: "tips.gg", link: "", raw: String(m.id), manual: false,
  };
}

/** Назва без регістру, пробілів, «team», «esports», «gaming» — як makeLinkKey у бекенді. */
export function baseNorm(s: string): string {
  return String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/\b(team|esports?|gaming|club|academy)\b/g, (w) => (w === "academy" ? "academy" : ""))
    .replace(/[^a-z0-9а-яіїєґ]+/g, "");
}

/** Псевдоніми команд з бекенду: написання → основна назва (обидва нормалізовані). */
let ALIASES = new Map<string, string>();
export function setAliases(list: { canonical: string; alias: string }[]): void {
  ALIASES = new Map(list.map((a) => [baseNorm(a.alias), baseNorm(a.canonical)]));
}
export const isAliasName = (s: string) => ALIASES.has(baseNorm(s));

/** Назва команди для порівняння — з урахуванням псевдонімів («NAVI» → «Natus Vincere»). */
export function normTeam(s: string): string {
  const n = baseNorm(s);
  return ALIASES.get(n) ?? n;
}

/** Ключ матчу, введеного вручну, — той самий, що makeLinkKey у бекенді (match_links.link_key). */
export const linkKey = (game: Game, t1: string, t2: string, day: string) => `${game}:${[baseNorm(t1), baseNorm(t2)].sort().join("|")}@${day.slice(0, 10)}`;

/** Офсет Києва (хв) у момент часу. */
function kyivOffset(at: Date): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: KYIV, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(at).map((x) => [x.type, x.value]));
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(at.getTime() / 60000) * 60000) / 60000;
}
/** «2026-11-20T19:00» за Києвом → ISO UTC. */
export function kyivToIso(local: string): string {
  const [d, t = "00:00"] = local.split("T");
  const guess = new Date(`${d}T${t.slice(0, 5)}:00Z`);
  if (Number.isNaN(guess.getTime())) return "";
  return new Date(guess.getTime() - kyivOffset(guess) * 60000).toISOString();
}
/** ISO → «2026-11-20T19:00» за Києвом (для input type=datetime-local). */
export function isoToKyiv(iso: number | string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return new Date(at.getTime() + kyivOffset(at) * 60000).toISOString().slice(0, 16);
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
export function similarity(b: { t1: string; t2: string }, m: Match): number {
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
  /** Написання, вже записані в псевдоніми (не дублікати). */
  aliases: string[];
  /** Місце в рейтингу з пакета логотипів (HLTV / Dota 2), якщо команда там є. */
  rank?: number | null;
}

export interface CatalogTeam { game: Game; name: string; rank: number | null; logo: string | null }

/**
 * Довідник команд: команди з матчів + усі команди з пакетів логотипів.
 * Команда з матчів отримує місце в рейтингу (і логотип, якщо свого не мала);
 * команда лише з пакета — 0 матчів. Порядок: більше матчів, потім вище в рейтингу.
 */
export function mergeCatalog(teams: Team[], catalog: CatalogTeam[]): Team[] {
  const byKey = new Map<string, Team>(teams.map((t) => [t.key, { ...t }]));
  for (const c of catalog) {
    const n = normTeam(c.name);
    if (!n) continue;
    const key = `${c.game}:${n}`;
    const t = byKey.get(key);
    if (t) {
      if (t.rank == null || (c.rank != null && c.rank < t.rank)) t.rank = c.rank;
      if (isFallbackLogo(t.logo) && c.logo) t.logo = c.logo;
    } else byKey.set(key, { key, name: c.name, game: c.game, logo: c.logo, matches: 0, last: "", variants: [], aliases: [], rank: c.rank });
  }
  return [...byKey.values()].sort((a, b) => b.matches - a.matches || (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.name.localeCompare(b.name));
}

/** Довідник команд зі стрічок і історії: одна команда — одна нормалізована назва в межах гри. */
export function teamsFrom(matches: Match[]): Team[] {
  const map = new Map<string, Team & { names: Map<string, number> }>();
  const add = (name: string, logo: string | null, m: Match) => {
    if (!name.trim()) return;
    const key = `${m.game}:${normTeam(name)}`;
    const t = map.get(key) || { key, name, game: m.game, logo: null, matches: 0, last: "", variants: [], aliases: [], names: new Map() };
    t.matches += 1;
    t.names.set(name, (t.names.get(name) || 0) + 1);
    if (!t.logo || (isFallbackLogo(t.logo) && !isFallbackLogo(logo))) t.logo = logo;
    if (m.day > t.last) t.last = m.day;
    map.set(key, t);
  };
  for (const m of matches) { add(m.t1, m.logo1, m); add(m.t2, m.logo2, m); }
  return [...map.values()].map((t) => {
    const names = [...t.names.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
    const main = names.find((n) => !isAliasName(n)) || names[0];
    const rest = names.filter((n) => n !== main);
    return { key: t.key, name: main, game: t.game, logo: t.logo, matches: t.matches, last: t.last, variants: rest.filter((n) => !isAliasName(n)), aliases: rest.filter(isAliasName) };
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

/** «1,75 ↓ з 1,90» — the price now and, when it moved, which way and from what. */
export function oddsMove(now: number | null | undefined, open: number | null | undefined): { now: string; dir: "up" | "down" | null; from: string | null } {
  const f = (n: number) => n.toFixed(2).replace(".", ",");
  if (now == null) return { now: "—", dir: null, from: null };
  if (open == null || Math.abs(now - open) < 0.005) return { now: f(now), dir: null, from: null };
  return { now: f(now), dir: now > open ? "up" : "down", from: f(open) };
}
