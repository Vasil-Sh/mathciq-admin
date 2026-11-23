import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowDown, Ban, ArrowRight, ArrowUp, Check, CreditCard, Crown, Plus, Receipt, RotateCcw, Banknote, Search, Undo2, SearchX, Shuffle, Tag, Trash2, WifiOff, X } from "lucide-react";
import { toast } from "sonner";
import PillTrack from "@/components/PillTrack";
import RollingNumber from "@/components/RollingNumber";
import UndoRing from "@/components/UndoRing";
import ExportCsvButton from "@/components/ExportCsvButton";
import UserAvatar from "@/components/UserAvatar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dropdown } from "@/components/ui/dropdown";
import { DateField } from "@/components/ui/date-field";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AddPaymentDialog, ReceiptDialog, type Payment } from "@/components/users/PaymentDialogs";
import { CancelSubscriptionDialog, GrantProDialog, RefundDialog } from "@/components/users/UserActionDialogs";
import { api } from "@/lib/apiClient";
import { fetchUsersOverview } from "@/lib/adminBetsApi";
import { fetchSettings } from "@/lib/adminSettingsApi";
import { createPaymentReceipt } from "@/lib/paymentReceipt";
import { downloadCsv } from "@/lib/csv";
import { plural } from "@/lib/dashboardInsights";
import { daysLeft, endsWithoutRenewal, isAdmin, planCell, statusOf, statusUi } from "@/lib/usersModel";
import { usePageSearch, isPhoneWidth } from "@/lib/pageSearch";
import {
  dayLabel, dShort, fetchPayments, fetchPromoCodes, kyivMonth, kyivToday, money, monthGen, monthName, monthShort, pct, period, PLAN_LABEL,
  PROMO_UI, promoState, shiftMonth, STATUS, type PaymentRow, type PayStatus, type PromoCode, deltaVs,
} from "@/lib/paymentsModel";
import type { AdminUserOverview, AppSettings } from "@/types";

type Tab = "pay" | "ref" | "promo";
type Filt = "all" | PayStatus;
type Sort = "no-desc" | "no-asc" | "sum-desc" | "sum-asc";

function useMedia(q: string) {
  const [m, setM] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => { const mm = window.matchMedia(q); const f = () => setM(mm.matches); mm.addEventListener("change", f); return () => mm.removeEventListener("change", f); }, [q]);
  return m;
}
function useOnline() {
  const [on, setOn] = useState(() => navigator.onLine);
  useEffect(() => { const a = () => setOn(true), b = () => setOn(false); window.addEventListener("online", a); window.addEventListener("offline", b); return () => { window.removeEventListener("online", a); window.removeEventListener("offline", b); }; }, []);
  return on;
}
const num = (p: PaymentRow) => Number(p.amount) || 0;
const asPayment = (p: PaymentRow): Payment => ({ id: p.id, amount: p.amount, paidOn: p.paidOn, periodStart: p.periodStart, periodEnd: p.periodEnd, note: p.note, createdBy: p.createdBy, status: p.status, cancelReason: p.cancelReason, cancelledBy: p.cancelledBy, extendSubscription: p.extendSubscription, username: p.username });

/** «Зміна до попереднього періоду» chip; the % itself comes from deltaVs (lib/paymentsModel). */
/** `bad`: growth is a loss for us (refunds) — up is red, down is green. The arrow still shows the direction. */
function Delta({ d, on, vs, bad = false }: { d: number | null; on?: boolean; vs: string; bad?: boolean }) {
  if (d === null) return null;
  const good = bad ? d < 0 : d > 0;
  return <><span className={`v3-dl ${on ? "is-onblue " : ""}${d === 0 ? "is-flat" : good ? "is-up" : "is-down"}${d < 0 ? " is-neg" : ""}`} title={`до ${vs}`}><ArrowUp size={10} strokeWidth={3} aria-hidden="true" />{`${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d).toLocaleString("uk-UA", { maximumFractionDigits: 1 })}%`}</span><span className="sr-only">{d >= 0 ? "зростання" : "падіння"} до {vs}{bad && d > 0 ? " (погано)" : ""} </span></>;
}

/** Search field on the «Повернення» and «Промокоди» tabs (same look as on the payments list). */
/** Phone: a dark search above the card. Wide screen (inline): a compact light search in the card header, like «Оплати». */
function PaneSearch({ value, onChange, label, placeholder, inline = false }: { value: string; onChange: (v: string) => void; label: string; placeholder: string; inline?: boolean }) {
  return <label className={inline ? "v3-search v3-pay-hsearch" : "v3-msearch v3-pay-psearch"}><Search size={16} aria-hidden="true" /><input type="search" aria-label={label} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />{value && <button type="button" onClick={() => onChange("")} aria-label="Очистити пошук"><X size={14} /></button>}</label>;
}

/** Payment method on the phone list: icon + short label (design «№4 · картка»). */
const methodLabel = (m?: string | null) => { const v = (m || "").toLowerCase(); return !v ? "оплата" : v.includes("моно") || v.includes("mono") ? "monobank" : v.includes("карт") ? "картка" : v.includes("готів") ? "готівка" : v; };
function methodIcon(m?: string | null) {
  const v = methodLabel(m);
  if (v === "monobank") return <span className="v3-pay-mi is-mono" aria-hidden="true">m</span>;
  if (v === "картка") return <span className="v3-pay-mi" aria-hidden="true"><CreditCard size={14} /></span>;
  if (v === "готівка") return <span className="v3-pay-mi is-cash" aria-hidden="true"><Banknote size={14} /></span>;
  return null;
}

