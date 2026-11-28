import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Bell, Bug, Check, ChevronDown, Clock, Copy, Lock, Megaphone, MessageSquare, Monitor, Plus, Receipt, Send, Smartphone, Sparkles, Tag, TextQuote, X } from "lucide-react";
import { toast } from "sonner";
import PillTrack from "@/components/PillTrack";
import RollingNumber from "@/components/RollingNumber";
import { setTokens } from "@/lib/apiClient";
import { changePassword, endSession, fetchSessions, logoutOthers, saveSettings, type Session, type SettingsMeta, type SettingsOverview } from "@/lib/adminSettingsApi";
import { deviceName, agoText, fillTemplate, generatePassword, templateParts, TEMPLATE_VARS, type Draft, type DraftKey } from "@/lib/settingsModel";
import { fetchServerErrors, resolveServerError, type ServerError } from "@/lib/serverErrorsApi";
import type { AppSettings } from "@/types";

export type WSec = "tariffs" | "trial" | "ai" | "texts" | "alerts" | "receipt" | "templates" | "banners" | "account" | "errors";
const plural = (n: number, a: string, b: string, c: string) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };
const SEC_OF: Record<DraftKey, WSec> = {
  basicPrice: "tariffs", proPrice: "tariffs", trialEnabled: "trial", trialDays: "trial", trialPlan: "trial", trialStepDays: "trial",
  aiDailyLimit: "ai", aiStopWords: "ai", aiWordingRule: "ai", expiringDays: "alerts", churnInactiveDays: "alerts", churnLossStreak: "alerts",
  receiptSupport: "receipt", receiptThanks: "receipt", receiptPrefix: "receipt", tplExpiring: "templates", tplInactive: "templates", tplPaid: "templates", tplLapsed: "templates", bannerSpecText: "banners",
};
const TEXTS = [
  { key: "footerDisclaimer", title: "Дисклеймер у футері", where: "футер усіх сторінок", sub: "Футер усіх сторінок застосунку", max: 300 },
  { key: "addictionHelp", title: "Допомога при залежності", where: "Профіль → Відповідальна гра", sub: "Профіль → Відповідальна гра", max: 600 },
  { key: "beforeAiText", title: "Перед AI-аналізом", where: "Деталі матчу · над кнопкою «AI-аналіз»", sub: "Деталі матчу · над кнопкою «AI-аналіз»", max: 300 },
] as const;
type TextKey = (typeof TEXTS)[number]["key"];
const TPL_TABS: [DraftKey, string][] = [["tplExpiring", "Закінчується"], ["tplLapsed", "Не продовжив"], ["tplInactive", "Неактивний"], ["tplPaid", "Після оплати"]];
const FEATURES_ALL = ["Матчі й ставки", "Статистика", "AI-аналіз матчів", "Telegram-групи"];

