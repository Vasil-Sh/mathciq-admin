import { useEffect, useState, type ReactNode } from "react";
import { composeMessage, copyMessage } from "@/lib/messages";
import { openTelegram } from "@/lib/telegram";
import { Link } from "react-router-dom";
import { ArrowRight, Check, ChevronDown, ChevronRight, History, KeyRound, Lock, MoreHorizontal, Pencil, Send, Trash2, User as UserIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import UserAvatar from "@/components/UserAvatar";
import { shortDate } from "@/lib/subscriptions";
import { plural } from "@/lib/dashboardInsights";
import { ageText, birthText, daysLeft, isAdmin, leftTag, longDate, planCell, statusOf, statusUi, trialText, endsWithoutRenewal } from "@/lib/usersModel";
import type { AdminUserOverview, AppSettings } from "@/types";


const dayMonth = (v?: string | null) => { if (!v) return "—"; const d = new Date(`${v.slice(0, 10)}T00:00:00`); return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("uk-UA", { day: "numeric", month: "long" }); };
const weekday = (v?: string | null) => { if (!v) return ""; const d = new Date(`${v.slice(0, 10)}T00:00:00`); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("uk-UA", { weekday: "short" }); };
const daysSince = (v?: string | null) => { if (!v) return null; const t = new Date(`${v.slice(0, 10)}T00:00:00`).getTime(); return Number.isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t) / 86400000)); };
const money = (n: number) => `${Math.round(n).toLocaleString("uk-UA")} ₴`;
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
  /** Opens the edit form at the age block (badge «Вік не підтверджено · підтвердити»). */
  onConfirmAge?: () => void;
  onChanged: () => void;
  onClose?: () => void;
}

