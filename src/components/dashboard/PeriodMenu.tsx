import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Check, ChevronDown } from "lucide-react";

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
          <ul ref={listRef} className="v3-pm-list" role="listbox" aria-label="Період">
            <li aria-hidden="true"><span className="v3-pm-grab" /></li>
            <li aria-hidden="true" className="v3-pm-head"><strong>Період</strong><span>за який показати дашборд</span></li>
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
