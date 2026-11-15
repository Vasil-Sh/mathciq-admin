import { useRef, useState, type ReactNode } from "react";
import { Plus, Send } from "lucide-react";

const OPEN = -148;

/**
 * Рядок, який на телефоні можна потягнути вліво: під ним «Написати» і «+30 днів» (дизайн «Дашборд, мобільна»).
 * На десктопі — звичайний рядок.
 */
export default function SwipeRow({ children, tg, onExtend, extendLabel, hint }: { children: ReactNode; tg: string | null; onExtend: () => void; extendLabel: string; hint?: boolean }) {
  const [x, setX] = useState(0);
  const [drag, setDrag] = useState(false);
  const st = useRef({ x0: 0, y0: 0, base: 0, lock: "" as "" | "h" | "v", moved: false, on: false });
  const mobile = () => window.matchMedia("(max-width: 767px)").matches;
  const down = (e: React.PointerEvent) => {
    if (!mobile() || e.pointerType === "mouse") return;
    st.current = { x0: e.clientX, y0: e.clientY, base: x, lock: "", moved: false, on: true };
    setDrag(true);
  };
  const move = (e: React.PointerEvent) => {
    if (!st.current.on) return;
    const dx = e.clientX - st.current.x0, dy = e.clientY - st.current.y0;
    if (!st.current.lock) { if (Math.abs(dx) > 8) st.current.lock = "h"; else if (Math.abs(dy) > 8) st.current.lock = "v"; }
    if (st.current.lock !== "h") return;
    st.current.moved = true;
    try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* синтетичні події */ }
    let nx = st.current.base + dx;
    if (nx > 0) nx *= 0.2;
    if (nx < OPEN) nx = OPEN + (nx - OPEN) * 0.25;
    setX(Math.round(nx));
  };
  const up = () => { if (!st.current.on) return; st.current.on = false; setDrag(false); if (st.current.lock === "h") setX((v) => (v < OPEN / 2 ? OPEN : 0)); };
  const onClickCapture = (e: React.MouseEvent) => { if (st.current.moved || x !== 0) { e.preventDefault(); e.stopPropagation(); st.current.moved = false; if (x !== 0) setX(0); } };
  return (
    <div className="v3-swipe">
      <div className="v3-swipe-acts" aria-hidden={x === 0}>
        {tg && <a href={tg} target="_blank" rel="noreferrer" className="is-blue" tabIndex={x === 0 ? -1 : 0} onClick={() => setX(0)}><Send size={15} aria-hidden="true" />Написати</a>}
        <button type="button" className="is-green" tabIndex={x === 0 ? -1 : 0} onClick={() => { setX(0); onExtend(); }}><Plus size={15} aria-hidden="true" />{extendLabel}</button>
      </div>
      <div className={`v3-swipe-face${drag ? " is-drag" : ""}${hint && x === 0 ? " is-hint" : ""}`} style={{ transform: `translateX(${x}px)` }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onClickCapture={onClickCapture}>
        {children}
      </div>
    </div>
  );
}