export default function Payments() {
  const wide = useMedia("(min-width: 1180px)");
  const phone = useMedia("(max-width: 767px)");
  const [payStep, setPayStep] = useState(false);
  const online = useOnline();
  // ?tab=ref|promo opens that tab (Dashboard «Скасування» → refunds)
  const [tab, setTab] = useState<Tab>(() => { const t = new URLSearchParams(window.location.search).get("tab"); return t === "ref" || t === "promo" ? t : "pay"; });
  const [month, setMonth] = useState(kyivMonth);
  const [qRef, setQRef] = useState("");
  const [qPromo, setQPromo] = useState("");
  const [rows, setRows] = useState<PaymentRow[] | null>(null);
  const [prevRows, setPrevRows] = useState<PaymentRow[]>([]);
  const [refunds, setRefunds] = useState<PaymentRow[] | null>(null);
  const [promos, setPromos] = useState<PromoCode[] | null>(null);
  const [users, setUsers] = useState<AdminUserOverview[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [rk, setRk] = useState(0); // re-run the list entrance
  const [q, setQ] = useState("");
  // Phone: the 🔍 in the header searches the open tab (design PaymentsMobileSearch)
  const pageSearch = usePageSearch(tab === "pay" ? "№, логін або промокод" : tab === "ref" ? "Логін або причина" : "Код промокоду");
  useEffect(() => { if (!isPhoneWidth()) return; if (tab === "pay") setQ(pageSearch.q); else if (tab === "ref") setQRef(pageSearch.q); else setQPromo(pageSearch.q); }, [pageSearch.q]); // eslint-disable-line react-hooks/exhaustive-deps
  const [filt, setFilt] = useState<Filt>("all");
  const [sort, setSort] = useState<Sort>("no-desc");
  const [selId, setSelId] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const [cx, setCx] = useState<"" | "ask" | "busy">("");
  const [del, setDel] = useState<"" | "ask" | "busy">("");
  const [pick, setPick] = useState(false);
  const [payFor, setPayFor] = useState<AdminUserOverview | null>(null);
  const [refundFor, setRefundFor] = useState<PaymentRow | null>(null);
  const [receipt, setReceipt] = useState<{ image: string; payment: Payment; username: string } | null>(null);
  const [receiptBusy, setReceiptBusy] = useState("");
  const [shown, setShown] = useState(12);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [params, setParams] = useSearchParams();
  const who = (params.get("user") || "").replace(/^@/, "");
  const [userDlg, setUserDlg] = useState<null | "pro" | "refund" | "cancel">(null);

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setLoading(true);
    try {
      if (who) {
        const all = await fetchPayments("");
        setRows(all.payments.filter((p) => (p.username || "").toLowerCase() === who.toLowerCase())); setPrevRows([]); setError("");
      } else {
        const [cur, prev] = await Promise.all([fetchPayments(month), fetchPayments(shiftMonth(month, -1))]);
        setRows(cur.payments); setPrevRows(prev.payments); setError("");
      }
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [month, who]);
  const loadSide = useCallback(() => {
    fetchPayments("", "refunded").then((r) => setRefunds(r.payments)).catch(() => setRefunds([]));
    fetchPromoCodes().then(setPromos).catch(() => setPromos([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadSide(); fetchUsersOverview().then(setUsers).catch(() => {}); fetchSettings().then(setSettings).catch(() => {}); }, [loadSide]);

  // План оплати: за сумою (з урахуванням знижки промокоду) — найближча ціна з Налаштувань.
  const planOf = useCallback((p: PaymentRow, u?: AdminUserOverview) => {
    const pc = (promos || []).find((x) => x.code.toUpperCase() === (p.promoCode || "").toUpperCase());
    const base = pc ? num(p) / (1 - pc.discountPercent / 100) : num(p);
    const b = settings?.basicPrice, pr = settings?.proPrice;
    if (b && pr) return Math.abs(base - pr) < Math.abs(base - b) ? "Pro" : "Базова";
    return u && !isAdmin(u) && u.plan !== "trial" ? planCell(u, null).plan : "—";
  }, [promos, settings]);
  const userOf = useCallback((p: PaymentRow) => (p.userId ? users.find((u) => u.id === p.userId && u.username === p.username) : undefined) || users.find((u) => u.username === p.username) || (p.userId ? users.find((u) => u.id === p.userId) : undefined), [users]);
  const all = rows || [];
  const cnt = (f: Filt) => all.filter((p) => f === "all" || p.status === f).length;
  const list = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/^[@№#]/, "");
    let r = all.filter((p) => (filt === "all" || p.status === filt) && (!s || String(p.id).includes(s) || (p.username || "").toLowerCase().includes(s) || (p.promoCode || "").toLowerCase().includes(s)));
    const by: Record<Sort, (a: PaymentRow, b: PaymentRow) => number> = {
      "no-desc": (a, b) => Number(b.id) - Number(a.id), "no-asc": (a, b) => Number(a.id) - Number(b.id),
      "sum-desc": (a, b) => num(b) - num(a) || Number(b.id) - Number(a.id), "sum-asc": (a, b) => num(a) - num(b) || Number(b.id) - Number(a.id),
    };
    r = r.slice().sort(by[sort]);
    return r;
  }, [all, q, filt, sort]);
  useEffect(() => { setShown(12); }, [q, filt, month]);
  const sel = useMemo(() => list.find((p) => p.id === selId) || (wide ? list[0] : undefined) || null, [list, selId, wide]);

  // Підсумки
  const recorded = (a: PaymentRow[]) => a.filter((p) => p.status === "recorded");
  const sumOf = (a: PaymentRow[]) => a.reduce((x, p) => x + num(p), 0);
  const refOf = (a: PaymentRow[]) => a.reduce((x, p) => x + (Number(p.refundedAmount) || 0), 0);
  const rec = recorded(all), prec = recorded(prevRows);
  const recSum = sumOf(rec), prevSum = sumOf(prec);
  const refSum = refOf(all), prevRef = refOf(prevRows);
  const avg = rec.length ? recSum / rec.length : 0, prevAvg = prec.length ? prevSum / prec.length : 0;
  const withPromo = rec.filter((p) => p.promoCode);
  const prevPromo = prec.filter((p) => p.promoCode).length;
  const plans = (() => { const pro = rec.filter((p) => planOf(p, userOf(p)) === "Pro").length; return rec.length ? `Pro ${Math.round((pro / rec.length) * 100)}% · Базова ${100 - Math.round((pro / rec.length) * 100)}%` : "—"; })();
  const topPromo = (() => { const m: Record<string, number> = {}; withPromo.forEach((p) => { m[p.promoCode] = (m[p.promoCode] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1])[0]?.[0] || ""; })();
  const vs = monthGen(shiftMonth(month, -1));
  // Phone KPI «Очікуємо»: paid subscriptions that end within 7 days and will renew
  const due = users.filter((u) => !isAdmin(u) && ["active", "soon", "urgent"].includes(statusOf(u)) && !endsWithoutRenewal(u) && !!u.endDate && daysLeft(u) >= 0 && daysLeft(u) <= 7);
  const dueSum = due.reduce((x, u) => x + (Number(u.priceMonth) || 0), 0);
  const sums = [
    { k: "recv", label: `Отримано за ${monthShort(month)}`, value: money(recSum), ...deltaVs(recSum, prevSum), note: `${rec.length} ${plural(rec.length, "оплата", "оплати", "оплат")}`, go: () => { setTab("pay"); setFilt("all"); setRk((x) => x + 1); } },
    { k: "ref", label: "Повернено", value: money(refSum), ...deltaVs(refSum, prevRef), note: refSum ? `${all.filter((p) => p.status === "refunded").length} ${plural(all.filter((p) => p.status === "refunded").length, "повернення", "повернення", "повернень")} · ${recSum ? Math.round((refSum / (recSum + refSum)) * 100) : 0}% від оплат` : "повернень немає", go: () => { setTab("pay"); setFilt("refunded"); setRk((x) => x + 1); } },
    { k: "avg", label: "Середня оплата", value: avg ? money(Math.round(avg)) : "—", ...(avg ? deltaVs(avg, prevAvg) : { d: null }), note: plans, go: undefined },
    { k: "promo", label: "За промокодами", value: String(withPromo.length), ...deltaVs(withPromo.length, prevPromo), note: withPromo.length ? `${plural(withPromo.length, "використання", "використання", "використань")}${topPromo ? ` · ${topPromo}` : ""}` : "промокоди не застосовували", go: () => setTab("promo") },
  ];
  if (who) { sums.forEach((x) => { x.d = null; }); sums[0].label = "Сплачено загалом"; }
  const sumOn = tab === "promo" ? "promo" : tab === "ref" || filt === "refunded" ? "ref" : filt === "all" ? "recv" : "";

  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(kyivMonth(), -i));
  const segs: { key: Filt; label: string }[] = [{ key: "all", label: "Усі" }, { key: "recorded", label: "Записано" }, { key: "cancelled", label: "Скасовано" }, { key: "refunded", label: "Повернено" }];
  const tabs: { key: Tab; label: string; n: number | null }[] = [
    { key: "pay", label: "Оплати", n: rows ? all.length : null },
    { key: "ref", label: "Повернення", n: refunds ? refunds.length : null },
    { key: "promo", label: "Промокоди", n: promos ? promos.length : null },
  ];
  const emptyPlatform = !who && rows !== null && !error && !all.length && !prevRows.length && month === kyivMonth() && (refunds?.length ?? 0) === 0;
  const whoUser = who ? users.find((u) => (u.username || "").toLowerCase() === who.toLowerCase()) : undefined;
  const lastRecorded = who ? all.filter((p) => p.status === "recorded").sort((a, b) => Number(b.id) - Number(a.id))[0] : undefined;
  const clearWho = () => { const n = new URLSearchParams(params); n.delete("user"); setParams(n, { replace: true }); setSelId(null); setRk((x) => x + 1); };

  function exportCsv() {
    downloadCsv(`matchiq-payments-${month}.csv`, ["№", "Користувач", "Сума, ₴", "Дата оплати", "Період з", "Період до", "Статус", "Спосіб", "Промокод", "Записав", "Повернено, ₴", "Причина"],
      list.map((p) => [p.id, p.username, num(p), p.paidOn, p.periodStart, p.periodEnd, STATUS[p.status].label, p.paymentMethod, p.promoCode, p.createdBy, p.refundedAmount || "", p.refundReason || p.cancelReason || ""]));
    toast.success("CSV завантажено", { id: "pay-csv", description: `matchiq-payments-${month}.csv · ${list.length} ${plural(list.length, "рядок", "рядки", "рядків")}` });
  }

  // «У Telegram» needs a Telegram handle and the user having started the bot (the bot can't write first).
  const receiptUser = receipt ? users.find((u) => u.username === receipt.username) : undefined;
  const receiptSendBlock = !receipt ? null
    : !receiptUser || !(receiptUser.telegram || "").trim() ? "У користувача не вказано Telegram — збережіть PNG і надішліть вручну."
    : receiptUser.telegramLinked === false ? "Користувач ще не запустив бота MatchIQ (/start) — бот не може написати першим. Збережіть PNG."
    : null;
  async function openReceipt(p: PaymentRow) {
    const u = userOf(p);
    setReceiptBusy(p.id);
    try { setReceipt({ image: await createPaymentReceipt(asPayment(p), { username: p.username, telegram: u?.telegram || "" }), payment: asPayment(p), username: p.username }); }
    catch (e) { toast.error((e as Error).message); } finally { setReceiptBusy(""); }
  }
  // «Скасувати запис» і кошик: спершу вікно підтвердження (як «Видалити користувача»)
  const [confirmFor, setConfirmFor] = useState<{ kind: "cx" | "del"; p: PaymentRow } | null>(null);
  async function cancelRecord(p: PaymentRow) {
    if (cx === "busy") return;
    setCx("busy");
    try {
      await api.post(`/admin/payments/${p.id}/cancel`, { reason: "Помилковий запис — скасовано в Оплатах" });
      setRows((r) => (r || []).map((x) => (x.id === p.id ? { ...x, status: "cancelled", cancelReason: "Помилковий запис — скасовано в Оплатах" } : x)));
      toast.success(`Запис №${p.id} скасовано`, { id: `cx-${p.id}`, description: `@${p.username} · ${money(num(p))} не рахуються в оплатах` });
      setConfirmFor(null); setSheet(false);
    } catch (e) { toast.error((e as Error).message); } finally { setCx(""); }
  }
  // Trash icon: removes the record completely (after the confirm dialog). Subscription dates are not touched.
  async function deleteRecord(p: PaymentRow) {
    if (del === "busy") return;
    setDel("busy");
    try {
      await api.delete(`/admin/payments/${p.id}`);
      setRows((r) => (r || []).filter((x) => x.id !== p.id));
      setRefunds((r) => (r ? r.filter((x) => x.id !== p.id) : r));
      setSelId(null);
      toast.success(`Запис №${p.id} видалено`, { id: `del-${p.id}`, description: `@${p.username} · ${money(num(p))} · залишився в журналі дій` });
      setConfirmFor(null); setSheet(false);
    } catch (e) { toast.error((e as Error).message); } finally { setDel(""); }
  }
  useEffect(() => { setCx(""); setDel(""); }, [sel?.id]);

  const promoMax = (p: PromoCode) => (p.usageLimit ? Math.min(100, Math.round((p.usedCount / p.usageLimit) * 100)) : Math.min(100, p.usedCount * 2));
  async function togglePromo(p: PromoCode) {
    const next = !p.active;
    setPromos((l) => (l || []).map((x) => (x.id === p.id ? { ...x, active: next } : x)));
    try {
      await api.put(`/admin/promo-codes/${p.id}`, { active: next });
      toast.success(next ? `Промокод ${p.code} увімкнено` : `Промокод ${p.code} вимкнено`, {
        id: `promo-${p.id}`, description: next ? "Його знову можна застосувати в оплаті" : "Більше не застосовується до нових оплат",
        action: { label: <UndoRing />, onClick: async () => { setPromos((l) => (l || []).map((x) => (x.id === p.id ? { ...x, active: !next } : x))); try { await api.put(`/admin/promo-codes/${p.id}`, { active: !next }); } catch (e) { toast.error((e as Error).message); } } },
      });
    } catch (e) { setPromos((l) => (l || []).map((x) => (x.id === p.id ? { ...x, active: !next } : x))); toast.error((e as Error).message); }
  }

  const detail = (p: PaymentRow, mobile = false) => {
    const u = userOf(p);
    const st = STATUS[p.status];
    return (
      <div key={`${p.id}-${p.status}`} className={`v3-pay-card${mobile ? " is-m" : ""}`} aria-live="polite">
        <div className="v3-pay-card-h">
          <div><span className="v3-pay-card-k">Оплата №{p.id}{mobile && ` · ${dShort(p.paidOn)}`}</span><strong className="v3-pay-card-sum"><span className={p.status === "recorded" ? "" : "v3-strk"}>{money(num(p))}</span></strong></div>
          <span className={`v3-tag ${st.cls}`}>{st.label}</span>
        </div>
        <dl className="v3-pay-dl">
          <div><dt>Користувач</dt><dd><Link className="v3-pay-link" to={`/users?q=${encodeURIComponent(p.username)}`}>@{p.username} <ArrowRight size={13} aria-hidden="true" /></Link></dd></div>
          <div><dt>План</dt><dd>{(() => { const pl = planOf(p, u); const c = pl === "Pro" ? "pro" : pl === "Базова" ? "basic" : pl.startsWith("Пробний") ? "trial" : ""; return mobile && c ? <span className={`v3-ptag is-${c}`}>{pl}</span> : pl; })()}</dd></div>
          <div><dt>Період</dt><dd>{period(p.periodStart, p.periodEnd)}</dd></div>
          <div><dt>Промокод</dt><dd>{p.promoCode || "без промокоду"}</dd></div>
          <div><dt>Спосіб</dt><dd>{p.paymentMethod || "—"}</dd></div>
          <div><dt>Записав</dt><dd>@{p.createdBy} · {dShort(p.paidOn)}</dd></div>
        </dl>
        {p.status === "refunded" && <div className="v3-pay-why"><strong>Повернено {money(Number(p.refundedAmount) || num(p))}:</strong> {p.refundReason || "—"}{p.refundedBy ? ` · @${p.refundedBy}` : ""}</div>}
        {p.status === "cancelled" && <div className="v3-pay-why"><strong>Причина:</strong> {p.cancelReason || "—"}{p.cancelledBy ? ` · @${p.cancelledBy}` : ""}</div>}
        {p.note && <div className="v3-pay-why"><strong>Примітка:</strong> {p.note}</div>}
        {p.status === "recorded" ? <>
          <div className="v3-pay-acts">
            <button type="button" className="v3-btn v3-btn-light" onClick={() => openReceipt(p)} disabled={receiptBusy === p.id}><Receipt size={15} aria-hidden="true" />{receiptBusy === p.id ? "Готуємо…" : "Чек"}</button>
            <button type="button" className="v3-btn v3-btn-ghost-dark v3-pay-ref" disabled={!online || !u} onClick={() => setRefundFor(p)} title={!u ? "Користувача вже немає" : undefined}>{mobile ? <Undo2 size={15} aria-hidden="true" /> : <RotateCcw size={14} aria-hidden="true" />}Повернути гроші</button>
          </div>
          <div className="v3-pay-cxrow"><button type="button" className={`v3-btn v3-btn-ghost-dark v3-pay-cx${cx === "busy" ? " is-busy" : ""}`} disabled={!online || cx === "busy"} onClick={() => setConfirmFor({ kind: "cx", p })}>{cx === "busy" ? "Скасовуємо…" : "Скасувати запис"}</button><button type="button" className="v3-pay-del" disabled={!online || del === "busy"} onClick={() => setConfirmFor({ kind: "del", p })} aria-label={`Видалити запис №${p.id} повністю`} title="Видалити запис повністю"><Trash2 size={16} aria-hidden="true" /></button></div>
          <p className="v3-pay-hint">«Скасувати запис» — помилкова оплата (дубль). «Повернути гроші» — коли ви повернули кошти людині.</p>
        </> : <div className="v3-pay-closed"><p className="v3-pay-hint">Запис закрито — змінити його вже не можна. Усе видно в журналі дій.</p><button type="button" className={`v3-pay-del${del === "ask" ? " is-ask" : ""}`} disabled={!online || del === "busy"} onClick={() => deleteRecord(p)} aria-label={del === "ask" ? `Підтвердити видалення запису №${p.id}` : `Видалити запис №${p.id} повністю`} title="Видалити запис повністю">{del === "ask" ? "Видалити?" : <Trash2 size={16} aria-hidden="true" />}</button></div>}
      </div>
    );
  };

  const userPanel = who && (
    <section className="v3-dcard v3-pay-user" aria-label={`Оплати @${who}`}>
      <div className="v3-pay-user-id">
        <UserAvatar username={who} telegram={whoUser?.telegram} className="v3-av-lg" />
        <div>
          <span className="v3-pay-user-name"><strong>@{who}</strong>{whoUser && (() => { const ui = phone && statusOf(whoUser) === "trial" ? { cls: "v3-st-active", label: "Активна" } : statusUi(whoUser); return <span className={`v3-tag ${ui.cls}`}>{ui.label}</span>; })()}</span>
          <span className="v3-pay-user-line">{whoUser && phone && !isAdmin(whoUser) && (() => { const c = whoUser.plan === "trial" ? "trial" : whoUser.plan === "pro" ? "pro" : "basic"; return <span className={`v3-ptag is-${c}`}>{c === "trial" ? "Пробний" : c === "pro" ? "Pro" : "Базова"}</span>; })()}{whoUser ? (isAdmin(whoUser) ? "Адміністратор" : `${phone ? "" : `${planCell(whoUser, settings).plan} · `}${whoUser.endDate ? `до ${dShort(whoUser.endDate)}${phone && daysLeft(whoUser) >= 0 ? ` · ще ${daysLeft(whoUser)} ${plural(daysLeft(whoUser), "день", "дні", "днів")}` : ""}` : "без дати"}`) : "Користувача не знайдено — лише історія оплат"}</span>
        </div>
        <button type="button" className="v3-pay-user-x" onClick={clearWho} aria-label="Закрити — показати оплати всіх" title="Оплати всіх"><X size={16} aria-hidden="true" /></button>
      </div>
      {whoUser && !isAdmin(whoUser) && (
        <div className="v3-pay-user-acts">
          <button type="button" className="v3-btn v3-btn-primary" disabled={!online} onClick={() => { setPayStep(false); setPayFor(whoUser); }}><Plus size={16} aria-hidden="true" />Записати оплату</button>
          <button type="button" className="v3-btn v3-btn-ghost-dark" disabled={!online || statusOf(whoUser) === "blocked"} onClick={() => setUserDlg("pro")}><Crown size={15} aria-hidden="true" />{phone ? "Pro на N днів" : "Видати Pro на N днів"}</button>
          <button type="button" className="v3-btn v3-btn-ghost-dark v3-pay-ref" disabled={!online || !lastRecorded} title={!lastRecorded ? "Немає записаної оплати" : undefined} onClick={() => setUserDlg("refund")}>{phone ? <Undo2 size={15} aria-hidden="true" /> : <RotateCcw size={14} aria-hidden="true" />}{phone ? "Повернути" : "Повернути гроші"}</button>
          <button type="button" className="v3-btn v3-btn-ghost-dark v3-pay-cx" disabled={!online || !["active", "soon", "urgent", "trial"].includes(statusOf(whoUser)) || endsWithoutRenewal(whoUser)} onClick={() => setUserDlg("cancel")}>Скасувати підписку</button>
        </div>
      )}
    </section>
  );

  const emptyFiltered = (
    <div className="v3-pay-empty">
      <span className="v3-empty-ic v3-float" aria-hidden="true"><SearchX size={22} /></span>
      <strong>{q.trim() ? `Нічого не знайдено за «${q.trim()}»` : "Немає оплат із таким статусом"}</strong>
      <span>Спробуйте інший запит або скиньте фільтри.</span>
      <button type="button" className="v3-btn v3-btn-dark" onClick={() => { setQ(""); setFilt("all"); setRk((x) => x + 1); }}>Скинути фільтри</button>
    </div>
  );

  const table = (
    <div className="v3-wcard v3-pay-list" aria-busy={loading}>
      <div className="v3-pay-tools">
        <label className="v3-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Пошук оплат" placeholder="№, логін або промокод" value={q} onChange={(e) => { setQ(e.target.value); setRk((x) => x + 1); }} />{q && <button type="button" onClick={() => setQ("")} aria-label="Очистити пошук"><X size={14} /></button>}</label>
        {!who && <Dropdown className="is-light" ariaLabel="Місяць" value={month} onChange={(v) => { setMonth(v); setSelId(null); setRk((x) => x + 1); }} options={months.map((m) => ({ value: m, label: monthName(m) }))} />}
        <div className="v3-seg v3-seg-soft" role="group" aria-label="Статус">
          <PillTrack active={filt} />
          {segs.map((s) => <button key={s.key} type="button" className={filt === s.key ? "is-on" : ""} aria-pressed={filt === s.key} onClick={() => { setFilt(s.key); setRk((x) => x + 1); }}>{s.label} <span className="v3-seg-n">{cnt(s.key)}</span></button>)}
        </div>
      </div>
      <div className="v3-pay-th" role="row">
        <span role="columnheader" aria-sort={sort.startsWith("no") ? (sort === "no-asc" ? "ascending" : "descending") : "none"}><button type="button" className={sort.startsWith("no") ? "is-on" : ""} onClick={() => setSort(sort === "no-desc" ? "no-asc" : "no-desc")}>№<ArrowDown size={12} aria-hidden="true" style={{ transform: sort === "no-asc" ? "rotate(180deg)" : undefined, opacity: sort.startsWith("no") ? 1 : .35 }} /></button></span>
        <span role="columnheader">Користувач</span><span role="columnheader">План · період</span>
        <span role="columnheader" aria-sort={sort.startsWith("sum") ? (sort === "sum-asc" ? "ascending" : "descending") : "none"}><button type="button" className={sort.startsWith("sum") ? "is-on" : ""} onClick={() => setSort(sort === "sum-desc" ? "sum-asc" : "sum-desc")}>Сума<ArrowDown size={12} aria-hidden="true" style={{ transform: sort === "sum-asc" ? "rotate(180deg)" : undefined, opacity: sort.startsWith("sum") ? 1 : .35 }} /></button></span>
        <span role="columnheader">Записав</span><span role="columnheader" className="v3-pay-r">Статус</span>
      </div>
      {rows === null && loading ? Array.from({ length: 6 }, (_, i) => <div key={i} className="v3-pay-row is-skel" aria-hidden="true"><span className="v3-skel v3-skel-light" /><span className="v3-skel v3-skel-light" style={{ width: "70%" }} /><span className="v3-skel v3-skel-light" /><span className="v3-skel v3-skel-light" /><span className="v3-skel v3-skel-light" /><span className="v3-skel v3-skel-light" style={{ height: 22, borderRadius: 999 }} /></div>)
        : list.length ? <div className={`v3-pay-rows ${rk % 2 ? "a" : "b"}`}>{list.map((p, i) => {
          const st = STATUS[p.status]; const on = sel?.id === p.id; const u = userOf(p);
          return (
            <button key={p.id} type="button" className={`v3-pay-row${on ? " is-sel" : ""}${fresh === p.id ? " is-new" : ""}`} style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }} aria-pressed={on} onClick={() => setSelId(p.id)}>
              <span className="v3-pay-no">№{p.id}</span>
              <span className="v3-pay-who"><UserAvatar username={p.username} telegram={u?.telegram} /><span><strong>@{p.username}</strong><small>{dShort(p.paidOn)}</small></span></span>
              <span className="v3-pay-plan"><strong>{planOf(p, u)}</strong><small>{period(p.periodStart, p.periodEnd)}</small></span>
              <span className="v3-pay-sum"><strong><span className={p.status === "recorded" ? "" : "v3-strk"}>{money(num(p))}</span></strong>{p.promoCode && <small>{p.promoCode}</small>}</span>
              <span className="v3-pay-by">@{p.createdBy}</span>
              <span className="v3-pay-r"><span className={`v3-tag ${st.cls}`}>{st.label}</span></span>
            </button>
          );
        })}</div> : emptyFiltered}
      <div className="v3-pay-foot"><span>Показано <b>{list.length}</b> із <b>{all.length}</b> {who ? "за весь час" : `за ${monthShort(month)}`}</span><span>Разом: <b><RollingNumber key={`t-${recSum}`} text={money(recSum)} /></b> · повернено {money(refSum)}</span></div>
    </div>
  );

  // Мобільний список: групи за днями, «Показати ще» (каталог · Списки 12)
  // Day header on the phone: «225 ₴ · 2» or «повернено 300 ₴»
  const daySum = (day: string) => {
    const d = list.filter((p) => p.paidOn === day); const ok = d.filter((p) => p.status === "recorded");
    if (ok.length) return `${money(sumOf(ok))}${who ? "" : ` · ${ok.length}`}`;
    const rf = d.filter((p) => p.status === "refunded"); return rf.length ? `повернено ${money(refOf(rf) || sumOf(rf))}` : "";
  };
  const mobileList = (
    <div className="v3-pay-m">
      <label className="v3-msearch"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Пошук оплат" placeholder="№, логін або промокод" value={q} onChange={(e) => { setQ(e.target.value); setRk((x) => x + 1); }} />{q && <button type="button" onClick={() => setQ("")} aria-label="Очистити пошук"><X size={14} /></button>}</label>
      <div className={`v3-pay-mf${who ? " is-one" : ""}`}>
        {!who && <Dropdown className="v3-mselect-dd" ariaLabel="Місяць" sheet={{ title: "Місяць", note: "оплати за обраний місяць" }} value={month} onChange={(v) => { setMonth(v); setRk((x) => x + 1); }} options={months.map((m) => { const ok = (rows || []).filter((p) => p.status === "recorded" && (p.paidOn || "").startsWith(m)); return { value: m, label: monthName(m), hint: ok.length ? `${money(sumOf(ok))} · ${ok.length}` : money(0) }; })} />}
        <Dropdown className="v3-mselect-dd" ariaLabel="Статус" sheet={{ title: "Статус", note: "які записи показати" }} value={filt} onChange={(v) => { setFilt(v as Filt); setRk((x) => x + 1); }} options={segs.map((s) => ({ value: s.key, label: `${s.key === "all" ? "Усі статуси" : s.label} · ${cnt(s.key)}` }))} />
      </div>
      {q.trim() && <p className="v3-pay-found" role="status">Знайдено {list.length} · за логіном, № або промокодом</p>}
      <ul className={`v3-pay-mlist ${rk % 2 ? "a" : "b"}`}>
        {rows === null && loading ? Array.from({ length: 5 }, (_, i) => <li key={i} className="v3-pay-mcard is-skel" aria-hidden="true"><span className="v3-skel v3-skel-light" style={{ width: "55%" }} /><span className="v3-skel v3-skel-light" style={{ width: 60 }} /></li>)
          : list.length ? list.slice(0, shown).map((p, i, arr) => {
            const st = STATUS[p.status]; const head = i === 0 || arr[i - 1].paidOn !== p.paidOn;
            return [head && <li key={`d-${p.paidOn}`} className="v3-pay-day" style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}><span>{dayLabel(p.paidOn)}</span><span className="v3-pay-day-sum">{daySum(p.paidOn)}</span></li>,
              <li key={p.id} style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}><button type="button" className={`v3-pay-mcard${fresh === p.id ? " is-new" : ""}`} onClick={() => { setSelId(p.id); setSheet(true); }}>
                <UserAvatar username={p.username} telegram={userOf(p)?.telegram} className="v3-pay-mav" />
                <span className="v3-pay-mcard-who">
                  <span className="v3-pay-mcard-nm"><strong>@{p.username}</strong>{(() => { const pl = planOf(p, userOf(p)); const c = pl === "Pro" ? "pro" : pl === "Базова" ? "basic" : pl.startsWith("Пробний") ? "trial" : ""; return c ? <span className={`v3-ptag is-${c}`}>{pl}</span> : null; })()}</span>
                  <small>{p.status === "recorded" && methodIcon(p.paymentMethod)}№{p.id} · {p.status === "recorded" ? methodLabel(p.paymentMethod) : p.status === "cancelled" ? (p.cancelReason || "скасовано") : `повернено ${money(Number(p.refundedAmount) || num(p))}`}</small>
                  {p.status === "recorded" && p.promoCode && <span className="v3-pay-mpromo">{p.promoCode}{(() => { const pc = (promos || []).find((x) => x.code.toLowerCase() === p.promoCode.toLowerCase()); return pc ? ` −${pc.discountPercent}%` : ""; })()}</span>}
                </span>
                <span className="v3-pay-mcard-r"><strong><span className={p.status === "recorded" ? "" : "v3-strk"}>{money(num(p))}</span></strong><span className={`v3-tag ${st.cls}`}>{st.label}</span></span>
              </button></li>];
          }) : <li className="v3-wcard v3-pay-mnone">{emptyFiltered}</li>}
      </ul>
      {list.length > shown && <button type="button" className="v3-btn v3-btn-ghost-dark v3-btn-block" onClick={() => setShown(shown + 12)}>Показати ще {Math.min(12, list.length - shown)}</button>}
    </div>
  );

  const refNeedle = qRef.trim().replace(/^[@№#]/, "").toLowerCase();
  const refundsShown = (refunds || []).filter((p) => !refNeedle || String(p.id) === refNeedle || (p.username || "").toLowerCase().includes(refNeedle) || (p.refundReason || "").toLowerCase().includes(refNeedle));
  const refundsTab = (
    <>
    {!wide && <PaneSearch value={qRef} onChange={setQRef} label="Пошук повернень" placeholder="№, логін або причина" />}
    <section className="v3-pay-main">
      <div className="v3-wcard v3-pay-list">
        {(() => { const h = <div className="v3-pay-sec-h"><h2>Повернення</h2><p>Записи про гроші, які ви повернули вручну. Підписка в цей момент скасовується.</p></div>;
          // Wide: search and the heading share one row (no empty space next to the search)
          return wide ? <div className="v3-pay-tools v3-pay-hrow"><PaneSearch inline value={qRef} onChange={setQRef} label="Пошук повернень" placeholder="№, логін або причина" />{h}</div> : h; })()}
        {refunds === null ? <div className="v3-pay-row is-skel" aria-hidden="true"><span className="v3-skel v3-skel-light" /><span className="v3-skel v3-skel-light" /></div>
          : refNeedle && !refundsShown.length && refunds.length ? <div className="v3-pay-empty"><strong>Нічого не знайдено</strong><span>За запитом «{qRef.trim()}» повернень немає.</span></div>
          : refundsShown.length ? <div className="v3-pay-rows a">{refundsShown.map((p, i) => (
            <div key={p.id} className="v3-pay-row is-ref" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
              <span className="v3-pay-no">№{p.id}</span>
              <span className="v3-pay-plan"><strong>@{p.username}</strong><small>{dShort(p.refundedAt || p.paidOn)}</small></span>
              <span className="v3-pay-sum"><strong className="v3-pay-neg">−{money(Number(p.refundedAmount) || num(p))}</strong><small>{Number(p.refundedAmount) < num(p) ? "частково" : "повністю"}</small></span>
              <span className="v3-pay-reason">{p.refundReason || "—"}</span>
              <span className="v3-pay-by">@{p.refundedBy || p.createdBy}</span>
              {/* Phone (design PaymentsMobileRefunds): avatar, plan, date · payment № */}
              <span className="v3-pay-rm v3-only-mobile">
                <UserAvatar username={p.username} telegram={userOf(p)?.telegram} className="v3-pay-mav" />
                <span className="v3-pay-rm-who"><span className="v3-pay-mcard-nm"><strong>@{p.username}</strong>{(() => { const pl = planOf(p, userOf(p)); const c = pl === "Pro" ? "pro" : pl === "Базова" ? "basic" : ""; return c ? <span className={`v3-ptag is-${c}`}>{pl}</span> : null; })()}</span><small>{dShort(p.refundedAt || p.paidOn)} · оплата №{p.id}</small></span>
                <span className="v3-pay-rm-sum"><strong>−{money(Number(p.refundedAmount) || num(p))}</strong><small>{Number(p.refundedAmount) < num(p) ? "частково" : "повністю"}</small></span>
              </span>
            </div>))}</div>
          : <div className="v3-pay-empty"><span className="v3-empty-ic v3-float" aria-hidden="true"><RotateCcw size={22} /></span><strong>Повернень ще немає</strong><span>Повернення записується з оплати: «Повернути гроші» — повністю або частково, з причиною.</span></div>}
      </div>
      <aside className="v3-dcard v3-pay-aside">
        <strong className="v3-pay-aside-t">Як записати повернення</strong>
        <ol className="v3-pay-steps"><li>Поверніть гроші людині (картка, переказ).</li><li>Відкрийте оплату → «Повернути гроші».</li><li>Повністю або частково, причина обов’язкова.</li></ol>
        <div className="v3-pay-box">Повернення за {monthShort(month)}: <b>{money(refSum)}</b> · {monthShort(shiftMonth(month, -1))} {money(prevRef)}. Кожне потрапляє в журнал дій.</div>
        <button type="button" className="v3-btn v3-btn-primary v3-pay-go" onClick={() => setTab("pay")}>Відкрити оплати<ArrowRight size={14} aria-hidden="true" /></button>
      </aside>
    </section>
    </>
  );

  return (
    <div className="v3-page v3-pay">
      <section className="v3-hero v3-hero-row">
        <div>
          <h1 className="v3-title">Оплати</h1>
          <p className="v3-subtitle"><span className="v3-hide-mobile">{who ? `Усі оплати @${who} за весь час: запис, Pro на N днів, повернення й скасування підписки — тут.` : "Ручний облік: записи, повернення й промокоди. Гроші приймаєте й повертаєте поза адмінкою. Час — київський."}</span><span className="v3-only-mobile">{who ? `@${who}` : monthName(month).split(" ")[0]} · {money(recSum)} · {rec.length} {plural(rec.length, "оплата", "оплати", "оплат")}</span></p>
        </div>
        <div className="v3-chips">
          {!emptyPlatform && <ExportCsvButton className="v3-chip v3-hide-mobile" onClick={exportCsv} disabled={!list.length} />}
          <button type="button" className="v3-btn v3-btn-primary v3-hide-mobile" disabled={!online} onClick={() => setPick(true)}><Plus size={17} aria-hidden="true" />Записати оплату</button>
          <button type="button" className="v3-fab v3-only-mobile" aria-label="Записати оплату" disabled={!online} onClick={() => setPick(true)}><Plus size={20} strokeWidth={2.4} aria-hidden="true" /></button>
        </div>
      </section>

      {!online && <div className="v3-offline-users" role="status"><WifiOff size={16} aria-hidden="true" /><span>Немає інтернету. Оплати станом на останнє оновлення — записи, повернення й промокоди після відновлення зв’язку.</span></div>}
      {error && rows !== null && <div className="v3-stale" role="alert"><AlertTriangle size={18} aria-hidden="true" /><span>Не вдалося оновити: {error}.</span><button type="button" className="v3-btn v3-btn-ghost-dark" onClick={() => load()}>Спробувати ще раз</button></div>}

      {error && rows === null ? (
        <div className="v3-dcard v3-uerror" role="alert"><span className="v3-uerror-ico" aria-hidden="true">!</span><strong>Не вдалося завантажити оплати</strong><span>Сервер не відповів.</span><code className="v3-uerror-det">{error}</code><div><button type="button" className="v3-btn v3-btn-blue" onClick={() => load()}>Спробувати ще раз</button></div></div>
      ) : emptyPlatform ? (
        <>
          <section className="v3-sums" aria-label="Підсумки">
            <div className="v3-sum is-static"><span className="v3-sum-l">Отримано за {monthShort(month)}</span><strong className="v3-sum-v">0 ₴</strong><span className="v3-sum-n">—</span></div>
            <div className="v3-sum is-static"><span className="v3-sum-l">Повернено</span><strong className="v3-sum-v">0 ₴</strong><span className="v3-sum-n">—</span></div>
            <div className="v3-sum is-static v3-hide-mobile"><span className="v3-sum-l">Середня оплата</span><strong className="v3-sum-v">—</strong><span className="v3-sum-n">—</span></div>
            <div className="v3-sum is-static v3-hide-mobile"><span className="v3-sum-l">Промокоди</span><strong className="v3-sum-v">{promos?.length || 0}</strong><span className="v3-sum-n">{promos?.length ? "створено" : "ще не створено"}</span></div>
          </section>
          <section className="v3-pay-zero">
            <div className="v3-wcard v3-pay-zero-card">
              <span className="v3-empty-ic v3-float v3-halo" aria-hidden="true"><CreditCard size={22} /></span>
              <strong>Оплат ще немає</strong>
              <p>Коли людина оплатить Базову чи Pro, запишіть оплату тут або в картці користувача — підписка продовжиться, а чек можна буде надіслати в Telegram.</p>
              <div className="v3-pay-zero-acts"><button type="button" className="v3-btn v3-btn-primary" onClick={() => setPick(true)} disabled={!online}><Plus size={16} aria-hidden="true" />Записати першу оплату</button><Link className="v3-btn v3-btn-light" to="/settings">Перевірити тарифи</Link></div>
            </div>
            <div className="v3-dcard v3-pay-zero-steps">
              <strong>Що з’явиться тут</strong>
              {[["Оплати", "Хто, скільки, за який план і період, хто записав"], ["Повернення", "Записи про повернені гроші з причиною"], ["Промокоди", "Знижки, ліміти й скільки разів використали"]].map((s, i) => <div key={s[0]} className="v3-pay-zero-step"><b>{i + 1}</b><span><strong>{s[0]}</strong><small>{s[1]}</small></span></div>)}
            </div>
          </section>
        </>
      ) : <>
        {/* Phone (design PaymentsMobileUser): the user card comes first */}
        {who && phone && userPanel}
        <section className="v3-sums v3-pay-sums" aria-label="Підсумки">
          {/* numbers only — sections switch with the tabs below; the first card is the blue one */}
          {sums.map((s, i) => (
            <div key={s.k} className={`v3-sum is-static${i === 0 ? " is-on" : ""}${s.k === "ref" && !who ? " v3-hide-mobile" : ""}`}>
              <span className="v3-sum-l">{s.k === "recv" ? <><span className="v3-hide-mobile">{s.label}</span><span className="v3-only-mobile">Отримано</span></> : s.label}</span>
              <strong className="v3-sum-v">{rows === null ? "—" : <RollingNumber key={`${s.k}-${s.value}`} text={s.value} />}</strong>
              <span className="v3-sum-n">{rows !== null && <Delta d={s.d} on={i === 0} vs={vs} bad={s.k === "ref"} />}<span className="v3-pay-note">{s.note}</span></span>
            </div>
          ))}
          {!who && (
            <div className="v3-sum is-static v3-only-mobile v3-pay-due">
              <span className="v3-sum-l">Очікуємо</span>
              <strong className="v3-sum-v">{rows === null ? "—" : <RollingNumber key={`due-${dueSum}`} text={money(dueSum)} />}</strong>
              <span className="v3-sum-n"><span className="v3-pay-note">{due.length ? `${due.length} ${plural(due.length, "підписка закінчується", "підписки закінчуються", "підписок закінчуються")} цього тижня` : "цього тижня нічого не закінчується"}</span></span>
            </div>
          )}
        </section>

        {who && !phone && userPanel}

        <div className="v3-pay-tabs" role="tablist" aria-label="Розділи оплат">
          <PillTrack active={tab} />
          {tabs.map((t) => <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`v3-pay-tab${tab === t.key ? " is-on" : ""}`} onClick={() => setTab(t.key)}><span className="v3-pay-tab-n">{t.n ?? "…"}</span>{t.label}<span className="v3-only-mobile v3-pay-tab-c">{t.n !== null && (!who || t.key === "pay") ? `· ${t.n}` : ""}</span></button>)}
        </div>

        <div key={tab} className="v3-pay-pane">
          {tab === "pay" && (wide ? (
            <section className="v3-pay-main">
              {table}
              <aside className="v3-dcard v3-pay-aside">{sel ? detail(sel) : <div className="v3-pay-empty is-dark"><span>Оберіть оплату, щоб побачити деталі.</span></div>}</aside>
            </section>
          ) : mobileList)}
          {tab === "ref" && refundsTab}
          {tab === "promo" && <>{!wide && <PaneSearch value={qPromo} onChange={setQPromo} label="Пошук промокодів" placeholder="Код промокоду" />}<PromoTab query={qPromo} search={wide ? <PaneSearch inline value={qPromo} onChange={setQPromo} label="Пошук промокодів" placeholder="Код промокоду" /> : undefined} promos={promos} online={online} onToggle={togglePromo} max={promoMax} onCreated={(p) => { setPromos((l) => [p, ...(l || [])]); }} /></>}
        </div>
      </>}

      {!wide && <Dialog open={sheet && !!sel} onOpenChange={setSheet}><DialogContent className="v3-sheet v3-pay-sheet"><DialogTitle className="sr-only">Оплата №{sel?.id}</DialogTitle><DialogDescription className="sr-only">Деталі оплати</DialogDescription>{sel && detail(sel, true)}</DialogContent></Dialog>}

      <PickUserDialog open={pick} users={users} onOpenChange={setPick} onPick={(u) => { setPick(false); setPayStep(true); setPayFor(u); }} />
      {payFor && <AddPaymentDialog open={!!payFor} onOpenChange={(o) => { if (!o) setPayFor(null); }} userId={payFor.id} username={payFor.username} endDate={payFor.endDate} priceMonth={String(payFor.priceMonth || "")} planLabel={planCell(payFor, null).plan} step={payStep ? "Крок 2 з 2" : undefined}
        onSaved={async () => { const before = new Set(all.map((p) => p.id)); if (!who) setMonth(kyivMonth()); const r = await fetchPayments(who ? "" : kyivMonth()).catch(() => null); if (r) { const got = who ? r.payments.filter((p) => (p.username || "").toLowerCase() === who.toLowerCase()) : r.payments; setRows(got); r.payments = got; const n = r.payments.find((p) => !before.has(p.id)); if (n) { setFresh(n.id); setSelId(n.id); setFilt("all"); setQ(""); window.setTimeout(() => setFresh(null), 2000); } } fetchUsersOverview().then(setUsers).catch(() => {}); }} />}
      {refundFor && userOf(refundFor) && <RefundDialog user={userOf(refundFor)!} payment={asPayment(refundFor)} open={!!refundFor} onOpenChange={(o) => { if (!o) setRefundFor(null); }} onDone={() => { load({ quiet: true }); loadSide(); }} />}
      {whoUser && <GrantProDialog user={whoUser} open={userDlg === "pro"} onOpenChange={(o) => setUserDlg(o ? "pro" : null)} onDone={() => fetchUsersOverview().then(setUsers).catch(() => {})} />}
      {whoUser && <RefundDialog user={whoUser} payment={lastRecorded ? asPayment(lastRecorded) : null} open={userDlg === "refund"} onOpenChange={(o) => setUserDlg(o ? "refund" : null)} onDone={() => { load({ quiet: true }); loadSide(); fetchUsersOverview().then(setUsers).catch(() => {}); }} />}
      <ConfirmDialog open={!!confirmFor} busy={cx === "busy" || del === "busy"} onOpenChange={(o) => { if (!o) setConfirmFor(null); }}
        onConfirm={() => { if (!confirmFor) return; if (confirmFor.kind === "cx") cancelRecord(confirmFor.p); else deleteRecord(confirmFor.p); }}
        icon={confirmFor?.kind === "cx" ? <Ban size={22} /> : undefined}
        title={confirmFor ? (confirmFor.kind === "cx" ? `Скасувати запис №${confirmFor.p.id}?` : `Видалити запис №${confirmFor.p.id}?`) : ""}
        confirm={confirmFor?.kind === "cx" ? "Скасувати запис" : "Видалити назавжди"} busyText={confirmFor?.kind === "cx" ? "Скасовуємо…" : "Видаляємо…"}
        text={confirmFor ? (confirmFor.kind === "cx"
          ? `@${confirmFor.p.username} · ${money(num(confirmFor.p))}. Запис лишиться в історії зі статусом «Скасовано», але сума не рахуватиметься в оплатах. Для випадку, коли оплату записали помилково (дубль). Гроші людині не повертаються.`
          : `@${confirmFor.p.username} · ${money(num(confirmFor.p))}. Запис зникне з оплат і звітів повністю; дати підписки не зміняться. Слід лишиться лише в журналі дій. Цю дію неможливо скасувати.`) : ""} />
      {whoUser && <CancelSubscriptionDialog user={whoUser} open={userDlg === "cancel"} onOpenChange={(o) => setUserDlg(o ? "cancel" : null)} onDone={() => fetchUsersOverview().then(setUsers).catch(() => {})} />}
      <ReceiptDialog data={receipt} username={receipt?.username || ""} onOpenChange={(o) => { if (!o) setReceipt(null); }} sendBlock={receiptSendBlock} />
    </div>
  );
}

