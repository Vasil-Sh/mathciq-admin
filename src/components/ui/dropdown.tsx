import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, X } from "lucide-react";
import { isPhoneWidth } from "@/lib/pageSearch";

export interface DropdownOption<T extends string> { value: T; label: ReactNode; /** right-side note in the phone sheet, e.g. «225 ₴ · 2» */ hint?: ReactNode; }

interface Props<T extends string> {
  value: T;
  options: DropdownOption<T>[];
  onChange: (v: T) => void;
  ariaLabel: string;
  prefix?: ReactNode;
  className?: string;
  align?: "left" | "right";
  /** On the phone, open as a bottom sheet with this title (design «Сортування», «Місяць»). */
  sheet?: { title: string; note?: string };
}

/**
 * Select with a list that grows out of the field and folds back when closed
 * (catalog · Inputs · list and calendar): the chevron turns, options come in one after another.
 * Replaces the native <select>, whose system popup looks different on every phone.
 */
export function Dropdown<T extends string>({ value, options, onChange, ariaLabel, prefix, className = "", align = "left", sheet }: Props<T>) {
  const [state, setState] = useState<"closed" | "open" | "closing">("closed");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const cur = options.find((o) => o.value === value) || options[0];
  const open = state === "open";
  const [asSheet, setAsSheet] = useState(false);
  const close = (focus = true) => { setState((s) => (s === "open" ? "closing" : s)); window.setTimeout(() => setState((s) => (s === "closing" ? "closed" : s)), asSheet ? 240 : 170); if (focus) btn.current?.focus(); };
  const show = () => { setActive(Math.max(0, options.findIndex((o) => o.value === value))); setAsSheet(!!sheet && isPhoneWidth()); setState("open"); };
  useEffect(() => {
    if (!open || !asSheet) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open, asSheet]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open || asSheet) return;
    const off = (e: MouseEvent | TouchEvent) => { if (box.current && !box.current.contains(e.target as Node)) close(false); };
    document.addEventListener("mousedown", off); document.addEventListener("touchstart", off, { passive: true });
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("touchstart", off); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (v: T) => { onChange(v); close(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (!open) { if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); show(); } return; }
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(options.length - 1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(options[active].value); }
    else if (e.key === "Tab") close(false);
  };
  return (
    <div ref={box} className={`v3-dd ${className}${open ? " is-open" : ""}`}>
      <button ref={btn} type="button" className="v3-dd-btn" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-label={ariaLabel}
        aria-activedescendant={open ? `${listId}-${active}` : undefined} onClick={() => (open ? close() : show())} onKeyDown={onKey}>
        {prefix && <span className="v3-dd-pre">{prefix}</span>}<span className="v3-dd-val">{cur?.label}</span><ChevronDown size={14} strokeWidth={2.4} className="v3-dd-chev" aria-hidden="true" />
      </button>
      {state !== "closed" && asSheet && sheet && createPortal(
        <div className={`v3-pm-layer v3-dd-sheet${state === "closing" ? " is-closing" : ""}`}>
          <div className="v3-pm-scrim" aria-hidden="true" onClick={() => close()} />
          <ul id={listId} className="v3-pm-list" role="listbox" aria-label={ariaLabel}>
            <li aria-hidden="true" className="v3-pm-grab-row"><span className="v3-pm-grab" /></li>
            <li className="v3-pm-head"><div><strong>{sheet.title}</strong>{sheet.note && <span>{sheet.note}</span>}</div><button type="button" className="v3-pm-x" aria-label="Закрити" onClick={() => close()}><X size={16} aria-hidden="true" /></button></li>
            {options.map((o) => (
              <li key={o.value} role="option" aria-selected={o.value === value}>
                <button type="button" className={o.value === value ? "is-on" : ""} onClick={() => pick(o.value)}>
                  <span>{o.label}</span><span className="v3-dd-sheet-r">{o.hint}{o.value === value && <Check size={16} strokeWidth={2.6} aria-hidden="true" />}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>, document.body)}
      {state !== "closed" && !asSheet && (
        <ul id={listId} role="listbox" aria-label={ariaLabel} className={`v3-dd-list${state === "closing" ? " is-closing" : ""}${align === "right" ? " is-right" : ""}`}>
          {options.map((o, i) => (
            <li key={o.value} id={`${listId}-${i}`} role="option" aria-selected={o.value === value} className={`${o.value === value ? "is-on" : ""}${i === active ? " is-active" : ""}`}
              style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }} onMouseEnter={() => setActive(i)} onClick={() => pick(o.value)}>
              <span>{o.label}</span>{o.value === value && <Check size={15} strokeWidth={2.6} aria-hidden="true" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
