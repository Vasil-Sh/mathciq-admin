import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Search, X } from "lucide-react";
import { toast } from "sonner";
import UserAvatar from "@/components/UserAvatar";
import { DateField } from "@/components/ui/date-field";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/apiClient";
import { uuid } from "@/lib/uuid";
import { plural } from "@/lib/dashboardInsights";
import { daysLeft, isAdmin, planCell, statusOf } from "@/lib/usersModel";
import { dShort, kyivToday, money, STATUS, type PaymentRow } from "@/lib/paymentsModel";
import type { AdminUserOverview, AppSettings } from "@/types";

const addDays = (v: string, n: number) => { const d = new Date(`${v}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const num = (s: string | number | null | undefined) => Number(String(s ?? "").replace(",", ".")) || 0;
/** Light status tag classes for the web. */
export const PAY_TAG: Record<string, string> = { recorded: "is-green", refunded: "is-red", cancelled: "is-grey" };
/** «переказ на картку», «monobank · банка», «готівка». */
export const methodText = (m?: string | null) => { const v = (m || "").toLowerCase(); return !v ? "—" : v.includes("моно") || v.includes("mono") ? "monobank · банка" : v.includes("карт") ? "переказ на картку" : v.includes("готів") ? "готівка" : v; };
export const userLine = (u: AdminUserOverview) => { const st = statusOf(u); const p = planCell(u, null).plan; return st === "cancelled" ? `${p} · скасовано ${dShort(u.subscriptionCancelledAt || u.cancelledAt || u.endDate)}` : st === "ended" ? `${p} · закінчилась ${dShort(u.endDate)}` : `${p} · до ${dShort(u.endDate)}`; };

const METHODS: [string, string, string][] = [["Переказ на картку", "Картка", "переказ"], ["Монобанк", "monobank", "банка"], ["Готівка", "Інше", "готівка…"]];

/** «Записати оплату» on the web: step 1 — who, step 2 — sum, period, method, promo code (design «Веб — записати оплату, крок 1/2»). */
export function RecordPaymentWeb({ open, users, settings, user: preset, onOpenChange, onSaved }: { open: boolean; users: AdminUserOverview[]; settings: AppSettings | null; user?: AdminUserOverview | null; onOpenChange: (o: boolean) => void; onSaved: (id: string) => void }) {
  const days = settings?.subscriptionDays || 30;
  const [step, setStep] = useState<1 | 2>(1);
  const [q, setQ] = useState("");
  const [who, setWho] = useState<AdminUserOverview | null>(null);
  const [f, setF] = useState({ amount: "", paidOn: kyivToday(), from: "", to: "", method: "Переказ на картку", promo: "" });
  const [promo, setPromo] = useState<{ state: "idle" | "busy" | "ok" | "bad"; base?: number; pct?: number; msg?: string }>({ state: "idle" });
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => { if (!open) return; setQ(""); setWho(preset || null); setStep(preset ? 2 : 1); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!who) return;
    const end = who.endDate?.slice(0, 10) || "";
    const start = end && end >= kyivToday() ? addDays(end, 1) : kyivToday();
    const price = Number(who.priceMonth) > 0 && who.plan !== "trial" ? Number(who.priceMonth) : who.plan === "pro" ? settings?.proPrice || 600 : settings?.basicPrice || 300;
    setF({ amount: String(price), paidOn: kyivToday(), from: start, to: addDays(start, days - 1), method: "Переказ на картку", promo: "" });
    setPromo({ state: "idle" });
  }, [who?.id, days]); // eslint-disable-line react-hooks/exhaustive-deps
  const s = q.trim().toLowerCase().replace(/^@/, "");
  const list = useMemo(() => users.filter((u) => !isAdmin(u) && (!s || u.username.toLowerCase().includes(s) || (u.telegram || "").toLowerCase().includes(s)))
    .sort((a, b) => (a.endDate || "9999").localeCompare(b.endDate || "9999")).slice(0, 8), [users, s]);
  const end = who?.endDate?.slice(0, 10) || "";
  const live = !!end && end >= kyivToday();
  const sum = num(f.amount);

  async function applyPromo() {
    const c = f.promo.trim().toUpperCase();
    if (!c || promo.state === "busy" || promo.state === "ok") return;
    const base = sum;
    setPromo({ state: "busy" });
    try {
      const r = await api.post<{ promoCode: { code: string; discountPercent: number } }>("/admin/promo-codes/validate", { code: c });
      const pct = Number(r.promoCode?.discountPercent) || 0;
      setF((x) => ({ ...x, promo: r.promoCode?.code || c, amount: String(Math.round(base * (100 - pct)) / 100) }));
      setPromo({ state: "ok", base, pct });
    } catch (e) { setPromo({ state: "bad", msg: (e as Error).message || "Код не підходить або закінчився" }); }
  }
  async function save() {
    if (!who || lock.current || sum <= 0) return;
    if (f.promo.trim() && promo.state !== "ok") { await applyPromo(); return; }
    lock.current = true; setBusy(true);
    try {
      const r = await api.post<{ id: string }>(`/admin/users/${who.id}/payments`, { requestId: uuid(), amount: String(sum), paidOn: f.paidOn, periodStart: f.from, periodEnd: f.to, note: "", extendSubscription: true, paymentMethod: f.method, promoCode: promo.state === "ok" ? f.promo : "" });
      toast.success(`Оплату №${r.id} записано · ${money(sum)}`, { description: `@${who.username} · ${planCell(who, null).plan} до ${dShort(f.to)}` });
      onOpenChange(false); onSaved(r.id);
    } catch (e) {
      toast.error("Не вдалося записати оплату", { description: navigator.onLine ? (e as Error).message : "Сервер не відповідає — дані не втрачено", action: { label: "Ще раз", onClick: () => save() } });
    } finally { lock.current = false; setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="v3-modal v3-uwm v3-pwm sm:max-w-[500px]" onOpenAutoFocus={(e) => { e.preventDefault(); window.setTimeout(() => document.getElementById(step === 1 ? "pwr-q" : "pwr-sum")?.focus(), 0); }}>
        <DialogTitle className="v3-modal-title">Записати оплату <span className="v3-pwm-steps" aria-hidden="true"><i className="is-on" /><i className={step === 2 ? "is-on" : ""} /></span></DialogTitle>
        <DialogDescription className="v3-modal-sub">{step === 1 ? "Крок 1 з 2 · Кому? Гроші вже отримано поза адмінкою — тут лише запис." : "Крок 2 з 2"}</DialogDescription>
        {step === 1 ? <>
          <label className="v3-uw-search v3-pwm-q"><Search size={15} aria-hidden="true" /><input id="pwr-q" type="search" aria-label="Пошук користувача" placeholder="Логін або Telegram" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <p className="v3-pwm-l">Спершу ті, у кого скоро закінчується</p>
          <div className="v3-pwm-pick" role="listbox" aria-label="Користувачі">
            {list.length ? list.map((u, i) => (
              <button key={u.id} type="button" role="option" aria-selected={who?.id === u.id} className={who?.id === u.id ? "is-on" : ""} style={{ animationDelay: `${Math.min(i, 8) * 25}ms` }} onClick={() => setWho(u)} onDoubleClick={() => { setWho(u); setStep(2); }}>
                <UserAvatar username={u.username} telegram={u.telegram} />
                <span><b>@{u.username}</b><small>{userLine(u)}</small></span>
                {who?.id === u.id && <Check size={16} strokeWidth={2.6} aria-hidden="true" />}
              </button>
            )) : <p className="v3-pwm-none">Нікого не знайдено</p>}
          </div>
          <div className="v3-uwm-foot">
            <span>Немає в списку? Спершу <Link to="/users" onClick={() => onOpenChange(false)}>створіть користувача</Link></span>
            <div><button type="button" className="v3-uwb" onClick={() => onOpenChange(false)}>Скасувати</button><button type="button" className="v3-uwb is-green" disabled={!who} onClick={() => setStep(2)}>Далі<ArrowRight size={14} aria-hidden="true" /></button></div>
          </div>
        </> : who && <>
          <div className="v3-pwm-who"><UserAvatar username={who.username} telegram={who.telegram} /><span><b>@{who.username}</b><small>{userLine(who)}</small></span>{!preset && <button type="button" className="v3-uwb is-white" onClick={() => setStep(1)}>Змінити</button>}</div>
          <fieldset disabled={busy} className="v3-pwm-form">
            <div className="v3-pwm-2">
              <label className="v3-uwm-f"><span>Сума, ₴</span><input id="pwr-sum" inputMode="decimal" value={f.amount} onChange={(e) => { setF({ ...f, amount: e.target.value }); if (promo.state === "ok") setPromo({ state: "idle" }); }} /></label>
              <div className="v3-uwm-f"><span id="pwr-d-l">Дата оплати</span><DateField id="pwr-d" labelledBy="pwr-d-l" max={kyivToday()} value={f.paidOn} onChange={(v) => setF({ ...f, paidOn: v })} /></div>
              <div className="v3-uwm-f"><span id="pwr-f-l">Період: від</span><DateField id="pwr-f" labelledBy="pwr-f-l" max={f.to} value={f.from} onChange={(v) => setF({ ...f, from: v })} /></div>
              <div className="v3-uwm-f"><span id="pwr-t-l">До включно</span><DateField id="pwr-t" labelledBy="pwr-t-l" min={f.from} value={f.to} onChange={(v) => setF({ ...f, to: v })} /></div>
            </div>
            <p className="v3-pwm-info">{live ? `Продовжить поточну підписку з ${dShort(f.from)}` : `Підписка почнеться ${f.from === kyivToday() ? "сьогодні" : `з ${dShort(f.from)}`}`}</p>
            <p className="v3-uwm-l">Спосіб</p>
            <div className="v3-uwm-opts">{METHODS.map(([v, t, sub]) => <button key={v} type="button" className={f.method === v ? "is-on" : ""} aria-pressed={f.method === v} onClick={() => setF({ ...f, method: v })}><b>{t}</b><small>{sub}</small></button>)}</div>
            <label className="v3-uwm-f"><span>Промокод</span><input className={promo.state === "ok" ? "is-ok" : promo.state === "bad" ? "is-bad" : undefined} value={f.promo} placeholder="Напр., MATCHIQ20" autoComplete="off" onChange={(e) => { const v = e.target.value.toUpperCase(); if (promo.state === "ok" && promo.base) setF({ ...f, promo: v, amount: String(promo.base) }); else setF({ ...f, promo: v }); setPromo({ state: "idle" }); }} onBlur={applyPromo} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyPromo(); } }} />
              <small className={`v3-pwm-hint${promo.state === "bad" ? " is-bad" : promo.state === "ok" ? " is-ok" : ""}`} role="status">{promo.state === "busy" ? "Перевіряємо…" : promo.state === "bad" ? promo.msg : promo.state === "ok" ? `−${promo.pct}% · було ${money(promo.base || 0)}` : "сума зі знижкою порахується сама"}</small>
            </label>
          </fieldset>
          <div className="v3-uwm-foot">
            <span>Запишеться в журнал дій</span>
            <div><button type="button" className="v3-uwb" disabled={busy} onClick={() => (preset ? onOpenChange(false) : setStep(1))}>{preset ? "Скасувати" : "Назад"}</button><button type="button" className="v3-uwb is-green" disabled={busy || sum <= 0} onClick={save}>{busy ? "Записуємо…" : `Записати ${money(sum)}`}</button></div>
          </div>
        </>}
      </DialogContent>
    </Dialog>
  );
}

/** «Повернути гроші» on the web (design «Веб — повернути гроші»). */
export function RefundWeb({ row, open, onOpenChange, onDone }: { row: PaymentRow | null; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const full = num(row?.amount);
  const [mode, setMode] = useState<"full" | "part">("full");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const unused = (() => {
    if (!row) return 0;
    const a = Date.parse(`${row.periodStart}T12:00:00Z`), b = Date.parse(`${row.periodEnd}T12:00:00Z`), t = Date.parse(`${kyivToday()}T12:00:00Z`);
    const total = Math.round((b - a) / 864e5) + 1, left = Math.max(0, Math.min(total, Math.round((b - t) / 864e5) + 1));
    return total > 0 ? Math.round((full * left) / total) : 0;
  })();
  useEffect(() => { if (open) { setMode("full"); setAmount(String(full)); setReason(""); } }, [open, full]);
  const value = num(amount);
  const valid = value > 0 && value <= full && !!reason.trim();
  async function save() {
    if (!row || !valid || busy) return;
    setBusy(true);
    try {
      await api.post(`/admin/payments/${row.id}/refund`, { amount: value, reason: reason.trim() });
      toast.success(`Повернення ${money(value)} записано`, { description: `@${row.username} · підписку скасовано` });
      onOpenChange(false); onDone();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="v3-modal v3-uwm v3-pwm sm:max-w-[480px]" onOpenAutoFocus={(e) => { e.preventDefault(); document.getElementById("pwf-why")?.focus(); }}>
        <DialogTitle className="v3-modal-title">Повернути гроші</DialogTitle>
        <DialogDescription className="v3-modal-sub">{row ? `@${row.username} · оплата №${row.id} · ${money(full)} · ${dShort(row.paidOn)}` : ""}</DialogDescription>
        <div className="v3-uwm-opts is-2">
          <button type="button" className={mode === "full" ? "is-on" : ""} aria-pressed={mode === "full"} onClick={() => { setMode("full"); setAmount(String(full)); }}><b>Повністю</b><small>{money(full)}</small></button>
          <button type="button" className={mode === "part" ? "is-on" : ""} aria-pressed={mode === "part"} onClick={() => { setMode("part"); setAmount(String(unused || "")); }}><b>Частково</b><small>за невикористані дні</small></button>
        </div>
        <div className="v3-pwm-2">
          <label className="v3-uwm-f"><span>Сума повернення, ₴</span><input inputMode="decimal" value={amount} aria-invalid={value > full} onChange={(e) => { setAmount(e.target.value); setMode("part"); }} /></label>
          <label className="v3-uwm-f"><span>Дата</span><input value={kyivToday().split("-").reverse().join(".")} readOnly /></label>
        </div>
        {value > full && <p className="v3-pwm-hint is-bad">Не більше за оплату — {money(full)}.</p>}
        <label className="v3-uwm-f"><span>Причина <i className="v3-pwm-req">*</i></span><textarea id="pwf-why" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Наприклад: передумав у перші 3 дні" /></label>
        <p className="v3-pwm-warn">Підписку буде скасовано одразу. Гроші ви повертаєте самі — картка, переказ.</p>
        <div className="v3-uwm-foot">
          <span>Запишеться в журнал дій і в «Повернення»</span>
          <div><button type="button" className="v3-uwb" disabled={busy} onClick={() => onOpenChange(false)}>Скасувати</button><button type="button" className="v3-uwb is-red" disabled={!valid || busy} onClick={save}>{busy ? "Записуємо…" : `Повернути ${money(value || 0)}`}</button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** «Скасувати запис №…?» — a mistaken record (design «Веб — скасувати запис»). */
export function CancelRecordWeb({ row, line, open, onOpenChange, onDone, onRefund }: { row: PaymentRow | null; line: string; open: boolean; onOpenChange: (o: boolean) => void; onDone: (reason: string) => void; onRefund: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setReason(""); }, [open]);
  async function save() {
    if (!row || !reason.trim() || busy) return;
    setBusy(true);
    try {
      await api.post(`/admin/payments/${row.id}/cancel`, { reason: reason.trim() });
      toast.success(`Запис №${row.id} скасовано`, { description: `@${row.username} · ${money(num(row.amount))} не рахуються в оплатах` });
      onOpenChange(false); onDone(reason.trim());
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="v3-modal v3-uwm v3-pwm sm:max-w-[460px]" onOpenAutoFocus={(e) => { e.preventDefault(); document.getElementById("pwc-why")?.focus(); }}>
        <DialogTitle className="v3-modal-title">Скасувати запис №{row?.id}?</DialogTitle>
        <DialogDescription className="v3-modal-sub">Для помилкових записів, наприклад дубля. Сума не рахуватиметься в «Отримано», підписка повернеться як до запису.</DialogDescription>
        <p className="v3-pwm-row"><span>{line}</span><b>{money(num(row?.amount))}</b></p>
        <label className="v3-uwm-f"><span>Причина <i className="v3-pwm-req">*</i></span><input id="pwc-why" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Наприклад: дубль запису №131" onKeyDown={(e) => { if (e.key === "Enter") save(); }} /></label>
        <div className="v3-uwm-foot">
          <span>Гроші людині повертали? Тоді <button type="button" className="v3-pwm-link" onClick={() => { onOpenChange(false); onRefund(); }}>«Повернути гроші»</button>, а не скасування</span>
          <div><button type="button" className="v3-uwb" disabled={busy} onClick={() => onOpenChange(false)}>Залишити оплату</button><button type="button" className="v3-uwb is-red" disabled={!reason.trim() || busy} onClick={save}>{busy ? "Скасовуємо…" : "Скасувати запис"}</button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** «Оплати користувача» — a panel on the right (design «Веб — оплати користувача»). */
export function UserPaymentsWeb({ who, user, rows, online, onClose, onRecord, onPro, onRefund, onCancelSub, canRefund }: {
  who: string; user?: AdminUserOverview; rows: PaymentRow[] | null; online: boolean; canRefund: boolean;
  onClose: () => void; onRecord: () => void; onPro: () => void; onRefund: () => void; onCancelSub: () => void;
}) {
  const list = (rows || []).slice().sort((a, b) => Number(b.id) - Number(a.id));
  const ok = list.filter((p) => p.status === "recorded");
  const got = ok.reduce((x, p) => x + num(p.amount), 0);
  const back = list.reduce((x, p) => x + num(p.refundedAmount), 0);
  const nBack = list.filter((p) => p.status === "refunded").length;
  const st = user ? statusOf(user) : null;
  const dl = user?.endDate ? daysLeft(user) : null;
  const line = !user ? "Користувача не знайдено — лише історія оплат" : isAdmin(user) ? "Адміністратор" : `${planCell(user, null).plan} · ${st === "cancelled" ? "скасована" : st === "ended" ? "закінчилась" : "активна"} до ${dShort(user.endDate)}${dl !== null && dl >= 0 ? ` · ще ${dl} ${plural(dl, "день", "дні", "днів")}` : ""}`;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="v3-aupanel v3-pwu" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="v3-pwu-h">
          <UserAvatar username={who} telegram={user?.telegram} />
          <div><DialogTitle>@{who}</DialogTitle><DialogDescription>{line}</DialogDescription></div>
          <button type="button" className="v3-aup-x" aria-label="Закрити" onClick={onClose}><X size={16} aria-hidden="true" /></button>
        </div>
        <div className="v3-pwu-body">
          <div className="v3-pwu-tiles">
            <div><small>Отримано</small><b>{money(got)}</b><small>{ok.length} {plural(ok.length, "оплата", "оплати", "оплат")} · за весь час</small></div>
            <div><small>Повернено</small><b>{money(back)}</b><small>{nBack ? `${nBack} ${plural(nBack, "повернення", "повернення", "повернень")}` : "жодного повернення"}</small></div>
          </div>
          {user && !isAdmin(user) && (
            <div className="v3-pwu-acts">
              <button type="button" className="v3-uwb is-green" disabled={!online} onClick={onRecord}>Записати оплату</button>
              <button type="button" className="v3-uwb" disabled={!online || st === "blocked"} onClick={onPro}>Pro на N днів</button>
              <button type="button" className="v3-uwb" disabled={!online || !canRefund} title={canRefund ? undefined : "Немає записаної оплати"} onClick={onRefund}>Повернути</button>
              <button type="button" className="v3-uwb is-red" disabled={!online || !["active", "soon", "urgent", "trial"].includes(st || "")} onClick={onCancelSub}>Скасувати підписку</button>
            </div>
          )}
          <p className="v3-pwu-l">Оплати · {list.length}</p>
          {rows === null ? [0, 1].map((i) => <div key={i} className="v3-aup-card is-skel" aria-hidden="true"><i /><i /></div>)
            : list.length ? list.map((p, i) => (
              <div key={p.id} className="v3-pwu-card" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
                <span><b>{dShort(p.paidOn)}{p.paidOn ? ` ${p.paidOn.slice(0, 4) !== kyivToday().slice(0, 4) ? p.paidOn.slice(0, 4) : ""}` : ""} · №{p.id}</b><small>{methodText(p.paymentMethod)}{p.promoCode ? ` · ${p.promoCode}` : ""}</small></span>
                <strong className={p.status === "recorded" ? undefined : "v3-strk"}>{money(num(p.amount))}</strong>
                <span className={`v3-uwt ${PAY_TAG[p.status]}`}>{STATUS[p.status].label}</span>
              </div>
            )) : <p className="v3-aup-empty">Оплат ще немає.</p>}
        </div>
        <Link to={`/users?q=${encodeURIComponent(who)}`} className="v3-pwu-go">Картка користувача <ArrowRight size={15} aria-hidden="true" /></Link>
      </DialogContent>
    </Dialog>
  );
}
