import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Check, ChevronDown, X } from "lucide-react";

export interface PeriodOption { key: string; label: string }

const SHORT = ["Січ.", "Лют.", "Бер.", "Квіт.", "Трав.", "Черв.", "Лип.", "Серп.", "Вер.", "Жовт.", "Лист.", "Груд."];
/** «2026-11» → «Лист. 2026», «year» → «Рік» — compact label for the phone header. */
export const shortPeriod = (key: string, label: string) => (/^\d{4}-\d{2}$/.test(key) ? `${SHORT[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}` : label);

/** Phone period picker (design 22.11): compact white button «📅 Лист. 2026 ▾» in the title row; the list opens as a bottom sheet. */
export default function PeriodMenu({ value, options, onChange }: { value: string; options: PeriodOption[]; onChange: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const current = options.find((o) => o.key === value) || options[0];
  const layerRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  /** Slide the sheet down and fade the scrim, then unmount — every way of closing goes through here. */
  const dismiss = useCallback(() => {
    const list = listRef.current, layer = layerRef.current;
    if (!list || !layer || closing.current) { setOpen(false); return; }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setOpen(false); return; }
    closing.current = true;
    list.style.transition = "transform .24s cubic-bezier(.4, 0, 1, 1)";
    list.style.transform = "translateY(100%)";
    layer.classList.add("is-closing");
    window.setTimeout(() => { closing.current = false; setOpen(false); }, 230);
  }, []);
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const close = (e: MouseEvent | TouchEvent) => { const t = e.target as Node; if (!ref.current?.contains(t) && !list?.contains(t)) dismiss(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss(); };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    document.addEventListener("keydown", esc);
    // drag the sheet down by its handle or title (or anywhere when the list is at the top) to close it;
    // native listeners so the move can be cancelled — otherwise iPhone scrolls or selects text behind
    let drag: { y0: number; dy: number; head: boolean } | null = null;
    // the sheet's touches stay in the sheet: the page behind has pull-to-refresh
    const start = (e: TouchEvent) => {
      e.stopPropagation();
      if (!list || closing.current) return;
      const head = !!(e.target as HTMLElement).closest(".v3-pm-grab-row, .v3-pm-head");
      if (!head && list.scrollTop > 0) return;
      drag = { y0: e.touches[0].clientY, dy: 0, head };
    };
    const move = (e: TouchEvent) => {
      e.stopPropagation();
      if (!drag || !list) return;
      const dy = e.touches[0].clientY - drag.y0;
      if (!drag.head && dy < 0 && drag.dy === 0) { drag = null; return; } // scrolling the list up
      drag.dy = Math.max(0, dy);
      if (e.cancelable) e.preventDefault();
      list.style.transition = "none";
      list.style.transform = drag.dy ? `translateY(${drag.dy}px)` : "";
    };
    const end = (e: TouchEvent) => {
      e.stopPropagation();
      const d = drag; drag = null;
      if (!d || !list || !d.dy) return;
      if (d.dy > 90) dismiss();
      else { list.style.transition = "transform .2s ease-out"; list.style.transform = ""; }
    };
    list?.addEventListener("touchstart", start, { passive: true });
    list?.addEventListener("touchmove", move, { passive: false });
    list?.addEventListener("touchend", end);
    list?.addEventListener("touchcancel", end);
    return () => {
      document.removeEventListener("mousedown", close); document.removeEventListener("touchstart", close); document.removeEventListener("keydown", esc);
      list?.removeEventListener("touchstart", start); list?.removeEventListener("touchmove", move); list?.removeEventListener("touchend", end); list?.removeEventListener("touchcancel", end);
    };
  }, [open, dismiss]);
  return (
    <div className="v3-period-menu" ref={ref}>
      <button type="button" className="v3-period-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => (open ? dismiss() : setOpen(true))}>
        <CalendarDays size={15} aria-hidden="true" className="v3-pm-cal" />
        <span><span className="sr-only">Період: </span>{current ? shortPeriod(current.key, current.label) : ""}</span>
        <ChevronDown size={14} aria-hidden="true" className={open ? "is-flipped" : undefined} />
      </button>
      {/* The sheet lives in <body>: inside the page it would sit under the tab bar (the page has its own stacking context). */}
      {open && createPortal(
        <div className="v3-pm-layer" ref={layerRef}>
          <div className="v3-pm-scrim" aria-hidden="true" onClick={dismiss} />
          <ul ref={listRef} className="v3-pm-list" role="listbox" aria-label="Період">
            <li aria-hidden="true" className="v3-pm-grab-row"><span className="v3-pm-grab" /></li>
            <li className="v3-pm-head"><div><strong>Період</strong><span>за який показати дашборд</span></div><button type="button" className="v3-pm-x" aria-label="Закрити" onClick={dismiss}><X size={16} aria-hidden="true" /></button></li>
            {options.map((o) => (
              <li key={o.key}>
                <button type="button" role="option" aria-selected={o.key === value} className={o.key === value ? "is-on" : undefined} onClick={() => { onChange(o.key); dismiss(); }}>
                  {o.label}{o.key === value && <Check size={15} aria-hidden="true" />}
                </button>
              </li>
            ))}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  );
}
