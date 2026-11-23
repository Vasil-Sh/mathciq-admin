import { useEffect, useState } from "react";
import { CircleDollarSign, CreditCard, Gamepad2, History, LayoutDashboard, LifeBuoy, Megaphone, Settings2, Users } from "lucide-react";

/** Sections that can sit in the phone tab bar next to «Меню». */
export const TAB_OPTIONS = [
  { key: "dashboard", to: "/dashboard", label: "Дашборд", icon: LayoutDashboard },
  { key: "users", to: "/users", label: "Користувачі", icon: Users },
  { key: "payments", to: "/payments", label: "Оплати", icon: CreditCard },
  { key: "matches", to: "/matches", label: "Матчі", icon: Gamepad2 },
  { key: "bets", to: "/bets", label: "Ставки", icon: CircleDollarSign },
  { key: "ads", to: "/banners", label: "Реклама", icon: Megaphone },
  { key: "support", to: "/support", label: "Підтримка", icon: LifeBuoy },
  { key: "audit", to: "/audit", label: "Журнал", icon: History },
  { key: "settings", to: "/settings", label: "Налаштування", icon: Settings2 },
] as const;
export type TabKey = (typeof TAB_OPTIONS)[number]["key"];
export const TAB_SLOTS = 4;
export const DEFAULT_TABS: TabKey[] = ["dashboard", "users", "payments", "matches"];

const KEY = "tabbarItems";
const EVT = "tabbar-change";

export function readTabs(): TabKey[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (Array.isArray(raw)) {
      const ok = raw.filter((k): k is TabKey => TAB_OPTIONS.some((o) => o.key === k));
      if (ok.length === TAB_SLOTS && new Set(ok).size === TAB_SLOTS) return ok;
    }
  } catch { /* fall back to defaults */ }
  return DEFAULT_TABS;
}

export function saveTabs(tabs: TabKey[]) {
  try { localStorage.setItem(KEY, JSON.stringify(tabs)); } catch { /* private mode: still update this tab */ }
  window.dispatchEvent(new Event(EVT));
}

/** The chosen tabs; follows changes made on the «Навігація» settings screen. */
export function useTabs(): TabKey[] {
  const [tabs, setTabs] = useState<TabKey[]>(readTabs);
  useEffect(() => {
    const on = () => setTabs(readTabs());
    window.addEventListener(EVT, on);
    window.addEventListener("storage", on);
    return () => { window.removeEventListener(EVT, on); window.removeEventListener("storage", on); };
  }, []);
  return tabs;
}
