import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function parseDateInput(val: string): Date | undefined {
  if (!val) return undefined;
  // DD/MM/YYYY
  const dm = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dm) {
    const d = new Date(+dm[3], +dm[2] - 1, +dm[1]);
    return isValid(d) ? d : undefined;
  }
  // YYYY-MM-DD
  const d = new Date(val);
  return isValid(d) ? d : undefined;
}

export function DatePicker({ value, onChange, placeholder }: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const selected = parseDateInput(value);

  // Close on click outside
  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full justify-start text-left font-normal h-10 rounded-[6px]",
          !value && "text-steel"
        )}
      >
        <CalendarIcon className="mr-2 h-4 w-4" />
        {value || placeholder || "Оберіть дату"}
      </Button>
      {open && (
        <div className="absolute z-50 mt-1 rounded-card border border-graphite bg-carbon p-3 shadow-lg">
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={(date) => {
              if (date) {
                onChange(format(date, "dd/MM/yyyy"));
              }
              setOpen(false);
            }}
            disabled={{ before: new Date("2020-01-01") }}
            classNames={{
              months: "flex flex-col",
              month: "space-y-2",
              caption: "flex justify-center pt-1 relative items-center text-ghost",
              caption_label: "text-sm font-medium",
              nav: "space-x-1 flex items-center",
              nav_button: "h-7 w-7 bg-carbon border border-graphite rounded-[6px] flex items-center justify-center text-ash hover:text-ghost",
              table: "w-full border-collapse space-y-1",
              head_row: "flex",
              head_cell: "text-steel rounded-[6px] w-8 font-normal text-[0.7rem] uppercase",
              row: "flex w-full mt-1",
              cell: "text-center text-sm p-0 relative [&:has([aria-selected])]:bg-lavender/10 rounded-[6px]",
              day: "h-8 w-8 p-0 font-normal text-ash hover:text-ghost hover:bg-carbon rounded-[6px] aria-selected:opacity-100 aria-selected:text-ghost aria-selected:bg-lavender",
              day_today: "text-ghost font-medium",
              day_outside: "text-graphite",
              day_disabled: "text-graphite/40",
            }}
          />
        </div>
      )}
    </div>
  );
}
