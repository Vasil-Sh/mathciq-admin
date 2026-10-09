import { api } from "./apiClient";
import type { Banner, BannerInput } from "@/types";

export async function fetchBanners(): Promise<Banner[]> {
  const data = await api.get<{ banners: Banner[] }>("/banners");
  return data.banners || [];
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

/** Upload a banner image (base64) and return its public URL. */
export async function uploadBannerImage(
  data: string,
  mime: string
): Promise<string> {
  const res = await api.post<{ url: string }>("/banners/upload", { data, mime });
  return res.url;
}
