import { useEffect, useRef, useState } from "react";
import { receiptNo } from "@/lib/paymentReceipt";
import { Check, Copy, Download, Send } from "lucide-react";
import { toast } from "sonner";
import { DateField } from "@/components/ui/date-field";
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
/** Phone method cards (design «Записати оплату · крок 2»): title + hint. */
const METHOD_CARD: Record<string, [string, string]> = { "Переказ на картку": ["Картка", "переказ"], "Монобанк": ["monobank", "банка"], "Готівка": ["Готівка", "інше"] };
const dShortUk = (v: string) => { const d = parseDate(v); return d ? d.toLocaleDateString("uk-UA", { day: "numeric", month: "short" }) : v; };
const planCls = (l?: string) => !l ? "" : l === "Pro" ? "pro" : l.startsWith("Пробний") ? "trial" : l === "Базова" ? "basic" : "";

export function AddPaymentDialog({ open, onOpenChange, userId, username, endDate, priceMonth, onSaved, planLabel, onReceipt, step }: {
  open: boolean; onOpenChange: (o: boolean) => void; userId: number; username: string; endDate: string; priceMonth: string; onSaved: () => void;
  planLabel?: string; onReceipt?: (paymentId: string) => void;
  /** «Крок 2 з 2» chip on the phone when the user was picked first. */
  step?: string;
}) {
  const [days, setDays] = useState(30);
  const [form, setForm] = useState({ requestId: "", amount: "", paidOn: "", periodStart: "", periodEnd: "", note: "", extendSubscription: true, paymentMethod: "Монобанк", promoCode: "" });
  // Промокод (каталог · Форми 11): правильний — рамка зеленіє, стара ціна перекреслюється; ні — поле хитається.
  const [code, setCode] = useState("");
  const [promo, setPromo] = useState<{ state: "idle" | "busy" | "ok" | "bad"; base?: number; pct?: number; msg?: string; shake: number }>({ state: "idle", shake: 0 });
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  useEffect(() => { fetchSettings().then((s) => setDays(s.subscriptionDays || 30)).catch(() => {}); }, []);
  useEffect(() => {
    if (!open) return;
    const endParsed = parseDate(endDate);
    const end = endParsed ? isoDate(endParsed) : "";
    const start = end && end >= today() ? addDays(end, 1) : today();
    setForm({ requestId: uuid(), amount: Number(priceMonth) > 0 ? String(Number(priceMonth)) : "", paidOn: today(), periodStart: start, periodEnd: addDays(start, days - 1), note: "", extendSubscription: true, paymentMethod: "Монобанк", promoCode: "" });
    setCode(""); setPromo({ state: "idle", shake: 0 });
  }, [open, endDate, priceMonth, days]);

  async function applyPromo() {
    const c = code.trim().toUpperCase();
    if (!c) return;
    const base = promo.state === "ok" && promo.base ? promo.base : Number(String(form.amount).replace(",", ".")) || Number(priceMonth) || 0;
    setPromo((p) => ({ ...p, state: "busy" }));
    try {
      const r = await api.post<{ valid: boolean; promoCode: { code: string; discountPercent: number } }>("/admin/promo-codes/validate", { code: c });
      const pct = Number(r.promoCode?.discountPercent) || 0;
      const due = Math.round(base * (100 - pct)) / 100;
      setForm((f) => ({ ...f, amount: String(due), promoCode: r.promoCode?.code || c }));
      setPromo((p) => ({ state: "ok", base, pct, shake: p.shake }));
    } catch (err) {
      setForm((f) => ({ ...f, promoCode: "", amount: promo.base ? String(promo.base) : f.amount }));
      setPromo((p) => ({ state: "bad", msg: (err as Error).message || "Код не підходить або закінчився", shake: p.shake + 1 }));
    }
  }
  const METHODS = ["Монобанк", "Переказ на картку", "Готівка"];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      const r = await api.post<{ id: string }>(`/admin/users/${userId}/payments`, form);
      const until = form.extendSubscription ? ` · до ${form.periodEnd.split("-").reverse().slice(0, 2).join(".")}` : "";
      toast.success(`Оплату №${r.id} додано`, {
        description: `@${username}${planLabel ? ` · ${planLabel}` : ""} · ${Number(form.amount).toLocaleString("uk-UA")} ₴${until}`,
        action: onReceipt ? { label: "Чек", onClick: () => onReceipt(r.id) } : undefined,
      });
      onOpenChange(false);
      onSaved();
    } catch (err) { toast.error((err as Error).message); } finally { lock.current = false; setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="v3-modal v3-ap sm:max-w-[520px]">
        <DialogTitle className="v3-modal-title"><span className="v3-hide-mobile">Додати оплату</span><span className="v3-only-mobile">Записати оплату</span>{step && <span className="v3-ap-step v3-only-mobile">{step}</span>}</DialogTitle>
        <DialogDescription className="v3-modal-sub"><span className="v3-hide-mobile">@{username} · ручний облік у гривнях, банківська транзакція не перевіряється.</span><span className="v3-only-mobile v3-ap-who">@{username}{planCls(planLabel) && <span className={`v3-ap-ptag is-${planCls(planLabel)}`}>{planLabel}</span>}{endDate ? ` · до ${dShortUk(endDate)}` : ""}</span></DialogDescription>
        <form onSubmit={save} className="v3-form">
          <fieldset disabled={busy} className="v3-form-grid">
            <div className="v3-apg"><p className="v3-apg-t v3-only-mobile">Сума й дата</p>
            <div className="v3-field"><label htmlFor="pay-amount">Сума, ₴</label><input id="pay-amount" required inputMode="decimal" pattern="[0-9]{1,9}([.,][0-9]{1,2})?" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="300" /></div>
            <div className="v3-field"><label id="pay-date-l">Дата оплати</label><DateField id="pay-date" labelledBy="pay-date-l" required max={today()} value={form.paidOn} onChange={(v) => setForm({ ...form, paidOn: v })} /></div>
            </div>
            <div className="v3-apg"><p className="v3-apg-t v3-only-mobile">Період підписки</p>
            <div className="v3-field"><label id="pay-from-l"><span className="v3-hide-mobile">Період: від</span><span className="v3-only-mobile">Від</span></label><DateField id="pay-from" labelledBy="pay-from-l" required max={form.periodEnd} value={form.periodStart} onChange={(v) => setForm({ ...form, periodStart: v })} /></div>
            <div className="v3-field"><label id="pay-to-l">До включно</label><DateField id="pay-to" labelledBy="pay-to-l" required min={form.periodStart} value={form.periodEnd} onChange={(v) => setForm({ ...form, periodEnd: v })} /></div>
            {form.extendSubscription && form.periodStart && <p className="v3-apg-hint v3-only-mobile">Продовжить поточну підписку з {dShortUk(form.periodStart)}</p>}
            </div>
            <div className="v3-apg"><p className="v3-apg-t v3-only-mobile">Деталі</p>
            <div className="v3-field v3-span2 v3-ap-note"><label htmlFor="pay-note">Примітка</label><textarea id="pay-note" rows={2} maxLength={1000} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Необов’язково" /></div>
            <div className="v3-field v3-span2"><span className="v3-label" id="pay-m-l">Спосіб</span><div className="v3-chipset" role="group" aria-labelledby="pay-m-l">{METHODS.map((m) => <button key={m} type="button" className={form.paymentMethod === m ? "is-on" : ""} aria-pressed={form.paymentMethod === m} onClick={() => setForm({ ...form, paymentMethod: m })}><span className="v3-hide-mobile">{m}</span><span className="v3-only-mobile v3-ap-mc"><b>{METHOD_CARD[m]?.[0] || m}</b><small>{METHOD_CARD[m]?.[1] || ""}</small></span></button>)}</div></div>
            <div className="v3-field v3-span2"><label htmlFor="pay-promo">Промокод</label>
              <div className="v3-promo-row"><span key={promo.shake} className={`v3-promo-in${promo.state === "ok" ? " is-ok" : ""}${promo.state === "bad" ? " is-bad" : ""}`}><input id="pay-promo" value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); if (promo.state !== "idle") { setPromo((p) => ({ state: "idle", shake: p.shake })); if (promo.base) setForm((f) => ({ ...f, amount: String(promo.base), promoCode: "" })); } }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyPromo(); } }} placeholder="Напр., MATCHIQ20" autoComplete="off" aria-invalid={promo.state === "bad"} aria-describedby="pay-promo-m" /></span><button type="button" className={`v3-btn v3-btn-dark${promo.state === "busy" ? " is-busy" : ""}`} onClick={applyPromo} disabled={!code.trim() || promo.state === "busy"}>{promo.state === "busy" ? "Перевіряємо…" : "Застосувати"}</button></div>
              <span id="pay-promo-m" role="status" aria-live="polite">{promo.state === "bad" && <span className="v3-field-error">{promo.msg}</span>}{promo.state === "ok" && <span className="v3-promo-price"><span className="v3-promo-old">{(promo.base || 0).toLocaleString("uk-UA")} ₴</span><span className="v3-promo-new">{Number(form.amount).toLocaleString("uk-UA")} ₴</span><span className="v3-promo-pct">−{promo.pct}%</span></span>}</span>
            </div>
            </div>
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
              <button type="submit" className="v3-btn v3-btn-primary" disabled={busy}>{busy ? "Збереження…" : <><span className="v3-hide-mobile">{form.extendSubscription ? "Записати й продовжити" : "Записати оплату"}</span><span className="v3-only-mobile">{Number(String(form.amount).replace(",", ".")) > 0 ? `Записати ${Number(String(form.amount).replace(",", ".")).toLocaleString("uk-UA")} ₴` : "Записати оплату"}</span></>}</button>
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
      toast.success(`Оплату №${payment.id} скасовано`, { description: "Запис лишився в історії, термін підписки без змін" });
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
export function ReceiptDialog({ data, username, onOpenChange, sendBlock = null }: { data: { image: string; payment: Payment } | null; username: string; onOpenChange: (o: boolean) => void; /** Why «У Telegram» is off (no Telegram / bot not started), or null. */ sendBlock?: string | null }) {
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
      form.append("photo", new File([blob], `${receiptNo(data.payment.id)}.png`, { type: "image/png" }));
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
        <div className="v3-receipt">{data && <img src={data.image} alt={`Чек оплати № ${receiptNo(data.payment.id)}`} />}</div>
        <div className="v3-receipt-tools">
          <button type="button" className="v3-btn v3-btn-ghost" onClick={() => data && savePaymentReceipt(data.image, data.payment.id)}><Download size={15} aria-hidden="true" /><span className="v3-hide-mobile">Завантажити PNG</span><span className="v3-only-mobile">Зберегти PNG</span></button>
          <button type="button" className="v3-btn v3-btn-ghost v3-hide-mobile" onClick={copy}><Copy size={15} aria-hidden="true" />Копіювати</button>
          <button type="button" className="v3-btn v3-btn-blue v3-receipt-send" onClick={send} disabled={sending || !!sendBlock} title={sendBlock || undefined}><Send size={15} aria-hidden="true" />{sending ? "Надсилаємо…" : <><span className="v3-hide-mobile">Надіслати в Telegram</span><span className="v3-only-mobile">У Telegram</span></>}</button>
        </div>
        {sendBlock && <p className="v3-receipt-note" role="note">{sendBlock}</p>}
      </DialogContent>
    </Dialog>
  );
}
