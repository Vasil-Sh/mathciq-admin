import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Lock, User as UserIcon, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/apiClient";
import UserAvatar from "@/components/UserAvatar";
import { createPaymentReceipt } from "@/lib/paymentReceipt";
import { shortDate } from "@/lib/subscriptions";
import { plural } from "@/lib/dashboardInsights";
import { ageText, birthText, isAdmin, leftTag, longDate, planCell, planName, progress, STATUS_UI, statusOf, trialText, endsWithoutRenewal } from "@/lib/usersModel";
import type { AdminUserOverview, AppSettings } from "@/types";
import { AddPaymentDialog, CancelPaymentDialog, ReceiptDialog, type Payment } from "./PaymentDialogs";
import { CancelSubscriptionDialog, GrantProDialog, RefundDialog } from "./UserActionDialogs";

type Note = { content: string; version: number; updatedBy: string | null; updatedAt: string | null };
type Card = { note: Note; stats: { bets: number; wins: number; losses: number; profit: string }[] };
type PayWithRefund = Payment & { refundedAmount?: string | null };

const money = (n: number) => `${Math.round(n).toLocaleString("uk-UA")} ₴`;
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${money(Math.abs(n))}`;
const telegramUrl = (t?: string) => { const h = (t || "").replace(/^https?:\/\/t\.me\//, "").replace(/^@/, "").trim(); return h ? `t.me/${h}` : ""; };

function Section({ id, title, summary, open, onToggle, extra, children }: { id: string; title: string; summary?: string; open: boolean; onToggle: () => void; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className={`v3-uc-sec${open ? " is-open" : ""}`} aria-labelledby={`uc-${id}`}>
      <div className="v3-uc-sec-head">
        <p className="v3-uc-sec-l" id={`uc-${id}`}>{title}</p>
        <span className="v3-uc-sec-tools">
          {!open && summary && <span className="v3-uc-sum">{summary}</span>}
          {extra}
          <button type="button" className="v3-colbtn" aria-expanded={open} onClick={onToggle}>
            {open ? "Згорнути" : "Розгорнути"}<ChevronDown size={12} strokeWidth={2.4} style={{ transform: open ? "rotate(180deg)" : undefined }} aria-hidden="true" />
          </button>
        </span>
      </div>
      {open && children}
    </section>
  );
}

interface Props {
  user: AdminUserOverview;
  settings: AppSettings | null;
  extendDays: number;
  online: boolean;
  /** Reasons the signed-in admin cannot do these to this account (null = allowed). */
  deleteReason: string | null;
  resetReason: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onResetPassword: () => void;
  onExtend: () => void;
  onChanged: () => void;
  onClose?: () => void;
}

/** Right-hand user card (design «Користувачі v3 · список + картка»). */
export default function UserCardPanel({ user, settings, extendDays, online, deleteReason, resetReason, onEdit, onDelete, onResetPassword, onExtend, onChanged, onClose }: Props) {
  const [card, setCard] = useState<Card | null>(null);
  const [error, setError] = useState("");
  const [payments, setPayments] = useState<PayWithRefund[]>([]);
  const [open, setOpen] = useState({ prof: false, bets: false, pay: false });
  const [editingNote, setEditingNote] = useState(false);
  const [draft, setDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [dlg, setDlg] = useState<null | "pay" | "pro" | "refund" | "cancel">(null);
  const [cancelling, setCancelling] = useState<Payment | null>(null);
  const [receipt, setReceipt] = useState<{ image: string; payment: Payment } | null>(null);
  const [receiptBusy, setReceiptBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    const [c, p] = await Promise.allSettled([
      api.get<Card>(`/admin/users/${user.id}/card`),
      api.get<{ payments: PayWithRefund[] }>(`/admin/users/${user.id}/payments?page=1`),
    ]);
    if (c.status === "fulfilled") { setCard(c.value); setDraft(c.value.note?.content || ""); } else setError((c.reason as Error)?.message || "Не вдалося завантажити картку");
    if (p.status === "fulfilled") setPayments(p.value.payments || []);
  }, [user.id]);
  useEffect(() => { setCard(null); setPayments([]); setEditingNote(false); load(); }, [load]);

  async function saveNote() {
    if (!card) return;
    setSavingNote(true);
    try {
      const note = await api.put<Note>(`/admin/users/${user.id}/note`, { content: draft, version: card.note.version });
      setCard({ ...card, note }); setEditingNote(false);
      toast.success("Нотатку збережено");
    } catch (e) { toast.error((e as Error).message); } finally { setSavingNote(false); }
  }
  async function openReceipt(p: Payment) {
    setReceiptBusy(p.id);
    try { setReceipt({ image: await createPaymentReceipt(p, { username: user.username, telegram: user.telegram }), payment: p }); }
    catch (e) { toast.error((e as Error).message); } finally { setReceiptBusy(null); }
  }
  const changed = () => { load(); onChanged(); };

  const admin = isAdmin(user);
  const st = statusOf(user);
  const ui = STATUS_UI[st];
  const selfAccount = !!deleteReason && deleteReason.startsWith("Власний");
  const viewOnly = !selfAccount && !!deleteReason && !!resetReason;
  const plan = planCell(user, settings);
  const bets = (card?.stats || []).reduce((s, x) => s + Number(x.bets || 0), 0);
  const wins = (card?.stats || []).reduce((s, x) => s + Number(x.wins || 0), 0);
  const losses = (card?.stats || []).reduce((s, x) => s + Number(x.losses || 0), 0);
  const profit = (card?.stats || []).reduce((s, x) => s + Number(x.profit || 0), 0);
  const winRate = wins + losses ? Math.round((wins / (wins + losses)) * 100) : null;
  const lastRecorded = payments.find((p) => p.status === "recorded") || null;
  const paidLine = user.paidCount ? `${money(user.paidTotal || 0)} · ${user.paidCount} ${plural(user.paidCount, "оплата", "оплати", "оплат")}` : user.refundedAmount ? "0 ₴ · повернення" : "0 ₴";
  const aiLimit = settings?.aiDailyLimit;
  const tg = telegramUrl(user.telegram);
  const role = user.isOwner ? "Овнер" : admin ? "Адміністратор" : "Користувач";
  const canCancelSub = !admin && ["active", "soon", "urgent", "trial"].includes(st) && !endsWithoutRenewal(user);
  const off = online ? undefined : "Запрацює після відновлення зв’язку";

  return (
    <aside className="v3-ucard" aria-label={`Картка ${user.username}`}>
      <div className="v3-uc-top">
        <UserAvatar username={user.username} telegram={user.telegram} className="v3-av-lg" />
        <div className="v3-uc-id">
          <h2>@{user.username}</h2>
          <p>{tg || "Telegram не вказано"} · {role}</p>
        </div>
        {viewOnly ? <span className="v3-tag v3-tag-view">Лише перегляд</span> : <span className={`v3-tag ${ui.cls}`}>{ui.label}</span>}
        {onClose && <button type="button" className="v3-icon-btn v3-uc-close" onClick={onClose} aria-label="Закрити картку"><X size={18} /></button>}
      </div>

      <div className="v3-uc-sub">
        <div className="v3-uc-sub-top"><span>Підписка</span><span className="v3-uc-sub-tag">{leftTag(user)}</span></div>
        <strong className="v3-uc-sub-plan">{admin ? `${plan.plan} · безстроково` : `${plan.plan} · ${user.endDate ? `до ${longDate(user.endDate)}` : "без дати"}`}</strong>
        <div className="v3-uc-sub-bar" aria-hidden="true"><span style={{ width: `${progress(user)}%` }} /></div>
        <div className="v3-uc-sub-meta"><span>{admin ? "без обмежень" : user.startDate ? `з ${longDate(user.startDate)}` : ""}</span><span>{plan.price}</span></div>
        {!admin && (
          <div className="v3-uc-sub-actions">
            <button type="button" className="v3-btn v3-btn-white" disabled={!online} title={off} onClick={() => setDlg("pay")}>Додати оплату</button>
            <button type="button" className="v3-btn v3-btn-outline-white" disabled={!online || st === "blocked"} title={st === "blocked" ? "Під час самообмеження продовжувати не можна" : off} onClick={onExtend}>+{extendDays} днів</button>
          </div>
        )}
      </div>

      {user.selfLimitedUntil && (
        <div className="v3-uc-excl"><Lock size={18} aria-hidden="true" /><span><strong>Самообмеження до {longDate(user.selfLimitedUntil.slice(0, 10))}</strong> — на прохання користувача. Зняти раніше не можна.</span></div>
      )}
      {endsWithoutRenewal(user) && <p className="v3-uc-info">Підписку скасовано — доступ до {shortDate(user.endDate)}, далі без продовження.</p>}

      <div className="v3-uc-foot v3-uc-foot-top">
        <button type="button" className="v3-btn v3-btn-ghost-dark v3-btn-sm" disabled={!online} onClick={onEdit}>Редагувати</button>
        <button type="button" className={`v3-btn v3-btn-sm ${resetReason ? "v3-btn-locked" : "v3-btn-ghost-dark"}`} disabled={!!resetReason || !online} title={resetReason || off} onClick={onResetPassword}>{resetReason && <Lock size={13} aria-hidden="true" />}Скинути пароль</button>
        <button type="button" className={`v3-btn v3-btn-sm v3-uc-del ${deleteReason ? "v3-btn-locked" : "v3-btn-danger-outline"}`} disabled={!!deleteReason || !online} title={deleteReason || off} aria-describedby={deleteReason ? "uc-lock" : undefined} onClick={onDelete}>{deleteReason && <Lock size={13} aria-hidden="true" />}Видалити</button>
      </div>
      {selfAccount ? (
        <div id="uc-lock" className="v3-uc-self"><span className="v3-uc-self-ico" aria-hidden="true"><UserIcon size={16} /></span><span><strong>Це ваш акаунт</strong><small>Власний обліковий запис видалити не можна</small></span></div>
      ) : (deleteReason || resetReason) && (
        <div id="uc-lock" className="v3-uc-lockbox"><Lock size={16} aria-hidden="true" /><span>{viewOnly ? "Змінювати роль, скидати пароль і видаляти адміністраторів може лише овнер." : `${deleteReason || resetReason}.`}</span></div>
      )}

      {error ? <div className="v3-uc-error" role="alert"><p>{error}</p><button type="button" className="v3-btn v3-btn-ghost-dark v3-btn-sm" onClick={load}>Повторити</button></div> : <>
        <Section id="prof" title="Профіль" summary={`План ${plan.plan}`} open={open.prof} onToggle={() => setOpen({ ...open, prof: !open.prof })}>
          <dl className="v3-uc-dl">
            <div><dt>План</dt><dd>{plan.plan} · {plan.price}</dd></div>
            {!admin && <div><dt>Наступна оплата</dt><dd>{["ended", "cancelled"].includes(st) || !user.endDate ? "—" : shortDate(user.endDate)}</dd></div>}
            {!admin && <div><dt>Дата народження</dt><dd className="v3-uc-dob">{birthText(user)}<span className={`v3-tag ${user.ageConfirmed ? "v3-tag-okdark" : "v3-tag-warndark"}`}>{ageText(user)}</span></dd></div>}
            {!admin && <div><dt>Пробний період</dt><dd>{trialText(user, settings)}</dd></div>}
            {!admin && <div><dt>AI сьогодні</dt><dd>{aiLimit ? `${user.aiToday || 0} з ${aiLimit}` : user.aiToday || "—"}</dd></div>}
            <div><dt>Створено</dt><dd>{user.createdAt ? longDate(user.createdAt.slice(0, 10)) : "—"}</dd></div>
            {!admin && <div><dt>Сплачено загалом</dt><dd>{paidLine}</dd></div>}
            {!admin && <div><dt>Остання оплата</dt><dd>{user.lastPaymentDate ? `${shortDate(user.lastPaymentDate)} · ${money(user.lastPaymentAmount || 0)}` : "—"}</dd></div>}
          </dl>
        </Section>

        {!admin && (
          <Section id="bets" title="Ставки · за весь час" summary={card ? `${bets} ставок · ${signed(profit)}` : undefined} open={open.bets} onToggle={() => setOpen({ ...open, bets: !open.bets })}
            extra={bets > 0 ? <Link to={`/bets?q=${encodeURIComponent(user.username)}`} className="v3-uc-link">Усі ставки →</Link> : undefined}>
            {!card ? <p className="v3-uc-loading" role="status">Завантаження…</p> : (
              <div className="v3-uc-stats">
                <div><span>Ставок</span><strong>{bets}</strong></div>
                <div><span>Вінрейт</span><strong>{winRate === null ? "—" : `${winRate}%`}</strong></div>
                <div><span>Профіт</span><strong className={profit >= 0 ? "v3-gain" : "v3-loss"}>{bets ? signed(profit) : "—"}</strong></div>
              </div>
            )}
          </Section>
        )}

        {!admin && (
          <Section id="pay" title="Оплати" summary={paidLine} open={open.pay} onToggle={() => setOpen({ ...open, pay: !open.pay })}
            extra={<Link to={`/payments?q=${encodeURIComponent(user.username)}`} className="v3-uc-link">Уся історія →</Link>}>
            {payments.length ? <ul className="v3-uc-pays">
              {payments.slice(0, 5).map((p) => {
                const refunded = p.status === "refunded";
                const cancelled = p.status === "cancelled";
                const amount = refunded ? -Number(p.refundedAmount || p.amount) : Number(p.amount);
                return (
                  <li key={p.id}>
                    <strong className={cancelled ? "v3-strike" : ""}>{refunded ? `−${money(Math.abs(amount))}` : money(amount)}</strong>
                    <span className={`v3-tag ${refunded ? "v3-tag-refund" : cancelled ? "v3-tag-cancel" : "v3-tag-okdark"}`}>{refunded ? "Повернено" : cancelled ? "Скасовано" : "Записано"}</span>
                    <small>{shortDate(p.paidOn)} · {refunded ? "повернення" : planName(user.proUntil ? user.proBasePlan : user.plan)} · №{p.id}</small>
                    <span className="v3-uc-pay-tools">
                      {!cancelled && <button type="button" className="v3-link-sm" disabled={receiptBusy !== null} onClick={() => openReceipt(p)}>{receiptBusy === p.id ? "Чек…" : "Чек"}</button>}
                      {p.status === "recorded" && <button type="button" className="v3-link-sm v3-link-danger" disabled={!online} onClick={() => setCancelling(p)}>Скасувати запис</button>}
                    </span>
                  </li>
                );
              })}
            </ul> : <p className="v3-uc-empty">Оплат ще не записано.</p>}
          </Section>
        )}

        <section className="v3-uc-note">
          <div className="v3-uc-note-head"><strong>Внутрішня нотатка</strong>{!editingNote && card && <button type="button" onClick={() => { setDraft(card.note?.content || ""); setEditingNote(true); }}>Редагувати</button>}</div>
          {editingNote ? <>
            <textarea aria-label="Внутрішня нотатка" autoFocus value={draft} maxLength={5000} rows={3} onChange={(e) => setDraft(e.target.value)} placeholder="Напишіть, що варто знати іншим адмінам" />
            <div className="v3-uc-note-foot"><span>{draft.length}/5000</span><span><button type="button" className="v3-link-sm v3-link-dark" onClick={() => setEditingNote(false)} disabled={savingNote}>Скасувати</button><button type="button" className="v3-btn v3-btn-dark v3-btn-sm" disabled={savingNote || draft === (card?.note?.content || "")} onClick={saveNote}>{savingNote ? "Збереження…" : "Зберегти"}</button></span></div>
          </> : <p>{card ? card.note?.content || "Нотаток ще немає." : "…"}</p>}
          <small>Бачать лише адміністратори{card?.note?.updatedBy ? ` · @${card.note.updatedBy}, ${shortDate((card.note.updatedAt || "").slice(0, 10))}` : ""}</small>
        </section>

      </>}

      {!admin && (
        <div className="v3-uc-mini v3-uc-mini-bottom">
          <button type="button" className="v3-mini" disabled={!online || st === "blocked"} title={off} onClick={() => setDlg("pro")}>Видати Pro</button>
          <button type="button" className="v3-mini" disabled={!online || !lastRecorded} title={!lastRecorded ? "Немає записаної оплати" : off} onClick={() => setDlg("refund")}>Повернути гроші</button>
          <button type="button" className="v3-mini is-danger" disabled={!online || !canCancelSub} title={!canCancelSub ? "Активної підписки немає" : off} onClick={() => setDlg("cancel")}>Скасувати підписку</button>
        </div>
      )}

      <AddPaymentDialog open={dlg === "pay"} onOpenChange={(o) => setDlg(o ? "pay" : null)} userId={user.id} username={user.username} endDate={user.endDate} priceMonth={String(user.priceMonth || "")} onSaved={changed}
        planLabel={plan.plan} onReceipt={async (id) => { try { const r = await api.get<{ payments: PayWithRefund[] }>(`/admin/users/${user.id}/payments?page=1`); const p = r.payments.find((x) => String(x.id) === String(id)); if (p) openReceipt(p); } catch (e) { toast.error((e as Error).message); } }} />
      <GrantProDialog user={user} open={dlg === "pro"} onOpenChange={(o) => setDlg(o ? "pro" : null)} onDone={changed} />
      <RefundDialog user={user} payment={lastRecorded} open={dlg === "refund"} onOpenChange={(o) => setDlg(o ? "refund" : null)} onDone={changed} />
      <CancelSubscriptionDialog user={user} open={dlg === "cancel"} onOpenChange={(o) => setDlg(o ? "cancel" : null)} onDone={changed} />
      <CancelPaymentDialog payment={cancelling} onOpenChange={(o) => { if (!o) setCancelling(null); }} onDone={changed} />
      <ReceiptDialog data={receipt} username={user.username} onOpenChange={(o) => { if (!o) setReceipt(null); }} />
    </aside>
  );
}
