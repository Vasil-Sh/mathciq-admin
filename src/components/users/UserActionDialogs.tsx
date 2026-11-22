import { useEffect, useRef, useState } from "react";
import { Check, Copy, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { DateField } from "@/components/ui/date-field";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/apiClient";
import { shortDate } from "@/lib/subscriptions";
import { isoToday, planName } from "@/lib/usersModel";
import { plural } from "@/lib/dashboardInsights";
import type { AdminUserOverview } from "@/types";
import type { Payment } from "./PaymentDialogs";

const addDays = (v: string, n: number) => { const d = new Date(`${v}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const money = (n: number) => `${n.toLocaleString("uk-UA")} ₴`;
const dot = (t: string) => (t.endsWith(".") ? t : `${t}.`);

function Opt({ on, title, sub, onClick, wide }: { on: boolean; title: string; sub: string; onClick: () => void; wide?: boolean }) {
  return (
    <button type="button" className={`v3-opt${on ? " is-on" : ""}${wide ? " is-wide" : ""}`} aria-pressed={on} onClick={onClick}>
      <strong>{title}</strong><small>{sub}</small>
    </button>
  );
}

/** 07 · «Видати Pro на N днів» — no payment; Pro runs N days, then the previous plan returns. */
export function GrantProDialog({ user, open, onOpenChange, onDone }: { user: AdminUserOverview; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [days, setDays] = useState(14);
  const [custom, setCustom] = useState(false);
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const today = isoToday();
  const from = user.proUntil && user.proUntil >= today ? user.proUntil : today;
  useEffect(() => { if (open) { setDays(14); setCustom(false); setUntil(addDays(from, 30)); setReason(""); setStep(0); setDone(false); } }, [open, from]);
  const n = custom ? Math.max(0, Math.round((Date.parse(`${until}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 864e5)) : days;
  const proUntil = addDays(from, n);
  const base = user.proUntil ? user.proBasePlan : user.plan;
  const paidEnd = user.endDate && user.endDate > today ? user.endDate : today;
  const newEnd = addDays(paidEnd, n);
  async function save() {
    if (!reason.trim() || n < 1 || n > 365) return;
    setBusy(true);
    try {
      await api.post(`/admin/users/${user.id}/grant-pro`, { days: n, reason: reason.trim() });
      setDone(true);
      window.setTimeout(() => { toast.success(`@${user.username}: Pro до ${shortDate(proUntil)}`, { description: base && base !== "pro" ? `Далі знову ${planName(base)}` : "Без оплати" }); onOpenChange(false); onDone(); }, 1900);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  const now = user.proUntil ? `зараз Pro до ${shortDate(user.proUntil)}` : `зараз ${planName(user.plan)}${user.endDate ? ` до ${shortDate(user.endDate)}` : ""}`;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="v3-modal sm:max-w-[560px]">
        <DialogTitle className="v3-modal-title">Видати Pro на N днів</DialogTitle>
        <DialogDescription className="v3-modal-sub">@{user.username} · {now}</DialogDescription>
        <div className="v3-wz-wrap" aria-hidden="true"><div className="v3-wz">{[0, 1, 2].map((k) => <i key={k} className={k <= step ? "is-on" : ""} />)}</div><div className="v3-wz-l">{["Термін", "Причина", "Підтвердження"].map((t, k) => <span key={t} className={k === step ? "is-cur" : ""}>{t}</span>)}</div></div>
        {done ? (
          <div className="v3-prodone" role="status"><span className="v3-burst" aria-hidden="true"><Check size={26} strokeWidth={3} /></span><strong>Pro видано до {shortDate(proUntil)}</strong><span>@{user.username} · запис у журналі дій</span></div>
        ) : <>
        {step === 0 && <div className="v3-swap">
        <div className="v3-opts">
          {[7, 14, 30].map((d) => <Opt key={d} on={!custom && days === d} title={`${d} днів`} sub={`до ${shortDate(addDays(from, d))}`} onClick={() => { setCustom(false); setDays(d); }} />)}
          <Opt on={custom} title="Свій" sub="дата" onClick={() => setCustom(true)} />
        </div>
        {custom && <div className="v3-field"><label id="pro-until-l">Pro до</label><DateField id="pro-until" labelledBy="pro-until-l" min={addDays(from, 1)} max={addDays(from, 365)} value={until} onChange={setUntil} /></div>}
        </div>}
        {step === 1 && <div className="v3-swap">
        <div className="v3-field"><label htmlFor="pro-why">Причина <span className="v3-req">*</span></label><input id="pro-why" autoFocus maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Наприклад: компенсація за збій AI" /></div>
        </div>}
        {step === 2 && <div className="v3-swap">
        <p className="v3-note-info">{dot(`Без оплати. Pro діє до ${shortDate(proUntil)}${base && base !== "pro" ? `, потім знову ${planName(base)}` : ""}`)} {user.endDate ? dot(`Наступна оплата зсувається на ${n} ${plural(n, "день", "дні", "днів")} — з ${shortDate(paidEnd)} на ${shortDate(newEnd)}`) : ""}</p>
        </div>}
        </>}
        <div className="v3-modal-foot">
          <span className="v3-hint">Крок {step + 1} з 3 · запишеться в журнал дій</span>
          <div className="v3-modal-actions">
            <button type="button" className="v3-btn v3-btn-ghost" onClick={() => (step ? setStep(step - 1) : onOpenChange(false))} disabled={busy || done}>{step ? "Назад" : "Скасувати"}</button>
            {step < 2
              ? <button type="button" className="v3-btn v3-btn-blue" onClick={() => setStep(step + 1)} disabled={(step === 0 && (n < 1 || n > 365)) || (step === 1 && !reason.trim())}>Далі</button>
              : <button type="button" className="v3-btn v3-btn-blue" onClick={save} disabled={busy || done || !reason.trim() || n < 1 || n > 365}>{busy ? "Видаємо…" : "Видати Pro"}</button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 08 · «Повернути гроші» — a record only; the subscription is cancelled now. */
export function RefundDialog({ user, payment, open, onOpenChange, onDone }: { user: AdminUserOverview; payment: Payment | null; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const full = Number(payment?.amount || 0);
  const [mode, setMode] = useState<"full" | "part">("full");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [rf, setRf] = useState(0);
  // Partial: unused days of the paid period.
  const unused = (() => {
    if (!payment) return 0;
    const a = Date.parse(`${payment.periodStart}T12:00:00Z`), b = Date.parse(`${payment.periodEnd}T12:00:00Z`), t = Date.parse(`${isoToday()}T12:00:00Z`);
    const total = Math.round((b - a) / 864e5) + 1;
    const left = Math.max(0, Math.min(total, Math.round((b - t) / 864e5) + 1));
    return total > 0 ? Math.round((full * left) / total) : 0;
  })();
  useEffect(() => { if (open) { setMode("full"); setAmount(String(full)); setReason(""); setRf(0); } }, [open, full]);
  const value = Number(String(amount).replace(",", "."));
  const valid = value > 0 && value <= full && !!reason.trim();
  async function save() {
    if (!payment || !valid) return;
    setBusy(true);
    try {
      await api.post(`/admin/payments/${payment.id}/refund`, { amount: value, reason: reason.trim() });
      setRf(1); window.setTimeout(() => setRf(2), 700); window.setTimeout(() => setRf(3), 1400);
      window.setTimeout(() => { toast.success(`Повернення ${money(value)} записано`, { description: `@${user.username} · підписку скасовано` }); onOpenChange(false); onDone(); }, 2900);
    } catch (e) { toast.error((e as Error).message); setRf(0); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="v3-modal sm:max-w-[560px]">
        <DialogTitle className="v3-modal-title">Повернути гроші</DialogTitle>
        <DialogDescription className="v3-modal-sub">@{user.username}{payment ? ` · оплата №${payment.id} · ${money(full)} · ${shortDate(payment.paidOn)}` : ""}</DialogDescription>
        <div className="v3-opts">
          <Opt on={mode === "full"} title="Повністю" sub={money(full)} onClick={() => { setMode("full"); setAmount(String(full)); }} />
          <Opt on={mode === "part"} title="Частково" sub="за невикористані дні" onClick={() => { setMode("part"); setAmount(String(unused || "")); }} />
        </div>
        <div className="v3-form-grid">
          <div className="v3-field"><label htmlFor="ref-sum">Сума повернення, ₴</label><input id="ref-sum" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={value > full} /></div>
          <div className="v3-field"><label htmlFor="ref-date">Дата</label><input id="ref-date" value={isoToday().split("-").reverse().join(".")} readOnly /></div>
        </div>
        {value > full && <p className="v3-field-error">Не більше за оплату — {money(full)}.</p>}
        <div className="v3-field"><label htmlFor="ref-why">Причина <span className="v3-req">*</span></label><input id="ref-why" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Наприклад: передумав у перші 3 дні" /></div>
        <p className="v3-note-warn">Гроші повертаєте вручну (картка, переказ). Тут лише запис: підписку буде скасовано, оплата позначиться «Повернено».</p>
        <SlideConfirm label={`Провести, щоб повернути ${money(value || 0)}`} disabled={busy || !valid || rf > 0} onConfirm={save} />
        {rf > 0 ? (
          <div className="v3-rsteps" role="status" aria-live="polite">
            <span className="v3-rsteps-line" aria-hidden="true"><i style={{ width: `${rf >= 3 ? 100 : (rf - 1) * 50}%` }} /></span>
            {["Записано", "Підписку скасовано", "Оплата «Повернено»"].map((t, k) => { const isDone = rf > k + 1 || rf === 3; return (
              <div key={t} className={`v3-rstep${isDone ? " is-done" : rf === k + 1 ? " is-on" : ""}`}><span className="v3-rstep-c">{isDone ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : k + 1}</span>{t}</div>
            ); })}
          </div>
        ) : <p className="v3-hint" style={{ textAlign: "center" }}>Перетягніть кружок праворуч або натисніть Enter на ньому</p>}
        <div className="v3-modal-foot">
          <span />
          <div className="v3-modal-actions">
            <button type="button" className="v3-btn v3-btn-ghost" onClick={() => onOpenChange(false)} disabled={busy || rf > 0}>Скасувати</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Slide to confirm (catalog · Dangerous actions · Slide to Confirm). Enter or Space on the knob also confirms. */
function SlideConfirm({ label, disabled, onConfirm }: { label: string; disabled: boolean; onConfirm: () => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const [drag, setDrag] = useState(false);
  const [ok, setOk] = useState(false);
  const start = useRef(0);
  const max = () => Math.max(0, (track.current?.clientWidth || 0) - 52);
  useEffect(() => { if (disabled) { setX(0); setOk(false); } }, [disabled]);
  const finish = () => { setOk(true); setX(max()); onConfirm(); };
  return (
    <div ref={track} className={`v3-slide${disabled ? " is-off" : ""}${ok ? " is-ok" : ""}${drag ? " is-drag" : ""}`}>
      <span className="v3-slide-fill" style={{ width: x + 48 }} aria-hidden="true" />
      <span className="v3-slide-lbl" style={{ opacity: Math.max(0, 1 - x / (max() || 1) * 1.6) }}>{ok ? "Записано" : label}</span>
      <button type="button" className="v3-slide-knob" disabled={disabled || ok} aria-label={`${label}. Перетягніть праворуч або натисніть Enter`} style={{ transform: `translateX(${x}px)` }}
        onPointerDown={(e) => { if (disabled || ok) return; (e.target as HTMLElement).setPointerCapture(e.pointerId); start.current = e.clientX - x; setDrag(true); }}
        onPointerMove={(e) => { if (!drag) return; setX(Math.max(0, Math.min(max(), e.clientX - start.current))); }}
        onPointerUp={() => { if (!drag) return; setDrag(false); if (x >= max() * 0.88) finish(); else setX(0); }}
        onPointerCancel={() => { setDrag(false); setX(0); }}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !disabled && !ok) { e.preventDefault(); finish(); } }}>
        {ok ? <Check size={20} strokeWidth={3} aria-hidden="true" /> : <span aria-hidden="true">→</span>}
      </button>
    </div>
  );
}

/** 09 · «Скасувати підписку» — at period end or now. */
export function CancelSubscriptionDialog({ user, open, onOpenChange, onDone }: { user: AdminUserOverview; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [mode, setMode] = useState<"end" | "now">("end");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setMode("end"); setReason(""); } }, [open]);
  async function save() {
    setBusy(true);
    try {
      await api.post(`/admin/users/${user.id}/subscription/cancel`, { mode, reason: reason.trim() });
      toast.success(`Підписку @${user.username} скасовано`, { description: mode === "end" ? `Доступ до ${shortDate(user.endDate)}, далі без продовження` : "Доступ закрито" });
      onOpenChange(false); onDone();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  const plan = user.proUntil ? "Pro" : planName(user.plan);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="v3-modal sm:max-w-[520px]">
        <DialogTitle className="v3-modal-title">Скасувати підписку?</DialogTitle>
        <DialogDescription className="v3-modal-sub">@{user.username} · {plan}{user.endDate ? ` · оплачено до ${shortDate(user.endDate)}` : ""}</DialogDescription>
        <div className="v3-opts is-col">
          <Opt wide on={mode === "end"} title="У кінці оплаченого періоду" sub={`${plan} працює до ${shortDate(user.endDate) || "—"} — далі без продовження`} onClick={() => setMode("end")} />
          <Opt wide on={mode === "now"} title="Зараз" sub="доступ закриється одразу — за потреби запишіть повернення" onClick={() => setMode("now")} />
        </div>
        <div className="v3-field"><label htmlFor="cn-why">Причина</label><input id="cn-why" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Наприклад: попросив у Telegram" /></div>
        <div className="v3-modal-foot">
          <span />
          <div className="v3-modal-actions">
            <button type="button" className="v3-btn v3-btn-ghost" onClick={() => onOpenChange(false)} disabled={busy}>Залишити</button>
            <button type="button" className="v3-btn v3-btn-red" onClick={save} disabled={busy}>{busy ? "Скасовуємо…" : "Скасувати підписку"}</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 04 · «Видалити користувача». */
export function DeleteUserDialog({ username, open, busy, onOpenChange, onConfirm }: { username: string; open: boolean; busy: boolean; onOpenChange: (o: boolean) => void; onConfirm: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="v3-modal v3-udel sm:max-w-[480px]" role="alertdialog">
        <div className="v3-modal-iconrow">
          <span className="v3-modal-ico is-red" aria-hidden="true"><Trash2 size={22} /></span>
          <div>
            <DialogTitle className="v3-modal-title">Видалити @{username}?</DialogTitle>
            <DialogDescription className="v3-modal-sub">Обліковий запис і доступ буде видалено назавжди. Записи оплат лишаться в історії з цим логіном.<span className="v3-hide-mobile"> Цю дію неможливо скасувати.</span></DialogDescription>
          </div>
        </div>
        <p className="v3-udel-warn v3-only-mobile"><TriangleAlert size={14} aria-hidden="true" />Цю дію неможливо скасувати</p>
        <div className="v3-modal-foot"><span /><div className="v3-modal-actions">
          <button type="button" className="v3-btn v3-btn-ghost" onClick={() => onOpenChange(false)} disabled={busy}>Скасувати</button>
          <button type="button" className="v3-btn v3-btn-red" onClick={onConfirm} disabled={busy}>{busy ? "Видаляємо…" : "Видалити назавжди"}</button>
        </div></div>
      </DialogContent>
    </Dialog>
  );
}

/** 02 · «Доступ налаштовано» — the generated password, shown once. */
export function PasswordDialog({ data, onClose }: { data: { username: string; password: string; meta: string; title?: string } | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [shown, setShown] = useState(false);
  useEffect(() => { setCopied(false); setShown(false); }, [data]);
  async function copy() {
    if (!data) return;
    try { await navigator.clipboard.writeText(data.password); setCopied(true); toast.info("Пароль скопійовано"); } catch { toast.error("Не вдалося скопіювати — виділіть пароль вручну"); }
  }
  return (
    <Dialog open={!!data} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="v3-modal sm:max-w-[480px]">
        <div className="v3-modal-iconrow">
          <span className="v3-modal-ico is-green" aria-hidden="true"><Check size={24} strokeWidth={2.4} /></span>
          <div>
            <DialogTitle className="v3-modal-title">{data?.title || "Доступ налаштовано"}</DialogTitle>
            <DialogDescription className="v3-modal-sub">{data ? `@${data.username} · ${data.meta}` : ""}</DialogDescription>
          </div>
        </div>
        <div className="v3-pass-box">
          <span>Пароль для входу</span>
          <div><code className={shown ? "is-shown" : ""}>{shown ? data?.password : "••••-••••-••••"}</code><button type="button" className="v3-eyeb" onClick={() => setShown(!shown)} aria-pressed={shown} aria-label={shown ? "Сховати пароль" : "Показати пароль"}><svg className={"v3-eye" + (shown ? "" : " is-shut")} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle className="v3-eye-lid" cx="12" cy="12" r="3" /><path className="v3-eye-slash" d="M4 4l16 16" /></svg></button><button type="button" className="v3-btn v3-btn-white" onClick={copy}>{copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}{copied ? "Скопійовано" : "Скопіювати"}</button></div>
        </div>
        <p className="v3-note-warn"><TriangleAlert size={16} aria-hidden="true" />Збережіть пароль перед закриттям — переглянути його повторно буде неможливо.</p>
        <div className="v3-modal-foot"><span /><button type="button" className="v3-btn v3-btn-blue" onClick={onClose}>Готово</button></div>
      </DialogContent>
    </Dialog>
  );
}
