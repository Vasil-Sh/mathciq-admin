import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronRight, ExternalLink, History, Info, Trophy, LayoutGrid, List, Pencil, Play, Plus, RefreshCw, Search, Send, Square, Ticket, Trash2, X, BarChart3, Clock } from "lucide-react";
import { toast } from "sonner";
import PillTrack from "@/components/PillTrack";
import RollingNumber from "@/components/RollingNumber";
import { ConfirmSheet } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { TgAvatar } from "@/components/ads/AdsShared";
import { useMedia, useOnline } from "@/hooks/useMediaOnline";
import { DeleteAsk } from "@/components/ads/web/AdsWebShared";
import { addTgChannel, archiveTgChannel, deleteTgChannel, fetchTgStats, resolveTgPost, rereadTgChannel, rereadTgPost, rereadTgDoubtful, bulkTgInfo, fetchTgPostsPage, fetchTgCandidates, dismissTgCandidate, type TgCandidateCh, fetchTgSlips, type TgSlip, type TgStats, fetchTgMatches, fetchTgPosts, fetchTgSources, fetchTgUnrecognized, fetchTgSample, checkTgPost, fixTgPost, pauseTgChannel, setTgPublic, previewTgChannel, refreshTgChannel, runTgGolden,
  type TgChannel, type TgList, type TgMatch, type TgPost, type TgPreview } from "@/lib/tgSourcesApi";

/** «Telegram-джерела»: public t.me channels we read, what we made of their posts, the posts we did not understand (design «Telegram-джерела», phone first). */
const COLORS = ["#2aa3e0", "#7c3aed", "#e5484d", "#f97316", "#0ea5e9", "#1f9d55", "#334155"];
const colorOf = (s: string) => COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const GAME: Record<string, string> = { cs2: "CS2", dota2: "Dota 2", both: "CS2 · Dota 2" };
/** «@handle», or «приватний» for a channel read through our account (handle «priv-<id>»). */
const at = (h: string) => (h.startsWith("priv-") ? "приватний" : `@${h}`);
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
  const mw = /^Map (\d) Winner$/.exec(m); if (mw) return `Карта ${mw[1]} · ${p.pick}`;
  const mt = /^Map (\d) Total (Over|Under) ([\d.]+)$/.exec(m); if (mt) return `Карта ${mt[1]} · тотал раундів ${mt[2] === "Over" ? ">" : "<"} ${mt[3]}`;
  const mh = /^Map (\d) Handicap ([+-][\d.]+)$/.exec(m); if (mh) return `Карта ${mh[1]} · фора ${mh[2].replace("-", "−")} · ${p.pick}`;
  return m;
};
/** The post's number in the channel (t.me/<channel>/<number>); a second bet of one post — «1834.2». */
const postNo = (p: TgPost) => (p.partOf ? `${p.partOf}.${p.postId % 1000}` : String(p.postId));
const KIND = (p: TgPost): [string, string] => p.kind === "bet" ? ["Прогноз", "is-ok"] : p.kind === "unknown" ? ["Не розпізнано", "is-warn"] : p.reason === "Повтор" ? ["Повтор", "is-off"] : p.reason === "Результат" ? ["Прогноз", "is-ok"] : p.reason === "Опитування" ? ["Опитування", "is-off"] : p.reason === "Повернення" ? ["Повернення", "is-off"] : p.reason === "Підсумок" ? [`Підсумок${p.claim?.won != null && p.claim?.total ? ` ${p.claim.won}/${p.claim.total}` : ""}`, "is-ours"] : ["Інфо", "is-off"];
const PROG = { add: "Збираємо пости", reread: "Перечитуємо пости", collect: "Читаємо нові пости", archive: "Підтягуємо архів" } as const;
/** Extra marks of a post: our own check, live, deleted / edited. */
/** Who read the post: the AI, OCR (a fallback — trust it less), a slip OCR read in full, the caption, the channel's template, plain rules, a screenshot read before. */
const READ: Record<string, string> = { ai: "ШІ", ocr: "OCR", slip: "квиток OCR", caption: "з підпису", template: "шаблон", rules: "правила", cache: "вже читали" };

function Marks({ p }: { p: TgPost }) {
  const m: [string, string][] = [];
  if (p.kind === "bet" && p.live?.status === "live") m.push([`Йде${p.live.score1 != null ? ` · ${p.live.score1}:${p.live.score2}` : ""}`, "is-live"]);
  if (p.mismatch) m.push([`Розбіжність: за рахунком ${p.ourResult === "Win" ? "виграш" : "програш"}`, "is-bad"]);
  else if (p.settledBy === "ours") m.push(["Перевірено нами", "is-ours"]);
  else if (p.ourResult && p.settledBy === "slip") m.push(["Підтверджено", "is-ours"]);
  if (p.isLive) m.push(["Ставка наживо", "is-warn"]);
  if (p.oddsHigh && p.ourOdds) m.push([`Кф вище нашого ${odds(p.ourOdds)}`, "is-warn"]);
  if (p.deletedAt) m.push(["Видалено", "is-bad"]);
  if (p.editedAt) m.push(["Змінено", "is-off"]);
  if (p.doubt) m.push(["Сумнівно", "is-warn"]);
  if (p.partOf) m.push(["Ще одна ставка з поста", "is-off"]);
  if (p.replyTo && p.reason === "Результат") m.push(["Відповідь на прогноз", "is-ours"]);
  return m.length ? <>{m.map(([t, c]) => <em key={t} className={`v3-tg-st ${c}`}>{t}</em>)}</> : null;
}
function Legs({ p }: { p: TgPost }) {
  if (!p.legs?.length) return null;
  return <ul className="v3-tg-legs">{p.legs.map((l, i) => <li key={i}><span>{l.team1} — {l.team2}</span><b>{l.pick || l.market}{l.odds ? ` · ${odds(l.odds)}` : ""}</b>{l.result && <em className={`v3-tg-st ${l.result === "Win" ? "is-ok" : "is-bad"}`}>{l.result === "Win" ? "✓" : "✗"}</em>}</li>)}</ul>;
}
const RES0 = (r: TgPost["result"]): [string, string] | null => r === "Win" ? ["Виграш", "is-ok"] : r === "Loss" ? ["Програш", "is-bad"] : r === "Void" ? ["Повернення", "is-off"] : null;
const SLIP: Record<string, [string, string]> = { won: ["Виграш", "is-ok"], lost: ["Програш", "is-bad"], pending: ["Очікується", "is-wait"], cashout: ["Продано", "is-off"], void: ["Повернення", "is-off"] };
/** What this post shows: its own slip (a pending slip stays «Очікується» even after the tip was won), else the settled result. */
const RES = (p: TgPost): [string, string] | null =>
  // settled by our scores or by the admin: the result, whatever the slip on the screenshot says («очікується» when it was posted)
  p.kind === "bet" && p.result && (p.settledBy === "ours" || p.settledBy === "admin" || p.ourResult) ? RES0(p.result)
  : (p.kind === "bet" || p.reason === "Результат") && p.slip && SLIP[p.slip] ? SLIP[p.slip] : p.kind === "bet" ? RES0(p.result) : null;
