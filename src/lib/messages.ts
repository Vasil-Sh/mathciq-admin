import { toast } from "sonner";
import type { AppSettings } from "@/types";
import { fillTemplate } from "@/lib/settingsModel";

/** Which template from «Налаштування → Шаблони повідомлень» a «Написати» button uses. */
export type MessageKind = "tplExpiring" | "tplInactive" | "tplPaid" | "tplLapsed";

interface Who { username: string; endDate?: string; plan?: string; priceMonth?: number | string }

const uaDay = (d?: string) => (d ? d.slice(0, 10).split("-").reverse().join(".") : "");

/** The filled message for this user, or undefined when the template is not loaded yet. */
export function composeMessage(kind: MessageKind, settings: AppSettings | null | undefined, u: Who, idleDays?: number | null): string | undefined {
  const text = settings?.[kind];
  if (!text) return undefined;
  const pro = u.plan === "pro";
  const price = Number(u.priceMonth) > 0 ? Number(u.priceMonth) : (pro ? settings?.proPrice : settings?.basicPrice) || 0;
  return fillTemplate(text, { login: u.username, endDate: uaDay(u.endDate), plan: pro ? "Pro" : "Базову", amount: price ? `${price.toLocaleString("uk-UA")} ₴` : "", idleDays: idleDays ?? 0 });
}

/**
 * Telegram cannot open a chat with a person and fill in the text, so «Написати» copies the
 * message first; the admin pastes it in the chat that opens.
 */
export function copyMessage(text: string | undefined) {
  if (!text || !navigator.clipboard) return;
  navigator.clipboard.writeText(text)
    .then(() => toast.success("Текст повідомлення скопійовано", { description: "Вставте його в чаті Telegram, що відкрився" }))
    .catch(() => { /* clipboard blocked — the chat still opens */ });
}
