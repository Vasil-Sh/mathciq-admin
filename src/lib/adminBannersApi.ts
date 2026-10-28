import { api, getApiBase } from "./apiClient";
import type { Banner, BannerInput, BannerSlotState } from "@/types";

export async function fetchBanners(): Promise<Banner[]> {
  const data = await api.get<{ banners: Banner[] }>("/banners");
  return (data.banners || []).map(b => ({...b,imageUrl: b.imageUrl?.startsWith("/api/") ? new URL(b.imageUrl,new URL(getApiBase(),window.location.origin)).href : b.imageUrl}));
}

export async function createBanner(input: BannerInput): Promise<Banner> {
  return api.post<Banner>("/banners", input);
}

export async function updateBanner(
  id: string,
  input: Partial<BannerInput>
): Promise<Banner> {
  return api.put<Banner>(`/banners/${id}`, input);
}

export async function deleteBanner(id: string): Promise<void> {
  await api.delete(`/banners/${id}`);
}

export async function fetchBannerSlots(): Promise<BannerSlotState[]> {
  const data = await api.get<{ slots: BannerSlotState[] }>("/banners/slots");
  return data.slots || [];
}

export async function updateBannerSlot(
  slot: number,
  placeholderEnabled: boolean
): Promise<BannerSlotState> {
  return api.put<BannerSlotState>(`/banners/slots/${slot}`, {
    placeholderEnabled,
  });
}

/** Upload a banner image (base64) and return its public URL. */
export async function uploadBannerImage(
  data: string,
  mime: string
): Promise<string> {
  const res = await api.post<{ url: string }>("/banners/upload", { data, mime });
  return res.url.startsWith("/api/") ? new URL(res.url,new URL(getApiBase(),window.location.origin)).href : res.url;
}
