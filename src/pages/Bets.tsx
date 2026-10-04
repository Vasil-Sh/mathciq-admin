import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Users,
  ListChecks,
  Wallet,
  TrendingUp,
  Target,
  CircleDollarSign,
  ChevronRight,
  ChevronDown,
  Search,
  X,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Gamepad2,
  ShieldCheck,
  Trophy,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { parseDate } from "@/lib/adminUtils";
import { fetchUsersOverview, fetchUserBets } from "@/lib/adminBetsApi";
import type { AdminUserOverview, AdminUserBet, SortDirection } from "@/types";

const money = (n: number, signed = false) => {
  const sign = signed ? (n > 0 ? "+" : n < 0 ? "−" : "") : "";
  return `${sign}₴${Math.round(Math.abs(n)).toLocaleString("uk-UA")}`;
};

const moneyAbs = (n: number) => `₴${Math.round(n).toLocaleString("uk-UA")}`;

const pct = (n: number) => `${n.toFixed(1).replace(".", ",")}%`;

const dateLabel = (value: string) => parseDate(value)?.toLocaleDateString("uk-UA") || "—";

/** Express bets carry a long multi-leg description in `betType` (e.g. "Експрес 5x | 1. … 5. …"). */
const isExpress = (bet: AdminUserBet) =>
  bet.betType.startsWith("Експрес") || bet.match.startsWith("Експрес");

/** Short, single-line label for an express bet (the match name, e.g. "Експрес 5x"). */
const expressShortLabel = (bet: AdminUserBet) =>
  (bet.match || bet.betType.split("|")[0] || "Експрес").trim();

/** One parsed leg of an express bet. */
interface ExpressLeg {
  n: number;
  match: string;
  pick: string;
  odds: string;
}

/**
 * Parse the long `betType` of an express into structured legs.
 * Each leg looks like: "N. Team1 vs Team2 | Pick @1.14".
 * The first leg carries a leading "Експрес 5x |" prefix which we strip.
 */
function parseExpressLegs(text: string): ExpressLeg[] {
  return text
    .split("•")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s, i) => {
      const cleaned = s.replace(/^Експрес\s*\S*\s*\|\s*/, "").trim();
      const m = cleaned.match(
        /^(?:(\d+)\.\s*)?(.*?)\s*\|\s*(.*?)\s*@\s*([\d.]+)\s*$/,
      );
      if (m) {
        return {
          n: m[1] ? Number(m[1]) : i + 1,
          match: m[2].trim(),
          pick: m[3].trim(),
          odds: m[4],
        };
      }
      return { n: i + 1, match: cleaned, pick: "", odds: "" };
    });
}

type SortKey = "betCount" | "totalStaked" | "totalProfit" | "winRate" | "roi";

const SORT_LABELS: Record<SortKey, string> = {
  betCount: "Ставок",
  totalStaked: "Сума ставок",
  totalProfit: "Профіт",
  winRate: "Вінрейт",
  roi: "ROI",
};

function ResultBadge({ result }: { result: string }) {
  const map: Record<string, { label: string; variant: "active" | "expired" | "warning" | "default" }> = {
    Win: { label: "Виграш", variant: "active" },
    Loss: { label: "Програш", variant: "expired" },
    Pending: { label: "Очікує", variant: "warning" },
  };
  const v = map[result] ?? { label: result, variant: "default" as const };
  return <Badge variant={v.variant}>{v.label}</Badge>;
}

