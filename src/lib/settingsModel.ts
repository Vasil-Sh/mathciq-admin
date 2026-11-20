import type { AppSettings } from "@/types";
/** Pure helpers (no API imports) so they can be unit-tested. */
function plural(n: number, one: string, few: string, many: string) {
  const m = n % 10, h = n % 100;
  return m === 1 && h !== 11 ? one : m >= 2 && m <= 4 && (h < 12 || h > 14) ? few : many;
}

/** Fields the screen edits through the «незбережені зміни» bar (texts and account save on their own). */
export const DRAFT_KEYS = [
  "basicPrice", "proPrice", "trialEnabled", "trialDays", "trialPlan", "trialStepDays",
  "aiDailyLimit", "aiStopWords", "aiWordingRule", "expiringDays", "churnInactiveDays", "churnLossStreak",
  "receiptSupport", "receiptThanks", "receiptPrefix", "tplExpiring", "tplInactive", "tplPaid", "tplLapsed", "bannerSpecText",
] as const satisfies readonly (keyof AppSettings)[];
export type DraftKey = (typeof DRAFT_KEYS)[number];
export type Draft = Pick<Required<AppSettings>, DraftKey>;

export const DEFAULT_DRAFT: Draft = {
  basicPrice: 300, proPrice: 600, trialEnabled: false, trialDays: 7, trialPlan: "pro", trialStepDays: 30,
  aiDailyLimit: 5, aiStopWords: [], aiWordingRule: "", expiringDays: 7, churnInactiveDays: 14, churnLossStreak: 5,
  receiptSupport: "@cs2beet", receiptThanks: "Дякуємо, що обираєш MatchIQ!", receiptPrefix: "MIQ",
  tplExpiring: "", tplInactive: "", tplPaid: "", tplLapsed: "", bannerSpecText: "",
};

export function toDraft(s: AppSettings): Draft {
  const d = { ...DEFAULT_DRAFT };
  for (const k of DRAFT_KEYS) { const v = s[k]; if (v !== undefined && v !== null) (d as Record<string, unknown>)[k] = v; }
  return d;
}

const same = (a: unknown, b: unknown) => (Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((x, i) => x === b[i]) : a === b);

export function changedKeys(saved: Draft, cur: Draft): DraftKey[] {
  return DRAFT_KEYS.filter((k) => !same(saved[k], cur[k]));
}

const days = (n: number) => `${n} ${plural(n, "день", "дні", "днів")}`;
const planName = (p: string) => (p === "pro" ? "Pro" : "Базова");

/** One short line per change, e.g. «пробний період 5 → 7 днів». */
export function describeChange(k: DraftKey, a: Draft, b: Draft): string {
  switch (k) {
    case "basicPrice": return `Базова ${a.basicPrice} → ${b.basicPrice} ₴`;
    case "proPrice": return `Pro ${a.proPrice} → ${b.proPrice} ₴`;
    case "trialEnabled": return b.trialEnabled ? "пробний період увімкнено" : "пробний період вимкнено";
    case "trialDays": return `пробний період ${a.trialDays} → ${days(b.trialDays)}`;
    case "trialPlan": return `план пробного ${planName(a.trialPlan)} → ${planName(b.trialPlan)}`;
    case "trialStepDays": return `крок «+N днів» ${a.trialStepDays} → ${b.trialStepDays}`;
    case "aiDailyLimit": return `ліміт AI ${a.aiDailyLimit} → ${b.aiDailyLimit} на день`;
    case "aiStopWords": return "заборонені слова";
    case "aiWordingRule": return "правило формулювань";
    case "expiringDays": return `«закінчується за» ${a.expiringDays} → ${days(b.expiringDays)}`;
    case "churnInactiveDays": return `неактивний після ${a.churnInactiveDays} → ${days(b.churnInactiveDays)}`;
    case "churnLossStreak": return `серія програшів ${a.churnLossStreak} → ${b.churnLossStreak}`;
    case "receiptSupport": return `Telegram у чеку ${a.receiptSupport} → ${b.receiptSupport}`;
    case "receiptThanks": return "фраза подяки в чеку";
    case "receiptPrefix": return `префікс чека ${a.receiptPrefix} → ${b.receiptPrefix}`;
    case "tplExpiring": return "шаблон «Закінчується підписка»";
    case "tplInactive": return "шаблон «Давно немає ставок»";
    case "tplPaid": return "шаблон «Оплату отримано»";
    case "tplLapsed": return "шаблон «Не продовжив»";
    case "bannerSpecText": return "вимоги до банера";
  }
}

