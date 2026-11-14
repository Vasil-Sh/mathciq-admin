import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronLeft, ChevronRight, Download, ListFilter, Search, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/apiClient";
import { useAuth } from "@/contexts/AuthContext";
import { useMedia } from "@/hooks/useMediaOnline";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { plural } from "@/lib/dashboardInsights";
import { KIND_UI, RESULT_UI, dayKey, dayLabel, describe, exactTime, timeLabel, type Change, type Entry, type View } from "@/lib/auditModel";

type Summary = { today: number; week: number; failed7: number; security7: number; lastFailed: Entry | null; lastSecurity: Entry | null; topActor: { name: string; week: number } | null };
type Actor = { name: string; telegram: string | null; week: number; total: number };
type Resp = { entries: Entry[]; hasMore: boolean; total: number; counts?: Record<string, number>; summary?: Summary; actors?: Actor[] };
type Item = { id: string; e: Entry; v: View; group?: Entry[] };

const LIMIT = 30;
const CATS: [string, string][] = [["all", "Усі"], ["users", "Користувачі"], ["payments", "Оплати"], ["banners", "Банери"], ["ads", "Реклама"], ["settings", "Налаштування"], ["security", "Безпека"]];
const RANGES: [string, string][] = [["all", "Усі дати"], ["today", "Сьогодні"], ["7", "Останні 7 днів"], ["30", "Останні 30 днів"], ["custom", "Свій період"]];
const kyiv = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const short = (v: View, e: Entry) => `${v.verb}${v.target ? ` ${v.target}` : ""}`.replace(/^—\s*/, "") + (e.actor_name ? ` · @${e.actor_name}` : "");

function group(entries: Entry[]): Item[] {
  const out: Item[] = [];
  for (const e of entries) {
    const v = describe(e), last = out[out.length - 1];
    if (v.groupKey && last && last.v.groupKey === v.groupKey && dayKey(last.e.created_at) === dayKey(e.created_at)
      && Math.abs(Date.parse((last.group ? last.group[last.group.length - 1] : last.e).created_at) - Date.parse(e.created_at)) <= 5 * 60_000) {
      last.group = [...(last.group || [last.e]), e];
      continue;
    }
    out.push({ id: e.id, e, v });
  }
  return out;
}

