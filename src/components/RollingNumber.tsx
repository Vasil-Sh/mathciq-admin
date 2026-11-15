import { useEffect, useState } from "react";

/**
 * Число, у якого кожна цифра «прокручується» до свого значення (дизайн v4, «Лічильник»).
 * Нецифрові символи (пробіли, ₴, ≈, %) стоять на місці. Для читачів екрана — звичайний текст.
 */
export default function RollingNumber({ text, className = "" }: { text: string; className?: string }) {
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [ready, setReady] = useState(!!reduce);
  useEffect(() => {
    if (reduce) return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
    return () => cancelAnimationFrame(id);
  }, [reduce]);
  const chars = Array.from(text);
  let digitIdx = 0;
  return (
    <span className={`v3-roll ${className}`}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="v3-roll-row">
        {chars.map((ch, i) => {
          if (!/\d/.test(ch)) return <span key={i} className="v3-roll-ch">{ch}</span>;
          const d = Number(ch);
          const delay = (digitIdx++) * 0.06;
          return (
            <span key={i} className="v3-roll-col">
              <span className="v3-roll-strip" style={{ transform: `translateY(${ready ? -d : 0}em)`, transitionDelay: `${delay}s` }}>
                {"0123456789".split("").map((n) => <span key={n}>{n}</span>)}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
