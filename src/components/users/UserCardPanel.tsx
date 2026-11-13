import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/apiClient";
import { roleLabel } from "@/lib/permissions";
import { createPaymentReceipt } from "@/lib/paymentReceipt";
import { money, shortDate } from "@/lib/subscriptions";
import type { UserData } from "@/types";
import { AddPaymentDialog, CancelPaymentDialog, ReceiptDialog, type Payment } from "./PaymentDialogs";

type Note = { content: string; version: number; updatedBy: string | null; updatedAt: string | null };
type Card = {
  user: { username: string; telegram: string; role: string; startDate: string; endDate: string; priceMonth: string; createdAt: string };
  note: Note;
  stats: { currency: string; bets: number; wins: number; losses: number; pending: number; staked: string; profit: string }[];
};
type Summary = { total: string; count: number; latest: Payment | null };
type Event = { id: string; actor_name: string; created_at: string; action: string; target: string; status: string };

const date = (v?: string | null) => (v ? new Date(v.length === 10 ? `${v}T12:00:00` : v).toLocaleDateString("uk-UA", { timeZone: "Europe/Kyiv" }) : "—");
const eventLabel = (e: Event) =>
  e.target.endsWith("/payments") ? "Додано оплату" : e.target.endsWith("/cancel") ? "Скасовано оплату" : e.target.endsWith("/note") ? "Оновлено нотатку"
    : e.target.endsWith("/reset-password") ? "Скинуто пароль" : e.action === "POST" ? "Створено акаунт" : e.action === "DELETE" ? "Видалено акаунт" : "Оновлено акаунт";

