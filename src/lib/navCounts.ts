import { useSyncExternalStore } from "react";

/**
 * Counts from the «Матчі» screen tabs (Матчі · Парсери · Додані вручну · Команди), shown next to
 * the same items in the phone menu. The screen publishes them; the last known values are kept
 * in localStorage so the menu has numbers right after a reload.
 */
export type MatchCounts = Partial<Record<"matches" | "parsers" | "manual" | "teams", number>>;
const KEY = "mq.matchCounts";
let cur: MatchCounts = (() => { try { return JSON.parse(localStorage.getItem(KEY) || "{}") as MatchCounts; } catch { return {}; } })();
const subs = new Set<() => void>();

export function publishMatchCounts(next: Record<string, number | null>): void {
  const clean: MatchCounts = { ...cur };
  for (const [k, v] of Object.entries(next)) if (typeof v === "number") clean[k as keyof MatchCounts] = v;
  if (JSON.stringify(clean) === JSON.stringify(cur)) return;
  cur = clean;
  try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch { /* private mode */ }
  subs.forEach((f) => f());
}

export function useMatchCounts(): MatchCounts {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => cur, () => cur);
}
