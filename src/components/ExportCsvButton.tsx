import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

/**
 * «Експорт CSV» from the animation catalog (Buttons 05): on hover the arrow dips and the tray widens;
 * on click the arrow drops into the tray, then a tick shows for a moment.
 */
export default function ExportCsvButton({ onClick, className = "", disabled, title, label = "Експорт CSV", iconOnly = false, size = 15 }: {
  onClick: () => void; className?: string; disabled?: boolean; title?: string; label?: string; iconOnly?: boolean; size?: number;
}) {
  const [ph, setPh] = useState<"idle" | "drop" | "done">("idle");
  const t = useRef<number[]>([]);
  useEffect(() => () => t.current.forEach(clearTimeout), []);
  const run = () => {
    if (disabled || ph !== "idle") return;
    onClick();
    setPh("drop");
    t.current.push(window.setTimeout(() => setPh("done"), 450), window.setTimeout(() => setPh("idle"), 1900));
  };
  return (
    <button type="button" className={`${className} v3-xbtn${ph !== "idle" ? ` is-${ph}` : ""}`} disabled={disabled} title={title} aria-label={iconOnly ? label : undefined} onClick={run}>
      {ph === "done"
        ? <Check size={size} strokeWidth={2.6} className="v3-xbtn-ok" aria-hidden="true" />
        : <svg className="v3-ic-dl" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path className="v3-ic-dl-arr" d="M12 4v11M7 10l5 5 5-5" /><path className="v3-ic-dl-tray" d="M5 20h14" /></svg>}
      {!iconOnly && <span>{ph === "done" ? "Готово" : label}</span>}
      <span className="v3-sr" role="status">{ph === "done" ? "Файл CSV завантажено" : ""}</span>
    </button>
  );
}
