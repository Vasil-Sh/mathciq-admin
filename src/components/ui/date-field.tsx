import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

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
  required?: boolean;
  labelledBy?: string;
}

/**
 * Date field with a calendar that grows out of the field (catalog · Inputs · list and calendar):
 * the chevron turns, days come in one after another, the month slides the way of the arrow.
 */
export function DateField({ id, value, onChange, min, max, required, labelledBy }: Props) {
  const [open, setOpen] = useState(false);
  const base = value || min || new Date().toISOString().slice(0, 10);
  const [view, setView] = useState({ y: +base.slice(0, 4), m: +base.slice(5, 7) - 1 });
  const [dir, setDir] = useState(1);
  const [run, setRun] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) { const b = value || min || new Date().toISOString().slice(0, 10); setView({ y: +b.slice(0, 4), m: +b.slice(5, 7) - 1 }); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", off); document.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc, true); };
  }, [open]);
  const move = (d: number) => { setDir(d); setRun((r) => r + 1); setView((v) => { const m = v.m + d; return { y: v.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 }; }); };
  const first = (new Date(view.y, view.m, 1).getDay() + 6) % 7;
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const shown = value ? value.split("-").reverse().join(".") : "Оберіть дату";
  const anim = `${dir > 0 ? "is-r" : "is-l"}${run % 2 ? "2" : ""}`;
  return (
    <div className="v3-date" ref={box}>
      <button type="button" id={id} className={`v3-date-btn${open ? " is-on" : ""}`} aria-haspopup="dialog" aria-expanded={open} aria-labelledby={labelledBy} aria-required={required} onClick={() => setOpen(!open)}>
        <span>{shown}</span><ChevronDown size={14} strokeWidth={2.4} aria-hidden="true" />
      </button>
      {open && (
        <div className="v3-date-pop" role="dialog" aria-label="Вибір дати">
          <div className="v3-date-head">
            <button type="button" aria-label="Попередній місяць" onClick={() => move(-1)}><ChevronLeft size={14} /></button>
            <strong key={`h${run}`} className={`v3-date-m ${anim}`}>{MONTHS[view.m]} {view.y}</strong>
            <button type="button" aria-label="Наступний місяць" onClick={() => move(1)}><ChevronRight size={14} /></button>
          </div>
          <div className="v3-date-grid v3-date-wd" aria-hidden="true">{["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"].map((d) => <span key={d}>{d}</span>)}</div>
          <div key={`g${run}`} className={`v3-date-grid ${anim}`}>
            {Array.from({ length: first }, (_, i) => <span key={`b${i}`} />)}
            {Array.from({ length: days }, (_, k) => {
              const d = k + 1, v = iso(view.y, view.m, d), off = (!!min && v < min) || (!!max && v > max), on = v === value;
              return <button key={v} type="button" className={on ? "is-on" : ""} disabled={off} aria-pressed={on} aria-label={`${d} ${MONTHS_G[view.m]} ${view.y}`} style={{ animationDelay: `${Math.min(k, 20) * 10}ms` }} onClick={() => { onChange(v); setOpen(false); }}>{d}</button>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}