/** – value + with a typed field */
function Step({ value, min, max, step = 1, unit, label, onChange }: { value: number; min: number; max: number; step?: number; unit?: string; label: string; onChange: (v: number) => void }) {
  const [txt, setTxt] = useState(String(value));
  useEffect(() => setTxt(String(value)), [value]);
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <span className="v3-sw-step">
      <button type="button" aria-label={`${label}: менше`} disabled={value <= min} onClick={() => onChange(clamp(value - step))}>−</button>
      <input inputMode="numeric" aria-label={label} value={txt} onChange={(e) => setTxt(e.target.value.replace(/\D/g, ""))} onBlur={() => { const v = clamp(Number(txt) || min); setTxt(String(v)); onChange(v); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
      <button type="button" aria-label={`${label}: більше`} disabled={value >= max} onClick={() => onChange(clamp(value + step))}>+</button>
      <em aria-hidden={!unit || undefined}>{unit || ""}</em>
    </span>
  );
}
const Sw = ({ on, label, onClick, fixed }: { on: boolean; label: string; onClick?: () => void; fixed?: boolean }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} aria-disabled={fixed || undefined} className={`v3-pswitch${on ? " is-on" : ""}${fixed ? " is-fixed" : ""}`} onClick={fixed ? undefined : onClick}><span /></button>
);
function Seg<T extends string | number>({ value, opts, label, onChange }: { value: T; opts: [T, string][]; label: string; onChange: (v: T) => void }) {
  return <div className="v3-sw-seg" role="group" aria-label={label}><PillTrack active={value} />{opts.map(([v, l]) => <button key={String(v)} type="button" className={value === v ? "is-on" : ""} aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}</div>;
}
const Card = ({ title, sub, children, aside, className = "" }: { title: string; sub?: ReactNode; children: ReactNode; aside?: ReactNode; className?: string }) => (
  <section className={`v3-adw-card v3-sw-card ${className}`}>
    <div className="v3-sw-ch"><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>{aside}</div>
    {children}
  </section>
);
const Row = ({ t, s, children, dim }: { t: string; s?: string; children: ReactNode; dim?: boolean }) => (
  <div className={`v3-sw-row${dim ? " is-dim" : ""}`}><span><strong>{t}</strong>{s && <small>{s}</small>}</span>{children}</div>
);

/** Light bottom bar: «● N змін · не збережено · Скасувати · Зберегти». */
export function SaveBar({ n, busy, fail, err, online, onCancel, onSave }: { n: number; busy: boolean; fail: boolean; err: string; online: boolean; onCancel: () => void; onSave: () => void }) {
  return (
    <div className={`v3-sw-bar${fail ? " is-fail" : ""}`} role="status" aria-live="polite">
      <i aria-hidden="true" />
      <span>{fail ? <b>{err || "Не вдалося зберегти"}</b> : <><b>{n} {plural(n, "зміна", "зміни", "змін")}</b> · не збережено</>}</span>
      <button type="button" className="is-dark" disabled={busy} onClick={onCancel}>Скасувати</button>
      <button type="button" className="is-green" disabled={busy || !online} onClick={onSave}>{busy ? "Зберігаємо…" : fail ? "Повторити" : "Зберегти"}</button>
    </div>
  );
}

type Props = {
  sec: WSec; setSec: (s: WSec) => void; cur: Draft; saved: Draft; set: <K extends DraftKey>(k: K, v: Draft[K]) => void; changed: DraftKey[];
  settings: AppSettings; meta: SettingsMeta; onSettings: (s: AppSettings, m: SettingsMeta) => void; ov: SettingsOverview | null; online: boolean; me: string; owner: boolean; lastIn: string;
  bar: ReactNode;
};

export default function SettingsWeb(p: Props) {
  const { sec, setSec, cur, saved, set, changed, settings, ov, online } = p;
  const [errN, setErrN] = useState<number | null>(null);
  const [editPlan, setEditPlan] = useState<"basic" | "pro" | null>(null);
  const [text, setText] = useState<TextKey | null>(null);
  useEffect(() => { fetchServerErrors().then((x) => setErrN(x.length)).catch(() => {}); const on = () => fetchServerErrors().then((x) => setErrN(x.length)).catch(() => {}); window.addEventListener("v3-server-errors", on); return () => window.removeEventListener("v3-server-errors", on); }, []);
  useEffect(() => { setText(null); setEditPlan(null); }, [sec]);
  const nTexts = TEXTS.length + 1;
  const MENU: { k: WSec; l: string; s: string; icon: typeof Tag }[] = [
    { k: "tariffs", l: "Тарифи", s: "ціни й функції планів", icon: Tag },
    { k: "trial", l: "Пробний період", s: cur.trialEnabled ? `${cur.trialDays} ${plural(cur.trialDays, "день", "дні", "днів")} · ${cur.trialPlan === "basic" ? "Базова" : "Pro"}` : "вимкнено", icon: Clock },
    { k: "ai", l: "AI-аналіз", s: `${cur.aiDailyLimit} на день · заборонені слова`, icon: Sparkles },
    { k: "texts", l: "Тексти й дисклеймери", s: `${nTexts} ${plural(nTexts, "текст", "тексти", "текстів")}`, icon: TextQuote },
    { k: "alerts", l: "Попередження", s: "пороги ризиків", icon: Bell },
    { k: "receipt", l: "Чек оплати", s: "контакт і фраза", icon: Receipt },
    { k: "templates", l: "Шаблони повідомлень", s: `${TPL_TABS.length} шаблони`, icon: MessageSquare },
    { k: "banners", l: "Вимоги до банера", s: "текст для рекламодавців", icon: Megaphone },
    { k: "account", l: "Мій акаунт", s: "пароль і сесії", icon: Lock },
    { k: "errors", l: "Помилки сервера", s: errN == null ? "за 30 днів" : errN ? `${errN} за 30 днів` : "помилок немає", icon: Bug },
  ];

  // ───── sections ─────
  const tariffs = (() => {
    const plan = (k: "basic" | "pro") => {
      const key = k === "basic" ? "basicPrice" : "proPrice", price = cur[key], was = saved[key], feats = (k === "basic" ? settings.basicFeatures : settings.proFeatures) || (k === "basic" ? FEATURES_ALL.slice(0, 2) : FEATURES_ALL);
      const people = ov ? ov.plans[k] : null, ed = editPlan === k;
      return (
        <section className={`v3-adw-card v3-sw-plan${ed ? " is-edit" : ""}`}>
          <div className="v3-sw-plan-h"><h2>{k === "basic" ? "Базова" : "Pro"}</h2>{people != null && <span className="v3-sw-pill">{people} {plural(people, "людина", "людини", "людей")}</span>}
            <button type="button" className={`v3-uwb${ed ? " is-green" : ""}`} onClick={() => setEditPlan(ed ? null : k)}>{ed ? "Готово" : "Редагувати"}</button></div>
          <div className="v3-sw-price"><b><RollingNumber key={price} text={`${price.toLocaleString("uk-UA")} ₴`} /></b><span>/ {settings.subscriptionDays || 30} днів</span>{price !== was && <s>було {was} ₴</s>}</div>
          {ed && <div className="v3-sw-pedit"><Step label={`Ціна ${k === "basic" ? "Базової" : "Pro"}`} value={price} min={0} max={10000} step={50} unit="₴" onChange={(v) => set(key, v)} /><small>крок 50 ₴ · від 0 до 10 000 ₴</small></div>}
          <ul>{FEATURES_ALL.map((f) => { const on = f.startsWith("AI") ? feats.some((x) => /ai|аі|аналіз/i.test(x)) : f.startsWith("Telegram") ? feats.some((x) => /telegram/i.test(x)) : true; return <li key={f} className={on ? "" : "is-off"}><i aria-hidden="true">{on ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}</i>{f}{on && f.startsWith("AI") ? ` · ${cur.aiDailyLimit} на день` : ""}</li>; })}</ul>
        </section>
      );
    };
    const ch = cur.proPrice !== saved.proPrice ? "pro" : cur.basicPrice !== saved.basicPrice ? "basic" : null;
    return <>
      <div className="v3-sw-plans">{plan("basic")}{plan("pro")}</div>
      <div className="v3-adw-warn v3-sw-warnl"><span className="v3-sw-ex" aria-hidden="true">!</span>{ch && ov ? `${ov.plans[ch]} ${plural(ov.plans[ch], "людина", "людини", "людей")} на ${ch === "pro" ? "Pro" : "Базовій"} доживуть до кінця за ${saved[ch === "pro" ? "proPrice" : "basicPrice"]} ₴. Нова ціна ${cur[ch === "pro" ? "proPrice" : "basicPrice"]} ₴ — з наступної оплати.` : "Нова ціна — для нових оплат. Поточні підписки доживають до кінця за старою ціною."}</div>
    </>;
  })();

  const trial = (
    <Card title="Пробний період" sub={ov ? (ov.trial.now ? `зараз на пробному: ${ov.trial.now} ${plural(ov.trial.now, "людина", "людини", "людей")}` : "зараз ніхто не на пробному") : ""}>
      <Row t="Пробний період" s="новий користувач отримує доступ одразу після реєстрації"><Sw on={cur.trialEnabled} label="Пробний період" onClick={() => set("trialEnabled", !cur.trialEnabled)} /></Row>
      <Row t="Тривалість" s="скільки днів діє пробний" dim={!cur.trialEnabled}><Step label="Тривалість пробного" value={cur.trialDays} min={1} max={30} unit={plural(cur.trialDays, "день", "дні", "днів")} onChange={(v) => set("trialDays", v)} /></Row>
      <Row t="План під час пробного" s="які функції відкриті" dim={!cur.trialEnabled}><Seg label="План під час пробного" value={cur.trialPlan === "basic" ? "basic" : "pro"} opts={[["basic", "Базова"], ["pro", "Pro"]]} onChange={(v) => set("trialPlan", v)} /></Row>
      <Row t="Один пробний на людину" s="перевіряємо за Telegram"><Sw on label="Один пробний на людину" fixed /></Row>
      <Row t="Крок «+N днів»" s="кнопка в картці користувача й на дашборді"><Seg label="Крок продовження" value={cur.trialStepDays} opts={[[7, "7 днів"], [14, "14 днів"], [30, "30 днів"]]} onChange={(v) => set("trialStepDays", v)} /></Row>
    </Card>
  );

  const [word, setWord] = useState<string | null>(null);
  const addWord = () => { const w = (word || "").trim().toLowerCase(); if (w && !cur.aiStopWords.includes(w)) set("aiStopWords", [...cur.aiStopWords, w]); setWord(null); };
  const dom = new Date().getDate();
  const ai = (
    <div className="v3-sw-two">
      <Card title="AI-аналіз" sub="доступно лише на Pro">
        <Row t="Ліміт для Pro" s="аналізів на день на людину · скидається о 00:00 за Києвом"><Step label="Ліміт AI на день" value={cur.aiDailyLimit} min={1} max={50} onChange={(v) => set("aiDailyLimit", v)} /></Row>
        <div className="v3-sw-row is-col"><span><strong>Заборонені слова</strong><small>Відповідь із ними перепишеться без них</small></span>
          <div className="v3-sw-words">
            {cur.aiStopWords.map((w) => <span key={w}>{w}<button type="button" aria-label={`Прибрати «${w}»`} onClick={() => set("aiStopWords", cur.aiStopWords.filter((x) => x !== w))}><X size={11} /></button></span>)}
            {word === null ? <button type="button" className="is-add" onClick={() => setWord("")}><Plus size={12} aria-hidden="true" />слово</button>
              : <input autoFocus className="is-add" aria-label="Нове слово" value={word} maxLength={40} onChange={(e) => setWord(e.target.value)} onBlur={addWord} onKeyDown={(e) => { if (e.key === "Enter") addWord(); if (e.key === "Escape") setWord(null); }} />}
          </div>
        </div>
        <div className="v3-sw-row is-col"><span><strong>Правило формулювань</strong><small>Як AI говорить про прогноз</small></span>
          <textarea className="v3-sw-ta" rows={2} maxLength={300} value={cur.aiWordingRule} onChange={(e) => set("aiWordingRule", e.target.value)} /></div>
      </Card>
      <Card title="Використання" className="is-side">
        <dl className="v3-adw-dl">
          <div><dt>Сьогодні</dt><dd>{ov ? `${ov.ai.today} ${plural(ov.ai.today, "аналіз", "аналізи", "аналізів")}` : "—"}</dd></div>
          <div><dt>Сьогодні коштує</dt><dd>{ov ? `≈ ${Math.round(ov.ai.todayUah)} ₴` : "—"}</dd></div>
          <div><dt>{new Date().toLocaleDateString("uk-UA", { month: "long" }).replace(/^./, (c) => c.toUpperCase())}</dt><dd>{ov ? `≈ ${Math.round(ov.ai.monthUah)} ₴` : "—"}</dd></div>
          <div><dt>Середньо на день</dt><dd>{ov ? `${Math.round(ov.ai.month / Math.max(1, dom))} ${plural(Math.round(ov.ai.month / Math.max(1, dom)), "аналіз", "аналізи", "аналізів")}` : "—"}</dd></div>
        </dl>
      </Card>
    </div>
  );

  const texts = text ? <TextEdit k={text} settings={settings} online={online} onDone={(s, m) => { p.onSettings(s, m); setText(null); }} onBack={() => setText(null)} /> : (
    <Card title="Тексти й дисклеймери" sub="Змінюються в застосунку без релізу. Кожна зміна — у журналі дій.">
      {TEXTS.map((t) => <div key={t.key} className="v3-sw-row is-text"><span><strong>{t.title}</strong><small>{t.where}</small><em>{settings[t.key] || "—"}</em></span><button type="button" className="v3-uwb" onClick={() => setText(t.key)}>Редагувати</button></div>)}
      <div className="v3-sw-row"><span><strong>Мітка «Реклама · 21+»</strong><small>на кожному банері · вимкнути не можна</small></span><span className="v3-uwt is-blue">обов’язкова</span></div>
    </Card>
  );

  const alerts = (
    <div className="v3-sw-two">
      <Card title="Попередження й ризики" sub="Коли підписка потрапляє в «Потребує уваги», а користувач — у «Ризик відтоку».">
        <Row t="Підписка закінчується за" s="блок «Потребує уваги» на дашборді"><Step label="Підписка закінчується за" value={cur.expiringDays} min={1} max={30} unit="дн." onChange={(v) => set("expiringDays", v)} /></Row>
        <Row t="Неактивний після" s="без нових ставок → «Ризик відтоку»"><Step label="Неактивний після" value={cur.churnInactiveDays} min={3} max={60} unit="дн." onChange={(v) => set("churnInactiveDays", v)} /></Row>
        <Row t="Серія програшів від" s="позначка в «Ставках»"><Step label="Серія програшів від" value={cur.churnLossStreak} min={2} max={20} onChange={(v) => set("churnLossStreak", v)} /></Row>
      </Card>
      <Card title="Зараз під правила" sub="з поточними значеннями" className="is-side">
        <dl className="v3-adw-dl v3-sw-big">
          <div><dt>Закінчуються</dt><dd>{ov ? <RollingNumber key={`e${ov.alerts.expiring}`} text={String(ov.alerts.expiring)} /> : "—"}</dd></div>
          <div><dt>Неактивні</dt><dd>{ov ? <RollingNumber key={`i${ov.alerts.inactive}`} text={String(ov.alerts.inactive)} /> : "—"}</dd></div>
          <div><dt>Серія програшів</dt><dd>{ov ? <RollingNumber key={`l${ov.alerts.lossStreak}`} text={String(ov.alerts.lossStreak)} /> : "—"}</dd></div>
        </dl>
      </Card>
    </div>
  );

  const hl = (on: boolean, v: string) => on ? <mark>{v}</mark> : v;
  const receipt = (
    <div className="v3-sw-two">
      <Card title="Чек оплати" sub="Що бачить користувач на зображенні чека після запису оплати.">
        <div className="v3-uwm-f"><label htmlFor="sw-rs">Telegram підтримки</label><input id="sw-rs" value={cur.receiptSupport} maxLength={33} onChange={(e) => set("receiptSupport", e.target.value)} /></div>
        <div className="v3-uwm-f"><label htmlFor="sw-rt">Фраза подяки</label><input id="sw-rt" value={cur.receiptThanks} maxLength={80} onChange={(e) => set("receiptThanks", e.target.value)} /></div>
        <div className="v3-uwm-f v3-sw-short"><label htmlFor="sw-rp">Префікс номера чека</label><input id="sw-rp" value={cur.receiptPrefix} maxLength={6} onChange={(e) => set("receiptPrefix", e.target.value.toUpperCase())} /></div>
      </Card>
      <section className="v3-sw-prev">
        <span className="v3-adw-cap">Прев’ю · жовтим те, що змінюється</span>
        <div className="v3-sw-receipt">
          <b>MatchIQ</b>
          <span>Чек № {hl(cur.receiptPrefix !== saved.receiptPrefix || true, cur.receiptPrefix || "MIQ")}-{ov?.receiptNext ?? 1}</span>
          <small>{new Date().toLocaleDateString("uk-UA")}</small>
          <div><span>СУМА</span><b>600,00 грн</b></div>
          <small>Підтримка з питань оплати:</small>
          <span><b>Telegram:</b> {hl(true, `@${cur.receiptSupport.replace(/^@/, "")}`)}</span>
          <span>{hl(true, cur.receiptThanks)}</span>
        </div>
      </section>
    </div>
  );

  const [tpl, setTpl] = useState<DraftKey>("tplExpiring");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const tplText = String(cur[tpl] ?? "");
  const insVar = (v: string) => { const el = taRef.current, s = el?.selectionStart ?? tplText.length, e = el?.selectionEnd ?? tplText.length; set(tpl, (tplText.slice(0, s) + v + tplText.slice(e)) as never); requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(s + v.length, s + v.length); }); };
  const sample = fillTemplate(tplText, { login: "Gerrry", endDate: "24 лист.", plan: "Пробний", amount: "300 ₴", idleDays: 9 });
  const templates = (
    <div className="v3-sw-two">
      <Card title="Шаблони повідомлень" sub="Текст для кнопки «Написати» на дашборді, у ризиках і після оплати.">
        <Seg label="Шаблон" value={tpl} opts={TPL_TABS} onChange={setTpl} />
        <div className="v3-sw-tplwrap">
          <div className="v3-sw-tplhl" aria-hidden="true">{templateParts(tplText).map((x, i) => x.v ? <mark key={i} className={x.bad ? "is-bad" : ""}>{x.t}</mark> : <span key={i}>{x.t}</span>)}{"\n"}</div>
          <textarea ref={taRef} className="v3-sw-tpl" rows={3} maxLength={1000} aria-label="Текст шаблону" value={tplText} onChange={(e) => set(tpl, e.target.value as never)} spellCheck={false} />
        </div>
        <div className="v3-sw-vars"><span>Вставити:</span>{TEMPLATE_VARS.slice(0, 4).map((v) => <button key={v} type="button" onClick={() => insVar(v)}>{v}</button>)}</div>
      </Card>
      <section className="v3-sw-prev">
        <span className="v3-adw-cap">Прев’ю для @Gerrry · Telegram</span>
        <div className="v3-sw-tg">{sample || "…"}</div>
        <small>Відкриється в Telegram з цим текстом — надсилаєте ви.</small>
      </section>
    </div>
  );

  const [copied, setCopied] = useState(false);
  const banners = (
    <Card title="Вимоги до банера" sub="Текст для рекламодавців — копіюється одним кліком на сторінці «Реклама → Банери».">
      <textarea className="v3-sw-ta is-big" rows={5} maxLength={2000} value={cur.bannerSpecText} onChange={(e) => set("bannerSpecText", e.target.value)} placeholder="Розмір, формат, куди веде посилання, контакт…" />
      <div className="v3-sw-tafoot"><small>{cur.bannerSpecText.length} / 2000</small>
        <button type="button" className="v3-uwb" onClick={async () => { try { await navigator.clipboard.writeText(cur.bannerSpecText); setCopied(true); setTimeout(() => setCopied(false), 1600); toast.success("Скопійовано"); } catch { toast.error("Не вдалося скопіювати"); } }}>{copied ? <><Check size={14} aria-hidden="true" />Скопійовано</> : <><Copy size={14} aria-hidden="true" />Скопіювати</>}</button></div>
    </Card>
  );

  const body = sec === "tariffs" ? tariffs : sec === "trial" ? trial : sec === "ai" ? ai : sec === "texts" ? texts : sec === "alerts" ? alerts : sec === "receipt" ? receipt : sec === "templates" ? templates : sec === "banners" ? banners
    : sec === "account" ? <Account me={p.me} owner={p.owner} lastIn={p.lastIn} online={online} /> : <Errors onCount={setErrN} />;

  return (
    <div className="v3-sw-layout">
      <nav className="v3-adw-card v3-sw-menu" aria-label="Розділи налаштувань">
        {MENU.map((m) => { const on = sec === m.k, dirty = changed.some((k) => SEC_OF[k] === m.k); return (
          <button key={m.k} type="button" className={on ? "is-on" : ""} aria-current={on ? "page" : undefined} onClick={() => setSec(m.k)}>
            <i aria-hidden="true"><m.icon size={15} /></i><span><b>{m.l}</b><small>{m.s}</small></span>
            {dirty ? <em className="v3-sw-dirty" aria-label="є незбережені зміни" /> : m.k === "errors" && errN ? <em className="v3-sw-cnt">{errN}</em> : null}
          </button>
        ); })}
      </nav>
      <div key={sec} className="v3-sw-main">{body}</div>
      {p.bar}
    </div>
  );
}

