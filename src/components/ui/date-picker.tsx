import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function parseDateInput(val: string): Date | undefined {
  if (!val) return undefined;
  const dm = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dm) { const d = new Date(+dm[3], +dm[2] - 1, +dm[1]); return isValid(d) ? d : undefined; }
  const d = new Date(val);
  return isValid(d) ? d : undefined;
}

export function DatePicker({ value, onChange, placeholder }: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const selected = parseDateInput(value);

  React.useEffect(() => {
    function handleClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)} className={cn(
        "w-full flex items-center h-10 rounded-input border border-hairline bg-surface px-3 py-2 text-sm transition-colors",
        "hover:border-hairline-hover focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none",
        value ? "text-ink" : "text-subtle"
      )}>
        <CalendarIcon className="mr-2 h-4 w-4 text-muted" />
        {value || placeholder || "Оберіть дату"}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 rounded-card border border-hairline bg-surface p-3 shadow-lg">
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={(date) => { if (date) onChange(format(date, "dd/MM/yyyy")); setOpen(false); }}
            disabled={{ before: new Date("2020-01-01") }}
            classNames={{
              months: "flex flex-col", month: "space-y-2",
              caption: "flex justify-center pt-1 relative items-center text-ink",
              caption_label: "text-sm font-medium",
              nav_button: "h-7 w-7 bg-surface border border-hairline rounded-btn flex items-center justify-center text-muted hover:text-ink",
              table: "w-full border-collapse space-y-1", head_row: "flex",
              head_cell: "text-muted rounded-btn w-8 font-normal text-[0.7rem] uppercase",
              row: "flex w-full mt-1",
              cell: "text-center text-sm p-0 relative [&:has([aria-selected])]:bg-primary/10 rounded-btn",
              day: "h-8 w-8 p-0 font-normal text-body hover:text-ink hover:bg-surface-subtle rounded-btn aria-selected:opacity-100 aria-selected:text-white aria-selected:bg-primary",
              day_today: "text-ink font-semibold",
              day_outside: "text-subtle", day_disabled: "text-subtle/40",
            }}
          />
        </div>
      )}
    </div>
  );
}