const CUR: Record<string, string> = { UAH: "₴", RUB: "₽", USD: "$", EUR: "€", USDT: "USDT", KZT: "₸" };
const cash = (n: number, c: string) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("uk-UA", { maximumFractionDigits: 2 })} ${CUR[c] || c}`;
const money = (n: number | null | undefined) => (n == null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("uk-UA")}`);
const pct = (n: number | null | undefined) => (n == null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}%`);
const tone = (n: number | null | undefined) => (n == null || n === 0 ? "" : n > 0 ? "is-ok" : "is-bad");
const WD = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("uk-UA", { weekday: "short", timeZone: "UTC" });
const readView = (): "list" | "grid" => { try { return localStorage.getItem("v3-tg-posts-view") === "grid" ? "grid" : "list"; } catch { return "list"; } };
const odds = (n: number | null) => (n == null ? "" : n.toFixed(2).replace(".", ","));

/** Screenshots of a post; a link that expired on the t.me CDN just disappears. */
/** Grid posts in two columns, each card to the shorter one (by a rough height) — no empty space under a short card. */
function masonry(xs: TgPost[]): [TgPost[], TgPost[]] {
  const cols: [TgPost[], TgPost[]] = [[], []], h = [0, 0];
  for (const p of xs) {
    const est = (p.photos?.length ? 190 : 40) + Math.min(p.text.length, p.photos?.length ? 70 : 130) * 0.5 + 60 + (p.kind === "bet" ? 40 : 0);
    const i = h[0] <= h[1] ? 0 : 1;
    cols[i].push(p); h[i] += est;
  }
  return cols;
}
/** The same in n columns, each post with its place in the list (for the corner number on the web cards). */
function masonryN(xs: TgPost[], n: number): { p: TgPost; i: number }[][] {
  const cols: { p: TgPost; i: number }[][] = Array.from({ length: n }, () => []), h = Array(n).fill(0) as number[];
  xs.forEach((p, i) => {
    const est = (p.photos?.length ? 190 : 40) + Math.min(p.text.length, p.photos?.length ? 70 : 130) * 0.5 + 60 + (p.kind === "bet" ? 40 : 0);
    const k = h.indexOf(Math.min(...h));
    cols[k].push({ p, i }); h[k] += est;
  });
  return cols;
}

/** «Можна додати»: channels our channels point to (links, @mentions), most mentioned first. */
function Candidates({ onAdd }: { onAdd: (h: string) => void }) {
  const [list, setList] = useState<TgCandidateCh[] | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { fetchTgCandidates().then(setList).catch(() => setList([])); }, []);
  if (!list?.length) return null;
  const shown = open ? list : list.slice(0, 3);
  return (
    <div className="v3-tg-cands">
      <div className="v3-tg-candh"><b>Можна додати</b><small>канали, на які посилаються ваші канали</small></div>
      {shown.map((c) => (
        <div key={c.handle} className="v3-tg-cand">
          <span className="v3-tg-candn"><b>@{c.handle}</b><small>{c.mentions} {plural(c.mentions, "згадка", "згадки", "згадок")} · у {c.seenIn.map((h) => `@${h}`).join(", ")}</small></span>
          <button type="button" className="is-add" onClick={() => onAdd(c.handle)}>Додати</button>
          <button type="button" className="is-x" aria-label={`Сховати @${c.handle}`} onClick={() => { void dismissTgCandidate(c.handle).catch(() => {}); setList((xs) => (xs || []).filter((x) => x.handle !== c.handle)); }}><X size={14} aria-hidden="true" /></button>
        </div>
      ))}
      {list.length > 3 && <button type="button" className="v3-tg-candmore" onClick={() => setOpen((o) => !o)}>{open ? "Згорнути" : `Ще ${list.length - 3}`}</button>}
    </div>
  );
}

/** What a slip's bet is, in words: a win in the match or on a map, a handicap, a total. */
const slipMarket = (x: TgSlip) => {
  const m = x.market || "", mw = /^Map (\d) Winner$/.exec(m);
  if (m === "Match Winner") return `Перемога в матчі · ${x.pick}`;
  if (mw) return `Перемога на карті ${mw[1]} · ${x.pick}`;
  return MARKET({ market: m, pick: x.pick, team1: x.team1, team2: x.team2 } as TgPost);
};

/** «Рейтинг каналів»: every channel in one table — payoff, win rate, honesty, money (≈ $), tips; a header sorts. */
function RankSheet({ open, onOpenChange, channels, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; channels: TgChannel[]; onPick: (h: string) => void }) {
  type K = "roi" | "win" | "honest" | "money" | "tips";
  const [k, setK] = useState<K>("roi");
  const val = (c: TgChannel, key: K): number | null => key === "roi" ? (c.all?.ours?.roi ?? c.all?.roi ?? null) : key === "win" ? (c.all?.winrate ?? null) : key === "honest" ? (c.all?.honesty ?? null)
    : key === "money" ? (c.money?.length ? c.money.reduce((x, m) => x + (m.profitUsd ?? 0), 0) : null) : (c.all?.tips ?? c.tips7d);
  const rows = [...channels].sort((a, b) => (val(b, k) ?? -1e12) - (val(a, k) ?? -1e12));
  const H: [K, string][] = [["roi", "Окупн."], ["win", "Вінрейт"], ["honest", "Чесн."], ["money", "Гроші ≈$"], ["tips", "Прогн."]];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="v3-sheet v3-pay-sheet v3-tg-sheet">
        <DialogTitle>Рейтинг каналів</DialogTitle>
        <DialogDescription>Усі канали за весь час · натисніть заголовок, щоб сортувати</DialogDescription>
        <div className="v3-tg-rank" role="table" aria-label="Рейтинг каналів">
          <div className="v3-tg-rankh" role="row"><span role="columnheader">Канал</span>{H.map(([key, l]) => <button key={key} type="button" role="columnheader" aria-sort={k === key ? "descending" : "none"} className={k === key ? "is-on" : ""} onClick={() => setK(key)}>{l}</button>)}</div>
          {rows.map((c, i) => { const roi = val(c, "roi"), mon = val(c, "money"); return (
            <button key={c.handle} type="button" role="row" className="v3-tg-rankr" onClick={() => onPick(c.handle)}>
              <span className="n"><i>{i + 1}</i><span className="nn"><b>{c.title || at(c.handle)}</b>{(c.skill?.best || c.skill?.copies) && <small>{c.skill?.copies ? `копіює @${c.skill.copies.from}` : `сильний ${c.skill!.best!.kind}`}</small>}</span></span>
              <span className={tone(roi)}>{pct(roi)}</span>
              <span>{c.all?.winrate != null ? `${c.all.winrate}%` : "—"}</span>
              <span>{c.all?.honesty != null ? `${c.all.honesty}%` : "—"}</span>
              <span className={tone(mon)}>{mon == null ? "—" : `${mon > 0 ? "+" : mon < 0 ? "−" : ""}$${Math.round(Math.abs(mon)).toLocaleString("uk-UA")}`}</span>
              <span>{val(c, "tips")}</span>
            </button>
          ); })}
        </div>
        <p className="v3-tg-note">«Гроші ≈$» — прибуток за квитками каналу, переведений у долари за курсом дня (USDT = $).</p>
        <div className="v3-mxp-acts"><button type="button" className="is-grey" onClick={() => onOpenChange(false)}>Закрити</button></div>
      </DialogContent>
    </Dialog>
  );
}

/** One slip: the match, the market, the stake → payout, the odds and what it brought. */
function SlipItem({ x, wide }: { x: TgSlip; wide?: boolean }) {
  const RS: Record<string, [string, string]> = { Win: ["Виграш", "is-ok"], Loss: ["Програш", "is-bad"], Void: ["Повернення", "is-off"] };
  const c = x.currency ? (CUR[x.currency] || x.currency) : ""; const n = (v: number) => v.toLocaleString("uk-UA", { maximumFractionDigits: 2 }); const r = x.result ? RS[x.result] : null;
  if (wide) return (
    <li className={`v3-tgw-slr${x.counted ? "" : " is-off"}`}>
      <small>{when(x.postedAt)}</small>
      <span><b>{x.team1 && x.team2 ? `${x.team1} — ${x.team2}` : x.pick || "—"}</b>{x.market && <em>{slipMarket(x)}</em>}</span>
      <span>{n(x.stake)} {c}{x.payout ? ` → ${n(x.payout)} ${c}` : ""}</span>
      <span>{x.odds ? odds(x.odds) : "—"}</span>
      <span>{r ? <em className={`v3-tg-st ${r[1]}`}>{r[0]}</em> : x.counted ? <em className="v3-tg-st is-warn">Очікується</em> : null}</span>
      <b className={x.counted && x.profit != null ? tone(x.profit) : "is-why"}>{x.counted ? (x.profit == null ? "у грі" : cash(x.profit, x.currency || "")) : x.why}</b>
    </li>
  );
  return (
          <li className={x.counted ? "" : "is-off"}>
            <span className="v3-tg-sl1"><small>{when(x.postedAt)}</small><b>{x.team1 && x.team2 ? `${x.team1} — ${x.team2}` : x.pick || "—"}</b>{r ? <em className={`v3-tg-st ${r[1]}`}>{r[0]}</em> : x.counted ? <em className="v3-tg-st is-warn">Очікується</em> : null}</span>
            {x.market && <span className="v3-tg-sl3">{slipMarket(x)}</span>}
            <span className="v3-tg-sl2">{n(x.stake)} {c}{x.payout ? ` → ${n(x.payout)} ${c}` : ""}{x.odds ? ` · кф ${odds(x.odds)}` : ""}<b className={x.profit == null ? "" : tone(x.profit)}>{x.counted ? (x.profit == null ? "у грі" : cash(x.profit, x.currency || "")) : x.why}</b></span>
          </li>
  );
}

/** Every slip with money the channel showed: which are in «Гроші каналу», with what profit, and why the others are not. */
function SlipList({ handle, title, wide }: { handle: string; title: string; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<TgSlip[] | null>(null);
  useEffect(() => { fetchTgSlips(handle).then(setList).catch(() => setList([])); }, [handle]);
  return (<>
    <button type="button" className="v3-tg-slipt" onClick={() => setOpen(true)}><Ticket size={16} aria-hidden="true" />{wide ? "Квитки" : "Квитки зі ставками"}{list ? ` · ${list.length}` : ""}</button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className={`v3-sheet v3-pay-sheet v3-tg-sheet${wide ? " v3-tg-slipsm" : ""}`}>
        <DialogTitle>Квитки зі ставками</DialogTitle>
        <DialogDescription>{title} · кожен квиток із сумою, що показав канал</DialogDescription>
        {!list ? <p className="v3-tg-note">Завантажуємо…</p> : !list.length ? <p className="v3-tg-note">Квитків із сумою ставки ще не було.</p> : <ul className="v3-tg-slips">{wide && <li className="v3-tgw-slh" aria-hidden="true"><span>Коли</span><span>Матч і ставка</span><span>Ставка → виплата</span><span>Кф</span><span>Результат</span><span>Прибуток</span></li>}{list.map((x) => <SlipItem key={x.postId} x={x} wide={wide} />)}</ul>}
        <p className="v3-tg-note">У «Гроші каналу» йдуть квитки прогнозів, кожен раз. Прибуток виграшу — виплата мінус ставка (або ставка × (кф − 1)).</p>
        <div className="v3-mxp-acts"><button type="button" className="is-grey" onClick={() => setOpen(false)}>Закрити</button></div>
      </DialogContent>
    </Dialog>
  </>);
}

/** «Перевірити 10 постів»: random posts of the week one by one — read right or not (wrong → the post opens to be fixed). */
function CheckSheet({ open, online, onClose, onFix }: { open: boolean; online: boolean; onClose: (changed: boolean) => void; onFix: (p: TgPost) => void }) {
  const [list, setList] = useState<TgPost[] | null>(null);
  const [i, setI] = useState(0);
  const [ok, setOk] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) return; setList(null); setI(0); setOk(0); fetchTgSample().then(setList).catch(() => setList([])); }, [open]);
  const p = list?.[i];
  const answer = async (right: boolean) => {
    if (!p || busy) return;
    setBusy(true);
    try { await checkTgPost(p.handle, p.postId, right); if (right) setOk((n) => n + 1); setI((n) => n + 1); if (!right) onFix(p); }
    catch (e) { toast.error("Не вдалося зберегти", { description: (e as Error).message }); }
    finally { setBusy(false); }
  };
  const done = !!list && i >= list.length;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(i > 0); }}>
      <DialogContent className="v3-sheet v3-pay-sheet v3-tg-sheet">
        <DialogTitle>Перевірка постів</DialogTitle>
        <DialogDescription>{!list ? "Беремо випадкові пости за 7 днів…" : !list.length ? "Неперевірених постів за 7 днів немає" : done ? `Перевірено ${list.length}` : `${i + 1} з ${list.length} · чи правильно ми прочитали пост?`}</DialogDescription>
        {list && list.length > 0 && !done && <span className="v3-tg-goldbar v3-tg-chkbar" aria-hidden="true"><i style={{ width: `${Math.round((i / list.length) * 100)}%` }} /></span>}
        {p && !done && <div className="v3-tg-chk">
          <span className="v3-tg-unh"><span className="v3-tg-av is-s"><TgAvatar handle={p.handle} name={p.title || p.handle} color={colorOf(p.handle)} /></span><b>{p.title || `@${p.handle}`}</b><small>{when(p.postedAt)}</small></span>
          <span className="v3-tg-unb"><Shots urls={p.photos} big /><MoreText text={p.text || (p.photos?.length ? "Скрін без підпису" : "")} /></span>
          <div className="v3-tg-chkr"><small>Ми прочитали{p.readBy && READ[p.readBy] ? ` · ${READ[p.readBy]}` : ""}</small>
            {p.kind === "bet" ? <b>{p.team1} — {p.team2}<span>{MARKET(p)}{p.odds ? ` · кф ${odds(p.odds)}` : ""}{p.stake ? ` · ${p.stake.toLocaleString("uk-UA")} ${p.currency ? CUR[p.currency] || p.currency : ""}` : ""}</span></b>
              : <b>{KIND(p)[0]}<span>не прогноз</span></b>}</div>
        </div>}
        {done && list && <div className="v3-tg-chkdone"><b className={ok / list.length >= 0.9 ? "is-ok" : ok / list.length < 0.7 ? "is-bad" : ""}>{Math.round((ok / list.length) * 100)}%</b><span>{ok} з {list.length} прочитано правильно</span></div>}
        <div className="v3-mxp-acts">
          {p && !done ? <><button type="button" className="is-red" disabled={!online || busy} onClick={() => void answer(false)}>Ні, виправити</button><button type="button" className="is-green" disabled={!online || busy} onClick={() => void answer(true)}>Правильно</button></>
            : <button type="button" className="is-grey" onClick={() => onClose(i > 0)}>Закрити</button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** A post's text on a grid card, a few lines with an arrow to read it all or fold it (a screenshot card: the caption under it). */
function MoreText({ text, cap }: { text: string; cap?: boolean }) {
  const [open, setOpen] = useState(false);
  const long = text.length > (cap ? 70 : 130) || text.split("\n").length > (cap ? 2 : 5);
  return (
    <span className={`${cap ? "v3-tg-pgcap" : "v3-tg-pgtx"}${open ? " is-open" : ""}`}>
      <span className="v3-tg-pgt">{text}</span>
      {long && <button type="button" className="v3-tg-pgmore" aria-expanded={open} aria-label={open ? "Згорнути текст" : "Читати весь текст"} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}><ChevronDown size={14} aria-hidden="true" className={open ? "is-up" : ""} /></button>}
    </span>
  );
}

function Shots({ urls, big }: { urls?: string[]; big?: boolean }) {
  const [bad, setBad] = useState<string[]>([]);
  const ok = (urls || []).filter((u) => !bad.includes(u));
  if (!ok.length) return null;
  return <span className={`v3-tg-shots${big ? " is-big" : ""}`}>{ok.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><img src={u} alt="Скрін ставки" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad((b) => [...b, u])} /></a>)}</span>;
}

export default function Telegram() {
  const online = useOnline();
  const phone = useMedia("(max-width: 767px)");
  const [wq, setWq] = useState("");
  const [rOpen, setROpen] = useState(false);
  const [freshN, setFreshN] = useState(0);
  const rPopRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!rOpen) return; const f = (e: PointerEvent) => { const t = e.target as HTMLElement; if (rPopRef.current?.contains(t) || t.closest?.("[role=dialog].v3-sheet")) return; setROpen(false); }; const k = (e: KeyboardEvent) => { if (e.key === "Escape") setROpen(false); }; document.addEventListener("pointerdown", f); document.addEventListener("keydown", k); return () => { document.removeEventListener("pointerdown", f); document.removeEventListener("keydown", k); }; }, [rOpen]);
  const [data, setData] = useState<TgList | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"ch" | "un">("ch");
  const [busy, setBusy] = useState(false);
  const [unk, setUnk] = useState<TgPost[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [posts, setPosts] = useState<TgPost[] | null>(null);
  const [fix, setFix] = useState<TgPost | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addLink, setAddLink] = useState(""); // «Можна додати» → the sheet opens with the link filled in
  const [stopAsk, setStopAsk] = useState<TgChannel | null>(null);
  const [delAsk, setDelAsk] = useState<TgChannel | null>(null);
  const [day, setDay] = useState<{ ch: TgChannel; i: number } | null>(null);
  const [sort, setSort] = useState<"new" | "roi" | "win" | "honest">("new");
  const [readersOpen, setReadersOpen] = useState(() => { try { return localStorage.getItem("v3-tg-readers") === "1"; } catch { return false; } });
  const golden = async () => { try { await runTgGolden(); toast.success("Перевіряємо читачів", { description: "≈6 с на запит — результат тут же" }); setTimeout(() => void load(), 1_500); } catch (e) { toast.error("Не вдалося запустити", { description: (e as Error).message }); } };
  // posts of a channel the admin has seen (its total when the sheet was last opened): the card shows how many came since
  const [chSeen, setChSeen] = useState<Record<string, number>>(() => { try { return JSON.parse(localStorage.getItem("v3-tg-chseen") || "{}") as Record<string, number>; } catch { return {}; } });
  const markChSeen = (h: string) => { const n = data?.channels.find((c) => c.handle === h)?.all?.posts; if (n == null) return; setChSeen((cur) => { const next = { ...cur, [h]: n }; try { localStorage.setItem("v3-tg-chseen", JSON.stringify(next)); window.dispatchEvent(new Event("mq-tg-seen")); } catch { /* private mode */ } return next; }); };
  // a channel seen for the first time: its posts now are the start (the badge counts only what comes after)
  useEffect(() => {
    const miss = data?.channels.filter((c) => chSeen[c.handle] == null && c.all?.posts != null);
    if (!miss?.length) return;
    setChSeen((cur) => { const next = { ...cur }; for (const c of miss) next[c.handle] = c.all!.posts; try { localStorage.setItem("v3-tg-chseen", JSON.stringify(next)); window.dispatchEvent(new Event("mq-tg-seen")); } catch { /* private mode */ } return next; });
  }, [data, chSeen]);
  // the readers' block folded to its header — folded until the admin opens it (remembered)
  const [readerFold, setReaderFold] = useState(() => { try { return localStorage.getItem("v3-tg-rfold2") !== "0"; } catch { return true; } });
  const toggleReaderFold = () => setReaderFold((o) => { try { localStorage.setItem("v3-tg-rfold2", o ? "0" : "1"); } catch { /* private mode */ } return !o; });
  const toggleReaders = () => setReadersOpen((o) => { try { localStorage.setItem("v3-tg-readers", o ? "0" : "1"); } catch { /* private mode */ } return !o; });
  const [seen, setSeen] = useState(() => { try { return JSON.parse(localStorage.getItem("v3-tg-seen") || "{}") as { unknown?: number; mismatches?: number }; } catch { return {}; } });
  const markSeen = () => { const a = data?.alerts; if (!a) return; setSeen(a); try { localStorage.setItem("v3-tg-seen", JSON.stringify(a)); } catch { /* private mode */ } };
  const [view, setView] = useState<"list" | "grid">(readView);
  const [more, setMore] = useState(false);
  // posts in the sheet: a filter and «Показати ще» (pages of 30)
  const [rankOpen, setRankOpen] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  // «Нерозпізнані»: several posts picked and made «Інфо» at once
  const [pickMode, setPickMode] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const keyOf = (p: TgPost) => `${p.handle}/${p.postId}`;
  const togglePick = (p: TgPost) => setPicked((cur) => { const n = new Set(cur); if (n.has(keyOf(p))) n.delete(keyOf(p)); else n.add(keyOf(p)); return n; });
  const bulkInfo = async () => {
    const items = (unk || []).filter((p) => picked.has(keyOf(p))).map((p) => ({ handle: p.handle, postId: p.postId }));
    if (!items.length) return;
    try { await bulkTgInfo(items); toast.success(`Позначено «Інфо»: ${items.length}`); setPicked(new Set()); setPickMode(false); void load(); }
    catch (e) { toast.error("Не вдалося", { description: (e as Error).message }); }
  };
  const [pf, setPf] = useState<"all" | "tips" | "slips" | "unknown">("all");
  const [plist, setPlist] = useState<{ items: TgPost[]; more: boolean; loading: boolean } | null>(null);
  useEffect(() => { setMore(false); setPf("all"); setPlist(null); }, [sel]);
  const loadPosts = async (f: typeof pf, append: boolean) => {
    if (!sel) return;
    const cur = append ? plist?.items || posts || [] : [];
    setPlist({ items: cur, more: false, loading: true });
    try { const r = await fetchTgPostsPage(sel, f, append ? cur[cur.length - 1]?.postedAt : undefined); setPlist({ items: [...cur, ...r.posts], more: !!r.more, loading: false }); }
    catch { setPlist({ items: cur, more: false, loading: false }); }
  };
  const pickPf = (f: typeof pf) => { setPf(f); if (f === "all") setPlist(null); else void loadPosts(f, false); };
  const pickView = (v: "list" | "grid") => { setView(v); try { localStorage.setItem("v3-tg-posts-view", v); } catch { /* private mode */ } };

  // «Показувати користувачам»: a test channel goes to the app, or back
  const togglePublic = async (ch: TgChannel) => {
    const shown = ch.isTest;
    setData((d) => d && { ...d, channels: d.channels.map((x) => x.handle === ch.handle ? { ...x, isTest: !shown } : x) });
    try { await setTgPublic(ch.handle, shown); toast.success(shown ? "Канал видно в застосунку" : "Канал знову тестовий", { description: ch.title || `@${ch.handle}` }); }
    catch (e) { setData((d) => d && { ...d, channels: d.channels.map((x) => x.handle === ch.handle ? { ...x, isTest: shown } : x) }); toast.error("Не вдалося змінити", { description: (e as Error).message }); }
  };
  const load = useCallback(async () => {
    try { setData(await fetchTgSources()); setErr(""); } catch (e) { setErr((e as Error).message); }
    fetchTgUnrecognized().then(setUnk).catch(() => setUnk([]));
  }, []);
  useEffect(() => { void load(); }, [load]);
  // while a channel is being re-read: refresh every 5 s for the progress
  const reading = !!data?.channels.some((c) => c.progress) || !!data?.reader?.golden?.running || !!data?.doubts?.running;
  useEffect(() => { if (!reading) return; const id = setInterval(() => void load(), 5_000); return () => clearInterval(id); }, [reading, load]);
  // The sheet opens once its posts are here, so it never jumps from placeholders to a taller sheet.
  const cache = useRef(new Map<string, TgPost[]>());
  const [opening, setOpening] = useState<string | null>(null);
  const getPosts = (h: string) => fetchTgPosts(h).then((p) => { cache.current.set(h, p); return p; });
  const openCh = async (h: string) => {
    { const c0 = data?.channels.find((c) => c.handle === h); setFreshN(c0 && chSeen[h] != null ? Math.max(0, (c0.all?.posts ?? 0) - chSeen[h]) : 0); }
    markChSeen(h);
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
  const archive = async (h: string) => {
    try { await archiveTgChannel(h, 5); toast.success("Підтягуємо архів", { description: "До 100 старших постів — прогрес на картці каналу" }); setSel(null); setTimeout(() => void load(), 4_000); }
    catch (e) { toast.error("Не вдалося", { description: (e as Error).message }); }
  };
  const reread = async (h: string) => {
    try { const r = await rereadTgChannel(h); toast.success(`Перечитуємо ${r.posts} ${plural(r.posts, "пост", "пости", "постів")}`, { description: "Прогрес — на картці каналу" }); setSel(null); setTimeout(() => void load(), 1_500); }
    catch (e) { toast.error("Не вдалося", { description: (e as Error).message }); }
  };
  const setPaused = async (c: TgChannel, paused: boolean) => {
    try { await pauseTgChannel(c.handle, paused); toast.success(paused ? "Збір зупинено" : "Збір запущено", { description: paused ? c.title || `@${c.handle}` : "Читаємо нові пости — прогрес на картці" }); setStopAsk(null); await load(); if (!paused) setTimeout(() => void load(), 3_000); }
    catch (e) { toast.error("Не вдалося", { description: (e as Error).message }); }
  };
  const remove = async (c: TgChannel) => {
    try { await deleteTgChannel(c.handle); toast.success("Тестовий канал видалено"); setDelAsk(null); setSel(null); await load(); }
    catch (e) { toast.error("Не вдалося видалити", { description: (e as Error).message }); }
  };

  const readerView = (forceOpen = false) => data && data.reader ? (() => { const fold = forceOpen ? false : readerFold; const r = data.reader, err = r.ai ? r.aiError : r.ocrError; return (
              <div className={`v3-tg-reader${fold ? " is-fold" : ""}`}>
                <div className="v3-tg-rh"><span className={`v3-tg-rdot${err ? " is-warn" : ""}`} aria-hidden="true" /><strong>{r.ai ? "Пости й скріни читає ШІ" : "Скріни читає OCR"}</strong><em>{r.ai ? (r.model || "Gemini") : "без ключа ШІ"}</em><button type="button" className="v3-tg-rfold2" aria-expanded={!readerFold} aria-label={readerFold ? "Розгорнути блок читачів" : "Згорнути блок читачів"} onClick={toggleReaderFold}><ChevronDown size={18} aria-hidden="true" className={readerFold ? "" : "is-up"} /></button></div>
                {!fold && <>
                {data.accuracy && data.accuracy.posts > 0 && (() => { const a = data.accuracy; const t = (v: number | null) => v == null ? "" : v >= 90 ? "is-ok" : v < 70 ? "is-bad" : "is-warn"; return (
                  <div className="v3-tg-acc7">
                    <div className="v3-tg-acch"><span><small>Точність за 7 днів</small><b className={t(a.percent)}>{a.percent ?? "—"}%</b><em>{a.posts} {plural(a.posts, "пост", "пости", "постів")} · виправлено {a.wrong} · не розпізнано {a.missed}</em></span>
                      <button type="button" disabled={!online} onClick={() => setCheckOpen(true)}>Перевірити 10</button></div>
                    {a.checked > 0 && <small className="v3-tg-accn">Вибірка: {a.checkedOk} з {a.checked} правильно{a.checkedPercent != null ? ` · ${a.checkedPercent}%` : ""}</small>}
                    <ul>{a.readers.map((x) => <li key={x.id}><span>{x.label}</span><i aria-hidden="true"><i style={{ width: `${x.percent ?? 0}%` }} className={t(x.percent)} /></i><b className={t(x.percent)}>{x.percent ?? "—"}%</b><small>{x.posts}</small></li>)}</ul>
                  </div>
                ); })()}
                <div className="v3-tg-rtiles">
                  {r.ai ? <>
                    {(() => { const cur = r.readers?.find((x) => x.label === r.model && x.hasKey) ?? r.readers?.find((x) => x.hasKey && !(x.restUntil && new Date(x.restUntil).getTime() > Date.now())); const used = cur ? cur.today : r.quota?.used ?? r.aiCalls, lim = cur ? cur.limit : r.quota?.limit; return <div title={cur ? `Запити читача «${cur.label}» сьогодні` : undefined}><span>Сьогодні</span><b className={lim && used >= lim * 0.9 ? "is-warn" : ""}>{lim ? `${used} з ${cur?.limitGuess ? "≈" : ""}${lim}` : used}</b>{cur && <small className="v3-tg-rdr">{cur.label}</small>}</div>; })()}
                    <div><span>Помилок</span><b className={r.aiFailed ? "is-warn" : ""}>{r.aiFailed}</b></div>
                    {r.saved && <div title={`Правила: ${r.saved.rules} · шаблон каналу: ${r.saved.template} · той самий скрін: ${r.saved.cache} · пакетом: ${r.saved.batch} · квиток через OCR: ${r.saved.slip ?? 0} · прогноз з підпису: ${r.saved.caption ?? 0}`}><span>Без запиту</span><b className="is-ok">{r.saved.rules + r.saved.template + r.saved.cache + r.saved.batch + (r.saved.slip ?? 0) + (r.saved.caption ?? 0)}</b></div>}
                  </> : <>
                    <div><span>Скрінів</span><b>{r.ocrImages}</b></div>
                    <div><span>На скрін</span><b>{r.ocrAvgMs ? `${(r.ocrAvgMs / 1000).toFixed(1).replace(".", ",")} с` : "—"}</b></div>
                    <div><span>Помилок</span><b className={r.ocrFailed ? "is-warn" : ""}>{r.ocrFailed}</b></div>
                  </>}
                </div>
                {!!r.readers?.length && <button type="button" className="v3-tg-rtoggle" aria-expanded={readersOpen} onClick={toggleReaders}><span>Черга читачів · {r.readers.filter((x) => x.hasKey).length} з ключем</span><ChevronDown size={16} aria-hidden="true" className={readersOpen ? "is-up" : ""} /></button>}
                {!!r.readers?.length && readersOpen && <ul className="v3-tg-readers">{r.readers.map((x, i) => { const rest = x.restUntil && Date.parse(x.restUntil) > Date.now(); const state = !x.hasKey ? "is-off" : rest ? "is-warn" : x.failed && !x.ok ? "is-bad" : "is-ok"; return (
                  <li key={x.id} className={state}>
                    <span className="v3-tg-rn">{i + 1}</span>
                    <span className="v3-tg-rl"><b>{x.label}</b><small>{!x.hasKey ? `немає ключа · ${x.keyName}` : rest ? `ліміт · знову о ${hhmm(x.restUntil)}` : x.failed && !x.ok && x.lastError ? x.lastError : x.model}{x.hasKey && x.accuracy != null && (x.read30 ?? 0) >= 5 ? ` · точність ${x.accuracy}% з ${x.read30}` : ""}</small></span>
                    <em>{x.hasKey ? <>{x.today}{x.limit ? <small>/{x.limitGuess ? "≈" : ""}{x.limit}</small> : null}</> : "—"}</em>
                  </li>
                ); })}<li className="is-off"><span className="v3-tg-rn">{r.readers.length + 1}</span><span className="v3-tg-rl"><b>OCR</b><small>запасний варіант без ключів</small></span><em>{r.ocrImages}</em></li></ul>}
                {!!r.readers?.length && readersOpen && r.golden && (() => { const g = r.golden; return (
                  <div className="v3-tg-gold">
                    <div className="v3-tg-goldh"><span><b>Перевірка на еталоні</b><small>{g.running ? `Читаємо ${g.done} з ${g.total}…` : g.at ? `${g.posts} ${plural(g.posts ?? 0, "пост", "пости", "постів")}, розібраних чи підтверджених вами · ${when(g.at)}` : "Кожен читач заново читає пости, які ви розібрали чи підтвердили в «Перевірити 10»"}</small></span>
                      <button type="button" className={g.running ? "is-run" : ""} disabled={!online || g.running} onClick={() => void golden()}>{g.running ? <><i className="v3-tg-spin" aria-hidden="true" />{g.done}/{g.total}</> : "Перевірити"}</button></div>
                    {g.running && <span className="v3-tg-goldbar" aria-hidden="true"><i style={{ width: `${g.total ? Math.round((g.done / g.total) * 100) : 0}%` }} /></span>}
                    {!g.running && g.readers?.map((x) => <p key={x.id}><span>{x.label}</span><b className={x.total && x.ok / x.total >= 0.9 ? "is-ok" : x.total && x.ok / x.total < 0.7 ? "is-bad" : ""}>{x.total ? `${x.ok} з ${x.total} · ${Math.round((x.ok / x.total) * 100)}%` : "не відповів"}</b>{x.misses[0] && <small>{x.misses[0]}</small>}</p>)}
                  </div>
                ); })()}
                {err && <p className="v3-tg-rerr"><b>Остання помилка</b>{err}{r.ai ? " — пост читає наступний у ланцюжку" : ""}</p>}
                {data.account && (data.account.enabled ? <p className={`v3-tg-acc${data.account.error ? " is-bad" : ""}`}>{data.account.error ? `Акаунт Telegram: ${data.account.error}` : "Акаунт Telegram підключено — можна додавати приватні канали t.me/+…"}</p> : null)}
                <small>Читають по черзі: якщо в одного ліміт або погана відповідь — наступний. Квиток із грошима читають двоє; якщо не згодні — пост іде в «Нерозпізнані». Точніший за вашими виправленнями й перевірками читач стає першим. Справа — запитів сьогодні / денний ліміт («≈» — приблизний, уточниться, коли читач уперше дійде до ліміту).</small>
                </>}
              </div>
  ); })() : null;
  const readerEl = readerView();
  const chBody = (ch: TgChannel, web: boolean) => (<>
            {ch.status === "block" ? <p className="v3-tg-warn">Заблоковано в «Підтримці». Пости не збираємо, статистику не показуємо.</p>
              : ch.status === "err" ? <p className="v3-tg-warn is-bad">{ch.error}. Перевірте, чи канал публічний і чи не змінив нікнейм.</p> : null}
            {ch.status !== "block" && !ch.money?.length && <div className="v3-tg-bank is-empty"><div className="v3-tg-bankh"><span>Гроші каналу за квитками</span><b>—</b></div><small className="v3-tg-bankn">Квитків із сумою ставки ще не було — гроші порахуємо, коли канал покаже квиток зі ставкою.</small></div>}
            {!!ch.money?.length && ch.money.map((m) => { const c = CUR[m.currency] || m.currency, f = (n?: number) => `${(n || 0).toLocaleString("uk-UA", { maximumFractionDigits: 2 })} ${c}`; return (
              <div key={m.currency} className="v3-tg-bank">
                <div className="v3-tg-bankh"><span>Гроші каналу за квитками</span><b className={tone(m.profit)}>{cash(m.profit, m.currency)}{m.profitUsd != null && !["USD", "USDT"].includes(m.currency) ? <small className="v3-tg-usd">≈ {cash(m.profitUsd, "USD")}</small> : null}</b></div>
                <div className="v3-tg-banks">
                  <div><small>Поставив</small><b>{f(m.staked)}</b><em>{m.bets} {plural(m.bets, "ставка", "ставки", "ставок")}</em></div>
                  <div className="is-ok"><small>Виграв</small><b>{m.won ? "+" : ""}{f(m.won)}</b><em>{m.wins ?? 0} {plural(m.wins ?? 0, "ставка", "ставки", "ставок")}</em></div>
                  <div className="is-bad"><small>Програв</small><b>{m.lost ? "−" : ""}{f(m.lost)}</b><em>{m.losses ?? 0} {plural(m.losses ?? 0, "ставка", "ставки", "ставок")}</em></div>
                </div>
                {m.roi != null && <small className="v3-tg-bankn">Окупність грошей <b className={tone(m.roi)}>{pct(m.roi)}</b> — прибуток на кожні 100 поставлених, великі ставки важать більше</small>}
                {!!m.openBets && <small className="v3-tg-bankn">Ще в грі: {f(m.open)} · {m.openBets} {plural(m.openBets, "ставка", "ставки", "ставок")}</small>}
              </div>
            ); })}
            {web ? (ch.status !== "block" && <div className="v3-tgw-two"><SlipList key={ch.handle} handle={ch.handle} title={ch.title || at(ch.handle)} wide /><button type="button" className="v3-tg-slipt" onClick={() => setMore(true)}><BarChart3 size={16} aria-hidden="true" />Статистика</button></div>) : ch.status !== "block" && <SlipList key={ch.handle} handle={ch.handle} title={ch.title || at(ch.handle)} />}
            <div className="v3-tg-kv is-3">
              <div><span>Сьогодні</span><b>{ch.days[ch.days.length - 1] ?? 0}<small> {plural(ch.days[ch.days.length - 1] ?? 0, "пост", "пости", "постів")}</small></b></div>
              <div><span>Усього постів</span><b>{ch.all?.posts ?? 0}</b></div>
              <div><span>Прогнозів</span><b>{ch.all?.tips ?? ch.tips7d}{ch.all?.pending ? <small className="v3-tg-pend" title="Очікують результату"> · <Clock size={12} aria-hidden="true" />{ch.all.pending}</small> : null}</b></div>
              <div><span>Розпізнано</span><b className={ch.all?.recognized == null ? "" : ch.all.recognized >= 85 ? "is-ok" : ch.all.recognized >= 70 ? "is-warn" : "is-bad"}>{ch.all?.recognized != null ? `${ch.all.recognized}%` : "—"}</b></div>
              <div><span>Вінрейт</span><b>{ch.all?.winrate != null ? `${ch.all.winrate}%` : "—"}{ch.all && ch.all.won + ch.all.lost ? <small> · {ch.all.won}–{ch.all.lost}</small> : null}</b></div>
              <div><span>Окупність</span><b className={tone(ch.all?.roi)}>{pct(ch.all?.roi)}</b></div>
            </div>
            {ch.all && (ch.all.ours?.won || ch.all.ours?.lost || ch.all.mismatches || ch.all.live || ch.all.deleted || ch.all.oddsHigh) ? <div className="v3-tg-honest">
              <span>Наша перевірка</span>
              <div className="v3-tg-kv">
                <div><span>ROI за каналом</span><b className={tone(ch.all.roi)}>{pct(ch.all.roi)}</b></div>
                <div><span>ROI за нашим рахунком</span><b className={tone(ch.all.ours?.roi)}>{pct(ch.all.ours?.roi)}</b></div>
                <div><span>Чесність</span><b className={ch.all.honesty == null ? "" : ch.all.honesty >= 90 ? "is-ok" : ch.all.honesty >= 70 ? "is-warn" : "is-bad"}>{ch.all.honesty != null ? `${ch.all.honesty}%` : "—"}</b><small className="v3-tg-hsub">{[ch.all.mismatches ? `розбіжн. ${ch.all.mismatches}` : "", ch.all.deletedLost ? `видал. програшів ${ch.all.deletedLost}` : "", ch.all.liveWon ? `наживо виграно ${ch.all.liveWon}` : ""].filter(Boolean).join(" · ") || "без підозр"}</small></div>
                <div><span>Ставки наживо</span><b>{ch.all.live ?? 0}{ch.all.live ? <small> · {ch.all.liveWon ?? 0}–{ch.all.liveLost ?? 0}</small> : null}</b></div>
              </div>
              <small>{ch.all.ours?.onlyOurs ? `${ch.all.ours.onlyOurs} ${plural(ch.all.ours.onlyOurs, "прогноз канал не закрив", "прогнози канал не закрив", "прогнозів канал не закрив")} — перевірили ми. ` : ""}{ch.all.deleted ? `Видалено каналом: ${ch.all.deleted}${ch.all.deletedLost ? `, з них програшних ${ch.all.deletedLost}` : ""}. ` : ""}{ch.all.oddsHigh ? `Кф помітно вищий за наш: ${ch.all.oddsHigh}. ` : ""}{ch.all.edited ? `Змінено після публікації: ${ch.all.edited}.` : ""}</small>
            </div> : null}
            {ch.skill && (ch.skill.clv || ch.skill.best || ch.skill.copies) && <div className="v3-tg-skill">
              <span className="v3-tg-skillh">Уміння каналу</span>
              {ch.skill.clv && <p><b className={tone(ch.skill.clv.avg)}>{ch.skill.clv.avg > 0 ? "+" : ""}{ch.skill.clv.avg}%</b> CLV · кф каналу проти кф перед стартом, {ch.skill.clv.n} {plural(ch.skill.clv.n, "ставка", "ставки", "ставок")}<small>{ch.skill.clv.avg > 1 ? "Бере ціну раніше за ринок — ознака вміння, а не везіння" : ch.skill.clv.avg < -1 ? "Бере гірші кф, ніж ринок перед матчем" : "На рівні ринку"}</small></p>}
              {ch.skill.best && <p>Найсильніший у ставках {ch.skill.best.kind}: <b className={tone(ch.skill.best.roi)}>{pct(ch.skill.best.roi)}</b>{ch.skill.worst && ch.skill.worst.roi < 0 ? <> · {ch.skill.worst.kind} у мінусі <b className="is-bad">{pct(ch.skill.worst.roi)}</b></> : null}</p>}
              {ch.skill.copies && <p className="is-warn">Копіює <b>@{ch.skill.copies.from}</b> — {ch.skill.copies.n} {plural(ch.skill.copies.n, "прогноз", "прогнози", "прогнозів")} той канал виклав раніше</p>}
            </div>}
            {!web && <button type="button" className="v3-tg-slipt" onClick={() => setMore(true)}><BarChart3 size={16} aria-hidden="true" />Статистика каналу</button>}
            <Dialog open={more} onOpenChange={setMore}>
              <DialogContent className="v3-sheet v3-pay-sheet v3-tg-sheet v3-tg-statsm">
                <DialogTitle>Статистика каналу</DialogTitle>
                <DialogDescription>{ch.title || at(ch.handle)} · окупність, гроші, серії, вінрейт</DialogDescription>
                <ChannelStats handle={ch.handle} />
                <p className="v3-tg-kvn">«Окупність» — скільки приносить кожні 100 поставлених за прогнозами каналу. Повтори одного прогнозу рахуємо раз.</p>
                <div className="v3-mxp-acts"><button type="button" className="is-grey" onClick={() => setMore(false)}>Закрити</button></div>
              </DialogContent>
            </Dialog>
  </>);
  const t = data?.totals;
  // ═════════════ WEB (≥768 px): «Telegram · веб» — list + channel panel, the unrecognised queue + inline «Розібрати пост» ═════════════
  if (!phone) {
    const chs = data?.channels || [];
    const nq = wq.trim().toLowerCase();
    const sorted = [...chs].sort((x, y) => sort === "roi" ? (y.all?.ours?.roi ?? y.all?.roi ?? -1e9) - (x.all?.ours?.roi ?? x.all?.roi ?? -1e9) : sort === "win" ? (y.all?.winrate ?? -1) - (x.all?.winrate ?? -1) : sort === "honest" ? (y.all?.honesty ?? -1) - (x.all?.honesty ?? -1) : 0)
      .filter((c) => !nq || (c.title || "").toLowerCase().includes(nq) || c.handle.toLowerCase().includes(nq.replace(/^@/, "")));
    const unkF = (unk || []).filter((p) => !nq || p.text.toLowerCase().includes(nq) || (p.title || p.handle).toLowerCase().includes(nq));
    const wCh = ch || sorted[0] || chs[0] || null;
    const lastCheck = chs.reduce<string | null>((m, c) => (c.checkedAt && (!m || c.checkedAt > m) ? c.checkedAt : m), null);
    const bestCh = data?.best ? chs.find((x) => x.handle === data.best!.handle) : null;
    const acc = data?.accuracy;
    const stTag = (c: TgChannel): [string, string] => c.status === "block" ? ["Заблоковано", "is-red"] : c.progress ? [`Читаємо ${Math.min(100, Math.round((c.progress.done / Math.max(1, c.progress.total)) * 100))}%`, "is-blue"] : c.paused ? ["Зупинено", "is-grey"] : c.status === "err" ? ["Помилка", "is-red"] : ["Працює", "is-green"];
    const kpis = [
      { k: "p", l: "Постів за 24 год", v: t ? String(t.posts24h) : "…", n: t ? `прогнозів ${t.tips24h}` : "" },
      { k: "r", l: "Розпізнано", v: t?.recognized != null ? `${t.recognized}%` : t ? "—" : "…", n: t ? ((t.queue ?? t.unknown7d) ? `${t.queue ?? t.unknown7d} ${plural(t.queue ?? t.unknown7d, "чекає", "чекають", "чекають")} розбору` : "черга порожня") : "" },
      { k: "b", l: data?.best ? `Канал тижня · ${data.best.title || `@${data.best.handle}`}` : "Канал тижня", v: data?.best ? pct(data.best.roi) : data ? "—" : "…", n: data?.best ? `${data.best.won}–${data.best.lost} за 7 днів${bestCh?.all?.honesty != null ? ` · чесність ${bestCh.all.honesty}%` : ""}` : "мало розрахованих прогнозів", c: data?.best ? tone(data.best.roi) : "", go: data?.best ? () => void openCh(data.best!.handle) : undefined },
      { k: "a", l: "Точність читачів", v: acc?.percent != null ? `${acc.percent}%` : data ? "—" : "…", n: acc ? `${acc.posts} ${plural(acc.posts, "пост", "пости", "постів")} за 7 днів · виправлено ${acc.wrong}` : "", c: acc?.percent == null ? "" : acc.percent >= 90 ? "is-ok" : acc.percent < 70 ? "is-bad" : "" },
    ];
    const bars = (c: TgChannel) => { const mx = Math.max(1, ...c.days); return <span className="v3-tgw-bars" aria-label={`7 днів: ${c.days.reduce((a, b) => a + b, 0)} постів`}>{c.days.map((d, k) => <i key={k} className={`${k === 6 ? "is-today" : ""}${d ? "" : " is-zero"}`} style={{ height: `${d ? Math.max(18, Math.round((d / mx) * 100)) : 10}%` }} />)}</span>; };
    const table = (
      <div className="v3-adw-card v3-tgw-list">
        <div className="v3-adw-tr v3-tgw-cols is-th"><span>Канал</span><span>7 днів</span><span>Прогнози</span><span>Вінрейт</span><span>Гроші</span><span>Стан</span></div>
        {!sorted.length ? <p className="v3-mxw-none">За «{wq.trim()}» каналів немає</p> : sorted.map((c, i) => { const A = c.all, m = c.money?.[0], tg = stTag(c), sel = wCh?.handle === c.handle; return (
          <button key={c.handle} type="button" className={`v3-adw-tr v3-tgw-cols${sel ? " is-sel" : ""}${opening === c.handle ? " is-opening" : ""}`} style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }} aria-pressed={sel} onClick={() => !opening && void openCh(c.handle)}>
            <span className="v3-tgw-who"><span className="v3-tg-av is-s"><TgAvatar handle={c.handle} name={c.title || c.handle} color={colorOf(c.handle)} />{(() => { const n = chSeen[c.handle] != null ? (A?.posts ?? 0) - chSeen[c.handle] : 0; return n > 0 ? <i className="v3-tg-new v3-tgw-new" aria-label={`${n} ${plural(n, "новий пост", "нові пости", "нових постів")}`}>{n > 99 ? "99+" : n}</i> : null; })()}</span><span><strong>{c.title || `@${c.handle}`}</strong><small>{at(c.handle)} · {GAME[c.game]}{c.isTest ? " · тест" : ""} · пост {when(c.lastPostAt)}</small></span></span>
            <span>{c.status === "block" ? <small className="v3-tgw-mute">—</small> : bars(c)}</span>
            <span className="v3-tgw-num"><b>{A ? A.tips : c.tips7d}</b><small>{A && A.won + A.lost ? `${A.won}–${A.lost}` : ""}{A?.pending ? <> · <Clock size={10} aria-hidden="true" />{A.pending}</> : null}</small></span>
            <span className={`v3-tgw-num ${A?.winrate == null ? "" : A.winrate >= 55 ? "is-ok" : A.winrate < 45 ? "is-bad" : ""}`}><b>{A?.winrate != null ? `${A.winrate}%` : "—"}</b></span>
            <span className={`v3-tgw-num ${m ? tone(m.profit) : ""}`}><b>{m ? cash(m.profit, m.currency) : "—"}</b></span>
            <span><span className={`v3-uwt ${tg[1]}`}>{tg[1] === "is-green" && <i className="v3-tgw-dot" aria-hidden="true" />}{tg[0]}</span></span>
          </button>
        ); })}
        <p className="v3-tgw-note">Канали з’являються самі, коли користувач додає публічне посилання t.me/… у «Telegram-групи». Збираємо раз на 10 хв, уночі 02–06 — раз на годину.</p>
      </div>
    );
    const shown = plist ? plist.items : posts;
    const canMore = plist ? plist.more : !!posts && posts.length >= 30;
    const pcount: Record<string, number | undefined> = wCh ? { all: wCh.all?.posts, tips: wCh.all?.tips, slips: (wCh.money || []).reduce((x, m) => x + m.bets + (m.openBets ?? 0), 0), unknown: wCh.all?.unknown } : {};
    const postsCard = sel && wCh && (
      <div className="v3-adw-card v3-tgw-posts" key={`p-${wCh.handle}`}>
        <div className="v3-tgw-ph"><h2>Останні пости <small>· {wCh.title || at(wCh.handle)} · перевірено {hhmm(wCh.checkedAt)}</small></h2>
          <div className="v3-uw-chips" role="radiogroup" aria-label="Які пости">{([["all", "Усі"], ["tips", "Прогнози"], ["slips", "Квитки"], ["unknown", "Нерозпізнані"]] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={pf === k} className={pf === k ? "is-on" : ""} onClick={() => pickPf(k)}>{l}{pcount[k] != null ? <b>{pcount[k]}</b> : null}</button>)}</div>
          <div className="v3-mxw-view" role="group" aria-label="Вигляд"><button type="button" className={view === "list" ? "is-on" : ""} aria-pressed={view === "list"} aria-label="Списком" onClick={() => pickView("list")}><List size={15} /></button><button type="button" className={view === "grid" ? "is-on" : ""} aria-pressed={view === "grid"} aria-label="Картками" onClick={() => pickView("grid")}><LayoutGrid size={15} /></button></div></div>
        {shown === null || (plist?.loading && !plist.items.length) ? <div className="v3-adw-skel">{[0, 1, 2].map((i) => <i key={i} style={{ height: 64 }} />)}</div>
          : !shown.length ? <p className="v3-mxw-none">{pf === "all" ? "Постів ще немає — перший збір за кілька хвилин." : "Таких постів немає."}</p>
          : view === "grid" ? <div key="grid" className="v3-tgw-pgrid">{masonryN(shown, 3).map((col, ci) => <ul key={ci}>{col.map(({ p, i }) => (
            <li key={`${p.postId}-${i}`} style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}>
              {pf === "all" && i < freshN ? <span className="v3-tgw-pno is-new">NEW</span> : <span className="v3-tgw-pno">{i + 1}</span>}
              {p.photos?.length ? <Shots urls={p.photos.slice(0, 1)} /> : null}
              {p.kind === "bet" && p.team1 && <b className="v3-tgw-pgb">{p.team1} — {p.team2} · {MARKET(p)}</b>}
              {(p.text || !p.photos?.length) && <MoreText text={p.text || "—"} cap={!!p.photos?.length} />}
              <span className="v3-tg-ph"><em className={`v3-tg-st ${KIND(p)[1]}`}>{KIND(p)[0]}</em>{RES(p) && <em className={`v3-tg-st ${RES(p)![1]}`}>{RES(p)![0]}{p.score && !p.slip ? ` · ${p.score}` : ""}</em>}<Marks p={p} /></span>
              <span className="v3-tgw-pgf"><small><b>№{postNo(p)}</b> · {when(p.postedAt)}{p.kind === "bet" && p.odds ? ` · ${odds(p.odds)}` : ""}</small>{READ[p.readBy || ""] ? <i className={`v3-tg-rb is-${p.readBy}`}>{READ[p.readBy!]}</i> : null}</span>
              <button type="button" className="v3-tgw-pgfix" onClick={() => setFix({ ...p, title: wCh.title })}>{p.kind === "unknown" ? "Розібрати" : "Змінити розбір"}</button>
            </li>
          ))}</ul>)}</div>
          : <ul key="list" className="v3-tgw-plist">{shown.map((p, i) => (
            <li key={`${p.postId}-${i}`} style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}>
              {pf === "all" && i < freshN ? <span className="v3-tgw-pno is-new">NEW</span> : <span className="v3-tgw-pno">{i + 1}</span>}
              {p.photos?.length ? <Shots urls={p.photos.slice(0, 1)} /> : null}
              <span className="v3-tgw-pm">
                <b>{p.kind === "bet" && p.team1 ? `${p.team1} — ${p.team2} · ${MARKET(p)}` : (p.text || "Скрін без підпису").slice(0, 120)}</b>
                {p.kind === "bet" && p.text && <small>{p.text.slice(0, 140)}</small>}
                <span className="v3-tg-ph"><em className={`v3-tg-st ${KIND(p)[1]}`}>{KIND(p)[0]}</em>{RES(p) && <em className={`v3-tg-st ${RES(p)![1]}`}>{RES(p)![0]}{p.score && !p.slip ? ` · ${p.score}` : ""}</em>}<Marks p={p} /></span>
              </span>
              <span className="v3-tgw-pr"><b>№{postNo(p)}</b><small>{when(p.postedAt)}{p.kind === "bet" && p.odds ? ` · ${odds(p.odds)}` : ""}</small>{READ[p.readBy || ""] ? <i className={`v3-tg-rb is-${p.readBy}`}>{READ[p.readBy!]}</i> : null}<button type="button" onClick={() => setFix({ ...p, title: wCh.title })}>{p.kind === "unknown" ? "Розібрати" : "Змінити розбір"}</button></span>
            </li>
          ))}</ul>}
        {canMore && <button type="button" className="v3-uw-more" disabled={!!plist?.loading} onClick={() => void loadPosts(pf, true)}>{plist?.loading ? "Завантажуємо…" : "Показати ще 30"}</button>}
      </div>
    );
    const panel = wCh && (
      <aside key={wCh.handle} className="v3-adw-card v3-tgw-panel">
        <div className="v3-tgw-pnh"><span className="v3-tg-av"><TgAvatar handle={wCh.handle} name={wCh.title || wCh.handle} color={colorOf(wCh.handle)} /></span><span><b>{wCh.title || `@${wCh.handle}`}</b><small>{at(wCh.handle)} · {GAME[wCh.game]}{wCh.subscribers ? ` · ${wCh.subscribers.toLocaleString("uk-UA")} підписників` : ""}{wCh.isTest ? " · тестовий" : ""}</small></span></div>
        <p className="v3-tg-when v3-tgw-pwhen">{wCh.paused ? <>Зупинено · перевірено {when(wCh.checkedAt)}</> : <><i aria-hidden="true" />Перевірено {when(wCh.checkedAt)}{data?.nextAt && !wCh.progress ? ` · наступна перевірка о ${hhmm(data.nextAt)}` : ""}</>}</p>
        {wCh.status !== "block" && <div className="v3-tgw-pacts">
          {wCh.paused ? <button type="button" className="v3-uwb is-green" disabled={!online} onClick={() => void setPaused(wCh, false)}><Play size={13} fill="currentColor" aria-hidden="true" />Запустити</button>
            : <button type="button" className="v3-uwb is-dark" disabled={!online} onClick={() => setStopAsk(wCh)}><i className="v3-mxw-stopic" aria-hidden="true"><Square size={7} fill="currentColor" /></i>Стоп</button>}
          {!wCh.paused && <button type="button" className="v3-uwb is-softblue" disabled={!online} onClick={() => void refreshOne(wCh.handle)}><RefreshCw size={14} aria-hidden="true" />Оновити</button>}
          <a className="v3-uwb is-blue" href={wCh.invite ? `https://t.me/+${wCh.invite}` : `https://t.me/${wCh.handle}`} target="_blank" rel="noreferrer">У Telegram<ExternalLink size={13} aria-hidden="true" /></a>
        </div>}
        {chBody(wCh, true)}
        <button type="button" role="switch" aria-checked={!wCh.isTest} className="v3-tg-pub" disabled={!online} onClick={() => void togglePublic(wCh)}>
          <span><strong>Показувати користувачам</strong><small>{wCh.isTest ? "Тестовий: канал бачите лише ви" : "Канал видно в застосунку"}</small></span>
          <i className={`v3-st-sw${!wCh.isTest ? " is-on" : ""}`} aria-hidden="true"><span /></i>
        </button>
        {wCh.status !== "block" && <div className={`v3-tgw-more${wCh.isTest ? " is-3" : ""}`}>
          <button type="button" className="v3-uwb is-soft" disabled={!online} onClick={() => void reread(wCh.handle)}><RefreshCw size={13} aria-hidden="true" />Перечитати пости</button>
          <button type="button" className="v3-uwb is-soft" disabled={!online} onClick={() => void archive(wCh.handle)}><History size={13} aria-hidden="true" />Архів</button>
          {wCh.isTest && <button type="button" className="v3-uwb is-softred" disabled={!online} onClick={() => setDelAsk(wCh)}><Trash2 size={13} aria-hidden="true" />Видалити</button>}
        </div>}
      </aside>
    );
    const fixWeb = tab === "un" && !!fix && (unk || []).some((p) => p.handle === fix.handle && p.postId === fix.postId);
    return (
      <div className="v3-page v3-uw v3-tg v3-tgw">
        <section className="v3-uw-hero">
          <div><h1>Telegram</h1><p>{!data ? "Публічні канали, які ми читаємо" : !chs.length ? "каналів ще немає" : `${t!.channels} ${plural(t!.channels, "канал", "канали", "каналів")} · ${t!.posts24h} ${plural(t!.posts24h, "пост", "пости", "постів")} за 24 год${lastCheck ? ` · перевірено ${hhmm(lastCheck)}` : ""}${data.night ? " · нічний режим" : ""}`}</p></div>
          <div className="v3-uw-hacts">
            {chs.length > 1 && <button type="button" className="v3-uwb is-white" onClick={() => setRankOpen(true)}><Trophy size={14} aria-hidden="true" />Рейтинг каналів</button>}
            <button type="button" className="v3-uwb is-white" disabled={!online || busy} onClick={() => void refreshAll()}><RefreshCw size={14} aria-hidden="true" className={busy ? "v3-tg-spinic" : ""} />Оновити</button>
            <button type="button" className="v3-uwb is-green" disabled={!online} onClick={() => setAddOpen(true)}><Plus size={15} aria-hidden="true" />Додати канал</button>
          </div>
        </section>
        {err && !data ? <div className="v3-adw-card v3-adw-empty"><span aria-hidden="true">!</span><strong>Не вдалося завантажити канали</strong><p>{err}</p><button type="button" className="v3-uwb is-green" onClick={() => void load()}>Спробувати ще раз</button></div> : <>
          {(!data || chs.length > 0) && <section className="v3-pw-kpis" aria-label="Підсумки">{kpis.map((x, i) => <div key={x.k} className={`v3-pw-kpi${i === 0 ? " is-on" : ""}${x.go ? " is-click" : ""}`} style={{ animationDelay: `${i * 40}ms` }} role={x.go ? "button" : undefined} tabIndex={x.go ? 0 : undefined} onClick={x.go} onKeyDown={x.go ? (e) => { if (e.key === "Enter") x.go!(); } : undefined}><span>{x.l}</span><strong className={x.c || ""}>{x.v === "…" ? "…" : <RollingNumber key={`${x.k}-${x.v}`} text={x.v} />}</strong><small>{x.n}</small></div>)}</section>}
          <div className="v3-uw-tools v3-mxw-tools">
            <div className="v3-uw-tabs" role="tablist" aria-label="Розділи"><PillTrack active={tab} />{([["ch", "Канали", data?.channels.length], ["un", "Нерозпізнані", unk?.length]] as const).map(([k, l, n]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "is-on" : ""} onClick={() => { setTab(k); setWq(""); if (k === "un") markSeen(); }}>{l}<span className={`v3-pw-tn${k === "un" && n ? " is-alert" : ""}`}>{n ?? "…"}</span></button>)}</div>
            {tab === "ch" && chs.length > 1 && <div className="v3-spw-kinds" role="group" aria-label="Сортування"><PillTrack active={sort} />{([["new", "Нові"], ["roi", "ROI"], ["win", "Вінрейт"], ["honest", "Чесність"]] as const).map(([k, l]) => { const nn = k === "new" ? chs.reduce((x, c) => x + Math.max(0, chSeen[c.handle] != null ? (c.all?.posts ?? 0) - chSeen[c.handle] : 0), 0) : 0; return <button key={k} type="button" className={sort === k ? "is-on" : ""} aria-pressed={sort === k} onClick={() => setSort(k)}>{l}{nn ? <b className="v3-tgw-nn">{nn > 99 ? "99+" : nn}</b> : null}</button>; })}</div>}
            {tab === "ch" && data?.reader && (() => { const r = data.reader, rerr = r.ai ? r.aiError : r.ocrError; return (
              <div className="v3-tgw-rwrap" ref={rPopRef}>
                <button type="button" className={`v3-tgw-rbtn${rOpen ? " is-on" : ""}`} aria-expanded={rOpen} aria-haspopup="dialog" onClick={() => setROpen((o) => !o)}>
                  <span className={`v3-tg-rdot${rerr ? " is-warn" : ""}`} aria-hidden="true" /><b>{r.ai ? "Пости й скріни читає ШІ" : "Скріни читає OCR"}</b><em>{r.ai ? (r.model || "Gemini") : "без ключа ШІ"}</em><ChevronDown size={16} aria-hidden="true" className={rOpen ? "is-up" : ""} />
                </button>
                {rOpen && <div className="v3-tgw-rpop" role="dialog" aria-label="Читачі постів">{readerView(true)}</div>}
              </div>
            ); })()}
            <label className="v3-uw-search v3-spw-search"><Search size={15} aria-hidden="true" /><input type="search" aria-label="Пошук" placeholder={tab === "ch" ? "Канал або @нік" : "Текст поста або канал"} value={wq} onChange={(e) => setWq(e.target.value)} />{wq && <button type="button" aria-label="Очистити" onClick={() => setWq("")}><X size={13} /></button>}</label>
          </div>
          <div key={tab}>
            {tab === "ch" ? (
              !data ? <section className="v3-tgw-split"><div className="v3-adw-card v3-adw-skel">{[0, 1, 2].map((i) => <i key={i} style={{ height: 52 }} />)}</div><aside className="v3-adw-card v3-adw-skel"><i style={{ height: 300 }} /></aside></section>
              : !chs.length && !data.invites.length ? <div className="v3-adw-card v3-adw-empty"><span aria-hidden="true"><Send size={20} /></span><strong>Каналів ще немає</strong><p>Додайте публічний канал кнопкою «Додати канал» або дочекайтесь, поки користувач Pro додасть посилання t.me/… у «Telegram-групи».</p><button type="button" className="v3-uwb is-green" onClick={() => setAddOpen(true)}><Plus size={15} aria-hidden="true" />Додати канал</button></div>
              : <section className="v3-tgw-split">
                <div className="v3-tgw-col">
                  {data.tme?.limitedUntil && <div className="v3-adw-warn"><Info size={14} aria-hidden="true" />Telegram тимчасово обмежив наші запити — збір продовжиться о {hhmm(data.tme.limitedUntil)}.</div>}
                  <Candidates onAdd={(h) => { setAddLink(`https://t.me/${h}`); setAddOpen(true); }} />
                  {table}
                  {postsCard}
                </div>
                {panel}
              </section>
            ) : (
              unk === null ? <div className="v3-adw-card v3-adw-skel">{[0, 1].map((i) => <i key={i} style={{ height: 80 }} />)}</div>
              : !unk.length ? <div className="v3-adw-card v3-adw-empty"><span aria-hidden="true"><Check size={20} /></span><strong>Усе розібрано</strong><p>За 7 днів немає постів, схожих на прогноз, які ми не зрозуміли.</p></div>
              : <section className="v3-tgw-split">
                <div className="v3-adw-card v3-tgw-unk">
                  <div className="v3-tgw-unh">{pickMode ? <><b>Вибрано {picked.size}</b><div><button type="button" className="v3-uwb is-soft" onClick={() => setPicked(new Set(unk.map(keyOf)))}>Усі</button><button type="button" className="v3-uwb is-soft" onClick={() => { setPickMode(false); setPicked(new Set()); }}>Скасувати</button></div></>
                    : <><b>{unk.length} {plural(unk.length, "пост чекає", "пости чекають", "постів чекають")} розбору</b><div>{(data?.doubts?.open || data?.doubts?.running) ? <button type="button" className="v3-uwb is-soft" disabled={!online || data.doubts.running} onClick={() => void rereadTgDoubtful().then(() => { toast.success("Перечитуємо сумнівні"); setTimeout(() => void load(), 2_000); }).catch((e) => toast.error("Не вдалося", { description: (e as Error).message }))}><RefreshCw size={13} aria-hidden="true" />{data.doubts.running ? `${data.doubts.done} з ${data.doubts.total}…` : `Перечитати сумнівні · ${data.doubts.open}`}</button> : null}<button type="button" className="v3-uwb is-soft" onClick={() => setPickMode(true)}>Вибрати кілька</button></div></>}</div>
                  {!unkF.length && <p className="v3-mxw-none">За «{wq.trim()}» постів немає</p>}
                  {unkF.map((p, i) => { const on = !pickMode && fix?.handle === p.handle && fix?.postId === p.postId; return (
                    <button key={`${p.handle}/${p.postId}`} type="button" className={`v3-tgw-un${on ? " is-sel" : ""}${pickMode && picked.has(keyOf(p)) ? " is-picked" : ""}`} style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }} aria-pressed={pickMode ? picked.has(keyOf(p)) : on} onClick={() => (pickMode ? togglePick(p) : setFix(p))}>
                      {pickMode && <i className="v3-tg-pickbox" aria-hidden="true">{picked.has(keyOf(p)) && <Check size={13} strokeWidth={3} />}</i>}
                      {p.photos?.length ? <Shots urls={p.photos.slice(0, 1)} /> : null}
                      <span className="v3-tgw-unm">
                        <span className="v3-tgw-unc"><span className="v3-tg-av is-s"><TgAvatar handle={p.handle} name={p.title || p.handle} color={colorOf(p.handle)} /></span><b>{p.title || `@${p.handle}`}</b><small>{when(p.postedAt)}</small></span>
                        <span className="v3-tgw-unt">{p.text || (p.photos?.length ? "Скрін без підпису" : "")}</span>
                        {p.mismatch ? <em className="v3-tg-st is-bad">Розбіжність: канал — {p.result === "Win" ? "виграш" : "програш"}, за нашим рахунком{p.score ? ` ${p.score}` : ""} — {p.ourResult === "Win" ? "виграш" : "програш"}</em>
                          : <em className="v3-tg-st is-warn">{p.doubt || p.reason || "Не розпізнано"}</em>}
                      </span>
                    </button>
                  ); })}
                  {pickMode && picked.size > 0 && <button type="button" className="v3-uwb is-blue v3-tgw-pickgo" disabled={!online} onClick={() => void bulkInfo()}>Позначити «Інфо» · {picked.size}</button>}
                  <p className="v3-tgw-note">Розібраний вручну пост рахується в статистиці каналу. Тут і пости, де наш рахунок не зійшовся з результатом каналу.</p>
                </div>
                {fixWeb ? <FixSheet inline post={fix} online={online} onClose={() => setFix(null)} onDone={() => { setFix(null); void load(); }} />
                  : <aside className="v3-adw-card v3-adw-empty v3-tgw-pick"><span aria-hidden="true"><Pencil size={18} /></span><strong>Виберіть пост ліворуч</strong><p>Тут з’явиться його розбір: тип поста, матч, ставка, кф і результат.</p></aside>}
              </section>
            )}
          </div>
        </>}

        {data && <RankSheet open={rankOpen} onOpenChange={setRankOpen} channels={data.channels} onPick={(h) => { setRankOpen(false); setTab("ch"); void openCh(h); }} />}
        <Dialog open={!!stopAsk} onOpenChange={(o) => { if (!o) setStopAsk(null); }}>
          <DialogContent className="v3-modal v3-uwm v3-adwm v3-tgw-ask" style={{ maxWidth: 440 }} onOpenAutoFocus={(e) => e.preventDefault()}>
            <div className="v3-adwm-h"><div><DialogTitle className="v3-modal-title">Зупинити збір?</DialogTitle></div><button type="button" className="v3-adwm-x" aria-label="Закрити" onClick={() => setStopAsk(null)}><X size={16} /></button></div>
            <DialogDescription className="v3-modal-sub">«{stopAsk?.title || stopAsk?.handle}» більше не читатимемо, поки не запустите знову. Зібрані пости й статистика лишаються.</DialogDescription>
            <div className="v3-tgw-askf"><button type="button" className="v3-uwb is-soft" onClick={() => setStopAsk(null)}>Скасувати</button><button type="button" className="v3-uwb is-red" disabled={!online} onClick={() => stopAsk && void setPaused(stopAsk, true)}>Зупинити</button></div>
          </DialogContent>
        </Dialog>
        <DeleteAsk open={!!delAsk} title={`Видалити «${delAsk?.title || delAsk?.handle || ""}»?`} busy={false} onClose={() => setDelAsk(null)} onDelete={() => delAsk && void remove(delAsk)} text="Канал зникне зі списку разом з усіма зібраними постами й статистикою. Це не можна скасувати." />
        <CheckSheet open={checkOpen} online={online} onClose={(changed) => { setCheckOpen(false); if (changed) void load(); }} onFix={(p) => setFix(p)} />
        {!fixWeb && <FixSheet post={fix} online={online} onClose={() => setFix(null)} onDone={() => { setFix(null); void load(); if (sel) getPosts(sel).then(setPosts).catch(() => {}); }} />}
        <AddSheet open={addOpen} online={online} start={addLink} onOpenChange={(o) => { setAddOpen(o); if (!o) setAddLink(""); }} onDone={() => { setAddOpen(false); setAddLink(""); void load(); }} />
      </div>
    );
  }
  return (
    <div className="v3-page v3-pay v3-tg">
      <section className="v3-hero v3-hero-row">
        <div>
          <h1 className="v3-title">Telegram</h1>
          <p className="v3-subtitle">{data ? `${t!.channels} ${plural(t!.channels, "канал", "канали", "каналів")} · ${t!.posts24h} ${plural(t!.posts24h, "пост", "пости", "постів")} за 24 год${data.night ? " · нічний режим" : ""}` : "Публічні канали, які ми читаємо"}</p>
        </div>
        <div className="v3-chips">
          {data && data.channels.length > 1 && <button type="button" className="v3-chip v3-mx-rf v3-tg-rankic" onClick={() => setRankOpen(true)} aria-label="Рейтинг каналів" title="Рейтинг каналів"><Trophy size={15} aria-hidden="true" /></button>}
          <button type="button" className={`v3-chip v3-mx-rf${busy ? " is-busy" : ""}`} disabled={!online || busy} onClick={() => void refreshAll()} aria-label="Оновити всі канали"><RefreshCw size={15} aria-hidden="true" /></button>
          <button type="button" className="v3-btn v3-btn-primary v3-mx-plus" disabled={!online} onClick={() => setAddOpen(true)} aria-label="Додати канал"><Plus size={17} aria-hidden="true" /></button>
        </div>
      </section>

      {err && !data ? <div className="v3-dcard v3-uerror" role="alert"><span className="v3-uerror-ico" aria-hidden="true">!</span><strong>Не вдалося завантажити канали</strong><code className="v3-uerror-det">{err}</code><div><button type="button" className="v3-btn v3-btn-blue" onClick={() => void load()}>Спробувати ще раз</button></div></div> : <>
        <section className="v3-sums v3-pay-sums v3-mx-sums" aria-label="Підсумки">
          <div className="v3-sum is-static is-on"><span className="v3-sum-l">Постів за 24 год</span><strong className="v3-sum-v"><RollingNumber key={`p${t?.posts24h}`} text={t ? String(t.posts24h) : "—"} /></strong><span className="v3-sum-n"><span className="v3-pay-note">{t ? `прогнозів ${t.tips24h}` : "…"}</span></span></div>
          <div className="v3-sum is-static"><span className="v3-sum-l">Розпізнано</span><strong className="v3-sum-v"><RollingNumber key={`r${t?.recognized}`} text={t?.recognized != null ? `${t.recognized}%` : "—"} /></strong><span className="v3-sum-n"><span className="v3-pay-note">{t ? ((t.queue ?? t.unknown7d) ? `${t.queue ?? t.unknown7d} ${plural(t.queue ?? t.unknown7d, "чекає", "чекають", "чекають")} розбору` : "черга порожня") : "…"}</span></span></div>
        </section>

        {data?.best && data.channels.length > 1 && (() => { const b = data.best!, ch = data.channels.find((x) => x.handle === b.handle); return (
          <button type="button" className="v3-tg-best" onClick={() => void openCh(b.handle)}>
            <span className="v3-tg-bestic" aria-hidden="true"><Trophy size={20} /></span>
            <span className="v3-tg-bestt"><small>Канал тижня</small><strong>{b.title || `@${b.handle}`}</strong><em>{b.won}–{b.lost} за 7 днів{ch?.all?.honesty != null ? ` · чесність ${ch.all.honesty}%` : ""}</em></span>
            <span className="v3-tg-bestr"><b className={b.roi >= 0 ? "is-ok" : "is-bad"}>{pct(b.roi)}</b><small>ROI</small></span>
          </button>
        ); })()}
        {data && <RankSheet open={rankOpen} onOpenChange={setRankOpen} channels={data.channels} onPick={(h) => { setRankOpen(false); void openCh(h); }} />}
        {data?.alerts && ((data.alerts.unknown > (seen.unknown ?? 0)) || (data.alerts.mismatches > (seen.mismatches ?? 0))) && (
          <div className="v3-tg-alert" role="status">
            <span><b>Нове в черзі:</b> {[data.alerts.unknown > (seen.unknown ?? 0) ? `${data.alerts.unknown - (seen.unknown ?? 0)} ${plural(data.alerts.unknown - (seen.unknown ?? 0), "нерозпізнаний пост", "нерозпізнані пости", "нерозпізнаних постів")}` : "", data.alerts.mismatches > (seen.mismatches ?? 0) ? `${data.alerts.mismatches - (seen.mismatches ?? 0)} ${plural(data.alerts.mismatches - (seen.mismatches ?? 0), "розбіжність", "розбіжності", "розбіжностей")} з нашим рахунком` : ""].filter(Boolean).join(" · ")}</span>
            <button type="button" onClick={() => { setTab("un"); markSeen(); }}>Переглянути</button>
            <button type="button" className="is-x" aria-label="Сховати" onClick={markSeen}><X size={15} /></button>
          </div>
        )}
        <div className="v3-pay-tabs v3-tg-tabs" role="tablist" aria-label="Розділи">
          <PillTrack active={tab} />
          {([["ch", "Канали", data?.channels.length], ["un", "Нерозпізнані", unk?.length]] as const).map(([k, l, n]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={`v3-pay-tab${tab === k ? " is-on" : ""}`} onClick={() => setTab(k)}><span>{l}{n != null ? ` · ${n}` : ""}</span></button>)}
        </div>

        {tab === "ch" ? (
          !data ? <div className="v3-tg-list" aria-hidden="true">{[0, 1, 2].map((i) => <div key={i} className="v3-tg-card is-skel"><span className="v3-skel v3-skel-light" /><span className="v3-skel v3-skel-light" /></div>)}</div>
          : !data.channels.length && !data.invites.length ? <div className="v3-mxp-none"><span className="v3-mxp-none-ic" aria-hidden="true"><Send size={20} /></span><strong>Каналів ще немає</strong><span>Додайте публічний канал кнопкою «+» або дочекайтесь, поки користувач Pro додасть посилання t.me/… у «Telegram-групи».</span><button type="button" onClick={() => setAddOpen(true)}>Додати канал</button></div>
          : <div className="v3-tg-list">
            {data.tme?.limitedUntil && <p className="v3-tg-tme">Telegram тимчасово обмежив наші запити — збір продовжиться о {hhmm(data.tme.limitedUntil)}. Паузи між каналами збільшено.</p>}
            <Candidates onAdd={(h) => { setAddLink(`https://t.me/${h}`); setAddOpen(true); }} />
            {readerEl}
            {data.channels.length > 1 && <div className="v3-mxp-bar v3-tg-sortbar"><div className="v3-mxp-days" role="group" aria-label="Сортування">{([["new", "Нові"], ["roi", "ROI"], ["win", "Вінрейт"], ["honest", "Чесність"]] as const).map(([k, l]) => { const nn = k === "new" ? data.channels.reduce((x, c) => x + Math.max(0, chSeen[c.handle] != null ? (c.all?.posts ?? 0) - chSeen[c.handle] : 0), 0) : 0; return <button key={k} type="button" className={sort === k ? "is-on" : ""} aria-pressed={sort === k} onClick={() => setSort(k)}>{l}{nn ? <b>{nn > 99 ? "99+" : nn}</b> : null}</button>; })}</div></div>}
            {[...data.channels].sort((x, y) => sort === "roi" ? (y.all?.ours?.roi ?? y.all?.roi ?? -1e9) - (x.all?.ours?.roi ?? x.all?.roi ?? -1e9) : sort === "win" ? (y.all?.winrate ?? -1) - (x.all?.winrate ?? -1) : sort === "honest" ? (y.all?.honesty ?? -1) - (x.all?.honesty ?? -1) : 0).map((c, i) => { const mx = Math.max(1, ...c.days); const A = c.all; const wk = c.days.reduce((x, n) => x + n, 0); return (
              <div key={c.handle} className={`v3-mxp-pc v3-tg-pc${c.status === "run" ? "" : " is-paused"}${opening === c.handle ? " is-opening" : ""}`} style={{ animationDelay: `${i * 60}ms` }} role="button" tabIndex={0} aria-label={`Відкрити ${c.title || c.handle}`} onClick={() => !opening && void openCh(c.handle)} onKeyDown={(e) => { if (e.key === "Enter" && !opening) void openCh(c.handle); }}>
                <div className="v3-mxp-ph">
                  <span className="v3-tg-av is-s"><TgAvatar handle={c.handle} name={c.title || c.handle} color={colorOf(c.handle)} />{(() => { const n = chSeen[c.handle] != null ? (A?.posts ?? 0) - chSeen[c.handle] : 0; return n > 0 ? <i className="v3-tg-new" aria-label={`${n} ${plural(n, "новий пост", "нові пости", "нових постів")}`}>{n > 99 ? "99+" : n}</i> : null; })()}</span>
                  <strong>{c.title || `@${c.handle}`}</strong>
                  <span className="v3-mxp-pa" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="v3-mxp-plog" onClick={() => !opening && void openCh(c.handle)} aria-label={`Пости й статистика · ${c.title || c.handle}`}><Info size={16} aria-hidden="true" /></button>
                    {c.status === "block" ? null : c.paused
                      ? <button type="button" className="v3-mxp-pgo" disabled={!online} onClick={() => void setPaused(c, false)}><Play size={13} aria-hidden="true" />Запустити</button>
                      : <button type="button" className="v3-mxp-pstop" disabled={!online} onClick={() => setStopAsk(c)} aria-label={`Зупинити ${c.title || c.handle}`}><i aria-hidden="true"><Square size={7} fill="currentColor" /></i>Стоп</button>}
                  </span>
                </div>
                <small className="v3-mxp-psub">{c.status === "err" ? `${c.error}${c.fails && c.fails > 1 ? ` · ${c.fails} рази поспіль` : ""}` : `${at(c.handle)} · ${GAME[c.game]}${c.isTest ? " · тест" : ""} · останній пост ${when(c.lastPostAt)}`}</small>
                {c.autoPaused && c.paused && <small className="v3-tg-auto">Пауза: {c.autoPaused.toLowerCase()}. «Запустити» — читати знову.</small>}
                {!!c.progress && (() => { const pr = c.progress, p = Math.min(100, Math.round((pr.done / Math.max(1, pr.total)) * 100)); return (
                  <div className="v3-tg-prog" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label={PROG[pr.kind]} onClick={(e) => e.stopPropagation()}>
                    <span className="v3-tg-progh"><i className="v3-tg-spin" aria-hidden="true" />{PROG[pr.kind]}<b>{p}%</b></span>
                    <span className="v3-tg-progb"><i style={{ width: `${p}%` }} /></span>
                    <small>{pr.done} з {pr.total} · ≈6 с на пост</small>
                  </div>
                ); })()}
                {c.status !== "block" && <div className="v3-tg-week">
                  <div className="v3-mxp-wh"><span>7 днів</span><b>{wk ? `${wk} ${plural(wk, "пост", "пости", "постів")} · прогнозів ${c.tips7d}` : "постів не було"}</b></div>
                  <span className="v3-tg-bars" onClick={(e) => e.stopPropagation()}>{c.days.map((d, k) => <button type="button" key={k} className={`${k === 6 ? "is-today" : ""}${d ? "" : " is-zero"}`} style={{ height: `${d ? Math.max(14, Math.round((d / mx) * 100)) : 8}%` }} aria-label={`${WD(data.days[k])}: ${d} ${plural(d, "пост", "пости", "постів")}`} onClick={() => setDay({ ch: c, i: k })} />)}</span>
                  <span className="v3-tg-wdays" aria-hidden="true">{data.days.map((d) => <span key={d}>{WD(d)}</span>)}</span>
                </div>}
                <div className="v3-mxp-ptiles v3-tg-pt4">
                  <div><span>Прогнозів</span><b>{A ? A.tips : c.tips7d}</b></div>
                  <div><span>Розпізнано</span><b>{A?.recognized != null ? `${A.recognized}%` : "—"}</b></div>
                  <div><span>Вінрейт</span><b className={A?.winrate == null ? "" : A.winrate >= 55 ? "is-ok" : A.winrate < 45 ? "is-bad" : ""}>{A?.winrate != null ? `${A.winrate}%` : "—"}{A && A.won + A.lost ? <small> · {A.won}–{A.lost}</small> : null}</b></div>
                  {(() => { const m = c.money?.[0]; return <div><span>Гроші</span><b className={m ? tone(m.profit) : ""}>{m ? <>{cash(m.profit, m.currency).replace(/\s\S+$/, "")}<small> {CUR[m.currency] || m.currency}{c.money!.length > 1 ? ` +${c.money!.length - 1}` : ""}</small></> : "—"}</b></div>; })()}
                </div>
                {c.skill?.copies && <p className="v3-tg-copy">Копіює @{c.skill.copies.from} · {c.skill.copies.n} {plural(c.skill.copies.n, "прогноз", "прогнози", "прогнозів")}</p>}
                {A && A.posts > 0 && <div className="v3-mxp-podds"><p>Усього постів {A.posts}: прогнозів {A.tips}, нерозпізнаних {A.unknown}, інфо {A.other}{A.repeats ? `, повторів ${A.repeats}` : ""}</p><small>{A.won + A.lost ? `Розраховано ${A.won + A.lost}: ${A.won} виграш · ${A.lost} програш · ROI ${pct(A.roi)}` : "Розрахованих прогнозів ще немає"}{A.pending ? ` · очікують ${A.pending}` : ""}</small></div>}
                <p className="v3-tg-when">{c.paused ? <>Зупинено · перевірено {when(c.checkedAt)}</> : <><i aria-hidden="true" />Перевірено {when(c.checkedAt)}{data.nextAt && !c.progress ? ` · наступна перевірка о ${hhmm(data.nextAt)}` : ""}</>}</p>
              </div>
            ); })}
            {data.invites.map((g) => (
              <div key={g.link} className="v3-tg-card is-dim"><span className="v3-tg-ch"><span className="v3-tg-av"><TgAvatar handle="" name={g.name} color="#334155" /></span><span className="v3-tg-chn"><strong>{g.name}</strong><small>запрошення · {g.who.join(", ") || "—"}</small></span><em className="v3-tg-st is-warn">Приватний</em></span><span className="v3-tg-line">Посилання-запрошення — пости не видно. Поки читаємо лише публічні канали.</span></div>
            ))}

            <p className="v3-tg-note">Канали з’являються самі, коли користувач додає публічне посилання t.me/… у «Telegram-групи». Збираємо раз на 10 хв, уночі 02–06 — раз на годину.</p>
          </div>
        ) : (
          unk === null ? <div className="v3-tg-list" aria-hidden="true"><div className="v3-tg-card is-skel"><span className="v3-skel v3-skel-light" /><span className="v3-skel v3-skel-light" /></div></div>
          : !unk.length ? <div className="v3-mxp-none"><span className="v3-mxp-none-ic" aria-hidden="true"><Check size={20} /></span><strong>Усе розібрано</strong><span>За 7 днів немає постів, схожих на прогноз, які ми не зрозуміли.</span></div>
          : <div className="v3-tg-list">
            {(data?.doubts?.open || data?.doubts?.running) ? <button type="button" className="v3-tg-reread is-blue" disabled={!online || data.doubts.running} onClick={() => void rereadTgDoubtful().then(() => { toast.success("Перечитуємо сумнівні"); setTimeout(() => void load(), 2_000); }).catch((e) => toast.error("Не вдалося", { description: (e as Error).message }))}><RefreshCw size={15} aria-hidden="true" className={data.doubts.running ? "v3-tg-spinic" : ""} />{data.doubts.running ? `Перечитуємо ${data.doubts.done} з ${data.doubts.total}…` : `Перечитати сумнівні · ${data.doubts.open}`}</button> : null}
            <div className="v3-tg-pickbar">{pickMode ? <><span>Вибрано {picked.size}</span><button type="button" onClick={() => setPicked(new Set(unk.map(keyOf)))}>Усі</button><button type="button" onClick={() => { setPickMode(false); setPicked(new Set()); }}>Скасувати</button></> : <button type="button" onClick={() => setPickMode(true)}><Check size={14} aria-hidden="true" />Вибрати кілька</button>}</div>
            {unk.map((p) => (
              <button key={`${p.handle}/${p.postId}`} type="button" className={`v3-tg-card v3-tg-un${pickMode ? " is-pick" : ""}${picked.has(keyOf(p)) ? " is-picked" : ""}`} aria-pressed={pickMode ? picked.has(keyOf(p)) : undefined} onClick={() => (pickMode ? togglePick(p) : setFix(p))}>
                <span className="v3-tg-unh">{pickMode && <i className="v3-tg-pickbox" aria-hidden="true">{picked.has(keyOf(p)) && <Check size={13} strokeWidth={3} />}</i>}<span className="v3-tg-av is-s"><TgAvatar handle={p.handle} name={p.title || p.handle} color={colorOf(p.handle)} /></span><b>{p.title || `@${p.handle}`}</b><small>{when(p.postedAt)}</small></span>
                <span className="v3-tg-unb"><Shots urls={p.photos} /><span className="v3-tg-untx">{p.text || (p.photos?.length ? "Скрін без підпису" : "")}</span></span>
                {p.mismatch ? <em className="v3-tg-st is-bad">Розбіжність: канал — {p.result === "Win" ? "виграш" : "програш"}, за нашим рахунком{p.score ? ` ${p.score}` : ""} — {p.ourResult === "Win" ? "виграш" : "програш"}</em>
                  : <em className="v3-tg-st is-warn">{p.reason || "Не розпізнано"}</em>}
              </button>
            ))}
            <p className="v3-tg-note">Розібраний вручну пост рахується в статистиці каналу. «Запам’ятати» додає правило — схожі пости далі розпізнаються самі.</p>
            {pickMode && picked.size > 0 && <div className="v3-tg-pickgo"><button type="button" disabled={!online} onClick={() => void bulkInfo()}>Позначити «Інфо» · {picked.size}</button></div>}
          </div>
        )}
      </>}

      <Dialog open={!!ch} onOpenChange={(o) => { if (!o) { if (sel) markChSeen(sel); setSel(null); } }}>
        <DialogContent className="v3-sheet v3-pay-sheet v3-tg-sheet">
          {ch && <>
            <div className="v3-tg-sh"><span className="v3-tg-av is-l"><TgAvatar handle={ch.handle} name={ch.title || ch.handle} color={colorOf(ch.handle)} /></span><span className="v3-tg-chn"><DialogTitle>{ch.title || `@${ch.handle}`}</DialogTitle><DialogDescription>{at(ch.handle)} · {GAME[ch.game]}{ch.subscribers ? ` · ${ch.subscribers.toLocaleString("uk-UA")} підписників` : ""}{ch.isTest ? " · тестовий" : ""}</DialogDescription>{!!ch.bookmakers?.length && <span className="v3-tg-books">Ставить у: {ch.bookmakers.join(" · ")}</span>}</span></div>
            {chBody(ch, false)}
            <div className="v3-tg-shh"><p>Останні пости <small>· перевірено {hhmm(ch.checkedAt)}{ch.users.length ? ` · додали ${ch.users.join(", ")}` : ""}</small></p>
              <span className="v3-tg-vt" role="group" aria-label="Вигляд">
                <button type="button" className={view === "list" ? "is-on" : ""} aria-pressed={view === "list"} aria-label="Списком" onClick={() => pickView("list")}><List size={16} aria-hidden="true" /></button>
                <button type="button" className={view === "grid" ? "is-on" : ""} aria-pressed={view === "grid"} aria-label="Картками" onClick={() => pickView("grid")}><LayoutGrid size={16} aria-hidden="true" /></button>
              </span></div>
            {(() => { const n: Record<string, number | undefined> = { all: ch.all?.posts, tips: ch.all?.tips, slips: (ch.money || []).reduce((x, m) => x + m.bets + (m.openBets ?? 0), 0), unknown: ch.all?.unknown }; return (
            <div className="v3-mxp-bar v3-tg-pfbar"><div className="v3-mxp-days" role="radiogroup" aria-label="Які пости">{([["all", "Усі"], ["tips", "Прогнози"], ["slips", "Квитки"], ["unknown", "Нерозпізнані"]] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={pf === k} className={pf === k ? "is-on" : ""} onClick={() => pickPf(k)}>{l}{n[k] ? <b>{n[k]}</b> : null}</button>)}</div></div>); })()}
            {(() => { const shown = plist ? plist.items : posts; const canMore = plist ? plist.more : !!posts && posts.length >= 30;
              const card = (p: TgPost) => view === "grid" ? (
                <li key={p.postId} className="v3-tg-pg" onClick={() => setFix({ ...p, title: ch.title })}>
                  {pf === "all" && shown && shown.indexOf(p) < freshN ? <span className="v3-tgw-pno is-new">NEW</span> : <span className="v3-tgw-pno">{(shown?.indexOf(p) ?? 0) + 1}</span>}
                  {p.photos?.length ? <><Shots urls={p.photos.slice(0, 1)} />{p.text.trim() && <MoreText text={p.text} cap />}</> : <MoreText text={p.text} />}
                  <span className="v3-tg-ph"><em className={`v3-tg-st ${KIND(p)[1]}`}>{KIND(p)[0]}</em>{RES(p) && <em className={`v3-tg-st ${RES(p)![1]}`}>{RES(p)![0]}</em>}<Marks p={p} /></span>
                  <small><b className="v3-tg-pno" title="Номер поста в каналі">№{postNo(p)}</b>{when(p.postedAt)}{p.kind === "bet" && p.odds ? ` · ${odds(p.odds)}` : ""}{READ[p.readBy || ""] ? <i className={`v3-tg-rb is-${p.readBy}`}>{READ[p.readBy!]}</i> : null}</small>
                </li>
              ) : (
                <li key={p.postId}>
                  {pf === "all" && shown && shown.indexOf(p) < freshN ? <span className="v3-tgw-pno is-new">NEW</span> : <span className="v3-tgw-pno">{(shown?.indexOf(p) ?? 0) + 1}</span>}
                  <span className="v3-tg-ph"><small><b className="v3-tg-pno" title="Номер поста в каналі">№{postNo(p)}</b>{when(p.postedAt)}{READ[p.readBy || ""] ? <i className={`v3-tg-rb is-${p.readBy}`}>{READ[p.readBy!]}</i> : null}</small><em className={`v3-tg-st ${KIND(p)[1]}`}>{KIND(p)[0]}</em>
                    {RES(p) && <em className={`v3-tg-st ${RES(p)![1]}`}>{RES(p)![0]}{p.score && !p.slip ? ` · ${p.score}` : ""}</em>}<Marks p={p} /></span>
                  {(p.text || !p.photos?.length) && <span className="v3-tg-ptx">{p.text}</span>}
                  <Shots urls={p.photos} />
                  <Legs p={p} />
                  {p.kind === "bet" ? <button type="button" className="v3-tg-pfix is-bet" onClick={() => setFix({ ...p, title: ch.title })}>→ {p.market === "Express" ? `Експрес · ${p.legs?.length || ""} події` : `${p.team1} — ${p.team2} · ${MARKET(p)}`}{p.odds ? ` · ${odds(p.odds)}` : ""}{!p.result ? " · очікує" : ""}{p.ourResult && p.score ? ` · рахунок ${p.score}` : ""}<ChevronRight size={14} aria-hidden="true" /></button>
                    : p.kind === "unknown" ? <button type="button" className="v3-tg-pfix" onClick={() => setFix({ ...p, title: ch.title })}>→ {p.reason} · розібрати<ChevronRight size={14} aria-hidden="true" /></button>
                    : <button type="button" className="v3-tg-pfix is-quiet" onClick={() => setFix({ ...p, title: ch.title })}>Змінити розбір<ChevronRight size={14} aria-hidden="true" /></button>}
                </li>
              );
              return <>
            {shown === null || (plist?.loading && !plist.items.length) ? <div className="v3-tg-posts" aria-hidden="true"><span className="v3-skel v3-skel-light" /><span className="v3-skel v3-skel-light" /></div>
              : !shown.length ? <p className="v3-tg-note">{pf === "all" ? "Постів ще немає — перший збір за кілька хвилин." : "Таких постів немає."}</p>
              : view === "grid" ? <div className="v3-tg-posts is-grid is-mason">{masonry(shown).map((col, ci) => <ul key={ci}>{col.map(card)}</ul>)}</div>
              : <ul className="v3-tg-posts">{shown.map(card)}</ul>}
            {canMore && <button type="button" className="v3-tg-rtoggle v3-tg-more2" disabled={!!plist?.loading} onClick={() => void loadPosts(pf, true)}><span>{plist?.loading ? "Завантажуємо…" : "Показати ще"}</span><ChevronDown size={16} aria-hidden="true" /></button>}
            </>; })()}
            <div className="v3-mxp-acts">
              {ch.status === "block" ? null : ch.paused
                ? <button type="button" className="is-green v3-tg-go" disabled={!online} onClick={() => void setPaused(ch, false)}><Play size={15} fill="currentColor" aria-hidden="true" />Запустити</button>
                : <button type="button" className="is-dark v3-tg-stop" disabled={!online} onClick={() => setStopAsk(ch)}><i aria-hidden="true" />Стоп</button>}
              {ch.status !== "block" && !ch.paused && <button type="button" className="is-grey v3-tg-btn-blue" disabled={!online} onClick={() => void refreshOne(ch.handle)}><RefreshCw size={15} aria-hidden="true" /> Оновити</button>}
              <a className="is-grey v3-tg-open v3-tg-btn-tg" href={ch.invite ? `https://t.me/+${ch.invite}` : `https://t.me/${ch.handle}`} target="_blank" rel="noreferrer">У Telegram<ExternalLink size={14} aria-hidden="true" /></a>
            </div>
            <button type="button" className="v3-tg-reread is-blue" disabled={!online} onClick={() => void reread(ch.handle)}><RefreshCw size={15} aria-hidden="true" />Перечитати пости каналу</button>
            <button type="button" className="v3-tg-reread is-blue" disabled={!online} onClick={() => void archive(ch.handle)}><History size={15} aria-hidden="true" />Підтягнути архів · ще ≈100 постів</button>
            <button type="button" role="switch" aria-checked={!ch.isTest} className="v3-tg-pub" disabled={!online} onClick={() => void togglePublic(ch)}>
              <span><strong>Показувати користувачам</strong><small>{ch.isTest ? "Тестовий: канал бачите лише ви" : "Канал видно в застосунку"}</small></span>
              <i className={`v3-st-sw${!ch.isTest ? " is-on" : ""}`} aria-hidden="true"><span /></i>
            </button>
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

      <Dialog open={!!day} onOpenChange={(o) => { if (!o) setDay(null); }}>
        <DialogContent className="v3-sheet v3-pay-sheet v3-tg-sheet">
          {day && data && (() => { const n = day.ch.days[day.i], d = day.ch.daysDetail?.[day.i], iso = data.days[day.i]; return <>
            <DialogTitle>{new Date(`${iso}T12:00:00Z`).toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}</DialogTitle>
            <DialogDescription>{day.ch.title || `@${day.ch.handle}`} · зібрано {n} {plural(n, "пост", "пости", "постів")}</DialogDescription>
            <div className="v3-tg-kv">
              <div><span>Прогнозів</span><b className={d?.tips ? "is-ok" : ""}>{d?.tips ?? "—"}</b></div>
              <div><span>Не розпізнано</span><b className={d?.unknown ? "is-warn" : ""}>{d?.unknown ?? "—"}</b></div>
              <div><span>Інфо</span><b>{d?.info ?? "—"}</b></div>
              <div><span>Повтори й результати</span><b>{d?.repeats ?? "—"}</b></div>
            </div>
            <div className="v3-mxp-acts"><button type="button" className="is-grey" onClick={() => setDay(null)}>Закрити</button>{n > 0 && <button type="button" className="is-green" onClick={() => { const h = day.ch.handle; setDay(null); void openCh(h); }}>Пости каналу</button>}</div>
          </>; })()}
        </DialogContent>
      </Dialog>

      <CheckSheet open={checkOpen} online={online} onClose={(changed) => { setCheckOpen(false); if (changed) void load(); }} onFix={(p) => setFix(p)} />
      <FixSheet post={fix} online={online} onClose={() => setFix(null)} onDone={() => { setFix(null); void load(); if (sel) getPosts(sel).then(setPosts).catch(() => {}); }} />
      <AddSheet open={addOpen} online={online} start={addLink} onOpenChange={(o) => { setAddOpen(o); if (!o) setAddLink(""); }} onDone={() => { setAddOpen(false); setAddLink(""); void load(); }} />
    </div>
  );
}

/** Profit by day (the channel's results and ours), by game / market, streaks, the channel's own summaries next to ours. */
function ChannelStats({ handle }: { handle: string }) {
  const [st, setSt] = useState<TgStats | null>(null);
  useEffect(() => { setSt(null); fetchTgStats(handle).then(setSt).catch(() => setSt(null)); }, [handle]);
  // a point of «Гроші каналу» tapped: the slip behind it in a sheet
  const [slipAt, setSlipAt] = useState<number | null>(null);
  const [slips, setSlips] = useState<TgSlip[] | null>(null);
  const openSlip = (id?: number) => { if (id == null) return; setSlipAt(id); if (!slips) fetchTgSlips(handle).then(setSlips).catch(() => setSlips([])); };
  const shown = slipAt == null ? null : slips?.find((x) => x.postId === slipAt) ?? null;
  // «Порівняння місяців»: this month against one the admin picks (the month before by default)
  const [cmpM, setCmpM] = useState<string | null>(null);
  if (!st || (!st.chart.length && !st.summaries.length && !st.money?.points.length)) return null;
  const pts = st.chart.length === 1 ? [{ day: st.chart[0].day, claimed: 0, ours: 0 }, ...st.chart] : st.chart;
  const W = 320, H = 120, P = 6, all = pts.flatMap((p) => [p.claimed, p.ours, 0]), lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
  const x = (i: number) => P + (i / Math.max(1, pts.length - 1)) * (W - 2 * P), y = (v: number) => P + (1 - (v - lo) / span) * (H - 2 * P);
  const line = (k: "claimed" | "ours") => pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
  const area = `${line("ours")} L${x(pts.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
  const last = pts[pts.length - 1], same = st.chart.every((p) => p.claimed === p.ours), sgn = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}`;
  const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("uk-UA", { day: "numeric", month: "short", timeZone: "UTC" });
  const rows = (title: string, list: TgStats["byGame"]) => list.length > 0 && <div className="v3-tg-wr"><span className="v3-tg-sth">{title}</span>{list.map((r) => (
    <div key={r.name} className="v3-tg-wrrow"><span className="n">{r.name}</span><span className="bar" aria-hidden="true"><i style={{ width: `${r.winrate}%` }} className={r.winrate >= 55 ? "is-ok" : r.winrate < 45 ? "is-bad" : ""} /></span><b>{r.winrate}%</b><small>{r.won}–{r.lost}{r.roi != null ? ` · ROI ${sgn(r.roi)}%` : ""}</small></div>
  ))}</div>;
  return (
    <div className="v3-tg-stats">
      {st.months && st.months.length > 0 && (() => {
        const ms = st.months, cur = ms[0], others = ms.slice(1), other = others.find((m) => m.month === cmpM) || others[0] || null;
        const cc = st.money?.currency || "", CU = CUR[cc] || cc;
        const mName = (m: string, long = false) => { const t = new Date(`${m}-15T12:00:00Z`).toLocaleDateString("uk-UA", { month: long ? "long" : "short", year: m.slice(0, 4) === cur.month.slice(0, 4) ? undefined : "numeric", timeZone: "UTC" }); return t.charAt(0).toUpperCase() + t.slice(1); };
        const useMoney = cur.money != null || (other?.money != null);
        const head = (m: typeof cur) => useMoney ? (m.money == null ? "—" : `${m.money > 0 ? "+" : m.money < 0 ? "−" : ""}${Math.abs(m.money).toLocaleString("uk-UA", { maximumFractionDigits: 2 })} ${CU}`) : m.roi == null ? "—" : `${sgn(m.roi)}%`;
        const tone2 = (m: typeof cur) => { const v = useMoney ? m.money : m.roi; return v == null ? "" : v > 0 ? "is-ok" : v < 0 ? "is-bad" : ""; };
        const sub = (m: typeof cur) => [m.won + m.lost ? `${m.won}–${m.lost}` : "прогнозів немає", useMoney ? (m.roi != null ? `ROI ${sgn(m.roi)}%` : "") : m.winrate != null ? `вінрейт ${m.winrate}%` : ""].filter(Boolean).join(" · ");
        const tile = (m: typeof cur, label: string) => <div className={`v3-tg-mct ${tone2(m)}`}><small>{label}</small><b>{head(m)}</b><em>{sub(m)}</em></div>;
        const dv = !other ? null : useMoney ? (cur.money != null && other.money != null ? Math.round((cur.money - other.money) * 100) / 100 : null) : cur.roi != null && other.roi != null ? cur.roi - other.roi : null;
        return (
          <div className="v3-tg-mcmp">
            <span className="v3-tg-sth">Порівняння місяців</span>
            <div className="v3-tg-mcmp2">{tile(cur, `${mName(cur.month, true)} · зараз`)}{other ? tile(other, mName(other.month, true)) : <div className="v3-tg-mct is-none"><small>Інший місяць</small><em>Даних за попередні місяці ще немає</em></div>}</div>
            {other && dv != null && <p className={`v3-tg-mcmpd ${dv > 0 ? "is-ok" : dv < 0 ? "is-bad" : ""}`}>{dv === 0 ? `Як у ${mName(other.month, true).toLowerCase()}` : `${mName(cur.month, true)} ${dv > 0 ? "краще" : "гірше"} на ${useMoney ? `${Math.abs(dv).toLocaleString("uk-UA", { maximumFractionDigits: 2 })} ${CU}` : `${Math.abs(dv)} п.п. ROI`}`}</p>}
            {others.length > 1 && <div className="v3-tg-mchips" role="group" aria-label="Порівняти з місяцем">{others.map((m) => <button key={m.month} type="button" className={other?.month === m.month ? "is-on" : ""} aria-pressed={other?.month === m.month} onClick={() => setCmpM(m.month)}>{mName(m.month)}</button>)}</div>}
          </div>
        );
      })()}
      <div className="v3-tg-side">
      {(st.streaks.best > 0 || st.streaks.worst < 0) && <div className="v3-tg-streaks">
        <div><small>Найдовша виграшна</small><b className="is-ok">{st.streaks.best}</b></div>
        <div><small>Найдовша програшна</small><b className="is-bad">{Math.abs(st.streaks.worst)}</b></div>
      </div>}
      {st.chase && (() => { const c = st.chase, cur = st.money?.currency || "", f = (v: number) => `${v.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ${CUR[cur] || cur}`; return (
        <div className={`v3-tg-chase${c.chasing ? " is-bad" : ""}`}><span><small>Відіграш після програшу</small><b>{c.chasing ? `Так, ставка +${c.rise}%` : c.rise > 0 ? `Ні, +${c.rise}%` : `Ні, ${c.rise}%`}</b></span>
          <em>Після програшу в середньому {f(c.afterLoss)} ({c.nLoss}), після виграшу {f(c.afterWin)} ({c.nWin})</em></div>
      ); })()}
      </div>
      {st.chart.length > 0 && <div className="v3-tg-chartbox">
        <div className="v3-tg-chh"><span><small>Окупність каналу</small>{(() => { const n = st.byGame.reduce((x, g) => x + g.won + g.lost, 0), roi = n ? Math.round(last.ours / n) : 0; return <><b className={roi >= 0 ? "is-ok" : "is-bad"}>{sgn(roi)}%</b><em>{roi >= 0 ? `Хто ставив за каналом, заробив ${roi} з кожних 100` : `Хто ставив за каналом, втратив ${-roi} з кожних 100`}</em></>; })()}</span>
          <span className="v3-tg-legend">{!same && <i className="claimed">За каналом {sgn(last.claimed)}</i>}<i className="ours">{same ? "Канал і наш рахунок збігаються" : "За нашим рахунком"}</i></span></div>
        <svg viewBox={`0 0 ${W} ${H}`} className="v3-tg-chart" role="img" aria-label={`Прибуток за нашим рахунком ${sgn(last.ours)}${same ? "" : `, за каналом ${sgn(last.claimed)}`}`}>
          <defs><linearGradient id="v3tgfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2f7bff" stopOpacity=".22" /><stop offset="1" stopColor="#2f7bff" stopOpacity="0" /></linearGradient></defs>
          <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} className="zero" />
          <path d={area} fill="url(#v3tgfill)" />
          {!same && <path d={line("claimed")} className="claimed" />}
          <path d={line("ours")} className="ours" />
          <circle cx={x(pts.length - 1)} cy={y(last.ours)} r="4" className="dot" />
        </svg>
        <div className="v3-tg-chx"><span>{day(st.chart[0].day)}</span><span>{day(st.chart[st.chart.length - 1].day)}</span></div>
      </div>}
      {st.money && st.money.points.length > 0 && (() => { const mp: { at: string; balance: number; postId?: number }[] = [{ at: "", balance: 0 }, ...st.money.points], cur = st.money.currency, vals = mp.map((p) => p.balance), mlo = Math.min(0, ...vals), mhi = Math.max(0, ...vals), ms = mhi - mlo || 1;
        const mx = (i: number) => P + (i / Math.max(1, mp.length - 1)) * (W - 2 * P), my = (v: number) => P + (1 - (v - mlo) / ms) * (H - 2 * P), lastB = vals[vals.length - 1];
        const ml = mp.map((p, i) => `${i ? "L" : "M"}${mx(i).toFixed(1)},${my(p.balance).toFixed(1)}`).join(" ");
        return <div className="v3-tg-chartbox">
          <div className="v3-tg-chh"><span><small>Гроші каналу, квиток за квитком</small><b className={lastB >= 0 ? "is-ok" : "is-bad"}>{cash(lastB, cur)}</b><em>{st.money.points.length} {plural(st.money.points.length, "розрахований квиток", "розраховані квитки", "розрахованих квитків")}</em></span></div>
          <svg viewBox={`0 0 ${W} ${H}`} className="v3-tg-chart is-money" role="img" aria-label={`Баланс каналу ${cash(lastB, cur)}`}>
            <line x1={P} x2={W - P} y1={my(0)} y2={my(0)} className="zero" />
            <path d={ml} className="ours" />
            {mp.map((p, i) => i > 0 && <g key={i} className="v3-tg-pt" role="button" tabIndex={0} aria-label={`Квиток ${when(p.at)}`} onClick={() => openSlip(p.postId)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openSlip(p.postId); } }}><circle cx={mx(i)} cy={my(p.balance)} r="13" className="hit" /><circle cx={mx(i)} cy={my(p.balance)} r="3" className={p.balance >= mp[i - 1].balance ? "up" : "down"} /></g>)}
          </svg>
          <div className="v3-tg-chx"><span>{when(st.money.points[0].at)}</span><span>{when(st.money.points[st.money.points.length - 1].at)}</span></div>
        </div>; })()}
      {rows("Вінрейт за грою", st.byGame)}
      {rows("Вінрейт за ставкою", st.byMarket)}
      {st.summaries.length > 0 && <div className="v3-tg-claims"><span className="v3-tg-sth">Підсумки каналу і наші дані</span>
        {st.summaries.map((s) => <p key={s.at}>{when(s.at)}{s.period ? ` · ${s.period}` : ""}: канал <b>{s.claimed.won ?? "?"}/{s.claimed.total ?? "?"}</b> · у нас <b className={s.claimed.won != null && s.ours.total && s.claimed.won > s.ours.won ? "is-bad" : ""}>{s.ours.won}/{s.ours.total}</b></p>)}
      </div>}
      <Dialog open={slipAt != null} onOpenChange={(o) => { if (!o) setSlipAt(null); }}>
        <DialogContent className="v3-sheet v3-pay-sheet v3-tg-sheet">
          <DialogTitle>Квиток</DialogTitle>
          <DialogDescription>Ставка з графіка «Гроші каналу»</DialogDescription>
          {!slips ? <p className="v3-tg-note">Завантажуємо…</p> : !shown ? <p className="v3-tg-note">Цього квитка вже немає в списку.</p> : <ul className="v3-tg-slips"><SlipItem x={shown} /></ul>}
          <div className="v3-mxp-acts"><button type="button" className="is-grey" onClick={() => setSlipAt(null)}>Закрити</button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** The slip's own odds: (possible) payout ÷ stake — null when it does not show both, or was sold / returned. */
