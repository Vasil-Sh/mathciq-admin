import { api, getRefreshToken } from "./apiClient";
import type { AppSettings } from "@/types";

/** Who changed a setting and when (keys are AppSettings field names). */
export type SettingsMeta = Partial<Record<keyof AppSettings, { at: string; by: string }>>;

export async function fetchSettings(): Promise<AppSettings> {
  const data = await api.get<{ settings: AppSettings }>("/admin/settings");
  return data.settings;
}

export async function fetchSettingsWithMeta(): Promise<{ settings: AppSettings; meta: SettingsMeta }> {
  const data = await api.get<{ settings: AppSettings; meta?: SettingsMeta }>("/admin/settings");
  return { settings: data.settings, meta: data.meta || {} };
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const data = await api.put<{ settings: AppSettings }>("/admin/settings", patch);
  return data.settings;
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<{ settings: AppSettings; meta: SettingsMeta }> {
  const data = await api.put<{ settings: AppSettings; meta?: SettingsMeta }>("/admin/settings", patch);
  return { settings: data.settings, meta: data.meta || {} };
}

export interface SettingsOverview {
  plans: { basic: number; pro: number };
  trial: { now: number; conversionPct: number | null };
  ai: { today: number; todayUah: number; month: number; monthUah: number };
  alerts: { expiring: number; inactive: number; lossStreak: number };
  receiptNext: number;
}

export function fetchSettingsOverview(): Promise<SettingsOverview> {
  return api.get<SettingsOverview>("/admin/settings/overview");
}

export interface Session { id: string; ip: string; userAgent: string; createdAt: string; lastSeenAt: string; current: boolean }

export async function fetchSessions(): Promise<Session[]> {
  const rt = getRefreshToken();
  const data = await api.get<{ sessions: Session[] }>("/auth/sessions", rt ? { headers: { "X-Refresh-Token": rt } } : undefined);
  return data.sessions || [];
}

export function endSession(id: string) {
  return api.delete<{ success: boolean }>(`/auth/sessions/${encodeURIComponent(id)}`);
}

export function logoutOthers() {
  return api.post<{ success: boolean; revoked: number; token?: string; refreshToken?: string }>("/auth/logout-all", { refreshToken: getRefreshToken() });
}

export function changePassword(currentPassword: string, newPassword: string) {
  return api.post<{ success: boolean }>("/auth/change-password", { currentPassword, newPassword });
}