// ───────── message templates ─────────
export const TEMPLATE_VARS = ["{логін}", "{дата_закінчення}", "{тариф}", "{сума}", "{днів_без_ставок}"] as const;
export const TEMPLATES = [
  { key: "tplExpiring", title: "Закінчується підписка", where: "Дашборд · Потребує уваги" },
  { key: "tplInactive", title: "Давно немає ставок", where: "Ризик відтоку" },
  { key: "tplPaid", title: "Оплату отримано", where: "Разом із чеком" },
  { key: "tplLapsed", title: "Не продовжив", where: "Утримання" },
] as const satisfies readonly { key: DraftKey; title: string; where: string }[];

export interface TemplateValues { login: string; endDate: string; plan: string; amount: string; idleDays: number }

/** Text split into plain parts and {variables}; `bad` marks a variable we do not know. */
export function templateParts(text: string): { t: string; v?: true; bad?: true }[] {
  const out: { t: string; v?: true; bad?: true }[] = [];
  let i = 0;
  for (const m of text.matchAll(/\{[^{}\s]*\}/g)) {
    if (m.index! > i) out.push({ t: text.slice(i, m.index) });
    out.push((TEMPLATE_VARS as readonly string[]).includes(m[0]) ? { t: m[0], v: true } : { t: m[0], v: true, bad: true });
    i = m.index! + m[0].length;
  }
  if (i < text.length) out.push({ t: text.slice(i) });
  return out;
}

export function unknownVar(text: string): string | null {
  return templateParts(text).find((p) => p.bad)?.t ?? null;
}

/** The known variable closest to an unknown one ({дата} → {дата_закінчення}). */
export function closestVar(bad: string): string {
  const core = bad.replace(/[{}]/g, "").toLowerCase();
  return TEMPLATE_VARS.find((v) => v.includes(core) || core.includes(v.replace(/[{}]/g, "").split("_")[0])) || TEMPLATE_VARS[0];
}

export function fillTemplate(text: string, v: TemplateValues): string {
  const map: Record<string, string> = { "{логін}": v.login, "{дата_закінчення}": v.endDate, "{тариф}": v.plan, "{сума}": v.amount, "{днів_без_ставок}": String(v.idleDays) };
  return text.replace(/\{[^{}\s]*\}/g, (m) => map[m] ?? m);
}

// ───────── account ─────────
/** «Chrome · Windows» from a user-agent string. */
export function deviceName(ua: string): { name: string; phone: boolean } {
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Telegram/i.test(ua) ? "Telegram" : "";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  const name = [browser, os].filter(Boolean).join(" · ") || "Невідомий пристрій";
  return { name, phone: /iPhone|Android|Mobile/.test(ua) };
}

export function agoText(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const m = Math.max(0, Math.round((now - t) / 60000));
  if (m < 5) return "зараз";
  if (m < 60) return `${m} хв тому`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} год тому`;
  const d = Math.round(h / 24);
  return `${d} ${plural(d, "день", "дні", "днів")} тому`;
}

/** 0–4 bars and a label; 10+ characters with mixed kinds is «Надійний». */
export function passwordStrength(p: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!p) return { score: 0, label: "" };
  const kinds = [/[a-zа-яіїєґ]/, /[A-ZА-ЯІЇЄҐ]/, /\d/, /[^\p{L}\d]/u].filter((r) => r.test(p)).length;
  const common = /^(qwerty|password|111111|123456|12345678|admin|matchiq)/i.test(p);
  if (p.length < 6 || common) return { score: 1, label: "Слабкий" };
  if (p.length < 10) return { score: kinds >= 3 ? 2 : 1, label: kinds >= 3 ? "Середній" : "Слабкий" };
  if (kinds >= 3) return { score: p.length >= 14 ? 4 : 3, label: "Надійний" };
  return { score: 2, label: "Середній" };
}

export function generatePassword(len = 16): string {
  const abc = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789-_!";
  const rnd = new Uint32Array(len);
  crypto.getRandomValues(rnd);
  let out = Array.from(rnd, (n) => abc[n % abc.length]).join("");
  // Make sure every kind is there.
  out = "aA2-".split("").reduce((s, _c, i) => (/[a-z]/.test(s) && /[A-Z]/.test(s) && /\d/.test(s) && /[-_!]/.test(s) ? s : s.slice(0, i) + ["k", "M", "7", "-"][i] + s.slice(i + 1)), out);
  return out;
}

/** «3 лист.» */
export function shortDay(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("uk-UA", { day: "numeric", month: "short" }) : "";
}
