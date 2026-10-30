import { api } from "./apiClient";
import type { AppSettings } from "@/types";

export async function fetchSettings(): Promise<AppSettings> {
  const data = await api.get<{ settings: AppSettings }>("/admin/settings");
  return data.settings;
}

export async function updateSettings(
  patch: Partial<AppSettings>,
): Promise<AppSettings> {
  const data = await api.put<{ settings: AppSettings }>("/admin/settings", patch);
  return data.settings;
}
