import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Download, Filter, History, ListFilter, Search, X } from "lucide-react";
import { toast } from "sonner";
import { api, setTokens } from "@/lib/apiClient";
import { useAuth } from "@/contexts/AuthContext";
import { useMedia } from "@/hooks/useMediaOnline";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { plural } from "@/lib/dashboardInsights";
import { KIND_UI, RESULT_UI, dayKey, dayLabel, describe, exactTime, timeLabel, type Change, type Entry, type View } from "@/lib/auditModel";
import PillTrack from "@/components/PillTrack";
import UserAvatar from "@/components/UserAvatar";
import { Dropdown } from "@/components/ui/dropdown";
import ExportCsvButton from "@/components/ExportCsvButton";
import { usePageSearch, isPhoneWidth } from "@/lib/pageSearch";
import { logoutOthers } from "@/lib/adminSettingsApi";
import AuditWeb from "@/components/audit/AuditWeb";

type Summary = { today: number; week: number; failed7: number; security7: number; lastFailed: Entry | null; lastSecurity: Entry | null; topActor: { name: string; week: number } | null };
type Actor = { name: string; telegram: string | null; week: number; total: number };
type Resp = { entries: Entry[]; hasMore: boolean; total: number; counts?: Record<string, number>; summary?: Summary; actors?: Actor[] };
type Item = { id: string; e: Entry; v: View; group?: Entry[] };

const LIMIT = 30;
const CATS: [string, string][] = [["all", "Усі"], ["users", "Користувачі"], ["payments", "Оплати"], ["banners", "Банери"], ["ads", "Реклама"], ["settings", "Налаштування"], ["security", "Безпека"]];
const RANGES: [string, string][] = [["all", "Усі дати"], ["today", "Сьогодні"], ["7", "Останні 7 днів"], ["30", "Останні 30 днів"], ["custom", "Свій період"]];
const kyiv = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
function datesFor(range: string, custom: { from: string; to: string }) {
  const today = kyiv(new Date());
  if (range === "today") return { from: today, to: today };
  if (range === "7" || range === "30") return { from: kyiv(new Date(Date.now() - (Number(range) - 1) * 864e5)), to: today };
  if (range === "custom" && custom.from && custom.to && custom.from <= custom.to) return custom;
  return { from: "", to: "" };
}
const hm = (iso: string) => new Date(iso).toLocaleTimeString("uk-UA", { timeZone: "Europe/Kyiv", hour: "2-digit", minute: "2-digit" });
const dmy = (iso: string) => { const k = kyiv(new Date(iso)).split("-"); return `${k[2]}.${k[1]}.${k[0].slice(2)} · ${hm(iso)}`; };
const whenText = (iso: string) => { const k = kyiv(new Date(iso)), t = kyiv(new Date()), y = kyiv(new Date(Date.now() - 864e5)); return `${k === t ? "сьогодні" : k === y ? "вчора" : dayLabel(iso).split(" · ").pop()} о ${hm(iso)}`; };
const PERIODS: [string, string][] = [["today", "Сьогодні"], ["7", "7 днів"], ["30", "30 днів"], ["custom", "Свій"]];
const EX_PERIODS: [string, string][] = [["7", "7 днів"], ["30", "30 днів"], ["all", "Усе"], ["custom", "Свій"]];
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

