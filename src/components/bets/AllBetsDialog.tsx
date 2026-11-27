import { useEffect, useMemo, useState, type ReactElement } from "react";
import { Check, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import PillTrack from "@/components/PillTrack";
import UserAvatar from "@/components/UserAvatar";
import { plural } from "@/lib/dashboardInsights";
import { betView, money, signedMoney, signedPct } from "@/lib/betsModel";
import type { AdminUserBet, AdminUserOverview } from "@/types";

type F = "all" | "win" | "loss" | "pending";
const STEP = 10;
const MONTHS = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
const dayLabel = (iso: string) => {
  const [y, m, d] = (iso || "").slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "Без дати";
  return `${d} ${MONTHS[m - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ""}`;
};

/** A leg of an express: a won express means every leg came in; otherwise the leg result is unknown. */
export function legMark(res: string): { mark: string; cls: string } {
  return res === "win" ? { mark: "✓", cls: "is-win" } : { mark: "·", cls: "" };
}

/**
 * «Усі ставки» користувача (design «Ставки · мобільна, вікно «Усі ставки»»): a sheet on the phone, a window on the desktop.
 * Filter by result with the sliding pill, bets grouped by day come in one after another, «Показати ще 10».
 */
export default function AllBetsDialog({ user, bets, open, onOpenChange }: { user: AdminUserOverview | null; bets: AdminUserBet[]; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [f, setF] = useState<F>("all");
  const [n, setN] = useState(STEP);
  const [k, setK] = useState(0);
  useEffect(() => { if (open) { setF("all"); setN(STEP); } }, [open, user?.id]);

  const sorted = useMemo(() => [...bets].sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || "")), [bets]);
  const views = useMemo(() => sorted.map((b) => ({ b, v: betView(b) })), [sorted]);
  const cnt = (x: F) => (x === "all" ? views.length : views.filter((r) => r.v.res === x || (x === "pending" && r.v.res === "other")).length);
  const list = f === "all" ? views : views.filter((r) => r.v.res === f || (f === "pending" && r.v.res === "other"));
  const shown = list.slice(0, n);
  const FS: [F, string][] = [["all", "Усі"], ["win", "Виграш"], ["loss", "Програш"], ["pending", "Очікує"]];
  const pick = (x: F) => { if (x === f) return; setF(x); setN(STEP); setK((v) => v + 1); };
  if (!user) return null;
  const wr = user.wins + user.losses ? Math.round((user.wins / (user.wins + user.losses)) * 100) : 0;

  let lastDay = "";
  let i = 0;
  const items: ReactElement[] = [];
  shown.forEach(({ b, v }) => {
    const day = (b.date || "").slice(0, 10);
    const delay = `${Math.min(i, 10) * 35}ms`;
    if (day !== lastDay) { items.push(<div key={`d-${day}-${b.id}`} className="v3-ab-day" style={{ animationDelay: delay }}><span>{dayLabel(day)}</span>{(() => { const d = shown.filter((x) => (x.b.date || "").slice(0, 10) === day && x.v.res !== "pending"); if (!d.length) return null; const t = d.reduce((acc, x) => acc + (Number(x.b.profit) || 0), 0); return <b className={`v3-ab-daysum ${t > 0 ? "is-pos-d" : t < 0 ? "is-neg-d" : ""}`}>{signedMoney(t)}</b>; })()}</div>); lastDay = day; i++; }
    items.push(
      <div key={b.id} className="v3-ab-bet" style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}>
        <div className="v3-ab-h"><strong>{v.title}</strong><span className={`v3-ab-res is-${v.res}`} style={{ animationDelay: `${150 + Math.min(i, 10) * 35}ms` }}><i />{v.status}</span></div>
        <div className="v3-ab-m"><span className="v3-ab-g">{v.game}</span>{v.exp ? v.pick : `${v.pick} · ${v.odds}`}{v.exp ? ` · ${v.odds}` : ""}</div>
        {v.legs.length > 0 && <div className="v3-ab-legs">{v.legs.map((l, q) => { const m = legMark(v.res); return <div key={q} className="v3-ab-leg" style={{ animationDelay: `${150 + Math.min(i, 10) * 35 + q * 50}ms` }}><b className={m.cls}>{m.cls === "is-win" ? <Check size={10} strokeWidth={3.4} aria-label="зайшла" /> : <i aria-hidden="true" />}</b><span>{l.match}</span><em>{[l.pick, l.odds].filter(Boolean).join(" · ")}</em></div>; })}</div>}
        <div className="v3-ab-f"><span>{v.amount}</span><strong className={v.res === "win" ? "is-pos-d" : v.res === "loss" ? "is-neg-d" : "v3-ab-dim"}>{v.profit}</strong></div>
      </div>
    );
    i++;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="v3-modal v3-ab" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="v3-ab-head">
          <UserAvatar username={user.username} telegram={user.telegram} className="v3-ab-av" />
          <div className="v3-ab-who">
            <DialogTitle className="v3-ab-name">@{user.username}</DialogTitle>
            <DialogDescription className="v3-ab-meta">{user.betCount.toLocaleString("uk-UA")} {plural(user.betCount, "ставка", "ставки", "ставок")} · {wr}% виграшів</DialogDescription>
          </div>
          <DialogClose className="v3-ab-x" aria-label="Закрити"><X size={16} strokeWidth={2.2} aria-hidden="true" /></DialogClose>
        </div>
        {(user.usdBets || 0) > 0 && (() => { const n = Math.max(0, (user.betCount || 0) - (user.usdBets || 0)); return <div className="v3-ab-cur">У гривнях · {n} {plural(n, "ставка", "ставки", "ставок")}</div>; })()}
        <div className="v3-ab-stats">
          <div><span>Профіт</span><b className={user.totalProfit >= 0 ? "is-pos-d" : "is-neg-d"}>{signedMoney(user.totalProfit)}</b></div>
          <div><span>Обіг</span><b>{money(user.totalStaked)}</b></div>
          <div><span>ROI</span><b className={user.roi >= 0 ? "is-pos-d" : "is-neg-d"}>{signedPct(user.roi)}</b></div>
        </div>
        {(user.usdBets || 0) > 0 && <>
          <div className="v3-ab-cur">У доларах · {user.usdBets} {plural(user.usdBets || 0, "ставка", "ставки", "ставок")}</div>
          <div className="v3-ab-stats">
            <div><span>Профіт</span><b className={(user.usdProfit || 0) >= 0 ? "is-pos-d" : "is-neg-d"}>{signedMoney(user.usdProfit || 0, "USD")}</b></div>
            <div><span>Обіг</span><b>{money(user.usdStaked || 0, "USD")}</b></div>
            <div><span>ROI</span><b className={(user.usdRoi || 0) >= 0 ? "is-pos-d" : "is-neg-d"}>{signedPct(user.usdRoi || 0)}</b></div>
          </div>
        </>}
        <div className="v3-ab-f4" role="group" aria-label="Результат">
          <PillTrack active={f} />
          {FS.map(([x, l]) => <button key={x} type="button" className={f === x ? "is-on" : ""} aria-pressed={f === x} onClick={() => pick(x)}><b>{cnt(x)}</b>{l}</button>)}
        </div>
        <div key={k} className="v3-ab-list">{items}</div>
        {list.length === 0 && (
          <div className="v3-ab-none">
            <span className="v3-ab-none-ic" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16" /><path d="M7 12h10" /><path d="M10 18h4" /></svg></span>
            <strong>Таких ставок немає</strong>
            <span>{f === "pending" ? `@${user.username} зараз не має ставок, що чекають на результат.` : f === "win" ? "Виграшів поки немає." : f === "loss" ? "Програшів поки немає." : "Ставок поки немає."}</span>
          </div>
        )}
        {list.length > 0 && <span className="v3-ab-shown">Показано {shown.length} з {list.length}</span>}
        {list.length > shown.length && <button type="button" className="v3-ab-more" onClick={() => setN(n + STEP)}>Показати ще {Math.min(STEP, list.length - shown.length)}</button>}
      </DialogContent>
    </Dialog>
  );
}
