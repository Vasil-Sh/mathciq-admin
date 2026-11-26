import { api } from "@/lib/apiClient";

export type TgStatus = "run" | "stop" | "err" | "block";
export interface TgChannel {
  handle: string; title: string | null; subscribers: number | null; game: "cs2" | "dota2" | "both"; isTest: boolean; paused: boolean; addedBy: string | null;
  lastPostAt: string | null; checkedAt: string | null; error: string | null; status: TgStatus;
  /** A private channel (handle «priv-<id>») read through our Telegram account: its invite hash. */
  invite?: string | null;
  /** Paused by the server (silent for 14 days) and failed reads in a row. */
  autoPaused?: string | null; fails?: number;
  posts7d: number; tips7d: number; unknown7d: number; recognized: number | null; settled: number; wins: number; winrate: number | null; roi: number | null; pending: number;
  users: string[]; days: number[];
  /** Saved posts still waiting to be read again (screenshots, a new reader). */
  rereading?: number;
  /** A running re-read / first read of a new channel: posts to read and read so far. */
  progress?: { total: number; done: number; kind: "reread" | "add" | "collect" | "archive" } | null;
  /** Real money from the bet slips, per currency (won → paid − staked, lost → −staked). */
  money?: { currency: string; profit: number; staked: number; bets: number; won?: number; lost?: number; wins?: number; losses?: number; open?: number; openBets?: number }[];
  /** The 7 days of `days` by kind (the day sheet). */
  daysDetail?: { tips: number; unknown: number; info: number; repeats: number }[];
  /** All time: posts by kind, tips settled at 100 on the odds (profit in those units). */
  all?: { posts: number; tips: number; unknown: number; other: number; repeats: number; won: number; lost: number; pending: number; recognized: number | null; winrate: number | null; profit: number | null; roi: number | null; firstAt: string | null;
    ours?: { won: number; lost: number; roi: number | null; onlyOurs: number }; confirmed?: number; mismatches?: number; honesty?: number | null;
    live?: number; liveWon?: number; liveLost?: number; deleted?: number; edited?: number; deletedLost?: number; oddsHigh?: number;
    week?: { won: number; lost: number; roi: number | null } };
}
export interface TgList {
  channels: TgChannel[]; invites: { name: string; link: string; who: string[] }[]; days: string[];
  totals: { channels: number; running: number; posts24h: number; tips24h: number; recognized: number | null; unknown7d: number; queue?: number; settled30d: number; winrate30d: number | null; pending: number };
  /** How posts are read: the AI model (GEMINI_API_KEY on the server) or OCR, and how it went since the server started. */
  alerts?: { unknown: number; mismatches: number };
  /** The best channel of the last 7 days (ROI, ≥ 3 settled tips). */
  best?: { handle: string; title: string | null; roi: number; won: number; lost: number } | null;
  reader?: { ai: boolean; model: string | null; quota?: { used: number; limit: number; day: string; byModel: Record<string, number> };
    readers?: { id: string; label: string; model: string; hasKey: boolean; keyName: string; today: number; ok: number; failed: number; restUntil: string | null; lastError: string | null; read30?: number; wrong30?: number; accuracy?: number | null }[];
    /** Requests not spent since the server started: by rules, a channel's template, a slip read before, posts read in one request. */
    saved?: { rules: number; template: number; cache: number; batch: number; since: string };
    /** The reference check: the posts the admin sorted, read again by every reader. */
    golden?: { at?: string; posts?: number; readers?: { id: string; label: string; ok: number; total: number; skipped: number; misses: string[] }[]; running: boolean; done: number; total: number }; aiCalls: number; aiFailed: number; aiError: string | null; ocrImages: number; ocrFailed: number; ocrAvgMs: number | null; ocrError: string | null };
  night: boolean; nextAt: string | null;
  /** Our Telegram account for private channels (TG_API_ID, TG_API_HASH, TG_SESSION on the server). */
  account?: { enabled: boolean; connectedAt: string | null; error: string | null };
}
export interface TgPost {
  handle: string; postId: number; postedAt: string; text: string; kind: "bet" | "other" | "unknown"; reason: string | null; game: string | null;
  matchId: string | null; team1: string | null; team2: string | null; market: string | null; pick: string | null; odds: number | null; result: "Win" | "Loss" | "Void" | null; score: string | null; fixedBy: string | null; title?: string | null;
  /** What the slip on the screenshot shows and the money on it. */
  slip?: string | null; stake?: number | null; currency?: string | null; payout?: number | null;
  /** Our own check: the result by our scores, who settled it, the channel's claim disproved, placed after the start, deleted / edited by the channel. */
  ourOdds?: number | null; oddsHigh?: boolean; claim?: { won?: number | null; total?: number | null; period?: string | null } | null;
  ourResult?: "Win" | "Loss" | null; settledBy?: "ours" | "slip" | "admin" | null; mismatch?: boolean; isLive?: boolean; deletedAt?: string | null; editedAt?: string | null;
  legs?: { team1: string; team2: string; market: string; pick: string | null; odds: number | null; result?: "Win" | "Loss" | null }[] | null;
  /** The match of our feed now: live / upcoming with its score. */
  live?: { status: string; score1: number | null; score2: number | null; start: string };
  /** Screenshots of the post (t.me CDN) and the text OCR read on them. */
  photos?: string[]; ocr?: string | null;
}
export interface TgMatch { id: string; game: "cs2" | "dota2"; team1: string; team2: string; start: string; status?: string }
export type TgPreview = { ok: true; handle: string; title: string | null; subscribers: number | null; posts: number; tipLike: number; recognized: number; exists: boolean; private?: boolean; joined?: boolean } | { ok: false; error: string };

