import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, Send } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/apiClient";
import { fetchSettings } from "@/lib/adminSettingsApi";
import { savePaymentReceipt } from "@/lib/paymentReceipt";
import { uuid } from "@/lib/uuid";
import { parseDate } from "@/lib/adminUtils";
import { isoDate } from "@/lib/subscriptions";

export type Payment = {
  id: string; amount: string; paidOn: string; periodStart: string; periodEnd: string; note: string;
  createdBy: string; status: string; cancelReason: string | null; cancelledBy: string | null; extendSubscription: boolean; username?: string;
};

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const addDays = (v: string, n: number) => { const d = new Date(`${v}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dmy = (v: string) => v.split("-").reverse().join(".");

/** «Додати оплату» — manual record; extends access by default (same rules as before). */
export function AddPaymentDialog({ open, onOpenChange, userId, username, endDate, priceMonth, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; userId: number; username: string; endDate: string; priceMonth: string; onSaved: () => void;
}) {
  const [days, setDays] = useState(30);
  const [form, setForm] = useState({ requestId: "", amount: "", paidOn: "", periodStart: "", periodEnd: "", note: "", extendSubscription: true });
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  useEffect(() => { fetchSettings().then((s) => setDays(s.subscriptionDays || 30)).catch(() => {}); }, []);
  useEffect(() => {
    if (!open) return;
    const endParsed = parseDate(endDate);
    const end = endParsed ? isoDate(endParsed) : "";
    const start = end && end >= today() ? addDays(end, 1) : today();
    setForm({ requestId: uuid(), amount: Number(priceMonth) > 0 ? String(Number(priceMonth)) : "", paidOn: today(), periodStart: start, periodEnd: addDays(start, days - 1), note: "", extendSubscription: true });
  }, [open, endDate, priceMonth, days]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      await api.post(`/admin/users/${userId}/payments`, form);
      toast.success(form.extendSubscription ? "Оплату записано, підписку продовжено" : "Оплату записано", { description: `@${username} · ${form.amount} ₴` });
      onOpenChange(false);
      onSaved();
    } catch (err) { toast.error((err as Error).message); } finally { lock.current = false; setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="v3-modal sm:max-w-[520px]">
        <DialogTitle className="v3-modal-title">Додати оплату</DialogTitle>
        <DialogDescription className="v3-modal-sub">@{username} · ручний облік у гривнях, банківська транзакція не перевіряється.</DialogDescription>
        <form onSubmit={save} className="v3-form">
          <fieldset disabled={busy} className="v3-form-grid">
            <div className="v3-field"><label htmlFor="pay-amount">Сума, ₴</label><input id="pay-amount" required inputMode="decimal" pattern="[0-9]{1,9}([.,][0-9]{1,2})?" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="300" /></div>
            <div className="v3-field"><label htmlFor="pay-date">Дата оплати</label><input id="pay-date" required type="date" max={today()} value={form.paidOn} onChange={(e) => setForm({ ...form, paidOn: e.target.value })} /></div>
            <div className="v3-field"><label htmlFor="pay-from">Період: від</label><input id="pay-from" required type="date" max={form.periodEnd} value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} /></div>
            <div className="v3-field"><label htmlFor="pay-to">До включно</label><input id="pay-to" required type="date" min={form.periodStart} value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} /></div>
            <div className="v3-field v3-span2"><label htmlFor="pay-note">Примітка</label><textarea id="pay-note" rows={2} maxLength={1000} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Необов’язково" /></div>
          </fieldset>
          <label className={`v3-agree${form.extendSubscription ? " is-on" : ""}`}>
            <input type="checkbox" className="sr-only" checked={form.extendSubscription} onChange={(e) => setForm({ ...form, extendSubscription: e.target.checked })} />
            <span className={`v3-ck${form.extendSubscription ? " is-on" : ""}`} aria-hidden="true">{form.extendSubscription && <Check size={12} strokeWidth={3.2} />}</span>
            <span><strong>Продовжити підписку до {form.periodEnd ? dmy(form.periodEnd) : "—"}</strong><small>{form.extendSubscription ? "Пізніший чинний термін не скорочується. Оплата й продовження зберігаються разом." : "Запис оплати не змінить термін доступу."}</small></span>
          </label>
          <div className="v3-modal-foot">
            <span className="v3-hint">Запишеться в журнал дій</span>
            <div className="v3-modal-actions">
              <button type="button" className="v3-btn v3-btn-ghost" onClick={() => onOpenChange(false)} disabled={busy}>Скасувати</button>
              <button type="submit" className="v3-btn v3-btn-primary" disabled={busy}>{busy ? "Збереження…" : form.extendSubscription ? "Записати й продовжити" : "Записати оплату"}</button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** «Скасувати запис» — keeps history, removes the amount from totals; not a refund. */
export function CancelPaymentDialog({ payment, onOpenChange, onDone }: { payment: Payment | null; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (payment) setReason(""); }, [payment]);
  async function cancel(e: React.FormEvent) {
    e.preventDefault();
    if (!payment || !reason.trim()) return;
    setBusy(true);
    try {
      await api.post(`/admin/payments/${payment.id}/cancel`, { reason });
      toast.success(`Запис №${payment.id} скасовано`, { description: "Сума не входить у звіт, підписка без змін" });
      onOpenChange(false);
      onDone();
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  }
  return (
    <Dialog open={!!payment} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="v3-modal sm:max-w-[480px]">
        <DialogTitle className="v3-modal-title">Скасувати запис №{payment?.id}?</DialogTitle>
        <DialogDescription className="v3-modal-sub">{payment ? `${payment.amount} ₴ · ${dmy(payment.paidOn)}` : ""}</DialogDescription>
        <form onSubmit={cancel} className="v3-form">
          <p className="v3-note-warn">Запис залишиться в історії, але не входитиме в суму оплат. Це не повернення коштів, і термін підписки не зміниться.</p>
          <div className="v3-field"><label htmlFor="cancel-reason">Причина</label><input id="cancel-reason" required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Наприклад: дубль запису №131" disabled={busy} /></div>
          <div className="v3-modal-foot">
            <span />
            <div className="v3-modal-actions">
              <button type="button" className="v3-btn v3-btn-ghost" onClick={() => onOpenChange(false)} disabled={busy}>Залишити оплату</button>
              <button type="submit" className="v3-btn v3-btn-red" disabled={busy || !reason.trim()}>{busy ? "Скасовуємо…" : "Скасувати запис"}</button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** «Чек» — the same image the user receives; can be sent to the user's Telegram. */
export function ReceiptDialog({ data, username, onOpenChange }: { data: { image: string; payment: Payment } | null; username: string; onOpenChange: (o: boolean) => void }) {
  const [sending, setSending] = useState(false);
  async function copy() {
    if (!data) return;
    try {
      const blob = await (await fetch(data.image)).blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      toast.info("Зображення скопійовано", { description: "Вставте в чат" });
    } catch { toast.error("Не вдалося скопіювати", { description: "Збережіть PNG і надішліть вручну" }); }
  }
  async function send() {
    if (!data || sending) return;
    setSending(true);
    try {
      const blob = await (await fetch(data.image)).blob();
      const form = new FormData();
      form.append("photo", new File([blob], `MIQ-${data.payment.id}.png`, { type: "image/png" }));
      await api.post(`/admin/payments/${data.payment.id}/receipt/send`, form);
      toast.success(`Чек надіслано @${username}`, { description: "Telegram · бот MatchIQ" });
    } catch (e) {
      const img = data.image, id = data.payment.id;
      toast.error("Не вдалося надіслати", { description: (e as Error).message, action: { label: "PNG", onClick: () => savePaymentReceipt(img, id) } });
    } finally { setSending(false); }
  }
  const p = data?.payment;
  const created = p ? `записав @${p.createdBy}` : "";
  return (
    <Dialog open={!!data} onOpenChange={onOpenChange}>
      <DialogContent className="v3-modal sm:max-w-[480px]">
        <DialogTitle className="v3-modal-title">Чек оплати №{p?.id}</DialogTitle>
        <DialogDescription className="v3-modal-sub">@{username} · {p ? `${Number(p.amount).toLocaleString("uk-UA")} ₴` : ""} · {created}</DialogDescription>
        <div className="v3-receipt">{data && <img src={data.image} alt={`Чек оплати № MIQ-${data.payment.id}`} />}</div>
        <div className="v3-receipt-tools">
          <button type="button" className="v3-btn v3-btn-ghost" onClick={() => data && savePaymentReceipt(data.image, data.payment.id)}><Download size={15} aria-hidden="true" /><span className="v3-hide-mobile">Завантажити PNG</span><span className="v3-only-mobile">Зберегти PNG</span></button>
          <button type="button" className="v3-btn v3-btn-ghost v3-hide-mobile" onClick={copy}><Copy size={15} aria-hidden="true" />Копіювати</button>
          <button type="button" className="v3-btn v3-btn-blue v3-only-mobile" onClick={send} disabled={sending}><Send size={15} aria-hidden="true" />{sending ? "Надсилаємо…" : "У Telegram"}</button>
        </div>
        <div className="v3-modal-foot v3-hide-mobile">
          <span className="v3-hint">Таке зображення бачить користувач</span>
          <div className="v3-modal-actions">
            <button type="button" className="v3-btn v3-btn-blue" onClick={send} disabled={sending}><Send size={15} aria-hidden="true" />{sending ? "Надсилаємо…" : "Надіслати в Telegram"}</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
