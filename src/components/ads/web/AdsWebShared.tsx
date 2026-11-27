import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal, Trash2, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/** Status tag in the light web style: green / blue / amber / red / grey. */
export const TAG_CLS: Record<string, string> = { "is-live": "is-green", "is-sched": "is-blue", "is-done": "is-amber", "is-off": "is-grey", "is-red": "is-red" };
export const WTag = ({ cls, label }: { cls: string; label: string }) => <span className={`v3-uwt ${TAG_CLS[cls] || cls}`}>{label}</span>;

export const AdMark = () => <span className="v3-adw-mark">Реклама · 21+</span>;

/** Green switch with a label (role=switch, the whole row is clickable). */
export function WSwitch({ on, label, disabled, onChange }: { on: boolean; label: string; disabled?: boolean; onChange: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="v3-adw-sw" disabled={disabled} onClick={onChange}>
      <span className={`v3-pswitch${on ? " is-on" : ""}`} aria-hidden="true"><span /></span>{label}
    </button>
  );
}

export type MenuItem = { label: string; icon?: ReactNode; red?: boolean; disabled?: boolean; run: () => void };
/** «⋯» button with a small menu under it. */
export function Kebab({ items, label }: { items: MenuItem[]; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  // close on any click outside (a fixed scrim does not cover the page inside an animated card)
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <span ref={ref} className="v3-adw-keb" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="v3-adw-kebb" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}><MoreHorizontal size={16} aria-hidden="true" /></button>
      {open && <>
        <span className="v3-adw-menu" role="menu" onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
          {items.map((it) => <button key={it.label} type="button" role="menuitem" autoFocus={it === items[0]} disabled={it.disabled} className={it.red ? "is-red" : ""} onClick={() => { setOpen(false); it.run(); }}>{it.icon}{it.label}</button>)}
        </span>
      </>}
    </span>
  );
}

/** Light modal shell: title, subtitle, × in the corner; footer is passed by the caller. */
export function WModal({ open, onClose, title, sub, className = "", width = 520, children, head }: { open: boolean; onClose: () => void; title: ReactNode; sub?: ReactNode; className?: string; width?: number; children: ReactNode; head?: ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={`v3-modal v3-uwm v3-adwm ${className}`} style={{ maxWidth: width }} onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="v3-adwm-h">
          {head}
          <div><DialogTitle className="v3-modal-title">{title}</DialogTitle>{sub ? <DialogDescription className="v3-modal-sub">{sub}</DialogDescription> : <DialogDescription className="sr-only">{typeof title === "string" ? title : ""}</DialogDescription>}</div>
          <button type="button" className="v3-adwm-x" aria-label="Закрити" onClick={onClose}><X size={16} aria-hidden="true" /></button>
        </div>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** «Видалити …?»: red bin, text, red «Видалити назавжди», optional grey alternative, «Скасувати». */
export function DeleteAsk({ open, title, text, busy, onDelete, onClose, alt }: { open: boolean; title: string; text: ReactNode; busy: boolean; onDelete: () => void; onClose: () => void; alt?: { label: string; run: () => void } }) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="v3-modal v3-uwm v3-uwm-del v3-adw-del" style={{ maxWidth: 380 }} onOpenAutoFocus={(e) => e.preventDefault()}>
        <span className="v3-uwm-ico is-red" aria-hidden="true"><Trash2 size={18} /></span>
        <DialogTitle className="v3-modal-title">{title}</DialogTitle>
        <DialogDescription className="v3-modal-sub">{text}</DialogDescription>
        <button type="button" className="v3-uwb is-red" disabled={busy} onClick={onDelete}>{busy ? "Видаляємо…" : "Видалити назавжди"}</button>
        {alt ? <><button type="button" className="v3-uwb" disabled={busy} onClick={alt.run}>{alt.label}</button><button type="button" className="v3-uwb is-text" disabled={busy} onClick={onClose}>Скасувати</button></>
          : <button type="button" className="v3-uwb" disabled={busy} onClick={onClose}>Скасувати</button>}
      </DialogContent>
    </Dialog>
  );
}

/** Empty card with an icon, title, text and an optional green button. */
export function WEmpty({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="v3-adw-card v3-adw-empty">
      <span aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      <p>{text}</p>
      {action}
    </div>
  );
}

/** «Кліки · 7 дн.» etc.: plural for a count. */
export const pl = (n: number, a: string, b: string, c: string) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; };
