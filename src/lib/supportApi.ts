import { api } from "@/lib/apiClient";

// ── Support tickets (form «Проблема чи побажання» in the app) ──

export type TStatus = "open" | "in_progress" | "waiting" | "resolved" | "closed";
export type TKind = "problem" | "idea" | "question";
export type TFilter = "open" | "new" | "mine" | "resolved";

export interface TMessage { id?: string; author: string; fromAdmin: boolean; body: string; createdAt: string; }
export interface Ticket {
  id: string; userId: number | null; username: string; plan: string | null;
  subject: string; message: string; kind: TKind; status: TStatus; assignee: string | null;
  meta: { device?: string; appVersion?: string; screen?: string } | null;
  createdAt: string; updatedAt: string; firstReplyAt: string | null;
  lastMessage?: TMessage | null; replies?: number;
}
export interface TicketStats {
  new: number; oldestNewAt: string | null; inWork: number; inWorkBy: { assignee: string; count: number }[];
  avgFirstReplyMin: number | null; resolvedWeek: number; resolvedProblems: number; resolvedIdeas: number;
}
export interface TicketList { tickets: Ticket[]; counts: Record<TFilter, number>; stats: TicketStats; }
export interface TicketDetail { ticket: Ticket; messages: TMessage[]; context: { aiToday: number | null; aiLimit?: number; hints?: string[] }; }
export interface Template { id: string; title: string; body: string; }

export const STATUS: Record<TStatus, { label: string; cls: string }> = {
  open: { label: "Нове", cls: "v3-tag-red" },
  in_progress: { label: "В роботі", cls: "v3-tag-blue" },
  waiting: { label: "Чекає відповіді", cls: "v3-tag-amber" },
  resolved: { label: "Вирішено", cls: "v3-tag-green" },
  closed: { label: "Закрито", cls: "v3-tag-green" },
};
export const KIND: Record<TKind, string> = { problem: "Проблема", idea: "Побажання", question: "Питання" };
export const PLAN: Record<string, string> = { pro: "Pro", basic: "Базова", trial: "Пробний" };

/** Reply templates for when the backend has none saved yet (same three as on the design). */
export const DEFAULT_TEMPLATES: Template[] = [
  { id: "d1", title: "Шаблон: ліміт AI", body: "Вітаю! Схоже, на сьогодні вичерпано ліміт AI-аналізів — нові відкриються о 00:00 за Києвом. Повідомлення про ліміт виправимо в наступному оновленні." },
  { id: "d2", title: "Шаблон: оплата", body: "Вітаю! Перевірили оплату — гроші надійшли, підписку продовжили. Перезапустіть застосунок, будь ласка." },
  { id: "d3", title: "Дякуємо за ідею", body: "Дякуємо за ідею! Передали команді — напишемо вам, щойно зʼявиться." },
];

export async function fetchTickets(filter: TFilter, kind: TKind | "", q: string): Promise<TicketList> {
  const p = new URLSearchParams({ filter });
  if (kind) p.set("kind", kind);
  if (q.trim()) p.set("q", q.trim());
  return api.get<TicketList>(`/admin/support-tickets?${p}`);
}
export const fetchTicket = (id: string) => api.get<TicketDetail>(`/admin/support-tickets/${id}`);
export const replyTicket = (id: string, body: string, status?: TStatus) =>
  api.post<{ message: TMessage; status: TStatus; assignee: string; telegram: boolean }>(`/admin/support-tickets/${id}/reply`, status ? { body, status } : { body });
export const patchTicket = (id: string, patch: { status?: TStatus; assignee?: string | null }) => api.patch<{ success: boolean }>(`/admin/support-tickets/${id}`, patch);
export async function fetchTemplates(): Promise<Template[]> {
  const d = await api.get<{ templates?: Template[] } | Template[]>("/admin/support-templates").catch(() => null);
  const list = Array.isArray(d) ? d : d?.templates || [];
  return list.length ? list : DEFAULT_TEMPLATES;
}

// ── Telegram groups that Pro users added (moderation) ──

