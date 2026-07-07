import { format, parse, isValid } from "date-fns";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";

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

export function DatePicker({ value, onChange }: DatePickerProps) {
  const selected = parseDateInput(value);

  return (
    <div className="rounded-xl border border-hairline bg-surface p-3">
      <DayPicker
        mode="single"
        selected={selected}
        onSelect={(date) => {
          if (date) onChange(format(date, "dd/MM/yyyy"));
        }}
        showOutsideDays
        defaultMonth={selected || new Date()}
      />
    </div>
  );
}
