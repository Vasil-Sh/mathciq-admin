import { useEffect, useRef, useState } from "react";

/**
 * «Скасувати» with a countdown ring (catalog · Feedback · Undo), used as a toast action label.
 * The ring and the number stop while the pointer is on the toast, like the toast's own timer.
 */
export default function UndoRing({ label = "Скасувати", ms = 10_000 }: { label?: string; ms?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [left, setLeft] = useState(ms);
  useEffect(() => {
    const toastEl = ref.current?.closest("[data-sonner-toast]") as HTMLElement | null;
    let paused = false, last = Date.now();
    const on = () => { paused = true; }, off = () => { paused = false; last = Date.now(); };
    toastEl?.addEventListener("pointerenter", on); toastEl?.addEventListener("pointerleave", off);
    const t = window.setInterval(() => { const now = Date.now(); if (!paused) setLeft((l) => Math.max(0, l - (now - last))); last = now; }, 200);
    return () => { window.clearInterval(t); toastEl?.removeEventListener("pointerenter", on); toastEl?.removeEventListener("pointerleave", off); };
  }, []);
  const secs = Math.max(1, Math.ceil(left / 1000));
  return (
    <span ref={ref} className="v3-undo">
      <span className="v3-undo-ring" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="2.5" /><circle cx="16" cy="16" r="14" fill="none" stroke="#4cd98a" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="88" strokeDashoffset={88 * (1 - left / ms)} /></svg>
        <b>{secs}</b>
      </span>
      {label}<span className="v3-sr">, лишилось {secs} с</span>
    </span>
  );
}
