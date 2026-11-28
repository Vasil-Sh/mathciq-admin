import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Calendar, Check, ChevronDown, Download, History, Search, User, X } from "lucide-react";
import { toast } from "sonner";
import { api, setTokens } from "@/lib/apiClient";
import { useAuth } from "@/contexts/AuthContext";
import { plural } from "@/lib/dashboardInsights";
import { logoutOthers } from "@/lib/adminSettingsApi";
import { DateField } from "@/components/ui/date-field";
import { RESULT_UI, dayKey, dayLabel, describe, type Change, type Entry, type View } from "@/lib/auditModel";
import { WModal } from "@/components/ads/web/AdsWebShared";

type Summary = { today: number; week: number; failed7: number; security7: number };
type Actor = { name: string; telegram: string | null; week: number; total: number };
type Resp = { entries: Entry[]; hasMore: boolean; total: number; counts?: Record<string, number>; summary?: Summary; actors?: Actor[] };

const LIMIT = 30;
/** «Помилки» is not a category — it filters by result */
const CATS: [string, string][] = [["all", "Усі"], ["users", "Користувачі"], ["payments", "Оплати"], ["banners", "Банери"], ["ads", "Реклама"], ["settings", "Налаштування"], ["security", "Безпека"], ["failed", "Помилки"]];
const CAT_TAG: Record<string, [string, string]> = { users: ["Користувачі", "is-blue"], payments: ["Оплати", "is-green"], banners: ["Банери", "is-violet"], ads: ["Реклама", "is-violet"], settings: ["Налаштування", "is-grey"], security: ["Безпека", "is-amber"] };
const PERIODS: [string, string][] = [["all", "Увесь час"], ["today", "Сьогодні"], ["7", "7 днів"], ["30", "30 днів"], ["custom", "Свій період"]];
const kyiv = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
function datesFor(range: string, custom: { from: string; to: string }) {
  const today = kyiv(new Date());
  if (range === "today") return { from: today, to: today };
  if (range === "7" || range === "30") return { from: kyiv(new Date(Date.now() - (Number(range) - 1) * 864e5)), to: today };
  if (range === "custom") return { from: custom.from, to: custom.to };
  return { from: "", to: "" };
}
const hm = (iso: string) => new Date(iso).toLocaleTimeString("uk-UA", { timeZone: "Europe/Kyiv", hour: "2-digit", minute: "2-digit" });
const cap = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s;
const whenText = (iso: string) => { const k = kyiv(new Date(iso)), t = kyiv(new Date()), y = kyiv(new Date(Date.now() - 864e5)); return `${k === t ? "сьогодні" : k === y ? "вчора" : dayLabel(iso).split(" · ").pop()} о ${hm(iso)}`; };
const initials = (n: string) => n.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase() || "?";
const short = (iso: string) => new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv", day: "numeric", month: "short" }).format(new Date(`${iso}T12:00:00Z`));

function usePop() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  return { open, setOpen, ref };
}
const Chg = ({ c }: { c: Change }) => <span className="v3-aw-chg">{c.k}{" "}{c.from !== "—" ? <s>{c.from}</s> : <i>—</i>} → <b>{c.to}</b></span>;

