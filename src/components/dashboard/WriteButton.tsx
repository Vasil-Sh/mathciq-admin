import { useEffect, useRef, useState } from "react";
import { Check, Send } from "lucide-react";

/**
 * «Написати» в Telegram: літачок злітає → «Відкриваємо…» → «✓ Відкрито» (дизайн v4).
 * Посилання відкривається одразу в новій вкладці, анімація лише підтверджує дію.
 */
export default function WriteButton({ href, dark = false }: { href: string; dark?: boolean }) {
  const [phase, setPhase] = useState<"idle" | "fly" | "done">("idle");
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const onClick = () => {
    if (phase !== "idle") return;
    timers.current.forEach((t) => window.clearTimeout(t));
    setPhase("fly");
    timers.current = [window.setTimeout(() => setPhase("done"), 650), window.setTimeout(() => setPhase("idle"), 3200)];
  };
  return (
    <a href={href} target="_blank" rel="noreferrer" onClick={onClick} className={`v3-btn-pill v3-write${dark ? " v3-btn-pill-dark" : ""}${phase === "done" ? " is-sent" : ""}`} aria-live="polite">
      {phase === "done"
        ? <><Check size={13} strokeWidth={3} className="v3-write-ok" aria-hidden="true" />Відкрито</>
        : <><span className={`v3-write-pl${phase === "fly" ? " is-fly" : ""}`} aria-hidden="true"><Send size={13} /></span>{phase === "fly" ? "Відкриваємо…" : "Написати"}</>}
    </a>
  );
}
