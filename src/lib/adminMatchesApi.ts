import { api, getApiBase } from "./apiClient";
const API_BASE = getApiBase();
import { absLogo, type CatalogTeam, fromFeed, fromHistory, type FeedMatch, type Game, type HistoryMatch, type Match } from "./matchesModel";

/** Стрічки на сьогодні й наперед: CS2 (tips.gg + HLTV) і Dota 2 (tips.gg). */
export async function fetchFeeds(force = false): Promise<{ matches: Match[]; failed: ("cs2" | "dota2")[] }> {
  const q = force ? "?refresh=true" : "";
  const [cs, dota] = await Promise.allSettled([
    api.get<FeedMatch[]>(`/cs2-matches${q}`),
    api.get<FeedMatch[]>(`/dota2-matches${q}`),
  ]);
  const failed: ("cs2" | "dota2")[] = [];
  const out: Match[] = [];
  if (cs.status === "fulfilled" && Array.isArray(cs.value)) out.push(...cs.value.map((m) => fromFeed(m, "cs2", API_BASE)));
  else failed.push("cs2");
  if (dota.status === "fulfilled" && Array.isArray(dota.value)) out.push(...dota.value.map((m) => fromFeed(m, "dota2", API_BASE)));
  else failed.push("dota2");
  if (failed.length === 2) throw cs.status === "rejected" ? cs.reason : new Error("Стрічки матчів недоступні");
  return { matches: out.sort((a, b) => a.ts - b.ts), failed };
}

/** Завершені матчі за останні дні (для команд і пошуку схожих офіційних). */
export async function fetchHistory(days = 30): Promise<Match[]> {
  const data = await api.get<HistoryMatch[]>(`/matches-history?game=all&days=${days}`);
  return Array.isArray(data) ? data.map((m) => fromHistory(m, API_BASE)) : [];
}

/** Скидає запобіжник парсера — наступний запит до джерела піде одразу. */
export async function rerunParser(name: string): Promise<void> {
  await api.post(`/admin/parsers/${encodeURIComponent(name)}/rerun`, {});
}

// ── Адмінські дані матчів (cs-backend: routes/adminMatches.ts) ──

/** Статуси ручних правок — як у бекенді (match_overrides, manual_matches). */
export type AdminStatus = "upcoming" | "live" | "finished" | "postponed" | "cancelled";
export interface TeamAlias { id: number; game: string; canonical: string; alias: string; createdBy: string; createdAt: string }
export interface ManualMatch { id: string; game: Game; team1: string; team2: string; tournament: string; bo: string; startDate: string; status: AdminStatus; score1: number | null; score2: number | null; createdBy: string; createdAt: string }
export interface MatchOverride { id: number; game: string; matchId: string; status: AdminStatus | null; startDate: string | null; score1: number | null; score2: number | null; decidedBy: string }
export interface MatchLink { id: number; game: string; team1: string; team2: string; matchDate: string; linkKey: string; officialId: string | null; decision: "pending" | "merged" | "different"; decidedBy: string }
export interface ParserEvent { id: number; source: string; event: "success" | "failure" | "rerun"; message: string; createdAt: string }
export interface HourStat { hour: string; success: number; failure: number }

const notFound = (e: unknown) => (e as { status?: number })?.status === 404;

export const fetchAliases = async () => (await api.get<{ aliases: TeamAlias[] }>("/admin/team-aliases")).aliases || [];
export const createAlias = (b: { game: Game; canonical: string; alias: string }) => api.post<TeamAlias>("/admin/team-aliases", b);
export const deleteAlias = (id: number) => api.delete(`/admin/team-aliases/${id}`);
export interface HiddenTeam { id: number; game: Game; name: string; createdBy: string; createdAt: string }
export const fetchHiddenTeams = async () => (await api.get<{ teams: HiddenTeam[] }>("/admin/hidden-teams")).teams || [];
export const hideTeam = (b: { game: Game; name: string }) => api.post<HiddenTeam>("/admin/hidden-teams", b);
export const unhideTeam = (id: number) => api.delete(`/admin/hidden-teams/${id}`);

export const createManualMatch = (b: { game: Game; team1: string; team2: string; tournament?: string; bo?: string; startDate: string; status?: AdminStatus }) => api.post<ManualMatch>("/admin/manual-matches", b);
export const deleteManualMatch = (id: string) => api.delete(`/admin/manual-matches/${encodeURIComponent(id)}`);

/** id матчу в стрічці (без префікса гри). Порожні поля — без правки. */
export const patchMatch = (game: Game, rawId: string, b: { status: AdminStatus | null; startDate: string | null; score1: number | null; score2: number | null }) =>
  api.patch<MatchOverride>(`/admin/matches/${game}/${encodeURIComponent(rawId)}`, b);
export const resetMatch = (game: Game, rawId: string) => api.delete(`/admin/matches/${game}/${encodeURIComponent(rawId)}`);

export const linkMatch = (kind: "merge" | "unlink", b: { game: Game; team1: string; team2: string; date: string; officialId: string | null }) =>
  api.post<MatchLink>(`/admin/matches/${kind}`, b);

/**
 * Списки ручних правок і рішень щодо об'єднання. У бекенді (поки) немає GET для них —
 * тоді повертаємо null, і екран працює без них (рішення видно до перезавантаження).
 */
export async function fetchOverrides(): Promise<MatchOverride[] | null> {
  try { return (await api.get<{ overrides: MatchOverride[] }>("/admin/match-overrides")).overrides || []; } catch (e) { if (notFound(e)) return null; throw e; }
}
export async function fetchLinks(): Promise<MatchLink[] | null> {
  try { return (await api.get<{ links: MatchLink[] }>("/admin/match-links")).links || []; } catch (e) { if (notFound(e)) return null; throw e; }
}

export const fetchParserEvents = async (name: string, limit = 100) => (await api.get<{ events: ParserEvent[] }>(`/admin/parsers/${encodeURIComponent(name)}/events?limit=${limit}`)).events || [];
export const fetchAvailability = async (name: string, hours = 24) => (await api.get<{ availability: HourStat[] }>(`/admin/parsers/${encodeURIComponent(name)}/availability?hours=${hours}`)).availability || [];

export const logoKey = (game: Game, name: string) => `${game}:${name.trim().toLowerCase()}`;
/** Team logos the app uses (HLTV/Dota 2 logo packs on the backend, then tips.gg) — one request for many teams. */
export async function resolveLogos(items: { name: string; game: Game }[]): Promise<Record<string, string>> {
  if (!items.length) return {};
  const res = await api.post<{ name: string; game: Game; url: string | null }[]>("/risky-teams/logos", items.slice(0, 300));
  const out: Record<string, string> = {};
  for (const r of Array.isArray(res) ? res : []) { const u = absLogo(r.url, API_BASE); if (u && r.name) out[logoKey(r.game, r.name)] = u; }
  return out;
}

/** Усі команди з пакетів логотипів (CS2 + Dota 2) — для довідника «Команди». */
export async function fetchTeamCatalog(): Promise<CatalogTeam[]> {
  const res = await api.get<{ teams: CatalogTeam[] }>("/admin/teams/catalog");
  return (res.teams || []).map((t) => ({ ...t, logo: absLogo(t.logo, API_BASE) }));
}
