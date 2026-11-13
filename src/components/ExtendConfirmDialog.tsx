import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { extendedEndDate, shortDate, type ExpiringUser } from "@/lib/subscriptions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: ExpiringUser[];
  days: number;
  busy?: boolean;
  onConfirm: (ids: number[]) => void;
}

/**
 * «Продовжити всім» — always asks first: a checklist of people and a required
 * acknowledgement that the payment was received or the extension agreed.
 */
export default function ExtendConfirmDialog({ open, onOpenChange, items, days, busy, onConfirm }: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(new Set(items.map((i) => i.user.id)));
      setAgreed(false);
    }
  }, [open, items]);

  const toggle = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const count = selected.size;
  const word = count === 1 ? "підписку" : count >= 2 && count <= 4 ? "підписки" : "підписок";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="v3-modal sm:max-w-[560px]">
        <DialogTitle className="v3-modal-title">Продовжити {count} {word} на {days} днів?</DialogTitle>
        <DialogDescription className="v3-modal-sub">Підписки, що закінчуються за 7 днів. Зніміть галочку, щоб когось пропустити.</DialogDescription>

        <ul className="v3-check-list">
          {items.map(({ user }) => {
            const on = selected.has(user.id);
            return (
              <li key={user.id}>
                <label className="v3-check-row">
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(user.id)} />
                  <span className={`v3-ck${on ? " is-on" : ""}`} aria-hidden="true">{on && <Check size={12} strokeWidth={3.2} />}</span>
                  <span className="v3-av" aria-hidden="true">{user.username.slice(0, 2).toUpperCase()}</span>
                  <span className="v3-check-who"><strong>@{user.username}</strong><small>{Number(user.priceMonth) ? `${user.priceMonth} ₴` : "Без оплати"} · до {shortDate(user.endDate)}</small></span>
                  <span className="v3-check-to">→ <strong>{shortDate(extendedEndDate(user.endDate, days))}</strong></span>
                </label>
              </li>
            );
          })}
        </ul>

        <p className="v3-note-warn">Продовження не записує оплату — лише зсуває дату закінчення. Якщо гроші вже прийшли, краще «Додати оплату» в картці користувача: так буде чек і запис в Оплатах.</p>

        <label className={`v3-agree${agreed ? " is-on" : ""}`}>
          <input type="checkbox" className="sr-only" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span className={`v3-ck${agreed ? " is-on" : ""}`} aria-hidden="true">{agreed && <Check size={12} strokeWidth={3.2} />}</span>
          <span><strong>Оплату отримано або продовження погоджено</strong><small>Без цієї позначки кнопка неактивна</small></span>
        </label>

        <div className="v3-modal-foot">
          <span className="v3-hint">Запишеться в журнал дій · скасувати можна 10 с</span>
          <div className="v3-modal-actions">
            <button type="button" className="v3-btn v3-btn-ghost" onClick={() => onOpenChange(false)}>Скасувати</button>
            <button type="button" className="v3-btn v3-btn-blue" disabled={!agreed || count === 0 || busy} onClick={() => onConfirm([...selected])}>
              {busy ? "Продовжуємо…" : `Продовжити ${count}`}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