/** Крок перед «Записати оплату»: кому. Пошук за логіном або Telegram. */
function PickUserDialog({ open, users, onOpenChange, onPick }: { open: boolean; users: AdminUserOverview[]; onOpenChange: (o: boolean) => void; onPick: (u: AdminUserOverview) => void }) {
  const [q, setQ] = useState("");
  useEffect(() => { if (open) setQ(""); }, [open]);
  const s = q.trim().toLowerCase().replace(/^@/, "");
  const list = users.filter((u) => !isAdmin(u) && (!s || (u.username || "").toLowerCase().includes(s) || (u.telegram || "").toLowerCase().includes(s))).slice(0, 8);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="v3-modal sm:max-w-[480px]">
        <DialogTitle className="v3-modal-title">Записати оплату</DialogTitle>
        <DialogDescription className="v3-modal-sub">Кому записати оплату? Гроші вже отримано поза адмінкою — тут лише запис.</DialogDescription>
        <label className="v3-search v3-pick-search"><Search size={16} aria-hidden="true" /><input autoFocus type="search" aria-label="Пошук користувача" placeholder="Логін або Telegram" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <ul className="v3-pick-list" role="listbox" aria-label="Користувачі">
          {list.length ? list.map((u, i) => (
            <li key={u.id} style={{ animationDelay: `${i * 30}ms` }}><button type="button" role="option" aria-selected="false" onClick={() => onPick(u)}>
              <UserAvatar username={u.username} telegram={u.telegram} />
              <span><span className="v3-pick-nm"><strong>@{u.username}</strong>{(() => { const c = u.plan === "trial" ? "trial" : u.plan === "pro" ? "pro" : u.plan === "basic" ? "basic" : ""; return c ? <span className={`v3-ptag is-${c} v3-only-mobile`}>{planCell(u, null).plan}</span> : null; })()}</span><small><span className="v3-hide-mobile">{planCell(u, null).plan} · </span>до {dShort(u.endDate)}</small></span>
              <ArrowRight size={15} aria-hidden="true" />
            </button></li>
          )) : <li className="v3-pick-empty">Нікого не знайдено</li>}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

/** Промокоди: список із заповненням смужок, увімкнення з «Скасувати», створення нового. */
function PromoTab({ promos, online, onToggle, max, onCreated, query = "", search }: { promos: PromoCode[] | null; online: boolean; onToggle: (p: PromoCode) => void; max: (p: PromoCode) => number; onCreated: (p: PromoCode) => void; query?: string; search?: ReactNode }) {
  const needle = query.trim().toUpperCase();
  const shownPromos = (promos || []).filter((p) => !needle || p.code.toUpperCase().includes(needle));
  const [code, setCode] = useState("");
  const [pctV, setPctV] = useState("25");
  const [plan, setPlan] = useState<"basic" | "pro">("pro");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState("100");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ msg: string; n: number } | null>(null);
  const [fresh, setFresh] = useState("");
  const [typing, setTyping] = useState(false);
  const today = kyivToday();
  // «Згенерувати»: код друкується по літері (каталог · Решта · Typing Text)
  function generate() {
    if (typing) return;
    const taken = new Set((promos || []).map((p) => p.code.toUpperCase()));
    const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let c = "";
    do { c = "MIQ" + Array.from({ length: 5 }, () => abc[Math.floor(Math.random() * abc.length)]).join(""); } while (taken.has(c));
    setErr(null);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setCode(c); return; }
    setTyping(true); setCode("");
    let i = 0;
    const t = window.setInterval(() => { i += 1; setCode(c.slice(0, i)); if (i >= c.length) { window.clearInterval(t); setTyping(false); } }, 45);
  }
  const exists = (promos || []).some((p) => p.code.toUpperCase() === code.trim().toUpperCase());
  async function create() {
    const c = code.trim().toUpperCase();
    const v = Number(pctV);
    const bad = c.length < 4 ? "Мінімум 4 символи" : exists ? "Такий код уже є" : !(Number.isInteger(v) && v > 0 && v <= 100) ? "Знижка — ціле число від 1 до 100" : to && from && to < from ? "Кінець раніше за початок" : "";
    if (bad) { setErr({ msg: bad, n: (err?.n || 0) + 1 }); return; }
    setBusy(true);
    try {
      const r = await api.post<{ id: string }>("/admin/promo-codes", { code: c, discountPercent: v, plan, startsOn: from || null, endsOn: to || null, usageLimit: limit ? Number(limit) : null });
      const p: PromoCode = { id: r.id, code: c, discountPercent: v, plan, startsOn: from || null, endsOn: to || null, usageLimit: limit ? Number(limit) : null, usedCount: 0, active: true, createdAt: new Date().toISOString() };
      onCreated(p); setFresh(c); window.setTimeout(() => setFresh(""), 2000); setCode(""); setErr(null);
      toast.success(`Промокод ${c} створено`, { id: `promo-new-${c}`, description: `−${v}% · ${PLAN_LABEL[plan]}${from ? ` · з ${dShort(from)}` : ""}` });
    } catch (e) { setErr({ msg: (e as Error).message, n: (err?.n || 0) + 1 }); } finally { setBusy(false); }
  }
  return (
    <section className="v3-pay-main">
      <div className="v3-wcard v3-pay-list">
        {(() => { const h = <div className="v3-pay-sec-h"><h2>Промокоди</h2><p>Користувач називає код — ви вводите його під час запису оплати, сума рахується сама.</p></div>;
          return search ? <div className="v3-pay-tools v3-pay-hrow">{search}{h}</div> : h; })()}
        <div className="v3-pay-th is-promo" role="row"><span>Код</span><span>Знижка</span><span>План</span><span>Використано</span><span>Діє</span><span className="v3-pay-r">Стан</span></div>
        {promos === null ? <div className="v3-pay-row is-skel is-promo" aria-hidden="true"><span className="v3-skel v3-skel-light" /><span className="v3-skel v3-skel-light" /></div>
          : needle && !shownPromos.length && promos.length ? <div className="v3-pay-empty"><strong>Нічого не знайдено</strong><span>Промокоду «{query.trim()}» немає.</span></div>
          : shownPromos.length ? <div className="v3-pay-rows a">{shownPromos.map((p, i) => {
            const st = promoState(p, today); const ui = PROMO_UI[st];
            return (
              <div key={p.id} className={`v3-pay-row is-promo${st === "ended" || st === "off" ? " is-dim" : ""}${fresh === p.code ? " is-new" : ""}`} style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                <span className="v3-pay-code"><strong>{p.code}</strong><small><span className="v3-hide-mobile">{p.usageLimit ? `ліміт ${p.usageLimit}` : "без ліміту"}</span><span className="v3-only-mobile">{p.usageLimit ? `до ${p.usageLimit} разів` : "без ліміту"} · використано {p.usedCount}{ui.label !== "Діє" ? ` · ${ui.label.toLowerCase()}` : ""}</span></small></span>
                <strong>−{p.discountPercent}%</strong>
                <span>{PLAN_LABEL[p.plan] || p.plan}</span>
                <span className="v3-pay-use"><span className="v3-pay-bar"><i style={{ width: `${max(p)}%` }} /></span>{p.usedCount} / {p.usageLimit ?? "∞"}</span>
                <span className="v3-pay-by">{p.startsOn || p.endsOn ? `${p.startsOn ? dShort(p.startsOn) : "…"} — ${p.endsOn ? dShort(p.endsOn) : "…"}` : "безстроково"}</span>
                <span className="v3-pay-r v3-pay-promo-st"><span className={`v3-tag ${ui.cls}`}>{ui.label}</span><button type="button" role="switch" aria-checked={p.active} aria-label={`${p.code}: ${p.active ? "вимкнути" : "увімкнути"}`} className={`v3-pswitch${p.active ? " is-on" : ""}`} disabled={!online} onClick={() => onToggle(p)}><span /></button></span>
              </div>
            );
          })}</div>
          : <div className="v3-pay-empty"><span className="v3-empty-ic v3-float" aria-hidden="true"><Tag size={22} /></span><strong>Промокодів ще немає</strong><span>Створіть перший — праворуч.</span></div>}
      </div>
      <aside className="v3-dcard v3-pay-aside v3-pay-new">
        <strong className="v3-pay-aside-t">Новий промокод</strong>
        <div className="v3-field"><label htmlFor="pc-code">Код</label><span key={err?.n || 0} className={`v3-pay-inp${err ? " is-bad" : ""}${typing ? " is-typing" : ""}`}><input id="pc-code" value={code} onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/\s/g, "")); setErr(null); }} maxLength={100} autoComplete="off" placeholder="Напр. NEWYEAR27" aria-invalid={!!err} aria-describedby="pc-err" /><button type="button" className={`v3-pay-gen${typing ? " is-run" : ""}`} onClick={generate} aria-label="Згенерувати код"><Shuffle size={14} aria-hidden="true" />Згенерувати</button></span>{err && <span id="pc-err" className="v3-field-error" role="alert">{err.msg}</span>}</div>
        <div className="v3-field"><label htmlFor="pc-pct">Знижка, %</label><span className="v3-pay-inp"><input id="pc-pct" inputMode="numeric" value={pctV} onChange={(e) => setPctV(e.target.value.replace(/\D/g, "").slice(0, 3))} /><small>{Number(pctV) > 0 && Number(pctV) <= 100 ? `600 → ${Math.round(600 * (100 - Number(pctV)) / 100)} ₴` : ""}</small></span></div>
        <div className="v3-field"><span className="v3-label" id="pc-plan">План</span><div className="v3-seg v3-pay-dseg" role="group" aria-labelledby="pc-plan"><PillTrack active={plan} />{(["basic", "pro"] as const).map((k) => <button key={k} type="button" className={plan === k ? "is-on" : ""} aria-pressed={plan === k} onClick={() => setPlan(k)}>{PLAN_LABEL[k]}</button>)}</div></div>
        <div className="v3-pay-2"><div className="v3-field"><label id="pc-from">Діє з</label><DateField id="pc-from-i" labelledBy="pc-from" value={from} onChange={setFrom} /></div><div className="v3-field"><label id="pc-to">До</label><DateField id="pc-to-i" labelledBy="pc-to" value={to} min={from || undefined} onChange={setTo} /></div></div>
        <div className="v3-field"><label htmlFor="pc-lim">Ліміт використань</label><span className="v3-pay-inp"><input id="pc-lim" inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="без ліміту" /></span></div>
        <button type="button" className={`v3-btn v3-btn-primary${busy ? " is-busy" : ""}`} disabled={!online || busy} onClick={create}>{busy ? "Створюємо…" : <><Check size={16} aria-hidden="true" />Створити промокод</>}</button>
      </aside>
    </section>
  );
}
