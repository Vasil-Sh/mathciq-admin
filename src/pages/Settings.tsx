import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle, Bell, Bug, Check, ChevronDown, Clock, Copy, CreditCard, Eye, EyeOff, Info, LayoutGrid, Lock, Megaphone, MessageSquare, Monitor, Receipt, RefreshCw, Send, Smartphone, Sparkles, TextQuote, WifiOff, X,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Dropdown } from "@/components/ui/dropdown";
import PillTrack from "@/components/PillTrack";
import RollingNumber from "@/components/RollingNumber";
import { useMedia, useOnline } from "@/hooks/useMediaOnline";
import { useAuth } from "@/contexts/AuthContext";
import { authService } from "@/lib/authService";
import { setTokens } from "@/lib/apiClient";
import {
  changePassword, endSession, fetchSessions, fetchSettingsOverview, fetchSettingsWithMeta, logoutOthers, saveSettings,
  type Session, type SettingsMeta, type SettingsOverview,
} from "@/lib/adminSettingsApi";
import {
  agoText, changedKeys, closestVar, describeChange, deviceName, fillTemplate, generatePassword, passwordStrength, shortDay, templateParts, toDraft, unknownVar,
  DEFAULT_DRAFT, TEMPLATES, TEMPLATE_VARS, type Draft, type DraftKey,
} from "@/lib/settingsModel";
import type { AppSettings } from "@/types";
import { forgetReceiptTexts } from "@/lib/paymentReceipt";
import { askBadgePermission, isStandalone, useBadgePermission } from "@/lib/appBadge";
import { DEFAULT_TABS, TAB_OPTIONS, TAB_SLOTS, saveTabs, useTabs, type TabKey } from "@/lib/tabbar";
import { setExpiringWindow } from "@/lib/usersModel";
import { fetchServerErrors, resolveServerError, type ServerError } from "@/lib/serverErrorsApi";

type SecKey = "tariffs" | "trial" | "ai" | "texts" | "alerts" | "receipt" | "templates" | "account" | "banners" | "nav" | "errors";
const SECS: { key: SecKey; label: string; icon: typeof CreditCard; badge?: string; dark?: boolean }[] = [
  { key: "tariffs", label: "Тарифи", icon: CreditCard, badge: "оновлено" },
  { key: "trial", label: "Пробний період", icon: Clock, badge: "нове" },
  { key: "ai", label: "AI-аналіз", icon: Sparkles, badge: "нове", dark: true },
  { key: "texts", label: "Тексти й дисклеймери", icon: TextQuote, badge: "нове" },
  { key: "alerts", label: "Попередження", icon: Bell, badge: "нове", dark: true },
  { key: "receipt", label: "Чек оплати", icon: Receipt, badge: "нове" },
  { key: "templates", label: "Шаблони повідомлень", icon: MessageSquare, badge: "нове", dark: true },
  { key: "account", label: "Мій акаунт", icon: Lock, badge: "нове" },
  { key: "banners", label: "Банери", icon: Megaphone, dark: true },
  // phone only: the bottom tab bar
  { key: "nav", label: "Навігація", icon: Smartphone, badge: "нове" },
  // phone only: errors kept by the backend
  { key: "errors", label: "Помилки сервера", icon: Bug },
];
/** Phone: short tab label, page title and subtitle per section (design «Налаштування, мобільна»). */
const PHONE: Record<SecKey, [string, string, string]> = {
  tariffs: ["Тарифи", "Тарифи", "Назва, ціна й функції плану. Зміни діють одразу — без релізу."],
  trial: ["Пробний", "Пробний період", "Що отримує новий користувач і на скільки продовжує кнопка «+N днів»."],
  ai: ["AI-аналіз", "AI-аналіз", "Ліміти й правила формулювань. Доступно лише на Pro."],
  texts: ["Тексти", "Тексти й дисклеймери", "Змінюються в застосунку без релізу. Кожна зміна — у журналі дій."],
  alerts: ["Попередження", "Попередження й ризики", "Коли підписка потрапляє в «Потребує уваги», а користувач — у «Ризик відтоку»."],
  receipt: ["Чек", "Чек оплати", "Що бачить користувач на зображенні чека після запису оплати."],
  templates: ["Шаблони", "Шаблони повідомлень", "Текст для кнопки «Написати» на дашборді, у ризиках і після оплати."],
  account: ["Акаунт", "Мій акаунт і безпека", ""],
  banners: ["Банери", "Вимоги до банера", "Текст для рекламодавців — копіюється одним кліком на сторінці «Банери»."],
  nav: ["Навігація", "Навігація", "Чотири розділи в нижній панелі поруч із «Меню». Діє на цьому телефоні."],
  errors: ["Помилки", "Помилки сервера", "Що падало на бекенді за 30 днів. Однакові помилки зведені в одну з лічильником."],
};
const SEEN_KEY = "settingsSeen";
/** Which menu item a draft field belongs to (for the orange «unsaved» dot). */
const SEC_OF: Record<DraftKey, SecKey> = {
  basicPrice: "tariffs", proPrice: "tariffs", trialEnabled: "trial", trialDays: "trial", trialPlan: "trial", trialStepDays: "trial",
  aiDailyLimit: "ai", aiStopWords: "ai", aiWordingRule: "ai", expiringDays: "alerts", churnInactiveDays: "alerts", churnLossStreak: "alerts",
  receiptSupport: "receipt", receiptThanks: "receipt", receiptPrefix: "receipt", tplExpiring: "templates", tplInactive: "templates", tplPaid: "templates", tplLapsed: "templates", bannerSpecText: "banners",
};
const plural = (n: number, a: string, b: string, c: string) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };
const days = (n: number) => `${n} ${plural(n, "день", "дні", "днів")}`;
const people = (n: number) => `${n} ${plural(n, "користувач", "користувачі", "користувачів")}`;
const LOCKED_BASIC = ["AI-аналіз матчів", "Telegram-групи"];

// ───────────────────────── small parts ─────────────────────────
function Stepper({ value, min, max, step = 1, unit, label, light, editable, onChange }: { value: number; min: number; max: number; step?: number; unit?: string; label: string; light?: boolean; editable?: boolean; onChange: (v: number) => void }) {
  const [k, setK] = useState(0);
  const [draft, setDraft] = useState<string | null>(null);
  const set = (v: number) => { const n = Math.min(max, Math.max(min, v)); if (n !== value) { onChange(n); setK((x) => x + 1); } };
  // typed amount (e.g. 299): any whole number within min…max, the ± buttons still step by `step`
  const commit = () => { if (draft === null) return; const n = parseInt(draft.replace(/\D/g, ""), 10); setDraft(null); if (Number.isFinite(n)) set(n); }; // empty = keep the old price
  return (
    <div className={`v3-st-step${light ? " is-light" : ""}${editable ? " is-edit" : ""}`} role="group" aria-label={label}>
      <button type="button" aria-label={`Менше · ${label}`} className={value <= min ? "is-lim" : ""} aria-disabled={value <= min} onClick={() => set(value - step)}>−</button>
      {editable
        ? <strong><input type="text" inputMode="numeric" pattern="[0-9]*" aria-label={`${label}, ввести суму`} value={draft ?? String(value)} placeholder={String(value)} size={Math.max(3, (draft || String(value)).length)} onFocus={() => setDraft("")} onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, String(max).length))} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setDraft(null); (e.target as HTMLInputElement).blur(); } }} />{unit && <small>{unit}</small>}</strong>
        : <strong aria-live="polite"><span key={k} className="v3-st-roll">{value}</span>{unit && <small>{unit}</small>}</strong>}
      <button type="button" aria-label={`Більше · ${label}`} className={value >= max ? "is-lim" : ""} aria-disabled={value >= max} onClick={() => set(value + step)}>+</button>
    </div>
  );
}

