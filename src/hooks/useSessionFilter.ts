import { useEffect, useState } from "react";

/** Keep directory preferences across navigation within the current browser tab. */
export function useSessionFilter<T extends string | null>(key: string, fallback: T, allowed?: readonly T[]) {
  const storageKey = `matchiq-admin:filters:${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw === null) return fallback;
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "string" && parsed !== null) return fallback;
      if (allowed ? !allowed.includes(parsed as T) : typeof parsed !== "string") return fallback;
      return parsed as T;
    } catch { return fallback; }
  });
  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* Storage may be unavailable. */ }
  }, [storageKey, value]);
  return [value, setValue] as const;
}
