import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { isoToday } from "@/lib/usersModel";
import type { AdminUserOverview, AppSettings } from "@/types";

export type Plan = "trial" | "basic" | "pro";
export type Role = "user" | "admin" | "owner";
export interface UserForm {
  username: string; telegram: string; plan: Plan; startDate: string; endDate: string; role: Role;
  birthDate: string; ageConfirmed: boolean;
}

const addDays = (v: string, n: number) => { const d = new Date(`${v}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const planOf = (p?: string): Plan => (p === "basic" || p === "pro" ? p : "trial");

interface Props {
  mode: "create" | "edit";
  open: boolean;
  user?: AdminUserOverview | null;
  settings: AppSettings | null;
  /** Owner-only choices (appoint an owner) and locks for the role block. */
  canAppointOwner: boolean;
  roleLock?: string | null;
  busy: boolean;
  onOpenChange: (o: boolean) => void;
  onSave: (form: UserForm) => void;
}

/** 01 · «Новий користувач» (and the same form to edit an account). */
export default function UserFormDialog({ mode, open, user, settings, canAppointOwner, roleLock, busy, onOpenChange, onSave }: Props) {
  const trialDays = settings?.trialDays || 7;
  const subDays = settings?.subscriptionDays || 30;
  const basic = settings?.basicPrice || 300, pro = settings?.proPrice || 600;
  const [f, setF] = useState<UserForm>({ username: "", telegram: "", plan: "trial", startDate: "", endDate: "", role: "user", birthDate: "", ageConfirmed: false });
  const [touchedEnd, setTouchedEnd] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTouchedEnd(false);
    if (mode === "edit" && user) {
      setF({ username: user.username, telegram: user.telegram || "", plan: planOf(user.proUntil ? user.proBasePlan : user.plan), startDate: user.startDate || "", endDate: user.endDate || "", role: user.isOwner ? "owner" : user.role === "admin" ? "admin" : "user", birthDate: user.birthDate || "", ageConfirmed: !!user.ageConfirmed });
    } else {
      const t = isoToday();
      setF({ username: "", telegram: "", plan: "trial", startDate: t, endDate: addDays(t, trialDays - 1), role: "user", birthDate: "", ageConfirmed: false });
    }
  }, [open, mode, user, trialDays]);

  // New account: the end date follows the plan until the admin edits it by hand.
  const pickPlan = (plan: Plan) => setF((x) => ({ ...x, plan, endDate: mode === "create" && !touchedEnd && x.startDate ? addDays(x.startDate, (plan === "trial" ? trialDays : subDays) - 1) : x.endDate }));
  const isAdminRole = f.role !== "user";
  const valid = f.username.trim().length > 0 && /^[A-Za-z0-9_.-]{2,100}$/.test(f.username.trim()) && (isAdminRole || (f.startDate && f.endDate && f.endDate >= f.startDate));
  const dlg = (o: boolean) => { if (!busy) onOpenChange(o); };

  return (
    <Dialog open={open} onOpenChange={dlg}>
      <DialogContent className="v3-modal v3-modal-lg sm:max-w-[620px]">
        <DialogTitle className="v3-modal-title">{mode === "create" ? "Новий користувач" : `Редагувати @${user?.username}`}</DialogTitle>
        <DialogDescription className="v3-modal-sub">{mode === "create" ? "Створіть обліковий запис і налаштуйте доступ до MatchIQ." : "Логін, Telegram, план, дати, вік і роль."}</DialogDescription>
        <form className="v3-form" onSubmit={(e) => { e.preventDefault(); if (valid) onSave({ ...f, username: f.username.trim(), telegram: f.telegram.trim() }); }}>
          <fieldset disabled={busy} className="v3-form-sec">
            <legend>Основна інформація</legend>
            <div className="v3-form-grid">
              <div className="v3-field"><label htmlFor="uf-login">Логін <span className="v3-req">*</span></label><input id="uf-login" autoFocus={mode === "create"} required value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} placeholder="Логін без @" autoComplete="off" /><small className="v3-hint">Використовується для входу</small></div>
              <div className="v3-field"><label htmlFor="uf-tg">Telegram</label><input id="uf-tg" value={f.telegram} onChange={(e) => setF({ ...f, telegram: e.target.value })} placeholder="@username або t.me/username" /><small className="v3-hint">Контакт для зв’язку</small></div>
            </div>
          </fieldset>

          {!isAdminRole && (
            <fieldset disabled={busy} className="v3-form-sec">
              <legend>План</legend>
              <div className="v3-opts">
                {([["trial", "Пробний", `${trialDays} днів${settings?.trialPlan ? ` · ${settings.trialPlan === "pro" ? "Pro" : "Базова"}` : ""}`], ["basic", "Базова", `${basic} ₴ / ${subDays} днів`], ["pro", "Pro", `${pro} ₴ / ${subDays} днів`]] as const).map(([k, t, s]) => (
                  <button key={k} type="button" className={`v3-opt${f.plan === k ? " is-on" : ""}`} aria-pressed={f.plan === k} onClick={() => pickPlan(k)}><strong>{t}</strong><small>{s}</small></button>
                ))}
              </div>
              <div className="v3-form-grid">
                <div className="v3-field"><label htmlFor="uf-start">Дата початку</label><input id="uf-start" type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></div>
                <div className="v3-field"><label htmlFor="uf-end">Дата закінчення</label><input id="uf-end" type="date" min={f.startDate} value={f.endDate} onChange={(e) => { setTouchedEnd(true); setF({ ...f, endDate: e.target.value }); }} /></div>
              </div>
              {mode === "create" && <p className="v3-note-info">Пробний період — один на людину. Для Базової й Pro сума плану запишеться як перша оплата.</p>}
            </fieldset>
          )}

          {mode === "edit" && !isAdminRole && (
            <fieldset disabled={busy} className="v3-form-sec">
              <legend>Вік</legend>
              <div className="v3-form-grid">
                <div className="v3-field"><label htmlFor="uf-dob">Дата народження</label><input id="uf-dob" type="date" max={isoToday()} value={f.birthDate} onChange={(e) => setF({ ...f, birthDate: e.target.value })} /></div>
                <label className="v3-switch-row" htmlFor="uf-age">
                  <span><strong>Вік 21+ підтверджено</strong><small>Після перевірки документа</small></span>
                  <input id="uf-age" type="checkbox" role="switch" className="v3-switch" checked={f.ageConfirmed} onChange={(e) => setF({ ...f, ageConfirmed: e.target.checked })} />
                </label>
              </div>
            </fieldset>
          )}

          <fieldset disabled={busy || !!roleLock} className="v3-form-sec">
            <legend>Роль і доступ</legend>
            <div className="v3-opts">
              <button type="button" className={`v3-opt${f.role === "user" ? " is-on" : ""}`} aria-pressed={f.role === "user"} onClick={() => setF({ ...f, role: "user" })}><strong>Користувач</strong><small>Звичайний акаунт</small></button>
              <button type="button" className={`v3-opt${f.role === "admin" ? " is-on" : ""}`} aria-pressed={f.role === "admin"} onClick={() => setF({ ...f, role: "admin" })}><strong>Адміністратор</strong><small>Керування користувачами</small></button>
              <button type="button" className={`v3-opt${f.role === "owner" ? " is-on" : ""}`} aria-pressed={f.role === "owner"} disabled={!canAppointOwner} title={canAppointOwner ? undefined : "Призначати овнера може лише овнер"} onClick={() => setF({ ...f, role: "owner" })}><strong>Овнер</strong><small>{canAppointOwner ? "Повний доступ" : "лише овнер може призначити"}</small></button>
            </div>
            {roleLock && <p className="v3-lock-note"><Lock size={13} aria-hidden="true" />{roleLock}</p>}
          </fieldset>

          <div className="v3-modal-foot">
            <span className="v3-hint">{mode === "create" ? "Пароль згенерується автоматично" : "Зміни запишуться в журнал дій"}</span>
            <div className="v3-modal-actions">
              <button type="button" className="v3-btn v3-btn-ghost" onClick={() => dlg(false)} disabled={busy}>Скасувати</button>
              <button type="submit" className="v3-btn v3-btn-blue" disabled={busy || !valid}>{busy ? "Зберігаємо…" : mode === "create" ? "Створити" : "Зберегти"}</button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