function Section({ id, n, all, title, badge, sub, dark, children, aside }: { id: SecKey; n: number; all: boolean; title: string; badge?: string; sub: ReactNode; dark?: boolean; children: ReactNode; aside?: ReactNode }) {
  return (
    <section id={`st-${id}`} data-sec={id} className={`v3-st-sec ${dark ? "v3-dcard" : "v3-wcard"}`} aria-labelledby={`st-${id}-h`}>
      <header className="v3-st-sech">
        <div>
          <h2 id={`st-${id}-h`}>{all && <span className="v3-st-num">{String(n).padStart(2, "0")}</span>}{title}{badge && <span className="v3-st-new">{badge}</span>}</h2>
          <p>{sub}</p>
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

/** A button that asks «Точно?» inside itself first; the second press within 3 s does it. */
function AskButton({ className, label, ask, busy, onYes }: { className: string; label: string; ask: string; busy?: boolean; onYes: () => void }) {
  const [on, setOn] = useState(false);
  const t = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(t.current), []);
  return (
    <button type="button" className={`${className}${on ? " is-ask" : ""}${busy ? " is-busy" : ""}`} disabled={busy} onClick={() => {
      if (!on) { setOn(true); t.current = window.setTimeout(() => setOn(false), 3000); return; }
      window.clearTimeout(t.current); setOn(false); onYes();
    }}>{on ? ask : label}</button>
  );
}

function CopyButton({ text, dark }: { text: string; dark?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={`v3-btn v3-st-copy${dark ? " is-dark" : ""}${done ? " is-done" : ""}`} onClick={async () => {
      try { await navigator.clipboard.writeText(text); } catch { toast.error("Не вдалося скопіювати", { description: "Виділіть текст і скопіюйте вручну" }); return; }
      setDone(true); toast.success("Текст скопійовано", { description: "Вставте в повідомлення рекламодавцю" });
      window.setTimeout(() => setDone(false), 1800);
    }}>{done ? <><Check size={14} strokeWidth={3} aria-hidden="true" className="v3-st-pop" />Скопійовано</> : <><Copy size={14} aria-hidden="true" />Скопіювати</>}</button>
  );
}

// ───────────────────────── page ─────────────────────────
export default function Settings() {
  const { user } = useAuth();
  const wide = useMedia("(min-width: 1180px)");
  const phone = useMedia("(max-width: 767px)");
  const secs = SECS.filter((x) => (x.key !== "nav" && x.key !== "errors") || phone);
  const online = useOnline();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [meta, setMeta] = useState<SettingsMeta>({});
  const [saved, setSaved] = useState<Draft>(DEFAULT_DRAFT);
  const [cur, setCur] = useState<Draft>(DEFAULT_DRAFT);
  const [ov, setOv] = useState<SettingsOverview | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [save, setSave] = useState<"" | "busy" | "done" | "fail">("");
  const [saveErr, setSaveErr] = useState("");
  const [priceAsk, setPriceAsk] = useState(false);
  const [sec, setSec] = useState<SecKey | "all">(() => (location.hash.slice(1) as SecKey) || "tariffs");
  const [mSec, setMSec] = useState<SecKey | "all">(() => (location.hash.slice(1) as SecKey) || "all");
  // «Пароль і сесії» from the menu links to /settings#account — also when Settings is already open
  const { hash, key: locKey } = useLocation();
  useEffect(() => {
    const k = hash.slice(1) as SecKey;
    if (!k || !SECS.some((x) => x.key === k)) return;
    setSec(k); setMSec(k); markSeen(k);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [hash, locKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [here, setHere] = useState<SecKey>("tariffs");
  // phone: keep the chosen section chip in view
  useEffect(() => {
    const box = document.querySelector<HTMLElement>(".v3-st-ptabs"), b = box?.querySelector<HTMLElement>(".is-on");
    if (box && b) box.scrollTo({ left: b.offsetLeft - (box.clientWidth - b.clientWidth) / 2, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [mSec, loading]);
  const [seen, setSeen] = useState<SecKey[]>(() => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"); } catch { return []; } });
  const [barKick, setBarKick] = useState(0);

  const load = useCallback(async () => {
    setLoading(true); setLoadErr("");
    try {
      const { settings: s, meta: m } = await fetchSettingsWithMeta();
      setSettings(s); setMeta(m); const d = toDraft(s); setSaved(d); setCur(d);
    } catch (e) { setLoadErr((e as Error).message || "Сервер не відповідає"); }
    finally { setLoading(false); }
    fetchSettingsOverview().then(setOv).catch(() => {});
  }, []);
  useEffect(() => { void load(); }, [load]);

  const changed = useMemo(() => changedKeys(saved, cur), [saved, cur]);
  const dirty = changed.length > 0;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Leaving for another screen of the admin with unsaved changes: ask first (design «Стани · 06»).
  const navigate = useNavigate();
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      e.preventDefault(); e.stopPropagation();
      setLeaveTo(url.pathname + url.search + url.hash);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty]);

  const set = <K extends DraftKey>(k: K, v: Draft[K]) => { setCur((c) => ({ ...c, [k]: v })); if (save === "done" || save === "fail") setSave(""); };

  // Mark a section as seen (its «нове» badge goes away next time).
  const markSeen = (k: SecKey) => setSeen((s) => { if (s.includes(k)) return s; const n = [...s, k]; try { localStorage.setItem(SEEN_KEY, JSON.stringify(n)); } catch { /* private mode */ } return n; });
  // Badges stay for the whole visit; a section opened now loses its badge next time.
  const [seenAtLoad] = useState(seen);
  const badgeOf = (k: SecKey) => (seenAtLoad.includes(k) ? undefined : SECS.find((x) => x.key === k)?.badge);
  useEffect(() => { if (sec !== "all") { markSeen(sec); history.replaceState(null, "", `#${sec}`); } else history.replaceState(null, "", "#all"); }, [sec]); // eslint-disable-line react-hooks/exhaustive-deps

  const validate = (): string => {
    for (const t of TEMPLATES) { const b = unknownVar(cur[t.key]); if (b) return `Шаблон «${t.title}»: змінної ${b} немає`; if (!cur[t.key].trim()) return `Шаблон «${t.title}» порожній`; }
    if (!/^@?[a-zA-Z0-9_]{5,32}$/.test(cur.receiptSupport.trim())) return "Telegram підтримки — @логін, 5–32 латинські літери, цифри або _";
    if (!/^[A-Za-z0-9]{1,6}$/.test(cur.receiptPrefix.trim())) return "Префікс чека — 1–6 латинських літер або цифр";
    if (!cur.receiptThanks.trim()) return "Фраза подяки порожня";
    if (!cur.aiWordingRule.trim()) return "Правило формулювань порожнє";
    return "";
  };

  async function doSave(): Promise<boolean> {
    if (!dirty || save === "busy") return !dirty;
    const bad = validate();
    if (bad) { setSave("fail"); setSaveErr(bad); setBarKick((x) => x + 1); return false; }
    const patch: Partial<AppSettings> = {};
    for (const k of changed) (patch as Record<string, unknown>)[k] = cur[k];
    const n = changed.length;
    setSave("busy"); setSaveErr("");
    try {
      const r = await saveSettings(patch);
      setSettings(r.settings); setMeta(r.meta); setExpiringWindow(r.settings.expiringDays);
      const d = toDraft(r.settings); setSaved(d); setCur(d);
      if (changed.some((k) => k.startsWith("receipt"))) forgetReceiptTexts();
      setSave("done"); setBarKick((x) => x + 1);
      toast.success("Налаштування збережено", { description: `${n} ${plural(n, "зміна", "зміни", "змін")} · записано в журнал дій` });
      fetchSettingsOverview().then(setOv).catch(() => {});
      window.setTimeout(() => setSave((s) => (s === "done" ? "" : s)), 2600);
      return true;
    } catch (e) {
      setSave("fail"); setSaveErr((e as Error).message || "Сервер не відповідає"); setBarKick((x) => x + 1);
      return false;
    }
  }
  const priceChanged = cur.basicPrice !== saved.basicPrice || cur.proPrice !== saved.proPrice;
  const onSave = () => { if (priceChanged) setPriceAsk(true); else void doSave(); };
  const onCancel = () => {
    const was = cur; setCur(saved); setSave("");
    toast("Зміни скасовано", { description: "Повернули збережені значення", action: { label: "Повернути", onClick: () => setCur(was) } });
  };

  // ── «Показати все»: which section is on screen ──
  useEffect(() => {
    if (!wide || sec !== "all") return;
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-sec]"));
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setHere((vis.target as HTMLElement).dataset.sec as SecKey);
    }, { rootMargin: "-30% 0px -60% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [wide, sec, loading]);
  useEffect(() => { if (sec === "all") markSeen(here); }, [here, sec]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (k: SecKey | "all") => {
    if (sec === "all" && k !== "all") { document.getElementById(`st-${k}`)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); return; }
    setSec(k);
  };

  // ── side menu pill ──
  const listRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ y: number; h: number } | null>(null);
  const activeKey = sec === "all" ? here : sec;
  useLayoutEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-k="${activeKey}"]`);
    if (el) setPill({ y: el.offsetTop, h: el.offsetHeight });
  }, [activeKey, wide, loading, seen.length]);

  if (loading && !settings && phone) {
    // phone: the same shape as the loaded screen — kicker, title, chips, one card of rows
    return (
      <div className="v3-page v3-settings v3-st-pskel" aria-busy="true">
        <span className="v3-skel v3-skel-light" style={{ width: 110, height: 12 }} />
        <span className="v3-skel v3-skel-light" style={{ width: "72%", height: 34, marginTop: 10 }} />
        <span className="v3-skel v3-skel-light" style={{ width: "90%", height: 13, marginTop: 10 }} />
        <div className="v3-st-pskel-chips">{[84, 96, 70, 110].map((w, i) => <span key={i} className="v3-skel v3-skel-light" style={{ width: w }} />)}</div>
        <div className="v3-st-pskel-card">{[0, 1, 2, 3].map((i) => <div key={i}><span><span className="v3-skel v3-skel-light" style={{ width: "60%", height: 15 }} /><span className="v3-skel v3-skel-light" style={{ width: "42%", height: 11 }} /></span><span className="v3-skel v3-skel-light" style={{ width: 96, height: 34, borderRadius: 10 }} /></div>)}</div>
        <span className="sr-only" role="status">Завантаження налаштувань…</span>
      </div>
    );
  }
  if (loading && !settings) {
    return (
      <div className="v3-page v3-settings">
        <section className="v3-hero"><h1 className="v3-title">Налаштування</h1></section>
        <div className="v3-st-layout" aria-busy="true">
          {wide && <div className="v3-dcard v3-st-side is-skel"><span className="v3-skel" style={{ width: "70%" }} /><span className="v3-skel" style={{ width: "50%" }} /><span className="v3-skel" style={{ width: "60%" }} /></div>}
          <div className="v3-wcard v3-st-skel"><span className="v3-skel v3-skel-light" style={{ width: "40%", height: 18 }} /><span className="v3-skel v3-skel-light" style={{ width: "70%" }} /><div className="v3-st-skel-row"><span className="v3-skel v3-skel-light" /><span className="v3-skel v3-skel-light" /></div><span className="v3-skel v3-skel-light" style={{ height: 50 }} /></div>
        </div>
        <span className="sr-only" role="status">Завантаження налаштувань…</span>
      </div>
    );
  }
  if (loadErr && !settings) {
    return (
      <div className="v3-page v3-settings">
        <section className="v3-hero"><h1 className="v3-title">Налаштування</h1></section>
        <div className="v3-dcard v3-st-loaderr" role="alert">
          <span className="v3-st-errico" aria-hidden="true">!</span>
          <h2>Не вдалося завантажити налаштування</h2>
          <p>Поки дані не завантажено, редагувати поля не можна — щоб випадково не перезаписати значення за замовчуванням.</p>
          <small>{loadErr}</small>
          <button type="button" className={`v3-btn v3-btn-primary${loading ? " is-busy" : ""}`} disabled={loading} onClick={() => void load()}>{loading ? "Завантажуємо…" : <><RefreshCw size={15} aria-hidden="true" />Спробувати ще раз</>}</button>
        </div>
      </div>
    );
  }

  const all = sec === "all";
  const pSec: SecKey = mSec === "all" ? "tariffs" : mSec;
  const show = (k: SecKey) => (wide ? all || sec === k : phone ? pSec === k : mSec === "all" || mSec === k);
  const loginAt = Number(localStorage.getItem("loginAt") || 0);
  const lastIn = loginAt ? `вхід ${new Date(loginAt).toDateString() === new Date().toDateString() ? "сьогодні" : shortDay(new Date(loginAt).toISOString())} о ${new Date(loginAt).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}` : "";
  const pSub = pSec === "account" ? [`@${user?.username || ""}`, user?.isOwner ? "Овнер" : "Адміністратор", lastIn].filter(Boolean).join(" · ") : PHONE[pSec][2];
  const n = (k: SecKey) => SECS.findIndex((x) => x.key === k) + 1;
  const proPeople = ov?.plans.pro ?? 0;
  const perAnalysisUah = ov && ov.ai.month > 0 ? ov.ai.monthUah / ov.ai.month : 0;
  const monthName = new Date().toLocaleDateString("uk-UA", { month: "long" });

  // ── the bar ──
  const barTitle = save === "fail" ? (saveErr || "Не вдалося зберегти") : dirty ? `${changed.length} ${plural(changed.length, "незбережена зміна", "незбережені зміни", "незбережених змін")}` : "Усе збережено";
  const barNote = dirty && save !== "fail" ? changed.slice(0, 2).map((k) => describeChange(k, saved, cur)).join(", ") + (changed.length > 2 ? ` і ще ${changed.length - 2}` : "") : save === "fail" ? "Ваші зміни лишилися в полях" : "";
  const showBar = dirty || save === "done" || save === "fail";
  const bar = showBar && (
    <div key={`bar-${barKick}`} className={`v3-st-bar${!dirty && save === "done" ? " is-clean" : ""}${save === "fail" ? " is-fail" : ""}${barKick ? " is-kick" : ""}`} role="status" aria-live="polite">
      <span className={`v3-st-dot${!dirty && save === "done" ? " is-ok" : save === "fail" ? " is-bad" : ""}`} aria-hidden="true" />
      <span className="v3-st-bar-t"><strong>{!dirty && save === "done" ? <><Check size={14} strokeWidth={3} aria-hidden="true" /> {barTitle}</> : phone && dirty && save !== "fail" ? `${changed.length} ${plural(changed.length, "зміна", "зміни", "змін")}` : barTitle}</strong>{phone && dirty && save !== "fail" && " · не збережено"}{barNote && <span className="v3-hide-mobile"> · {barNote}</span>}</span>
      {dirty && <>
        <button type="button" className="v3-btn v3-st-cancel" onClick={onCancel} disabled={save === "busy"}>Скасувати</button>
        <button type="button" className={`v3-btn v3-btn-primary${save === "busy" ? " is-busy" : ""}`} disabled={save === "busy" || !online} onClick={onSave}>{save === "busy" ? "Зберігаємо…" : save === "fail" ? "Повторити" : "Зберегти"}</button>
      </>}
    </div>
  );

  // ───────── sections ─────────
  const tariffs = show("tariffs") && <TariffsSection key="tariffs" phone={phone} all={all} n={n("tariffs")} badge={badgeOf("tariffs")} cur={cur} saved={saved} set={set} settings={settings!} ov={ov} />;
  const sw = (on: boolean, label: string, onClick?: () => void) => onClick
    ? <button type="button" role="switch" aria-checked={on} aria-label={label} className={`v3-st-sw${on ? " is-on" : ""}`} onClick={onClick}><span aria-hidden="true" /></button>
    : <span role="switch" aria-checked={on} aria-disabled="true" aria-label={`${label} · завжди`} title="Завжди увімкнено" className={`v3-st-sw is-fixed${on ? " is-on" : ""}`}><span aria-hidden="true" /></span>;
  const trialPhone = phone && show("trial") && (
    <Section key="trial" id="trial" n={n("trial")} all={all} title="Пробний період і продовження" badge={badgeOf("trial")} sub="">
      <div className="v3-st-mc">
        <div className="v3-st-prow"><span><strong>Пробний період</strong><small>{ov ? (ov.trial.now ? `зараз на пробному: ${ov.trial.now} ${plural(ov.trial.now, "людина", "людини", "людей")}` : "зараз ніхто не на пробному") : "рахуємо…"}</small></span>{sw(cur.trialEnabled, "Пробний період", () => set("trialEnabled", !cur.trialEnabled))}</div>
        <div className={`v3-st-prow${cur.trialEnabled ? "" : " is-dim"}`}><strong>Тривалість</strong><span className="v3-st-pstep"><Stepper light label="Тривалість пробного" value={cur.trialDays} min={1} max={30} onChange={(v) => set("trialDays", v)} /><small>{plural(cur.trialDays, "день", "дні", "днів")}</small></span></div>
        <div className={`v3-st-prow${cur.trialEnabled ? "" : " is-dim"}`}><strong>План під час пробного</strong><Dropdown className="v3-st-dd" align="right" ariaLabel="План під час пробного" value={cur.trialPlan === "basic" ? "basic" : "pro"} onChange={(v) => set("trialPlan", v)} sheet={{ title: "План під час пробного" }} options={[{ value: "basic", label: "Базова" }, { value: "pro", label: "Pro" }]} /></div>
        <div className="v3-st-prow"><span><strong>Один пробний на людину</strong><small>перевіряємо за Telegram</small></span>{sw(true, "Один пробний на людину")}</div>
      </div>
      <div className="v3-st-mc"><strong className="v3-st-mch">Крок «+N днів»</strong>
        <div className="v3-seg v3-st-segs" role="group" aria-label="Крок продовження">
          <PillTrack active={cur.trialStepDays} />
          {[7, 14, 30].map((d) => <button key={d} type="button" className={cur.trialStepDays === d ? "is-on" : ""} aria-pressed={cur.trialStepDays === d} onClick={() => set("trialStepDays", d)}>{d} днів</button>)}
        </div>
      </div>
    </Section>
  );
  const alertsPhone = phone && show("alerts") && (
    <Section key="alerts" id="alerts" n={n("alerts")} all={all} title="Попередження й ризики" badge={badgeOf("alerts")} sub="">
      <div className="v3-st-mc">
        <div className="v3-st-prow"><span><strong>Підписка закінчується за</strong><small>блок «Потребує уваги»</small></span><span className="v3-st-pstep"><Stepper light label="Підписка закінчується за" value={cur.expiringDays} min={1} max={30} onChange={(v) => set("expiringDays", v)} /><small>дн.</small></span></div>
        <div className="v3-st-prow"><span><strong>Неактивний після</strong><small>без нових ставок</small></span><span className="v3-st-pstep"><Stepper light label="Неактивний після" value={cur.churnInactiveDays} min={3} max={60} onChange={(v) => set("churnInactiveDays", v)} /><small>дн.</small></span></div>
        <div className="v3-st-prow"><span><strong>Серія програшів від</strong><small>позначка в «Ставках»</small></span><span className="v3-st-pstep"><Stepper light label="Серія програшів від" value={cur.churnLossStreak} min={2} max={20} onChange={(v) => set("churnLossStreak", v)} /><small aria-hidden="true" /></span></div>
      </div>
      <div className="v3-st-ptiles" aria-label="Зараз під ці правила потрапляють">
        <div><small>Закінчуються</small><b>{ov ? <RollingNumber key={`e${ov.alerts.expiring}`} text={String(ov.alerts.expiring)} /> : "—"}</b></div>
        <div><small>Неактивні</small><b>{ov ? <RollingNumber key={`i${ov.alerts.inactive}`} text={String(ov.alerts.inactive)} /> : "—"}</b></div>
        <div><small>Серія</small><b>{ov ? <RollingNumber key={`l${ov.alerts.lossStreak}`} text={String(ov.alerts.lossStreak)} /> : "—"}</b></div>
      </div>
    </Section>
  );
  const bannersPhone = phone && show("banners") && (
    <Section key="banners" id="banners" n={n("banners")} all={all} title="Вимоги до банера" sub="">
      <div className="v3-st-mc">
        <textarea className="v3-st-pta" rows={8} maxLength={2000} aria-label="Текст для рекламодавців" value={cur.bannerSpecText} onChange={(e) => set("bannerSpecText", e.target.value)} placeholder="Розмір, формат, куди веде посилання, контакт…" />
        <small className={`v3-st-pcnt${cur.bannerSpecText.length > 1900 ? " is-warn" : ""}`}>{cur.bannerSpecText.length} / 2000</small>
        <div className="v3-st-pbtns"><CopyButton text={cur.bannerSpecText} /><button type="button" className={`v3-st-pgreen${save === "busy" ? " is-busy" : ""}`} disabled={!changed.includes("bannerSpecText") || save === "busy" || !online} onClick={onSave}>{save === "busy" ? "Зберігаємо…" : "Зберегти"}</button></div>
      </div>
    </Section>
  );
  const trial = !phone && show("trial") && (
    <Section key="trial" id="trial" n={n("trial")} all={all} title="Пробний період і продовження" badge={badgeOf("trial")} sub="Що отримує новий користувач і на скільки продовжує кнопка «+N днів».">
      <label className="v3-st-swrow">
        <button type="button" role="switch" aria-checked={cur.trialEnabled} className={`v3-st-sw${cur.trialEnabled ? " is-on" : ""}`} onClick={() => set("trialEnabled", !cur.trialEnabled)}><span aria-hidden="true" /></button>
        <span><strong>{cur.trialEnabled ? "Пробний період увімкнено" : "Пробний період вимкнено"}</strong>
          <small>{ov ? `Зараз на пробному: ${ov.trial.now} ${plural(ov.trial.now, "людина", "людини", "людей")}${ov.trial.conversionPct !== null ? ` · у платний за 30 днів перейшли ${ov.trial.conversionPct}%` : ""}` : "Рахуємо, скільки людей зараз на пробному…"}</small></span>
      </label>
      <div className="v3-st-grid3">
        <div className={`v3-st-f${cur.trialEnabled ? "" : " is-dim"}`}><span className="v3-st-l">Тривалість</span><Stepper light label="Тривалість пробного" value={cur.trialDays} min={1} max={30} unit={plural(cur.trialDays, "день", "дні", "днів")} onChange={(v) => set("trialDays", v)} /></div>
        <div className={`v3-st-f${cur.trialEnabled ? "" : " is-dim"}`}><span className="v3-st-l">План під час пробного</span>
          <Dropdown className="v3-st-dd" ariaLabel="План під час пробного" value={cur.trialPlan === "basic" ? "basic" : "pro"} onChange={(v) => set("trialPlan", v)} options={[{ value: "basic", label: "Базова" }, { value: "pro", label: "Pro" }]} />
        </div>
        <div className="v3-st-f"><span className="v3-st-l">Крок «+N днів»</span>
          <div className="v3-seg v3-st-segs" role="group" aria-label="Крок продовження">
            <PillTrack active={cur.trialStepDays} />
            {[7, 14, 30].map((d) => <button key={d} type="button" className={cur.trialStepDays === d ? "is-on" : ""} aria-pressed={cur.trialStepDays === d} onClick={() => set("trialStepDays", d)}>{d} днів</button>)}
          </div>
        </div>
      </div>
      <div className="v3-st-note"><Lock size={16} aria-hidden="true" /><span><strong>Один пробний період на людину</strong><small>Перевіряємо за Telegram: якщо він уже є в іншому акаунті, пробний не дамо — форма запропонує Базову або Pro.</small></span></div>
    </Section>
  );
  const ai = show("ai") && <AiSection key="ai" phone={phone} all={all} n={n("ai")} badge={badgeOf("ai")} cur={cur} set={set} ov={ov} proPeople={proPeople} perAnalysisUah={perAnalysisUah} monthName={monthName} />;
  const texts = show("texts") && settings && <TextsSection key="texts" phone={phone} all={all} n={n("texts")} badge={badgeOf("texts")} settings={settings} meta={meta} online={online} onSaved={(s, m) => { setSettings(s); setMeta(m); }} />;
  const alerts = !phone && show("alerts") && (
    <Section key="alerts" id="alerts" n={n("alerts")} all={all} dark title="Попередження й ризики" badge={badgeOf("alerts")} sub="Коли підписка потрапляє в «Потребує уваги», а користувач — у «Ризик відтоку».">
      <div className="v3-st-grid3">
        <div className="v3-st-f"><span className="v3-st-l">Підписка закінчується за</span><Stepper label="Підписка закінчується за" value={cur.expiringDays} min={1} max={30} unit={plural(cur.expiringDays, "день", "дні", "днів")} onChange={(v) => set("expiringDays", v)} /><small className="v3-st-hint">Блок «Потребує уваги» на дашборді</small></div>
        <div className="v3-st-f"><span className="v3-st-l">Неактивний після</span><Stepper label="Неактивний після" value={cur.churnInactiveDays} min={3} max={60} unit={plural(cur.churnInactiveDays, "день", "дні", "днів")} onChange={(v) => set("churnInactiveDays", v)} /><small className="v3-st-hint">без нових ставок</small></div>
        <div className="v3-st-f"><span className="v3-st-l">Серія програшів від</span><Stepper label="Серія програшів від" value={cur.churnLossStreak} min={2} max={20} unit="поспіль" onChange={(v) => set("churnLossStreak", v)} /><small className="v3-st-hint">позначка в «Ставках» і в ризиках</small></div>
      </div>
      <p className="v3-st-catch"><Info size={15} aria-hidden="true" />
        {ov ? <span>Зараз під ці правила потрапляють: <b><RollingNumber key={`e${ov.alerts.expiring}`} text={String(ov.alerts.expiring)} /> {plural(ov.alerts.expiring, "підписка", "підписки", "підписок")}</b> закінчуються · <b><RollingNumber key={`i${ov.alerts.inactive}`} text={String(ov.alerts.inactive)} /> {plural(ov.alerts.inactive, "неактивний", "неактивні", "неактивних")}</b> · <b><RollingNumber key={`l${ov.alerts.lossStreak}`} text={String(ov.alerts.lossStreak)} /> {plural(ov.alerts.lossStreak, "серія", "серії", "серій")} програшів</b>.{(cur.expiringDays !== saved.expiringDays || cur.churnInactiveDays !== saved.churnInactiveDays || cur.churnLossStreak !== saved.churnLossStreak) && " Після збереження перерахуємо."}</span> : <span>Рахуємо, скільки людей зараз під ці правила…</span>}
      </p>
    </Section>
  );
  const receipt = show("receipt") && <ReceiptSection key="receipt" phone={phone} all={all} n={n("receipt")} badge={badgeOf("receipt")} cur={cur} saved={saved} set={set} next={ov?.receiptNext} wide={wide} />;
  const templates = show("templates") && <TemplatesSection key="templates" phone={phone} all={all} n={n("templates")} badge={badgeOf("templates")} cur={cur} set={set} wide={wide} />;
  const account = show("account") && <AccountSection key="account" phone={phone} all={all} n={n("account")} badge={badgeOf("account")} me={user?.username || ""} owner={!!user?.isOwner} online={online} />;
  const banners = !phone && show("banners") && (
    <Section key="banners" id="banners" n={n("banners")} all={all} dark title="Вимоги до банера" sub="Текст для рекламодавців — копіюється одним кліком на сторінці «Банери»." aside={<CopyButton dark text={cur.bannerSpecText} />}>
      <label className="v3-st-f"><span className="v3-st-l">Текст для рекламодавців</span>
        <textarea className="v3-st-ta is-dark" rows={7} maxLength={2000} value={cur.bannerSpecText} onChange={(e) => set("bannerSpecText", e.target.value)} placeholder="Розмір, формат, куди веде посилання, контакт…" />
      </label>
      <p className="v3-st-meta"><span>{meta.bannerSpecText ? `Остання зміна: ${meta.bannerSpecText.by ? `@${meta.bannerSpecText.by} · ` : ""}${shortDay(meta.bannerSpecText.at)}` : ""}</span><span className={cur.bannerSpecText.length > 1900 ? "is-warn" : ""}>{cur.bannerSpecText.length} / 2000</span></p>
    </Section>
  );
  const nav = phone && show("nav") && <NavSection key="nav" phone={phone} all={all} n={n("nav")} badge={badgeOf("nav")} />;
  const errorsSec = phone && show("errors") && <ErrorsSection key="errors" all={all} n={n("errors")} />;
  const body = [tariffs, trial || trialPhone, ai, texts, alerts || alertsPhone, receipt, templates, account, banners || bannersPhone, nav, errorsSec];

  return (
    <div className={`v3-page v3-settings${phone ? " is-phone" : ""}`}>
      {phone ? <section className="v3-hero v3-st-phero" key={`h-${pSec}`}>
        <p className="v3-st-eyb">Налаштування</p>
        <h1 className="v3-title">{PHONE[pSec][1]}</h1>
        {pSub && <p className="v3-subtitle">{pSub}</p>}
      </section> : <section className="v3-hero">
        <h1 className="v3-title">Налаштування</h1>
        <p className="v3-subtitle"><span className="v3-hide-mobile">Значення за замовчуванням для всієї адмінки. Зміни діють для нових дій — наявні підписки не змінюються.</span><span className="v3-only-mobile">Діють для нових дій — наявні підписки не змінюються.</span></p>
      </section>}
      {!online && <div className="v3-offline-users" role="status"><WifiOff size={16} aria-hidden="true" /><span>Немає інтернету. Зміни не збережуться — дочекайтесь з’єднання.</span></div>}
      {bar}

      {wide ? (
        <div className="v3-st-layout">
          <aside className="v3-dcard v3-st-side" aria-label="Розділи налаштувань">
            <button type="button" className={`v3-st-all${all ? " is-on" : ""}`} aria-pressed={all} onClick={() => setSec(all ? here : "all")}><LayoutGrid size={16} aria-hidden="true" />Показати все</button>
            {all ? (
              <div className="v3-st-here">
                <span><small>Ви тут</small><small>{n(here)} з {secs.length}</small></span>
                <strong>{SECS.find((x) => x.key === here)?.label}</strong>
                <i aria-hidden="true"><b style={{ width: `${(n(here) / secs.length) * 100}%` }} /></i>
                <small>Підсвічений пункт у меню — розділ на екрані. Клік — перейти до нього.</small>
              </div>
            ) : <hr />}
            <div ref={listRef} className="v3-st-list">
              {pill && <span className={`v3-st-pill${all ? " is-here" : ""}`} style={{ transform: `translateY(${pill.y}px)`, height: pill.h }} aria-hidden="true" />}
              {secs.map((s) => { const on = activeKey === s.key; const dirtyHere = changed.some((k) => SEC_OF[k] === s.key); const b = dirtyHere ? undefined : badgeOf(s.key); return (
                <button key={s.key} data-k={s.key} type="button" className={`v3-st-item${on ? (all ? " is-here" : " is-on") : ""}`} aria-current={on ? (all ? "location" : "page") : undefined} onClick={() => pick(s.key)}>
                  <s.icon size={16} aria-hidden="true" /><span>{s.label}</span>{b && <small>{b}</small>}
                  {dirtyHere && <i className="v3-st-dirty" title="Є незбережені зміни" aria-label="є незбережені зміни" />}
                </button>
              ); })}
            </div>
            <p className="v3-st-sidenote">Змінювати налаштування може адміністратор. Кожна зміна потрапляє в <Link to="/audit">Журнал дій</Link>.</p>
          </aside>
          <div key={`main-${sec}`} className={`v3-st-main${all ? " is-all" : ""}`}>{body}</div>
        </div>
      ) : (
        phone ? (
        <div className="v3-st-m">
          <div className="v3-st-ptabs" role="tablist" aria-label="Розділ налаштувань">
            {secs.map((x) => <button key={x.key} type="button" role="tab" aria-selected={pSec === x.key} className={pSec === x.key ? "is-on" : ""}
              onClick={() => { setMSec(x.key); markSeen(x.key); history.replaceState(null, "", `#${x.key}`); }}>{PHONE[x.key][0]}{changed.some((k) => SEC_OF[k] === x.key) && <i className="v3-st-dirty" aria-label="є незбережені зміни" />}</button>)}
          </div>
          <div key={`m-${pSec}`} className="v3-st-main">{body}</div>
        </div>
        ) : <div className="v3-st-m">
          <Dropdown className="v3-st-mdd" ariaLabel="Розділ налаштувань" prefix="Розділ:" value={mSec} onChange={(v) => { setMSec(v); if (v !== "all") markSeen(v); }} options={[{ value: "all" as const, label: "Усі розділи" }, ...secs.map((s) => ({ value: s.key, label: s.label }))]} />
          <div key={`m-${mSec}`} className="v3-st-main">{body}</div>
        </div>
      )}

      <Dialog open={!!leaveTo} onOpenChange={(o) => { if (!o && !leaving) setLeaveTo(null); }}>
        <DialogContent className="v3-modal sm:max-w-[480px]" role="alertdialog">
          <div className="v3-modal-iconrow">
            <span className="v3-modal-ico is-amber" aria-hidden="true"><AlertTriangle size={22} /></span>
            <div>
              <DialogTitle className="v3-modal-title">Залишити без збереження?</DialogTitle>
              <DialogDescription className="v3-modal-sub">{changed.length === 1 ? `Зміна «${describeChange(changed[0], saved, cur)}» не збережеться.` : `${changed.length} ${plural(changed.length, "зміна", "зміни", "змін")} не збережуться: ${changed.slice(0, 3).map((k) => describeChange(k, saved, cur)).join(", ")}${changed.length > 3 ? "…" : ""}.`}</DialogDescription>
            </div>
          </div>
          <div className="v3-modal-foot"><span /><div className="v3-modal-actions">
            <button type="button" className="v3-btn v3-btn-ghost" disabled={leaving} onClick={() => { const to = leaveTo!; setLeaveTo(null); setCur(saved); navigate(to); }}>Не зберігати</button>
            <button type="button" className={`v3-btn v3-btn-primary${leaving ? " is-busy" : ""}`} disabled={leaving || !online} onClick={async () => { setLeaving(true); const ok = await doSave(); setLeaving(false); if (ok) { const to = leaveTo!; setLeaveTo(null); navigate(to); } else setLeaveTo(null); }}>{leaving ? "Зберігаємо…" : "Зберегти й перейти"}</button>
          </div></div>
        </DialogContent>
      </Dialog>

      <Dialog open={priceAsk} onOpenChange={setPriceAsk}>
        <DialogContent className="v3-modal sm:max-w-[480px]" role="alertdialog">
          <DialogTitle className="v3-modal-title">{cur.proPrice !== saved.proPrice && cur.basicPrice !== saved.basicPrice ? `Змінити ціни: Базова ${saved.basicPrice} → ${cur.basicPrice} ₴, Pro ${saved.proPrice} → ${cur.proPrice} ₴?` : cur.proPrice !== saved.proPrice ? `Змінити ціну Pro: ${saved.proPrice} → ${cur.proPrice} ₴?` : `Змінити ціну Базової: ${saved.basicPrice} → ${cur.basicPrice} ₴?`}</DialogTitle>
          <DialogDescription className="v3-modal-sub">
            Нова ціна з’явиться в застосунку одразу.{ov ? ` ${people(cur.proPrice !== saved.proPrice ? ov.plans.pro : ov.plans.basic)} на ${cur.proPrice !== saved.proPrice ? "Pro" : "Базовій"} доживуть поточний період за ${cur.proPrice !== saved.proPrice ? saved.proPrice : saved.basicPrice} ₴, наступна оплата — ${cur.proPrice !== saved.proPrice ? cur.proPrice : cur.basicPrice} ₴.` : " Поточні підписки доживають до кінця за старою ціною."}
          </DialogDescription>
          <div className="v3-modal-foot"><span /><div className="v3-modal-actions">
            <button type="button" className="v3-btn v3-btn-ghost" onClick={() => setPriceAsk(false)}>Скасувати</button>
            <button type="button" className="v3-btn v3-btn-primary" onClick={() => { setPriceAsk(false); void doSave(); }}>{cur.proPrice !== saved.proPrice && cur.basicPrice !== saved.basicPrice ? "Змінити ціни" : "Змінити ціну"}</button>
          </div></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type SetFn = <K extends DraftKey>(k: K, v: Draft[K]) => void;

// ───────────────────────── tariffs ─────────────────────────
function TariffsSection({ phone, all, n, badge, cur, saved, set, settings, ov }: { phone?: boolean; all: boolean; n: number; badge?: string; cur: Draft; saved: Draft; set: SetFn; settings: AppSettings; ov: SettingsOverview | null }) {
  const [edit, setEdit] = useState<"" | "basic" | "pro">("");
  const total = ov ? Math.max(1, ov.plans.basic + ov.plans.pro) : 1;
  const plan = (k: "basic" | "pro") => {
    const isPro = k === "pro";
    const price = isPro ? cur.proPrice : cur.basicPrice;
    const feats = (isPro ? settings.proFeatures : settings.basicFeatures) || [];
    const users = ov ? ov.plans[k] : null;
    const changedPrice = price !== (isPro ? saved.proPrice : saved.basicPrice);
    return (
      <div className={`v3-st-plan${isPro ? " is-pro" : ""}${edit === k ? " is-edit" : ""}`}>
        <div className="v3-st-plan-h">
          <div><strong>{isPro ? "Pro" : "Базова"}</strong><p><span className="v3-st-price"><RollingNumber key={price} text={`${price}`} /> ₴</span><small> / 30 днів</small>{changedPrice && <span className="v3-st-was">було {isPro ? saved.proPrice : saved.basicPrice} ₴</span>}</p></div>
          <button type="button" className={`v3-btn v3-st-ebtn${edit === k ? " is-on" : ""}`} aria-expanded={edit === k} onClick={() => setEdit(edit === k ? "" : k)}>{edit === k ? "Готово" : "Редагувати"}</button>
        </div>
        {edit === k && <div className="v3-st-pedit"><span>Ціна за 30 днів</span><Stepper light editable label={`Ціна ${isPro ? "Pro" : "Базової"}`} value={price} min={0} max={10000} step={50} unit="₴" onChange={(v) => set(isPro ? "proPrice" : "basicPrice", v)} /></div>}
        {phone && edit === k && <small className="v3-st-phint">торкніться суми, щоб ввести · ± крок 50 ₴ · від 0 до 10 000 ₴</small>}
        {(!phone || edit === k) && <div className="v3-st-users"><i aria-hidden="true"><b className="v3-st-grow" style={{ width: users === null ? "0%" : `${Math.max(4, (users / total) * 100)}%` }} /></i><small>{users === null ? "…" : phone ? `${users} ${plural(users, "людина", "людини", "людей")}` : people(users)}</small></div>}
        <ul className="v3-st-feat">
          {feats.map((f) => <li key={f}><span className="v3-st-ok" aria-hidden="true"><Check size={12} strokeWidth={3} /></span>{isPro && /^AI-аналіз/.test(f) ? `${f} · ${cur.aiDailyLimit} на день` : f}</li>)}
          {!isPro && LOCKED_BASIC.map((f) => <li key={f} className="is-off"><span className="v3-st-no" aria-hidden="true"><X size={11} strokeWidth={3} /></span><span><span className="sr-only">Немає: </span>{f}</span></li>)}
        </ul>
      </div>
    );
  };
  return (
    <Section id="tariffs" n={n} all={all} title="Тарифи" badge={badge} sub="Назва, ціна й функції плану. Зміни діють одразу в застосунку — без релізу.">
      <div className="v3-st-plans">{plan("basic")}{plan("pro")}</div>
      {phone ? <p className="v3-st-pnote"><b aria-hidden="true">!</b><span>{(() => {
        const k = cur.proPrice !== saved.proPrice ? "pro" : cur.basicPrice !== saved.basicPrice ? "basic" : "";
        if (!k) return "Нова ціна — для нових оплат. Поточні підписки доживають до кінця за старою ціною.";
        const n2 = ov ? ov.plans[k] : 0, was = k === "pro" ? saved.proPrice : saved.basicPrice, now = k === "pro" ? cur.proPrice : cur.basicPrice;
        return `${ov ? `${n2} ${plural(n2, "людина", "людини", "людей")} на ${k === "pro" ? "Pro" : "Базовій"} доживають до кінця за ${was} ₴. ` : ""}Нова ціна ${now} ₴ — з наступної оплати.`;
      })()}</span></p>
        : <p className="v3-st-foot">Нова ціна — для нових оплат. Поточні підписки доживають до кінця за старою ціною. Оплати поки вносяться вручну.</p>}
    </Section>
  );
}

// ───────────────────────── AI ─────────────────────────
function AiSection({ phone, all, n, badge, cur, set, ov, proPeople, perAnalysisUah, monthName }: { phone?: boolean; all: boolean; n: number; badge?: string; cur: Draft; set: SetFn; ov: SettingsOverview | null; proPeople: number; perAnalysisUah: number; monthName: string }) {
  const [adding, setAdding] = useState(false);
  const [word, setWord] = useState("");
  const [fresh, setFresh] = useState("");
  const inp = useRef<HTMLInputElement>(null);
  useEffect(() => { if (adding) inp.current?.focus(); }, [adding]);
  const add = () => {
    const w = word.trim().toLowerCase();
    if (w && !cur.aiStopWords.includes(w)) { set("aiStopWords", [...cur.aiStopWords, w]); setFresh(w); }
    setWord(""); setAdding(false);
  };
  const remove = (w: string) => {
    const was = cur.aiStopWords;
    set("aiStopWords", was.filter((x) => x !== w));
    toast(`Слово «${w}» прибрано`, { description: "Збережеться разом з іншими змінами", action: { label: "Повернути", onClick: () => set("aiStopWords", was) } });
  };
  const est = perAnalysisUah > 0 && proPeople > 0 ? Math.round(cur.aiDailyLimit * 30 * proPeople * perAnalysisUah) : 0;
  const [wSheet, setWSheet] = useState(false);
  const [nw, setNw] = useState("");
  if (phone) {
    const addNw = () => { const w = nw.trim().toLowerCase(); if (!w) return; if (!cur.aiStopWords.includes(w)) { set("aiStopWords", [...cur.aiStopWords, w]); setFresh(w); } setNw(""); setWSheet(false); };
    return (
      <Section id="ai" n={n} all={all} title="AI-аналіз" badge={badge} sub="">
        <div className="v3-st-mc">
          <div className="v3-st-prow is-top"><span><strong>Ліміт для Pro</strong><small>аналізів на день на людину</small></span><Stepper light label="Ліміт аналізів на день" value={cur.aiDailyLimit} min={1} max={50} onChange={(v) => set("aiDailyLimit", v)} /></div>
          <div className="v3-st-ptiles is-2">
            <div><small>Сьогодні</small><b>{ov ? <><RollingNumber key={`t${ov.ai.today}`} text={String(ov.ai.today)} /> {plural(ov.ai.today, "аналіз", "аналізи", "аналізів")}</> : "—"}</b></div>
            <div><small>{monthName[0].toUpperCase() + monthName.slice(1)}</small><b>{ov ? `≈ ${ov.ai.monthUah.toLocaleString("uk-UA")} ₴` : "—"}</b></div>
          </div>
          {est > 0 && <small className="v3-st-phint">до ≈ {est.toLocaleString("uk-UA")} ₴/міс на {people(proPeople)}</small>}
        </div>
        <div className="v3-st-mc">
          <span><strong className="v3-st-mch">Заборонені слова</strong><small className="v3-st-msub">Відповідь із ними перепишеться</small></span>
          <div className="v3-st-pwords" role="group" aria-label="Заборонені слова">
            {cur.aiStopWords.map((w) => <span key={w} className={`v3-st-pword${w === fresh ? " is-new" : ""}`}>{w}<button type="button" aria-label={`Прибрати «${w}»`} onClick={() => remove(w)}><X size={12} strokeWidth={2.5} /></button></span>)}
            <button type="button" className="v3-st-pwadd" onClick={() => { setNw(""); setWSheet(true); }}>+ слово</button>
          </div>
        </div>
        <label className="v3-st-mc"><strong className="v3-st-mch">Правило формулювань</strong><small className="v3-st-msub">AI тримається його в кожній відповіді</small>
          <textarea className="v3-st-pta" rows={4} maxLength={1000} value={cur.aiWordingRule} onChange={(e) => set("aiWordingRule", e.target.value)} />
        </label>
        <Dialog open={wSheet} onOpenChange={setWSheet}>
          <DialogContent className="v3-sheet v3-pay-sheet v3-st-sheet">
            <DialogTitle>Заборонене слово</DialogTitle>
            <DialogDescription>AI перепише відповідь, якщо воно трапиться</DialogDescription>
            <label className="v3-st-sf"><span>Слово або фраза</span><input value={nw} maxLength={40} placeholder="Наприклад, «без ризику»" autoComplete="off" onChange={(e) => setNw(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNw(); } }} /></label>
            <small className="v3-st-phint">Без різниці, великі чи малі літери. Знайдемо й форми слова.</small>
            {cur.aiStopWords.length > 0 && <><span className="v3-st-sl">Уже в списку</span><div className="v3-st-pwords is-ro">{cur.aiStopWords.map((w) => <span key={w} className="v3-st-pword">{w}</span>)}</div></>}
            <div className="v3-st-pbtns"><button type="button" className="v3-st-pgrey" onClick={() => setWSheet(false)}>Скасувати</button><button type="button" className="v3-st-pgreen" disabled={!nw.trim()} onClick={addNw}>Додати</button></div>
          </DialogContent>
        </Dialog>
      </Section>
    );
  }
  return (
    <Section id="ai" n={n} all={all} dark title="AI-аналіз" badge={badge} sub="Ліміти й правила формулювань. Аналіз доступний лише на Pro.">
      <div className="v3-st-grid3 is-ai">
        <div className="v3-st-f"><span className="v3-st-l">Ліміт для Pro</span><Stepper label="Ліміт аналізів на день" value={cur.aiDailyLimit} min={1} max={50} onChange={(v) => set("aiDailyLimit", v)} />
          <small className="v3-st-hint">аналізів на день на людину{est ? ` · до ≈ ${est.toLocaleString("uk-UA")} ₴/міс на ${people(proPeople)}` : ""}</small></div>
        <div className="v3-st-stat"><small>Сьогодні</small><p><RollingNumber key={`t${ov?.ai.today}`} text={ov ? String(ov.ai.today) : "—"} /><span className="v3-st-statl">{ov ? `${plural(ov.ai.today, "аналіз", "аналізи", "аналізів")} · ≈ ${ov.ai.todayUah} ₴` : ""}</span></p></div>
        <div className="v3-st-stat"><small>{monthName[0].toUpperCase() + monthName.slice(1)}</small><p><RollingNumber key={`m${ov?.ai.month}`} text={ov ? String(ov.ai.month) : "—"} /><span className="v3-st-statl">{ov ? `${plural(ov.ai.month, "аналіз", "аналізи", "аналізів")} · ≈ ${ov.ai.monthUah} ₴` : ""}</span></p></div>
      </div>
      <label className="v3-st-f"><span className="v3-st-l">Правило формулювань</span>
        <textarea className="v3-st-ta is-dark" rows={3} maxLength={1000} value={cur.aiWordingRule} onChange={(e) => set("aiWordingRule", e.target.value)} />
      </label>
      <div className="v3-st-words" role="group" aria-label="Заборонені слова">
        <span>Заборонені слова — відповідь перепишеться:</span>
        {cur.aiStopWords.map((w) => <span key={w} className={`v3-st-word${w === fresh ? " is-new" : ""}`}>{w}<button type="button" aria-label={`Прибрати «${w}»`} onClick={() => remove(w)}><X size={12} strokeWidth={2.5} /></button></span>)}
        {adding
          ? <input ref={inp} className="v3-st-wordin" value={word} maxLength={40} aria-label="Нове заборонене слово" placeholder="слово" onChange={(e) => setWord(e.target.value)} onBlur={add} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } if (e.key === "Escape") { setWord(""); setAdding(false); } }} />
          : <button type="button" className="v3-st-wadd" onClick={() => setAdding(true)}>+ слово</button>}
      </div>
    </Section>
  );
}

