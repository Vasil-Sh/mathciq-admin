import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronRight, ExternalLink, Info, LayoutGrid, List, Play, Plus, RefreshCw, Search, Send, Square, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import PillTrack from "@/components/PillTrack";
import RollingNumber from "@/components/RollingNumber";
import { ConfirmSheet } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { TgAvatar } from "@/components/ads/AdsShared";
import { useOnline } from "@/hooks/useMediaOnline";
import { addTgChannel, deleteTgChannel, rereadTgChannel, fetchTgMatches, fetchTgPosts, fetchTgSources, fetchTgUnrecognized, fixTgPost, pauseTgChannel, previewTgChannel, refreshTgChannel,
  type TgChannel, type TgList, type TgMatch, type TgPost, type TgPreview } from "@/lib/tgSourcesApi";

/** «Telegram-джерела»: public t.me channels we read, what we made of their posts, the posts we did not understand (design «Telegram-джерела», phone first). */
const COLORS = ["#2aa3e0", "#7c3aed", "#e5484d", "#f97316", "#0ea5e9", "#1f9d55", "#334155"];
const colorOf = (s: string) => COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const GAME: Record<string, string> = { cs2: "CS2", dota2: "Dota 2", both: "CS2 · Dota 2" };
const plural = (n: number, a: string, b: string, c: string) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };
const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv" }) : "—");
const when = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso), day = (x: Date) => x.toLocaleDateString("sv-SE", { timeZone: "Europe/Kyiv" }), now = new Date();
  if (day(d) === day(now)) return hhmm(iso);
  if (day(d) === day(new Date(now.getTime() - 86_400_000))) return `вчора ${hhmm(iso)}`;
  return d.toLocaleDateString("uk-UA", { day: "numeric", month: "short", timeZone: "Europe/Kyiv" });
};
const MARKET = (p: TgPost) => {
  const m = p.market || "";
  if (m === "Match Winner") return `П${p.pick === p.team2 ? 2 : 1} · ${p.pick}`;
  const t = /^Total Maps (Over|Under) ([\d.]+)$/.exec(m); if (t) return `Тотал карт ${t[1] === "Over" ? ">" : "<"} ${t[2]}`;
  const h = /^Handicap ([+-][\d.]+)$/.exec(m); if (h) return `Фора ${h[1].replace("-", "−")} · ${p.pick}`;
  return m;
};
const KIND = (p: TgPost): [string, string] => p.kind === "bet" ? ["Прогноз", "is-ok"] : p.kind === "unknown" ? ["Не розпізнано", "is-warn"] : p.reason === "Повтор" ? ["Повтор", "is-off"] : ["Інфо", "is-off"];
const money = (n: number | null | undefined) => (n == null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("uk-UA")}`);
const pct = (n: number | null | undefined) => (n == null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}%`);
const tone = (n: number | null | undefined) => (n == null || n === 0 ? "" : n > 0 ? "is-ok" : "is-bad");
const WD = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("uk-UA", { weekday: "short", timeZone: "UTC" });
const readView = (): "list" | "grid" => { try { return localStorage.getItem("v3-tg-posts-view") === "grid" ? "grid" : "list"; } catch { return "list"; } };
const odds = (n: number | null) => (n == null ? "" : n.toFixed(2).replace(".", ","));

/** Screenshots of a post; a link that expired on the t.me CDN just disappears. */
function Shots({ urls, big }: { urls?: string[]; big?: boolean }) {
  const [bad, setBad] = useState<string[]>([]);
  const ok = (urls || []).filter((u) => !bad.includes(u));
  if (!ok.length) return null;
  return <span className={`v3-tg-shots${big ? " is-big" : ""}`}>{ok.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><img src={u} alt="Скрін ставки" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad((b) => [...b, u])} /></a>)}</span>;
}