/** Right-hand user card (design «Користувачі v3 · список + картка»). */
export default function UserCardPanel({ user, settings, extendDays, online, deleteReason, resetReason, onEdit, onDelete, onResetPassword, onExtend, onConfirmAge, onChanged, onClose }: Props) {
  const [wr, setWr] = useState<"idle" | "fly" | "done">("idle");
  const [more, setMore] = useState(false);
  const mobile = !!onClose;
  useEffect(() => { setWr("idle"); }, [user.id]);
  const [open, setOpen] = useState({ prof: false });

  const admin = isAdmin(user);
  const st = statusOf(user);
  const ui = statusUi(user);
  const selfAccount = !!deleteReason && deleteReason.startsWith("Власний");
  const viewOnly = !selfAccount && !!deleteReason && !!resetReason;
  const plan = planCell(user, settings);
  const paidLine = user.paidCount ? `${money(user.paidTotal || 0)} · ${user.paidCount} ${plural(user.paidCount, "оплата", "оплати", "оплат")}` : user.refundedAmount ? "0 ₴ · повернення" : "0 ₴";
  const aiLimit = settings?.aiDailyLimit;
  const tg = telegramUrl(user.telegram);
  const role = user.isOwner ? "Овнер" : admin ? "Адміністратор" : "Користувач";
  const off = online ? undefined : "Запрацює після відновлення зв’язку";
  const dl = user.endDate ? daysLeft(user) : null;
  const ringC = dl !== null && dl < 3 ? "#e5533d" : dl !== null && dl < 7 ? "#f0a03c" : "#00B24B";
  const ringOff = dl === null ? 314 : Math.round(314 * (1 - Math.min(1, Math.max(0, dl) / 30)));
  const tgHandle = tg ? tg.replace(/^t\.me\//, "") : "";
  // Ended → «Не продовжив»; ends soon → «Закінчується підписка»; otherwise just open the chat.
  const msgKind = dl === null ? null : dl < 0 ? "tplLapsed" as const : dl <= (settings?.expiringDays || 7) ? "tplExpiring" as const : null;
  const message = msgKind ? composeMessage(msgKind, settings, { username: user.username, endDate: user.endDate, plan: user.plan, priceMonth: user.priceMonth }) : undefined;
  const write = () => { if (!tgHandle || wr !== "idle") return; setWr("fly"); copyMessage(message); openTelegram(tgHandle); window.setTimeout(() => setWr("done"), 600); window.setTimeout(() => setWr("idle"), 2600); };

  return (
    <aside className={`v3-ucard${mobile ? " is-m" : ""}`} aria-label={`Картка ${user.username}`}>
      {mobile && (
        <div className="v3-uc-mbar">
          <button type="button" className="v3-icon-btn v3-uc-more" aria-label="Більше дій" aria-haspopup="dialog" onClick={() => setMore(true)}><MoreHorizontal size={18} aria-hidden="true" /></button>
        </div>
      )}
      <div className="v3-uc-top">
        <UserAvatar username={user.username} telegram={user.telegram} className="v3-av-lg" />
        <div className="v3-uc-id">
          <h2>@{user.username}</h2>
          <p>{tg || "Telegram не вказано"} · {role}</p>
          {(mobile || !admin) && (
            <div className="v3-bdgs">
              {mobile && (viewOnly ? <span className="v3-tag v3-tag-view">Лише перегляд</span> : admin && <span className={`v3-tag ${ui.cls}`}>{ui.label}</span>)}
              {!admin && <>
              {user.ageConfirmed
                ? <span className="v3-bdg is-ok"><Check size={13} strokeWidth={3} className="v3-bdg-ck" aria-hidden="true" />Вік підтверджено</span>
                : <button type="button" className="v3-bdg is-warn" disabled={!online} onClick={onConfirmAge || onEdit}>Вік не підтверджено · підтвердити</button>}
              {user.selfLimitedUntil && <span className="v3-bdg is-lock"><Lock size={12} aria-hidden="true" />Самообмеження</span>}
              </>}
            </div>
          )}
        </div>
        {!mobile && (viewOnly ? <span className="v3-tag v3-tag-view">Лише перегляд</span> : <span className={`v3-tag ${ui.cls}`}>{ui.label}</span>)}
      </div>

      {mobile && !admin ? (
        <div className={`v3-uc-msub is-${dl !== null && dl < 3 ? "red" : dl !== null && dl < 7 ? "amber" : "green"}`}>
          {/* Phone (design UserMobileCard): plan + status, ring with start/end, three tiles */}
          <div className="v3-uc-msub-top">
            <span className="v3-uc-msub-plan">{plan.plan}</span>
            <span className="v3-uc-msub-price">{user.plan === "trial" || user.proUntil ? plan.price : `${plan.price}${plan.price !== "—" ? " / 30 днів" : ""}`}</span>
            <span className="v3-uc-msub-st"><i aria-hidden="true" />{ui.label}</span>
          </div>
          <div className="v3-uc-msub-main">
            <div className="v3-uc-msub-ring" role="img" aria-label={dl === null ? "Без дати" : `${Math.max(0, dl)} ${plural(Math.max(0, dl), "день", "дні", "днів")} до кінця`}>
              <svg width="88" height="88" viewBox="0 0 120 120" aria-hidden="true">
                <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,.28)" strokeWidth="9" />
                <circle className="v3-uc-msub-p" cx="60" cy="60" r="50" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeDasharray="314" strokeDashoffset={ringOff} transform="rotate(-90 60 60)" />
              </svg>
              <span aria-hidden="true"><strong key={dl ?? "x"}>{dl === null ? "—" : Math.max(0, dl)}</strong><small>{dl === null ? "без дати" : plural(Math.max(0, dl), "день", "дні", "днів")}</small></span>
            </div>
            <dl className="v3-uc-msub-dates">
              <div><dt>Почалась</dt><dd>{dayMonth(user.startDate)}</dd></div>
              <div><dt>{st === "ended" ? "Закінчилась" : st === "cancelled" ? "Доступ до" : "Закінчиться"}</dt><dd>{user.endDate ? `${dayMonth(user.endDate)} · ${weekday(user.endDate)}` : "—"}</dd></div>
            </dl>
          </div>
          <dl className="v3-uc-msub-tiles">
            <div><dt>Наступна оплата</dt><dd>{["ended", "cancelled"].includes(st) || !user.endDate ? "—" : shortDate(user.endDate)}</dd></div>
            <div><dt>Сплачено</dt><dd>{money(user.paidTotal || 0)}</dd></div>
            <div><dt>З нами</dt><dd>{(() => { const n = daysSince(user.createdAt); return n === null ? "—" : `${n} ${plural(n, "день", "дні", "днів")}`; })()}</dd></div>
          </dl>
        </div>
      ) : (
      <div className="v3-uc-sub">
        <div className="v3-uc-sub-top"><span>Підписка</span><span className="v3-uc-sub-tag">{leftTag(user)}</span></div>
        <div className="v3-uc-sub-main">
          {!admin && dl !== null && (
            <div className="v3-dring" role="img" aria-label={`${Math.max(0, dl)} ${plural(Math.max(0, dl), "день", "дні", "днів")} до кінця`}>
              <svg width="96" height="96" viewBox="0 0 120 120" aria-hidden="true">
                <circle cx="60" cy="60" r="58" fill="#ffffff" />
                <circle cx="60" cy="60" r="50" fill="none" stroke="#e8ecf3" strokeWidth="10" />
                <circle className="v3-dring-p" cx="60" cy="60" r="50" fill="none" stroke={ringC} strokeWidth="10" strokeLinecap="round" strokeDasharray="314" strokeDashoffset={ringOff} />
              </svg>
              <span className="v3-dring-in" aria-hidden="true"><strong key={dl}>{Math.max(0, dl)}</strong><small>{plural(Math.max(0, dl), "день", "дні", "днів")} до кінця</small></span>
            </div>
          )}
          <div className="v3-uc-sub-txt">
            <strong className="v3-uc-sub-plan">{admin ? `${plan.plan} · безстроково` : `${plan.plan} · ${user.endDate ? `до ${mobile ? shortDate(user.endDate) : longDate(user.endDate)}` : "без дати"}`}</strong>
            <span className="v3-uc-sub-meta">{admin ? "без обмежень" : [user.startDate ? `з ${longDate(user.startDate)}` : "", plan.price].filter(Boolean).join(" · ")}</span>
          </div>
        </div>
        {!admin && !mobile && (
          <div className="v3-uc-sub-actions">
            <Link className="v3-btn v3-btn-white v3-uc-paylink" to={`/payments?user=${encodeURIComponent(user.username)}`}>Оплати<ArrowRight size={15} aria-hidden="true" /></Link>
            <button type="button" className="v3-btn v3-btn-outline-white" disabled={!online || st === "blocked"} title={st === "blocked" ? "Під час самообмеження продовжувати не можна" : off} onClick={onExtend}>+{extendDays} днів</button>
          </div>
        )}
      </div>
      )}

      {user.selfLimitedUntil && (
        <div className="v3-uc-excl"><Lock size={18} aria-hidden="true" /><span><strong>Самообмеження до {longDate(user.selfLimitedUntil.slice(0, 10))}</strong> — на прохання користувача. Зняти раніше не можна.</span></div>
      )}
      {endsWithoutRenewal(user) && <p className="v3-uc-info">Підписку скасовано — доступ до {shortDate(user.endDate)}, далі без продовження.</p>}

      {mobile ? (
        <div className="v3-uc-mact">
          {/* Phone: subscription actions sit under the blue card, next to «Написати в Telegram» */}
          {!admin && <>
            <Link className="v3-btn v3-btn-white v3-uc-paylink" to={`/payments?user=${encodeURIComponent(user.username)}`}>Оплати<ArrowRight size={15} aria-hidden="true" /></Link>
            <button type="button" className="v3-btn v3-btn-ghost-dark" disabled={!online || st === "blocked"} title={st === "blocked" ? "Під час самообмеження продовжувати не можна" : off} onClick={onExtend}>+{extendDays} днів</button>
          </>}
          <button type="button" className={`v3-btn v3-btn-ghost-dark v3-write v3-uc-wide${wr === "done" ? " is-done" : ""}`} disabled={!tgHandle} title={tgHandle ? `Відкрити чат з @${tgHandle} у Telegram` : "Telegram не вказано"} onClick={write}>
            {wr === "done" ? <><Check size={14} strokeWidth={3} aria-hidden="true" />Відкрито</> : <><span className={`v3-plane${wr === "fly" ? " is-fly" : ""}`} aria-hidden="true"><Send size={14} /></span>Написати в Telegram</>}
          </button>
        </div>
      ) : (
      <div className="v3-uc-foot v3-uc-foot-top v3-uc-grid2">
        <button type="button" className={`v3-btn v3-btn-ghost-dark v3-btn-sm v3-write${wr === "done" ? " is-done" : ""}`} disabled={!tgHandle} title={tgHandle ? `Відкрити чат з @${tgHandle} у Telegram` : "Telegram не вказано"} onClick={write}>
          {wr === "done" ? <><Check size={14} strokeWidth={3} aria-hidden="true" />Відкрито</> : <><span className={`v3-plane${wr === "fly" ? " is-fly" : ""}`} aria-hidden="true"><Send size={14} /></span>Написати</>}
        </button>
        <button type="button" className="v3-btn v3-btn-ghost-dark v3-btn-sm" disabled={!online} onClick={onEdit}>Редагувати</button>
        <button type="button" className={`v3-btn v3-btn-sm ${resetReason ? "v3-btn-locked" : "v3-btn-ghost-dark"}`} disabled={!!resetReason || !online} title={resetReason || off} onClick={onResetPassword}>{resetReason && <Lock size={13} aria-hidden="true" />}Скинути пароль</button>
        <button type="button" className={`v3-btn v3-btn-sm v3-uc-del ${deleteReason ? "v3-btn-locked" : "v3-btn-danger-outline"}`} disabled={!!deleteReason || !online} title={deleteReason || off} aria-describedby={deleteReason ? "uc-lock" : undefined} onClick={onDelete}>{deleteReason && <Lock size={13} aria-hidden="true" />}Видалити</button>
      </div>
      )}
      {selfAccount ? (
        <div id="uc-lock" className="v3-uc-self"><span className="v3-uc-self-ico" aria-hidden="true"><UserIcon size={16} /></span><span><strong>Це ваш акаунт</strong><small>Власний обліковий запис видалити не можна</small></span></div>
      ) : (deleteReason || resetReason) && (
        <div id="uc-lock" className="v3-uc-lockbox"><Lock size={16} aria-hidden="true" /><span>{viewOnly ? "Змінювати роль, скидати пароль і видаляти адміністраторів може лише овнер." : `${deleteReason || resetReason}.`}</span></div>
      )}

      <>
        {mobile ? (
          <dl className="v3-uc-tiles">
            {!admin && <div><dt>AI сьогодні</dt><dd>{aiLimit ? `${user.aiToday || 0} з ${aiLimit}` : user.aiToday || "—"}</dd></div>}
            {!admin && <div><dt>Дата народження</dt><dd>{birthText(user)}<span className={`v3-tag ${user.ageConfirmed ? "v3-tag-okdark" : "v3-tag-warndark"}`}>{ageText(user)}</span></dd></div>}
            {!admin && <div><dt>Пробний період</dt><dd>{trialText(user, settings)}</dd></div>}
            <div><dt>Створено</dt><dd>{user.createdAt ? longDate(user.createdAt.slice(0, 10)) : "—"}</dd></div>
            {admin && <div><dt>План</dt><dd>{plan.plan} · {plan.price}</dd></div>}
          </dl>
        ) : (
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
        )}




      </>


      {mobile && (
        <Dialog open={more} onOpenChange={setMore}>
          <DialogContent className="v3-modal v3-more-sheet sm:max-w-[420px]">
            <DialogTitle className="v3-modal-title">Дії</DialogTitle>
            <DialogDescription className="v3-modal-sub">@{user.username}</DialogDescription>
            <div className="v3-lrows">
              <button type="button" className="v3-lrow" disabled={!online} onClick={() => { setMore(false); onEdit(); }}><Pencil size={17} aria-hidden="true" />Редагувати профіль<ChevronRight size={16} aria-hidden="true" /></button>
              <button type="button" className="v3-lrow" disabled={!!resetReason || !online} title={resetReason || off} onClick={() => { setMore(false); onResetPassword(); }}>{resetReason ? <Lock size={17} aria-hidden="true" /> : <KeyRound size={17} aria-hidden="true" />}Скинути пароль<ChevronRight size={16} aria-hidden="true" /></button>
              <Link className="v3-lrow" to={`/audit?q=${encodeURIComponent(user.username)}`} onClick={() => setMore(false)}><History size={17} aria-hidden="true" />Історія змін<ChevronRight size={16} aria-hidden="true" /></Link>
              <button type="button" className="v3-lrow is-danger" disabled={!!deleteReason || !online} title={deleteReason || off} onClick={() => { setMore(false); onDelete(); }}>{deleteReason ? <Lock size={17} aria-hidden="true" /> : <Trash2 size={17} aria-hidden="true" />}Видалити користувача<ChevronRight size={16} aria-hidden="true" /></button>
            </div>
            {(deleteReason || resetReason) && <p className="v3-hint">{deleteReason || resetReason}</p>}
          </DialogContent>
        </Dialog>
      )}
    </aside>
  );
}