// ───────────────────────── texts (each row saves on its own) ─────────────────────────
const TEXTS = [
  { key: "footerDisclaimer", title: "Дисклеймер у футері", where: "Футер усіх сторінок", max: 300 },
  { key: "addictionHelp", title: "Допомога при залежності", where: "Профіль → Відповідальна гра", max: 300 },
  { key: "beforeAiText", title: "Перед AI-аналізом", where: "Деталі матчу · кнопка «AI-аналіз»", max: 300 },
] as const;
function TextsSection({ phone, all, n, badge, settings, meta, online, onSaved }: { phone?: boolean; all: boolean; n: number; badge?: string; settings: AppSettings; meta: SettingsMeta; online: boolean; onSaved: (s: AppSettings, m: SettingsMeta) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [val, setVal] = useState("");
  const [st, setSt] = useState<"" | "busy">("");
  const [just, setJust] = useState<string | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (open) ta.current?.focus(); }, [open]);
  async function saveOne(key: (typeof TEXTS)[number]["key"]) {
    if (!val.trim()) { toast.error("Текст не може бути порожнім"); return; }
    setSt("busy");
    try {
      const r = await saveSettings({ [key]: val.trim() });
      onSaved(r.settings, r.meta); setOpen(null); setJust(key);
      toast.success("Текст збережено", { description: "У застосунку зміниться без релізу · записано в журнал дій" });
      window.setTimeout(() => setJust((j) => (j === key ? null : j)), 4000);
    } catch (e) { toast.error("Не вдалося зберегти текст", { description: (e as Error).message }); }
    finally { setSt(""); }
  }
  if (phone) {
    const t = TEXTS.find((x) => x.key === open);
    return (
      <Section id="texts" n={n} all={all} title="Тексти й дисклеймери" badge={badge} sub="">
        <ul className="v3-st-mc v3-st-ptexts">
          {TEXTS.map((x) => (
            <li key={x.key}><span><strong>{x.title}</strong><small className={just === x.key ? "is-new" : ""}>{just === x.key ? "✓ змінено щойно" : x.where.replace("Футер усіх сторінок", "футер усіх сторінок")}</small></span>
              <button type="button" className="v3-st-pgrey is-sm" onClick={() => { setOpen(x.key); setVal(settings[x.key] || ""); }}>Редагувати</button></li>
          ))}
          <li><span><strong>Мітка «Реклама · 21+»</strong><small>на кожному банері · вимкнути не можна</small></span><span className="v3-st-preq"><Lock size={13} aria-hidden="true" />Обов’язкова</span></li>
        </ul>
        <Dialog open={!!t} onOpenChange={(o) => { if (!o && !st) setOpen(null); }}>
          <DialogContent className="v3-sheet v3-pay-sheet v3-st-sheet">
            {t && <>
              <DialogTitle>{t.title}</DialogTitle>
              <DialogDescription>{t.key === "footerDisclaimer" ? "Футер усіх сторінок застосунку" : t.key === "beforeAiText" ? "Деталі матчу · над кнопкою «AI-аналіз»" : t.where}</DialogDescription>
              <textarea ref={ta} className="v3-st-pta is-on" rows={4} maxLength={t.max} value={val} aria-label={t.title} onChange={(e) => setVal(e.target.value)} />
              <small className="v3-st-pcnt is-left">{val.length} / {t.max}</small>
              <span className="v3-st-sl">{t.key === "footerDisclaimer" ? "Як виглядає у футері" : t.key === "beforeAiText" ? "Як виглядає в деталях матчу" : "Як виглядає в профілі"}</span>
              {t.key === "footerDisclaimer" ? <div className="v3-st-pv is-foot">{val || "…"}</div>
                : t.key === "beforeAiText" ? <div className="v3-st-pv is-ai"><span><Sparkles size={13} aria-hidden="true" />AI-аналіз · NAVI — G2</span><p>{val || "…"}</p><b>Отримати аналіз</b></div>
                : <div className="v3-st-pv is-help">{linkify(val || "…")}</div>}
              <div className="v3-st-pbtns"><button type="button" className="v3-st-pgrey" disabled={!!st} onClick={() => setOpen(null)}>Скасувати</button><button type="button" className={`v3-st-pgreen${st ? " is-busy" : ""}`} disabled={!!st || !online || val.trim() === (settings[t.key] || "")} onClick={() => void saveOne(t.key)}>{st ? "Зберігаємо…" : "Зберегти"}</button></div>
            </>}
          </DialogContent>
        </Dialog>
      </Section>
    );
  }
  return (
    <Section id="texts" n={n} all={all} title="Тексти й дисклеймери" badge={badge} sub="Змінюються в застосунку без релізу. Кожна зміна — у журналі дій.">
      <ul className="v3-st-texts">
        {TEXTS.map((t) => {
          const m = meta[t.key]; const editing = open === t.key; const text = settings[t.key] || "";
          return (
            <li key={t.key} className={`v3-st-tx${editing ? " is-edit" : ""}`}>
              <div className="v3-st-tx-b">
                <strong>{t.title}</strong>
                {editing ? (
                  <div className="v3-st-txed">
                    <textarea ref={ta} className="v3-st-ta" rows={2} maxLength={t.max} value={val} aria-label={t.title} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setOpen(null); }} />
                    <div className="v3-st-txacts">
                      <button type="button" className={`v3-btn v3-btn-dark v3-btn-sm${st ? " is-busy" : ""}`} disabled={!!st || !online || val.trim() === text} onClick={() => void saveOne(t.key)}>{st ? "Зберігаємо…" : "Зберегти"}</button>
                      <button type="button" className="v3-btn v3-st-ghostl v3-btn-sm" onClick={() => setOpen(null)} disabled={!!st}>Скасувати</button>
                      <small>{val.length} / {t.max}</small>
                    </div>
                  </div>
                ) : <p>{t.key === "addictionHelp" ? linkify(text) : text}</p>}
                <small className={just === t.key ? "is-new" : ""}>{t.where}{just === t.key ? " · ✓ змінено щойно" : m ? ` · змінено ${shortDay(m.at)}${m.by ? `, @${m.by}` : ""}` : ""}</small>
              </div>
              {!editing && <button type="button" className="v3-btn v3-st-ebtn" onClick={() => { setOpen(t.key); setVal(text); }}>Редагувати</button>}
            </li>
          );
        })}
        <li className="v3-st-tx is-locked">
          <div className="v3-st-tx-b"><strong>Мітка реклами <Lock size={12} aria-label="не змінюється" /></strong><p><span className="v3-st-adlabel">Реклама · 21+</span></p><small>На кожному банері й партнерському посиланні · вимкнути не можна</small></div>
          <span className="v3-st-req">обов’язкова</span>
        </li>
      </ul>
    </Section>
  );
}
function linkify(text: string): ReactNode {
  const m = text.match(/([a-z0-9-]+\.[a-z]{2,}(?:\/[^\s]*)?)/i);
  if (!m) return text;
  const i = m.index!;
  return <>{text.slice(0, i)}<a href={`https://${m[1]}`} target="_blank" rel="noreferrer">{m[1]}</a>{text.slice(i + m[1].length)}</>;
}