function AuditLegacy() {
  const [params, setParams] = useSearchParams();
  const { user: me } = useAuth();
  const wide = useMedia("(min-width: 1180px)");
  const userId = params.get("userId") || "";
  // Telegram handle of the user whose history is shown — for the photo in the «Історія @…» banner
  const [histTg, setHistTg] = useState<string | undefined>(undefined);
  useEffect(() => {
    setHistTg(undefined);
    if (!userId) return;
    let off = false;
    api.get<{ users: { id: number | string; telegram?: string | null }[] }>("/admin/users")
      .then((r) => { if (!off) setHistTg(r.users?.find((u) => String(u.id) === userId)?.telegram || undefined); })
      .catch(() => {});
    return () => { off = true; };
  }, [userId]);
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
  const dates = useMemo(() => datesFor(range, custom), [range, custom]);
  const qsOf = (o: { cat: string; status: string; actor: string; from: string; to: string }) => `category=${o.cat}&status=${o.status}&q=${encodeURIComponent(q)}&from=${o.from}&to=${o.to}&userId=${encodeURIComponent(userId)}&history=${encodeURIComponent(history)}&actor=${encodeURIComponent(o.actor)}`;
  const qs = qsOf({ cat, status, actor, ...dates });
  // ── phone (design «Журнал дій, мобільна») ──
  const phone = useMedia("(max-width: 767px)");
  const pageSearch = usePageSearch("Логін, банер або № оплати");
  const initQ = useRef(draft);
  useEffect(() => { if (isPhoneWidth() && initQ.current) { pageSearch.setQ(initQ.current); pageSearch.setOpen(true); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isPhoneWidth()) return;
    if (initQ.current && pageSearch.q !== initQ.current) return;
    initQ.current = "";
    setDraft(pageSearch.q);
  }, [pageSearch.q]); // eslint-disable-line react-hooks/exhaustive-deps
  const [entryId, setEntryId] = useState<string | null>(null);
  const [fOpen, setFOpen] = useState(false);
  const [dRange, setDRange] = useState("all");
  const [dCustom, setDCustom] = useState({ from: "", to: "" });
  const [dStatus, setDStatus] = useState("all");
  const [dActor, setDActor] = useState("");
  const [dCount, setDCount] = useState<number | null>(null);
  const [exOpen, setExOpen] = useState(false);
  const [exRange, setExRange] = useState("30");
  const [exCustom, setExCustom] = useState({ from: "", to: "" });
  const [exCount, setExCount] = useState<number | null>(null);
  const [cleanAsk, setCleanAsk] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [histTab, setHistTab] = useState<"all" | "mine" | "others">("all");
  const [endAsk, setEndAsk] = useState(false);
  const [endBusy, setEndBusy] = useState(false);
  useEffect(() => { const on = () => setHistOpen(true); window.addEventListener("v3-audit-hist", on); return () => window.removeEventListener("v3-audit-hist", on); }, []);
  useEffect(() => {
    if (!fOpen) return;
    let live = true;
    const t = setTimeout(() => api.get<Resp>(`/admin/audit?page=1&limit=1&${qsOf({ cat, status: dStatus, actor: dActor, ...datesFor(dRange, dCustom) })}`).then((r) => { if (live) setDCount(r.total); }).catch(() => {}), 200);
    return () => { live = false; clearTimeout(t); };
  }, [fOpen, dRange, dCustom, dStatus, dActor, cat, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const exQs = qsOf({ cat, status, actor, ...datesFor(exRange === "all" ? "all" : exRange, exCustom) });
  useEffect(() => {
    if (!exOpen) return;
    let live = true; setExCount(null);
    api.get<Resp>(`/admin/audit?page=1&limit=1&${exQs}`).then((r) => { if (live) setExCount(r.total); }).catch(() => {});
    if (me?.isOwner) { setCleanAsk(false); api.get<{ count: number }>("/admin/audit/cleanup?days=180").then((r) => { if (live) setCleanCount(r.count); }).catch(() => {}); }
    return () => { live = false; };
  }, [exOpen, exQs]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const exportCsv = useCallback(async (over?: { qs: string; from: string; to: string; total: number }) => {
    const n = over ? over.total : total, eqs = over ? over.qs : qs, d = over || dates;
    toast.info("Експорт почався", { description: `${n.toLocaleString("uk-UA")} ${plural(n, "запис", "записи", "записів")} · CSV` });
    try {
      const blob = await api.download(`/admin/audit/export?${eqs}`);
      const name = `audit-${d.from || "all"}${d.to ? `_${d.to}` : ""}.csv`;
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

  function info(it: Item) {
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
    return { e, v, isOpen, ui, res, n, groupDiff, verb, target, chipList, dm, diff };
  }

  function row(it: Item) {
    const { e, v, isOpen, ui, res, n, groupDiff, verb, target, chipList, dm, diff } = info(it);
    if (!wide) return (
      <div key={it.id} className={`v3-au-mev${e.status === "failed" ? " is-err" : v.security ? " is-warn" : ""}${isOpen ? " is-open" : ""}`} role="button" tabIndex={0} aria-expanded={isOpen}
        onClick={(ev) => { if ((ev.target as HTMLElement).closest("a, button")) return; setOpen(isOpen ? null : it.id); }}
        onKeyDown={(ev) => { if ((ev.key === "Enter" || ev.key === " ") && ev.target === ev.currentTarget) { ev.preventDefault(); setOpen(isOpen ? null : it.id); } }}>
        <span className="v3-au-ico" style={{ background: e.status === "failed" ? "#ffe2dc" : ui.bg, color: e.status === "failed" ? "#9a2a17" : ui.fg }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d={ui.d} /></svg></span>
        <div className="v3-au-mbody">
          <div className="v3-au-mtop"><span title={exactTime(e.created_at)}>{timeLabel(e.created_at)} · @{e.actor_name}</span><span className={`v3-au-pill ${res.cls}`}><i />{res.label}</span></div>
          <div className="v3-au-mtxt">{verb[0].toUpperCase() + verb.slice(1)} {target && <strong>{target}</strong>} {n > 0 && <span className="v3-au-count">×{n}</span>}</div>
          {n ? <div className="v3-au-mgroup">{groupDiff.slice(0, 2).map((g, i) => <span key={i}>{g.k} · <s>{dm(g.from)}</s> → <strong>{dm(g.to)}</strong></span>)}{n > 2 && <button type="button" onClick={() => setOpen(isOpen ? null : it.id)}>{isOpen ? "Згорнути" : `+ ще ${n - 2}`}</button>}{isOpen && groupDiff.slice(2).map((g, i) => <span key={i}>{g.k} · <s>{dm(g.from)}</s> → <strong>{dm(g.to)}</strong></span>)}</div> : chips(v.chips)}
          {e.status === "failed" && <div className="v3-au-merr">Дію не виконано — зміни не збережено.</div>}
          {v.security && e.action === "LOGIN_NEW_DEVICE" && <span className="v3-au-mlink">{v.meta}</span>}
          {e.status === "failed" && v.userId && <Link className="v3-au-mlink" to={`/users?q=${encodeURIComponent(v.username || "")}`}>Повторити з картки →</Link>}
          {isOpen && (
            <div className="v3-au-mxp">
              {diff.length > 0 ? (
                <div className="v3-au-mdiff">
                  {diff.map((f, i) => <div key={i} className="v3-au-mdrow"><span className="k">{f.k}</span><span className="v">{f.from !== "—" && <><s>{f.from}</s> → </>}<strong>{f.to}</strong></span></div>)}
                </div>
              ) : <p className="v3-au-mnone">Без зміни значень</p>}
              {!e.details?._changes && !n && diff.length > 0 && !["sec", "key"].includes(v.kind) && <p className="v3-au-mnone">Попередні значення для цієї дії не зберігаються</p>}
              <p className="v3-au-mmeta">{n ? `${n} дій згорнуто в одну` : v.meta}{(n || v.meta) ? " · " : ""}{exactTime(e.created_at)}</p>
              {(v.username || v.userId) && <div className="v3-au-mlinks">
                {v.username && <Link to={`/users?q=${encodeURIComponent(v.username)}`}>Профіль</Link>}
                {v.userId && <Link to={`/audit?userId=${v.userId}&username=${encodeURIComponent(v.username || "")}`} onClick={() => setPage(1)}>Уся історія →</Link>}
              </div>}
            </div>
          )}
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
        <PillTrack active={cat} />
          {CATS.filter(([k]) => k === "all" || (counts[k] || 0) > 0 || k === cat).map(([k, l]) => <button key={k} type="button" className={cat === k ? "is-on" : ""} aria-pressed={cat === k} onClick={() => { setCat(k); setPage(1); }}>{l} <span className="v3-seg-n">{k === "all" ? allCount : counts[k] || 0}</span></button>)}
        </div>
      ) : (
        <Dropdown className="v3-au-mdd" ariaLabel="Тип" value={cat} onChange={(v) => { setCat(v); setPage(1); }} options={CATS.map(([k, l]) => ({ value: k, label: `${k === "all" ? "Усі типи" : l}${k !== "all" && counts[k] ? ` · ${counts[k]}` : ""}` }))} />
      )}
      {!wide && <Dropdown className="v3-au-mdd" ariaLabel="Автор" align="right" value={actor} onChange={(v) => { setActor(v); setPage(1); }} options={[{ value: "", label: "Усі автори" }, ...(data?.actors || []).map((a) => ({ value: a.name, label: `@${a.name}${a.week ? ` · ${a.week} за тиждень` : ""}` }))]} />}
      {wide && <Dropdown className="is-light v3-au-wdd" ariaLabel="Автор" value={actor} onChange={(v) => { setActor(v); setPage(1); }} options={[{ value: "", label: "Усі автори" }, ...(data?.actors || []).map((a) => ({ value: a.name, label: `@${a.name}${a.week ? ` · ${a.week} за тиждень` : ""}` }))]} />}
      {wide && <Dropdown className="is-light v3-au-wdd" ariaLabel="Результат" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: "all", label: "Усі результати" }, { value: "success", label: "Виконано" }, { value: "failed", label: "Помилка" }, { value: "pending", label: "Не підтверджено" }]} />}
      <Dropdown className={wide ? "is-light v3-au-wdd" : "v3-au-mdd is-full"} align={wide ? "right" : "left"} ariaLabel="Період" value={range} onChange={(v) => { setRange(v); setPage(1); }} options={RANGES.map(([k, l]) => ({ value: k, label: l }))} />
      {range === "custom" && <div className="v3-au-custom"><label>З <input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></label><label>По <input type="date" value={custom.to} min={custom.from || undefined} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></label></div>}
    </>
  );

  // ── phone body ──
  const rangeText = (r: string) => (r === "custom" ? (dates.from ? `${dates.from.slice(8)}.${dates.from.slice(5, 7)}–${dates.to.slice(8)}.${dates.to.slice(5, 7)}` : "Свій період") : PERIODS.find((x) => x[0] === r)?.[1] || "");
  const extra = [range !== "all", status !== "all", !!actor].filter(Boolean).length;
  const phoneSub = data && !loading && items.length === 0 && !q
    ? "0 дій за обраний період"
    : extra ? [range !== "all" && rangeText(range), status !== "all" && (RESULT_UI[status]?.label || status), actor && `@${actor}`, `${total} ${plural(total, "запис", "записи", "записів")}`].filter(Boolean).join(" · ") : "";
  const catOrder = CATS;
  const IN_CAT: Record<string, string> = { users: "Користувачах", payments: "Оплатах", banners: "Банерах", ads: "Рекламі", settings: "Налаштуваннях", security: "Безпеці" };
  const entryIt = entryId ? items.find((x) => x.id === entryId) || null : null;
  const openFilter = () => { setDRange(range); setDCustom(custom); setDStatus(status); setDActor(actor); setDCount(total); setFOpen(true); };
  const endOthers = async () => {
    if (!endAsk) { setEndAsk(true); window.setTimeout(() => setEndAsk(false), 3000); return; }
    setEndBusy(true);
    try { const r = await logoutOthers(); if (r.token && r.refreshToken) setTokens(r.token, r.refreshToken); const k = r.revoked ?? 0; toast.success("Інші сесії завершено", { description: `${k} ${plural(k, "сесію", "сесії", "сесій")} завершено` }); }
    catch (e) { toast.error("Не вдалося завершити сесії", { description: (e as Error).message }); }
    finally { setEndBusy(false); setEndAsk(false); }
  };
  const icon = (e: Entry, v: View, size = 16) => { const ui = KIND_UI[v.kind]; return <span className="v3-au-ico" style={{ background: e.status === "failed" ? "#ffe2dc" : ui.bg, color: e.status === "failed" ? "#9a2a17" : ui.fg }}><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d={ui.d} /></svg></span>; };
  const prow = (it: Item, i: number) => {
    const { e, v, res, n, verb, target, chipList } = info(it);
    const tag = e.status !== "success" || v.security;
    const mineLogin = v.security && e.action === "LOGIN_NEW_DEVICE" && e.actor_name === me?.username;
    const go = () => setEntryId(it.id);
    return (
      <div key={it.id} className="v3-au-pcard" role="button" tabIndex={0} style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
        onClick={(ev) => { if ((ev.target as HTMLElement).closest("a, button")) return; go(); }}
        onKeyDown={(ev) => { if ((ev.key === "Enter" || ev.key === " ") && ev.target === ev.currentTarget) { ev.preventDefault(); go(); } }}>
        {icon(e, v)}
        <div className="v3-au-pbody">
          <div className="v3-au-ptop"><span title={exactTime(e.created_at)}>{hm(e.created_at)} · @{e.actor_name}</span>{tag && <span className={`v3-au-ptag ${res.cls}`}>{res.label}</span>}</div>
          <div className="v3-au-ptxt">{verb[0].toUpperCase() + verb.slice(1)} {target && <strong>{target}</strong>}{n > 0 && <span className="v3-au-count">×{n}</span>}</div>
          {chipList.length > 0 && <div className="v3-au-pchips">{chipList.slice(0, 3).map((c, k) => <span key={k}>{c.k}: {c.from !== "—" && <><s>{c.from}</s> → </>}<b>{c.to}</b></span>)}</div>}
          {mineLogin && <div className="v3-au-psec"><span>Якщо це були не ви — завершіть інші сесії</span><button type="button" className={endAsk ? "is-ask" : ""} disabled={endBusy} onClick={() => void endOthers()}>{endBusy ? "Завершуємо…" : endAsk ? "Точно?" : "Завершити"}</button></div>}
        </div>
      </div>
    );
  };
  const histList = (data?.entries || []).filter((e) => histTab === "all" || (histTab === "mine" ? e.actor_name === me?.username : e.actor_name !== me?.username)).slice(0, 3);
  const phoneBody = (
    <>
      <div className="v3-au-pbar">
        <button type="button" className={`v3-au-pfbtn${extra ? " is-on" : ""}`} aria-label={`Фільтр${extra ? ` · ${extra} активних` : ""}`} onClick={openFilter}><Filter size={16} aria-hidden="true" />{extra > 0 && <i>{extra}</i>}</button>
        <div className="v3-au-pcats" role="group" aria-label="Тип записів">
          {catOrder.map(([k, l]) => <button key={k} type="button" className={cat === k ? "is-on" : ""} aria-pressed={cat === k} onClick={(ev) => { setCat(k); setPage(1); ev.currentTarget.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" }); }}>{l}</button>)}
        </div>
      </div>
      {extra > 0 && <div className="v3-au-pact">{["rg", "st", "ac"].map((k) => activeChips.find((c) => c.k === k)).filter((c): c is { k: string; label: string; off: () => void } => !!c).map((c) => <button key={c.k} type="button" onClick={() => { c.off(); setPage(1); }}>{c.k === "rg" ? rangeText(range) : c.label}<X size={12} aria-hidden="true" /></button>)}</div>}
      {q && data && <p className="v3-au-pfound">Знайдено {total} · логін, банер або № оплати</p>}
      {userId && null}
      {error && !data ? (
        <div className="v3-dcard v3-uerror" role="alert"><span className="v3-uerror-ico" aria-hidden="true">!</span><strong>Не вдалося завантажити журнал</strong><span>{error}. Записи не втрачено — спробуйте ще раз.</span><div><button type="button" className="v3-btn v3-btn-blue" onClick={() => setRev((x) => x + 1)}>Спробувати ще раз</button></div></div>
      ) : loading && !data ? (
        <div className="v3-au-plist" role="status" aria-label="Завантаження журналу">{[0, 1, 2, 3].map((i) => <div key={i} className="v3-au-pcard is-skel" aria-hidden="true"><i /><div><i /><i /></div></div>)}</div>
      ) : items.length === 0 ? (
        <div className="v3-au-pnone">
          <span className="v3-au-pico" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></svg></span>
          <strong>{filtered ? "Записів немає" : "Журнал поки порожній"}</strong>
          <span>{q ? `За «${q}» дій не знайдено. Спробуйте інший запит.` : cat !== "all" ? `За цей період дій у «${IN_CAT[cat] || CATS.find((c) => c[0] === cat)?.[1]}» не було. Змініть період або тип.` : filtered ? "За цей період дій не було. Змініть період або фільтри." : "Сюди потраплятимуть зміни користувачів, оплати, банери, реклама й налаштування."}</span>
          {filtered && <button type="button" className="v3-au-pbtn" onClick={() => { reset(); pageSearch.setQ(""); pageSearch.setOpen(false); }}>Скинути фільтри</button>}
        </div>
      ) : (
        <div className="v3-au-plist" key={`${cat}-${rev}`}>
          {days.map((d) => <section key={d.key}><p className="v3-au-pday">{d.label}</p><div className="v3-au-pgrp">{d.items.map(prow)}</div></section>)}
          {data?.hasMore && <button type="button" className="v3-au-pmore" disabled={loading} onClick={() => { setMore(entries); setPage(page + 1); }}>{loading ? "Завантажуємо…" : `Показати ще ${Math.min(LIMIT, total - entries.length)}`}</button>}
        </div>
      )}

      <Dialog open={!!entryIt} onOpenChange={(o) => { if (!o) setEntryId(null); }}>
        <DialogContent className="v3-sheet v3-pay-sheet v3-au-sheet">
          {entryIt && (() => {
            const { e, v, res, n, verb, target, diff } = info(entryIt);
            const d = e.details || {};
            const user = v.username || e.target_username || "";
            const inDiff = (k: string) => diff.some((f) => f.k === k);
            const dev = inDiff("Пристрій") ? "" : typeof d.device === "string" ? d.device : typeof d.userAgent === "string" ? d.userAgent : "";
            const ip = inDiff("IP") ? "" : typeof d.ip === "string" ? d.ip : "";
            return <>
              <div className="v3-au-sh">{icon(e, v, 18)}<div><DialogTitle>{verb[0].toUpperCase() + verb.slice(1)} {target.split(" · ")[0]}{n > 0 ? ` ×${n}` : ""}</DialogTitle><DialogDescription>{whenText(e.created_at)} · @{e.actor_name}</DialogDescription></div></div>
              <span className={`v3-au-ptag ${res.cls} v3-au-shtag`}>{res.label}</span>
              {diff.length > 0 ? <>
                <p className="v3-au-shl">Що змінилось</p>
                <div className="v3-au-shdiff">{diff.map((f, i) => <div key={i}><span>{f.k}</span><s className={f.from === "—" ? "is-none" : ""}>{f.from}</s><b>{f.to}</b></div>)}</div>
              </> : <p className="v3-au-shnone">{v.meta || "Без зміни значень"}</p>}
              <dl className="v3-au-shdl">
                {user && <div><dt>Користувач</dt><dd><Link to={`/users?q=${encodeURIComponent(user)}`}>@{user} →</Link></dd></div>}
                {dev && <div><dt>Пристрій</dt><dd>{dev}</dd></div>}
                {ip && <div><dt>IP</dt><dd>{ip}</dd></div>}
                {!user && !dev && !ip && <div><dt>Час</dt><dd>{exactTime(e.created_at)}</dd></div>}
              </dl>
              <div className={`v3-au-shacts${user ? "" : " is-one"}`}>
                <button type="button" className="v3-au-shbtn" onClick={() => { setActor(e.actor_name); setPage(1); setEntryId(null); }}>Усі дії @{e.actor_name}</button>
                {user && <Link className="v3-au-shbtn is-green" to={v.kind === "pay" ? `/payments?user=${encodeURIComponent(user)}` : `/users?q=${encodeURIComponent(user)}`}>{v.kind === "pay" ? "Відкрити оплату" : "Відкрити користувача"}</Link>}
              </div>
            </>;
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={fOpen} onOpenChange={setFOpen}>
        <DialogContent className="v3-sheet v3-pay-sheet v3-au-sheet v3-au-fsheet">
          <div className="v3-au-fh"><DialogTitle>Фільтр</DialogTitle>{(dRange !== "all" || dStatus !== "all" || dActor) && <button type="button" onClick={() => { setDRange("all"); setDStatus("all"); setDActor(""); }}>Скинути</button>}</div>
          <DialogDescription className="sr-only">Період, результат і автор</DialogDescription>
          <p className="v3-au-shl">Період</p>
          <div className="v3-au-seg is-4" role="group" aria-label="Період"><PillTrack active={dRange} />{PERIODS.map(([k, l]) => <button key={k} type="button" className={dRange === k ? "is-on" : ""} aria-pressed={dRange === k} onClick={() => setDRange(dRange === k ? "all" : k)}>{l}</button>)}</div>
          {dRange === "custom" && <div className="v3-au-pdates"><label>З <input type="date" value={dCustom.from} onChange={(e) => setDCustom({ ...dCustom, from: e.target.value })} /></label><label>По <input type="date" value={dCustom.to} min={dCustom.from || undefined} onChange={(e) => setDCustom({ ...dCustom, to: e.target.value })} /></label></div>}
          <p className="v3-au-shl">Результат</p>
          <div className="v3-au-seg is-3" role="group" aria-label="Результат"><PillTrack active={dStatus} />{([["all", "Усі"], ["success", "Виконано"], ["failed", "Помилка"]] as const).map(([k, l]) => <button key={k} type="button" className={dStatus === k ? "is-on" : ""} aria-pressed={dStatus === k} onClick={() => setDStatus(k)}>{l}</button>)}</div>
          <p className="v3-au-shl">Автор</p>
          <div className="v3-au-actors" role="group" aria-label="Автор">
            <button type="button" className={dActor === "" ? "is-on" : ""} aria-pressed={dActor === ""} onClick={() => setDActor("")}><span>Усі автори</span>{dActor === "" && <Check size={16} strokeWidth={2.6} aria-hidden="true" />}</button>
            {(data?.actors || []).map((a) => <button key={a.name} type="button" className={dActor === a.name ? "is-on" : ""} aria-pressed={dActor === a.name} onClick={() => setDActor(a.name)}><span>@{a.name}{a.name === "system" ? <small> · автоматично</small> : null}</span>{dActor === a.name ? <Check size={16} strokeWidth={2.6} aria-hidden="true" /> : <b>{a.total}</b>}</button>)}
          </div>
          <button type="button" className="v3-au-apply" onClick={() => { setRange(dRange); setCustom(dCustom); setStatus(dStatus); setActor(dActor); setPage(1); setFOpen(false); }}>Показати{dCount != null ? ` ${dCount.toLocaleString("uk-UA")} ${plural(dCount, "запис", "записи", "записів")}` : ""}</button>
        </DialogContent>
      </Dialog>

      <Dialog open={exOpen} onOpenChange={setExOpen}>
        <DialogContent className="v3-sheet v3-pay-sheet v3-au-sheet v3-au-xsheet">
          <div className="v3-au-xh"><DialogTitle>Експорт журналу</DialogTitle><DialogDescription>CSV-файл · відкривається в Excel і Google Таблицях</DialogDescription></div>
          <p className="v3-au-shl">Період</p>
          <div className="v3-au-seg is-4" role="group" aria-label="Період експорту"><PillTrack active={exRange} />{EX_PERIODS.map(([k, l]) => <button key={k} type="button" className={exRange === k ? "is-on" : ""} aria-pressed={exRange === k} onClick={() => setExRange(k)}>{l}</button>)}</div>
          {exRange === "custom" && <div className="v3-au-pdates"><label>З <input type="date" value={exCustom.from} onChange={(e) => setExCustom({ ...exCustom, from: e.target.value })} /></label><label>По <input type="date" value={exCustom.to} min={exCustom.from || undefined} onChange={(e) => setExCustom({ ...exCustom, to: e.target.value })} /></label></div>}
          <dl className="v3-au-shdl">
            <div><dt>Записів</dt><dd>{exCount == null ? "рахуємо…" : exCount.toLocaleString("uk-UA")}</dd></div>
            <div><dt>Фільтри</dt><dd>{[cat === "all" ? "усі типи" : (CATS.find((c) => c[0] === cat)?.[1] || cat).toLowerCase(), actor ? `@${actor}` : "усі автори", status !== "all" ? (RESULT_UI[status]?.label || "").toLowerCase() : ""].filter(Boolean).join(" · ")}</dd></div>
          </dl>
          <button type="button" className="v3-au-apply" disabled={!exCount} onClick={() => { const d2 = datesFor(exRange, exCustom); void exportCsv({ qs: exQs, ...d2, total: exCount || 0 }); setExOpen(false); }}><Download size={16} aria-hidden="true" />Завантажити CSV</button>
          {owner && <div className="v3-au-old">
            <strong>Старі записи</strong>
            <span>Записи, старші за 180 днів, можна видалити. Лише для овнера, дію не можна скасувати.</span>
            <button type="button" className={`v3-au-clean${cleanAsk ? " is-ask" : ""}`} disabled={cleaning || cleanCount === 0} onClick={() => { if (!cleanAsk) { setCleanDays(180); setCleanAsk(true); window.setTimeout(() => setCleanAsk(false), 3500); return; } void cleanup().then(() => setExOpen(false)); }}>
              {cleaning ? "Видаляємо…" : cleanCount === 0 ? "Старших за 180 днів немає" : cleanAsk ? `Точно видалити ${cleanCount ?? ""} ${plural(cleanCount ?? 0, "запис", "записи", "записів")}?` : "Очистити старші за 180 днів"}
            </button>
          </div>}
        </DialogContent>
      </Dialog>

      <Dialog open={histOpen} onOpenChange={setHistOpen}>
        <DialogContent className="v3-sheet v3-pay-sheet v3-au-sheet v3-au-hsheet">
          <DialogTitle>Журнал дій</DialogTitle>
          <DialogDescription className="sr-only">Останні дії адмінів</DialogDescription>
          <div className="v3-au-seg is-3" role="group" aria-label="Чиї дії"><PillTrack active={histTab} />{([["all", "Усі"], ["mine", "Мої"], ["others", "Інших адмінів"]] as const).map(([k, l]) => <button key={k} type="button" className={histTab === k ? "is-on" : ""} aria-pressed={histTab === k} onClick={() => setHistTab(k)}>{l}</button>)}</div>
          <div className="v3-au-hlist" key={histTab}>
            {histList.length ? histList.map((e, i) => { const v = describe(e); const user = v.username || e.target_username || ""; return (
              <div key={e.id} className="v3-au-hcard" style={{ animationDelay: `${i * 40}ms` }}>
                <small>{dmy(e.created_at)}</small>
                <b>{v.verb[0].toUpperCase() + v.verb.slice(1)} {v.target.split(" · ")[0]}</b>
                <span>@{e.actor_name}{user ? ` · @${user}` : ""}{v.meta ? ` · ${v.meta}` : ""}</span>
                {v.kind === "pay" && user && <Link className="v3-au-apply" to={`/payments?user=${encodeURIComponent(user)}`} onClick={() => setHistOpen(false)}>Відкрити оплату</Link>}
              </div>); })
              : <div className="v3-au-shnone"><History size={20} aria-hidden="true" /><strong>{histTab === "mine" ? "Ваших дій ще немає" : histTab === "others" ? "Інші адміни ще нічого не змінювали" : "Дій ще немає"}</strong><span>Тут з’являться останні зміни в адмінці.</span></div>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );

  const failedNote = sum?.lastFailed ? short(describe(sum.lastFailed), sum.lastFailed) : "усе виконано";
  const secNote = sum?.lastSecurity ? short(describe(sum.lastSecurity), sum.lastSecurity) : "подій немає";

  return (
    <div className="v3-page v3-auditpg">
      <section className="v3-hero v3-hero-row">
        <div>
          <h1 className="v3-title">Журнал дій</h1>
          <p className="v3-subtitle"><span className="v3-hide-mobile">Хто, що і коли змінив: користувачі, оплати, банери, реклама, налаштування. Паролі й токени не записуються.</span><span className="v3-only-mobile">{phone && phoneSub ? phoneSub : sum ? `${sum.today} ${plural(sum.today, "дія", "дії", "дій")} сьогодні · ${sum.failed7} ${plural(sum.failed7, "помилка", "помилки", "помилок")}` : "Хто, що і коли змінив"}</span></p>
        </div>
        <div className="v3-chips">
          {owner && <button type="button" className="v3-chip v3-hide-mobile" onClick={() => setCleanOpen(true)}>Очистити старі записи</button>}
          <ExportCsvButton className="v3-btn v3-btn-primary v3-hide-mobile" disabled={!total} onClick={() => exportCsv()} />
          {phone
            ? <button type="button" className="v3-au-hbtn" aria-label="Експорт журналу" onClick={() => { setExRange("30"); setExOpen(true); }}><Download size={18} aria-hidden="true" /></button>
            : <ExportCsvButton className="v3-au-mexp v3-only-mobile" iconOnly size={18} disabled={!total} onClick={() => exportCsv()} />}
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
          <UserAvatar username={params.get("username") || "?"} telegram={histTg} className="v3-au-hist-av" />
          <div><strong>Історія @{params.get("username") || `користувача №${userId}`}</strong><small>з моменту підключення журналу</small><small>{total} {plural(total, "запис", "записи", "записів")}</small></div>
          <Link className="v3-au-hist-btn" to="/audit" onClick={() => { setParams({}); setPage(1); }}>Увесь журнал</Link>
        </div>
      )}

      {phone ? phoneBody : error && !data ? (
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

/** Phone keeps its own layout; from 768 px the light web page. */
export default function AuditLog() {
  const phone = useMedia("(max-width: 767px)");
  return phone ? <AuditLegacy /> : <AuditWeb />;
}