// ───── one text with preview ─────
function TextEdit({ k, settings, online, onDone, onBack }: { k: TextKey; settings: AppSettings; online: boolean; onDone: (s: AppSettings, m: SettingsMeta) => void; onBack: () => void }) {
  const t = TEXTS.find((x) => x.key === k)!;
  const orig = settings[k] || "";
  const [val, setVal] = useState(orig);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState("");
  const dirty = val !== orig;
  async function save() {
    if (!val.trim()) { toast.error("Текст не може бути порожнім", { description: `${t.title} — поверніть текст` }); setFail("Текст не може бути порожнім"); return; }
    setBusy(true); setFail("");
    try { const r = await saveSettings({ [k]: val.trim() }); toast.success("Текст збережено", { description: "У застосунку зміниться без релізу · записано в журнал дій" }); onDone(r.settings, r.meta); }
    catch (e) { setFail((e as Error).message || "Не вдалося зберегти"); }
    setBusy(false);
  }
  return (
    <div className="v3-sw-two">
      <Card title={t.title} sub={t.sub} aside={<button type="button" className="v3-uwb" onClick={onBack}>До списку</button>}>
        <textarea autoFocus className="v3-sw-ta is-on" rows={4} maxLength={t.max} value={val} aria-label={t.title} onChange={(e) => setVal(e.target.value)} />
        <small className="v3-sw-cnt-r">{val.length} / {t.max}</small>
        <small className="v3-sw-hint">Без обіцянок виграшу. Зміна з’явиться в застосунку протягом хвилини.</small>
      </Card>
      <section className="v3-sw-prev">
        <span className="v3-adw-cap">Так побачать у застосунку</span>
        {k === "beforeAiText" ? <div className="v3-sw-app"><b>AI-аналіз · NAVI — G2</b><p className="is-box">{val || "…"}</p><span className="v3-sw-appbtn">Отримати аналіз · 4 з 5</span></div>
          : k === "footerDisclaimer" ? <div className="v3-sw-app"><i className="v3-sw-appblk" /><p className="is-foot">{val || "…"}</p></div>
          : <div className="v3-sw-app"><b>Відповідальна гра</b><p>{val || "…"}</p></div>}
      </section>
      {(dirty || fail) && <SaveBar n={1} busy={busy} fail={!!fail} err={fail} online={online} onCancel={() => { setVal(orig); setFail(""); }} onSave={save} />}
    </div>
  );
}