const slipOdds = (p: TgPost) => (p.stake && p.payout && p.payout > p.stake && p.slip !== "cashout" && p.slip !== "void" ? Math.round((p.payout / p.stake) * 100) / 100 : null);

const KINDS = [["bet", "Прогноз"], ["info", "Інфо"], ["void", "Повернення"], ["repeat", "Повтор"], ["poll", "Опитування"], ["summary", "Підсумок"]] as const;

/** «Розібрати пост»: the match, the market, the odds — or «Не прогноз». */
function FixSheet({ post, online, onClose, onDone, inline }: { post: TgPost | null; online: boolean; onClose: () => void; onDone: () => void; inline?: boolean }) {
  const [match, setMatch] = useState<TgMatch | null>(null);
  const [pickM, setPickM] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<TgMatch[] | null>(null);
  const [mk, setMk] = useState<"p1" | "p2" | "map" | "total" | "hcp">("p1");
  type Kind = "bet" | "info" | "repeat" | "poll" | "summary" | "void";
  const [kind, setKind] = useState<Kind>("bet");
  const [res, setRes] = useState<"auto" | "pending" | "Win" | "Loss" | "Void">("auto");
  const [side, setSide] = useState<1 | 2>(1);
  const [mapN, setMapN] = useState(1);
  // a bet on one map: its winner, a rounds handicap, a rounds total
  const [mapK, setMapK] = useState<"win" | "hcp" | "total">("win");
  const [plus, setPlus] = useState(false);
  const [line, setLine] = useState("2.5");
  const [over, setOver] = useState(true);
  const [kf, setKf] = useState("");
  const [remember, setRemember] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!post) return;
    setMatch(post.matchId && post.team1 && post.team2 ? { id: post.matchId, game: (post.game as TgMatch["game"]) || "cs2", team1: post.team1, team2: post.team2, start: "" } : null);
    setPickM(!post.matchId); setQ(""); setLine("2.5"); setOver(true); setRemember(false);
    // the odds: the slip's own (payout ÷ stake) when it shows both, else what was read
    const so = slipOdds(post);
    setKf(so && !post.fixedBy ? String(so) : post.odds ? String(post.odds) : so ? String(so) : "");
    // start from what the reader saw: «Map 2 Winner», «Handicap +1.5», «Total Maps Over 2.5», the side by the pick
    const sd: 1 | 2 = post.pick && post.team2 && post.pick === post.team2 ? 2 : 1, mkt = post.market || "";
    setSide(sd); setMapN(1); setPlus(false); setMapK("win");
    setKind(post.kind === "bet" || post.kind === "unknown" ? "bet" : post.reason === "Повтор" || post.reason === "Результат" ? "repeat" : post.reason === "Опитування" ? "poll" : post.reason === "Підсумок" ? "summary" : post.reason === "Повернення" ? "void" : "info");
    setRes(post.settledBy === "admin" && post.result ? post.result : "auto");
    const mm = /^Map (\d) Winner$/.exec(mkt), hh = /^Handicap ([+-])([\d.]+)$/.exec(mkt), tt = /^Total Maps (Over|Under) ([\d.]+)$/.exec(mkt);
    const mh = /^Map (\d) Handicap ([+-])([\d.]+)$/.exec(mkt), mt = /^Map (\d) Total (Over|Under) ([\d.]+)$/.exec(mkt);
    if (mh) { setMk("map"); setMapK("hcp"); setMapN(Number(mh[1])); setPlus(mh[2] === "+"); setLine(mh[3]); return; }
    if (mt) { setMk("map"); setMapK("total"); setMapN(Number(mt[1])); setOver(mt[2] === "Over"); setLine(mt[3]); return; }
    const ai = /Карта (\d)/.exec(post.ocr || ""), aiH = /Фора .*?([+\-−])(\d+[.,]5)/.exec(post.ocr || "");
    if (mm || (!mkt && ai)) { setMk("map"); setMapN(Number((mm || ai)![1])); }
    else if (hh || (!mkt && aiH)) { setMk("hcp"); setPlus((hh ? hh[1] : aiH![1]) === "+"); setLine((hh ? hh[2] : aiH![2]).replace(",", ".")); }
    else if (tt) { setMk("total"); setOver(tt[1] === "Over"); setLine(tt[2]); }
    else setMk(sd === 2 ? "p2" : "p1");
  }, [post]);
  useEffect(() => { if (!post || !pickM) return; const id = setTimeout(() => { fetchTgMatches(q).then(setFound).catch(() => setFound([])); }, 250); return () => clearTimeout(id); }, [q, pickM, post]);
  const mark = useCallback((text: string) => {
    const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const names = [match?.team1, match?.team2].filter(Boolean).map((n) => esc(String(n).split(/\s+/).pop() || ""));
    const re = new RegExp(`(${[...names.filter(Boolean), "\\d{1,2}[.,]\\d{1,3}"].join("|")})`, "ig");
    return text.split(re).map((x, i) => (i % 2 ? <mark key={i} className={/^\d/.test(x) ? "is-odds" : undefined}>{x}</mark> : x));
  }, [match]);
  const resolve = async (who: "channel" | "ours") => {
    if (!post) return;
    setSaving(true);
    try { await resolveTgPost(post.handle, post.postId, who); toast.success(who === "ours" ? "Записано результат за нашим рахунком" : "Записано результат каналу"); onDone(); }
    catch (e) { toast.error("Не вдалося", { description: (e as Error).message }); }
    finally { setSaving(false); }
  };
  const reread = async () => {
    if (!post) return;
    setSaving(true);
    try { await rereadTgPost(post.handle, post.postId); toast.success("Пост перечитано", { description: "Ручне розбирання цього поста скинуто" }); onDone(); }
    catch (e) { toast.error("Не вдалося перечитати", { description: (e as Error).message }); }
    finally { setSaving(false); }
  };
  const save = async (to: "bet" | "other") => {
    if (!post) return;
    setSaving(true);
    try {
      if (to === "other") await fixTgPost(post.handle, post.postId, { kind: "other", reason: kind === "repeat" ? "Повтор" : kind === "poll" ? "Опитування" : kind === "summary" ? "Підсумок" : kind === "void" ? "Повернення" : null });
      else {
        if (!match) { toast.error("Оберіть матч"); setSaving(false); return; }
        const o = kf.trim() ? Number(kf.replace(",", ".")) : null;
        const ln = Math.abs(Number(line.replace(",", ".")) || 1.5);
        await fixTgPost(post.handle, post.postId, mk === "total" ? { kind: "bet", matchId: match.id, market: "Total", line: Number(line.replace(",", ".")) || 2.5, over, odds: o, result: res }
          : mk === "hcp" ? { kind: "bet", matchId: match.id, market: "Handicap", side, line: plus ? ln : -ln, odds: o, result: res }
          : mk === "map" && mapK === "hcp" ? { kind: "bet", matchId: match.id, market: "MapHandicap", side, map: mapN, line: plus ? ln : -ln, odds: o, result: res }
          : mk === "map" && mapK === "total" ? { kind: "bet", matchId: match.id, market: "MapTotal", map: mapN, line: ln, over, odds: o, result: res }
          : mk === "map" ? { kind: "bet", matchId: match.id, market: "Map", side, map: mapN, odds: o, result: res }
          : { kind: "bet", matchId: match.id, market: "Match Winner", side: mk === "p2" ? 2 : 1, odds: o, remember, result: res });
      }
      toast.success(to === "other" ? `Позначено: ${KINDS.find((k) => k[0] === kind)?.[1] || "інфо"}` : "Прогноз збережено", { description: kind === "bet" && match ? `${match.team1} — ${match.team2}` : undefined });
      onDone();
    } catch (e) { toast.error("Не вдалося зберегти", { description: (e as Error).message }); }
    finally { setSaving(false); }
  };
  const opt = (k: typeof mk, label: string, sub?: string) => <button key={k} type="button" role="radio" aria-checked={mk === k} className={`v3-tg-ropt${mk === k ? " is-on" : ""}`} onClick={() => setMk(k)}><i aria-hidden="true" /><span>{label}</span>{sub && <small>{sub}</small>}</button>;
  const Title = inline ? ((p: { children: ReactNode }) => <h2 className="v3-tgw-fixt">{p.children}</h2>) : DialogTitle;
  const Desc = inline ? ((p: { children: ReactNode }) => <p className="v3-tgw-fixd">{p.children}</p>) : DialogDescription;
  const body = post && <>
          <Title>Розібрати пост</Title>
          <Desc>{post.title || `@${post.handle}`} · {when(post.postedAt)}{post.bookmaker ? ` · ${post.bookmaker}` : ""}{inline ? ` · №${postNo(post)}` : ""}</Desc>
          {post.doubt && <p className="v3-tg-doubt"><b>Сумнівно.</b> {post.doubt}. Перевірте й збережіть — або «Перечитати цей пост».</p>}
          <Shots urls={post.photos} big />
          {post.text && <div className="v3-tg-ftx">{mark(post.text)}</div>}
          {post.ocr && <details className="v3-tg-ocr"><summary>Прочитано зі скріну</summary><div>{mark(post.ocr)}</div></details>}
          {post.reason && <p className="v3-tg-warn">{post.reason}</p>}
          {post.mismatch && <div className="v3-tg-mm">
            <p>Канал: <b>{post.result === "Win" ? "виграш" : "програш"}</b> · за нашим рахунком{post.score ? ` ${post.score}` : ""}: <b>{post.ourResult === "Win" ? "виграш" : "програш"}</b></p>
            <div className="v3-mxp-acts"><button type="button" className="is-grey" disabled={!online || saving} onClick={() => void resolve("channel")}>Канал правий</button><button type="button" className="is-green" disabled={!online || saving} onClick={() => void resolve("ours")}>Ми праві</button></div>
          </div>}
          <span className="v3-tg-fl">Що це за пост</span>
          <div className="v3-tg-kinds" role="radiogroup" aria-label="Тип поста">{KINDS.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? "is-on" : ""} onClick={() => setKind(k)}>{l}</button>)}</div>
          {kind === "void" && <small className="v3-tg-note">Ставку повернули: у гроші й вінрейт не йде. Повернення ставки на матч із нашого списку — «Прогноз» і результат «Повернення».</small>}
          {kind === "bet" && <>
          <span className="v3-tg-fl">Матч</span>
          {!pickM && match ? <button type="button" className="v3-tg-mbox" onClick={() => setPickM(true)}><span>{match.team1} — {match.team2}</span><b>Змінити</b></button> : <>
            <label className="v3-tg-msearch"><Search size={16} aria-hidden="true" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Команда" aria-label="Пошук матчу" />{q && <button type="button" aria-label="Очистити" onClick={() => setQ("")}><X size={14} /></button>}</label>
            <div className="v3-tg-mlist">{(found || []).slice(0, 6).map((m) => <button key={m.id} type="button" className={match?.id === m.id ? "is-on" : ""} onClick={() => { setMatch(m); setPickM(false); }}><span>{m.team1} — {m.team2}</span><small>{m.game === "cs2" ? "CS2" : "Dota 2"} · {m.status === "live" ? "наживо" : m.status === "finished" ? `завершено · ${when(m.start)}` : when(m.start)}</small></button>)}{found && !found.length && <small className="v3-tg-note">Нічого не знайдено</small>}</div>
          </>}
          <span className="v3-tg-fl">Ставка</span>
          <div className="v3-tg-ropts" role="radiogroup" aria-label="Ставка">
            {opt("p1", `Перемога ${match?.team1 || "команди 1"}`, "П1")}
            {opt("p2", `Перемога ${match?.team2 || "команди 2"}`, "П2")}
            <div className="v3-tg-ropts3">{opt("map", "Карта")}{opt("total", "Тотал карт")}{opt("hcp", "Фора")}</div>
          </div>
          {mk === "map" && <div className="v3-tg-seg3 v3-tg-mapk" role="radiogroup" aria-label="Ставка на карту">{([["win", "Переможець"], ["hcp", "Фора раундів"], ["total", "Тотал раундів"]] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={mapK === k} className={mapK === k ? "is-on" : ""} onClick={() => { setMapK(k); if (k === "hcp" && Number(line) < 3) setLine("4.5"); if (k === "total" && Number(line) < 10) setLine("26.5"); }}>{l}</button>)}</div>}
          {(mk === "hcp" || (mk === "map" && mapK !== "total")) && <div className="v3-tg-seg2 v3-tg-sideseg" role="group" aria-label="На кого">{([1, 2] as const).map((v) => <button key={v} type="button" className={side === v ? "is-on" : ""} onClick={() => setSide(v)}>{(v === 1 ? match?.team1 : match?.team2) || `Команда ${v}`}</button>)}</div>}
          {mk === "map" && <div className="v3-tg-fline"><span className="v3-tg-fsub">Карта №</span><div className="v3-tg-seg3 is-5">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className={mapN === n ? "is-on" : ""} onClick={() => setMapN(n)}>{n}</button>)}</div></div>}
          {(mk === "total" || mk === "hcp" || (mk === "map" && mapK !== "win")) && <div className="v3-tg-fline">
            {(mk === "total" || (mk === "map" && mapK === "total")) && <div className="v3-tg-seg2">{([[true, "Більше"], [false, "Менше"]] as const).map(([v, l]) => <button key={l} type="button" className={over === v ? "is-on" : ""} onClick={() => setOver(v)}>{l}</button>)}</div>}
            {(mk === "hcp" || (mk === "map" && mapK === "hcp")) && <div className="v3-tg-seg2">{([[false, "−"], [true, "+"]] as const).map(([v, l]) => <button key={l} type="button" className={plus === v ? "is-on" : ""} aria-label={v ? "Плюсова фора" : "Мінусова фора"} onClick={() => setPlus(v)}>{l}</button>)}</div>}
            <label><span>Лінія</span><input inputMode="decimal" value={line} onChange={(e) => setLine(e.target.value)} /></label>
          </div>}
          <label className="v3-tg-fodds"><span className="v3-tg-fl">Кофіцієнт</span><input inputMode="decimal" value={kf} onChange={(e) => setKf(e.target.value)} placeholder="Напр. 1.85" /></label>
          {(() => { const so = slipOdds(post), v = Number(kf.replace(",", ".")); return so && (!v || Math.abs(v - so) > 0.05) ? <p className="v3-tg-kfwarn">На квитку кф <b>{odds(so)}</b> (виплата {post.payout} ÷ ставка {post.stake}){v ? " — введений відрізняється" : ""}<button type="button" onClick={() => setKf(String(so))}>Взяти {odds(so)}</button></p> : null; })()}
          {(mk === "p1" || mk === "p2") && <label className="v3-tg-rem"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /><i aria-hidden="true"><Check size={13} strokeWidth={3} /></i>Запам’ятати для каналу: кофіцієнт без команди — ставка на {mk === "p2" ? "другу" : "першу"}</label>}
          <span className="v3-tg-fl">Результат</span>
          <div className="v3-tg-seg3 is-5 v3-tg-resseg" role="radiogroup" aria-label="Результат">{([["auto", "Авто"], ["pending", "Очікує"], ["Win", "Виграш"], ["Loss", "Програш"], ["Void", "Повернення"]] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={res === k} className={`${res === k ? "is-on" : ""} is-${k}`} onClick={() => setRes(k)}>{l}</button>)}</div>
          <small className="v3-tg-note">«Авто» — з квитка, потім наша перевірка за рахунком. «Очікує» — закриє наша перевірка.</small>
          </>}
          {post.handle && <button type="button" className="v3-tg-reread" disabled={!online || saving} onClick={() => void reread()}><RefreshCw size={16} aria-hidden="true" />Перечитати цей пост</button>}
          <div className="v3-mxp-acts">
            <button type="button" className="is-grey" onClick={onClose}>Скасувати</button>
            <button type="button" className="is-green" disabled={!online || saving || (kind === "bet" && !match)} onClick={() => void save(kind === "bet" ? "bet" : "other")}>{saving ? "Зберігаємо…" : kind === "bet" ? "Зберегти прогноз" : "Зберегти"}</button>
          </div>
        </>;
  if (inline) return <aside key={post ? `${post.handle}/${post.postId}` : "none"} className="v3-adw-card v3-tg-sheet v3-tg-fix v3-tgw-fix">{body}</aside>;
  return (
    <Dialog open={!!post} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="v3-sheet v3-pay-sheet v3-tg-sheet v3-tg-fix">
        {body}
      </DialogContent>
    </Dialog>
  );
}