export default function Telegram() {
  const online = useOnline();
  const [data, setData] = useState<TgList | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"ch" | "un">("ch");
  const [busy, setBusy] = useState(false);
  const [unk, setUnk] = useState<TgPost[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [posts, setPosts] = useState<TgPost[] | null>(null);
  const [fix, setFix] = useState<TgPost | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [stopAsk, setStopAsk] = useState<TgChannel | null>(null);
  const [delAsk, setDelAsk] = useState<TgChannel | null>(null);
  const [view, setView] = useState<"list" | "grid">(readView);
  const pickView = (v: "list" | "grid") => { setView(v); try { localStorage.setItem("v3-tg-posts-view", v); } catch { /* private mode */ } };

  const load = useCallback(async () => {
    try { setData(await fetchTgSources()); setErr(""); } catch (e) { setErr((e as Error).message); }
    fetchTgUnrecognized().then(setUnk).catch(() => setUnk([]));
  }, []);
  useEffect(() => { void load(); }, [load]);
  // while a channel is being re-read: refresh every 5 s for the progress
  const reading = !!data?.channels.some((c) => c.rereadTotal);
  useEffect(() => { if (!reading) return; const id = setInterval(() => void load(), 5_000); return () => clearInterval(id); }, [reading, load]);
  // The sheet opens once its posts are here, so it never jumps from placeholders to a taller sheet.
  const cache = useRef(new Map<string, TgPost[]>());
  const [opening, setOpening] = useState<string | null>(null);
  const getPosts = (h: string) => fetchTgPosts(h).then((p) => { cache.current.set(h, p); return p; });
  const openCh = async (h: string) => {
    const hit = cache.current.get(h);
    if (hit) { setPosts(hit); setSel(h); getPosts(h).then((p) => setPosts((cur) => (cur === hit ? p : cur))).catch(() => {}); return; }
    setOpening(h);
    const p = await getPosts(h).catch(() => [] as TgPost[]);
    setOpening(null); setPosts(p); setSel(h);
  };

  const ch = data?.channels.find((c) => c.handle === sel) || null;
  const refreshAll = async () => {
    setBusy(true);
    try { await refreshTgChannel("all"); toast.success("Збір запущено", { description: "Нові пости з’являться за хвилину" }); setTimeout(() => void load(), 20_000); }
    catch (e) { toast.error("Не вдалося запустити", { description: (e as Error).message }); }
    finally { setBusy(false); }
  };
  const refreshOne = async (h: string) => {
    try { await refreshTgChannel(h); toast.success("Збір запущено", { description: "Пости зі скрінами читаються кілька секунд кожен — оновимо за хвилину" }); setTimeout(() => { void load(); if (sel === h) getPosts(h).then(setPosts).catch(() => {}); }, 45_000); }
    catch (e) { toast.error("Не вдалося оновити", { description: (e as Error).message }); }
  };
  const reread = async (h: string) => {
    try { const r = await rereadTgChannel(h); toast.success(`Перечитуємо ${r.posts} ${plural(r.posts, "пост", "пости", "постів")}`, { description: "Прогрес — на картці каналу" }); setSel(null); setTimeout(() => void load(), 1_500); }
    catch (e) { toast.error("Не вдалося", { description: (e as Error).message }); }
  };
  const setPaused = async (c: TgChannel, paused: boolean) => {
    try { await pauseTgChannel(c.handle, paused); toast.success(paused ? "Збір зупинено" : "Збір запущено", { description: c.title || `@${c.handle}` }); setStopAsk(null); await load(); }
    catch (e) { toast.error("Не вдалося", { description: (e as Error).message }); }
  };
  const remove = async (c: TgChannel) => {
    try { await deleteTgChannel(c.handle); toast.success("Тестовий канал видалено"); setDelAsk(null); setSel(null); await load(); }
    catch (e) { toast.error("Не вдалося видалити", { description: (e as Error).message }); }
  };

  const t = data?.totals;
  return (
    <div className="v3-page v3-pay v3-tg">
      <section className="v3-hero v3-hero-row">
        <div>
          <h1 className="v3-title">Telegram</h1>
          <p className="v3-subtitle">{data ? `${t!.channels} ${plural(t!.channels, "канал", "канали", "каналів")} · ${t!.posts24h} ${plural(t!.posts24h, "пост", "пости", "постів")} за 24 год${data.night ? " · нічний режим" : ""}` : "Публічні канали, які ми читаємо"}</p>
        </div>
        <div className="v3-chips">
          <button type="button" className={`v3-chip v3-mx-rf${busy ? " is-busy" : ""}`} disabled={!online || busy} onClick={() => void refreshAll()} aria-label="Оновити всі канали"><RefreshCw size={15} aria-hidden="true" /></button>
          <button type="button" className="v3-btn v3-btn-primary v3-mx-plus" disabled={!online} onClick={() => setAddOpen(true)} aria-label="Додати канал"><Plus size={17} aria-hidden="true" /></button>
        </div>
      </section>

      {err && !data ? <div className="v3-dcard v3-uerror" role="alert"><span className="v3-uerror-ico" aria-hidden="true">!</span><strong>Не вдалося завантажити канали</strong><code className="v3-uerror-det">{err}</code><div><button type="button" className="v3-btn v3-btn-blue" onClick={() => void load()}>Спробувати ще раз</button></div></div> : <>
        <section className="v3-sums v3-pay-sums v3-mx-sums" aria-label="Підсумки">
          <div className="v3-sum is-static is-on"><span className="v3-sum-l">Постів за 24 год</span><strong className="v3-sum-v"><RollingNumber key={`p${t?.posts24h}`} text={t ? String(t.posts24h) : "—"} /></strong><span className="v3-sum-n"><span className="v3-pay-note">{t ? `прогнозів ${t.tips24h}` : "…"}</span></span></div>
          <div className="v3-sum is-static"><span className="v3-sum-l">Розпізнано</span><strong className="v3-sum-v"><RollingNumber key={`r${t?.recognized}`} text={t?.recognized != null ? `${t.recognized}%` : "—"} /></strong><span className="v3-sum-n"><span className="v3-pay-note">{t ? ((t.queue ?? t.unknown7d) ? `${t.queue ?? t.unknown7d} ${plural(t.queue ?? t.unknown7d, "чекає", "чекають", "чекають")} розбору` : "черга порожня") : "…"}</span></span></div>
        </section>

        <div className="v3-pay-tabs v3-tg-tabs" role="tablist" aria-label="Розділи">
          <PillTrack active={tab} />
          {([["ch", "Канали", data?.channels.length], ["un", "Нерозпізнані", unk?.length]] as const).map(([k, l, n]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={`v3-pay-tab${tab === k ? " is-on" : ""}`} onClick={() => setTab(k)}><span>{l}{n != null ? ` · ${n}` : ""}</span></button>)}
        </div>

        {tab === "ch" ? (
          !data ? <div className="v3-tg-list" aria-hidden="true">{[0, 1, 2].map((i) => <div key={i} className="v3-tg-card is-skel"><span className="v3-skel v3-skel-light" /><span className="v3-skel v3-skel-light" /></div>)}</div>
          : !data.channels.length && !data.invites.length ? <div className="v3-mxp-none"><span className="v3-mxp-none-ic" aria-hidden="true"><Send size={20} /></span><strong>Каналів ще немає</strong><span>Додайте публічний канал кнопкою «+» або дочекайтесь, поки користувач Pro додасть посилання t.me/… у «Telegram-групи».</span><button type="button" onClick={() => setAddOpen(true)}>Додати канал</button></div>
          : <div className="v3-tg-list">
            {data.channels.map((c, i) => { const mx = Math.max(1, ...c.days); const A = c.all; const wk = c.days.reduce((x, n) => x + n, 0); return (
              <div key={c.handle} className={`v3-mxp-pc v3-tg-pc${c.status === "run" ? "" : " is-paused"}${opening === c.handle ? " is-opening" : ""}`} style={{ animationDelay: `${i * 60}ms` }} role="button" tabIndex={0} aria-label={`Відкрити ${c.title || c.handle}`} onClick={() => !opening && void openCh(c.handle)} onKeyDown={(e) => { if (e.key === "Enter" && !opening) void openCh(c.handle); }}>
                <div className="v3-mxp-ph">
                  <span className="v3-tg-av is-s"><TgAvatar handle={c.handle} name={c.title || c.handle} color={colorOf(c.handle)} /></span>
                  <strong>{c.title || `@${c.handle}`}</strong>
                  <span className="v3-mxp-pa" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="v3-mxp-plog" onClick={() => !opening && void openCh(c.handle)} aria-label={`Пости й статистика · ${c.title || c.handle}`}><Info size={16} aria-hidden="true" /></button>
                    {c.status === "block" ? null : c.paused
                      ? <button type="button" className="v3-mxp-pgo" disabled={!online} onClick={() => void setPaused(c, false)}><Play size={13} aria-hidden="true" />Запустити</button>
                      : <button type="button" className="v3-mxp-pstop" disabled={!online} onClick={() => setStopAsk(c)} aria-label={`Зупинити ${c.title || c.handle}`}><i aria-hidden="true"><Square size={7} fill="currentColor" /></i>Стоп</button>}
                  </span>
                </div>
                <small className="v3-mxp-psub">{c.status === "err" ? c.error : `@${c.handle} · ${GAME[c.game]}${c.isTest ? " · тест" : ""} · останній пост ${when(c.lastPostAt)}`}</small>
                {!!c.rereadTotal && (() => { const done = Math.max(0, c.rereadTotal - (c.rereading || 0)), p = Math.min(100, Math.round((done / c.rereadTotal) * 100)); return (
                  <div className="v3-tg-prog" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label="Перечитуємо пости">
                    <span className="v3-tg-progh"><i className="v3-tg-spin" aria-hidden="true" />Перечитуємо пости<b>{p}%</b></span>
                    <span className="v3-tg-progb"><i style={{ width: `${p}%` }} /></span>
                    <small>{done} з {c.rereadTotal} · ≈6 с на пост</small>
                  </div>
                ); })()}
                {c.status !== "block" && <div className="v3-tg-week">
                  <div className="v3-mxp-wh"><span>7 днів</span><b>{wk ? `${wk} ${plural(wk, "пост", "пости", "постів")} · прогнозів ${c.tips7d}` : "постів не було"}</b></div>
                  <span className="v3-tg-bars" aria-hidden="true">{c.days.map((d, k) => <i key={k} className={`${k === 6 ? "is-today" : ""}${d ? "" : " is-zero"}`} style={{ height: `${d ? Math.max(14, Math.round((d / mx) * 100)) : 8}%` }} />)}</span>
                  <span className="v3-tg-wdays" aria-hidden="true">{data.days.map((d) => <span key={d}>{WD(d)}</span>)}</span>
                </div>}
                <div className="v3-mxp-ptiles">
                  <div><span>Прогнозів</span><b>{A ? A.tips : c.tips7d}</b></div>
                  <div><span>Розпізнано</span><b>{A?.recognized != null ? `${A.recognized}%` : "—"}</b></div>
                  <div><span>Прибуток</span><b className={tone(A?.profit)}>{money(A?.profit)}</b></div>
                </div>
                {A && A.posts > 0 && <div className="v3-mxp-podds"><p>Усього постів {A.posts}: прогнозів {A.tips}, нерозпізнаних {A.unknown}, інфо {A.other}{A.repeats ? `, повторів ${A.repeats}` : ""}</p><small>{A.won + A.lost ? `Розраховано ${A.won + A.lost}: ${A.won} виграш · ${A.lost} програш · ROI ${pct(A.roi)}` : "Розрахованих прогнозів ще немає"}{A.pending ? ` · очікують ${A.pending}` : ""} · перевірено {hhmm(c.checkedAt)}</small></div>}
              </div>
            ); })}
            {data.invites.map((g) => (
              <div key={g.link} className="v3-tg-card is-dim"><span className="v3-tg-ch"><span className="v3-tg-av"><TgAvatar handle="" name={g.name} color="#334155" /></span><span className="v3-tg-chn"><strong>{g.name}</strong><small>запрошення · {g.who.join(", ") || "—"}</small></span><em className="v3-tg-st is-warn">Приватний</em></span><span className="v3-tg-line">Посилання-запрошення — пости не видно. Поки читаємо лише публічні канали.</span></div>
            ))}
            {data.reader && <p className="v3-tg-note v3-tg-reader">{data.reader.ai
              ? <>Скріни й пости читає ШІ ({data.reader.model || "Gemini"}): {data.reader.aiCalls} {plural(data.reader.aiCalls, "запит", "запити", "запитів")}{data.reader.aiFailed ? ` · помилок ${data.reader.aiFailed}` : ""}{data.reader.aiError ? <><br /><b>Остання помилка:</b> {data.reader.aiError} — поки що читаємо OCR</> : null}</>
              : <>Скріни читає OCR (без ключа ШІ): {data.reader.ocrImages} {plural(data.reader.ocrImages, "скрін", "скріни", "скрінів")}{data.reader.ocrAvgMs ? ` · ≈${(data.reader.ocrAvgMs / 1000).toFixed(1).replace(".", ",")} с на скрін` : ""}{data.reader.ocrFailed ? ` · помилок ${data.reader.ocrFailed}` : ""}{data.reader.ocrError ? <><br /><b>Остання помилка:</b> {data.reader.ocrError}</> : null}</>}
              <br />Лічильники — з останнього запуску сервера.</p>}
            <p className="v3-tg-note">Канали з’являються самі, коли користувач додає публічне посилання t.me/… у «Telegram-групи». Збираємо раз на 10 хв, уночі 02–06 — раз на годину.</p>
          </div>
        ) : (
          unk === null ? <div className="v3-tg-list" aria-hidden="true"><div className="v3-tg-card is-skel"><span className="v3-skel v3-skel-light" /><span className="v3-skel v3-skel-light" /></div></div>
          : !unk.length ? <div className="v3-mxp-none"><span className="v3-mxp-none-ic" aria-hidden="true"><Check size={20} /></span><strong>Усе розібрано</strong><span>За 7 днів немає постів, схожих на прогноз, які ми не зрозуміли.</span></div>
          : <div className="v3-tg-list">
            {unk.map((p) => (
              <button key={`${p.handle}/${p.postId}`} type="button" className="v3-tg-card v3-tg-un" onClick={() => setFix(p)}>
                <span className="v3-tg-unh"><span className="v3-tg-av is-s"><TgAvatar handle={p.handle} name={p.title || p.handle} color={colorOf(p.handle)} /></span><b>{p.title || `@${p.handle}`}</b><small>{when(p.postedAt)}</small></span>
                <span className="v3-tg-unb"><Shots urls={p.photos} /><span className="v3-tg-untx">{p.text || (p.photos?.length ? "Скрін без підпису" : "")}</span></span>
                <em className="v3-tg-st is-warn">{p.reason || "Не розпізнано"}</em>
              </button>
            ))}
            <p className="v3-tg-note">Розібраний вручну пост рахується в статистиці каналу. «Запам’ятати» додає правило — схожі пости далі розпізнаються самі.</p>
          </div>
        )}
      </>}

      <Dialog open={!!ch} onOpenChange={(o) => { if (!o) setSel(null); }}>
        <DialogContent className="v3-sheet v3-pay-sheet v3-tg-sheet">
          {ch && <>
            <div className="v3-tg-sh"><span className="v3-tg-av is-l"><TgAvatar handle={ch.handle} name={ch.title || ch.handle} color={colorOf(ch.handle)} /></span><span className="v3-tg-chn"><DialogTitle>{ch.title || `@${ch.handle}`}</DialogTitle><DialogDescription>@{ch.handle} · {GAME[ch.game]}{ch.subscribers ? ` · ${ch.subscribers.toLocaleString("uk-UA")} підписників` : ""}{ch.isTest ? " · тестовий" : ""}</DialogDescription></span></div>
            {ch.status === "block" ? <p className="v3-tg-warn">Заблоковано в «Підтримці». Пости не збираємо, статистику не показуємо.</p>
              : ch.status === "err" ? <p className="v3-tg-warn is-bad">{ch.error}. Перевірте, чи канал публічний і чи не змінив нікнейм.</p> : null}
            <div className="v3-tg-kv">
              <div><span>Прогнозів</span><b>{ch.all?.tips ?? ch.tips7d}{ch.all?.pending ? <small> · очікує {ch.all.pending}</small> : null}</b></div>
              <div><span>Розпізнано</span><b className={ch.all?.recognized == null ? "" : ch.all.recognized >= 85 ? "is-ok" : ch.all.recognized >= 70 ? "is-warn" : "is-bad"}>{ch.all?.recognized != null ? `${ch.all.recognized}%` : "—"}</b></div>
              <div><span>Вінрейт</span><b>{ch.all?.winrate != null ? `${ch.all.winrate}%` : "—"}{ch.all && ch.all.won + ch.all.lost ? <small> · {ch.all.won}–{ch.all.lost}</small> : null}</b></div>
              <div><span>Прибуток · ROI</span><b className={tone(ch.all?.profit)}>{money(ch.all?.profit)}{ch.all?.roi != null ? <small> · {pct(ch.all.roi)}</small> : null}</b></div>
            </div>
            <p className="v3-tg-kvn">Прибуток — якби на кожен прогноз ставили 100. Повтори одного прогнозу рахуємо раз.</p>
            <div className="v3-tg-shh"><p>Останні пости <small>· перевірено {hhmm(ch.checkedAt)}{ch.users.length ? ` · додали ${ch.users.join(", ")}` : ""}</small></p>
              <span className="v3-tg-vt" role="group" aria-label="Вигляд">
                <button type="button" className={view === "list" ? "is-on" : ""} aria-pressed={view === "list"} aria-label="Списком" onClick={() => pickView("list")}><List size={16} aria-hidden="true" /></button>
                <button type="button" className={view === "grid" ? "is-on" : ""} aria-pressed={view === "grid"} aria-label="Картками" onClick={() => pickView("grid")}><LayoutGrid size={16} aria-hidden="true" /></button>
              </span></div>
            {posts === null ? <div className="v3-tg-posts" aria-hidden="true"><span className="v3-skel v3-skel-light" /><span className="v3-skel v3-skel-light" /></div>
              : !posts.length ? <p className="v3-tg-note">Постів ще немає — перший збір за кілька хвилин.</p>
              : <ul className={`v3-tg-posts${view === "grid" ? " is-grid" : ""}`}>{posts.slice(0, view === "grid" ? 20 : 12).map((p) => view === "grid" ? (
                <li key={p.postId} className="v3-tg-pg" onClick={() => p.kind === "unknown" && setFix({ ...p, title: ch.title })}>
                  {p.photos?.length ? <Shots urls={p.photos.slice(0, 1)} /> : <span className="v3-tg-pgtx">{p.text}</span>}
                  <span className="v3-tg-ph"><em className={`v3-tg-st ${KIND(p)[1]}`}>{KIND(p)[0]}</em>{p.result && <em className={`v3-tg-st ${p.result === "Win" ? "is-ok" : "is-bad"}`}>{p.result === "Win" ? "Виграш" : "Програш"}</em>}</span>
                  <small>{when(p.postedAt)}{p.kind === "bet" && p.odds ? ` · ${odds(p.odds)}` : ""}</small>
                </li>
              ) : (
                <li key={p.postId}>
                  <span className="v3-tg-ph"><small>{when(p.postedAt)}</small><em className={`v3-tg-st ${KIND(p)[1]}`}>{KIND(p)[0]}</em>
                    {p.result && <em className={`v3-tg-st ${p.result === "Win" ? "is-ok" : "is-bad"}`}>{p.result === "Win" ? "Виграш" : "Програш"}{p.score ? ` · ${p.score}` : ""}</em>}</span>
                  {(p.text || !p.photos?.length) && <span className="v3-tg-ptx">{p.text}</span>}
                  <Shots urls={p.photos} />
                  {p.kind === "bet" ? <b className="is-ok">→ {p.team1} — {p.team2} · {MARKET(p)}{p.odds ? ` · ${odds(p.odds)}` : ""}{!p.result ? " · очікує" : ""}</b>
                    : p.kind === "unknown" ? <button type="button" className="v3-tg-pfix" onClick={() => setFix({ ...p, title: ch.title })}>→ {p.reason} · розібрати<ChevronRight size={14} aria-hidden="true" /></button> : null}
                </li>
              ))}</ul>}
            <div className="v3-mxp-acts">
              {ch.status === "block" ? null : ch.paused
                ? <button type="button" className="is-green" disabled={!online} onClick={() => void setPaused(ch, false)}>▶ Запустити</button>
                : <button type="button" className="is-dark v3-tg-stop" disabled={!online} onClick={() => setStopAsk(ch)}><i aria-hidden="true" />Стоп</button>}
              {ch.status !== "block" && !ch.paused && <button type="button" className="is-grey" disabled={!online} onClick={() => void refreshOne(ch.handle)}><RefreshCw size={15} aria-hidden="true" /> Оновити</button>}
              <a className="is-grey v3-tg-open" href={`https://t.me/${ch.handle}`} target="_blank" rel="noreferrer">У Telegram<ExternalLink size={14} aria-hidden="true" /></a>
            </div>
            <button type="button" className="v3-tg-reread" disabled={!online} onClick={() => void reread(ch.handle)}><RefreshCw size={15} aria-hidden="true" />Перечитати пости каналу</button>
            {ch.isTest && <button type="button" className="v3-tg-del" disabled={!online} onClick={() => setDelAsk(ch)}>Видалити тестовий канал</button>}
          </>}
        </DialogContent>
      </Dialog>

      <ConfirmSheet open={!!stopAsk} tone="dark" icon={<span className="v3-tg-stopic" />} title={`Зупинити збір «${stopAsk?.title || stopAsk?.handle || ""}»?`}
        text="Нові пости не збиратимемо, поки не запустите знову. Уже зібрані прогнози й статистика лишаються." confirm="Зупинити"
        onOpenChange={(o) => { if (!o) setStopAsk(null); }} onConfirm={() => stopAsk && void setPaused(stopAsk, true)} />

      <ConfirmSheet open={!!delAsk} tone="red" icon={<Trash2 size={22} aria-hidden="true" />} title={`Видалити «${delAsk?.title || delAsk?.handle || ""}»?`}
        text="Канал зникне зі списку разом з усіма зібраними постами й статистикою. Це не можна скасувати." confirm="Видалити"
        onOpenChange={(o) => { if (!o) setDelAsk(null); }} onConfirm={() => delAsk && void remove(delAsk)} />

      <FixSheet post={fix} online={online} onClose={() => setFix(null)} onDone={() => { setFix(null); void load(); if (sel) getPosts(sel).then(setPosts).catch(() => {}); }} />
      <AddSheet open={addOpen} online={online} onOpenChange={setAddOpen} onDone={(h) => { setAddOpen(false); void load().then(() => openCh(h)); }} />
    </div>
  );
}

/** «Розібрати пост»: the match, the market, the odds — or «Не прогноз». */
function FixSheet({ post, online, onClose, onDone }: { post: TgPost | null; online: boolean; onClose: () => void; onDone: () => void }) {
  const [match, setMatch] = useState<TgMatch | null>(null);
  const [pickM, setPickM] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<TgMatch[] | null>(null);
  const [mk, setMk] = useState<"p1" | "p2" | "total" | "hcp">("p1");
  const [line, setLine] = useState("2.5");
  const [over, setOver] = useState(true);
  const [kf, setKf] = useState("");
  const [remember, setRemember] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!post) return;
    setMatch(post.matchId && post.team1 && post.team2 ? { id: post.matchId, game: (post.game as TgMatch["game"]) || "cs2", team1: post.team1, team2: post.team2, start: "" } : null);
    setPickM(!post.matchId); setQ(""); setMk("p1"); setLine("2.5"); setOver(true); setKf(post.odds ? String(post.odds) : ""); setRemember(false);
  }, [post]);
  useEffect(() => { if (!post || !pickM) return; const id = setTimeout(() => { fetchTgMatches(q).then(setFound).catch(() => setFound([])); }, 250); return () => clearTimeout(id); }, [q, pickM, post]);
  const mark = useCallback((text: string) => {
    const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const names = [match?.team1, match?.team2].filter(Boolean).map((n) => esc(String(n).split(/\s+/).pop() || ""));
    const re = new RegExp(`(${[...names.filter(Boolean), "\\d{1,2}[.,]\\d{1,3}"].join("|")})`, "ig");
    return text.split(re).map((x, i) => (i % 2 ? <mark key={i} className={/^\d/.test(x) ? "is-odds" : undefined}>{x}</mark> : x));
  }, [match]);
  const save = async (kind: "bet" | "other") => {
    if (!post) return;
    setSaving(true);
    try {
      if (kind === "other") await fixTgPost(post.handle, post.postId, { kind: "other" });
      else {
        if (!match) { toast.error("Оберіть матч"); setSaving(false); return; }
        const o = kf.trim() ? Number(kf.replace(",", ".")) : null;
        await fixTgPost(post.handle, post.postId, mk === "total" ? { kind: "bet", matchId: match.id, market: "Total", line: Number(line.replace(",", ".")) || 2.5, over, odds: o }
          : mk === "hcp" ? { kind: "bet", matchId: match.id, market: "Handicap", side: 1, line: -(Math.abs(Number(line.replace(",", ".")) || 1.5)), odds: o }
          : { kind: "bet", matchId: match.id, market: "Match Winner", side: mk === "p2" ? 2 : 1, odds: o, remember });
      }
      toast.success(kind === "other" ? "Позначено: не прогноз" : "Прогноз збережено", { description: kind === "bet" && match ? `${match.team1} — ${match.team2}` : undefined });
      onDone();
    } catch (e) { toast.error("Не вдалося зберегти", { description: (e as Error).message }); }
    finally { setSaving(false); }
  };
  const opt = (k: typeof mk, label: string, sub?: string) => <button key={k} type="button" role="radio" aria-checked={mk === k} className={`v3-tg-ropt${mk === k ? " is-on" : ""}`} onClick={() => setMk(k)}><i aria-hidden="true" /><span>{label}</span>{sub && <small>{sub}</small>}</button>;
  return (
    <Dialog open={!!post} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="v3-sheet v3-pay-sheet v3-tg-sheet v3-tg-fix">
        {post && <>
          <DialogTitle>Розібрати пост</DialogTitle>
          <DialogDescription>{post.title || `@${post.handle}`} · {when(post.postedAt)}</DialogDescription>
          <Shots urls={post.photos} big />
          {post.text && <div className="v3-tg-ftx">{mark(post.text)}</div>}
          {post.ocr && <details className="v3-tg-ocr"><summary>Прочитано зі скріну</summary><div>{mark(post.ocr)}</div></details>}
          {post.reason && <p className="v3-tg-warn">{post.reason}</p>}
          <span className="v3-tg-fl">Матч</span>
          {!pickM && match ? <button type="button" className="v3-tg-mbox" onClick={() => setPickM(true)}><span>{match.team1} — {match.team2}</span><b>Змінити</b></button> : <>
            <label className="v3-tg-msearch"><Search size={16} aria-hidden="true" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Команда" aria-label="Пошук матчу" />{q && <button type="button" aria-label="Очистити" onClick={() => setQ("")}><X size={14} /></button>}</label>
            <div className="v3-tg-mlist">{(found || []).slice(0, 6).map((m) => <button key={m.id} type="button" className={match?.id === m.id ? "is-on" : ""} onClick={() => { setMatch(m); setPickM(false); }}><span>{m.team1} — {m.team2}</span><small>{m.game === "cs2" ? "CS2" : "Dota 2"} · {when(m.start)}</small></button>)}{found && !found.length && <small className="v3-tg-note">Нічого не знайдено</small>}</div>
          </>}
          <span className="v3-tg-fl">Ставка</span>
          <div className="v3-tg-ropts" role="radiogroup" aria-label="Ставка">
            {opt("p1", `Перемога ${match?.team1 || "команди 1"}`, "П1")}
            {opt("p2", `Перемога ${match?.team2 || "команди 2"}`, "П2")}
            <div className="v3-tg-ropts2">{opt("total", "Тотал карт")}{opt("hcp", `Фора ${match?.team1 || ""}`.trim())}</div>
          </div>
          {(mk === "total" || mk === "hcp") && <div className="v3-tg-fline">
            {mk === "total" && <div className="v3-tg-seg2">{([[true, "Більше"], [false, "Менше"]] as const).map(([v, l]) => <button key={l} type="button" className={over === v ? "is-on" : ""} onClick={() => setOver(v)}>{l}</button>)}</div>}
            <label><span>Лінія</span><input inputMode="decimal" value={line} onChange={(e) => setLine(e.target.value)} /></label>
          </div>}
          <label className="v3-tg-fodds"><span className="v3-tg-fl">Кофіцієнт</span><input inputMode="decimal" value={kf} onChange={(e) => setKf(e.target.value)} placeholder="Напр. 1.85" /></label>
          {(mk === "p1" || mk === "p2") && <label className="v3-tg-rem"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /><i aria-hidden="true"><Check size={13} strokeWidth={3} /></i>Запам’ятати для каналу: кофіцієнт без команди — ставка на {mk === "p2" ? "другу" : "першу"}</label>}
          <div className="v3-mxp-acts">
            <button type="button" className="is-grey" disabled={!online || saving} onClick={() => void save("other")}>Не прогноз</button>
            <button type="button" className="is-green" disabled={!online || saving || !match} onClick={() => void save("bet")}>{saving ? "Зберігаємо…" : "Зберегти прогноз"}</button>
          </div>
        </>}
      </DialogContent>
    </Dialog>
  );
}

