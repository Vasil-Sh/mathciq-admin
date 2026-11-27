import { useEffect, useRef, useState } from "react";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import PillTrack from "@/components/PillTrack";

const MONTHS = ["Січ", "Лют", "Бер", "Кві", "Тра", "Чер", "Лип", "Сер", "Вер", "Жов", "Лис", "Гру"];
const MONTHS_FULL = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
const PREV_GEN = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада"];
const key = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;

/**
 * Web period picker (design «Дашборд · веб — Вибір періоду»): white button «📅 Листопад 2026 ▾»;
 * the popover has «Місяць / Рік», the months of the year (the one before the chosen is lighter — the comparison),
 * «Порівнювати з попереднім місяцем», «Поточний місяць» and green «Показати».
 */
export default function PeriodPopover({ value, year, month, compare, onCompare, onChange }: {
  value: string; year: number; month: number; compare: boolean; onCompare: (v: boolean) => void; onChange: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"month" | "year">(value === "year" ? "year" : "month");
  const [draft, setDraft] = useState(value === "year" ? key(year, month) : value);
  const [cmp, setCmp] = useState(compare);
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    setMode(value === "year" ? "year" : "month"); setDraft(value === "year" ? key(year, month) : value); setCmp(compare);
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); ref.current?.querySelector<HTMLButtonElement>(".v3-dw-pbtn")?.focus(); } };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    window.setTimeout(() => popRef.current?.focus(), 0);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const label = value === "year" ? `${year} рік` : `${MONTHS_FULL[Number(value.slice(5, 7)) - 1]} ${value.slice(0, 4)}`;
  const dm = Number(draft.slice(5, 7));
  const hint = mode === "year"
    ? `Увесь ${year} рік — від січня до сьогодні.`
    : `Світліший — місяць для порівняння${dm > 1 ? ` (стрілки ±% до ${PREV_GEN[dm - 2]} в картках)` : ""}.${month < 12 ? ` ${MONTHS_FULL[month]} ще не настав.` : ""}`;
  const apply = (k: string, c = cmp) => { onChange(k); onCompare(c); setOpen(false); };
  return (
    <div className="v3-dw-period" ref={ref}>
      <button type="button" className="v3-dw-pbtn" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
        <CalendarDays size={15} aria-hidden="true" /><span><span className="sr-only">Період: </span>{label}</span>
        <ChevronDown size={14} aria-hidden="true" className={open ? "is-flipped" : undefined} />
      </button>
      {open && (
        <div ref={popRef} tabIndex={-1} className="v3-dw-pop" role="dialog" aria-label="Вибір періоду">
          <div className="v3-seg v3-dw-pseg" role="tablist" aria-label="Що показати">
            <PillTrack active={mode} />
            <button type="button" role="tab" aria-selected={mode === "month"} className={mode === "month" ? "is-on" : ""} onClick={() => setMode("month")}>Місяць</button>
            <button type="button" role="tab" aria-selected={mode === "year"} className={mode === "year" ? "is-on" : ""} onClick={() => setMode("year")}>Рік</button>
          </div>
          <div className="v3-dw-pyear"><button type="button" disabled aria-label="Попередній рік"><ChevronLeft size={16} aria-hidden="true" /></button><b>{year}</b><button type="button" disabled aria-label="Наступний рік"><ChevronRight size={16} aria-hidden="true" /></button></div>
          <div className={`v3-dw-pgrid${mode === "year" ? " is-year" : ""}`} role="group" aria-label={`Місяці ${year}`}>
            {MONTHS.map((m, i) => {
              const k = key(year, i + 1), future = i + 1 > month;
              const on = mode === "year" ? !future : draft === k;
              const prev = mode === "month" && cmp && i + 2 === dm;
              return <button key={k} type="button" disabled={future || mode === "year"} aria-pressed={on} className={`${on ? "is-on" : ""}${prev ? " is-prev" : ""}`} title={future ? "Ще не настав" : undefined} onClick={() => setDraft(k)}>{m}</button>;
            })}
          </div>
          <p className="v3-dw-phint">{hint}</p>
          {mode === "month" && <label className="v3-dw-pcmp"><input type="checkbox" checked={cmp} onChange={(e) => setCmp(e.target.checked)} /><span aria-hidden="true">{cmp && <Check size={12} strokeWidth={3.2} />}</span>Порівнювати з попереднім місяцем</label>}
          <div className="v3-dw-pacts">
            <button type="button" className="v3-dw-pgrey" onClick={() => apply(key(year, month))}>Поточний місяць</button>
            <button type="button" className="v3-dw-pgreen" onClick={() => apply(mode === "year" ? "year" : draft)}>Показати</button>
          </div>
        </div>
      )}
    </div>
  );
}
