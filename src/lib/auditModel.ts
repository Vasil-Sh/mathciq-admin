/** Turning raw audit log entries into human sentences for «Журнал дій». */
export type Entry = {
  id: string; actor_name: string; actor_telegram?: string | null; action: string; target: string;
  target_username?: string | null; details: Record<string, unknown>; status: string; created_at: string; category?: string;
};
export type Kind = "pay" | "user" | "ext" | "key" | "banner" | "set" | "sec" | "ad";
export type Change = { k: string; from: string; to: string };
export type View = { kind: Kind; verb: string; target: string; chips: Change[]; diff: Change[]; meta: string; userId?: string; username?: string; security?: boolean; groupKey?: string };

const F: Record<string, string> = {
  note: "Нотатка", paymentId: "Оплата №", amount: "Сума", currency: "Валюта", paidOn: "Дата оплати", periodStart: "Період з", periodEnd: "Період до",
  extendSubscription: "Продовження доступу", cancelReason: "Причина", reason: "Причина", refundedAmount: "Повернено", username: "Логін", telegram: "Telegram",
  description: "Опис", href: "Посилання", endDate: "Підписка до", startDate: "Підписка з", priceMonth: "Тариф", role: "Роль", title: "Назва", active: "Увімкнено",
  screen: "Екран", slot: "Слот", startsOn: "Показ з", endsOn: "Показ до", placeholderEnabled: "Плейсхолдер", imageUrl: "Зображення", plan: "План",
  birthDate: "Дата народження", ageConfirmed: "Вік 21+", password: "Пароль", days: "Днів", removed: "Видалено", revoked: "Сесій завершено",
  device: "Пристрій", ip: "IP", name: "Назва", licenseNumber: "Ліцензія", licenseUntil: "Ліцензія до", link: "Посилання", buttonText: "Текст кнопки",
  clickPrice: "Ціна за клік", showOddsInList: "Список матчів", showMatchDetails: "Деталі матчу", handle: "Група", placement: "Місце", game: "Гра",
  reviewStatus: "Перевірка", rejectReason: "Причина відхилення", subscribers: "Підписників", priceNote: "Умови",
  defaultMonthlyPrice: "Ціна за місяць", subscriptionDays: "Тривалість підписки", basicPrice: "Ціна Базова", proPrice: "Ціна Pro", trialEnabled: "Пробний період",
  trialDays: "Днів пробного", trialPlan: "План пробного", aiDailyLimit: "AI на день", aiUsdUah: "Курс USD/UAH", churnInactiveDays: "Неактивні, днів",
  churnLossStreak: "Програшів поспіль", adsOddsInList: "Коефіцієнти в списку", adsMatchDetails: "Деталі матчу (реклама)", bannerSpecText: "Вимоги до банера",
  disclaimerText: "Дисклеймер", warningThreshold: "Поріг попередження", mode: "Режим", proUntil: "Pro до", sentAt: "Надіслано",
};
const SCREENS: Record<string, string> = { matches: "Матчі", journal: "Журнал ставок", analytics: "Аналітика", strategies: "Стратегії", "risky-teams": "Ризиковані команди" };

export function fmt(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "так" : "ні";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  if (key === "screen") return SCREENS[s] || s;
  if (key === "role") return s === "admin" ? "Адміністратор" : "Користувач";
  if (key === "plan" || key === "trialPlan") return s === "pro" ? "Pro" : s === "basic" ? "Базова" : s === "trial" ? "Пробний" : s;
  if (key === "amount" || key === "priceMonth" || key === "refundedAmount" || /Price$/.test(key)) return /^-?\d+(\.\d+)?$/.test(s) ? `${Number(s).toLocaleString("uk-UA")} ₴` : s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.split("-").reverse().join(".");
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return new Date(s).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return s.length > 80 ? s.slice(0, 80) + "…" : s;
}
const short = (key: string, v: unknown) => { const s = fmt(key, v); return /^\d{2}\.\d{2}\.\d{4}$/.test(s) ? s.slice(0, 5) : s; };

function changes(e: Entry): Change[] {
  const d = e.details || {};
  const ch = d._changes as Record<string, { before: unknown; after: unknown }> | undefined;
  if (ch && typeof ch === "object") return Object.entries(ch).map(([k, v]) => ({ k: F[k] || k, from: fmt(k, v?.before), to: fmt(k, v?.after) }));
  const before = d.before as Record<string, unknown> | undefined, after = d.after as Record<string, unknown> | undefined;
  if (before || after) {
    const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
    return [...keys].filter((k) => !["id", "createdAt", "updatedAt", "basicFeatures", "proFeatures", "receiptFields"].includes(k) && JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]))
      .map((k) => ({ k: F[k] || k, from: fmt(k, before?.[k]), to: fmt(k, after?.[k]) }));
  }
  return Object.entries(d).filter(([k]) => !k.startsWith("_") && !["targetUsername", "before", "after", "fields"].includes(k)).map(([k, v]) => ({ k: F[k] || k, from: "—", to: fmt(k, v) }));
}
const chipsOf = (all: Change[]) => all.filter((c) => c.k !== "Оплата №").map((c) => ({ ...c, from: c.from.replace(/^(\d{2}\.\d{2})\.\d{4}$/, "$1"), to: c.to.replace(/^(\d{2}\.\d{2})\.\d{4}$/, "$1") })).slice(0, 3);

