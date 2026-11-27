import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, History, Lock, MoreHorizontal, Pencil, Plus, Send, Trash2 } from "lucide-react";
import UserAvatar from "@/components/UserAvatar";
import { composeMessage, copyMessage } from "@/lib/messages";
import { openTelegram } from "@/lib/telegram";
import { shortDate } from "@/lib/subscriptions";
import { plural } from "@/lib/dashboardInsights";
import { birthText, daysLeft, isAdmin, longDate, planCell, statusOf, tagOf, trialText } from "@/lib/usersModel";
import type { AdminUserOverview, AppSettings } from "@/types";

const money = (n: number) => `${Math.round(n).toLocaleString("uk-UA")} ₴`;
const tgHandle = (t?: string | null) => (t || "").replace(/^https?:\/\/t\.me\//, "").replace(/^@/, "").trim();
const dayMonth = (v?: string | null) => { if (!v) return "—"; const d = new Date(`${v.slice(0, 10)}T00:00:00`); return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("uk-UA", { day: "numeric", month: "long" }); };
const weekday = (v?: string | null) => { if (!v) return ""; const d = new Date(`${v.slice(0, 10)}T00:00:00`); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("uk-UA", { weekday: "short" }); };
const daysSince = (v?: string | null) => { if (!v) return null; const t = new Date(`${v.slice(0, 10)}T00:00:00`).getTime(); return Number.isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t) / 864e5)); };
/** «З нами»: days for the first two months, then months. */
export const withUs = (v?: string | null) => { const n = daysSince(v); if (n === null) return "—"; if (n < 60) return `${n} ${plural(n, "день", "дні", "днів")}`; const m = Math.floor(n / 30); return `${m} міс.`; };
/** Light status tag classes for the web (Активна / Закінчується / Скасована / Пробний / Повний доступ). */
export function webTag(u: AdminUserOverview): { label: string; cls: string } {
  if (isAdmin(u)) return { label: "Повний доступ", cls: "is-grey" };
  const t = tagOf(u), s = statusOf(u);
  const cls = s === "cancelled" ? "is-red" : s === "ended" ? "is-grey" : s === "blocked" ? "is-grey" : t.label === "Закінчується" ? "is-amber" : s === "trial" ? "is-blue" : "is-green";
  return { label: t.label, cls };
}

interface Props {
  user: AdminUserOverview;
  settings: AppSettings | null;
  extendDays: number;
  online: boolean;
  deleteReason: string | null;
  resetReason: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onResetPassword: () => void;
  onExtend: () => void;
  onAddPayment: () => void;
  onHistory: () => void;
}

