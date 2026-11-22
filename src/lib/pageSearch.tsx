import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Phone header search (design 22.11): on a screen that filters its own list, the 🔍 in the header turns
 * the header into a search field with «Скасувати» instead of opening the quick-search palette.
 * A page opts in with `usePageSearch("Логін або Telegram")`; other pages keep the palette.
 */
type Ctx = {
  placeholder: string | null;
  setPlaceholder: (p: string | null) => void;
  q: string;
  setQ: (q: string) => void;
  open: boolean;
  setOpen: (o: boolean) => void;
};

const PageSearchContext = createContext<Ctx | null>(null);

export function PageSearchProvider({ children }: { children: ReactNode }) {
  const [placeholder, setPlaceholder] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ placeholder, setPlaceholder, q, setQ, open, setOpen }), [placeholder, q, open]);
  return <PageSearchContext.Provider value={value}>{children}</PageSearchContext.Provider>;
}

/** For the header: is there a page search right now, and its state. */
export const usePageSearchHost = () => useContext(PageSearchContext);

/** For a page: registers the header search while the page is shown; returns the query typed in the header. */
export function usePageSearch(placeholder: string) {
  const ctx = useContext(PageSearchContext);
  const setPlaceholder = ctx?.setPlaceholder, setQ = ctx?.setQ, setOpen = ctx?.setOpen;
  useEffect(() => {
    if (!setPlaceholder) return;
    setPlaceholder(placeholder);
    return () => { setPlaceholder(null); setQ?.(""); setOpen?.(false); };
  }, [placeholder, setPlaceholder, setQ, setOpen]);
  return { q: ctx?.q ?? "", setQ: ctx?.setQ ?? (() => {}), open: ctx?.open ?? false, setOpen: ctx?.setOpen ?? (() => {}) };
}

export const isPhoneWidth = () => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