export default function Bets() {
  const [users, setUsers] = useState<AdminUserOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdate, setLastUpdate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("totalProfit");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [betsByUser, setBetsByUser] = useState<Record<number, AdminUserBet[]>>({});
  const [loadingBets, setLoadingBets] = useState<Record<number, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchUsersOverview();
      setUsers(data);
      setLastUpdate(new Date().toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }));
    } catch (e) {
      setError((e as Error).message || "Помилка завантаження даних");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Keep a ref of the currently expanded user so polling can refresh its bets too.
  const expandedIdRef = useRef<number | null>(null);
  useEffect(() => {
    expandedIdRef.current = expandedId;
  }, [expandedId]);

  // Auto-refresh every 30s so new bets (incl. pending) appear without a manual reload.
  useEffect(() => {
    const id = window.setInterval(() => {
      load();
      const current = expandedIdRef.current;
      if (current != null) {
        fetchUserBets(current)
          .then((bets) => setBetsByUser((p) => ({ ...p, [current]: bets })))
          .catch(() => {});
      }
    }, 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  const toggleExpand = async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    // Always fetch fresh bets on expand (never rely on stale cache).
    setLoadingBets((p) => ({ ...p, [id]: true }));
    try {
      const bets = await fetchUserBets(id);
      setBetsByUser((p) => ({ ...p, [id]: bets }));
    } catch {
      setBetsByUser((p) => ({ ...p, [id]: [] }));
      toast.error("Не вдалося завантажити ставки користувача");
    } finally {
      setLoadingBets((p) => ({ ...p, [id]: false }));
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = q
      ? users.filter(
          (u) =>
            u.username.toLowerCase().includes(q) ||
            (u.telegram || "").toLowerCase().includes(q),
        )
      : users;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => (a[sortKey] - b[sortKey]) * dir);
  }, [users, searchQuery, sortKey, sortDir]);

  const totals = useMemo(
    () =>
      users.reduce(
        (acc, u) => {
          acc.bets += u.betCount;
          acc.staked += u.totalStaked;
          acc.profit += u.totalProfit;
          acc.wins += u.wins;
          acc.losses += u.losses;
          acc.pending += u.pending;
          return acc;
        },
        { bets: 0, staked: 0, profit: 0, wins: 0, losses: 0, pending: 0 },
      ),
    [users],
  );

  const decided = totals.wins + totals.losses;
  const overallWinRate = decided > 0 ? (totals.wins / decided) * 100 : 0;
  const overallRoi = totals.staked > 0 ? (totals.profit / totals.staked) * 100 : 0;
  const activeBettors = users.filter((u) => u.betCount > 0).length;

  return (
    <div className="users-page bets-page">
      <div className="page-container space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="page-eyebrow">МОНІТОРИНГ СТАВОК</p>
            <h1 className="page-title">Ставки користувачів</h1>
            <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-2">
              <p className="text-xs text-muted">Що ставлять користувачі та скільки заробляють.</p>
              {lastUpdate && (
                <span className="text-xs text-subtle">· Оновлено: {lastUpdate}</span>
              )}
            </div>
          </div>
          <Button onClick={load} disabled={loading} variant="default">
            <RefreshCw className={loading ? "animate-spin" : ""} strokeWidth={1.5} />
            Оновити
          </Button>
        </div>

        {error && (
          <Alert>
            <AlertTriangle className="h-5 w-5 text-danger" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="min-h-[50vh] flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="users-summary-grid">
              {[
                { icon: ListChecks, label: "Ставок всього", value: totals.bets, note: `${totals.wins} виграш / ${totals.losses} програш${totals.pending ? ` / ${totals.pending} очікує` : ""}`, tone: "" },
                { icon: Wallet, label: "Сума ставок", value: moneyAbs(totals.staked), note: "обіг по всіх користувачах", tone: "user-summary--amber" },
                { icon: TrendingUp, label: "Загальний профіт", value: money(totals.profit, true), note: `ROI ${overallRoi.toFixed(1).replace(".", ",")}%`, tone: totals.profit >= 0 ? "user-summary--green" : "user-summary--rose" },
                { icon: Users, label: "Грають", value: activeBettors, note: `з ${users.length} користувачів`, tone: "user-summary--blue" },
              ].map(({ icon: Icon, label, value, note, tone }) => (
                <section key={label} className={`card-admin user-summary ${tone}`}>
                  <div className="user-summary-top">
                    <span className="user-summary-icon"><Icon size={19} strokeWidth={1.7} /></span>
                    <h2>{label}</h2>
                  </div>
                  <strong className="user-summary-value">{value}</strong>
                  <p className="user-summary-note"><span />{note}</p>
                </section>
              ))}
            </div>

            {/* Search + sort */}
            <div className="directory-filters">
              <div className="directory-search">
                <Search size={16} />
                <input
                  aria-label="Пошук користувачів за ставками"
                  placeholder="Знайти за логіном або Telegram"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery("")} aria-label="Очистити пошук">
                    <X size={14} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted">
                <span>Сортування:</span>
                {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleSort(key)}
                    className={`px-2.5 py-1.5 rounded-btn border transition-colors ${
                      sortKey === key
                        ? "border-primary text-primary bg-surface-subtle font-medium"
                        : "border-hairline text-body hover:border-hairline-hover"
                    }`}
                  >
                    {SORT_LABELS[key]}
                    {sortKey === key && (sortDir === "asc" ? " ↑" : " ↓")}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            <section className="card-admin user-directory" aria-label="Ставки користувачів" aria-busy={loading}>
              <div className="directory-heading">
                <div>
                  <div className="directory-title">
                    <h2>Користувачі та їхні ставки</h2>
                    <span>{filtered.length}</span>
                  </div>
                  <p>Натисніть на рядок, щоб переглянути деталі ставок</p>
                </div>
                <div className="directory-sync">
                  <span title={lastUpdate}>Оновлено {lastUpdate || "—"}</span>
                  <button type="button" onClick={load} disabled={loading} aria-label="Оновити ставки" title="Оновити">
                    <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                  </button>
                </div>
              </div>

              <div className="directory-table-scroll" tabIndex={0} role="region" aria-label="Таблиця ставок користувачів">
                <table className="directory-table bets-table">
                  <thead>
                    <tr>
                      <th scope="col" />
                      <th scope="col">Користувач</th>
                      <th scope="col"><button type="button" onClick={() => handleSort("betCount")}>Ставки{sortKey === "betCount" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}</button></th>
                      <th scope="col"><button type="button" onClick={() => handleSort("totalStaked")}>Сума ставок{sortKey === "totalStaked" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}</button></th>
                      <th scope="col"><button type="button" onClick={() => handleSort("totalProfit")}>Профіт{sortKey === "totalProfit" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}</button></th>
                      <th scope="col"><button type="button" onClick={() => handleSort("winRate")}>Вінрейт{sortKey === "winRate" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}</button></th>
                      <th scope="col"><button type="button" onClick={() => handleSort("roi")}>ROI{sortKey === "roi" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}</button></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length ? (
                      filtered.map((u) => {
                        const expanded = expandedId === u.id;
                        return (
                          <BetsRow
                            key={u.id}
                            user={u}
                            expanded={expanded}
                            onToggle={() => toggleExpand(u.id)}
                            bets={betsByUser[u.id]}
                            loadingBets={!!loadingBets[u.id]}
                          />
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={7}>
                          <div className="directory-empty">
                            <Trophy size={29} />
                            <h3>Ставок не знайдено</h3>
                            <p>Спробуйте інший запит або дочекайтесь перших ставок користувачів.</p>
                            {searchQuery && <button onClick={() => setSearchQuery("")}>Скинути пошук</button>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function BetsRow({
  user,
  expanded,
  onToggle,
  bets,
  loadingBets,
}: {
  user: AdminUserOverview;
  expanded: boolean;
  onToggle: () => void;
  bets?: AdminUserBet[];
  loadingBets: boolean;
}) {
  const [expressBet, setExpressBet] = useState<AdminUserBet | null>(null);
  return (
    <>
      <tr className="bets-row" onClick={onToggle}>
        <td>
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </td>
        <td>
          <div className="directory-person">
            <span className={`directory-avatar ${user.role === "admin" ? "is-admin" : ""}`}>
              {user.username.charAt(0).toUpperCase()}
            </span>
            <div>
              <strong title={user.username}>
                {user.username}
                {user.role === "admin" && <ShieldCheck size={12} className="inline-block ml-1 text-primary align-middle" />}
              </strong>
              <span>{user.telegram || "Telegram не вказано"}</span>
            </div>
          </div>
        </td>
        <td className="bets-cell-center">{user.betCount}</td>
        <td className="bets-cell-center">{user.totalStaked > 0 ? moneyAbs(user.totalStaked) : "—"}</td>
        <td className="bets-cell-center">
          <span className={`bets-profit ${user.totalProfit > 0 ? "is-positive" : user.totalProfit < 0 ? "is-negative" : ""}`}>
            {money(user.totalProfit, true)}
          </span>
        </td>
        <td className="bets-cell-center">
          <div className="bets-winrate">{pct(user.winRate)}</div>
          <div className="bets-winrate-sub">{user.wins}W / {user.losses}L</div>
        </td>
        <td className="bets-cell-center">
          <span className={`bets-profit ${user.roi > 0 ? "is-positive" : user.roi < 0 ? "is-negative" : ""}`}>
            {user.roi > 0 ? "+" : ""}{pct(user.roi)}
          </span>
        </td>
      </tr>

      {expanded && (
        <tr className="bets-expanded">
          <td colSpan={7}>
            <div className="bets-expanded-inner">
              {/* Mini stats */}
              <div className="bets-mini-grid">
                <MiniStat icon={<Wallet size={14} />} label="Стартовий банк" value={moneyAbs(user.initialBank)} />
                <MiniStat icon={<CircleDollarSign size={14} />} label="Поточний банк" value={moneyAbs(user.currentBank)} />
                <MiniStat icon={<Target size={14} />} label="ROI" value={pct(user.roi)} />
                <MiniStat icon={<Gamepad2 size={14} />} label="Очікують" value={String(user.pending)} />
              </div>
              {loadingBets ? (
                <div className="bets-loading">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Завантаження ставок…
                </div>
              ) : bets && bets.length > 0 ? (
                <div className="bets-subtable-scroll">
                  <table className="bets-subtable">
                    <thead>
                      <tr>
                        <th>Дата</th>
                        <th>Матч</th>
                        <th>Тип</th>
                        <th>Коеф.</th>
                        <th>Сума</th>
                        <th>Статус</th>
                        <th>Профіт</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bets.map((b) => (
                        <tr key={b.id}>
                          <td>{dateLabel(b.date)}</td>
                          <td className="bets-match-cell" title={b.match || `${b.team1 || "—"} vs ${b.team2 || "—"}`}>
                            <span className="bets-match-text">
                              {b.match || `${b.team1 || "—"} vs ${b.team2 || "—"}`}
                            </span>
                            {b.game && <span className="bets-game">{b.game}</span>}
                          </td>
                          <td className="bets-type-cell" title={isExpress(b) ? undefined : b.betType}>
                            {isExpress(b) ? (
                              <button
                                type="button"
                                className="bets-express-chip"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpressBet(b);
                                }}
                              >
                                <Layers size={12} />
                                <span className="bets-type-text">{expressShortLabel(b)}</span>
                              </button>
                            ) : (
                              <span className="bets-type-text">{b.betType}</span>
                            )}
                          </td>
                          <td>{Number(b.odds).toFixed(2)}</td>
                          <td>{moneyAbs(b.amount)}</td>
                          <td><ResultBadge result={b.result} /></td>
                          <td>
                            <span className={`bets-profit ${b.profit > 0 ? "is-positive" : b.profit < 0 ? "is-negative" : ""}`}>
                              {money(b.profit, true)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="bets-loading">
                  <Trophy size={14} />
                  У цього користувача ще немає ставок
                </div>
              )}
            </div>
          </td>
        </tr>
      )}

      <Dialog open={!!expressBet} onOpenChange={(open) => !open && setExpressBet(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              {expressBet ? expressShortLabel(expressBet) : ""}
            </DialogTitle>
            <DialogDescription>
              {expressBet?.game ? `${expressBet.game} · ` : ""}
              Коефіцієнт {expressBet ? Number(expressBet.odds).toFixed(2) : ""}
            </DialogDescription>
          </DialogHeader>
          {expressBet && (
            <>
              <div className="bets-express-meta">
                <span className="bets-express-odds">
                  Коеф. {Number(expressBet.odds).toFixed(2)}
                </span>
                <ResultBadge result={expressBet.result} />
                <span className="bets-express-stake">
                  Ставка {moneyAbs(expressBet.amount)}
                </span>
              </div>
              <div className="bets-express-detail">
                <div className="bets-express-grid">
                  <div className="bets-express-grid-head">
                    <span>#</span>
                    <span>Матч</span>
                    <span>Вибір</span>
                    <span>Коеф.</span>
                  </div>
                  {parseExpressLegs(expressBet.betType).map((leg) => (
                    <div key={leg.n} className="bets-express-grid-row">
                      <span className="bets-express-leg-num">{leg.n}</span>
                      <div className="bets-express-leg-match">{leg.match}</div>
                      <div className="bets-express-leg-pick">{leg.pick || "—"}</div>
                      <span className="bets-express-leg-odds">{leg.odds ? `@${leg.odds}` : "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bets-mini-stat">
      <div className="bets-mini-label">
        {icon}
        {label}
      </div>
      <strong>{value}</strong>
    </div>
  );
}
