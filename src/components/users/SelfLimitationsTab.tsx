import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import UserAvatar from "@/components/UserAvatar";
import { api } from "@/lib/apiClient";
import { plural, periodLabel } from "@/lib/dashboardInsights";
import { longDate, planName } from "@/lib/usersModel";

interface Req { id: string; userId: number; username: string; periodDays: number; status: string; createdAt: string; until: string | null; plan?: string; telegram?: string }

const dayDiff = (iso: string) => Math.ceil((Date.parse(iso) - Date.now()) / 864e5);
const when = (iso: string) => {
  const d = new Date(iso), t = new Date();
  const same = d.toDateString() === t.toDateString();
  return same ? `сьогодні, ${d.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}` : longDate(iso.slice(0, 10));
};

/** «Самообмеження» tab: requests are applied at once and cannot be lifted early. */
export default function SelfLimitationsTab({ onCount }: { onCount?: (n: number) => void }) {
  const [rows, setRows] = useState<Req[] | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"active" | "done">("active");
  useEffect(() => {
    api.get<{ requests: Req[] }>("/admin/self-limitations")
      .then((r) => { setRows(r.requests || []); })
      .catch((e) => setError((e as Error).message));
  }, []);
  const list = rows || [];
  const active = list.filter((r) => r.status === "applied" && r.until && Date.parse(r.until) > Date.now());
  const done = list.filter((r) => !active.includes(r));
  useEffect(() => { if (rows) onCount?.(active.length); }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = tab === "active" ? active : done;

  return (
    <section className="v3-excl">
      <div className="v3-wcard v3-excl-list">
        <div className="v3-excl-head">
          <div><h2 className="v3-h2">Запити на самообмеження</h2><p className="v3-note-dark">Користувач сам блокує свій акаунт на обраний термін. Блок застосовується одразу.</p></div>
          <div className="v3-seg v3-seg-soft" role="group" aria-label="Стан">
            <button type="button" className={tab === "active" ? "is-on" : ""} aria-pressed={tab === "active"} onClick={() => setTab("active")}>Активні · {active.length}</button>
            <button type="button" className={tab === "done" ? "is-on" : ""} aria-pressed={tab === "done"} onClick={() => setTab("done")}>Завершені · {done.length}</button>
          </div>
        </div>
        {error ? <p className="v3-field-error" role="alert">Не вдалося завантажити запити: {error}</p> : !rows ? <p className="v3-note-dark" role="status">Завантаження…</p> : shown.length === 0 ? (
          <p className="v3-excl-empty">{tab === "active" ? "Зараз ніхто не обмежив себе." : "Завершених запитів ще немає."}</p>
        ) : (
          <div role="table" aria-label="Самообмеження">
            <div className="v3-excl-row v3-excl-th" role="row"><span role="columnheader">Користувач</span><span role="columnheader">Термін</span><span role="columnheader">Заблоковано до</span><span role="columnheader">Подано</span></div>
            {shown.map((r) => {
              const left = r.until ? dayDiff(r.until) : 0;
              const isNew = Date.now() - Date.parse(r.createdAt) < 864e5;
              return (
                <div key={r.id} className="v3-excl-row" role="row">
                  <span role="cell" className="v3-excl-who"><UserAvatar username={r.username} telegram={r.telegram} /><span><strong>@{r.username}</strong><small>{r.plan ? `${planName(r.plan)} · ` : ""}{r.status === "denied" ? "відхилено" : "підписку заморожено"}</small></span></span>
                  <span role="cell">{periodLabel(r.periodDays)}</span>
                  <span role="cell" className="v3-excl-until">{r.until ? <><strong>{longDate(r.until.slice(0, 10))}</strong>{tab === "active" && <span className={`v3-tag ${isNew ? "v3-tag-amber" : "v3-tag-blue"}`}>{isNew ? "новий · сьогодні" : `ще ${left} ${plural(left, "день", "дні", "днів")}`}</span>}</> : "—"}</span>
                  <span role="cell" className="v3-muted">{when(r.createdAt)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <aside className="v3-dcard v3-excl-side">
        <span className="v3-excl-ico" aria-hidden="true"><Lock size={20} /></span>
        <strong>Зняти блок раніше не можна</strong>
        <p>Ні адмін, ні овнер не можуть скасувати самообмеження до кінця терміну. Оплачені дні не згорають — підписка продовжується на час блоку.</p>
        <div className="v3-excl-rules">
          <span><b>Під час блоку:</b> вхід закрито, оплати не приймаються.</span>
          <span><b>Після терміну:</b> доступ відкривається автоматично.</span>
        </div>
        <button type="button" className="v3-mini" disabled><Lock size={13} aria-hidden="true" />Дострокове зняття недоступне</button>
      </aside>
    </section>
  );
}
