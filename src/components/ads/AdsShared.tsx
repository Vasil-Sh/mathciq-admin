import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ctr, nf, pctChange, type AdStats } from "@/lib/adsModel";

export function AdsSums({ stats, active, attention }: { stats: AdStats | null; active: { banners: number; telegram: number; bookmakers: number }; attention: { n: number; note: string } }) {
  const t = stats?.totals, p = stats?.previous;
  const ch = t && p ? pctChange(t.impressions, p.impressions) : null;
  const total = active.banners + active.telegram + active.bookmakers;
  return (
    <section className="v3-ad-sums" aria-label="Підсумки реклами">
      <div className="v3-ad-sum is-blue"><div className="l">Покази за 7 днів</div><div className="v">{t ? nf(t.impressions) : "—"}</div><div className="n">{!t ? "статистика недоступна" : ch === null ? "попередній тиждень без даних" : `${ch > 0 ? "+" : ""}${ch}% до попереднього тижня`}</div></div>
      <div className="v3-ad-sum"><div className="l">Кліки</div><div className="v">{t ? nf(t.clicks) : "—"}</div><div className="n">CTR {t ? ctr(t.clicks, t.impressions) : "—"}</div></div>
      <div className="v3-ad-sum"><div className="l">Активні розміщення</div><div className="v">{total}</div><div className="n">банери {active.banners} · Telegram {active.telegram} · букмекери {active.bookmakers}</div></div>
      <div className="v3-ad-sum"><div className="l">Потребують уваги</div><div className={`v${attention.n ? " is-warn" : ""}`}>{attention.n}</div><div className="n">{attention.note || "усе гаразд"}</div></div>
    </section>
  );
}

export const AdLabel = () => <span className="v3-ad-label">Реклама · 21+</span>;
export const LockedLabel = () => (
  <div className="v3-ad-locked"><span className="v3-ad-locked-sw" aria-hidden="true" /><Lock size={13} aria-hidden="true" /> Мітка «Реклама · 21+» — завжди увімкнена</div>
);

/** Editor: a white modal like «Новий банер» — centred on wide screens, a bottom sheet on narrow ones. */
export function EditorPanel({ wide, open, title, sub, onClose, children }: { wide: boolean; open: boolean; title: string; sub?: string; onClose: () => void; children: ReactNode; paneKey?: string }) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={`v3-modal v3-ad-sheet${wide ? " is-wide" : ""}`}>
        <DialogTitle className="v3-modal-title">{title}</DialogTitle>
        <DialogDescription className="v3-modal-sub">{sub || "Зміни зберігаються кнопкою внизу"}</DialogDescription>
        <div className="v3-ad-aside is-sheet">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

export function Highlighted({ text, hits }: { text: string; hits: { from: number; to: number }[] }) {
  if (!hits.length) return <>{text}</>;
  const out: ReactNode[] = []; let i = 0;
  hits.forEach((h, k) => { if (h.from > i) out.push(text.slice(i, h.from)); out.push(<mark key={k}>{text.slice(h.from, h.to)}</mark>); i = h.to; });
  out.push(text.slice(i));
  return <>{out}</>;
}

/** «Вимкнути» asks inside the button first («Точно вимкнути?»), the second press does it. Turning on needs no ask. */
export function AskToggle({ active, disabled, onToggle, resetKey }: { active: boolean; disabled?: boolean; onToggle: () => Promise<void> | void; resetKey?: string }) {
  const [st, setSt] = useState<"" | "ask" | "busy">("");
  const t = useRef<number | undefined>(undefined);
  useEffect(() => { setSt(""); window.clearTimeout(t.current); }, [resetKey, active]);
  useEffect(() => () => window.clearTimeout(t.current), []);
  async function click() {
    if (active && st === "") { setSt("ask"); t.current = window.setTimeout(() => setSt((v) => (v === "ask" ? "" : v)), 3000); return; }
    window.clearTimeout(t.current); setSt("busy");
    try { await onToggle(); } finally { setSt(""); }
  }
  return (
    <button type="button" className={`v3-btn v3-btn-ghost-dark${active ? " v3-pay-cx" : ""}${st === "ask" ? " is-ask" : ""}${st === "busy" ? " is-busy" : ""}`} disabled={disabled || st === "busy"} onClick={click}>
      {st === "ask" ? "Точно вимкнути?" : st === "busy" ? (active ? "Вимикаємо…" : "Вмикаємо…") : active ? "Вимкнути" : "Увімкнути"}
    </button>
  );
}

/** Save: spinner while the request runs, then a ✓ for a moment. */
export function SaveButton({ saving, disabled, onClick, label = "Зберегти", className = "v3-btn-primary" }: { saving: boolean; disabled?: boolean; onClick: () => void; label?: string; className?: string }) {
  const [ok, setOk] = useState(false);
  const was = useRef(saving);
  useEffect(() => {
    if (was.current && !saving) { setOk(true); const id = window.setTimeout(() => setOk(false), 1400); was.current = saving; return () => window.clearTimeout(id); }
    was.current = saving;
  }, [saving]);
  return (
    <button type="button" className={`v3-btn ${className}${saving ? " is-busy" : ""}${ok ? " is-done" : ""}`} disabled={disabled || saving} onClick={onClick} aria-live="polite">
      {saving ? "Зберігаємо…" : ok ? <><Check size={15} strokeWidth={3} aria-hidden="true" />Збережено</> : label}
    </button>
  );
}
