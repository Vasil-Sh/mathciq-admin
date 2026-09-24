import { CalendarDays, CheckCircle2, Copy, KeyRound, Loader2, Plus, Save, ShieldCheck, UserRound, Wallet } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate, parseDate } from "@/lib/adminUtils";
import { toast } from "sonner";
import type { UserData } from "@/types";

type EditorValue = Pick<UserData, "username" | "telegram" | "priceMonth" | "startDate" | "endDate" | "isAdmin">;
interface Props {
  mode: "add" | "edit";
  open: boolean;
  onClose: () => void;
  value: EditorValue;
  onChange: (updates: Partial<EditorValue>) => void;
  onSave: () => void;
  busy: boolean;
  password: string;
  onResetPassword?: () => void;
}

function dateInput(value: string) {
  const date = parseDate(value);
  return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` : "";
}

export default function UserEditorDialog(p: Props) {
  const adding = p.mode === "add";
  const prefix = `user-${p.mode}`;
  const setDate = (field: "startDate" | "endDate", value: string) => {
    const date = parseDate(value);
    p.onChange({ [field]: date ? formatDate(date) : "" });
  };
  const copyPassword = async () => {
    try { await navigator.clipboard.writeText(p.password); toast.success("Пароль скопійовано"); }
    catch { toast.error("Не вдалося скопіювати. Виділіть пароль і скопіюйте вручну."); }
  };
  return <Dialog open={p.open} onOpenChange={open => { if (!open && !p.busy) p.onClose(); }}>
    <DialogContent className="user-editor-dialog" onInteractOutside={e => { if (p.password || p.busy) e.preventDefault(); }} onEscapeKeyDown={e => { if (p.busy) e.preventDefault(); }}>
      <header className="editor-heading"><span className={`editor-heading-icon ${p.password ? "is-success" : ""}`}>{p.password ? <CheckCircle2 size={23} /> : adding ? <UserRound size={23} /> : <UserRound size={23} />}</span><div><span className="editor-eyebrow">ОБЛІКОВИЙ ЗАПИС</span><DialogTitle>{p.password ? adding ? "Користувача створено" : "Пароль оновлено" : adding ? "Додати користувача" : "Редагувати користувача"}</DialogTitle><DialogDescription>{p.password ? `Дані для входу користувача ${p.value.username}` : adding ? "Створіть профіль і налаштуйте доступ до платформи." : `Оновіть профіль та підписку ${p.value.username}.`}</DialogDescription></div></header>
      {p.password ? <>
        <div className="editor-password-result"><span className="editor-section-label">ПАРОЛЬ ДЛЯ ВХОДУ</span><div><code>{p.password}</code><button type="button" onClick={copyPassword} aria-label="Скопіювати пароль"><Copy size={18} /></button></div><p>Збережіть пароль перед закриттям вікна. Переглянути його повторно буде неможливо.</p></div>
        <footer className="editor-footer"><span><ShieldCheck size={14} />Доступ налаштовано</span><Button onClick={p.onClose}>Готово</Button></footer>
      </> : <form onSubmit={event => { event.preventDefault(); p.onSave(); }}>
        <fieldset disabled={p.busy} className="editor-body">
          <section className="editor-section"><div className="editor-section-title"><UserRound size={15} /><h3>Основна інформація</h3></div><div className="editor-grid">
            <div className="editor-field"><label htmlFor={`${prefix}-username`}>Логін <span>*</span></label><Input id={`${prefix}-username`} value={p.value.username} onChange={e => p.onChange({ username: e.target.value })} placeholder="Наприклад, match_user" required autoComplete="off" /><small>Використовується для входу в MatchIQ</small></div>
            <div className="editor-field"><label htmlFor={`${prefix}-telegram`}>Telegram {adding && <span>*</span>}</label><Input id={`${prefix}-telegram`} value={p.value.telegram} onChange={e => p.onChange({ telegram: e.target.value })} placeholder="@username" required={adding} autoComplete="off" /><small>Контакт для зв’язку з користувачем</small></div>
          </div></section>
          <section className="editor-section"><div className="editor-section-title"><Wallet size={15} /><h3>Підписка</h3></div><div className="editor-grid">
            <div className="editor-field editor-price-field"><label htmlFor={`${prefix}-price`}>Вартість на місяць</label><div className="editor-price-input"><Input id={`${prefix}-price`} inputMode="decimal" value={p.value.priceMonth} onChange={e => p.onChange({ priceMonth: e.target.value })} placeholder="0" /><span>грн / міс.</span></div></div>
            <div className="editor-subscription-note"><CalendarDays size={17} /><p>Термін підписки визначає активність облікового запису.</p></div>
            <div className="editor-field"><label htmlFor={`${prefix}-start`}>{adding ? "Дата створення" : "Дата початку"}</label><Input id={`${prefix}-start`} type="date" value={dateInput(p.value.startDate)} onChange={e => setDate("startDate", e.target.value)} disabled={adding} />{adding && <small>Встановлюється автоматично</small>}</div>
            <div className="editor-field"><label htmlFor={`${prefix}-end`}>Дата закінчення</label><Input id={`${prefix}-end`} type="date" value={dateInput(p.value.endDate)} onChange={e => setDate("endDate", e.target.value)} /></div>
          </div></section>
          <section className="editor-section editor-access"><div><div className="editor-section-title"><ShieldCheck size={15} /><h3>Роль і доступ</h3></div><p>{p.value.isAdmin ? "Керування користувачами та доступ до аналітики." : "Звичайний обліковий запис платформи."}</p></div><Select value={p.value.isAdmin ? "admin" : "user"} onValueChange={value => p.onChange({ isAdmin: value === "admin" })} disabled={p.busy}><SelectTrigger aria-label="Роль користувача"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="user">Користувач</SelectItem><SelectItem value="admin">Адміністратор</SelectItem></SelectContent></Select></section>
          {!adding && p.onResetPassword && <section className="editor-security"><span><KeyRound size={16} /><span><strong>Пароль облікового запису</strong><small>Скидання замінить поточний пароль новим.</small></span></span><Button type="button" variant="outline" size="sm" onClick={p.onResetPassword} disabled={p.busy}>Скинути пароль</Button></section>}
          {adding && <div className="editor-info"><KeyRound size={16} /><p>Пароль згенерується автоматично й з’явиться після створення користувача.</p></div>}
        </fieldset>
        <footer className="editor-footer"><span>* Обов’язкові поля</span><div><Button type="button" variant="outline" onClick={p.onClose} disabled={p.busy}>Скасувати</Button><Button type="submit" disabled={p.busy}>{p.busy ? <Loader2 size={15} className="animate-spin" /> : adding ? <Plus size={15} /> : <Save size={15} />}{p.busy ? "Збереження…" : adding ? "Створити користувача" : "Зберегти зміни"}</Button></div></footer>
      </form>}
    </DialogContent>
  </Dialog>;
}
