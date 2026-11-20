import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from "lucide-react";

const MONTHS = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
const MONTHS_G = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

interface Props {
  id: string;
  value: string; // YYYY-MM-DD
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  /** Month to show when the field is empty (e.g. 21 years ago for a birth date). */
  defaultView?: string;
  /** Extra «« »» buttons that jump a whole year (birth dates). */
  yearNav?: boolean;
  required?: boolean;
  labelledBy?: string;
}

/**
 * Date field with a calendar that grows out of the field (catalog · Inputs · list and calendar):
 * the chevron turns, days come in one after another, the month slides the way of the arrow.
 * On a phone the calendar opens as a centred window over a dimmed page (catalog · Screens · modal windows),
 * so it never hangs off the edge of a narrow field.
 */
export function DateField({ id, value, onChange, min, max, required, labelledBy, defaultView, yearNav }: Props) {
  const [open, setOpen] = useState(false);
  const base = value || defaultView || min || new Date().toISOString().slice(0, 10);
  const [view, setView] = useState({ y: +base.slice(0, 4), m: +base.slice(5, 7) - 1 });
  const [dir, setDir] = useState(1);
  const [run, setRun] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [asWin, setAsWin] = useState(false);
  const [closing, setClosing] = useState(false);
  const close = () => { if (!asWin) { setOpen(false); return; } setClosing(true); window.setTimeout(() => { setClosing(false); setOpen(false); }, 180); };
  const toggle = () => { if (open) { close(); return; } setAsWin(window.matchMedia("(max-width: 720px)").matches); setOpen(true); };
  useEffect(() => { if (open) { const b = value || defaultView || min || new Date().toISOString().slice(0, 10); setView({ y: +b.slice(0, 4), m: +b.slice(5, 7) - 1 }); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { const t = e.target as Node; if (box.current?.contains(t) || pop.current?.contains(t)) return; if (!asWin) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("mousedown", off); document.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc, true); };
  }, [open, asWin]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open && asWin) { const o = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = o; }; } }, [open, asWin]);
  const move = (d: number) => { setDir(d); setRun((r) => r + 1); setView((v) => { const m = v.m + d; return { y: v.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 }; }); };
  const first = (new Date(view.y, view.m, 1).getDay() + 6) % 7;
  const days = new Date(view.y, view.m + 1, 0).getDate();
  // today by Kyiv time — ringed in the grid so «what day is it» is visible at once
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv" }).format(new Date());
  const shown = value ? value.split("-").reverse().join(".") : "Оберіть дату";
  const anim = `${dir > 0 ? "is-r" : "is-l"}${run % 2 ? "2" : ""}`;
  const cal = (win: boolean) => (
    <div ref={pop} className={`v3-date-pop${win ? " is-win" : ""}${win && closing ? " is-closing" : ""}`} role="dialog" aria-modal={win || undefined} aria-label="Вибір дати">
      <div className={`v3-date-head${yearNav ? " has-years" : ""}`}>
        {yearNav && <button type="button" aria-label="Попередній рік" onClick={() => move(-12)}><ChevronsLeft size={win ? 16 : 14} /></button>}
        <button type="button" aria-label="Попередній місяць" onClick={() => move(-1)}><ChevronLeft size={win ? 16 : 14} /></button>
        <strong key={`h${run}`} className={`v3-date-m ${anim}`}>{MONTHS[view.m]} {view.y}</strong>
        <button type="button" aria-label="Наступний місяць" onClick={() => move(1)}><ChevronRight size={win ? 16 : 14} /></button>
        {yearNav && <button type="button" aria-label="Наступний рік" onClick={() => move(12)}><ChevronsRight size={win ? 16 : 14} /></button>}
        {win && <button type="button" className="v3-date-x" aria-label="Закрити" onClick={close}><X size={16} /></button>}
      </div>
      <div className="v3-date-grid v3-date-wd" aria-hidden="true">{["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"].map((d) => <span key={d}>{d}</span>)}</div>
      <div key={`g${run}`} className={`v3-date-grid ${anim}`}>
        {Array.from({ length: first }, (_, i) => <span key={`b${i}`} />)}
        {Array.from({ length: days }, (_, k) => {
          const d = k + 1, v = iso(view.y, view.m, d), off = (!!min && v < min) || (!!max && v > max), on = v === value, now = v === todayIso;
          return <button key={v} type="button" className={`${on ? "is-on" : ""}${now ? " is-today" : ""}`} aria-current={now ? "date" : undefined} disabled={off} aria-pressed={on} aria-label={`${d} ${MONTHS_G[view.m]} ${view.y}`} style={{ animationDelay: `${Math.min(k, 20) * 10}ms` }} onClick={() => { onChange(v); close(); }}>{d}</button>;
        })}
      </div>
      {win && value && <button type="button" className="v3-date-clear" onClick={() => { onChange(""); close(); }}>Очистити дату</button>}
    </div>
  );
  return (
    <div className="v3-date" ref={box}>
      <button type="button" id={id} className={`v3-date-btn${open ? " is-on" : ""}`} aria-haspopup="dialog" aria-expanded={open} aria-labelledby={labelledBy} aria-required={required} onClick={toggle}>
        <span>{shown}</span><ChevronDown size={14} strokeWidth={2.4} aria-hidden="true" />
      </button>
      {open && (asWin
        ? createPortal(<div className={`v3-date-scrim${closing ? " is-closing" : ""}`} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>{cal(true)}</div>, (box.current?.closest("[role=\"dialog\"]") as HTMLElement | null) || document.body)
        : cal(false))}
    </div>
  );
}
