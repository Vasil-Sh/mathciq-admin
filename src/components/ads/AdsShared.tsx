import type { ReactNode } from "react";
import { Lock } from "lucide-react";
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

/** Editor: a side panel on wide screens, a bottom sheet on narrow ones. */
export function EditorPanel({ wide, open, title, sub, onClose, children }: { wide: boolean; open: boolean; title: string; sub?: string; onClose: () => void; children: ReactNode }) {
  if (wide) return open ? <aside className="v3-dcard v3-ad-aside" aria-label={title}><div className="v3-ad-aside-h"><strong>{title}</strong>{sub && <span>{sub}</span>}</div>{children}</aside> : null;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="v3-modal v3-ad-sheet">
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
