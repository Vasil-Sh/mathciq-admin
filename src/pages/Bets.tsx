import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUp, BarChart3, Check, ChevronDown, Clock, Dices, RefreshCw, Search, Send, WifiOff } from "lucide-react";
import { toast } from "sonner";
import UserAvatar from "@/components/UserAvatar";
import { fetchUserBets, fetchUsersOverview } from "@/lib/adminBetsApi";
import { downloadCsv } from "@/lib/csv";
import { plural } from "@/lib/dashboardInsights";
import { betView, gameLabel, isUsd, usdStatsFor, money, signedMoney, signedPct, statsFor, userGames, type Sort, type Stats } from "@/lib/betsModel";
import { useMedia, useOnline } from "@/hooks/useMediaOnline";
import type { AdminUserBet, AdminUserOverview } from "@/types";
import PillTrack from "@/components/PillTrack";
import RollingNumber from "@/components/RollingNumber";
import ExportCsvButton from "@/components/ExportCsvButton";
import { Dropdown } from "@/components/ui/dropdown";
import AllBetsDialog, { legMark } from "@/components/bets/AllBetsDialog";
import { openTelegram } from "@/lib/telegram";
import { usePageSearch, isPhoneWidth } from "@/lib/pageSearch";

const isAdminU = (u: AdminUserOverview) => u.role === "admin" || u.role === "owner" || !!u.isOwner;
const hhmm = () => new Date().toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
const SORTS: [Sort, string][] = [["bets", "Ставки"], ["staked", "Сума"], ["profit", "Профіт"], ["wr", "Вінрейт"]];
const PAGE = 20;
const SORT_M: Record<Sort, string> = { bets: "за кількістю ставок", staked: "за сумою ставок", profit: "за профітом", wr: "за вінрейтом" };

/** The matched part of a login in yellow (catalog · Inputs · search highlight, as in Users). */
function hl(text: string, q: string): ReactNode {
  const s = q.trim().toLowerCase().replace(/^@/, "");
  const i = s ? text.toLowerCase().indexOf(s) : -1;
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark className="v3-hl">{text.slice(i, i + s.length)}</mark>{text.slice(i + s.length)}</>;
}
const STREAK_ALERT = 5;

type Detail = { status: "loading" | "ok" | "err"; bets: AdminUserBet[]; error?: string };