/** «Додати канал»: a public link → what we see there → start reading (a test channel is hidden from users). */
function AddSheet({ open, online, start = "", onOpenChange, onDone }: { open: boolean; online: boolean; start?: string; onOpenChange: (o: boolean) => void; onDone: (handle: string) => void }) {
  const [link, setLink] = useState("");
  const [pv, setPv] = useState<TgPreview | null>(null);
  const [checking, setChecking] = useState(false);
  const [game, setGame] = useState<"cs2" | "dota2" | "both">("both");
  const [test, setTest] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setLink(start); setPv(null); setGame("both"); setTest(true); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const v = link.trim();
    if (v.length < 5) { setPv(null); return; }
    const id = setTimeout(() => { setChecking(true); previewTgChannel(v).then(setPv).catch((e) => setPv({ ok: false, error: (e as Error).message })).finally(() => setChecking(false)); }, 600);
    return () => clearTimeout(id);
  }, [link]);
  const add = async () => {
    if (!pv?.ok) return;
    setSaving(true);
    try { const r = await addTgChannel(link.trim(), game, test); toast.success(`${pv.title || `@${pv.handle}`} додано`, { description: "Збираємо пости — прогрес на картці каналу" }); onDone(r.handle); }
    catch (e) { toast.error("Не вдалося додати", { description: (e as Error).message }); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="v3-sheet v3-pay-sheet v3-tg-sheet">
        <DialogTitle>Додати канал</DialogTitle>
        <DialogDescription>Для тесту збору й розпізнавання</DialogDescription>
        <label className="v3-tg-fodds"><span className="v3-tg-fl">Посилання на канал</span><input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://t.me/… або @нікнейм" /><small>Приватні t.me/+… — через акаунт Telegram (ключі TG_* на сервері)</small></label>
        {checking && <p className="v3-tg-note">Перевіряємо…</p>}
        {pv && !checking && (pv.ok ? (
          <div className="v3-tg-pv">
            <span className="v3-tg-ch"><span className="v3-tg-av"><TgAvatar handle={pv.handle} name={pv.title || pv.handle} color={colorOf(pv.handle)} /></span><span className="v3-tg-chn"><strong>{pv.title || `@${pv.handle}`}</strong><small>{pv.subscribers ? `${pv.subscribers.toLocaleString("uk-UA")} підписників · ` : ""}{pv.private ? "приватний" : "публічний"}</small></span><em className={`v3-tg-st ${pv.exists ? "is-warn" : "is-ok"}`}>{pv.exists ? "Уже є" : "Знайдено"}</em></span>
            {pv.private ? <span className="v3-tg-line">Приватний канал: наш акаунт Telegram {pv.joined ? "вже в ньому" : "вступить за запрошенням"}, пости прочитаємо після додавання.</span>
              : <span className="v3-tg-line">Останні {pv.posts} {plural(pv.posts, "пост", "пости", "постів")}: <b>{pv.tipLike} схожі на прогнози</b>, з них ми б розпізнали {pv.recognized}.</span>}
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