export default function AuditLog() {
  const [params, setParams] = useSearchParams();
  const { user: me } = useAuth();
  const wide = useMedia("(min-width: 1180px)");
  const userId = params.get("userId") || "";
  const history = params.get("history") || "";
  const [draft, setDraft] = useState(params.get("q") || "");
  const [q, setQ] = useState(params.get("q") || "");
  const [cat, setCat] = useState("all");
  const [status, setStatus] = useState("all");
  const [actor, setActor] = useState(params.get("actor") || "");
  const [range, setRange] = useState("all");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Resp | null>(null);
  const [more, setMore] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [rev, setRev] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [cleanOpen, setCleanOpen] = useState(false);
  const [cleanDays, setCleanDays] = useState(180);
  const [cleanCount, setCleanCount] = useState<number | null>(null);
  const [cleaning, setCleaning] = useState(false);

  useEffect(() => { const t = setTimeout(() => { setQ(draft.trim()); setPage(1); }, 350); return () => clearTimeout(t); }, [draft]);
  const dates = useMemo(() => {
    const today = kyiv(new Date());
    if (range === "today") return { from: today, to: today };
    if (range === "7" || range === "30") return { from: kyiv(new Date(Date.now() - (Number(range) - 1) * 864e5)), to: today };
    if (range === "custom" && custom.from && custom.to && custom.from <= custom.to) return custom;
    return { from: "", to: "" };
  }, [range, custom]);
  const qs = `category=${cat}&status=${status}&q=${encodeURIComponent(q)}&from=${dates.from}&to=${dates.to}&userId=${encodeURIComponent(userId)}&history=${encodeURIComponent(history)}&actor=${encodeURIComponent(actor)}`;

  useEffect(() => {
    let live = true; setLoading(true); setError("");
    api.get<Resp>(`/admin/audit?page=${page}&limit=${LIMIT}&summary=1&${qs}`)
      .then((r) => { if (!live) return; setData(r); if (page === 1 || wide) setMore([]); })
      .catch((e) => { if (live) setError((e as Error).message || "Сервер не відповідає"); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [qs, page, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  const entries = useMemo(() => (wide ? data?.entries || [] : [...more, ...(data?.entries || [])]), [wide, more, data]);
  const items = useMemo(() => group(entries), [entries]);
  const days = useMemo(() => { const m: { key: string; label: string; items: Item[] }[] = []; for (const it of items) { const k = dayKey(it.e.created_at); const last = m[m.length - 1]; if (last && last.key === k) last.items.push(it); else m.push({ key: k, label: dayLabel(it.e.created_at), items: [it] }); } return m; }, [items]);
  useEffect(() => { if (wide && open === null && items.length) setOpen(items[0].id); }, [items, wide]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / LIMIT));
  const counts = data?.counts || {};
  const allCount = Object.values(counts).reduce((a, b) => a + b, 0);
  const sum = data?.summary;
  const filtered = !!(q || cat !== "all" || status !== "all" || actor || range !== "all");
  const reset = () => { setDraft(""); setQ(""); setCat("all"); setStatus("all"); setActor(""); setRange("all"); setPage(1); toast.info("Фільтри скинуто", { description: "Показуємо всі дії" }); };
  const owner = !!me?.isOwner;

  const exportCsv = useCallback(async () => {
    toast.info("Експорт почався", { description: `${total.toLocaleString("uk-UA")} ${plural(total, "запис", "записи", "записів")} · CSV` });
    try {
      const blob = await api.download(`/admin/audit/export?${qs}`);
      const name = `audit-${dates.from || "all"}${dates.to ? `_${dates.to}` : ""}.csv`;
      const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
      toast.success("Файл готовий", { description: name });
    } catch (e) { toast.error("Експорт не вдався", { description: (e as Error).message }); }
  }, [qs, total, dates]);

  useEffect(() => {
    if (!cleanOpen) return; setCleanCount(null);
    const t = setTimeout(() => api.get<{ count: number }>(`/admin/audit/cleanup?days=${cleanDays}`).then((r) => setCleanCount(r.count)).catch((e) => { setCleanCount(null); toast.error("Не вдалося порахувати записи", { description: (e as Error).message }); }), 300);
    return () => clearTimeout(t);
  }, [cleanOpen, cleanDays]);
  async function cleanup() {
    setCleaning(true);
    try {
      const r = await api.delete<{ removed?: number }>(`/admin/audit/cleanup?days=${cleanDays}`);
      toast.success("Старі записи очищено", { description: `Видалено ${(r.removed ?? 0).toLocaleString("uk-UA")} ${plural(r.removed ?? 0, "запис", "записи", "записів")} старших за ${cleanDays} ${plural(cleanDays, "день", "дні", "днів")}` });
      setCleanOpen(false); setPage(1); setRev((x) => x + 1);
    } catch (e) { toast.error("Не вдалося очистити журнал", { description: (e as Error).message }); }
    finally { setCleaning(false); }
  }

  const chips = (list: Change[]) => list.length ? <span className="v3-au-chips">{list.map((c, i) => <span key={i} className="v3-au-chg">{c.k}: {c.from !== "—" && <><s>{c.from}</s> → </>}<strong>{c.to}</strong></span>)}</span> : null;

  function row(it: Item) {
    const { e, v } = it, isOpen = open === it.id, ui = KIND_UI[v.kind];
    const res = v.security && e.status === "success" ? { label: "Безпека", cls: "is-warn" } : RESULT_UI[e.status] || { label: e.status, cls: "is-warn" };
    const n = it.group?.length || 0;
    const groupDiff: Change[] = it.group ? it.group.map((g) => { const gv = describe(g); const c = gv.diff.find((x) => x.k === "Підписка до") || gv.diff[0]; return { k: gv.target || "—", from: c?.from || "—", to: c?.to || "—" }; }) : [];
    const verb = n ? `${v.verb.replace("підписку", "")}`.trim() : v.verb;
    const target = n ? `${n} ${plural(n, "підписку", "підписки", "підписок")}` : v.target;
    const toIso = (x: string) => (/^\d{2}\.\d{2}\.\d{4}$/.test(x) ? x.split(".").reverse().join("-") : "");
    const deltas = groupDiff.map((g) => (toIso(g.from) && toIso(g.to) ? Math.round((Date.parse(toIso(g.to)) - Date.parse(toIso(g.from))) / 864e5) : NaN));
    const same = deltas.length > 0 && deltas.every((x) => Number.isFinite(x) && x === deltas[0]);
    const chipList = n ? [{ k: "Кожному", from: "—", to: same ? `${deltas[0] > 0 ? "+" : ""}${deltas[0]} ${plural(Math.abs(deltas[0]), "день", "дні", "днів")}` : "різний термін" }] : v.chips;
    const dm = (x: string) => x.replace(/^(\d{2}\.\d{2})\.\d{4}$/, "$1");
    const diff = n ? groupDiff : v.diff;
    if (!wide) return (
      <div key={it.id} className={`v3-au-mev${e.status === "failed" ? " is-err" : v.security ? " is-warn" : ""}`}>
        <span className="v3-au-ico" style={{ background: e.status === "failed" ? "#ffe2dc" : ui.bg, color: e.status === "failed" ? "#9a2a17" : ui.fg }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d={ui.d} /></svg></span>
        <div className="v3-au-mbody">
          <div className="v3-au-mtop"><span title={exactTime(e.created_at)}>{timeLabel(e.created_at)} · @{e.actor_name}</span><span className={`v3-au-pill ${res.cls}`}><i />{res.label}</span></div>
          <div className="v3-au-mtxt">{verb[0].toUpperCase() + verb.slice(1)} {target && <strong>{target}</strong>} {n > 0 && <span className="v3-au-count">×{n}</span>}</div>
          {n ? <div className="v3-au-mgroup">{groupDiff.slice(0, 2).map((g, i) => <span key={i}>{g.k} · <s>{dm(g.from)}</s> → <strong>{dm(g.to)}</strong></span>)}{n > 2 && <button type="button" onClick={() => setOpen(isOpen ? null : it.id)}>{isOpen ? "Згорнути" : `+ ще ${n - 2}`}</button>}{isOpen && groupDiff.slice(2).map((g, i) => <span key={i}>{g.k} · <s>{dm(g.from)}</s> → <strong>{dm(g.to)}</strong></span>)}</div> : chips(v.chips)}
          {e.status === "failed" && <div className="v3-au-merr">Дію не виконано — зміни не збережено.</div>}
          {v.security && e.action === "LOGIN_NEW_DEVICE" && <span className="v3-au-mlink">{v.meta}</span>}
          {e.status === "failed" && v.userId && <Link className="v3-au-mlink" to={`/users?q=${encodeURIComponent(v.username || "")}`}>Повторити з картки →</Link>}
        </div>
      </div>
    );
    return (
      <div key={it.id}>
        <button type="button" className={`v3-au-ev${isOpen ? " is-open" : ""}`} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : it.id)}>
          <span className="v3-au-time" title={exactTime(e.created_at)}>{timeLabel(e.created_at)}</span>
          <span className="v3-au-ico" style={isOpen ? { background: "#232a37", color: "#fff" } : { background: ui.bg, color: ui.fg }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d={ui.d} /></svg></span>
          <span className="v3-au-main">
            <span className="v3-au-line"><b>@{e.actor_name}</b> <span className="v3-au-verb">{verb}</span> {target && <strong className="v3-au-target">{target}</strong>}{n > 0 && <span className="v3-au-count">×{n}</span>}</span>
            {chips(chipList)}
          </span>
          <span className={`v3-au-pill ${res.cls}`}><i />{res.label}</span>
          <span className="v3-au-chev" aria-hidden="true"><ChevronDown size={14} /></span>
        </button>
        {isOpen && (
          <div className="v3-au-xp">
            {diff.length > 0 ? (
              <div className="v3-au-diff">
                <div className="v3-au-drow is-h"><span>{n ? "Користувач · підписка до" : "Поле"}</span><span>Було</span><span /><span>Стало</span></div>
                {diff.map((f, i) => <div key={i} className="v3-au-drow"><span className="k">{f.k}</span><span className="from">{f.from}</span><span className="arr">→</span><span className="to">{f.to}</span></div>)}
              </div>
            ) : <p className="v3-au-none">Без зміни значень</p>}
            {!e.details?._changes && !n && diff.length > 0 && !["sec", "key"].includes(v.kind) && <p className="v3-au-legacy">Попередні значення для цієї дії не зберігаються</p>}
            <div className="v3-au-xpf">
              <span>{n ? `${n} дій за ${Math.max(1, Math.round((Date.parse(it.group![0].created_at) - Date.parse(it.group![n - 1].created_at)) / 60000))} хв згорнуто в одну` : e.status === "failed" ? "Сервер не виконав дію — зміна не збережена." : v.meta} · {exactTime(e.created_at)}</span>
              <span className="v3-au-links">
                {v.username && <Link to={`/users?q=${encodeURIComponent(v.username)}`}>Відкрити користувача</Link>}
                {v.userId && <Link to={`/audit?userId=${v.userId}&username=${encodeURIComponent(v.username || "")}`} onClick={() => setPage(1)}>Уся історія @{v.username || "користувача"} →</Link>}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }

  const activeChips = [
    q && { k: "q", label: `«${q}»`, off: () => setDraft("") },
    cat !== "all" && { k: "cat", label: CATS.find((c) => c[0] === cat)?.[1] || cat, off: () => setCat("all") },
    status !== "all" && { k: "st", label: RESULT_UI[status]?.label || status, off: () => setStatus("all") },
    actor && { k: "ac", label: `@${actor}`, off: () => setActor("") },
    range !== "all" && { k: "rg", label: RANGES.find((r) => r[0] === range)?.[1] || "", off: () => setRange("all") },
  ].filter(Boolean) as { k: string; label: string; off: () => void }[];

  const filters = (
    <>
      <label className={wide ? "v3-search v3-au-search" : "v3-msearch"}><Search size={16} aria-hidden="true" /><input type="search" placeholder="Логін, банер або № оплати" aria-label="Пошук: логін, назва банера, номер оплати" value={draft} onChange={(e) => setDraft(e.target.value)} />{draft && <button type="button" aria-label="Очистити пошук" onClick={() => setDraft("")}><X size={14} /></button>}</label>
      {wide ? (
        <div className="v3-seg v3-seg-soft" role="group" aria-label="Тип записів">
          {CATS.filter(([k]) => k === "all" || (counts[k] || 0) > 0 || k === cat).map(([k, l]) => <button key={k} type="button" className={cat === k ? "is-on" : ""} aria-pressed={cat === k} onClick={() => { setCat(k); setPage(1); }}>{l} <span className="v3-seg-n">{k === "all" ? allCount : counts[k] || 0}</span></button>)}
        </div>
      ) : (
        <label className="v3-au-msel"><span className="sr-only">Тип</span><select value={cat} onChange={(e) => { setCat(e.target.value); setPage(1); }}>{CATS.map(([k, l]) => <option key={k} value={k}>{k === "all" ? "Усі типи" : l}{k !== "all" && counts[k] ? ` · ${counts[k]}` : ""}</option>)}</select></label>
      )}
      <label className={wide ? "v3-au-field" : "v3-au-msel"}><span className="sr-only">Автор</span><select value={actor} onChange={(e) => { setActor(e.target.value); setPage(1); }}><option value="">Усі автори</option>{(data?.actors || []).map((a) => <option key={a.name} value={a.name}>@{a.name}{a.week ? ` · ${a.week} за тиждень` : ""}</option>)}</select></label>
      {wide && <label className="v3-au-field"><span className="sr-only">Результат</span><select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="all">Усі результати</option><option value="success">Виконано</option><option value="failed">Помилка</option><option value="pending">Не підтверджено</option></select></label>}
      <label className={wide ? "v3-au-field" : "v3-au-msel is-full"}><span className="sr-only">Період</span><select value={range} onChange={(e) => { setRange(e.target.value); setPage(1); }}>{RANGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      {range === "custom" && <div className="v3-au-custom"><label>З <input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></label><label>По <input type="date" value={custom.to} min={custom.from || undefined} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></label></div>}
    </>
  );

  const failedNote = sum?.lastFailed ? short(describe(sum.lastFailed), sum.lastFailed) : "усе виконано";
  const secNote = sum?.lastSecurity ? short(describe(sum.lastSecurity), sum.lastSecurity) : "подій немає";

  return (
    <div className="v3-page v3-auditpg">
      <section className="v3-hero v3-hero-row">
        <div>
          <h1 className="v3-title">Журнал дій</h1>
          <p className="v3-subtitle"><span className="v3-hide-mobile">Хто, що і коли змінив: користувачі, оплати, банери, реклама, налаштування. Паролі й токени не записуються.</span><span className="v3-only-mobile">{sum ? `${sum.today} ${plural(sum.today, "дія", "дії", "дій")} сьогодні · ${sum.failed7} ${plural(sum.failed7, "помилка", "помилки", "помилок")}` : "Хто, що і коли змінив"}</span></p>
        </div>
        <div className="v3-chips">
          {owner && <button type="button" className="v3-chip v3-hide-mobile" onClick={() => setCleanOpen(true)}>Очистити старі записи</button>}
          <button type="button" className="v3-btn v3-btn-primary v3-hide-mobile" disabled={!total} onClick={exportCsv}><Download size={15} aria-hidden="true" />Експорт CSV</button>
          <button type="button" className="v3-au-mexp v3-only-mobile" aria-label="Експорт CSV" disabled={!total} onClick={exportCsv}><Download size={18} aria-hidden="true" /></button>
        </div>
      </section>

      {wide && sum && (
        <section className="v3-au-sums" aria-label="Підсумки">
          <div className="v3-au-sum is-blue"><div className="l">Дій сьогодні</div><div className="v">{sum.today}</div><div className="n">{sum.week} за тиждень</div></div>
          <div className="v3-au-sum"><div className="l">Помилки за 7 днів</div><div className={`v${sum.failed7 ? " is-err" : ""}`}>{sum.failed7}</div><div className="n" title={failedNote}>{failedNote}</div></div>
          <div className="v3-au-sum"><div className="l">Безпека</div><div className={`v${sum.security7 ? " is-warn" : ""}`}>{sum.security7}</div><div className="n" title={secNote}>{secNote}</div></div>
          <div className="v3-au-sum"><div className="l">Найактивніший</div><div className="v is-sm">{sum.topActor ? `@${sum.topActor.name}` : "—"}</div><div className="n">{sum.topActor ? `${sum.topActor.week} ${plural(sum.topActor.week, "дія", "дії", "дій")} за тиждень` : "за тиждень дій не було"}</div></div>
        </section>
      )}

      {userId && (
        <div className="v3-au-hist">
          <span className="v3-au-hist-av">{(params.get("username") || "?").slice(0, 2).toUpperCase()}</span>
          <div><strong>Історія @{params.get("username") || `користувача №${userId}`}</strong><small>з моменту підключення журналу · {total} {plural(total, "запис", "записи", "записів")}</small></div>
          <Link to="/audit" onClick={() => { setParams({}); setPage(1); }}>Увесь журнал</Link>
        </div>
      )}

      {error && !data ? (
        <div className="v3-dcard v3-uerror" role="alert"><span className="v3-uerror-ico" aria-hidden="true">!</span><strong>Не вдалося завантажити журнал</strong><span>{error}. Записи не втрачено — спробуйте ще раз.</span><div><button type="button" className="v3-btn v3-btn-blue" onClick={() => setRev((x) => x + 1)}>Спробувати ще раз</button></div></div>
      ) : (
        <section className={wide ? "v3-wcard v3-au-card" : "v3-au-mcard"} aria-busy={loading}>
          <div className={wide ? "v3-au-tools" : "v3-au-mtools"}>{filters}</div>
          {wide && <p className="v3-au-hint">Пошук знаходить автора, користувача, назву банера й номер оплати — наприклад, <strong>№128</strong> або <strong>MATCHIQ20</strong>.</p>}
          {loading && !data ? (
            <div className={wide ? "" : "v3-wcard v3-au-skwrap"} role="status" aria-label="Завантаження журналу">
              <i className="v3-au-sk" style={{ width: "30%", height: 10, margin: "14px 4px 10px" }} />
              {[70, 60, 75, 55].map((w, i) => <div key={i} className="v3-au-skrow"><i style={{ height: 10 }} /><i style={{ width: 32, height: 32, borderRadius: 10 }} /><div><i style={{ width: `${w}%`, height: 11 }} /><i style={{ width: `${w - 25}%`, height: 20, marginTop: 8, borderRadius: 6 }} /></div></div>)}
            </div>
          ) : items.length === 0 ? (
            <div className={`v3-bt-empty${wide ? "" : " v3-wcard"}`}>
              {filtered ? <>
                <div className="v3-au-active">{activeChips.map((c) => <button key={c.k} type="button" onClick={c.off}>{c.label} <X size={12} aria-hidden="true" /></button>)}</div>
                <span className="v3-bt-empty-ico" aria-hidden="true"><ListFilter size={22} /></span>
                <strong>Нічого не знайдено</strong>
                <span>{actor && q ? `«${q}» немає серед дій @${actor}. Приберіть фільтр автора — пошук працює по всіх.` : "Спробуйте інший запит або приберіть частину фільтрів."}</span>
                <button type="button" className="v3-btn v3-btn-ghost" onClick={reset}>Скинути фільтри</button>
              </> : <>
                <span className="v3-ue-ico" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></svg></span>
                <strong>Журнал поки порожній</strong>
                <span>Сюди потраплятимуть створення й зміни користувачів, оплати, банери, реклама й налаштування.</span>
              </>}
            </div>
          ) : (
            days.map((d) => <div key={d.key}><div className="v3-au-day">{d.label}</div>{d.items.map(row)}</div>)
          )}
          {items.length > 0 && (wide ? (
            <div className="v3-au-pager">
              <span>Показано <b>{(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)}</b> з {total.toLocaleString("uk-UA")} {plural(total, "запису", "записів", "записів")} · по {LIMIT} на сторінці</span>
              {pages > 1 && <nav aria-label="Сторінки">
                <button type="button" className="v3-round" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Попередня сторінка"><ChevronLeft size={15} /></button>
                {Array.from({ length: pages }, (_, i) => i + 1).filter((n) => pages <= 7 || n === 1 || n === pages || Math.abs(n - page) <= 1).map((n, i, arr) => <span key={n} className="v3-pg-wrap">{i > 0 && n - arr[i - 1] > 1 && <span className="v3-pg-gap">…</span>}<button type="button" className={`v3-pg${n === page ? " is-on" : ""}`} aria-current={n === page ? "page" : undefined} onClick={() => setPage(n)}>{n}</button></span>)}
                <button type="button" className="v3-round" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Наступна сторінка"><ChevronRight size={15} /></button>
              </nav>}
            </div>
          ) : data?.hasMore ? <button type="button" className="v3-btn v3-btn-ghost-dark v3-btn-block" disabled={loading} onClick={() => { setMore(entries); setPage(page + 1); }}>{loading ? "Завантажуємо…" : `Показати ще ${Math.min(LIMIT, total - entries.length)}`}</button> : null)}
        </section>
      )}

      <Dialog open={cleanOpen} onOpenChange={setCleanOpen}>
        <DialogContent className="v3-modal sm:max-w-[520px]">
          <DialogTitle className="v3-modal-title">Очистити старі записи</DialogTitle>
          <DialogDescription className="v3-modal-sub">Записи, старші за вказаний термін, буде видалено назавжди. Спершу можна зробити експорт CSV.</DialogDescription>
          <label className="v3-au-days"><span>Старші ніж</span><input type="number" min={1} max={3650} value={cleanDays} onChange={(e) => setCleanDays(Math.max(1, Math.min(3650, Number(e.target.value) || 1)))} /><span className="v3-au-days-r">днів · {cleanCount === null ? "рахуємо…" : `${cleanCount.toLocaleString("uk-UA")} ${plural(cleanCount, "запис", "записи", "записів")}`}</span></label>
          <div className="v3-modal-actions">
            <button type="button" className="v3-btn v3-btn-ghost" onClick={() => { setCleanOpen(false); exportCsv(); }}>Спершу експорт</button>
            <button type="button" className="v3-btn v3-btn-red" disabled={cleaning || !cleanCount} onClick={cleanup}>{cleaning ? "Видаляємо…" : cleanCount ? `Видалити ${cleanCount.toLocaleString("uk-UA")} ${plural(cleanCount, "запис", "записи", "записів")}` : "Нічого видаляти"}</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
