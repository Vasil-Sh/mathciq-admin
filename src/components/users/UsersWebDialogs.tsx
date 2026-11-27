import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Copy, Lock, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { DateField } from "@/components/ui/date-field";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/apiClient";
import { authService } from "@/lib/authService";
import { uuid } from "@/lib/uuid";
import { shortDate } from "@/lib/subscriptions";
import { openTelegram } from "@/lib/telegram";
import { describe, type Entry } from "@/lib/auditModel";
import { longDate, planCell } from "@/lib/usersModel";
import type { AdminUserOverview, AppSettings } from "@/types";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const addDays = (v: string, n: number) => { const d = new Date(`${v}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const money = (n: number) => `${Math.round(n).toLocaleString("uk-UA")} ₴`;
const num = (s: string) => Number(String(s).replace(",", ".")) || 0;

type PayPlan = "basic" | "pro" | "custom";

/** «Додати оплату» on the web (design «Веб — Додати оплату»): tariff, sum, date, days → the period is added to the end of the current one. */
export function AddPaymentWeb({ user, settings, open, onOpenChange, onSaved }: { user: AdminUserOverview | null; settings: AppSettings | null; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const subDays = settings?.subscriptionDays || 30;
  const basic = settings?.basicPrice || 300, pro = settings?.proPrice || 600;
  const [plan, setPlan] = useState<PayPlan>("basic");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(today());
  const [days, setDays] = useState(String(subDays));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const cur: PayPlan = user?.plan === "pro" || user?.proUntil ? "pro" : "basic";
  useEffect(() => {
    if (!open || !user) return;
    const p: PayPlan = user.plan === "trial" ? (settings?.trialPlan === "pro" ? "pro" : "basic") : cur;
    setPlan(p); setAmount(String(Number(user.priceMonth) > 0 && user.plan !== "trial" ? Number(user.priceMonth) : p === "pro" ? pro : basic));
    setPaidOn(today()); setDays(String(subDays)); setNote("");
  }, [open, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!user) return null;
  const pickPlan = (p: PayPlan) => { setPlan(p); if (p === "basic") { setAmount(String(basic)); setDays(String(subDays)); } if (p === "pro") { setAmount(String(pro)); setDays(String(subDays)); } };
  const end = user.endDate?.slice(0, 10) || "";
  const live = !!end && end >= today();
  const start = live ? addDays(end, 1) : today();
  const n = Math.max(1, Math.round(num(days)) || subDays);
  const until = addDays(start, n - 1);
  const sum = num(amount);
  const tariff = planCell(user, settings);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current || sum <= 0) return;
    lock.current = true; setBusy(true);
    try {
      if (plan !== "custom" && user && (user.plan === "trial" || plan !== cur) && !user.proUntil) await authService.updateUser(user.id, { plan, priceMonth: plan === "pro" ? pro : basic } as never);
      const r = await api.post<{ id: string }>(`/admin/users/${user!.id}/payments`, { requestId: uuid(), amount: String(sum), paidOn, periodStart: start, periodEnd: until, note, extendSubscription: true, paymentMethod: "Переказ на картку", promoCode: "" });
      toast.success(`Оплату №${r.id} додано`, { description: `@${user!.username} · ${money(sum)} · до ${shortDate(until)}` });
      onOpenChange(false); onSaved();
    } catch (err) { toast.error((err as Error).message); } finally { lock.current = false; setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="v3-modal v3-uwm sm:max-w-[500px]" onOpenAutoFocus={(e) => { e.preventDefault(); amountRef.current?.focus(); amountRef.current?.select(); }}>
        <DialogTitle className="v3-modal-title">Додати оплату</DialogTitle>
        <DialogDescription className="v3-modal-sub">@{user.username} · {tariff.plan}{user.endDate ? `, ${live ? "активна" : "закінчилась"} до ${shortDate(user.endDate)}` : ""}</DialogDescription>
        <form onSubmit={save} className="v3-uwm-form">
          <fieldset disabled={busy}>
            <p className="v3-uwm-l">Тариф</p>
            <div className="v3-uwm-opts">
              <button type="button" className={plan === "basic" ? "is-on" : ""} aria-pressed={plan === "basic"} onClick={() => pickPlan("basic")}><b>Базова</b><small>{money(basic)} · {subDays} дн.</small></button>
              <button type="button" className={plan === "pro" ? "is-on" : ""} aria-pressed={plan === "pro"} onClick={() => pickPlan("pro")}><b>Pro</b><small>{money(pro)} · {subDays} дн.</small></button>
              <button type="button" className={plan === "custom" ? "is-on" : ""} aria-pressed={plan === "custom"} onClick={() => pickPlan("custom")}><b>Свій</b><small>сума й дні</small></button>
            </div>
            <div className="v3-uwm-grid3">
              <label className="v3-uwm-f"><span>Сума, ₴</span><input ref={amountRef} required inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); if (plan !== "custom") setPlan("custom"); }} /></label>
              <div className="v3-uwm-f"><span id="uwp-date-l">Дата оплати</span><DateField id="uwp-date" labelledBy="uwp-date-l" required max={today()} value={paidOn} onChange={setPaidOn} /></div>
              <label className="v3-uwm-f"><span>Днів</span><input required inputMode="numeric" value={days} onChange={(e) => { setDays(e.target.value.replace(/\D/g, "").slice(0, 3)); if (plan !== "custom") setPlan("custom"); }} /></label>
            </div>
            <p className="v3-uwm-period">Підписка <b>{live ? `до ${shortDate(end)}` : "закінчилась"}</b><ArrowRight size={13} aria-hidden="true" /><b>до {shortDate(until)}</b><small>{live ? "додається до кінця поточної" : "почнеться сьогодні"}</small></p>
            <label className="v3-uwm-f"><span>Коментар</span><input value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="Напр.: переказ на картку, чек №…" /></label>
          </fieldset>
          <div className="v3-uwm-foot">
            <span>Оплата з’явиться в «Оплатах» і на дашборді · запишеться в журнал</span>
            <div>
              <button type="button" className="v3-uwb" onClick={() => onOpenChange(false)} disabled={busy}>Скасувати</button>
              <button type="submit" className="v3-uwb is-green" disabled={busy || sum <= 0}>{busy ? "Записуємо…" : `Записати ${money(sum)}`}</button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The new password, shown once (design «Веб — Пароль скинуто»). */
export function PasswordWeb({ data, telegram, onClose }: { data: { username: string; password: string; meta: string; title?: string } | null; telegram?: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => { setCopied(false); }, [data]);
  const tg = (telegram || "").replace(/^https?:\/\/t\.me\//, "").replace(/^@/, "").trim();
  const reset = !!data?.title;
  async function copy(text: string, msg: string) {
    try { await navigator.clipboard.writeText(text); toast.info(msg); return true; } catch { toast.error("Не вдалося скопіювати — виділіть пароль вручну"); return false; }
  }
  return (
    <Dialog open={!!data} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="v3-modal v3-uwm v3-uwm-pass sm:max-w-[460px]">
        <span className="v3-uwm-ico is-green" aria-hidden="true"><Lock size={18} /></span>
        <DialogTitle className="v3-modal-title">{reset ? "Новий пароль" : "Пароль"} для @{data?.username}</DialogTitle>
        <DialogDescription className="v3-modal-sub">Покажемо лише зараз. Передайте його користувачу — після входу він змінить пароль сам.{reset ? " Старий пароль більше не діє, усі сесії завершено." : ""}</DialogDescription>
        <div className="v3-uwm-code"><code>{data?.password}</code><button type="button" onClick={async () => { if (data && await copy(data.password, "Пароль скопійовано")) setCopied(true); }}>{copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}{copied ? "Скопійовано" : "Копіювати"}</button></div>
        <div className="v3-uwm-foot">
          <span>У журнал запишеться сам факт {reset ? "скидання" : "створення"}, без пароля</span>
          <div>
            <button type="button" className="v3-uwb" disabled={!tg} title={tg ? undefined : "Telegram не вказано"} onClick={async () => { if (!data) return; await copy(`Логін: ${data.username}\nПароль: ${data.password}`, "Логін і пароль скопійовано — вставте в чат"); openTelegram(tg); }}><Send size={14} aria-hidden="true" />Надіслати в Telegram</button>
            <button type="button" className="v3-uwb is-green" onClick={onClose}>Готово</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** «Видалити @…?» with the login typed to confirm (design «Веб — Видалити»). */
export function DeleteWeb({ user, settings, open, busy, onOpenChange, onConfirm }: { user: AdminUserOverview | null; settings: AppSettings | null; open: boolean; busy: boolean; onOpenChange: (o: boolean) => void; onConfirm: () => void }) {
  const [typed, setTyped] = useState("");
  useEffect(() => { setTyped(""); }, [open, user?.id]);
  if (!user) return null;
  const ok = typed.trim().replace(/^@/, "") === user.username;
  const p = planCell(user, settings);
  const n = user.paidCount || 0;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="v3-aupanel v3-udelp" role="alertdialog" onOpenAutoFocus={(e) => { e.preventDefault(); (document.getElementById("udel-login") as HTMLInputElement | null)?.focus(); }}>
        <div className="v3-aup-h">
          <DialogTitle>Видалити користувача</DialogTitle>
          <button type="button" className="v3-aup-x" aria-label="Закрити" disabled={busy} onClick={() => onOpenChange(false)}><X size={16} aria-hidden="true" /></button>
        </div>
        <div className="v3-udelp-body">
          <div className="v3-udelp-who"><span className="v3-uwm-ico is-red" aria-hidden="true"><Trash2 size={18} /></span><div><strong>@{user.username}</strong><small>{p.plan}{user.endDate ? ` · до ${shortDate(user.endDate)}` : ""}</small></div></div>
          <DialogDescription className="v3-udelp-txt">Обліковий запис і доступ буде видалено назавжди. Записи оплат лишаться в історії з цим логіном.</DialogDescription>
          <dl className="v3-uwm-sum">
            <div><dt>Підписка</dt><dd>{p.plan}{user.endDate ? ` · до ${shortDate(user.endDate)}` : ""}</dd></div>
            <div><dt>Оплати в історії</dt><dd>{n} · {money(user.paidTotal || 0)}</dd></div>
            <div><dt>Ставки</dt><dd>видаляться разом з акаунтом</dd></div>
          </dl>
          <label className="v3-uwm-f"><span>Введіть логін, щоб підтвердити</span><input id="udel-login" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={user.username} autoComplete="off" /></label>
          <p className="v3-udelp-note">Цю дію неможливо скасувати · запишеться в журнал дій</p>
        </div>
        <div className="v3-udelp-foot">
          <button type="button" className="v3-uwb" onClick={() => onOpenChange(false)} disabled={busy}>Скасувати</button>
          <button type="button" className="v3-uwb is-red" disabled={!ok || busy} onClick={onConfirm}>{busy ? "Видаляємо…" : "Видалити назавжди"}</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const when = (iso: string) => { const d = new Date(iso); return `${d.toLocaleDateString("uk-UA", { timeZone: "Europe/Kyiv", day: "numeric", month: "short" })}, ${d.toLocaleTimeString("uk-UA", { timeZone: "Europe/Kyiv", hour: "2-digit", minute: "2-digit" })}`; };

/** «Історія змін» of one user — a panel on the right (design «Веб — Історія змін»). */
export function HistoryWeb({ user, open, onOpenChange }: { user: AdminUserOverview | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!open || !user) return;
    let live = true; setRows(null); setErr(false);
    api.get<{ entries: Entry[] }>(`/admin/audit?page=1&limit=50&category=all&status=all&q=&from=&to=&userId=${user.id}&history=${encodeURIComponent(user.username)}&actor=`)
      .then((r) => { if (live) setRows(r.entries || []); }).catch(() => { if (live) setErr(true); });
    return () => { live = false; };
  }, [open, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="v3-aupanel v3-uhist" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="v3-aup-h">
          <DialogTitle>Історія змін</DialogTitle>
          <button type="button" className="v3-aup-x" aria-label="Закрити" onClick={() => onOpenChange(false)}><X size={16} aria-hidden="true" /></button>
        </div>
        <DialogDescription className="v3-uhist-sub">@{user?.username}{user?.createdAt ? ` · з ${longDate(user.createdAt.slice(0, 10))}` : ""}</DialogDescription>
        <div className="v3-aup-list">
          {err ? <p className="v3-aup-empty">Не вдалося завантажити історію. Спробуйте ще раз пізніше.</p>
            : !rows ? [0, 1, 2].map((i) => <div key={i} className="v3-aup-card is-skel" aria-hidden="true"><i /><i /></div>)
            : !rows.length ? <p className="v3-aup-empty">Змін ще не було.</p>
            : rows.map((e, i) => {
              const v = describe(e), d = v.diff.find((c) => c.from !== "—") || null, c = v.chips[0];
              return (
                <div key={e.id} className="v3-uhist-card" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
                  <small>{when(e.created_at)} · {e.actor_name === user?.username ? "користувач" : `@${e.actor_name}`}</small>
                  <p>{v.verb[0].toUpperCase() + v.verb.slice(1)}</p>
                  {d ? <span className="v3-uhist-diff"><s>{d.from}</s> → <b>{d.to}</b></span> : c ? <b className="v3-uhist-val">{c.to}</b> : null}
                </div>
              );
            })}
        </div>
        <Link to={user ? `/audit?userId=${user.id}&history=${encodeURIComponent(user.username)}` : "/audit"} className="v3-aup-all" onClick={() => onOpenChange(false)}>Відкрити в журналі дій <ArrowRight size={15} aria-hidden="true" /></Link>
      </DialogContent>
    </Dialog>
  );
}

