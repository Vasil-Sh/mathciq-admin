import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowDownUp, BarChart3, ChevronDown, Clock, ListFilter, RefreshCw, Search, WifiOff } from "lucide-react";
import { toast } from "sonner";
import UserAvatar from "@/components/UserAvatar";
import { fetchUserBets, fetchUsersOverview } from "@/lib/adminBetsApi";
import { downloadCsv } from "@/lib/csv";
import { plural } from "@/lib/dashboardInsights";
import { betView, gameLabel, money, signedMoney, signedPct, statsFor, userGames, type Sort, type Stats } from "@/lib/betsModel";
import { useMedia, useOnline } from "@/hooks/useMediaOnline";
import type { AdminUserBet, AdminUserOverview } from "@/types";

const isAdminU = (u: AdminUserOverview) => u.role === "admin" || u.role === "owner" || !!u.isOwner;
const hhmm = () => new Date().toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
const SORTS: [Sort, string][] = [["bets", "Ставки"], ["staked", "Сума"], ["profit", "Профіт"], ["wr", "Вінрейт"]];
const PAGE = 20;
const STREAK_ALERT = 5;

type Detail = { status: "loading" | "ok" | "err"; bets: AdminUserBet[]; error?: string };

export default function Bets() {
  const wide = useMedia("(min-width: 1180px)");
  const xwide = useMedia("(min-width: 1600px)");
  const online = useOnline();
  const [params] = useSearchParams();
  const [users, setUsers] = useState<AdminUserOverview[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");
  const [q, setQ] = useState(params.get("q") || "");
  const [game, setGame] = useState("all");
  const [sort, setSort] = useState<Sort>("bets");
  const [showAll, setShowAll] = useState(false);
  const [includeStaff, setIncludeStaff] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [openId, setOpenId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, Detail>>({});
  const [fullList, setFullList] = useState<Record<number, boolean>>({});
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
        toast.success("Дані оновлено", { description: diff > 0 ? `Нових ставок: ${diff}` : "Нових ставок немає" });
      }
    } catch (e) {
      const msg = (e as Error).message || "Сервер не відповідає";
      setError(msg);
      if (manual || users) toast.error("Не вдалося завантажити ставки", { description: navigator.onLine ? "Сервер не відповідає" : "Немає з’єднання", action: { label: "Повторити", onClick: () => load(true) } });
    } finally { setBusy(false); }
  }, [users]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const qq = params.get("q"); if (qq !== null) setQ(qq); }, [params]);

  const people = useMemo(() => (users || []).filter((u) => includeStaff || !isAdminU(u)), [users, includeStaff]);
  const playing = useMemo(() => people.filter((u) => u.betCount > 0), [people]);
  const gameCounts = useMemo(() => {
    const m = new Map<string, number>();
    playing.forEach((u) => userGames(u).forEach((g) => m.set(g, (m.get(g) || 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [playing]);
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
  function toggle(u: AdminUserOverview) {
    if (openId === u.id) { setOpenId(null); return; }
    setOpenId(u.id);
    const d = details[u.id];
    if (!d || d.status === "err") { if (online) loadDetail(u); else setDetails((x) => ({ ...x, [u.id]: { status: "err", bets: [], error: "offline" } })); }
  }
  function exportUser(u: AdminUserOverview, bets: AdminUserBet[]) {
    const file = `bets-${u.username}.csv`;
    downloadCsv(file, ["Дата", "Гра", "Подія", "Ставка", "Коефіцієнт", "Сума", "Валюта", "Результат", "Профіт"],
      bets.map((b) => { const v = betView(b); return [b.date, v.game, v.title, b.betType, b.odds, b.amount, b.currency || "UAH", v.status, b.result === "Pending" ? "" : b.profit]; }));
    toast.success("Файл готовий", { description: `${file} · ${bets.length} ${plural(bets.length, "рядок", "рядки", "рядків")}` });
  }
  const resetFilters = () => { setQ(""); setGame("all"); };

  const loading = users === null && !error;
  const noBetsAtAll = users !== null && playing.length === 0;

  /* ── pieces ── */
  const gamesSeg = (cls: string) => (
    <div className={cls} role="group" aria-label="Фільтр за грою">
      <button type="button" className={game === "all" ? "is-on" : ""} aria-pressed={game === "all"} onClick={() => setGame("all")}>Усі <span className="v3-seg-n">{playing.length}</span></button>
      {gameCounts.map(([g, n]) => <button key={g} type="button" className={game === g ? "is-on" : ""} aria-pressed={game === g} onClick={() => setGame(g)}>{g} <span className="v3-seg-n">{n}</span></button>)}
    </div>
  );

  const filteredEmpty = (
    <div className="v3-bt-empty">
      <span className="v3-bt-empty-ico" aria-hidden="true"><ListFilter size={22} /></span>
      <strong>Ставок не знайдено</strong>
      <span>{q.trim() && game !== "all" ? `За запитом «${q.trim()}» немає ставок у ${game}. Змініть гру або скиньте пошук.` : q.trim() ? `За запитом «${q.trim()}» нікого не знайдено.` : `У ${game} ще ніхто не ставив.`}</span>
      <button type="button" className="v3-btn v3-btn-ghost" onClick={resetFilters}>Скинути фільтри</button>
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
          {tg && <a className="v3-btn v3-btn-ghost-dark" href={`https://t.me/${tg}`} target="_blank" rel="noreferrer">Написати в Telegram</a>}
        </div>
      );
    }
    const list = game === "all" ? d.bets : d.bets.filter((b) => betView(b).game === game);
    const all = !!fullList[u.id];
    const shown = list.slice(0, all ? list.length : mobile ? 3 : 5);
    const streak = u.lossStreak || 0;
    const games = (u.games || []).filter((g) => g.bets > 0);
    if (mobile) return (
      <div className="v3-bt-mxp">
        <div className="v3-bt-mtiles">
          <div className="v3-bt-tile"><div className="k">Банк: старт → зараз</div><div className="v">{money(u.initialBank).replace(" ₴", "")} → {money(u.currentBank)}</div></div>
          <div className="v3-bt-tile"><div className="k">Обіг · ROI</div><div className="v">{money(s.staked)} · <span className={s.profit >= 0 ? "is-pos" : "is-neg"}>{signedPct(s.roi)}</span></div></div>
        </div>
        {streak >= STREAK_ALERT && <p className="v3-bt-mstreak">{streak} {plural(streak, "програш", "програші", "програшів")} поспіль</p>}
        <div className="v3-bt-mcap">{all ? `Усі ставки · ${list.length}` : "Останні ставки"}</div>
        {shown.map((b) => { const v = betView(b); return (
          <div key={b.id} className="v3-bt-mbet">
            <div className="v3-bt-mbet-h"><strong>{v.title}</strong><span className={`v3-bt-tag is-${v.res}`}>{v.status}</span></div>
            <div className="v3-bt-mbet-m"><span className="v3-bt-g">{v.game}</span>{v.day} · {v.pick} · {v.odds}</div>
            {v.legs.length > 0 && <div className="v3-bt-mlegs">{v.legs.map((l, i) => <div key={i}><span className="v3-bt-mark">·</span><span>{l.match}{l.pick ? ` · ${l.pick}` : ""}</span><span>{l.odds}</span></div>)}</div>}
            <div className="v3-bt-mbet-f"><span>{v.amount}</span><strong className={v.res === "win" ? "is-pos" : v.res === "loss" ? "is-neg" : "is-dim"}>{v.profit}</strong></div>
          </div>
        ); })}
        {list.length > shown.length && <button type="button" className="v3-btn v3-btn-ghost-dark v3-btn-block" onClick={() => setFullList((f) => ({ ...f, [u.id]: true }))}>Усі {list.length} {plural(list.length, "ставка", "ставки", "ставок")} →</button>}
      </div>
    );
    return (
      <>
        <div className="v3-bt-tiles">
          <div className="v3-bt-tile"><div className="k">Стартовий банк</div><div className="v">{money(u.initialBank)}</div></div>
          <div className="v3-bt-tile"><div className="k">Поточний банк</div><div className="v">{money(u.currentBank)}</div></div>
          <div className="v3-bt-tile"><div className="k">Обіг</div><div className="v">{money(s.staked)}</div></div>
          <div className="v3-bt-tile"><div className="k">Профіт · ROI</div><div className={`v ${s.profit >= 0 ? "is-pos" : "is-neg"}`}>{signedPct(s.roi)}</div></div>
          <div className={`v3-bt-tile${streak >= STREAK_ALERT ? " is-alert" : ""}`}><div className="k">Серія програшів</div><div className="v">{streak >= STREAK_ALERT ? `${streak} поспіль` : streak}</div></div>
        </div>
        {games.length > 0 && <div className="v3-bt-games">{games.map((g) => <span key={g.game}><strong>{gameLabel(g.game)}</strong>{g.bets} {plural(g.bets, "ставка", "ставки", "ставок")} · {signedMoney(g.profit)}{g.wins + g.losses ? ` · ${Math.round((g.wins / (g.wins + g.losses)) * 100)}%` : ""}</span>)}</div>}
        <div className="v3-bt-table">
          <div className="v3-bt-bcols v3-bt-bh"><span>Дата</span><span>Подія</span><span className="v3-r">Коеф.</span><span className="v3-r">Сума</span><span>Результат</span><span className="v3-r">Профіт</span></div>
          {shown.length === 0 && <p className="v3-bt-none">У {game} ставок немає.</p>}
          {shown.map((b) => { const v = betView(b); return (
            <div key={b.id} className="v3-bt-bcols v3-bt-br">
              <span className="v3-bt-when"><strong>{v.day}</strong><span>{v.time}</span></span>
              <span className="v3-bt-ev">
                <strong>{v.title}</strong>
                <span className="v3-bt-pick"><span className="v3-bt-chip">{v.game}</span>{v.pick}</span>
                {v.legs.length > 0 && <div className="v3-bt-legs">{v.legs.map((l, i) => <div key={i} className="v3-bt-leg"><span className="v3-bt-mark">·</span><span>{l.match}</span><span className="v3-dim">{l.pick}</span><span className="v3-r">{l.odds}</span></div>)}</div>}
              </span>
              <span className="v3-r v3-bt-odds">{v.odds}</span>
              <span className="v3-r">{v.amount}</span>
              <span><span className={`v3-bt-pill is-${v.res}`}><i />{v.status}</span></span>
              <span className={`v3-r v3-bt-pf ${v.res === "win" ? "is-pos" : v.res === "loss" ? "is-neg" : "is-dim"}`}>{v.profit}</span>
            </div>
          ); })}
        </div>
        <div className="v3-bt-xp-foot">
          <span>{all || list.length <= 5 ? `Показано ${list.length} ${plural(list.length, "ставку", "ставки", "ставок")}` : `Показано 5 останніх із ${list.length} ${plural(list.length, "ставки", "ставок", "ставок")}`}{list.length > 5 && <button type="button" className="v3-bt-link" onClick={() => setFullList((f) => ({ ...f, [u.id]: !all }))}>{all ? "Лише останні" : "Показати всі"}</button>}</span>
          <span className="v3-bt-xp-acts"><button type="button" className="v3-bt-link" onClick={() => exportUser(u, list)}>Експорт CSV</button><Link to={`/users?q=${encodeURIComponent(u.username)}`}>Відкрити картку користувача →</Link></span>
        </div>
      </>
    );
  }

  const sub = (u: AdminUserOverview) => {
    const role = isAdminU(u) ? `${u.isOwner || u.role === "owner" ? "Овнер" : "Адмін"} · ` : "";
    const g = userGames(u).join(" · ") || (u.betCount ? "—" : "ще не грає");
    return role + ((u.lossStreak || 0) >= STREAK_ALERT ? `${g} · ${u.lossStreak} поспіль програшів` : g);
  };
  const wlText = (s: Stats) => `${s.wins} / ${s.losses}${s.pending ? ` · ${s.pending} очік.` : ""}`;

  const desktopTable = (
    <section className="v3-wcard v3-bt-card" aria-busy={busy}>
      <div className="v3-bt-tools">
        <label className="v3-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Пошук користувачів за ставками" placeholder="Знайти за логіном або Telegram" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} /></label>
        {gamesSeg("v3-seg v3-seg-soft")}
        <div className="v3-seg v3-seg-soft v3-bt-sort" role="group" aria-label="Сортування ставок">
          <span className="v3-bt-sort-l">Сортування:</span>
          {SORTS.map(([k, l]) => <button key={k} type="button" className={sort === k ? "is-on" : ""} aria-pressed={sort === k} onClick={() => setSort(k)}>{l}</button>)}
        </div>
        <button type="button" className={`v3-bt-staff${includeStaff ? " is-on" : ""}`} aria-pressed={includeStaff} onClick={() => setIncludeStaff((v) => !v)}>Адміни й овнери</button>
      </div>
      <div className={`v3-bt-cols v3-bt-th${xwide ? " is-x" : ""}`} role="row"><span>Користувач</span><span>Ставок</span><span>Сума ставок</span><span>Профіт</span>{xwide && <><span>ROI</span><span>Банк зараз</span></>}<span>Вінрейт · В / П</span><span /></div>
      {rows.length === 0 ? filteredEmpty : rows.slice(0, limit).map(({ u, s }) => {
        const open = openId === u.id;
        return (
          <div key={u.id} className={`v3-bt-item${open ? " is-open" : ""}`}>
            <button type="button" className={`v3-bt-tr v3-bt-cols${xwide ? " is-x" : ""}`} aria-expanded={open} onClick={() => toggle(u)}>
              <span className="v3-bt-who"><UserAvatar username={u.username} telegram={u.telegram} className="v3-bt-av" /><span><strong>@{u.username}</strong><span className={`v3-bt-sub${(u.lossStreak || 0) >= STREAK_ALERT ? " is-alert" : ""}`}>{sub(u)}</span></span></span>
              <span className="v3-bt-n">{s.bets.toLocaleString("uk-UA")}</span>
              <span>{money(s.staked)}</span>
              <span className={`v3-bt-n ${s.profit >= 0 ? "is-pos" : "is-neg"}`}>{signedMoney(s.profit)}</span>
              {xwide && <><span className={s.profit >= 0 ? "is-pos" : "is-neg"}>{signedPct(s.roi)}</span><span>{money(u.currentBank)}</span></>}
              <span><span className="v3-bt-wr">{Math.round(s.wr)}%</span> <span className="v3-bt-dim">· {wlText(s)}</span><span className="v3-bt-wl"><span style={{ width: `${Math.min(100, Math.max(0, s.wr))}%` }} /></span></span>
              <span className="v3-bt-chev" aria-hidden="true"><ChevronDown size={14} /></span>
            </button>
            {open && <div className="v3-bt-xp">{detailBody(u, s, false)}</div>}
          </div>
        );
      })}
      <div className="v3-bt-foot">
        <span>Натисніть на рядок, щоб переглянути ставки · <b>{Math.min(limit, rows.length)}</b> з {showAll ? `${people.length} ${plural(people.length, "користувача", "користувачів", "користувачів")}` : `${playing.length} ${plural(playing.length, "користувача", "користувачів", "користувачів")}, які грають`}{updatedAt ? ` · оновлено о ${updatedAt}` : ""}</span>
        <span className="v3-bt-xp-acts">
          {rows.length > limit && <button type="button" className="v3-bt-link" onClick={() => setLimit(limit + PAGE)}>Показати ще {Math.min(PAGE, rows.length - limit)}</button>}
          {people.length > playing.length && <button type="button" className="v3-bt-link" onClick={() => setShowAll(!showAll)}>{showAll ? "Лише ті, хто грає" : "Показати всіх"}</button>}
        </span>
      </div>
    </section>
  );

  const mobileList = (
    <div className="v3-bt-mobile">
      <label className="v3-msearch"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Пошук" placeholder="Логін або Telegram" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} /></label>
      <div className="v3-bt-mfilters">
        {gamesSeg("v3-bt-mseg")}
        <button type="button" className="v3-bt-msort" aria-label={`Сортування: ${SORTS.find((x) => x[0] === sort)![1]}. Натисніть, щоб змінити`} onClick={() => setSort(SORTS[(SORTS.findIndex((x) => x[0] === sort) + 1) % SORTS.length][0])}><ArrowDownUp size={14} aria-hidden="true" />{SORTS.find((x) => x[0] === sort)![1]}</button>
      </div>
      <button type="button" className={`v3-bt-staff${includeStaff ? " is-on" : ""}`} aria-pressed={includeStaff} onClick={() => setIncludeStaff((v) => !v)}>Адміни й овнери</button>
      {rows.length === 0 ? <div className="v3-wcard">{filteredEmpty}</div> : rows.slice(0, limit).map(({ u, s }) => {
        const open = openId === u.id, alert = (u.lossStreak || 0) >= STREAK_ALERT;
        const head = (
          <button type="button" className="v3-bt-mcard" aria-expanded={open} onClick={() => toggle(u)}>
            <UserAvatar username={u.username} telegram={u.telegram} className="v3-bt-av" />
            <span className="v3-bt-mwho"><strong>@{u.username}</strong><span className={alert ? "is-alert" : ""}>{alert ? `${u.lossStreak} ${plural(u.lossStreak, "програш", "програші", "програшів")} поспіль` : u.betCount ? `${s.bets} ${plural(s.bets, "ставка", "ставки", "ставок")} · ${Math.round(s.wr)}%` : "ще не грає"}</span><span className="v3-bt-wl"><span style={{ width: `${Math.min(100, Math.max(0, s.wr))}%` }} /></span></span>
            <span className="v3-bt-mright"><strong className={s.profit >= 0 ? (s.profit ? "is-pos-d" : "is-dim") : "is-neg-d"}>{signedMoney(s.profit)}</strong>{open && <small>Згорнути ▴</small>}</span>
          </button>
        );
        return open ? <div key={u.id} className="v3-bt-mopen">{head}{detailBody(u, s, true)}</div> : <div key={u.id}>{head}</div>;
      })}
      {rows.length > limit && <button type="button" className="v3-btn v3-btn-ghost-dark v3-btn-block" onClick={() => setLimit(limit + PAGE)}>Показати ще {Math.min(PAGE, rows.length - limit)}</button>}
    </div>
  );

  const offline = !online && (
    <div className="v3-offline-users" role="status"><WifiOff size={16} aria-hidden="true" /><span>Немає інтернету. Підсумки станом на {updatedAt || "—"}, нові ставки не підвантажаться.</span><button type="button" className="v3-btn v3-btn-ghost-dark v3-btn-sm" onClick={() => { if (navigator.onLine) load(true); else toast.info("Досі немає з’єднання"); }}>Перевірити ще раз</button></div>
  );

  return (
    <div className="v3-page v3-bets">
      <section className="v3-hero v3-hero-row">
        <div>
          <h1 className="v3-title">Ставки</h1>
          <p className="v3-subtitle"><span className="v3-hide-mobile">Записи ставок, результати й активність користувачів — за весь час.</span><span className="v3-only-mobile">{playing.length} {plural(playing.length, "користувач грає", "користувачі грають", "користувачів грають")} · за весь час</span></p>
        </div>
        {!noBetsAtAll && <button type="button" className="v3-chip v3-hide-mobile" onClick={() => load(true)} disabled={busy || !online}><RefreshCw size={14} aria-hidden="true" className={busy ? "v3-bt-rot" : undefined} />Оновити{updatedAt ? ` · ${updatedAt}` : ""}</button>}
      </section>

      {offline}

      {error && users === null ? (
        <div className="v3-dcard v3-uerror" role="alert">
          <span className="v3-uerror-ico" aria-hidden="true">!</span>
          <strong>Не вдалося завантажити ставки</strong>
          <span>Сервер не відповідає. Спробуйте ще раз за хвилину.</span>
          <div><button type="button" className="v3-btn v3-btn-blue" onClick={() => load()}>Спробувати ще раз</button></div>
        </div>
      ) : loading ? (
        <>
          <section className="v3-bt-kpis">{[0, 1, 2, 3].map((i) => <div key={i} className="v3-dcard v3-bt-kpi"><i className="v3-sk" style={{ width: "50%", height: 10 }} /><i className="v3-sk" style={{ width: "70%", height: 30, marginTop: 14 }} /></div>)}</section>
          <section className="v3-wcard v3-bt-card" role="status" aria-label="Завантаження ставок">{[55, 65, 45, 60, 50].map((w, i) => <div key={i} className="v3-bt-skrow"><i className="is-av" /><div><i style={{ width: `${w}%`, height: 10 }} /><i style={{ width: "100%", height: 5, marginTop: 9 }} /></div><i style={{ width: 64, height: 16 }} /></div>)}</section>
        </>
      ) : noBetsAtAll ? (
        <>
          <section className="v3-bt-kpis">
            <div className="v3-dcard v3-bt-kpi"><div className="l">Ставок всього</div><div className="v">0</div><div className="n">ще немає записів</div></div>
            <div className="v3-dcard v3-bt-kpi"><div className="l">Обіг</div><div className="v">0 <small>₴</small></div><div className="n">сума ставок</div></div>
            <div className="v3-dcard v3-bt-kpi"><div className="l">Загальний профіт</div><div className="v">0 <small>₴</small></div><div className="n">—</div></div>
            <div className="v3-dcard v3-bt-kpi"><div className="l">Грають</div><div className="v">0 <small>з {people.length}</small></div><div className="n">користувачів</div></div>
          </section>
          <section className="v3-users-empty">
            <div className="v3-wcard v3-ue-main">
              <div className="v3-ue-ghost" aria-hidden="true">{[40, 47, 54, 61, 68, 45].map((w, i) => <div key={i} className="v3-ue-grow"><i className="is-av" /><div><i style={{ width: `${w}%`, height: 12 }} /><i style={{ width: `${25 + (i % 4) * 5}%`, height: 9, marginTop: 8 }} /></div><i style={{ height: 12 }} /><i style={{ height: 22, borderRadius: 999 }} /></div>)}</div>
              <div className="v3-ue-over">
                <span className="v3-ue-ico" aria-hidden="true"><BarChart3 size={28} strokeWidth={1.8} /></span>
                <h2>Ставок ще немає</h2>
                <p>{people.length ? `У ${people.length} ${plural(people.length, "користувача", "користувачів", "користувачів")} є акаунт, але ніхто ще не додав запис у журнал MatchIQ.` : "Користувачів ще немає."} Щойно це станеться — тут з’являться обіг, профіт і вінрейт.</p>
                <div><Link to="/users" className="v3-btn v3-btn-primary">До користувачів</Link></div>
              </div>
            </div>
            <aside className="v3-dcard v3-ue-side v3-hide-mobile">
              <strong>Як з’являються ставки</strong>
              <ol>
                <li><span>1</span><div><b>Користувач додає запис</b><small>У застосунку MatchIQ: матч, тип ставки, коефіцієнт і сума</small></div></li>
                <li><span>2</span><div><b>Матч завершується</b><small>Результат і профіт рахуються автоматично</small></div></li>
                <li><span>3</span><div><b>Ви бачите все тут</b><small>Обіг, вінрейт, серії програшів і банк кожного користувача</small></div></li>
              </ol>
            </aside>
          </section>
        </>
      ) : (
        <>
          {wide ? (
            <section className="v3-bt-kpis">
              <div className="v3-bt-kpi is-blue"><div className="l">Ставок всього</div><div className="v">{tot.bets.toLocaleString("uk-UA")}</div><div className="n">{tot.wins.toLocaleString("uk-UA")} {plural(tot.wins, "виграш", "виграші", "виграшів")} · {tot.losses.toLocaleString("uk-UA")} {plural(tot.losses, "програш", "програші", "програшів")} · {tot.pending.toLocaleString("uk-UA")} очікує</div></div>
              <div className="v3-dcard v3-bt-kpi"><div className="l">Обіг</div><div className="v">{Math.round(tot.staked).toLocaleString("uk-UA")}<small> ₴</small></div><div className="n">сума ставок усіх користувачів</div></div>
              <div className="v3-dcard v3-bt-kpi"><div className="l">Загальний профіт</div><div className={`v ${tot.profit >= 0 ? "is-pos" : "is-neg"}`}>{signedMoney(tot.profit).replace(" ₴", "")}<small> ₴</small></div><div className="n">ROI {signedPct(roi)} · за виграшами й програшами</div></div>
              <div className="v3-dcard v3-bt-kpi"><div className="l">Грають</div><div className="v">{playing.length}<small> з {people.length}</small></div><div className="v3-bt-gtags">{gameCounts.map(([g, n]) => <span key={g} className="v3-tag v3-bt-gtag">{g} · {n}</span>)}</div></div>
            </section>
          ) : (
            <section className="v3-bt-mkpi">
              <div className="l">Ставок всього</div>
              <div className="v">{tot.bets.toLocaleString("uk-UA")}</div>
              <div className="f"><span>Обіг <b>{money(tot.staked)}</b></span><span>Профіт <b className="p">{signedMoney(tot.profit)}</b></span></div>
            </section>
          )}
          {wide ? desktopTable : mobileList}
        </>
      )}
    </div>
  );
}
