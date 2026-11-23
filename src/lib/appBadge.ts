import { useEffect, useState } from "react";

/**
 * The number on the home-screen icon (Badging API) — the same alerts the app shows:
 * open support tickets, unseen audit entries, subscriptions ending soon, a broken match source.
 * iPhone (iOS 16.4+, added to the Home Screen) shows it only after notifications are allowed for the app;
 * Android / desktop Chrome show it right away.
 */
type Nav = Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
const nav = () => (typeof navigator === "undefined" ? null : (navigator as Nav));

export const badgeSupported = () => !!nav()?.setAppBadge;
export const isStandalone = () =>
  typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

export function setIconBadge(n: number): void {
  const x = nav();
  if (!x?.setAppBadge) return;
  (n > 0 ? x.setAppBadge(n) : x.clearAppBadge?.() ?? x.setAppBadge(0)).catch(() => { /* not allowed (no permission) — nothing to do */ });
}

export type BadgePerm = "unsupported" | "granted" | "denied" | "default";
export function badgePermission(): BadgePerm {
  if (!badgeSupported()) return "unsupported";
  if (typeof Notification === "undefined") return "granted"; // no permission model (desktop/Android)
  return Notification.permission as BadgePerm;
}
/** Ask from a tap (iOS requires a user gesture). */
export async function askBadgePermission(): Promise<BadgePerm> {
  if (typeof Notification === "undefined" || !badgeSupported()) return badgePermission();
  try { await Notification.requestPermission(); } catch { /* old Safari: callback form */ }
  window.dispatchEvent(new Event("app-badge-perm"));
  return badgePermission();
}
export function useBadgePermission(): BadgePerm {
  const [p, setP] = useState<BadgePerm>(badgePermission);
  useEffect(() => { const on = () => setP(badgePermission()); window.addEventListener("app-badge-perm", on); window.addEventListener("focus", on); return () => { window.removeEventListener("app-badge-perm", on); window.removeEventListener("focus", on); }; }, []);
  return p;
}