// ───────────────────────── receipt ─────────────────────────
function ReceiptSection({ phone, all, n, badge, cur, saved, set, next, wide }: { phone?: boolean; all: boolean; n: number; badge?: string; cur: Draft; saved: Draft; set: SetFn; next?: number; wide: boolean }) {
  const num = `${(cur.receiptPrefix || "MIQ").toUpperCase()}-${next ?? "…"}`;
  const today = new Date().toLocaleDateString("uk-UA");
  const sup = cur.receiptSupport.trim() ? `@${cur.receiptSupport.trim().replace(/^@/, "")}` : "@…";
  const printKey = `${cur.receiptSupport}|${cur.receiptThanks}|${cur.receiptPrefix}`;
  const flash = (k: DraftKey) => (cur[k] !== saved[k] ? "v3-st-flash" : "");
  const badSup = cur.receiptSupport.trim() !== "" && !/^@?[a-zA-Z0-9_]{5,32}$/.test(cur.receiptSupport.trim());
  const badPre = cur.receiptPrefix.trim() !== "" && !/^[A-Za-z0-9]{1,6}$/.test(cur.receiptPrefix.trim());
  if (phone) return (
    <Section id="receipt" n={n} all={all} title="Чек оплати" badge={badge} sub="">
      <div className="v3-st-mc">
        <label className="v3-st-sf"><span>Telegram підтримки</span><input className={badSup ? "is-bad" : ""} value={cur.receiptSupport} maxLength={33} onChange={(e) => set("receiptSupport", e.target.value)} aria-invalid={badSup} />{badSup && <small className="v3-st-phint is-bad">@логін — 5–32 латинські літери, цифри або _</small>}</label>
        <label className="v3-st-sf"><span>Фраза подяки</span><input value={cur.receiptThanks} maxLength={80} onChange={(e) => set("receiptThanks", e.target.value)} /></label>
        <label className="v3-st-sf"><span>Префікс номера чека</span><input className={badPre ? "is-bad" : ""} value={cur.receiptPrefix} maxLength={6} onChange={(e) => set("receiptPrefix", e.target.value.toUpperCase())} aria-invalid={badPre} />{badPre && <small className="v3-st-phint is-bad">1–6 латинських літер або цифр</small>}</label>
      </div>
      <span className="v3-st-sl">Прев’ю · жовтим те, що змінюється</span>
      <div className="v3-st-prc"><div key={printKey} className="v3-st-prc-in" aria-label="Прев’ю чека">
        <strong>MatchIQ</strong>
        <small>Чек № <mark>{(cur.receiptPrefix || "MIQ").toUpperCase()}</mark>-{next ?? "…"} · {today}</small>
        <b>{cur.proPrice.toLocaleString("uk-UA", { minimumFractionDigits: 2 })} грн</b>
        <small>Підтримка: <mark>{sup}</mark></small>
        <mark className="is-ty">{cur.receiptThanks || "…"}</mark>
      </div></div>
    </Section>
  );
  return (
    <Section id="receipt" n={n} all={all} title="Чек оплати" badge={badge} sub="Що бачить користувач на зображенні чека після запису оплати.">
      <div className={`v3-st-rc${wide ? "" : " is-m"}`}>
        <div className="v3-st-rcf">
          <label className="v3-st-f"><span className="v3-st-l">Telegram підтримки</span>
            <span className={`v3-st-in${badSup ? " is-bad" : ""}`}><input value={cur.receiptSupport} maxLength={33} onChange={(e) => set("receiptSupport", e.target.value)} aria-invalid={badSup} aria-describedby="rc-sup-h" /></span>
            <small id="rc-sup-h" className={`v3-st-hint${badSup ? " is-bad" : ""}`}>{badSup ? "@логін — 5–32 латинські літери, цифри або _" : "Рядок «Підтримка з питань оплати»"}</small>
          </label>
          <label className="v3-st-f"><span className="v3-st-l">Фраза подяки</span>
            <span className="v3-st-in"><input value={cur.receiptThanks} maxLength={80} onChange={(e) => set("receiptThanks", e.target.value)} /></span>
          </label>
          <label className="v3-st-f"><span className="v3-st-l">Префікс номера чека</span>
            <span className={`v3-st-in${badPre ? " is-bad" : ""}`}><input value={cur.receiptPrefix} maxLength={6} onChange={(e) => set("receiptPrefix", e.target.value.toUpperCase())} aria-invalid={badPre} /><span>-{next ?? "…"}</span></span>
            {badPre && <small className="v3-st-hint is-bad">1–6 латинських літер або цифр</small>}
          </label>
        </div>
        <div key={printKey} className="v3-st-rcpt" aria-label="Прев’ю чека">
          <div className="v3-st-rcpt-h"><strong>MatchIQ</strong><span className="v3-tag v3-tag-green">Записано</span></div>
          <p className="v3-st-rcpt-sum">{cur.proPrice.toLocaleString("uk-UA", { minimumFractionDigits: 2 })} <small>грн</small></p>
          <small className="v3-st-rcpt-n">Чек № <span className={flash("receiptPrefix")}>{num}</span> · {today}</small>
          <div className="v3-st-rcpt-sup"><small>Підтримка з питань оплати</small><b className={flash("receiptSupport")}>Telegram: {sup}</b></div>
          <strong className={`v3-st-rcpt-ty ${flash("receiptThanks")}`}>{cur.receiptThanks || "…"}</strong>
          <span className="v3-st-stamp" aria-hidden="true">MatchIQ ✓</span>
        </div>
      </div>
    </Section>
  );
}

