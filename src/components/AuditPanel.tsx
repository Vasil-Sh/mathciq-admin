import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Search, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import PillTrack from "@/components/PillTrack";
import { api } from "@/lib/apiClient";
import { describe, dayKey, dayLabel, RESULT_UI, type Entry } from "@/lib/auditModel";

type Tab = "all" | "mine" | "others";
const hm = (iso: string) => new Date(iso).toLocaleTimeString("uk-UA", { timeZone: "Europe/Kyiv", hour: "2-digit", minute: "2-digit" });
const DOT: Record<string, string> = { pay: "#1f9d55", user: "#3a6df0", ext: "#3a6df0", key: "#3a6df0", banner: "#8b5cf6", set: "#6b7384", sec: "#f0a020", ad: "#8b5cf6" };

/**
 * Web: the header's journal button opens the last 50 actions in a panel on the right
 * (design «Дашборд · веб — Журнал дій · панель справа»); «Відкрити весь журнал» goes to the page.
 */
export default function AuditPanel({ open, onOpenChange, me }: { open: boolean; onOpenChange: (v: boolean) => void; me: string }) {
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [err, setErr] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!open) return;
    let live = true; setErr(false);
    api.get<{ entries: Entry[] }>("/admin/audit?page=1&limit=50&category=all&status=all").then((r) => { if (live) setRows(r.entries || []); }).catch(() => { if (live) setErr(true); });
    return () => { live = false; };
  }, [open]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows || []).filter((e) => (tab === "all" || (tab === "mine" ? e.actor_name === me : e.actor_name !== me))
      && (!t || `${e.actor_name} ${describe(e).verb} ${describe(e).target} ${e.target_username || ""}`.toLowerCase().includes(t)));
  }, [rows, tab, q, me]);
  const days = useMemo(() => {
    const out: { key: string; label: string; items: Entry[] }[] = [];
    list.forEach((e) => { const k = dayKey(e.created_at); const last = out[out.length - 1]; if (last && last.key === k) last.items.push(e); else out.push({ key: k, label: dayLabel(e.created_at).split(" · ")[0], items: [e] }); });
    return out;
  }, [list]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="v3-aupanel">
        <div className="v3-aup-h">
          <DialogTitle>Журнал дій <small>останні 50</small></DialogTitle>
          <button type="button" className="v3-aup-x" aria-label="Закрити" onClick={() => onOpenChange(false)}><X size={16} aria-hidden="true" /></button>
        </div>
        <DialogDescription className="sr-only">Останні дії адмінів</DialogDescription>
        <div className="v3-aup-bar">
          <div className="v3-seg v3-aup-seg" role="group" aria-label="Чиї дії">
            <PillTrack active={tab} />
            {([["all", "Усі"], ["mine", "Мої"], ["others", "Інших адмінів"]] as const).map(([k, l]) => <button key={k} type="button" className={tab === k ? "is-on" : ""} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}
          </div>
          <label className="v3-aup-search"><Search size={14} aria-hidden="true" /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Пошук у журналі" aria-label="Пошук у журналі" /></label>
        </div>
        <div className="v3-aup-list">
          {err ? <p className="v3-aup-empty">Не вдалося завантажити журнал. Спробуйте ще раз пізніше.</p>
            : !rows ? [0, 1, 2, 3].map((i) => <div key={i} className="v3-aup-card is-skel" aria-hidden="true"><i /><i /></div>)
            : !list.length ? <p className="v3-aup-empty">{q ? `За «${q}» нічого не знайдено.` : tab === "mine" ? "Ваших дій серед останніх 50 немає." : "Дій ще немає."}</p>
            : days.map((d) => (
              <section key={d.key}>
                <p className="v3-aup-day">{d.label}</p>
                {d.items.map((e, i) => {
                  const v = describe(e), res = RESULT_UI[e.status] || RESULT_UI.success, user = v.username || e.target_username || "";
                  const chip = v.chips[0];
                  return (
                    <div key={e.id} className="v3-aup-card" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
                      <i className="v3-aup-dot" style={{ background: e.status === "failed" ? "#e5484d" : DOT[v.kind] || "#6b7384" }} aria-hidden="true" />
                      <div>
                        <small>{hm(e.created_at)} · @{e.actor_name}{e.status !== "success" && <b className={`v3-aup-res ${res.cls}`}>{res.label}</b>}</small>
                        <p>{v.verb[0].toUpperCase() + v.verb.slice(1)} <strong>{v.target.split(" · ")[0]}</strong></p>
                        {chip && <span className="v3-aup-chip">{chip.k}: {chip.to}</span>}
                        {user && <Link to={v.kind === "pay" ? `/payments?user=${encodeURIComponent(user)}` : `/users?q=${encodeURIComponent(user)}`} className="v3-aup-link" onClick={() => onOpenChange(false)}>{v.kind === "pay" ? "Відкрити оплату" : "Відкрити користувача"} →</Link>}
                      </div>
                    </div>
                  );
                })}
              </section>
            ))}
        </div>
        <Link to="/audit" className="v3-aup-all" onClick={() => onOpenChange(false)}>Відкрити весь журнал <ArrowRight size={15} aria-hidden="true" /></Link>
      </DialogContent>
    </Dialog>
  );
}
