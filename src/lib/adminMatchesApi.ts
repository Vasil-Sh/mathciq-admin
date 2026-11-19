import { api, getApiBase } from "./apiClient";
const API_BASE = getApiBase();
import { fromFeed, fromHistory, type FeedMatch, type HistoryMatch, type Match } from "./matchesModel";

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