// ───────────────────────── templates ─────────────────────────
function TemplatesSection({ phone, all, n, badge, cur, set, wide }: { phone?: boolean; all: boolean; n: number; badge?: string; cur: Draft; set: SetFn; wide: boolean }) {
  const [i, setI] = useState(0);
  const [sample, setSample] = useState<{ login: string; endDate: string; plan: string; amount: string; idleDays: number }>({ login: "maksym_k", endDate: "10.11.2026", plan: "Базову", amount: `${cur.basicPrice} ₴`, idleDays: 9 });
  const ta = useRef<HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const [justVar, setJustVar] = useState<number>(-1);
  useEffect(() => {
    authService.fetchUsers().then((list) => {
      const u = list.find((x) => x.role === "user" && x.endDate && x.telegram) || list.find((x) => x.role === "user");
      if (!u) return;
      const pro = u.plan === "pro";
      setSample({ login: u.username, endDate: u.endDate ? u.endDate.split("-").reverse().join(".") : "10.11.2026", plan: pro ? "Pro" : "Базову", amount: `${pro ? cur.proPrice : cur.basicPrice} ₴`, idleDays: 9 });
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const t = TEMPLATES[i];
  const text = cur[t.key];
  const parts = templateParts(text);
  const bad = unknownVar(text);
  const insert = (v: string) => {
    const el = ta.current;
    const a = el ? el.selectionStart : text.length, b = el ? el.selectionEnd : text.length;
    const before = text.slice(0, a), after = text.slice(b);
    const pad = before && !/\s$/.test(before) ? " " : "";
    const next = `${before}${pad}${v}${after}`;
    set(t.key, next);
    setJustVar(templateParts(`${before}${pad}${v}`).length - 1);
    requestAnimationFrame(() => { if (el) { const p = (before + pad + v).length; el.focus(); el.setSelectionRange(p, p); } });
  };
  const fix = () => { if (bad) set(t.key, text.replace(bad, closestVar(bad))); };
  const preview = fillTemplate(text, sample);
  if (phone) {
    const SHORT = ["Закінчується", "Без ставок", "Оплата", "Не продовжив"];
    return (
      <Section id="templates" n={n} all={all} title="Шаблони повідомлень" badge={badge} sub="">
        <div className="v3-seg v3-st-tseg" role="tablist" aria-label="Шаблони"><PillTrack active={i} />{TEMPLATES.map((x, k) => <button key={x.key} type="button" role="tab" aria-selected={k === i} className={k === i ? "is-on" : ""} title={x.title} onClick={() => { setI(k); setJustVar(-1); }}>{SHORT[k]}{unknownVar(cur[x.key]) && <i className="v3-st-dirty is-bad" aria-label="є помилка" />}</button>)}</div>
        <div key={t.key} className="v3-st-mc v3-st-tpled">
          <label className="v3-st-mch" htmlFor="st-tpl">Текст повідомлення</label>
          <div className={`v3-st-tpx${bad ? " is-bad" : ""}`}>
            <div ref={mirror} className="v3-st-tpx-m" aria-hidden="true">{parts.map((p, k) => <span key={k} className={p.v ? `v3-st-var${p.bad ? " is-bad" : ""}${k === justVar ? " is-just" : ""}` : ""}>{p.t}</span>)}{"\n"}</div>
            <textarea id="st-tpl" ref={ta} value={text} maxLength={1000} rows={4} spellCheck={false} aria-invalid={!!bad} aria-describedby={bad ? "st-tpl-err" : undefined}
              onChange={(e) => { set(t.key, e.target.value); setJustVar(-1); }} onScroll={(e) => { if (mirror.current) mirror.current.scrollTop = e.currentTarget.scrollTop; }} />
          </div>
          {bad && <div id="st-tpl-err" className="v3-st-tplerr" role="alert"><span>Змінної {bad} немає. Можливо, <strong>{closestVar(bad)}</strong>?</span><button type="button" className="v3-st-pgrey is-sm" onClick={fix}>Замінити</button></div>}
          <div className="v3-st-vars"><span>Вставити:</span>{TEMPLATE_VARS.map((v) => <button key={v} type="button" className="v3-st-vbtn" onClick={() => insert(v)}>{v}</button>)}</div>
        </div>
        <span className="v3-st-sl">Прев’ю для @{sample.login} · Telegram</span>
        <div key={preview.length % 2} className="v3-st-pbub">{preview}</div>
      </Section>
    );
  }
  return (
    <Section id="templates" n={n} all={all} dark title="Шаблони повідомлень" badge={badge} sub="Текст, який відкривається кнопкою «Написати» на дашборді, у ризиках відтоку й після оплати.">
      <div className={`v3-st-tpl${wide ? "" : " is-m"}`}>
        {wide ? (
          <div className="v3-st-tpllist" role="tablist" aria-label="Шаблони">
            <span className="v3-st-tplpill" style={{ transform: `translateY(${i * 62}px)` }} aria-hidden="true" />
            {TEMPLATES.map((x, k) => <button key={x.key} type="button" role="tab" aria-selected={k === i} className={`v3-st-tpb${k === i ? " is-on" : ""}`} onClick={() => { setI(k); setJustVar(-1); }}><strong>{x.title}</strong><small>{x.where}</small>{unknownVar(cur[x.key]) && <i className="v3-st-dirty is-bad" aria-label="є помилка" />}</button>)}
          </div>
        ) : (
          <Dropdown className="v3-st-dd is-dark" ariaLabel="Шаблон" value={t.key} onChange={(v) => { setI(TEMPLATES.findIndex((x) => x.key === v)); setJustVar(-1); }} options={TEMPLATES.map((x) => ({ value: x.key, label: x.title }))} />
        )}
        <div key={t.key} className="v3-st-tpled">
          <label className="v3-st-l" htmlFor="st-tpl">Текст повідомлення</label>
          <div className={`v3-st-tpx${bad ? " is-bad" : ""}`}>
            <div ref={mirror} className="v3-st-tpx-m" aria-hidden="true">{parts.map((p, k) => <span key={k} className={p.v ? `v3-st-var${p.bad ? " is-bad" : ""}${k === justVar ? " is-just" : ""}` : ""}>{p.t}</span>)}{"\n"}</div>
            <textarea id="st-tpl" ref={ta} value={text} maxLength={1000} rows={4} spellCheck={false} aria-invalid={!!bad} aria-describedby={bad ? "st-tpl-err" : undefined}
              onChange={(e) => { set(t.key, e.target.value); setJustVar(-1); }} onScroll={(e) => { if (mirror.current) mirror.current.scrollTop = e.currentTarget.scrollTop; }} />
          </div>
          {bad && <div id="st-tpl-err" className="v3-st-tplerr" role="alert"><span>Змінної {bad} немає. Можливо, ви мали на увазі <strong>{closestVar(bad)}</strong>?</span><button type="button" className="v3-btn v3-btn-ghost-dark v3-btn-sm" onClick={fix}>Замінити на {closestVar(bad)}</button></div>}
          <div className="v3-st-vars"><span>Вставити:</span>{TEMPLATE_VARS.map((v) => <button key={v} type="button" className="v3-st-vbtn" onClick={() => insert(v)}>{v}</button>)}</div>
          <div className="v3-st-tg">
            <span className="v3-st-tg-h"><small>Прев’ю для @{sample.login} · Telegram</small><small>{preview.length} {plural(preview.length, "символ", "символи", "символів")}</small></span>
            <div key={preview.length % 2} className="v3-st-bubble">{preview}</div>
          </div>
        </div>
      </div>
    </Section>
  );
}

// ───────────────────────── nav (phone) ─────────────────────────
/** Which four sections sit in the phone tab bar next to «Меню». Saved on this phone. */
function NavSection({ phone, all, n, badge }: { phone?: boolean; all: boolean; n: number; badge?: string }) {
  const tabs = useTabs();
  const full = tabs.length >= TAB_SLOTS;
  const [pick, setPick] = useState<TabKey[]>(tabs);
  useEffect(() => { setPick(tabs); }, [tabs]);
  const toggle = (k: TabKey) => {
    const on = pick.includes(k);
    if (on) { setPick(pick.filter((x) => x !== k)); return; }
    if (pick.length >= TAB_SLOTS) return;
    const next = [...pick, k];
    setPick(next);
    if (next.length === TAB_SLOTS) { saveTabs(next); toast.success("Нижню панель оновлено"); }
  };
  const isDefault = tabs.join() === DEFAULT_TABS.join();
  return (
    <Section id="nav" n={n} all={all} title="Навігація" badge={badge} sub="Чотири розділи в нижній панелі поруч із «Меню». Діє на цьому телефоні.">
      <div className="v3-st-mc"><span className="v3-st-sl">Нижня панель</span>
      <div className="v3-st-navprev" aria-hidden="true">
        <span className="v3-st-navtab"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></svg><small>Меню</small></span>
        {Array.from({ length: TAB_SLOTS }, (_, i) => { const o = TAB_OPTIONS.find((x) => x.key === pick[i]); return o
          ? <span key={o.key} className="v3-st-navtab is-set"><o.icon size={20} strokeWidth={1.6} /><small>{o.label}</small></span>
          : <span key={`e${i}`} className="v3-st-navtab is-empty"><i /><small>{i + 1}</small></span>; })}
      </div>
      <p className="v3-st-navhint">{pick.length < TAB_SLOTS ? `Оберіть ще ${TAB_SLOTS - pick.length} — панель оновиться, щойно буде ${TAB_SLOTS}.` : "Торкніться розділу, щоб прибрати його, і оберіть інший."}</p></div>
      <div className="v3-st-mc"><span className="v3-st-sl">Розділи · {pick.length} з {TAB_SLOTS}</span>
      <div className="v3-st-navlist" role="group" aria-label="Розділи нижньої панелі">
        {TAB_OPTIONS.map((o) => { const i = pick.indexOf(o.key); const on = i >= 0; const off = !on && pick.length >= TAB_SLOTS; return (
          <button key={o.key} type="button" className={`v3-st-navopt${on ? " is-on" : ""}`} aria-pressed={on} disabled={off} onClick={() => toggle(o.key)}>
            <o.icon size={18} aria-hidden="true" /><span>{o.label}</span>
            <b aria-hidden="true">{on ? i + 1 : ""}</b>
          </button>
        ); })}
      </div></div>
      <IconBadgeRow />
      {(!isDefault || !full) && <button type="button" className="v3-st-navreset" onClick={() => { saveTabs(DEFAULT_TABS); setPick(DEFAULT_TABS); }}>Повернути стандартні</button>}
    </Section>
  );
}

/** «Значок на іконці»: the number of alerts on the home-screen icon (iPhone needs notifications allowed for the app). */
function IconBadgeRow() {
  const perm = useBadgePermission();
  const standalone = isStandalone();
  const text = perm === "unsupported" ? "Цей браузер не показує число на іконці."
    : perm === "granted" ? "Увімкнено — на іконці число звернень, нових записів журналу, підписок, що закінчуються, і збою джерела матчів."
    : perm === "denied" ? "Сповіщення для MatchIQ заборонені. Дозвольте їх у Параметрах iPhone → Сповіщення → Admin MatchIQ."
    : !standalone ? "Спершу додайте адмінку на початковий екран (Поділитися → На початковий екран) і відкрийте з іконки."
    : "Покаже число сповіщень на іконці адмінки — як у звичайних застосунках.";
  return (
    <div className={`v3-st-badge${perm === "granted" ? " is-on" : ""}`}>
      <span><strong>Число на іконці</strong><small>{text}</small></span>
      {perm === "default" && standalone && <button type="button" onClick={() => void askBadgePermission()}>Увімкнути</button>}
    </div>
  );
}

// ───────────────────────── server errors (phone) ─────────────────────────
const ERR_SRC: Record<ServerError["source"], string> = { api: "API", process: "процес", console: "лог" };
const errAgo = (iso: string) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? "щойно" : m < 60 ? `${m} хв тому` : m < 1440 ? `${Math.round(m / 60)} год тому` : new Date(iso).toLocaleDateString("uk-UA", { day: "numeric", month: "short" }); };
/** Errors the backend kept (Railway's log scrolls away): one row per kind, how often, when; share or mark as fixed. */
const ERR_SEV = { critical: "Критично", warning: "Увага", info: "Інфо" } as const;

function ErrorsSection({ all, n }: { all: boolean; n: number }) {
  const [list, setList] = useState<ServerError[] | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | "all" | null>(null);
  const load = useCallback(() => { setErr(""); fetchServerErrors().then(setList).catch((e) => { setErr(e instanceof Error ? e.message : "Сервер не відповів"); setList([]); }); }, []);
  useEffect(() => { load(); }, [load]);
  const resolve = async (id: number | "all") => {
    setBusy(id);
    try { await resolveServerError(id); setList((xs) => (id === "all" ? [] : (xs || []).filter((x) => x.id !== id))); window.dispatchEvent(new Event("v3-server-errors")); toast.success(id === "all" ? "Список очищено" : "Позначено як вирішене"); }
    catch (e) { toast.error("Не вдалося", { description: e instanceof Error ? e.message : "" }); }
    setBusy(null);
  };
  const share = async (e: ServerError) => {
    const text = [`MatchIQ · помилка сервера (${ERR_SRC[e.source]}${e.status ? ` · ${e.status}` : ""}${e.severity ? ` · ${ERR_SEV[e.severity]}` : ""})`, e.message, e.hint || "", e.path ? `Маршрут: ${e.path}` : "", `${e.count} раз(и) · перша ${new Date(e.firstAt).toLocaleString("uk-UA")} · остання ${new Date(e.lastAt).toLocaleString("uk-UA")}`, e.detail ? `\n${e.detail}` : ""].filter(Boolean).join("\n");
    try { if (navigator.share) { await navigator.share({ title: "Помилка сервера", text }); return; } } catch (x) { if ((x as Error)?.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(text); toast.success("Скопійовано"); } catch { toast.error("Не вдалося скопіювати"); }
  };
  return (
    <Section id="errors" n={n} all={all} title="Помилки сервера" sub="Що падало на бекенді за 30 днів. Однакові помилки зведені в одну з лічильником.">
      {list === null ? <p className="v3-st-errnone">Завантажуємо…</p>
        : err ? <div className="v3-st-errnone"><span>Не вдалося завантажити: {err}</span><button type="button" onClick={load}>Спробувати ще раз</button></div>
        : !list.length ? <div className="v3-st-errz"><i aria-hidden="true"><Check size={22} strokeWidth={2.6} /></i><b>Помилок немає</b><span>Бекенд працює чисто — за 30 днів нічого не падало. Нові помилки з’являться тут самі.</span></div>
        : <>
          <div className="v3-st-errtop"><p className="v3-st-errsum"><span><b>{list.length} {plural(list.length, "помилка", "помилки", "помилок")}</b> · за 30 днів</span><span>{list.reduce((a, e) => a + e.count, 0)} {plural(list.reduce((a, e) => a + e.count, 0), "падіння", "падіння", "падінь")}</span></p><AskButton className="v3-st-errclr is-top" label="Очистити" ask="Точно очистити?" busy={busy === "all"} onYes={() => void resolve("all")} /></div>
          <ul className="v3-st-errs">{list.map((e, i) => (
            <li key={e.id} className={open === e.id ? "is-open" : ""} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
              <button type="button" className="v3-st-errh" aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)}>
                <span className={`v3-st-errsrc is-${e.source}`}>{ERR_SRC[e.source]}</span>
                <strong>{e.message}</strong>
                {e.severity && <em className={`v3-st-errsev is-${e.severity}`}><b>{ERR_SEV[e.severity]}</b>{e.hint}</em>}
                <small>{e.count > 1 && <span className="v3-st-errn">×{e.count}</span>}{e.status ? <span className="v3-st-errcode">{e.status}</span> : null}{errAgo(e.lastAt)}{e.path ? ` · ${e.path}` : ""}</small>
                <ChevronDown size={16} className="v3-st-errchev" aria-hidden="true" />
              </button>
              {open === e.id && <div className="v3-st-errd">
                {e.detail && <pre>{e.detail}</pre>}
                <dl>
                  <div><dt>Уперше</dt><dd>{new Date(e.firstAt).toLocaleString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</dd></div>
                  <div><dt>Востаннє</dt><dd>{new Date(e.lastAt).toLocaleString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</dd></div>
                  {e.status ? <div><dt>Статус-код</dt><dd>HTTP {e.status}</dd></div> : null}
                  {e.path && <div><dt>Маршрут</dt><dd>{e.path}</dd></div>}
                </dl>
                <div className="v3-st-pbtns"><button type="button" className="v3-st-pgrey" onClick={() => share(e)}><Send size={15} aria-hidden="true" />Надіслати</button><button type="button" className="v3-st-pgreen" disabled={busy === e.id} onClick={() => resolve(e.id)}>{busy === e.id ? "Зберігаємо…" : <><Check size={15} strokeWidth={2.6} aria-hidden="true" />Вирішено</>}</button></div>
              </div>}
            </li>
          ))}</ul>
          <AskButton className="v3-st-errclr" label="Очистити все" ask={`Точно очистити всі ${list.length}?`} busy={busy === "all"} onYes={() => void resolve("all")} />
        </>}
    </Section>
  );
}

// ───────────────────────── account ─────────────────────────
function AccountSection({ phone, all, n, badge, me, owner, online }: { phone?: boolean; all: boolean; n: number; badge?: string; me: string; owner: boolean; online: boolean }) {
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [eye1, setEye1] = useState(false);
  const [eye2, setEye2] = useState(true);
  const [pwSt, setPwSt] = useState<"" | "busy" | "done">("");
  const [pwErr, setPwErr] = useState("");
  const [shake, setShake] = useState(0);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [out, setOut] = useState<string | null>(null);
  const [allBusy, setAllBusy] = useState(false);
  useEffect(() => { fetchSessions().then(setSessions).catch(() => setSessions([])); }, []);
  const strength = passwordStrength(newPw);
  const loginAt = Number(localStorage.getItem("loginAt") || 0);
  const lastIn = loginAt ? `вхід ${new Date(loginAt).toDateString() === new Date().toDateString() ? "сьогодні" : shortDay(new Date(loginAt).toISOString())} о ${new Date(loginAt).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}` : "";
  async function updatePw() {
    setPwErr("");
    if (!curPw) { setPwErr("Введіть поточний пароль"); setShake((x) => x + 1); return; }
    if (newPw.length < 10) { setPwErr("Новий пароль — щонайменше 10 символів"); setShake((x) => x + 1); return; }
    if (newPw === curPw) { setPwErr("Новий пароль збігається з поточним"); setShake((x) => x + 1); return; }
    setPwSt("busy");
    try {
      await changePassword(curPw, newPw);
      setPwSt("done"); setCurPw(""); setNewPw("");
      toast.success("Пароль оновлено", { description: "На інших пристроях сесії лишаються — завершіть їх нижче, якщо потрібно" });
      window.setTimeout(() => setPwSt(""), 2000);
    } catch (e) { setPwSt(""); setPwErr((e as Error).message || "Не вдалося змінити пароль"); setShake((x) => x + 1); }
  }
  async function end(s: Session) {
    setOut(s.id);
    try {
      await endSession(s.id);
      window.setTimeout(() => { setSessions((l) => (l || []).filter((x) => x.id !== s.id)); setOut(null); }, 300);
      toast.success("Сесію завершено", { description: deviceName(s.userAgent).name });
    } catch (e) { setOut(null); toast.error("Не вдалося завершити сесію", { description: (e as Error).message }); }
  }
  async function endAll() {
    setAllBusy(true);
    try {
      const r = await logoutOthers();
      if (r.token && r.refreshToken) setTokens(r.token, r.refreshToken);
      const k = r.revoked ?? 0;
      setSessions((l) => (l || []).filter((x) => x.current));
      toast.success("Вийшли на інших пристроях", { description: `${k} ${plural(k, "сесію", "сесії", "сесій")} завершено` });
    } catch (e) { toast.error("Не вдалося завершити сесії", { description: (e as Error).message }); }
    finally { setAllBusy(false); }
  }
  const others = (sessions || []).filter((s) => !s.current).length;
  return (
    <Section id="account" n={n} all={all} title="Мій акаунт і безпека" badge={badge} sub={[`@${me}`, owner ? "Овнер" : "Адміністратор", lastIn].filter(Boolean).join(" · ")}>
      <div className="v3-st-acc">
        <form className="v3-st-pw" onSubmit={(e) => { e.preventDefault(); void updatePw(); }}>
          <strong className="v3-st-subh">Змінити пароль</strong>
          <input type="text" name="username" autoComplete="username" value={me} readOnly hidden />
          <label className="v3-st-f"><span className="v3-st-l">Поточний пароль</span>
            <span key={`c${shake}`} className={`v3-st-in${pwErr && /поточн/i.test(pwErr) ? " is-bad v3-st-shake" : ""}`}><input type={eye1 ? "text" : "password"} autoComplete="current-password" placeholder={phone ? "Ваш теперішній пароль" : undefined} value={curPw} onChange={(e) => { setCurPw(e.target.value); setPwErr(""); }} />
              <button type="button" className="v3-st-eye" aria-label={eye1 ? "Сховати пароль" : "Показати пароль"} aria-pressed={eye1} onClick={() => setEye1(!eye1)}>{eye1 ? <EyeOff size={17} /> : <Eye size={17} />}</button></span>
          </label>
          <label className="v3-st-f"><span className="v3-st-l">Новий пароль</span>
            <span key={`n${shake}`} className={`v3-st-in${pwErr && !/поточн/i.test(pwErr) ? " is-bad v3-st-shake" : ""}`}><input type={eye2 ? "text" : "password"} autoComplete="new-password" placeholder={phone ? "Щонайменше 10 символів" : undefined} value={newPw} onChange={(e) => { setNewPw(e.target.value); setPwErr(""); }} aria-describedby="st-pw-s" />
              <button type="button" className="v3-st-eye" aria-label={eye2 ? "Сховати пароль" : "Показати пароль"} aria-pressed={eye2} onClick={() => setEye2(!eye2)}>{eye2 ? <EyeOff size={17} /> : <Eye size={17} />}</button></span>
          </label>
          {!phone && <div className={`v3-st-bars is-${strength.score}`} aria-hidden="true"><i /><i /><i /><i /></div>}
          <div className="v3-st-pwrow">
            <small id="st-pw-s" className={`v3-st-hint is-s${strength.score}`} aria-live="polite">{pwErr || (strength.label ? `${strength.label} · щонайменше 10 символів` : phone ? "літери, цифри й знак ·" : "Щонайменше 10 символів: літери, цифри й знак")}</small>
            <button type="button" className="v3-st-gen" onClick={() => { setNewPw(generatePassword()); setEye2(true); setPwErr(""); }}>згенерувати</button>
          </div>
          <button type="submit" className={`v3-btn v3-btn-dark${pwSt === "busy" ? " is-busy" : ""}${pwSt === "done" ? " is-done" : ""}`} disabled={pwSt === "busy" || !online}>{pwSt === "busy" ? "Оновлюємо…" : pwSt === "done" ? <><Check size={15} strokeWidth={3} aria-hidden="true" />Оновлено</> : "Оновити пароль"}</button>
        </form>
        <div className="v3-st-ses">
          <div className="v3-st-subh"><strong>Активні сесії</strong><small>{sessions ? `${sessions.length} ${plural(sessions.length, "пристрій", "пристрої", "пристроїв")}` : "…"}</small></div>
          {!sessions ? <span className="v3-skel v3-skel-light" style={{ height: 56 }} /> : (
            <ul>
              {sessions.map((s) => { const d = deviceName(s.userAgent); return (
                <li key={s.id} className={`v3-st-sesr${s.current ? " is-cur" : ""}${out === s.id ? " is-out" : ""}`}>
                  <span className="v3-st-dev" aria-hidden="true">{d.phone ? <Smartphone size={16} /> : <Monitor size={16} />}</span>
                  <span className="v3-st-sesi"><strong>{d.name}</strong><small>{[s.ip, agoText(s.lastSeenAt || s.createdAt)].filter(Boolean).join(" · ")}</small></span>
                  {s.current ? <span className="v3-st-thisdev">{phone ? "це ви" : "Цей пристрій"}</span> : <AskButton className="v3-btn v3-st-end" label="Завершити" ask="Точно?" busy={out === s.id} onYes={() => void end(s)} />}
                </li>
              ); })}
            </ul>
          )}
          {sessions && (others > 0
            ? <AskButton className="v3-btn v3-st-allout" label={phone ? `Завершити всі інші · ${others}` : "Вийти на всіх інших пристроях"} ask={phone ? "Точно завершити всі?" : "Точно вийти на всіх?"} busy={allBusy} onYes={() => void endAll()} />
            : <span className="v3-st-onlyme"><Check size={14} strokeWidth={3} aria-hidden="true" />Ви увійшли лише на цьому пристрої</span>)}
        </div>
      </div>
    </Section>
  );
}