export default function AuditWeb() {
  const [params, setParams] = useSearchParams();
  const { user: me } = useAuth();
  const owner = !!me?.isOwner;
  const userId = params.get("userId") || "", history = params.get("history") || "", histName = params.get("username") || "";
  const [draft, setDraft] = useState(params.get("q") || "");
  const [q, setQ] = useState(params.get("q") || "");
  const [cat, setCat] = useState("all");
  const [actor, setActor] = useState(params.get("actor") || "");
  const [range, setRange] = useState("all");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Resp | null>(null);
  const [rows, setRows] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [rev, setRev] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const per = usePop(), aut = usePop();
  const [dateAsk, setDateAsk] = useState(false);
  const [dDraft, setDDraft] = useState({ from: "", to: "" });
  const [exOpen, setExOpen] = useState(false);
  const [exRange, setExRange] = useState("30");
  const [exCustom, setExCustom] = useState({ from: "", to: "" });
  const [exCount, setExCount] = useState<number | null>(null);
  const [cleanCount, setCleanCount] = useState<number | null>(null);
  const [cleanAsk, setCleanAsk] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [endBusy, setEndBusy] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => { const t = setTimeout(() => { setQ(draft.trim()); setPage(1); }, 350); return () => clearTimeout(t); }, [draft]);
  const dates = useMemo(() => datesFor(range, custom), [range, custom]);
  const qsOf = (o: { cat: string; actor: string; from: string; to: string }) => {
    const isFail = o.cat === "failed";
    return `category=${isFail ? "all" : o.cat}&status=${isFail ? "failed" : "all"}&q=${encodeURIComponent(q)}&from=${o.from}&to=${o.to}&userId=${encodeURIComponent(userId)}&history=${encodeURIComponent(history)}&actor=${encodeURIComponent(o.actor)}`;
  };
  const qs = qsOf({ cat, actor, ...dates });
  useEffect(() => { setPage(1); }, [qs]);
  useEffect(() => {
    let live = true; setLoading(true); setError("");
    api.get<Resp>(`/admin/audit?page=${page}&limit=${LIMIT}&summary=1&${qs}`)
      .then((r) => { if (!live) return; setData(r); setRows((x) => (page === 1 ? r.entries : [...x, ...r.entries.filter((e) => !x.some((y) => y.id === e.id))])); })
      .catch((e) => { if (live) setError((e as Error).message || "Сервер не відповідає"); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [qs, page, rev]);
  // older entries load as the list scrolls to its end
  useEffect(() => {
    const el = sentinel.current; if (!el || !data?.hasMore) return;
    const io = new IntersectionObserver((xs) => { if (xs[0].isIntersecting && !loading) setPage((p) => p + 1); }, { rootMargin: "200px" });
    io.observe(el); return () => io.disconnect();
  }, [data?.hasMore, loading, rows.length]);
  useEffect(() => { if (rows.length && !rows.some((e) => e.id === sel)) setSel(rows[0].id); if (!rows.length) setSel(null); }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const exQs = qsOf({ cat, actor, ...datesFor(exRange, exCustom) });
  useEffect(() => {
    if (!exOpen) return;
    let live = true; setExCount(null); setCleanAsk(false);
    api.get<Resp>(`/admin/audit?page=1&limit=1&${exQs}`).then((r) => { if (live) setExCount(r.total); }).catch(() => {});
    if (owner) api.get<{ count: number }>("/admin/audit/cleanup?days=180").then((r) => { if (live) setCleanCount(r.count); }).catch(() => {});
    return () => { live = false; };
  }, [exOpen, exQs]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = data?.counts || {};
  const allCount = Object.values(counts).reduce((a, b) => a + b, 0);
  const sum = data?.summary, total = data?.total ?? 0;
  const filtered = !!(q || cat !== "all" || actor || range !== "all");
  const reset = () => { setDraft(""); setQ(""); setCat("all"); setActor(""); setRange("all"); toast.info("Фільтри скинуто", { description: `Показано всі ${allCount || ""} записів`.replace("  ", " ") }); };
  const days = useMemo(() => { const m: { key: string; label: string; items: Entry[] }[] = []; for (const e of rows) { const k = dayKey(e.created_at); const last = m[m.length - 1]; if (last && last.key === k) last.items.push(e); else m.push({ key: k, label: dayLabel(e.created_at), items: [e] }); } return m; }, [rows]);
  const cur = rows.find((e) => e.id === sel) || null;
  const curV: View | null = cur ? describe(cur) : null;

  async function exportCsv() {
    const d = datesFor(exRange, exCustom), n = exCount ?? 0;
    setExOpen(false);
    const label = exRange === "all" ? "увесь час" : exRange === "custom" ? `${d.from} — ${d.to}` : `${exRange} днів`;
    toast.info("Експорт почався", { description: `${n.toLocaleString("uk-UA")} ${plural(n, "запис", "записи", "записів")} · за ${label}` });
    try {
      const blob = await api.download(`/admin/audit/export?${exQs}`);
      const name = `zhurnal-${exRange === "all" ? "use" : exRange === "custom" ? `${d.from}_${d.to}` : `${exRange}-dniv`}.csv`;
      const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
      toast.success("Файл готовий", { description: name });
    } catch (e) { toast.error("Експорт не вдався", { description: (e as Error).message }); }
  }
  async function cleanup() {
    if (!cleanAsk) { setCleanAsk(true); return; }
    setCleaning(true);
    try {
      const r = await api.delete<{ removed?: number }>("/admin/audit/cleanup?days=180");
      toast.success("Старі записи очищено", { description: `Видалено ${(r.removed ?? 0).toLocaleString("uk-UA")} ${plural(r.removed ?? 0, "запис", "записи", "записів")} старших за 180 днів` });
      setExOpen(false); setPage(1); setRev((x) => x + 1);
    } catch (e) { toast.error("Не вдалося очистити журнал", { description: (e as Error).message }); }
    finally { setCleaning(false); setCleanAsk(false); }
  }
  async function endOthers() {
    setEndBusy(true);
    try { const r = await logoutOthers(); if (r.token && r.refreshToken) setTokens(r.token, r.refreshToken); const k = r.revoked ?? 0; toast.success("Інші сесії завершено", { description: `${k} ${plural(k, "сесію", "сесії", "сесій")} закрито — увійти там знову можна лише з паролем` }); }
    catch (e) { toast.error("Не вдалося завершити сесії", { description: (e as Error).message }); }
    finally { setEndBusy(false); }
  }

  const perLabel = range === "custom" && custom.from && custom.to ? `${short(custom.from)} — ${short(custom.to)}` : PERIODS.find((p) => p[0] === range)?.[1] || "Увесь час";
  const chips = [
    range !== "all" && { k: "r", l: perLabel, off: () => setRange("all") },
    actor && { k: "a", l: `@${actor}`, off: () => setActor("") },
    (userId || history) && { k: "h", l: `Історія ${histName ? `@${histName}` : history}`, off: () => setParams({}) },
  ].filter(Boolean) as { k: string; l: string; off: () => void }[];
  const sub = !data ? "завантажуємо…" : filtered || chips.length ? `Знайдено ${total.toLocaleString("uk-UA")} з ${allCount.toLocaleString("uk-UA")}` : `${sum?.today ?? 0} ${plural(sum?.today ?? 0, "дія", "дії", "дій")} сьогодні · ${sum?.failed7 ?? 0} ${plural(sum?.failed7 ?? 0, "помилка", "помилки", "помилок")} · зберігаємо 180 днів`;
  const tagOf = (e: Entry): [string, string] => e.status === "failed" ? ["Помилка", "is-red"] : CAT_TAG[e.category || ""] || ["Інше", "is-grey"];
  const res = (e: Entry) => e.status === "success" ? ["Виконано", "is-green"] : e.status === "failed" ? ["Помилка", "is-red"] : [RESULT_UI[e.status]?.label || e.status, "is-amber"];
  const dev = (e: Entry) => { const d = e.details || {}; return { device: typeof d.device === "string" ? d.device : "", ip: typeof d.ip === "string" ? d.ip : "" }; };

  const listCard = error && !rows.length ? (
    <div className="v3-adw-card v3-aw-list"><div className="v3-uw-empty is-err" role="alert"><span>!</span><strong>Не вдалося завантажити журнал</strong><p>{error}</p><div><button type="button" className="v3-uwb is-green" onClick={() => setRev((x) => x + 1)}>Спробувати ще раз</button></div></div></div>
  ) : !data ? (
    <div className="v3-adw-card v3-aw-list v3-adw-skel" role="status" aria-label="Завантаження">{Array.from({ length: 7 }, (_, i) => <i key={i} style={{ height: 40 }} />)}</div>
  ) : !rows.length ? (
    <div className="v3-adw-card v3-aw-list v3-adw-empty"><span aria-hidden="true"><Search size={20} /></span>
      <strong>{q ? "Нічого не знайдено" : "Записів немає"}</strong>
      <p>{q ? `За запитом «${q}» у журналі нічого немає. Шукайте за логіном, назвою банера або № оплати.` : "За цей період таких дій не було. Змініть період, автора або розділ."}</p>
      {(filtered || chips.length > 0) && <button type="button" className="v3-uwb is-green" onClick={() => { reset(); if (userId || history) setParams({}); }}>Скинути фільтри</button>}
    </div>
  ) : (
    <div className="v3-adw-card v3-aw-list">
      <div className="v3-aw-tr is-th"><span>Час</span><span>Хто</span><span>Що зробив</span><span className="is-r">Розділ</span></div>
      {days.map((d) => <section key={d.key}>
        <h3>{d.label}</h3>
        {d.items.map((e, i) => { const v = describe(e), t = tagOf(e); return (
          <button key={e.id} type="button" className={`v3-aw-tr${e.id === sel ? " is-sel" : ""}`} style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }} aria-pressed={e.id === sel} onClick={() => setSel(e.id)}>
            <span className="v3-aw-time">{hm(e.created_at)}</span>
            <span className="v3-aw-who"><i className={e.actor_name === "system" ? "is-sys" : e.actor_name === me?.username ? "is-me" : ""} aria-hidden="true">{initials(e.actor_name)}</i>@{e.actor_name}</span>
            <span className="v3-aw-what"><strong>{cap(v.verb)}{v.target && <> <em>{v.target}</em></>}</strong>{v.chips.length > 0 && <span className="v3-aw-chips">{v.chips.slice(0, 3).map((c, k) => <Chg key={k} c={c} />)}</span>}</span>
            <span className="is-r"><span className={`v3-uwt ${t[1]}`}>{t[0]}</span></span>
          </button>
        ); })}
      </section>)}
      <div ref={sentinel} />
      <p className="v3-aw-more">{loading && page > 1 ? "Завантажуємо старіші записи…" : data.hasMore ? `Показано ${rows.length} · старіші записи підвантажаться під час прокрутки` : `Показано ${rows.length} — це всі записи`}</p>
    </div>
  );

  const side = !cur || !curV ? (
    <aside className="v3-adw-card v3-aw-side v3-adw-empty"><span aria-hidden="true"><History size={20} /></span><p>Виберіть запис ліворуч</p></aside>
  ) : (() => {
    const r = res(cur), dv = dev(cur), t = tagOf(cur);
    const user = curV.username;
    const go = curV.kind === "pay" && user ? { to: `/payments?user=${encodeURIComponent(user)}`, l: "Відкрити оплату" } : user ? { to: `/users?q=${encodeURIComponent(user)}`, l: "Відкрити користувача" } : curV.kind === "banner" ? { to: "/banners", l: "Відкрити рекламу" } : null;
    return (
      <aside key={cur.id} className="v3-adw-card v3-aw-side">
        <div className="v3-aw-sh"><h2>{cap(curV.verb)}{curV.target ? ` ${curV.target}` : ""}</h2><span className={`v3-uwt ${r[1]}`}>{r[0]}</span></div>
        <small className="v3-aw-when">{whenText(cur.created_at)} · @{cur.actor_name}</small>
        {cur.status === "failed" && <div className="v3-adw-warn is-red">Дію не виконано — зміни не збережено.</div>}
        {cur.action === "LOGIN_NEW_DEVICE" && <div className="v3-aw-sec"><span>Якщо це були не ви — завершіть інші сесії й змініть пароль.</span><button type="button" className="v3-uwb is-red" disabled={endBusy} onClick={endOthers}>{endBusy ? "Завершуємо…" : "Завершити інші сесії"}</button></div>}
        {curV.diff.length > 0 && <>
          <span className="v3-aw-lbl">Що змінилось</span>
          <div className="v3-aw-diff"><div className="is-th"><span>Поле</span><span>Було</span><span>Стало</span></div>
            {curV.diff.map((c, i) => <div key={i}><span>{c.k}</span><span>{c.from}</span><b>{c.to}</b></div>)}
          </div>
        </>}
        <dl className="v3-adw-dl">
          <div><dt>Розділ</dt><dd>{t[0]}</dd></div>
          {dv.device && !curV.diff.some((c) => c.k === "Пристрій") && <div><dt>Пристрій</dt><dd>{dv.device}</dd></div>}
          {dv.ip && !curV.diff.some((c) => c.k === "IP") && <div><dt>IP</dt><dd>{dv.ip}</dd></div>}
          <div><dt>ID запису</dt><dd>AUD-{cur.id}</dd></div>
        </dl>
        <div className="v3-aw-sf">
          <button type="button" className="v3-uwb" onClick={() => setActor(cur.actor_name)}>Усі дії @{cur.actor_name}</button>
          {go && <Link className="v3-uwb is-green" to={go.to}>{go.l}<ArrowRight size={14} aria-hidden="true" /></Link>}
        </div>
      </aside>
    );
  })();

  return (
    <div className="v3-page v3-uw v3-aw">
      <section className="v3-uw-hero">
        <div><h1>Журнал дій</h1><p>{sub}</p></div>
        <div className="v3-uw-hacts"><button type="button" className="v3-uwb is-white" onClick={() => { setExRange("30"); setExOpen(true); }}><Download size={15} aria-hidden="true" />Експорт CSV</button></div>
      </section>
      <div className="v3-uw-tools v3-aw-tools">
        <div className="v3-aw-cats" role="group" aria-label="Розділ">
          {CATS.map(([k, l]) => { const n = k === "all" ? allCount : k === "failed" ? (sum?.failed7 ?? 0) : counts[k] ?? 0; return <button key={k} type="button" className={cat === k ? "is-on" : ""} aria-pressed={cat === k} onClick={() => setCat(k)}>{l}<b>{data ? n : "…"}</b></button>; })}
        </div>
        <div ref={per.ref} className="v3-spw-pop">
          <button type="button" className={`v3-aw-dd${range !== "all" ? " is-on" : ""}`} aria-haspopup="menu" aria-expanded={per.open} onClick={() => per.setOpen(!per.open)}><Calendar size={14} aria-hidden="true" />{perLabel}<ChevronDown size={13} aria-hidden="true" /></button>
          {per.open && <div className="v3-spw-menu is-left" role="menu">{PERIODS.map(([k, l]) => <button key={k} type="button" role="menuitemradio" aria-checked={range === k} className={range === k ? "is-on" : ""} onClick={() => { per.setOpen(false); if (k === "custom") { setDDraft(custom); setDateAsk(true); } else setRange(k); }}><span><b>{l}</b></span>{range === k && <Check size={15} aria-hidden="true" />}</button>)}</div>}
        </div>
        <div ref={aut.ref} className="v3-spw-pop">
          <button type="button" className={`v3-aw-dd${actor ? " is-on" : ""}`} aria-haspopup="menu" aria-expanded={aut.open} onClick={() => aut.setOpen(!aut.open)}><User size={14} aria-hidden="true" />{actor ? `@${actor}` : "Усі автори"}<ChevronDown size={13} aria-hidden="true" /></button>
          {aut.open && <div className="v3-spw-menu is-left" role="menu">
            <button type="button" role="menuitemradio" aria-checked={!actor} className={!actor ? "is-on" : ""} onClick={() => { setActor(""); aut.setOpen(false); }}><span><b>Усі автори</b></span><em>{(data?.actors || []).reduce((a, x) => a + x.total, 0) || allCount}</em>{!actor && <Check size={15} aria-hidden="true" />}</button>
            {(data?.actors || []).map((a) => <button key={a.name} type="button" role="menuitemradio" aria-checked={actor === a.name} className={actor === a.name ? "is-on" : ""} onClick={() => { setActor(a.name); aut.setOpen(false); }}><span><b>@{a.name}{a.name === "system" ? " · автоматично" : ""}</b></span><em>{a.total}</em>{actor === a.name && <Check size={15} aria-hidden="true" />}</button>)}
          </div>}
        </div>
        <label className="v3-uw-search v3-spw-search"><Search size={15} aria-hidden="true" /><input type="search" aria-label="Пошук у журналі" placeholder="Логін, банер або № оплати" value={draft} onChange={(e) => setDraft(e.target.value)} />{draft && <button type="button" aria-label="Очистити" onClick={() => setDraft("")}><X size={13} /></button>}</label>
      </div>
      {chips.length > 0 && <div className="v3-aw-fchips"><span>Фільтри:</span>{chips.map((c) => <button key={c.k} type="button" onClick={c.off} aria-label={`Прибрати фільтр ${c.l}`}>{c.l}<X size={12} aria-hidden="true" /></button>)}<button type="button" className="is-link" onClick={() => { reset(); if (userId || history) setParams({}); }}>Скинути все</button></div>}
      <section className="v3-aw-split">{listCard}{side}</section>

      <WModal open={dateAsk} onClose={() => setDateAsk(false)} width={420} title="Свій період" sub="Дні за Києвом, обидві дати включно">
        <div className="v3-adwm-row">
          <div className="v3-uwm-f"><label id="aw-from-l">Від</label><DateField id="aw-from" labelledBy="aw-from-l" value={dDraft.from} onChange={(v) => setDDraft((d) => ({ ...d, from: v }))} /></div>
          <div className="v3-uwm-f"><label id="aw-to-l">До</label><DateField id="aw-to" labelledBy="aw-to-l" value={dDraft.to} min={dDraft.from || undefined} onChange={(v) => setDDraft((d) => ({ ...d, to: v }))} /></div>
        </div>
        <div className="v3-uwm-foot"><span /><div><button type="button" className="v3-uwb" onClick={() => setDateAsk(false)}>Скасувати</button><button type="button" className="v3-uwb is-green" disabled={!dDraft.from || !dDraft.to || dDraft.from > dDraft.to} onClick={() => { setCustom(dDraft); setRange("custom"); setDateAsk(false); }}>Показати</button></div></div>
      </WModal>

      <WModal open={exOpen} onClose={() => setExOpen(false)} width={500} title="Експорт журналу" sub="CSV-файл · відкривається в Excel і Google Таблицях">
        <span className="v3-aw-lbl">Період</span>
        <div className="v3-aw-exper" role="group" aria-label="Період експорту">
          {([["7", "7 днів"], ["30", "30 днів"], ["all", "Усе"], ["custom", "Свій"]] as const).map(([k, l]) => <button key={k} type="button" className={exRange === k ? "is-on" : ""} aria-pressed={exRange === k} onClick={() => setExRange(k)}>{l}</button>)}
        </div>
        {exRange === "custom" && <div className="v3-adwm-row">
          <div className="v3-uwm-f"><label id="ax-from-l">Від</label><DateField id="ax-from" labelledBy="ax-from-l" value={exCustom.from} onChange={(v) => setExCustom((d) => ({ ...d, from: v }))} /></div>
          <div className="v3-uwm-f"><label id="ax-to-l">До</label><DateField id="ax-to" labelledBy="ax-to-l" value={exCustom.to} min={exCustom.from || undefined} onChange={(v) => setExCustom((d) => ({ ...d, to: v }))} /></div>
        </div>}
        <dl className="v3-adw-dl">
          <div><dt>Записів</dt><dd>{exCount == null ? "…" : exCount.toLocaleString("uk-UA")}</dd></div>
          <div><dt>Фільтри</dt><dd>{cat === "all" ? "усі розділи" : CATS.find((c) => c[0] === cat)?.[1]} · {actor ? `@${actor}` : "усі автори"}</dd></div>
          <div><dt>Поля</dt><dd>час, автор, дія, об’єкт, було → стало, IP</dd></div>
        </dl>
        {owner && <div className="v3-aw-clean">
          <strong>Старі записи</strong>
          <span>Записи, старші за 180 днів, можна видалити{cleanCount != null ? ` (${cleanCount.toLocaleString("uk-UA")})` : ""}. Лише для овнера, дію не можна скасувати.</span>
          <button type="button" className={`v3-uwb ${cleanAsk ? "is-red" : "is-softred"}`} disabled={cleaning || cleanCount === 0} onClick={cleanup}>{cleaning ? "Очищаємо…" : cleanAsk ? "Точно очистити? Натисніть ще раз" : "Очистити старші за 180 днів"}</button>
        </div>}
        <div className="v3-uwm-foot"><span>IP у файлі частково приховано</span><div><button type="button" className="v3-uwb" onClick={() => setExOpen(false)}>Скасувати</button><button type="button" className="v3-uwb is-green" disabled={!exCount || (exRange === "custom" && !(exCustom.from && exCustom.to))} onClick={exportCsv}>Завантажити CSV</button></div></div>
      </WModal>
    </div>
  );
}