// ───── account ─────
function Account({ me, owner, lastIn, online }: { me: string; owner: boolean; lastIn: string; online: boolean }) {
  const [old, setOld] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<Session[] | null>(null);
  const [ending, setEnding] = useState<string | null>(null);
  const load = useCallback(() => { fetchSessions().then(setList).catch(() => setList([])); }, []);
  useEffect(() => { load(); }, [load]);
  async function change() {
    if (!old) { toast.error("Введіть поточний пароль"); return; }
    if (pw.length < 10 || !/[a-zA-Zа-яА-Я]/.test(pw) || !/\d/.test(pw)) { toast.error("Пароль надто простий", { description: "Щонайменше 10 символів: літери, цифри й знак" }); return; }
    setBusy(true);
    try {
      await changePassword(old, pw); setOld(""); setPw("");
      toast.success("Пароль оновлено", { description: "Інші пристрої лишились у системі", action: { label: "Вийти на інших", onClick: () => void endAll() } });
    } catch (e) { toast.error("Не вдалося змінити пароль", { description: (e as Error).message }); }
    setBusy(false);
  }
  async function endOne(s: Session) {
    setEnding(s.id);
    try { await endSession(s.id); setList((x) => (x || []).filter((y) => y.id !== s.id)); toast.success("Сесію завершено", { description: deviceName(s.userAgent).name }); }
    catch (e) { toast.error("Не вдалося завершити сесію", { description: (e as Error).message }); }
    setEnding(null);
  }
  async function endAll() {
    setEnding("all");
    try { const r = await logoutOthers(); if (r.token && r.refreshToken) setTokens(r.token, r.refreshToken); const k = r.revoked ?? 0; toast.success("Інші сесії завершено", { description: `${k} ${plural(k, "сесію", "сесії", "сесій")} закрито` }); load(); }
    catch (e) { toast.error("Не вдалося завершити сесії", { description: (e as Error).message }); }
    setEnding(null);
  }
  const others = (list || []).filter((s) => !s.current).length;
  const shown = (list || []).slice().sort((a, b) => Number(b.current) - Number(a.current) || b.lastSeenAt.localeCompare(a.lastSeenAt)).slice(0, 6);
  return (
    <div className="v3-sw-two is-even">
      <Card title="Змінити пароль" sub={[`@${me}`, owner ? "Овнер" : "Адміністратор", lastIn].filter(Boolean).join(" · ")}>
        <div className="v3-uwm-f"><label htmlFor="sw-old">Поточний пароль</label><input id="sw-old" type="password" autoComplete="current-password" value={old} onChange={(e) => setOld(e.target.value)} placeholder="••••••••" /></div>
        <div className="v3-uwm-f"><label htmlFor="sw-new">Новий пароль</label><input id="sw-new" type="text" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Щонайменше 10 символів" />
          <small>літери, цифри й знак · <button type="button" className="v3-sw-link" onClick={() => setPw(generatePassword(14))}>згенерувати</button></small></div>
        <div><button type="button" className="v3-uwb is-green" disabled={busy || !online} onClick={change}>{busy ? "Оновлюємо…" : "Оновити пароль"}</button></div>
      </Card>
      <Card title="Активні сесії" sub={list ? `${list.length} ${plural(list.length, "пристрій", "пристрої", "пристроїв")}` : "завантажуємо…"}>
        <div className="v3-sw-sess">
          {shown.map((s) => { const d = deviceName(s.userAgent); return (
            <div key={s.id}><i aria-hidden="true">{d.phone ? <Smartphone size={15} /> : <Monitor size={15} />}</i><span><b>{d.name}</b><small>{s.current ? "зараз" : agoText(s.lastSeenAt)}</small></span>
              {s.current ? <span className="v3-uwt is-green">це ви</span> : <button type="button" className="v3-uwb" disabled={!online || ending !== null} onClick={() => endOne(s)}>{ending === s.id ? "…" : "Завершити"}</button>}</div>
          ); })}
        </div>
        {others > 0 && <div><button type="button" className="v3-uwb is-softred" disabled={!online || ending !== null} onClick={endAll}>{ending === "all" ? "Завершуємо…" : `Завершити всі інші · ${others}`}</button></div>}
      </Card>
    </div>
  );
}