export function describe(e: Entry): View {
  const d = e.details || {}, t = e.target, all = changes(e);
  const user = e.target_username || (typeof d.targetUsername === "string" ? d.targetUsername : "") || (typeof d.username === "string" ? d.username : "");
  const at = user ? `@${user.replace(/^@/, "")}` : "";
  const uid = t.match(/^\/(?:auth|admin)\/users\/(\d+)/)?.[1] || (typeof d._targetUserId === "string" ? d._targetUserId : undefined);
  const base = { chips: chipsOf(all), diff: all, meta: "", userId: uid, username: user || undefined };
  const keys = Object.keys((d._changes as object) || {});

  if (t === "/auth/login") {
    if (e.action === "LOGIN_NEW_DEVICE") return { ...base, kind: "sec", verb: "увійшов з нового пристрою", target: String(d.device || ""), chips: [], meta: "Якщо це були не ви — завершіть інші сесії в меню акаунта.", security: true };
    return { ...base, kind: "sec", verb: "— вхід тимчасово заблоковано після невдалих спроб", target: "", chips: [], meta: "Забагато неправильних паролів поспіль.", security: true };
  }
  if (t === "/auth/logout-all") { const n = Number(d.revoked) || 0; return { ...base, kind: "sec", verb: "завершив сесії", target: n ? `на ${n} ${n === 1 ? "пристрої" : "пристроях"}` : "на інших пристроях", chips: [], meta: "Вихід на всіх інших пристроях" }; }
  if (t === "/auth/change-password") return { ...base, kind: "sec", verb: "змінив власний пароль", target: "", chips: [], diff: [{ k: "Пароль", from: "••••", to: "оновлено" }], meta: "Паролі в журнал не записуються" };
  if (t === "/auth/register") return { ...base, kind: "user", verb: "створив користувача", target: at || "новий акаунт", meta: "Новий обліковий запис" };
  if (t.endsWith("/reset-password")) return { ...base, kind: "key", verb: "скинув пароль", target: at, chips: [], diff: [{ k: "Пароль", from: "••••", to: "новий (не зберігається)" }], meta: "Старий пароль перестав працювати" };
  if (/^\/auth\/users\/\d+$/.test(t)) {
    if (e.action === "DELETE") return { ...base, kind: "user", verb: "видалив користувача", target: at || "акаунт", chips: [], meta: "Ставки й оплати лишилися в журналі" };
    if (keys.length && keys.every((k) => k === "endDate" || k === "startDate")) return { ...base, kind: "ext", verb: "продовжив підписку", target: at, meta: "Зміна терміну підписки", groupKey: `ext|${e.actor_name}|${e.status}` };
    if (keys.some((k) => k === "priceMonth" || k === "plan")) return { ...base, kind: "user", verb: "змінив тариф", target: at, meta: "Зміна тарифу користувача" };
    return { ...base, kind: "user", verb: "оновив користувача", target: at, meta: "Зміни профілю" };
  }
  if (/^\/admin\/users\/\d+\/payments$/.test(t)) return { ...base, kind: "pay", verb: "додав оплату", target: `${d.paymentId ? `№${d.paymentId}` : "оплату"}${at ? ` · ${at}` : ""}`, meta: d.extendSubscription ? "Оплата із продовженням доступу" : "Оплата без продовження доступу" };
  const payId = t.match(/^\/admin\/payments\/(\d+)\/(cancel|refund|receipt\/send)$/);
  if (payId) {
    const what = payId[2] === "cancel" ? "скасував оплату" : payId[2] === "refund" ? "повернув гроші за оплату" : "надіслав чек за оплату";
    return { ...base, kind: "pay", verb: what, target: `№${payId[1]}${at ? ` · ${at}` : ""}`, meta: payId[2] === "receipt/send" ? "Чек надіслано в Telegram" : "Сума не входить у звіт" };
  }
  if (t.endsWith("/note")) return { ...base, kind: "user", verb: "оновив нотатку", target: at, chips: [], diff: [{ k: "Нотатка", from: "—", to: "оновлено" }], meta: "Внутрішня нотатка (бачать лише адміністратори)" };
  if (t.endsWith("/grant-pro")) return { ...base, kind: "ext", verb: "видав Pro", target: at, meta: "Без оплати, потім план повертається" };
  if (t.endsWith("/subscription/cancel")) return { ...base, kind: "user", verb: "скасував підписку", target: at, meta: d.mode === "now" ? "Доступ закрито одразу" : "Доступ до кінця оплаченого періоду" };
  if (t.startsWith("/banners/slots/")) return { ...base, kind: "banner", verb: "змінив плейсхолдер", target: `слот ${t.split("/").pop()}`, meta: "«Тут може бути ваша реклама»" };
  if (t.startsWith("/banners")) {
    const ttl = typeof d.title === "string" ? d.title : (d._changes as Record<string, { before: unknown; after: unknown }>)?.title?.after;
    const name = ttl ? `«${ttl}»` : t.match(/\d+/) ? `банер №${t.match(/\d+/)![0]}` : "банер";
    return { ...base, kind: "banner", verb: e.action === "POST" ? "створив банер" : e.action === "DELETE" ? "видалив банер" : "оновив банер", target: name, meta: d.screen ? `${SCREENS[String(d.screen)] || d.screen} · слот ${d.slot ?? "?"}` : "Банер" };
  }
  if (t.startsWith("/admin/bookmakers")) {
    const nm = ((d.after || d.before) as Record<string, unknown> | undefined)?.name;
    return { ...base, kind: "ad", verb: e.action === "POST" ? "додав партнера" : e.action === "DELETE" ? "видалив партнера" : "оновив партнера", target: nm ? String(nm) : "букмекер", meta: "Реклама · букмекери" };
  }
  if (t.startsWith("/admin/telegram-promos")) {
    const nm = ((d.after || d.before) as Record<string, unknown> | undefined)?.name;
    return { ...base, kind: "ad", verb: e.action === "POST" ? "додав Telegram-групу" : e.action === "DELETE" ? "видалив Telegram-групу" : "оновив Telegram-групу", target: nm ? String(nm) : "група", meta: "Реклама · Telegram-групи" };
  }
  if (t.startsWith("/admin/telegram-groups")) return { ...base, kind: "ad", verb: t.endsWith("/approve") ? "схвалив групу" : "відхилив групу", target: String(d.name || d.groupName || "групу"), meta: "Модерація Telegram-груп" };
  if (t === "/admin/settings") return { ...base, kind: "set", verb: "змінив налаштування", target: "застосунку", meta: "Налаштування застосунку" };
  if (t === "/admin/audit/cleanup") return { ...base, kind: "set", verb: "очистив старі записи", target: "журналу", chips: [{ k: "Старші ніж", from: "—", to: `${d.days} днів` }, { k: "Видалено", from: "—", to: String(d.removed ?? 0) }], meta: "Записи видалено назавжди" };
  return { ...base, kind: "user", verb: e.action === "POST" ? "створив" : e.action === "DELETE" ? "видалив" : "змінив", target: t, meta: t };
}

