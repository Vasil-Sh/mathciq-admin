import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface PeriodOption { key: string; label: string }

/** Mobile period picker — a pill button with a popover list (design «Період · Жовтень 2026 ▾»). */
export default function PeriodMenu({ value, options, onChange }: { value: string; options: PeriodOption[]; onChange: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.key === value) || options[0];
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("touchstart", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className="v3-period-menu" ref={ref}>
      <button type="button" className="v3-period-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span><span className="v3-dim">Період</span> · {current?.label}</span>
        <ChevronDown size={14} aria-hidden="true" className={open ? "is-flipped" : undefined} />
      </button>
      {open && (
        <ul className="v3-period-list" role="listbox" aria-label="Період">
          {options.map((o) => (
            <li key={o.key}>
              <button type="button" role="option" aria-selected={o.key === value} className={o.key === value ? "is-on" : undefined} onClick={() => { onChange(o.key); setOpen(false); }}>
                {o.label}{o.key === value && <Check size={15} aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