export type GStatus = "pending" | "approved" | "rejected";
export interface TgGroup {
  id: string; name: string; link: string | null; game: string | null; hasChannel: boolean; comment: string | null;
  userId: number | null; addedBy: string | null; addedByPlan: string | null;
  moderationStatus: GStatus; reviewedBy: string | null; reviewedAt: string | null; rejectReason: string | null; createdAt: string;
  // filled by the moderation list (older backends omit them)
  flags?: string[]; flagReason?: string | null; linkState?: "ok" | "none" | "bad" | "private"; linkProblem?: string | null;
  people?: number; bets7d?: number; betsTotal?: number; wins?: number; losses?: number; lastBetAt?: string | null; hitRate?: number | null;
}
export interface GroupSummary { all: number; people: number; working: number; bets7d: number; errors: number; errorKinds: string[]; pending: number; flagged: number; pendingReason: string | null; }
export interface GroupList { groups: TgGroup[]; hasMore: boolean; counts: Record<GStatus | "all" | "errors", number>; summary?: GroupSummary; }
export interface GroupDetail { group: TgGroup & { flaggedTexts?: { field: "name" | "comment"; parts: { t: string; hl: boolean }[] }[] }; recentBets: { match: string | null; betType: string | null; odds: string | null; result: string | null; createdAt: string }[]; }
export type GView = "pending" | "ok" | "error" | "rejected";
/** What the moderator sees: blocked, waiting for review, link problem, or working. */
export const gView = (g: TgGroup): GView => g.moderationStatus === "rejected" ? "rejected" : g.moderationStatus === "pending" ? "pending" : g.linkState && g.linkState !== "ok" ? "error" : "ok";
export const GVIEW: Record<GView, { label: string; cls: string }> = {
  pending: { label: "Перевірити", cls: "v3-tag-red" },
  ok: { label: "Активна", cls: "v3-tag-green" },
  error: { label: "Помилка", cls: "v3-tag-amber" },
  rejected: { label: "Заблоковано", cls: "v3-tag-gray" },
};
export const GSTATUS: Record<GStatus, { label: string; cls: string }> = {
  pending: { label: "Перевірити", cls: "v3-tag-red" },
  approved: { label: "Активна", cls: "v3-tag-green" },
  rejected: { label: "Заблоковано", cls: "v3-tag-gray" },
};
export const REASONS = ["Договірні матчі", "Шахрайство", "Спам"] as const;

export const fetchGroup = (id: string) => api.get<GroupDetail>(`/admin/telegram-groups/${id}`);
export async function fetchGroups(status: GStatus | "all" | "errors", q: string, page = 1): Promise<GroupList> {
  const p = new URLSearchParams({ status, page: String(page) });
  if (q.trim()) p.set("q", q.trim());
  return api.get<GroupList>(`/admin/telegram-groups?${p}`);
}
export const approveGroup = (id: string) => api.post<{ success: boolean }>(`/admin/telegram-groups/${id}/approve`, {});
export const rejectGroup = (id: string, reason: string) => api.post<{ success: boolean }>(`/admin/telegram-groups/${id}/reject`, { reason });

// ── formatting ──

const KYIV = "Europe/Kyiv";
/** «щойно», «3 год тому», «вчора», «2 дні тому», «20 жовт.» */
export function ago(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const m = Math.max(0, Math.round((now - t) / 60000));
  if (m < 1) return "щойно";
  if (m < 60) return `${m} хв тому`;
  const h = Math.floor(m / 60);
  const day = (d: number) => new Intl.DateTimeFormat("en-CA", { timeZone: KYIV }).format(new Date(d));
  if (day(t) === day(now)) return `${h} год тому`;
  if (day(t) === day(now - 864e5)) return "вчора";
  const d = Math.round((new Date(day(now)).getTime() - new Date(day(t)).getTime()) / 864e5);
  if (d < 7) return `${d} ${d < 5 ? "дні" : "днів"} тому`;
  return new Intl.DateTimeFormat("uk-UA", { timeZone: KYIV, day: "numeric", month: "short" }).format(new Date(t));
}
/** Time for a chat bubble: «07:12» today, «вчора, 18:20», else «20 жовт.». */
export function bubbleTime(iso: string, now = Date.now()): string {
  const t = new Date(iso);
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: KYIV }).format(d);
  const hm = new Intl.DateTimeFormat("uk-UA", { timeZone: KYIV, hour: "2-digit", minute: "2-digit" }).format(t);
  if (day(t) === day(new Date(now))) return hm;
  if (day(t) === day(new Date(now - 864e5))) return `вчора, ${hm}`;
  return new Intl.DateTimeFormat("uk-UA", { timeZone: KYIV, day: "numeric", month: "short" }).format(t);
}
/** 100 → «1 год 40 хв», 25 → «25 хв». */
export function minutesText(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${min} хв`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} год ${m} хв` : `${h} год`;
}
