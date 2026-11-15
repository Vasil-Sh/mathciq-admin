import { useLayoutEffect, useRef, useState } from "react";

/**
 * Синя «пігулка», що переїжджає під активну кнопку сегментного перемикача (дизайн v4).
 * Покладіть першою дитиною в контейнер з кнопками; активна кнопка має клас `is-on`.
 * `active` — будь-яке значення, що змінюється разом із вибором.
 */
export default function PillTrack({ active }: { active: unknown }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);
  const first = useRef(true);
  useLayoutEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host) return;
    host.classList.add("has-pill");
    const measure = () => {
      const on = host.querySelector<HTMLElement>(":scope > .is-on");
      if (!on || on.offsetParent === null) { setBox(null); return; }
      setBox({ left: on.offsetLeft, width: on.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    host.querySelectorAll(":scope > button").forEach((b) => ro.observe(b));
    return () => ro.disconnect();
  }, [active]);
  useLayoutEffect(() => { if (box) { const id = requestAnimationFrame(() => { first.current = false; }); return () => cancelAnimationFrame(id); } }, [box]);
  return <span ref={ref} className={`v3-pill${first.current ? " is-instant" : ""}`} aria-hidden="true" style={box ? { left: box.left, width: box.width } : { opacity: 0 }} />;
}