export default function Bets() {
  const wide = useMedia("(min-width: 1180px)");
  const phone = useMedia("(max-width: 767px)");
  const xwide = useMedia("(min-width: 1600px)");
  const online = useOnline();
  const [params] = useSearchParams();
  const [users, setUsers] = useState<AdminUserOverview[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");
  const [q, setQ] = useState(params.get("q") || "");
  // Phone: the 🔍 in the header searches the list (design BetsMobileSearch)
  const pageSearch = usePageSearch("Логін або Telegram");
  const initQ = useRef(q);
  useEffect(() => { if (isPhoneWidth() && initQ.current) { pageSearch.setQ(initQ.current); pageSearch.setOpen(true); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isPhoneWidth()) return;
    if (initQ.current && pageSearch.q !== initQ.current) return; // wait until the ?q= value reaches the header
    initQ.current = "";
    setQ(pageSearch.q); setLimit(PAGE);
  }, [pageSearch.q]); // eslint-disable-line react-hooks/exhaustive-deps
  const [game, setGame] = useState("all");
  const [sort, setSort] = useState<Sort>("bets");
  const [showAll, setShowAll] = useState(false);
  // Phone «Лише ті, хто грає»: the extra rows fade out while the page scrolls up, then the list shrinks
  const [leaving, setLeaving] = useState(false);
  const mrowsRef = useRef<HTMLDivElement>(null);
  const toggleAll = () => {
    if (!showAll || wide || leaving) { setShowAll(!showAll); return; }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const top = (mrowsRef.current?.getBoundingClientRect().top ?? 0) + window.scrollY - 140;
    setLeaving(true);
    window.scrollTo({ top: Math.max(0, top), behavior: reduce ? "auto" : "smooth" });
    window.setTimeout(() => { setShowAll(false); setLeaving(false); }, reduce ? 0 : 320);
  };
  const [limit, setLimit] = useState(PAGE);
  const [openId, setOpenId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, Detail>>({});
  const [allFor, setAllFor] = useState<AdminUserOverview | null>(null);
  const [allOpen, setAllOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [rk, setRk] = useState(0);
  const [wr, setWr] = useState<"idle" | "fly" | "done">("idle");
  const [offTry, setOffTry] = useState(0);
  const [offBusy, setOffBusy] = useState(false);
  const firstOpen = useRef(true);

  const load = useCallback(async (manual = false) => {
    setBusy(true);
    const before = users ? users.reduce((a, u) => a + (u.betCount || 0), 0) : null;
    try {
      const list = await fetchUsersOverview();
      setUsers(list); setError(""); setUpdatedAt(hhmm()); setDetails({});
      if (manual) {
        const after = list.reduce((a, u) => a + (u.betCount || 0), 0);
        const diff = before === null ? 0 : after - before;
        toast.success("Дані оновлено", { id: "data-refreshed", description: diff > 0 ? `Нових ставок: ${diff}` : "Нових ставок немає" });
        setDone(true); window.setTimeout(() => setDone(false), 1400);
      }
    } catch (e) {
      const msg = (e as Error).message || "Сервер не відповідає";
      setError(msg);
      if (manual || users) toast.error("Не вдалося завантажити ставки", { description: navigator.onLine ? "Сервер не відповідає" : "Немає з’єднання", action: { label: "Повторити", onClick: () => load(true) } });
    } finally { setBusy(false); }
  }, [users]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const qq = params.get("q"); if (qq !== null) setQ(qq); }, [params]);

  const people = useMemo(() => users || [], [users]);
  const playing = useMemo(() => people.filter((u) => u.betCount > 0), [people]);
  const gameCounts = useMemo(() => {
    const m = new Map<string, number>();
    playing.forEach((u) => userGames(u).forEach((g) => m.set(g, (m.get(g) || 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [playing]);
  /** Dollar figures are kept per user for all games together — shown only on «Усі». */
  /** $ figures for the selected game tab (null if the user has no $ bets there). The $ bank is overall, like the ₴ one. */
  const usdS = (u: AdminUserOverview) => usdStatsFor(u, game);
  const usdBank = (u: AdminUserOverview) => (u.usdBets || 0) > 0;
  const usd = (n: number | undefined) => signedMoney(n || 0, "USD");
  // Top KPI is for all games (like the ₴ total next to it)
  const totUsd = useMemo(() => { const x = playing.reduce((a, u) => ({ n: a.n + (u.usdBets || 0), s: a.s + (u.usdStaked || 0), p: a.p + (u.usdProfit || 0) }), { n: 0, s: 0, p: 0 }); return x.n ? { ...x, roi: x.s ? (x.p / x.s) * 100 : 0 } : null; }, [playing]);
  const tot = useMemo(() => playing.reduce((a, u) => ({ bets: a.bets + u.betCount, wins: a.wins + u.wins, losses: a.losses + u.losses, pending: a.pending + u.pending, staked: a.staked + u.totalStaked, profit: a.profit + u.totalProfit }), { bets: 0, wins: 0, losses: 0, pending: 0, staked: 0, profit: 0 }), [playing]);
  const roi = tot.staked ? (tot.profit / tot.staked) * 100 : 0;

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase().replace(/^@/, "");
    return (showAll ? people : playing)
      .filter((u) => game === "all" || userGames(u).includes(game) || (showAll && u.betCount === 0))
      .filter((u) => !term || u.username.toLowerCase().includes(term) || (u.telegram || "").toLowerCase().replace(/^@|https?:\/\/t\.me\//g, "").includes(term))
      .map((u) => ({ u, s: statsFor(u, game) }))
      .sort((a, b) => (sort === "bets" ? b.s.bets - a.s.bets : sort === "staked" ? b.s.staked - a.s.staked : sort === "profit" ? b.s.profit - a.s.profit : b.s.wr - a.s.wr) || a.u.username.localeCompare(b.u.username));
  }, [people, playing, showAll, game, q, sort]);

  useEffect(() => { setRk((x) => x + 1); }, [game, sort, showAll]);

  // Desktop opens the first player's bets, like the design; later the admin decides.
  useEffect(() => {
    if (!wide || !firstOpen.current || !rows.length) return;
    firstOpen.current = false; toggle(rows[0].u);
  }, [rows, wide]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadDetail(u: AdminUserOverview) {
    if (u.betCount === 0) { setDetails((d) => ({ ...d, [u.id]: { status: "ok", bets: [] } })); return; }
    setDetails((d) => ({ ...d, [u.id]: { status: "loading", bets: d[u.id]?.bets || [] } }));
    try { const bets = await fetchUserBets(u.id); setDetails((d) => ({ ...d, [u.id]: { status: "ok", bets } })); }
    catch (e) { setDetails((d) => ({ ...d, [u.id]: { status: "err", bets: [], error: (e as Error).message } })); }
  }
  // Phone list: a closing card keeps its body while it folds (grid rows 1fr → 0fr), then unmounts
  const [closingId, setClosingId] = useState<number | null>(null);
  const fold = (id: number) => {
    if (wide || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setClosingId(id); window.setTimeout(() => setClosingId((c) => (c === id ? null : c)), 300);
  };
  function toggle(u: AdminUserOverview) {
    if (openId === u.id) { fold(u.id); setOpenId(null); return; }
    if (openId !== null) fold(openId);
    setOpenId(u.id);
    const d = details[u.id];
    if (!d || d.status === "err") { if (online) loadDetail(u); else setDetails((x) => ({ ...x, [u.id]: { status: "err", bets: [], error: "offline" } })); }
  }
  const resetFilters = () => { setQ(""); setGame("all"); };
  function exportTable() {
    const file = "bets-users.csv";
    downloadCsv(file, ["Логін", "Telegram", "Ігри", "Ставок", "Виграші", "Програші", "Очікує", "Сума ставок", "Профіт", "ROI %", "Вінрейт %", "Банк зараз", "Серія програшів"],
      rows.map(({ u, s }) => [u.username, u.telegram || "", userGames(u).join(", "), s.bets, s.wins, s.losses, s.pending, Math.round(s.staked), Math.round(s.profit), s.roi.toFixed(1), Math.round(s.wr), Math.round(u.currentBank), u.lossStreak || 0]));
    toast.success("Файл готовий", { description: `${file} · ${rows.length} ${plural(rows.length, "рядок", "рядки", "рядків")}` });
  }

  const openAll = (u: AdminUserOverview) => { setAllFor(u); setAllOpen(true); };

  const loading = users === null && !error;
  const noBetsAtAll = users !== null && playing.length === 0;

  // «Зміна до минулого місяця» on the totals (catalog · Metrics 06). /admin/users has only all-time sums,
  // so this month vs last month comes from the players' bets (loaded in the background, the same lists the rows open).
  const MAX_FOR_DELTAS = 60;
  useEffect(() => {
    if (!users || !online || playing.length === 0 || playing.length > MAX_FOR_DELTAS) return;
    playing.forEach((u) => { if (!details[u.id]) loadDetail(u); });
  }, [users, online, playing]); // eslint-disable-line react-hooks/exhaustive-deps
  const monthly = useMemo(() => {
    if (!playing.length || playing.length > MAX_FOR_DELTAS || playing.some((u) => details[u.id]?.status !== "ok")) return null;
    const now = new Date();
    const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const cur = key(now), prev = key(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const m = { [cur]: { bets: 0, staked: 0, profit: 0, users: new Set<number>() }, [prev]: { bets: 0, staked: 0, profit: 0, users: new Set<number>() } };
    playing.forEach((u) => (details[u.id]?.bets || []).forEach((b) => {
      const k = (b.date || "").slice(0, 7); const x = m[k]; if (!x || (game !== "all" && betView(b).game !== game)) return;
      x.bets++; if (!isUsd(b)) { x.staked += Number(b.amount) || 0; x.profit += Number(b.profit) || 0; } x.users.add(u.id);
    }));
    const MONTHS_GEN = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
    return { c: m[cur], p: m[prev], vs: MONTHS_GEN[(now.getMonth() + 11) % 12] };
  }, [playing, details, game]);
  /** Last month 0 → the difference itself («↑ +3»); both 0 → «→ 0%»; profit compares against |last month|. */
  const chip = (cur: number, prev: number, fmt: (n: number) => string, onBlue = false) => {
    if (!monthly) return null;
    const d = prev !== 0 ? Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10 : cur > 0 ? 1 : cur < 0 ? -1 : 0;
    const text = prev !== 0 ? `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d).toLocaleString("uk-UA", { maximumFractionDigits: 1 })}%` : cur !== 0 ? `${cur > 0 ? "+" : "−"}${fmt(Math.abs(cur))}` : "0%";
    return <><span className={`v3-dl ${onBlue ? "is-onblue " : ""}${d === 0 ? "is-flat" : d > 0 ? "is-up" : "is-down"}${d < 0 ? " is-neg" : ""}`} title={`цей місяць до ${monthly.vs}`}><ArrowUp size={10} strokeWidth={3} aria-hidden="true" />{text}</span><span className="sr-only">{d >= 0 ? "зростання" : "падіння"} до {monthly.vs} </span></>;
  };
  const num = (n: number) => Math.round(n).toLocaleString("uk-UA");
  const uah = (n: number) => `${num(n)} ₴`;

  /* ── pieces ── */
  const gamesSeg = (cls: string) => (
    <div className={cls} role="group" aria-label="Фільтр за грою">
        <PillTrack active={game} />
      <button type="button" className={game === "all" ? "is-on" : ""} aria-pressed={game === "all"} onClick={() => setGame("all")}>Усі <span className="v3-seg-n">{playing.length}</span></button>
      {gameCounts.map(([g, n]) => <button key={g} type="button" className={game === g ? "is-on" : ""} aria-pressed={game === g} onClick={() => setGame(g)}>{g} <span className="v3-seg-n">{n}</span></button>)}
    </div>
  );

  // Empty states (designs BetsMobileNoResults / BetsMobileGameEmpty)
  const otherGames = (g: string) => ["CS2", "Dota 2"].filter((x) => x !== g);
  const clearSearch = () => { setQ(""); pageSearch.setQ(""); pageSearch.setOpen(false); };
  const filteredEmpty = q.trim() ? (
    <div className="v3-bt-empty">
      <span className="v3-bt-empty-ico" aria-hidden="true"><Search size={20} /></span>
      <strong>Нікого не знайдено</strong>
      <span>{game !== "all" ? `За запитом «${q.trim()}» у ${game} нікого немає.` : `За запитом «${q.trim()}» серед гравців нікого немає.`}</span>
      <button type="button" className="v3-btn v3-btn-ghost v3-bt-empty-btn" onClick={clearSearch}>Скинути пошук</button>
    </div>
  ) : (
    <div className="v3-bt-empty">
      <span className="v3-bt-empty-ico" aria-hidden="true"><Dices size={20} /></span>
      <strong>На {game} ставок немає</strong>
      <span>Ніхто з гравців ще не ставив на {game}. Перемкніться на «Усі»{otherGames(game).length ? ` або ${otherGames(game).join(", ")}` : ""}.</span>
      <button type="button" className="v3-btn v3-btn-ghost v3-bt-empty-btn" onClick={() => setGame("all")}>Показати всі ігри</button>
    </div>
  );

  function detailBody(u: AdminUserOverview, s: Stats, mobile: boolean) {
    const d = details[u.id];
    if (!d || d.status === "loading") return <div className="v3-bt-xp-load" role="status">Завантажуємо ставки…</div>;
    if (d.status === "err") return (
      <div className="v3-bt-xp-state">
        <span className="v3-bt-ico is-err" aria-hidden="true">!</span>
        <strong>{d.error === "offline" ? "Деталі недоступні офлайн" : "Не вдалося завантажити ставки"}</strong>
        <span>Підсумки користувача видно, а список ставок — ні. Інші рядки таблиці працюють.</span>
        <button type="button" className="v3-btn v3-btn-primary" disabled={!online} onClick={() => loadDetail(u)}>Спробувати ще раз</button>
      </div>
    );
    if (u.betCount === 0) {
      const days = u.createdAt ? Math.max(0, Math.round((Date.now() - Date.parse(u.createdAt)) / 864e5)) : null;
      const tg = (u.telegram || "").replace(/^@/, "").replace(/^https?:\/\/t\.me\//, "");
      return (
        <div className="v3-bt-xp-state">
          <span className="v3-bt-ico is-info" aria-hidden="true"><Clock size={18} /></span>
          <strong>Ще жодної ставки</strong>
          <span>{days !== null ? `Користувач підключився ${days === 0 ? "сьогодні" : `${days} ${plural(days, "день", "дні", "днів")} тому`}. ` : ""}Можна нагадати, як додати перший запис.</span>
          {tg && <button type="button" className={`v3-btn v3-btn-ghost-dark v3-write${wr === "done" ? " is-done" : ""}`} onClick={() => { if (wr !== "idle") return; setWr("fly"); openTelegram(tg); window.setTimeout(() => setWr("done"), 600); window.setTimeout(() => setWr("idle"), 2600); }}>{wr === "done" ? <><Check size={14} strokeWidth={3} aria-hidden="true" />Відкрито</> : <><span className={`v3-plane${wr === "fly" ? " is-fly" : ""}`} aria-hidden="true"><Send size={14} /></span>Написати в Telegram</>}</button>}
        </div>
      );
    }
    const list = game === "all" ? d.bets : d.bets.filter((b) => betView(b).game === game);
    const shown = list.slice(0, mobile ? 3 : 5);
    const streak = u.lossStreak || 0;
    const games = (u.games || []).filter((g) => g.bets > 0);
    const legs = (v: ReturnType<typeof betView>, cls: string, j: number) => v.legs.length > 0 && (
      <div className={cls}>{v.legs.map((l, q) => { const m = legMark(v.res); return <div key={q} style={{ animationDelay: `${200 + j * 50 + q * 50}ms` }}><b className={`v3-bt-mark ${m.cls}`}>{m.mark}</b><span>{l.match}</span><span className="v3-dim">{mobile ? [l.pick, l.odds].filter(Boolean).join(" · ") : l.pick}</span>{!mobile && <span className="v3-r">{l.odds}</span>}</div>; })}</div>
    );
    if (mobile) return (
      <div className="v3-bt-mxp">
        {/* design BetsMobileOpen: «У гривнях · N ставок» Профіт / Обіг / ROI, then the same in dollars */}
        {(() => { const ux = usdS(u); const uahBets = Math.max(0, s.bets - (ux?.bets || 0)); return <>
          {(uahBets > 0 || !ux) && <>
            <div className="v3-bt-mcap">У гривнях · {uahBets.toLocaleString("uk-UA")} {plural(uahBets, "ставка", "ставки", "ставок")}</div>
            <div className="v3-bt-mtiles is-3">
              <div className="v3-bt-tile"><div className="k">Профіт</div><div className={`v ${s.profit >= 0 ? "is-pos" : "is-neg"}`}>{signedMoney(s.profit)}</div></div>
              <div className="v3-bt-tile"><div className="k">Обіг</div><div className="v">{money(s.staked)}</div></div>
              <div className="v3-bt-tile"><div className="k">ROI</div><div className={`v ${s.profit >= 0 ? "is-pos" : "is-neg"}`}>{signedPct(s.roi)}</div></div>
            </div>
          </>}
          {ux && <>
            <div className="v3-bt-mcap">У доларах · {ux.bets.toLocaleString("uk-UA")} {plural(ux.bets, "ставка", "ставки", "ставок")}</div>
            <div className="v3-bt-mtiles is-3">
              <div className="v3-bt-tile"><div className="k">Профіт</div><div className={`v ${ux.profit >= 0 ? "is-pos" : "is-neg"}`}>{usd(ux.profit)}</div></div>
              <div className="v3-bt-tile"><div className="k">Обіг</div><div className="v">{money(ux.staked, "USD")}</div></div>
              <div className="v3-bt-tile"><div className="k">ROI</div><div className={`v ${ux.profit >= 0 ? "is-pos" : "is-neg"}`}>{signedPct(ux.roi)}</div></div>
            </div>
          </>}
        </>; })()}
        <div className="v3-bt-mcap">Останні ставки</div>
        {shown.map((b, j) => { const v = betView(b); return (
          <div key={b.id} className="v3-bt-mbet" style={{ animationDelay: `${120 + j * 50}ms` }}>
            <div className="v3-bt-mbet-h"><strong>{v.title}</strong><span className={`v3-bt-tag v3-bt-res is-${v.res}`} style={{ animationDelay: `${250 + j * 50}ms` }}><i />{v.status}</span></div>
            <div className="v3-bt-mbet-m"><span className="v3-bt-g">{v.game}</span>{v.day} · {v.pick} · {v.odds}</div>
            {legs(v, "v3-bt-mlegs", j)}
            <div className="v3-bt-mbet-f"><span>{v.amount}</span><strong className={v.res === "win" ? "is-pos" : v.res === "loss" ? "is-neg" : "is-dim"}>{v.profit}</strong></div>
          </div>
        ); })}
        {list.length > shown.length && <button type="button" className="v3-bt-allbtn" onClick={() => openAll(u)} aria-haspopup="dialog">Усі {list.length.toLocaleString("uk-UA")} {plural(list.length, "ставка", "ставки", "ставок")} <span className="v3-bt-ar" aria-hidden="true">→</span></button>}
      </div>
    );
    return (
      <>
        <div className="v3-bt-tiles">
          <div className="v3-bt-tile"><div className="k">Стартовий банк</div><div className="v">{money(u.initialBank)}</div>{usdBank(u) && <div className="v v3-bt-v2">{money(u.initialBankUsd || 0, "USD")}</div>}</div>
          <div className="v3-bt-tile"><div className="k">Поточний банк</div><div className="v">{money(u.currentBank)}</div>{usdBank(u) && <div className="v v3-bt-v2">{money(u.currentBankUsd || 0, "USD")}</div>}</div>
          <div className="v3-bt-tile"><div className="k">Обіг</div><div className="v">{money(s.staked)}</div>{usdS(u) && <div className="v v3-bt-v2">{money(usdS(u)!.staked, "USD")}</div>}</div>
          <div className="v3-bt-tile"><div className="k">Профіт · ROI</div><div className={`v ${s.profit >= 0 ? "is-pos" : "is-neg"}`}>{signedPct(s.roi)}</div>{usdS(u) && <div className={`v v3-bt-v2 ${usdS(u)!.profit >= 0 ? "is-pos" : "is-neg"}`}>{usd(usdS(u)!.profit)} · {signedPct(usdS(u)!.roi)}</div>}</div>
          <div className={`v3-bt-tile${streak >= STREAK_ALERT ? " is-alert" : ""}`}><div className="k">Серія програшів</div><div className="v">{streak >= STREAK_ALERT ? `${streak} поспіль` : streak}</div></div>
        </div>
        {games.length > 0 && <div className="v3-bt-games">{games.map((g) => <span key={g.game}><strong>{gameLabel(g.game)}</strong>{g.bets} {plural(g.bets, "ставка", "ставки", "ставок")} · {signedMoney(g.profit)}{g.wins + g.losses ? ` · ${Math.round((g.wins / (g.wins + g.losses)) * 100)}%` : ""}</span>)}</div>}
        <div className="v3-bt-table">
          <div className="v3-bt-bcols v3-bt-bh"><span>Дата</span><span>Подія</span><span className="v3-r">Коеф.</span><span className="v3-r">Сума</span><span>Результат</span><span className="v3-r">Профіт</span></div>
          {shown.length === 0 && <p className="v3-bt-none">У {game} ставок немає.</p>}
          {shown.map((b, j) => { const v = betView(b); return (
            <div key={b.id} className="v3-bt-bcols v3-bt-br" style={{ animationDelay: `${150 + j * 50}ms` }}>
              <span className="v3-bt-when"><strong>{v.day}</strong><span>{v.time}</span></span>
              <span className="v3-bt-ev">
                <strong>{v.title}</strong>
                <span className="v3-bt-pick"><span className="v3-bt-chip">{v.game}</span>{v.pick}</span>
                {legs(v, "v3-bt-legs", j)}
              </span>
              <span className="v3-r v3-bt-odds">{v.odds}</span>
              <span className="v3-r">{v.amount}</span>
              <span><span className={`v3-bt-pill v3-bt-res is-${v.res}`} style={{ animationDelay: `${250 + j * 50}ms` }}><i />{v.status}</span></span>
              <span className={`v3-r v3-bt-pf ${v.res === "win" ? "is-pos" : v.res === "loss" ? "is-neg" : "is-dim"}`}>{v.profit}</span>
            </div>
          ); })}
        </div>
        <div className="v3-bt-xp-foot">
          <span>{list.length <= 5 ? `Показано ${list.length} ${plural(list.length, "ставку", "ставки", "ставок")}` : `Показано 5 останніх із ${list.length.toLocaleString("uk-UA")} ${plural(list.length, "ставки", "ставок", "ставок")}`}</span>
          <span className="v3-bt-xp-acts">
            {list.length > 5 && <button type="button" className="v3-bt-lnk" onClick={() => openAll(u)} aria-haspopup="dialog">Усі {list.length.toLocaleString("uk-UA")} {plural(list.length, "ставка", "ставки", "ставок")} <span className="v3-bt-ar" aria-hidden="true">→</span></button>}
            <Link className="v3-bt-lnk" to={`/users?q=${encodeURIComponent(u.username)}`}>Відкрити картку користувача <span className="v3-bt-ar" aria-hidden="true">→</span></Link>
          </span>
        </div>
      </>
    );
  }

  const sub = (u: AdminUserOverview) => {
    const role = isAdminU(u) ? `${u.isOwner || u.role === "owner" ? "Овнер" : "Адмін"} · ` : "";
    return role + (userGames(u).join(" · ") || (u.betCount ? "—" : "ще не грає"));
  };
  const streakTag = (u: AdminUserOverview, short = false) => (u.lossStreak || 0) >= STREAK_ALERT && <span className="v3-bt-stk">{u.lossStreak} поспіль{short ? "" : " програшів"}</span>;
  const wlText = (s: Stats) => `${s.wins} / ${s.losses}${s.pending ? ` · ${s.pending} очік.` : ""}`;
  // win / loss split as in betting apps: «44%  ●━━━━ ━━━━━━  56%» — green wins, red losses, a gap between
  const wrBar = (s: Stats) => { const w = Math.round(Math.min(100, Math.max(0, s.wr))); return (
    <span className="v3-bt-wl2" aria-label={`${w}% виграшів`}><small className="is-w">{w}%</small><span className="v3-bt-wl">{w > 0 && <span style={{ width: `${w}%` }} />}{w < 100 && <i />}</span><small className="is-l">{100 - w}%</small></span>
  ); };
  const moreAll = people.length > playing.length && (
    <button type="button" className={`v3-bt-morebtn${showAll ? " is-on" : ""}`} aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? "Лише ті, хто грає" : "Показати всіх"}<ChevronDown size={15} aria-hidden="true" /></button>
  );

  const desktopTable = (
    <section className="v3-wcard v3-bt-card" aria-busy={busy}>
      <div className="v3-bt-tools">
        <label className="v3-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Пошук користувачів за ставками" placeholder="Знайти за логіном або Telegram" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} /></label>
        {gamesSeg("v3-seg v3-seg-soft")}
        <div className="v3-seg v3-seg-soft v3-bt-sort" role="group" aria-label="Сортування ставок">
          <span className="v3-bt-sort-l">Сортування:</span>
          <PillTrack active={sort} />
          {SORTS.map(([k, l]) => <button key={k} type="button" className={sort === k ? "is-on" : ""} aria-pressed={sort === k} onClick={() => setSort(k)}>{l}</button>)}
        </div>
      </div>
      <div className={`v3-bt-cols v3-bt-th${xwide ? " is-x" : ""}`} role="row"><span>Користувач</span><span>Ставок</span><span>Сума ставок</span><span>Профіт</span>{xwide && <><span>ROI</span><span>Банк зараз</span></>}<span>Вінрейт · В / П</span><span /></div>
      {rows.length === 0 ? filteredEmpty : <div key={rk} className="v3-bt-rows">{rows.slice(0, limit).map(({ u, s }, i) => {
        const open = openId === u.id;
        return (
          <div key={u.id} className={`v3-bt-item${open ? " is-open" : ""}`} style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
            <button type="button" className={`v3-bt-tr v3-bt-cols${xwide ? " is-x" : ""}`} aria-expanded={open} onClick={() => toggle(u)}>
              <span className="v3-bt-who"><UserAvatar username={u.username} telegram={u.telegram} className="v3-bt-av" /><span><strong>@{hl(u.username, q)}</strong><span className="v3-bt-sub">{sub(u)}{streakTag(u)}</span></span></span>
              <span className="v3-bt-n">{s.bets.toLocaleString("uk-UA")}</span>
              <span>{money(s.staked)}{usdS(u) && <small className="v3-bt-usd">{money(usdS(u)!.staked, "USD")}</small>}</span>
              <span className={`v3-bt-n ${s.profit >= 0 ? "is-pos" : "is-neg"}`}>{signedMoney(s.profit)}{usdS(u) && <small className={`v3-bt-usd ${usdS(u)!.profit >= 0 ? "is-pos" : "is-neg"}`}>{usd(usdS(u)!.profit)}</small>}</span>
              {xwide && <><span className={s.profit >= 0 ? "is-pos" : "is-neg"}>{signedPct(s.roi)}{usdS(u) && <small className={`v3-bt-usd ${usdS(u)!.profit >= 0 ? "is-pos" : "is-neg"}`}>{signedPct(usdS(u)!.roi)}</small>}</span><span>{money(u.currentBank)}{usdBank(u) && <small className="v3-bt-usd">{money(u.currentBankUsd || 0, "USD")}</small>}</span></>}
              <span><span className="v3-bt-wr">{Math.round(s.wr)}%</span> <span className="v3-bt-dim">· {wlText(s)}</span>{wrBar(s)}</span>
              <span className="v3-bt-chev" aria-hidden="true"><ChevronDown size={14} /></span>
            </button>
            {open && <div className="v3-bt-xp">{detailBody(u, s, false)}</div>}
          </div>
        );
      })}</div>}
      <div className="v3-bt-foot">
        <span>Натисніть на рядок, щоб переглянути ставки · <b>{Math.min(limit, rows.length)}</b> з {showAll ? `${people.length} ${plural(people.length, "користувача", "користувачів", "користувачів")}` : `${playing.length} ${plural(playing.length, "користувача", "користувачів", "користувачів")}, які грають`}{updatedAt ? ` · оновлено о ${updatedAt}` : ""}</span>
        <span className="v3-bt-xp-acts">
          {rows.length > limit && <button type="button" className="v3-bt-morebtn" onClick={() => setLimit(limit + PAGE)}>Показати ще {Math.min(PAGE, rows.length - limit)}</button>}
          {moreAll}
        </span>
      </div>
    </section>
  );

  const mobileList = (
    <div className="v3-bt-mobile">
      <div className="v3-bt-mtabs" role="group" aria-label="Фільтр за грою">
        <PillTrack active={game} />
        <button type="button" className={`v3-bt-mtab${game === "all" ? " is-on" : ""}`} aria-pressed={game === "all"} onClick={() => setGame("all")}><span className="v3-bt-mtab-n">{playing.length}</span>Усі<span className="v3-bt-mtab-c">· {playing.length}</span></button>
        {[...gameCounts, ...(phone ? ["CS2", "Dota 2"].filter((g) => !gameCounts.some(([x]) => x === g)).map((g) => [g, 0] as [string, number]) : [])].map(([g, n]) => <button key={g} type="button" className={`v3-bt-mtab${game === g ? " is-on" : ""}`} aria-pressed={game === g} onClick={() => setGame(g)}><span className="v3-bt-mtab-n">{n}</span>{g}<span className="v3-bt-mtab-c">· {n}</span></button>)}
      </div>
      <label className="v3-msearch"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Пошук" placeholder="Логін або Telegram" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} /></label>
      <Dropdown className="v3-mselect-dd" ariaLabel="Сортування" prefix="Сортування:" sheet={{ title: "Сортування" }} value={sort} onChange={(v) => setSort(v)} options={SORTS.map(([k]) => ({ value: k, label: SORT_M[k] }))} />
      {rows.length === 0 ? <div className="v3-wcard">{filteredEmpty}</div> : <div key={rk} ref={mrowsRef} className="v3-bt-mrows">{rows.slice(0, limit).map(({ u, s }, i) => {
        const open = openId === u.id;
        const head = (
          <button type="button" className="v3-bt-mcard" aria-expanded={open} onClick={() => toggle(u)}>
            <UserAvatar username={u.username} telegram={u.telegram} className="v3-bt-av" />
            <span className="v3-bt-mwho"><strong>@{hl(u.username, q)}{streakTag(u, true)}</strong><span>{u.betCount ? `${s.bets.toLocaleString("uk-UA")} ${plural(s.bets, "ставка", "ставки", "ставок")} · ${Math.round(s.wr)}% · ${userGames(u).join(" · ")}` : "ще не грає"}</span></span>
            <strong className={`v3-bt-mamt ${s.profit >= 0 ? (s.profit ? "is-pos-d" : "is-dim") : "is-neg-d"}`}>{signedMoney(s.profit)}{usdS(u) && <small className={`v3-bt-usd ${usdS(u)!.profit >= 0 ? "is-pos-d" : "is-neg-d"}`}>{usd(usdS(u)!.profit)}</small>}</strong>
            <span className="v3-bt-mbar">{wrBar(s)}</span>
            <span className="v3-bt-mpill">{open ? "Згорнути" : "Ставки"}<ChevronDown size={13} aria-hidden="true" /></span>
          </button>
        );
        const closing = !open && closingId === u.id;
        return <div key={u.id} className={`${open || closing ? "v3-bt-mopen" : "v3-bt-mitem"}${leaving && !playing.includes(u) ? " is-leave" : ""}`} style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}>{head}{(open || closing) && <div className={`v3-bt-mxpw${closing ? " is-closing" : ""}`}><div className="v3-bt-mxpw-in">{detailBody(u, s, true)}</div></div>}</div>;
      })}</div>}
      {rows.length > limit && <button type="button" className="v3-bt-allbtn v3-bt-mall" onClick={() => setLimit(limit + PAGE)}>Показати ще {Math.min(PAGE, rows.length - limit)}</button>}
      {people.length > playing.length && <button type="button" className={`v3-bt-allbtn v3-bt-mall${showAll ? " is-on" : ""}`} aria-expanded={showAll} onClick={toggleAll}>{showAll ? "Лише ті, хто грає" : `Показати всіх · ${people.length}`}<ChevronDown size={16} aria-hidden="true" /></button>}
    </div>
  );

  const refreshIc = done ? <Check size={15} className="v3-bt-ok" aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" className={`v3-bt-rf${busy ? " v3-bt-rot" : ""}`} />;

  const offline = !online && (
    <div key={offTry} className={`v3-offline-users${offTry ? " v3-bt-shk" : ""}`} role="status"><WifiOff size={16} aria-hidden="true" /><span>{offTry ? `Досі немає інтернету (${offTry}). ` : "Немає інтернету. "}Підсумки станом на {updatedAt || "—"}, нові ставки не підвантажаться.</span><button type="button" className={`v3-btn v3-btn-ghost-dark v3-btn-sm${offBusy ? " v3-bt-busy" : ""}`} disabled={offBusy} onClick={() => { if (navigator.onLine) { load(true); return; } setOffBusy(true); window.setTimeout(() => { setOffBusy(false); setOffTry((x) => x + 1); }, 1000); }}>{offBusy ? <><RefreshCw size={13} className="v3-bt-rot" aria-hidden="true" />Перевіряємо…</> : "Перевірити ще раз"}</button></div>
  );

  return (
    <div className="v3-page v3-bets">
      <section className="v3-hero v3-hero-row">
        <div>
          <h1 className="v3-title">Ставки</h1>
          <p className="v3-subtitle"><span className="v3-hide-mobile">Записи ставок, результати й активність користувачів — за весь час.</span><span className="v3-only-mobile">{loading ? "завантажуємо…" : !playing.length ? "ще ніхто не грає" : <>{playing.length} {plural(playing.length, "користувач грає", "користувачі грають", "користувачів грають")} · за весь час{updatedAt ? ` · оновлено ${updatedAt}` : ""}</>}</span></p>
        </div>
        <div className="v3-chips">
          {!noBetsAtAll && <button type="button" className="v3-chip v3-bt-refresh v3-hide-mobile" onClick={() => load(true)} disabled={busy || !online}>{refreshIc}Оновити{updatedAt ? ` · ${updatedAt}` : ""}</button>}
          {!noBetsAtAll && <ExportCsvButton className="v3-chip v3-hide-mobile" onClick={exportTable} disabled={!rows.length} />}
        </div>
        <div className="v3-bt-mtop">
          {!noBetsAtAll && <button type="button" className="v3-bt-rfb" onClick={() => load(true)} disabled={busy || !online} aria-label={busy ? "Оновлюємо" : "Оновити"}>{refreshIc}</button>}
        </div>
      </section>

      {offline}

      {error && users === null ? (
        <div className="v3-dcard v3-uerror" role="alert">
          <span className="v3-uerror-ico" aria-hidden="true">!</span>
          <strong>Не вдалося завантажити ставки</strong>
          <span>Сервер не відповідає. Спробуйте ще раз за хвилину.</span>
          <div><button type="button" className="v3-btn v3-btn-blue" onClick={() => load()}>Спробувати ще раз</button></div>
        </div>
      ) : loading && phone ? (
        /* phone skeleton (design BetsMobileLoading): two KPI cards, tabs, sort, three rows */
        <div className="v3-bt-msk" role="status" aria-label="Завантаження ставок">
          <section className="v3-bt-mkpis">{[0, 1].map((i) => <div key={i} className="v3-bt-mk"><i className="v3-sk" style={{ width: "55%", height: 10 }} /><i className="v3-sk" style={{ width: "75%", height: 22, marginTop: 12 }} /><i className="v3-sk" style={{ width: "50%", height: 8, marginTop: 12 }} /></div>)}</section>
          <div className="v3-bt-mtabs" aria-hidden="true"><span className="v3-bt-mtab is-on">Усі</span><span className="v3-bt-mtab">CS2</span><span className="v3-bt-mtab">Dota 2</span></div>
          <div className="v3-bt-msk-sort" aria-hidden="true">Сортування: за кількістю ставок<ChevronDown size={14} /></div>
          {[0, 1, 2].map((i) => <div key={i} className="v3-bt-msk-row"><i className="v3-sk is-av" /><div><i className="v3-sk" style={{ width: "55%", height: 10 }} /><i className="v3-sk" style={{ width: "80%", height: 8, marginTop: 8 }} /></div><div className="v3-bt-msk-r"><i className="v3-sk" style={{ width: 52, height: 12 }} /><i className="v3-sk" style={{ width: 52, height: 22, marginTop: 14 }} /></div></div>)}
        </div>
      ) : loading ? (
        <>
          <section className="v3-bt-kpis">{[0, 1, 2, 3].map((i) => <div key={i} className="v3-dcard v3-bt-kpi"><i className="v3-sk" style={{ width: "50%", height: 10 }} /><i className="v3-sk" style={{ width: "70%", height: 30, marginTop: 14 }} /></div>)}</section>
          <section className="v3-wcard v3-bt-card" role="status" aria-label="Завантаження ставок">{[55, 65, 45, 60, 50].map((w, i) => <div key={i} className="v3-bt-skrow"><i className="is-av" /><div><i style={{ width: `${w}%`, height: 10 }} /><i style={{ width: "100%", height: 5, marginTop: 9 }} /></div><i style={{ width: 64, height: 16 }} /></div>)}</section>
        </>
      ) : noBetsAtAll && phone && !showAll ? (
        /* phone, nobody plays yet (design BetsMobileEmpty) */
        <>
          <section className="v3-bt-mkpis">
            <div className="v3-bt-mk is-zero"><div className="l">Ставок всього</div><div className="v">0</div><div className="n"><span className="v3-bt-mnote">ще ніхто не ставив</span></div></div>
            <div className="v3-bt-mk is-zero"><div className="l">Загальний профіт</div><div className="v">0 <small>₴</small></div><div className="n"><span className="v3-bt-mnote">ROI з’явиться після ставок</span></div></div>
          </section>
          <div className="v3-bt-mtabs" aria-hidden="true"><span className="v3-bt-mtab is-on">Усі</span><span className="v3-bt-mtab">CS2</span><span className="v3-bt-mtab">Dota 2</span></div>
          <div className="v3-wcard v3-bt-mempty">
            <div className="v3-bt-empty">
              <span className="v3-bt-empty-ico" aria-hidden="true"><Dices size={20} /></span>
              <strong>Ставок ще немає</strong>
              <span>Коли користувачі почнуть записувати ставки в застосунку, тут з’явиться їхня статистика.</span>
              {people.length > 0 && <button type="button" className="v3-btn v3-btn-ghost v3-bt-empty-btn" onClick={() => setShowAll(true)}>Показати всіх · {people.length}</button>}
            </div>
          </div>
        </>
      ) : noBetsAtAll && !(phone && showAll) ? (
        <>
          <section className="v3-bt-kpis">
            <div className="v3-dcard v3-bt-kpi"><div className="l">Ставок всього</div><div className="v">0</div><div className="n">ще немає записів</div></div>
            <div className="v3-dcard v3-bt-kpi v3-hide-mobile"><div className="l">Обіг</div><div className="v">0 <small>₴</small></div><div className="n">сума ставок</div></div>
            <div className="v3-dcard v3-bt-kpi"><div className="l">Загальний профіт</div><div className="v">0 <small>₴</small></div><div className="n">—</div></div>
            <div className="v3-dcard v3-bt-kpi v3-hide-mobile"><div className="l">Грають</div><div className="v">0 <small>з {people.length}</small></div><div className="n">користувачів</div></div>
          </section>
          <section className="v3-pay-zero v3-bt-zero">
            <div className="v3-wcard v3-pay-zero-card">
              <span className="v3-empty-ic v3-float v3-halo" aria-hidden="true"><BarChart3 size={24} /></span>
              <strong>Ставок ще немає</strong>
              <p>{people.length ? `У ${people.length} ${plural(people.length, "користувача", "користувачів", "користувачів")} є акаунт, але ніхто ще не додав запис у журнал MatchIQ.` : "Користувачів ще немає."} Щойно це станеться — тут з’являться обіг, профіт і вінрейт.</p>
            </div>
            <div className="v3-dcard v3-pay-zero-steps">
              <strong>Як з’являються ставки</strong>
              {[["Користувач додає запис", "У застосунку MatchIQ: матч, тип ставки, коефіцієнт і сума"], ["Матч завершується", "Результат і профіт рахуються автоматично"], ["Ви бачите все тут", "Обіг, вінрейт, серії програшів і банк кожного користувача"]].map((x, i) => <div key={x[0]} className="v3-pay-zero-step"><b>{i + 1}</b><span><strong>{x[0]}</strong><small>{x[1]}</small></span></div>)}
            </div>
          </section>
        </>
      ) : (
        <>
          {wide ? (
            <section className="v3-bt-kpis">
              <div className="v3-bt-kpi is-blue"><div className="l">Ставок всього</div><div className="v"><RollingNumber key={`b-${tot.bets}`} text={tot.bets.toLocaleString("uk-UA")} /></div><div className="n">{monthly && chip(monthly.c.bets, monthly.p.bets, num, true)}{tot.wins.toLocaleString("uk-UA")} {plural(tot.wins, "виграш", "виграші", "виграшів")} · {tot.losses.toLocaleString("uk-UA")} {plural(tot.losses, "програш", "програші", "програшів")} · {tot.pending.toLocaleString("uk-UA")} очікує</div></div>
              <div className="v3-dcard v3-bt-kpi"><div className="l">Обіг</div><div className="v"><RollingNumber key={`s-${tot.staked}`} text={Math.round(tot.staked).toLocaleString("uk-UA")} /><small> ₴</small></div><div className="n">{monthly && chip(monthly.c.staked, monthly.p.staked, uah)}сума ставок усіх користувачів</div></div>
              <div className="v3-dcard v3-bt-kpi"><div className="l">Загальний профіт</div><div className={`v ${tot.profit >= 0 ? "is-pos" : "is-neg"}`}><RollingNumber key={`p-${tot.profit}`} text={signedMoney(tot.profit).replace(" ₴", "")} /><small> ₴</small></div>{totUsd && <div className={`v v3-bt-vusd ${totUsd.p >= 0 ? "is-pos" : "is-neg"}`}>{signedMoney(totUsd.p, "USD").replace(" $", "")}<small> $</small></div>}<div className="n">{monthly && chip(monthly.c.profit, monthly.p.profit, uah)}ROI {signedPct(roi)}{totUsd ? ` · $ ${signedPct(totUsd.roi)}` : ""} · за виграшами й програшами</div></div>
              <div className="v3-dcard v3-bt-kpi"><div className="l">Грають</div><div className="v">{playing.length}<small> з {people.length}</small></div>{monthly && <div className="n">{chip(monthly.c.users.size, monthly.p.users.size, num)}грали цього місяця: {monthly.c.users.size}</div>}<div className="v3-bt-gtags">{gameCounts.map(([g, n]) => <span key={g} className="v3-tag v3-bt-gtag">{g} · {n}</span>)}</div></div>
            </section>
          ) : (
            <section className="v3-bt-mkpis">
              <div className="v3-bt-mk is-blue"><div className="l">Ставок всього</div><div className="v"><RollingNumber key={`mb-${tot.bets}`} text={tot.bets.toLocaleString("uk-UA")} /></div><div className="n">{monthly && !phone && <>{chip(monthly.c.bets, monthly.p.bets, num, true)}<span className="v3-bt-mvs">цей міс. до {monthly.vs}</span></>}<span className="v3-bt-mnote">{tot.wins.toLocaleString("uk-UA")} {plural(tot.wins, "виграш", "виграші", "виграшів")} · {tot.losses.toLocaleString("uk-UA")} {plural(tot.losses, "програш", "програші", "програшів")}{tot.pending ? ` · ${tot.pending.toLocaleString("uk-UA")} очікує` : ""}</span></div></div>
              <div className="v3-bt-mk"><div className="l">Загальний профіт</div><div className={`v ${tot.profit >= 0 ? "is-pos" : "is-neg"}`}><RollingNumber key={`mp-${tot.profit}`} text={signedMoney(tot.profit)} /></div>{totUsd && <div className={`v v3-bt-vusd ${totUsd.p >= 0 ? "is-pos" : "is-neg"}`}>{signedMoney(totUsd.p, "USD")}</div>}<div className="n">{monthly && !phone && <>{chip(monthly.c.profit, monthly.p.profit, uah)}<span className="v3-bt-mvs">цей міс. до {monthly.vs}</span></>}<span className="v3-bt-mnote">ROI {signedPct(roi)}{totUsd ? ` · $ ${signedPct(totUsd.roi)}` : " · за весь час"}</span></div></div>
            </section>
          )}
          {wide ? desktopTable : mobileList}
          <AllBetsDialog user={allFor} bets={allFor ? details[allFor.id]?.bets || [] : []} open={allOpen} onOpenChange={setAllOpen} />
        </>
      )}
    </div>
  );
}
