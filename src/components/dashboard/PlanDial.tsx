import { useState } from "react";

type Plan = { plan: string; label: string; count: number };

/**
 * «Активні за тарифами» — Spending Ring з каталогу анімацій (Motion4 · Метрики 03).
 * Кожен тариф — окреме кільце на доріжці; при показі кільця малюються по колу.
 * Рядок легенди виділяє своє кільце.
 */
export default function PlanDial({ plans, colors, total }: { plans: Plan[]; colors: Record<string, string>; total: number; unit?: string }) {
  const [sel, setSel] = useState(() => Math.max(0, plans.findIndex((p) => p.plan === "basic")));
  const step = plans.length > 3 ? 10 : 12;
  const color = (p: string) => (p === "trial" ? "#7a8396" : colors[p] || "#7fdcaa");
  const share = (n: number) => n / Math.max(1, total);

  return (
    <div className="v3-dial-wrap">
      <svg className="v3-sring" viewBox="0 0 110 110" aria-hidden="true">
        {plans.map((p, i) => {
          const r = 45 - i * step;
          const len = 2 * Math.PI * r;
          return (
            <g key={p.plan}>
              <circle cx="55" cy="55" r={r} fill="none" stroke="#232a37" strokeWidth={9} />
              <circle className="v3-sring-p" cx="55" cy="55" r={r} fill="none" stroke={color(p.plan)} strokeLinecap="round"
                strokeWidth={i === sel ? 11 : 9} opacity={i === sel ? 1 : 0.45}
                strokeDasharray={len} strokeDashoffset={len * (1 - share(p.count))}
                style={{ "--len": len, animationDelay: `${0.1 + i * 0.15}s` } as React.CSSProperties} />
            </g>
          );
        })}
      </svg>
      <ul className="v3-plan-legend v3-dial-legend">
        {plans.map((p, i) => (
          <li key={p.plan}>
            <button type="button" className={i === sel ? "is-on" : ""} aria-pressed={i === sel} onClick={() => setSel(i)}>
              <span className="v3-dot" style={{ background: color(p.plan) }} /><span>{p.label}</span><strong>{p.count}</strong><small>{Math.round(share(p.count) * 100)}%</small>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