export const fetchTgSources = () => api.get<TgList>("/admin/tg-sources");
export const fetchTgPosts = (handle: string) => api.get<{ posts: TgPost[] }>(`/admin/tg-sources/${encodeURIComponent(handle)}/posts`).then((r) => r.posts);
export const fetchTgUnrecognized = () => api.get<{ posts: TgPost[] }>("/admin/tg-posts/unrecognized").then((r) => r.posts);
export const fetchTgMatches = (q: string) => api.get<{ matches: TgMatch[] }>(`/admin/tg-posts/matches?q=${encodeURIComponent(q)}`).then((r) => r.matches);
export const previewTgChannel = (link: string) => api.post<TgPreview>("/admin/tg-sources/preview", { link });
export const addTgChannel = (link: string, game: string, test: boolean) => api.post<{ ok: true; handle: string; added?: number; started?: boolean }>("/admin/tg-sources", { link, game, test });
export const pauseTgChannel = (handle: string, paused: boolean) => api.post<{ ok: true }>(`/admin/tg-sources/${encodeURIComponent(handle)}/pause`, { paused });
export const refreshTgChannel = (handle: string) => api.post<{ ok: true; added?: number }>(`/admin/tg-sources/${encodeURIComponent(handle)}/refresh`);
export const rereadTgChannel = (handle: string) => api.post<{ ok: true; posts: number }>(`/admin/tg-sources/${encodeURIComponent(handle)}/reread`);
export const resolveTgPost = (handle: string, postId: number, who: "channel" | "ours") => api.post<{ ok: true }>(`/admin/tg-posts/${encodeURIComponent(handle)}/${postId}/resolve`, { who });
export const archiveTgChannel = (handle: string, pages = 5) => api.post<{ ok: true; pages: number }>(`/admin/tg-sources/${encodeURIComponent(handle)}/archive`, { pages });
export interface TgStats {
  chart: { day: string; claimed: number; ours: number }[];
  byGame: { name: string; won: number; lost: number; winrate: number; roi: number | null }[];
  byMarket: { name: string; won: number; lost: number; winrate: number; roi: number | null }[];
  streaks: { best: number; worst: number; current: number };
  summaries: { at: string; period: string | null; claimed: { won: number | null; total: number | null }; ours: { won: number; total: number } }[];
}
export const fetchTgStats = (handle: string) => api.get<TgStats>(`/admin/tg-sources/${encodeURIComponent(handle)}/stats`);
export const runTgGolden = () => api.post<{ ok: true; running: boolean }>("/admin/tg-sources/golden");
export const deleteTgChannel = (handle: string) => api.delete<{ ok: true }>(`/admin/tg-sources/${encodeURIComponent(handle)}`);
export const fixTgPost = (handle: string, postId: number, body: { kind: "other"; reason?: "Повтор" | "Опитування" | "Підсумок" | null } | { kind: "bet"; matchId: string; market: "Match Winner" | "Total" | "Handicap" | "Map"; side?: 1 | 2; line?: number; over?: boolean; map?: number; odds?: number | null; remember?: boolean; result?: "auto" | "pending" | "Win" | "Loss" | "Void" }) =>
  api.post<{ ok: true }>(`/admin/tg-posts/${encodeURIComponent(handle)}/${postId}`, body);