/** «Додати канал»: a public link → what we see there → start reading (a test channel is hidden from users). */
function AddSheet({ open, online, onOpenChange, onDone }: { open: boolean; online: boolean; onOpenChange: (o: boolean) => void; onDone: (handle: string) => void }) {
  const [link, setLink] = useState("");
  const [pv, setPv] = useState<TgPreview | null>(null);
  const [checking, setChecking] = useState(false);
  const [game, setGame] = useState<"cs2" | "dota2" | "both">("both");
  const [test, setTest] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setLink(""); setPv(null); setGame("both"); setTest(true); } }, [open]);
  useEffect(() => {
    const v = link.trim();
    if (v.length < 5) { setPv(null); return; }
    const id = setTimeout(() => { setChecking(true); previewTgChannel(v).then(setPv).catch((e) => setPv({ ok: false, error: (e as Error).message })).finally(() => setChecking(false)); }, 600);
    return () => clearTimeout(id);
  }, [link]);
  const add = async () => {
    if (!pv?.ok) return;
    setSaving(true);
    try { const r = await addTgChannel(link.trim(), game, test); toast.success(`${pv.title || `@${pv.handle}`} додано`, { description: r.added ? `Зібрано ${r.added} ${plural(r.added, "пост", "пости", "постів")}` : "Перший збір — за хвилину" }); onDone(r.handle); }
    catch (e) { toast.error("Не вдалося додати", { description: (e as Error).message }); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="v3-sheet v3-pay-sheet v3-tg-sheet">
        <DialogTitle>Додати канал</DialogTitle>
        <DialogDescription>Для тесту збору й розпізнавання</DialogDescription>
        <label className="v3-tg-fodds"><span className="v3-tg-fl">Посилання на публічний канал</span><input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://t.me/… або @нікнейм" /><small>Запрошення t.me/+… поки не підходять</small></label>
        {checking && <p className="v3-tg-note">Перевіряємо…</p>}
        {pv && !checking && (pv.ok ? (
          <div className="v3-tg-pv">
            <span className="v3-tg-ch"><span className="v3-tg-av"><TgAvatar handle={pv.handle} name={pv.title || pv.handle} color={colorOf(pv.handle)} /></span><span className="v3-tg-chn"><strong>{pv.title || `@${pv.handle}`}</strong><small>{pv.subscribers ? `${pv.subscribers.toLocaleString("uk-UA")} підписників · ` : ""}публічний</small></span><em className={`v3-tg-st ${pv.exists ? "is-warn" : "is-ok"}`}>{pv.exists ? "Уже є" : "Знайдено"}</em></span>
            <span className="v3-tg-line">Останні {pv.posts} {plural(pv.posts, "пост", "пости", "постів")}: <b>{pv.tipLike} схожі на прогнози</b>, з них ми б розпізнали {pv.recognized}.</span>
          </div>
        ) : <p className="v3-tg-warn is-bad">{pv.error}</p>)}
        <span className="v3-tg-fl">Гра</span>
        <div className="v3-tg-seg3">{([["cs2", "CS2"], ["dota2", "Dota 2"], ["both", "Обидві"]] as const).map(([k, l]) => <button key={k} type="button" className={game === k ? "is-on" : ""} onClick={() => setGame(k)}>{l}</button>)}</div>
        <small className="v3-tg-note">Для кожного поста гру визначаємо за матчем</small>
        <label className="v3-tg-rem"><input type="checkbox" checked={test} onChange={(e) => setTest(e.target.checked)} /><i aria-hidden="true"><Check size={13} strokeWidth={3} /></i>Тестовий — користувачі його не бачать, лише збираємо й рахуємо</label>
        <div className="v3-mxp-acts">
          <button type="button" className="is-grey" onClick={() => onOpenChange(false)}>Скасувати</button>
          <button type="button" className="is-green" disabled={!online || saving || !pv?.ok} onClick={() => void add()}>{saving ? "Додаємо…" : "Почати збір"}</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