export const KIND_UI: Record<Kind, { bg: string; fg: string; d: string }> = {
  pay: { bg: "#e3f6ea", fg: "#1f6b3a", d: "M2 7h20v12H2zM2 11h20" },
  user: { bg: "#e8efff", fg: "#2450c4", d: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6" },
  ext: { bg: "#e8efff", fg: "#2450c4", d: "M12 5v14M5 12h14" },
  key: { bg: "#fff1d6", fg: "#7a4f00", d: "M15 7a4 4 0 1 1-4 4l-7 7v-3h3v-3h3" },
  banner: { bg: "#f1eaff", fg: "#5b34b8", d: "M3 11l15-6v14L3 13z" },
  ad: { bg: "#f1eaff", fg: "#5b34b8", d: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
  set: { bg: "#f1f3f6", fg: "#3e4656", d: "M4 6h16M4 12h10M4 18h6" },
  sec: { bg: "#fff1d6", fg: "#7a4f00", d: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" },
};
export const RESULT_UI: Record<string, { label: string; cls: string }> = {
  success: { label: "Виконано", cls: "is-ok" }, failed: { label: "Помилка", cls: "is-err" }, pending: { label: "Не підтверджено", cls: "is-warn" },
};

const MONTHS = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
const kyivDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
export function dayLabel(iso: string) {
  const d = new Date(iso), k = kyivDay(d), today = kyivDay(new Date()), y = kyivDay(new Date(Date.now() - 864e5));
  const [, m, dd] = k.split("-").map(Number);
  const date = `${dd} ${MONTHS[m - 1]}`;
  if (k === today) return `Сьогодні · ${date}`;
  if (k === y) return `Вчора · ${date}`;
  const wd = new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv", weekday: "long" }).format(d);
  return `${wd[0].toUpperCase()}${wd.slice(1)} · ${date}${k.slice(0, 4) !== today.slice(0, 4) ? ` ${k.slice(0, 4)}` : ""}`;
}
export const dayKey = (iso: string) => kyivDay(new Date(iso));
export function timeLabel(iso: string) {
  const d = new Date(iso), diff = (Date.now() - d.getTime()) / 1000;
  const hm = d.toLocaleTimeString("uk-UA", { timeZone: "Europe/Kyiv", hour: "2-digit", minute: "2-digit" });
  if (kyivDay(d) === kyivDay(new Date())) {
    if (diff < 60) return "щойно";
    if (diff < 3600) return `${Math.floor(diff / 60)} хв тому`;
    if (diff < 4 * 3600) return `${Math.floor(diff / 3600)} год тому`;
    return hm;
  }
  if (kyivDay(d) === kyivDay(new Date(Date.now() - 864e5))) return `вчора о ${hm}`;
  return hm;
}
export const exactTime = (iso: string) => new Date(iso).toLocaleString("uk-UA", { timeZone: "Europe/Kyiv", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
