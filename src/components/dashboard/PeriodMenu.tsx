import { useEffect, useRef, useState } from "react";
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
  // drag the sheet down by its handle or title (or anywhere when the list is scrolled to the top) to close it
  const drag = useRef<{ y0: number; dy: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const list = listRef.current;
    if (!list) return;
    const onHead = !!(e.target as HTMLElement).closest(".v3-pm-grab-row, .v3-pm-head");
    if (!onHead && list.scrollTop > 0) return;
    drag.current = { y0: e.touches[0].clientY, dy: 0 };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const d = drag.current, list = listRef.current;
    if (!d || !list) return;
    d.dy = Math.max(0, e.touches[0].clientY - d.y0);
    list.style.transition = "none";
    list.style.transform = d.dy ? `translateY(${d.dy}px)` : "";
  };
  const onTouchEnd = () => {
    const d = drag.current, list = listRef.current;
    drag.current = null;
    if (!d || !list) return;
    list.style.transition = "transform .2s ease-out";
    if (d.dy > 90) { list.style.transform = "translateY(100%)"; window.setTimeout(() => setOpen(false), 180); }
    else list.style.transform = "";
  };
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => { const t = e.target as Node; if (!ref.current?.contains(t) && !listRef.current?.contains(t)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("touchstart", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className="v3-period-menu" ref={ref}>
      <button type="button" className="v3-period-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <CalendarDays size={15} aria-hidden="true" className="v3-pm-cal" />
        <span><span className="sr-only">Період: </span>{current ? shortPeriod(current.key, current.label) : ""}</span>
        <ChevronDown size={14} aria-hidden="true" className={open ? "is-flipped" : undefined} />
      </button>
      {/* The sheet lives in <body>: inside the page it would sit under the tab bar (the page has its own stacking context). */}
      {open && createPortal(
        <div className="v3-pm-layer">
          <div className="v3-pm-scrim" aria-hidden="true" onClick={() => setOpen(false)} />
          <ul ref={listRef} className="v3-pm-list" role="listbox" aria-label="Період" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
            <li aria-hidden="true" className="v3-pm-grab-row"><span className="v3-pm-grab" /></li>
            <li className="v3-pm-head"><div><strong>Період</strong><span>за який показати дашборд</span></div><button type="button" className="v3-pm-x" aria-label="Закрити" onClick={() => setOpen(false)}><X size={16} aria-hidden="true" /></button></li>
            {options.map((o) => (
              <li key={o.key}>
                <button type="button" role="option" aria-selected={o.key === value} className={o.key === value ? "is-on" : undefined} onClick={() => { onChange(o.key); setOpen(false); }}>
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