/** Web user card on the right (design «Користувачі · веб»). */
export default function UserWebCard({ user, settings, extendDays, online, deleteReason, resetReason, onEdit, onDelete, onResetPassword, onExtend, onAddPayment, onHistory }: Props) {
  const [menu, setMenu] = useState(false);
  const [wr, setWr] = useState<"idle" | "done">("idle");
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setMenu(false); setWr("idle"); }, [user.id]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [menu]);

  const admin = isAdmin(user);
  const st = statusOf(user);
  const tag = webTag(user);
  const plan = planCell(user, settings);
  const tg = tgHandle(user.telegram);
  const role = user.isOwner ? "Овнер" : admin ? "Адміністратор" : "Користувач";
  const off = online ? undefined : "Запрацює після відновлення зв’язку";
  const dl = user.endDate ? daysLeft(user) : null;
  const closed = st === "cancelled" || st === "ended";
  const pct = (() => {
    const s = user.startDate ? Date.parse(`${user.startDate.slice(0, 10)}T00:00:00`) : NaN, e = user.endDate ? Date.parse(`${user.endDate.slice(0, 10)}T00:00:00`) : NaN;
    if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return 0;
    return Math.max(0, Math.min(100, ((Date.now() - s) / (e - s)) * 100));
  })();
  const msgKind = dl === null ? null : dl < 0 ? "tplLapsed" as const : dl <= (settings?.expiringDays || 7) ? "tplExpiring" as const : null;
  const message = msgKind ? composeMessage(msgKind, settings, { username: user.username, endDate: user.endDate, plan: user.plan, priceMonth: user.priceMonth }) : undefined;
  const write = () => { if (!tg) return; copyMessage(message); openTelegram(tg); setWr("done"); window.setTimeout(() => setWr("idle"), 2200); };
  const paid = `${money(user.paidTotal || 0)}${user.refundedAmount ? ` · повернено ${money(user.refundedAmount)}` : ""}`;
  const aiLimit = settings?.aiDailyLimit;
  const pick = (f: () => void) => () => { setMenu(false); f(); };

  return (
    <aside className="v3-uwc" aria-label={`Картка @${user.username}`}>
      <div className="v3-uwc-top">
        <UserAvatar username={user.username} telegram={user.telegram} />
        <div className="v3-uwc-id">
          <h2>@{user.username}</h2>
          <p>{tg ? `Telegram @${tg}` : "Telegram не вказано"} · {role}</p>
        </div>
        <div className="v3-uwc-more" ref={menuRef}>
          <button type="button" className="v3-uwc-dots" aria-label="Дії з користувачем" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}><MoreHorizontal size={18} aria-hidden="true" /></button>
          {menu && (
            <div className="v3-uwc-menu" role="menu" aria-label={`Дії з @${user.username}`}>
              {!admin && <button type="button" role="menuitem" disabled={!online || st === "blocked"} title={off} onClick={pick(onAddPayment)}><Plus size={16} aria-hidden="true" /><span><b>Додати оплату</b><small>записати оплату й продовжити</small></span></button>}
              <button type="button" role="menuitem" disabled={!online} title={off} onClick={pick(onEdit)}><Pencil size={16} aria-hidden="true" /><span><b>Редагувати профіль</b><small>логін, Telegram, вік, роль</small></span></button>
              <button type="button" role="menuitem" disabled={!!resetReason || !online} title={resetReason || off} onClick={pick(onResetPassword)}><Lock size={16} aria-hidden="true" /><span><b>Скинути пароль</b><small>{resetReason || "новий пароль покажемо один раз"}</small></span></button>
              <button type="button" role="menuitem" onClick={pick(onHistory)}><History size={16} aria-hidden="true" /><span><b>Історія змін</b></span></button>
              <i aria-hidden="true" />
              <button type="button" role="menuitem" className="is-danger" disabled={!!deleteReason || !online} title={deleteReason || off} onClick={pick(onDelete)}><Trash2 size={16} aria-hidden="true" /><span><b>Видалити користувача</b>{deleteReason && <small>{deleteReason}</small>}</span></button>
            </div>
          )}
        </div>
      </div>

      {!admin && (user.ageConfirmed
        ? <p className="v3-uwc-age is-ok"><Check size={13} strokeWidth={3} aria-hidden="true" />Вік підтверджено</p>
        : <button type="button" className="v3-uwc-age is-warn" disabled={!online} onClick={onEdit}>Вік не підтверджено · підтвердити</button>)}
      {user.selfLimitedUntil && <p className="v3-uwc-age is-lock"><Lock size={12} aria-hidden="true" />Самообмеження до {longDate(user.selfLimitedUntil.slice(0, 10))}</p>}

      <div className="v3-uwc-sub">
        <div className="v3-uwc-sub-h">
          <strong>{admin ? "Повний доступ" : plan.plan}</strong>
          {!admin && <small>{user.plan === "trial" || user.proUntil || plan.price === "—" ? plan.price : `${plan.price} / ${extendDays} днів`}</small>}
          <span className={`v3-uwt ${tag.cls}`}>{tag.label}</span>
        </div>
        {!admin && <>
          <div className="v3-uwc-dates"><span>Почалась · <b>{dayMonth(user.startDate)}</b></span><span>{st === "ended" ? "Закінчилась" : st === "cancelled" ? "Закінчиться" : "Закінчиться"} · <b>{user.endDate ? `${dayMonth(user.endDate)}${st === "cancelled" ? "" : `, ${weekday(user.endDate)}`}` : "—"}</b></span></div>
          <div className={`v3-uwc-bar${closed ? " is-off" : ""}`} role="progressbar" aria-label="Пройдено з підписки" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}><i style={{ width: `${closed ? 100 : pct}%` }} /></div>
          <dl className="v3-uwc-tiles">
            <div><dt>Наступна оплата</dt><dd>{closed || !user.endDate ? "—" : shortDate(user.endDate)}</dd></div>
            <div><dt>Сплачено</dt><dd>{paid}</dd></div>
            <div><dt>З нами</dt><dd>{withUs(user.createdAt)}</dd></div>
          </dl>
        </>}
      </div>

      <div className="v3-uwc-acts">
        {!admin && <>
          <Link className="v3-uwb is-green" to={`/payments?user=${encodeURIComponent(user.username)}`}>Оплати<ArrowRight size={14} aria-hidden="true" /></Link>
          <button type="button" className="v3-uwb" disabled={!online || st === "blocked"} title={st === "blocked" ? "Під час самообмеження продовжувати не можна" : off} onClick={onExtend}>+{extendDays} днів</button>
        </>}
        <button type="button" className="v3-uwb is-wide" disabled={!tg} title={tg ? `Відкрити чат з @${tg} у Telegram` : "Telegram не вказано"} onClick={write}>
          {wr === "done" ? <><Check size={14} strokeWidth={3} aria-hidden="true" />Відкрито</> : <><Send size={14} aria-hidden="true" />Написати в Telegram</>}
        </button>
      </div>

      <dl className="v3-uwc-list">
        {!admin && <div><dt>AI сьогодні</dt><dd>{aiLimit ? `${user.aiToday || 0} з ${aiLimit}` : user.aiToday || "—"}</dd></div>}
        {!admin && <div><dt>Дата народження</dt><dd>{birthText(user)}</dd></div>}
        {!admin && <div><dt>21+</dt><dd className={user.ageConfirmed ? undefined : "is-warn"}>{user.ageConfirmed ? "підтверджено" : "не підтверджено"}</dd></div>}
        {!admin && <div><dt>Пробний період</dt><dd>{trialText(user, settings)}</dd></div>}
        <div><dt>Створено</dt><dd>{user.createdAt ? longDate(user.createdAt.slice(0, 10)) : "—"}</dd></div>
      </dl>

      <div className="v3-uwc-links">
        {!admin && <Link to={`/bets?q=${encodeURIComponent(user.username)}`}>Ставки →</Link>}
        <button type="button" onClick={onHistory}>Історія змін →</button>
      </div>
    </aside>
  );
}
