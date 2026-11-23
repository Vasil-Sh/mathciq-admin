import type { ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/**
 * Підтвердження небезпечної дії — той самий вигляд, що «Видалити користувача»:
 * червона іконка, заголовок-питання, пояснення, «Скасувати» і червона кнопка дії.
 */
export function ConfirmDialog({ open, title, text, confirm, busyText, busy = false, icon, onOpenChange, onConfirm }: {
  open: boolean; title: string; text: ReactNode; confirm: string; busyText?: string; busy?: boolean; icon?: ReactNode;
  onOpenChange: (o: boolean) => void; onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="v3-modal sm:max-w-[480px]" role="alertdialog">
        <div className="v3-modal-iconrow">
          <span className="v3-modal-ico is-red" aria-hidden="true">{icon || <Trash2 size={22} />}</span>
          <div>
            <DialogTitle className="v3-modal-title">{title}</DialogTitle>
            <DialogDescription className="v3-modal-sub">{text}</DialogDescription>
          </div>
        </div>
        <div className="v3-modal-foot"><span /><div className="v3-modal-actions">
          <button type="button" className="v3-btn v3-btn-ghost" onClick={() => onOpenChange(false)} disabled={busy}>Скасувати</button>
          <button type="button" className="v3-btn v3-btn-red" onClick={onConfirm} disabled={busy}>{busy ? busyText || "Зачекайте…" : confirm}</button>
        </div></div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Phone-style confirmation (design «Зупинити HLTV?», «Видалити матч?», «Об’єднати з офіційним?»):
 * a round icon on top, the question, the explanation, optional extra (a note or what will change),
 * the action as a full-width button and «Скасувати» under it.
 */
export function ConfirmSheet({ open, tone = "red", icon, title, text, children, confirm, confirmIcon, busy = false, busyText, onOpenChange, onConfirm }: {
  open: boolean; tone?: "red" | "dark" | "green" | "blue"; icon: ReactNode; title: string; text: ReactNode; children?: ReactNode;
  confirm: string; confirmIcon?: ReactNode; busy?: boolean; busyText?: string;
  onOpenChange: (o: boolean) => void; onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="v3-modal v3-csheet sm:max-w-[420px]" role="alertdialog">
        <span className={`v3-csheet-ico is-${tone === "dark" ? "red" : tone}`} aria-hidden="true">{icon}</span>
        <DialogTitle className="v3-csheet-t">{title}</DialogTitle>
        <DialogDescription className="v3-csheet-s">{text}</DialogDescription>
        {children}
        <div className="v3-csheet-acts">
          <button type="button" className={`v3-csheet-go is-${tone}`} onClick={onConfirm} disabled={busy}>{busy ? busyText || "Зачекайте…" : <>{confirmIcon}{confirm}</>}</button>
          <button type="button" className="v3-csheet-no" onClick={() => onOpenChange(false)} disabled={busy}>Скасувати</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