function Section({ title, summary, open, onToggle, extra, children }: { title: string; summary?: string; open: boolean; onToggle: () => void; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="v3-uc-sec">
      <div className="v3-uc-sec-head">
        <p className="v3-uc-sec-l">{title}</p>
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
  user: UserData;
  extendDays: number;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onExtend: () => void;
  onChanged: () => void;
  onClose?: () => void;
}

export default function UserCardPanel({ user, extendDays, canDelete, onEdit, onDelete, onExtend, onChanged, onClose }: Props) {
  const [card, setCard] = useState<Card | null>(null);
  const [error, setError] = useState("");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [draft, setDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [open, setOpen] = useState({ prof: true, bets: true, pay: false, hist: false });
  const [addOpen, setAddOpen] = useState(false);
  const [cancelling, setCancelling] = useState<Payment | null>(null);
  const [receipt, setReceipt] = useState<{ image: string; payment: Payment } | null>(null);
  const [receiptBusy, setReceiptBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    const [c, p, h] = await Promise.allSettled([
      api.get<Card>(`/admin/users/${user.id}/card`),
      api.get<{ payments: Payment[]; summary: Summary }>(`/admin/users/${user.id}/payments?page=1`),
      api.get<{ entries: Event[] }>(`/admin/audit?userId=${user.id}`),
    ]);
    if (c.status === "fulfilled") { setCard(c.value); setDraft(c.value.note?.content || ""); } else setError((c.reason as Error)?.message || "Не вдалося завантажити картку");
    if (p.status === "fulfilled") { setPayments(p.value.payments || []); setSummary(p.value.summary || null); }
    if (h.status === "fulfilled") setEvents((h.value.entries || []).slice(0, 5));
  }, [user.id]);

  useEffect(() => { setCard(null); setPayments([]); setSummary(null); setEvents([]); load(); }, [load]);

  const noteDirty = !!card && draft !== (card.note?.content || "");
  async function saveNote() {
    if (!card) return;
    setSavingNote(true);
    try {
      const note = await api.put<Note>(`/admin/users/${user.id}/note`, { content: draft, version: card.note.version });
      setCard({ ...card, note });
      toast.success("Нотатку збережено");
    } catch (e) { toast.error((e as Error).message); } finally { setSavingNote(false); }
  }
  async function openReceipt(p: Payment) {
    setReceiptBusy(p.id);
    try { setReceipt({ image: await createPaymentReceipt(p, { username: user.username, telegram: user.telegram }), payment: p }); }
    catch (e) { toast.error((e as Error).message); } finally { setReceiptBusy(null); }
  }
  const afterPayment = () => { load(); onChanged(); };

  const stats = card?.stats || [];
  const bets = stats.reduce((s, x) => s + Number(x.bets || 0), 0);
  const wins = stats.reduce((s, x) => s + Number(x.wins || 0), 0);
  const losses = stats.reduce((s, x) => s + Number(x.losses || 0), 0);
  const profit = stats.reduce((s, x) => s + Number(x.profit || 0), 0);
  const winRate = wins + losses ? Math.round((wins / (wins + losses)) * 100) : null;
  const price = Number(user.priceMonth) || 0;
  const days = user.daysUntilExpiry ?? 0;
  const status = !user.isActive ? { t: "Закінчилась", c: "v3-tag-red" } : days <= 7 ? { t: days === 0 ? "Сьогодні" : `${days} дн.`, c: "v3-tag-amber" } : { t: "Активна", c: "v3-tag-green" };

  return (
    <aside className="v3-ucard" aria-label={`Картка ${user.username}`}>
      <div className="v3-uc-top">
        <span className="v3-av v3-av-lg" aria-hidden="true">{user.username.slice(0, 2).toUpperCase()}</span>
        <div className="v3-uc-id">
          <h2>@{user.username}</h2>
          <p>{user.telegram || "Telegram не вказано"} · {roleLabel(user)}</p>
        </div>
        {onClose && <button type="button" className="v3-icon-btn v3-uc-close" onClick={onClose} aria-label="Закрити картку"><X size={18} /></button>}
      </div>

      <div className="v3-uc-hero">
        <div><span>Тариф</span><strong>{price ? `${price} ₴` : "Без оплати"}</strong><small>за 30 днів</small></div>
        <div><span>Доступ до</span><strong>{shortDate(user.endDate) || "—"}</strong><small><span className={`v3-tag ${status.c}`}>{status.t}</span></small></div>
      </div>

      <div className="v3-uc-actions">
        <button type="button" className="v3-btn v3-btn-primary v3-btn-sm" onClick={() => setAddOpen(true)}>Додати оплату</button>
        <button type="button" className="v3-btn v3-btn-ghost-dark v3-btn-sm" onClick={onExtend}>+{extendDays} днів…</button>
        <button type="button" className="v3-btn v3-btn-ghost-dark v3-btn-sm" onClick={onEdit}><Pencil size={14} aria-hidden="true" />Редагувати</button>
        {canDelete && <button type="button" className="v3-btn v3-btn-danger-outline v3-btn-sm" onClick={onDelete}><Trash2 size={14} aria-hidden="true" />Видалити</button>}
      </div>

      {error ? <div className="v3-uc-error" role="alert"><p>{error}</p><button type="button" className="v3-btn v3-btn-ghost-dark v3-btn-sm" onClick={load}>Повторити</button></div> : !card ? <p className="v3-uc-loading" role="status">Завантаження картки…</p> : <>
        <Section title="Профіль" summary={price ? `${price} ₴ · до ${shortDate(user.endDate)}` : `до ${shortDate(user.endDate)}`} open={open.prof} onToggle={() => setOpen({ ...open, prof: !open.prof })}>
          <dl className="v3-uc-dl">
            <div><dt>Тариф</dt><dd>{price ? `${price} ₴ / 30 днів` : "Без оплати"}</dd></div>
            <div><dt>Підписка</dt><dd>{date(card.user.startDate)} — {date(card.user.endDate)}</dd></div>
            <div><dt>Створено</dt><dd>{date(card.user.createdAt)}</dd></div>
            <div><dt>Сплачено загалом</dt><dd>{summary ? `${money(Number(summary.total))} · ${summary.count} оплат` : "—"}</dd></div>
            <div><dt>Остання оплата</dt><dd>{summary?.latest ? `${date(summary.latest.paidOn)} · ${money(Number(summary.latest.amount))}` : "Ще немає"}</dd></div>
          </dl>
        </Section>

        <Section title="Ставки · за весь час" summary={bets ? `${bets} ставок · ${profit >= 0 ? "+" : "−"}${money(Math.abs(profit))}` : "ставок немає"} open={open.bets} onToggle={() => setOpen({ ...open, bets: !open.bets })}>
          {bets ? (
            <div className="v3-uc-stats">
              <div><span>Ставок</span><strong>{bets}</strong></div>
              <div><span>Вінрейт</span><strong>{winRate === null ? "—" : `${winRate}%`}</strong></div>
              <div><span>Профіт</span><strong className={profit >= 0 ? "v3-gain" : "v3-loss"}>{profit >= 0 ? "+" : "−"}{money(Math.abs(profit))}</strong></div>
            </div>
          ) : <p className="v3-uc-empty">Ставок ще немає.</p>}
          {bets > 0 && <Link to={`/bets?q=${encodeURIComponent(user.username)}`} className="v3-uc-link">Усі ставки →</Link>}
        </Section>

        <Section title="Оплати" summary={summary ? `${money(Number(summary.total))} · ${summary.count} оплат` : undefined} open={open.pay} onToggle={() => setOpen({ ...open, pay: !open.pay })}>
          {payments.length ? <ul className="v3-uc-pays">
            {payments.slice(0, 5).map((p) => (
              <li key={p.id}>
                <div><strong className={p.status === "cancelled" ? "v3-strike" : ""}>{money(Number(p.amount))}</strong><small>{date(p.paidOn)} · №{p.id} · {date(p.periodStart)} — {date(p.periodEnd)}</small></div>
                <div className="v3-uc-pay-tools">
                  <span className={`v3-tag ${p.status === "cancelled" ? "v3-tag-gray" : "v3-tag-green"}`}>{p.status === "cancelled" ? "Скасовано" : "Записано"}</span>
                  {p.status !== "cancelled" && <>
                    <button type="button" className="v3-link-sm" disabled={receiptBusy !== null} onClick={() => openReceipt(p)}>{receiptBusy === p.id ? "Чек…" : "Чек"}</button>
                    <button type="button" className="v3-link-sm v3-link-danger" onClick={() => setCancelling(p)}>Скасувати</button>
                  </>}
                </div>
              </li>
            ))}
          </ul> : <p className="v3-uc-empty">Оплат ще не записано.</p>}
        </Section>

        <section className="v3-uc-note">
          <div className="v3-uc-note-head"><strong>Внутрішня нотатка</strong><span>Бачать лише адміністратори</span></div>
          <textarea aria-label="Внутрішня нотатка" value={draft} maxLength={5000} rows={3} onChange={(e) => setDraft(e.target.value)} placeholder="Напишіть, що варто знати іншим адмінам" />
          <div className="v3-uc-note-foot">
            <span>{card.note?.updatedBy ? `${card.note.updatedBy}, ${date(card.note.updatedAt)}` : `${draft.length}/5000`}</span>
            <button type="button" className="v3-btn v3-btn-dark v3-btn-sm" disabled={!noteDirty || savingNote} onClick={saveNote}>{savingNote ? "Збереження…" : "Зберегти"}</button>
          </div>
        </section>

        <Section title="Останні зміни" open={open.hist} onToggle={() => setOpen({ ...open, hist: !open.hist })} extra={<Link to={`/audit?userId=${user.id}&username=${encodeURIComponent(user.username)}`} className="v3-uc-link">Уся історія →</Link>}>
          {events.length ? <ol className="v3-uc-hist">{events.map((e) => <li key={e.id}><strong>{eventLabel(e)}</strong><small>@{e.actor_name} · {date(e.created_at)}{e.status !== "success" ? " · не підтверджено" : ""}</small></li>)}</ol> : <p className="v3-uc-empty">Змін ще не зафіксовано.</p>}
        </Section>
      </>}

      <AddPaymentDialog open={addOpen} onOpenChange={setAddOpen} userId={user.id!} username={user.username} endDate={user.endDate} priceMonth={user.priceMonth} onSaved={afterPayment} />
      <CancelPaymentDialog payment={cancelling} onOpenChange={(o) => { if (!o) setCancelling(null); }} onDone={afterPayment} />
      <ReceiptDialog data={receipt} username={user.username} onOpenChange={(o) => { if (!o) setReceipt(null); }} />
    </aside>
  );
}
