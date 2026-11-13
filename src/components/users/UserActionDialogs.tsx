import { useEffect, useState } from "react";
import { Check, Copy, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
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
  const today = isoToday();
  const from = user.proUntil && user.proUntil >= today ? user.proUntil : today;
  useEffect(() => { if (open) { setDays(14); setCustom(false); setUntil(addDays(from, 30)); setReason(""); } }, [open, from]);
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
      toast.success(`@${user.username}: Pro до ${shortDate(proUntil)}`, { description: base && base !== "pro" ? `Далі знову ${planName(base)}` : "Без оплати" });
      onOpenChange(false); onDone();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  const now = user.proUntil ? `зараз Pro до ${shortDate(user.proUntil)}` : `зараз ${planName(user.plan)}${user.endDate ? ` до ${shortDate(user.endDate)}` : ""}`;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="v3-modal sm:max-w-[560px]">
        <DialogTitle className="v3-modal-title">Видати Pro на N днів</DialogTitle>
        <DialogDescription className="v3-modal-sub">@{user.username} · {now}</DialogDescription>
        <div className="v3-opts">
          {[7, 14, 30].map((d) => <Opt key={d} on={!custom && days === d} title={`${d} днів`} sub={`до ${shortDate(addDays(from, d))}`} onClick={() => { setCustom(false); setDays(d); }} />)}
          <Opt on={custom} title="Свій" sub="дата" onClick={() => setCustom(true)} />
        </div>
        {custom && <div className="v3-field"><label htmlFor="pro-until">Pro до</label><input id="pro-until" type="date" min={addDays(from, 1)} max={addDays(from, 365)} value={until} onChange={(e) => setUntil(e.target.value)} /></div>}
        <div className="v3-field"><label htmlFor="pro-why">Причина <span className="v3-req">*</span></label><input id="pro-why" autoFocus maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Наприклад: компенсація за збій AI" /></div>
        <p className="v3-note-info">{dot(`Без оплати. Pro діє до ${shortDate(proUntil)}${base && base !== "pro" ? `, потім знову ${planName(base)}` : ""}`)} {user.endDate ? dot(`Наступна оплата зсувається на ${n} ${plural(n, "день", "дні", "днів")} — з ${shortDate(paidEnd)} на ${shortDate(newEnd)}`) : ""}</p>
        <div className="v3-modal-foot">
          <span className="v3-hint">Запишеться в журнал дій</span>
          <div className="v3-modal-actions">
            <button type="button" className="v3-btn v3-btn-ghost" onClick={() => onOpenChange(false)} disabled={busy}>Скасувати</button>
            <button type="button" className="v3-btn v3-btn-blue" onClick={save} disabled={busy || !reason.trim() || n < 1 || n > 365}>{busy ? "Видаємо…" : "Видати Pro"}</button>
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
  // Partial: unused days of the paid period.
  const unused = (() => {
    if (!payment) return 0;
    const a = Date.parse(`${payment.periodStart}T12:00:00Z`), b = Date.parse(`${payment.periodEnd}T12:00:00Z`), t = Date.parse(`${isoToday()}T12:00:00Z`);
    const total = Math.round((b - a) / 864e5) + 1;
    const left = Math.max(0, Math.min(total, Math.round((b - t) / 864e5) + 1));
    return total > 0 ? Math.round((full * left) / total) : 0;
  })();
  useEffect(() => { if (open) { setMode("full"); setAmount(String(full)); setReason(""); } }, [open, full]);
  const value = Number(String(amount).replace(",", "."));
  const valid = value > 0 && value <= full && !!reason.trim();
  async function save() {
    if (!payment || !valid) return;
    setBusy(true);
    try {
      await api.post(`/admin/payments/${payment.id}/refund`, { amount: value, reason: reason.trim() });
      toast.success(`Повернення ${money(value)} записано`, { description: `@${user.username} · підписку скасовано` });
      onOpenChange(false); onDone();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
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
        <div className="v3-modal-foot">
          <span />
          <div className="v3-modal-actions">
            <button type="button" className="v3-btn v3-btn-ghost" onClick={() => onOpenChange(false)} disabled={busy}>Скасувати</button>
            <button type="button" className="v3-btn v3-btn-red" onClick={save} disabled={busy || !valid}>{busy ? "Записуємо…" : "Записати повернення"}</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
      <DialogContent className="v3-modal sm:max-w-[480px]" role="alertdialog">
        <div className="v3-modal-iconrow">
          <span className="v3-modal-ico is-red" aria-hidden="true"><Trash2 size={22} /></span>
          <div>
            <DialogTitle className="v3-modal-title">Видалити @{username}?</DialogTitle>
            <DialogDescription className="v3-modal-sub">Обліковий запис і доступ буде видалено назавжди. Записи оплат лишаться в історії з цим логіном. Цю дію неможливо скасувати.</DialogDescription>
          </div>
        </div>
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
  useEffect(() => { setCopied(false); }, [data]);
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
          <div><code>{data?.password}</code><button type="button" className="v3-btn v3-btn-white" onClick={copy}>{copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}{copied ? "Скопійовано" : "Скопіювати"}</button></div>
        </div>
        <p className="v3-note-warn"><TriangleAlert size={16} aria-hidden="true" />Збережіть пароль перед закриттям — переглянути його повторно буде неможливо.</p>
        <div className="v3-modal-foot"><span /><button type="button" className="v3-btn v3-btn-blue" onClick={onClose}>Готово</button></div>
      </DialogContent>
    </Dialog>
  );
}
