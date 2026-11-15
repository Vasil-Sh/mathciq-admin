import { useMemo, useRef, useState } from "react";

type Plan = { plan: string; label: string; count: number };

const R = 40;
const C = 2 * Math.PI * R;
// Проміжок між сегментами з урахуванням круглих кінців (товщина 12 при r=40 «з’їдає» ~17°)
const GAP = 26;

/**
 * «Активні за тарифами» — кільце, яке можна крутити (KokonutUI «Spending Ring», під стиль MatchIQ).
 * Потягніть кільце — воно обертається й зупиняється на найближчому тарифі під маркером.
 * Клік без руху — наступний тариф; клік по рядку легенди — цей тариф.
 */
export default function PlanDial({ plans, colors, total, unit }: { plans: Plan[]; colors: Record<string, string>; total: number; unit: string }) {
  const segs = useMemo(() => {
    const free = 360 - GAP * plans.length;
    let a = 0;
    return plans.map((p) => {
      const sweep = Math.max(4, (p.count / Math.max(1, total)) * free);
      const s = { ...p, start: a, sweep, center: a + sweep / 2 };
      a += sweep + GAP;
      return s;
    });
  }, [plans, total]);
  const rotFor = (i: number) => -(segs[i]?.center ?? 0);
  const [sel, setSel] = useState(() => Math.max(0, plans.findIndex((p) => p.plan === "basic")));
  const [rot, setRot] = useState(() => rotFor(Math.max(0, plans.findIndex((p) => p.plan === "basic"))));
  const [drag, setDrag] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const st = useRef({ a0: 0, r0: 0, moved: false });

  const angleAt = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
  };
  const snapTo = (i: number, from = rot) => {
    let target = rotFor(i);
    while (target - from > 180) target -= 360;
    while (target - from < -180) target += 360;
    setSel(i);
    setRot(target);
  };
  const nearest = (r: number) => {
    let best = 0, bd = 1e9;
    segs.forEach((s, i) => {
      const d = Math.abs((((-r - s.center) % 360) + 540) % 360 - 180);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  };
  const onDown = (e: React.PointerEvent) => {
    try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* синтетичні події */ }
    st.current = { a0: angleAt(e), r0: rot, moved: false };
    setDrag(true);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    let d = angleAt(e) - st.current.a0;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    if (Math.abs(d) > 3) st.current.moved = true;
    setRot(st.current.r0 + d);
  };
  const onUp = () => {
    if (!drag) return;
    setDrag(false);
    if (!st.current.moved) snapTo((sel + 1) % segs.length);
    else snapTo(nearest(rot), rot);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); snapTo((sel + 1) % segs.length); }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); snapTo((sel - 1 + segs.length) % segs.length); }
  };
  const cur = segs[sel];
  const color = (p: string) => (p === "trial" ? "#7a8396" : colors[p] || "#7fdcaa");

  return (
    <div className="v3-dial-wrap">
      <div
        ref={ref}
        className={`v3-dial${drag ? " is-drag" : ""}`}
        role="slider"
        tabIndex={0}
        aria-label="Активні за тарифами — крутіть кільце або стрілки"
        aria-valuetext={cur ? `${cur.label}: ${cur.count}` : ""}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
      >
        <span className="v3-dial-mark" aria-hidden="true" />
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <g style={{ transform: `rotate(${rot - 90}deg)`, transformOrigin: "50px 50px", transition: drag ? "none" : "transform .6s cubic-bezier(.3,1.3,.4,1)" }}>
            {segs.map((s, i) => (
              <circle key={s.plan} cx="50" cy="50" r={R} fill="none" stroke={color(s.plan)} strokeLinecap="round"
                strokeWidth={i === sel ? 12 : 8} opacity={i === sel ? 1 : 0.5}
                strokeDasharray={`${(s.sweep / 360) * C} ${C}`} strokeDashoffset={-(s.start / 360) * C}
                style={{ transition: "stroke-width .3s, opacity .3s" }} />
            ))}
          </g>
        </svg>
        <span className="v3-dial-c"><strong key={cur?.plan}>{cur?.count ?? 0}</strong><small>{unit}</small></span>
      </div>
      <ul className="v3-plan-legend v3-dial-legend">
        {segs.map((p, i) => (
          <li key={p.plan}>
            <button type="button" className={i === sel ? "is-on" : ""} aria-pressed={i === sel} onClick={() => snapTo(i)}>
              <span className="v3-dot" style={{ background: color(p.plan) }} /><span>{p.label}</span><strong>{p.count}</strong><small>{Math.round((p.count / Math.max(1, total)) * 100)}%</small>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