// ───── server errors ─────
const ERR_SRC: Record<ServerError["source"], [string, string]> = { api: ["API", "is-blue"], process: ["процес", "is-violet"], console: ["лог", "is-grey"] };
const ERR_SEV = { critical: ["Критично", "is-red"], warning: ["Увага", "is-amber"], info: ["Інфо", "is-blue"] } as const;
const errAgo = (iso: string) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? "щойно" : m < 60 ? `${m} хв тому` : m < 1440 ? `${Math.round(m / 60)} год тому` : `${Math.round(m / 1440)} дн тому`; };
const dt = (iso: string) => new Date(iso).toLocaleString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
function Errors({ onCount }: { onCount: (n: number) => void }) {
  const [list, setList] = useState<ServerError[] | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | "all" | null>(null);
  const [ask, setAsk] = useState(false);
  const load = useCallback(() => { setErr(""); fetchServerErrors().then((x) => { setList(x); setOpen(x[0]?.id ?? null); }).catch((e) => { setErr((e as Error).message || "Сервер не відповів"); setList([]); }); }, []);
  useEffect(() => { load(); }, [load]);
  async function resolve(id: number | "all") {
    if (id === "all" && !ask) { setAsk(true); setTimeout(() => setAsk(false), 3000); return; }
    setBusy(id);
    try { await resolveServerError(id); setList((xs) => { const n = id === "all" ? [] : (xs || []).filter((x) => x.id !== id); onCount(n.length); return n; }); window.dispatchEvent(new Event("v3-server-errors")); toast.success(id === "all" ? "Список очищено" : "Позначено як виправлене"); }
    catch (e) { toast.error("Не вдалося", { description: (e as Error).message }); }
    setBusy(null); setAsk(false);
  }
  async function share(e: ServerError) {
    const text = [`MatchIQ · помилка сервера (${ERR_SRC[e.source][0]}${e.status ? ` · ${e.status}` : ""})`, e.message, e.hint || "", e.path ? `Маршрут: ${e.path}` : "", e.detail || ""].filter(Boolean).join("\n");
    try { if (navigator.share) { await navigator.share({ title: "Помилка сервера", text }); return; } } catch (x) { if ((x as Error)?.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(text); toast.success("Скопійовано"); } catch { toast.error("Не вдалося скопіювати"); }
  }
  const total = (list || []).reduce((a, e) => a + e.count, 0);
  return (
    <Card title="Помилки сервера" sub="Що падало на бекенді за 30 днів. Однакові помилки зведені в одну з лічильником."
      aside={list && list.length > 0 ? <button type="button" className={`v3-uwb ${ask ? "is-red" : "is-softred"}`} disabled={busy !== null} onClick={() => resolve("all")}>{busy === "all" ? "Очищаємо…" : ask ? `Точно очистити всі ${list.length}?` : "Очистити все"}</button> : undefined}>
      {list === null ? <div className="v3-adw-skel v3-sw-skel">{[0, 1, 2].map((i) => <i key={i} style={{ height: 56 }} />)}</div>
        : err ? <div className="v3-uw-empty is-err" role="alert"><span>!</span><strong>Не вдалося завантажити</strong><p>{err}</p><div><button type="button" className="v3-uwb is-green" onClick={load}>Спробувати ще раз</button></div></div>
        : !list.length ? <div className="v3-adw-empty v3-sw-ezero"><span aria-hidden="true"><Check size={20} /></span><strong>Помилок немає</strong><p>Бекенд працює чисто — за 30 днів нічого не падало.</p></div>
        : <>
          <p className="v3-sw-esum"><b>{list.length} {plural(list.length, "помилка", "помилки", "помилок")}</b> · {total} {plural(total, "раз", "рази", "разів")} за 30 днів</p>
          <div className="v3-sw-errs">{list.map((e, i) => { const on = open === e.id; return (
            <div key={e.id} className={`v3-sw-err${on ? " is-open" : ""}`} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
              <button type="button" className="v3-sw-errh" aria-expanded={on} onClick={() => setOpen(on ? null : e.id)}>
                <span className="v3-sw-errl1"><span className={`v3-uwt ${ERR_SRC[e.source][1]}`}>{ERR_SRC[e.source][0]}</span><strong>{e.message}</strong></span>
                <span className="v3-sw-errr"><small>{errAgo(e.lastAt)}{e.path ? ` · ${e.path}` : ""}</small>{e.count > 1 && <span className="v3-sw-pill">×{e.count}</span>}{e.status ? <span className="v3-sw-pill">{e.status}</span> : null}<ChevronDown size={15} className="v3-sw-chev" aria-hidden="true" /></span>
                {e.severity && <span className="v3-sw-errl2"><span className={`v3-uwt ${ERR_SEV[e.severity][1]}`}>{ERR_SEV[e.severity][0]}</span>{e.hint}</span>}
              </button>
              {on && <div className="v3-sw-errd">
                {e.detail && <pre>{e.detail}</pre>}
                <dl><div><dt>Уперше</dt><dd>{dt(e.firstAt)}</dd></div><div><dt>Востаннє</dt><dd>{dt(e.lastAt)}</dd></div>{e.status ? <div><dt>Статус-код</dt><dd>HTTP {e.status}</dd></div> : null}{e.path && <div><dt>Маршрут</dt><dd>{e.path}</dd></div>}</dl>
                <div className="v3-sw-errb"><button type="button" className="v3-uwb" onClick={() => share(e)}><Send size={14} aria-hidden="true" />Надіслати</button><button type="button" className="v3-uwb is-green" disabled={busy !== null} onClick={() => resolve(e.id)}>{busy === e.id ? "…" : "Виправлено"}</button></div>
              </div>}
            </div>
          ); })}</div>
        </>}
    </Card>
  );
}
