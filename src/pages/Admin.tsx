import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowDown, ArrowRight, Check, Send, ChevronLeft, ChevronRight, Download, Plus, Search, SearchX, UserPlus, WifiOff, X, ArrowUp } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import UserCardPanel from "@/components/users/UserCardPanel";
import UserAvatar from "@/components/UserAvatar";
import UndoRing from "@/components/UndoRing";
import RollingNumber from "@/components/RollingNumber";
import ExtendConfirmDialog from "@/components/ExtendConfirmDialog";
import UserFormDialog, { type UserForm } from "@/components/users/UserFormDialog";
import SelfLimitationsTab from "@/components/users/SelfLimitationsTab";
import { DeleteUserDialog, PasswordDialog } from "@/components/users/UserActionDialogs";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Dropdown } from "@/components/ui/dropdown";
import { extendedEndDate, shortDate } from "@/lib/subscriptions";
import { canResetPassword, deleteBlockReason, roleLockReason } from "@/lib/permissions";
import { useAuth } from "@/contexts/AuthContext";
import { useSessionFilter } from "@/hooks/useSessionFilter";
import { authService } from "@/lib/authService";
import { api } from "@/lib/apiClient";
import { fetchUsersOverview } from "@/lib/adminBetsApi";
import { fetchSettings } from "@/lib/adminSettingsApi";
import { fetchAdminStats } from "@/lib/adminStatsApi";
import { downloadCsv } from "@/lib/csv";
import { plural } from "@/lib/dashboardInsights";
import { canQuickExtend, daysLeft, isAdmin, matches, nextCell, planCell, STATUS_UI, statusOf, type UFilter, tagOf, isExpiring } from "@/lib/usersModel";
import type { AdminUserOverview, AppSettings } from "@/types";
import PillTrack from "@/components/PillTrack";
import ExportCsvButton from "@/components/ExportCsvButton";

const PAGE_SIZE = 10;
type Sort = "new" | "name";
const FILTERS: UFilter[] = ["all", "paid", "trial", "basic", "pro", "ended", "cancelled", "closed", "expiring"];
const SORTS: Sort[] = ["new", "name"];

/** The matched part of a login in yellow (catalog · Inputs · search highlight). */
function hl(text: string, q: string): ReactNode {
  const s = q.trim().toLowerCase().replace(/^@/, "");
  const i = s ? text.toLowerCase().indexOf(s) : -1;
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark className="v3-hl">{text.slice(i, i + s.length)}</mark>{text.slice(i + s.length)}</>;
}

function useMedia(q: string) {
  const [m, setM] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => { const mm = window.matchMedia(q); const f = () => setM(mm.matches); mm.addEventListener("change", f); return () => mm.removeEventListener("change", f); }, [q]);
  return m;
}
function useOnline() {
  const [on, setOn] = useState(() => navigator.onLine);
  useEffect(() => { const a = () => setOn(true), b = () => setOn(false); window.addEventListener("online", a); window.addEventListener("offline", b); return () => { window.removeEventListener("online", a); window.removeEventListener("offline", b); }; }, []);
  return on;
}

export default function Admin() {
  const [urlParams, setUrlParams] = useSearchParams();
  const { user: me } = useAuth();
  const wide = useMedia("(min-width: 1180px)");
  const xwide = useMedia("(min-width: 1600px)");
  const online = useOnline();
  const [users, setUsers] = useState<AdminUserOverview[] | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [convPct, setConvPct] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");
  const [tab, setTab] = useState<"users" | "excl">(urlParams.get("tab") === "excl" ? "excl" : "users");
  const [exclCount, setExclCount] = useState<number | null>(null);
  const [filter, setFilter] = useSessionFilter<UFilter>("users.filter", "all", FILTERS);
  const [ageOnly, setAgeOnly] = useState(false);
  const [q, setQ] = useSessionFilter<string>("users.search", "");
  const [sort, setSort] = useSessionFilter<Sort>("users.sort3", "new", SORTS);
  const [page, setPage] = useState(1);
  const [mobileShown, setMobileShown] = useState(PAGE_SIZE);
  const [showErr, setShowErr] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [rowConfirm, setRowConfirm] = useState<number | null>(null);
  const [extendFor, setExtendFor] = useState<AdminUserOverview | null>(null);
  const [form, setForm] = useState<null | { mode: "create" } | { mode: "edit"; user: AdminUserOverview }>(null);
  const [password, setPassword] = useState<{ username: string; password: string; meta: string; title?: string } | null>(null);
  const [deleting, setDeleting] = useState<AdminUserOverview | null>(null);
  const [resetting, setResetting] = useState<AdminUserOverview | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [newId, setNewId] = useState<number | null>(null);
  const [leavingId, setLeavingId] = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [pull, setPull] = useState(0);
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pressId, setPressId] = useState<number | null>(null);
  const [menuId, setMenuId] = useState<number | null>(null);
  const touch = useRef<{ y: number; x: number; t: number | null; moved: boolean; long: boolean }>({ y: 0, x: 0, t: null, moved: false, long: false });
  const rowEls = useRef(new Map<number, HTMLElement>());
  const prevTops = useRef(new Map<number, number>());
  const sortMoved = useRef(false);
  const extendDays = settings?.subscriptionDays || 30;

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const list = await fetchUsersOverview();
      setUsers(list);
      setUpdatedAt(new Date().toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }));
    } catch (e) { setError((e as Error).message || "помилка з’єднання"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetchSettings().then(setSettings).catch(() => {}); }, []);
  useEffect(() => { fetchAdminStats().then((s) => { const c = s.conversion?.last30; if (c && c.trialEnded) setConvPct(Math.round((c.converted / c.trialEnded) * 100)); }).catch(() => {}); }, []);
  useEffect(() => { // self-limitation count for the tab badge without opening it
    api.get<{ requests: { status: string; until: string | null }[] }>("/admin/self-limitations")
      .then((r) => setExclCount(r.requests.filter((x) => x.status === "applied" && x.until && Date.parse(x.until) > Date.now()).length)).catch(() => {});
  }, []);
  // Links from other screens: ?q=, ?status=expired|active
  useEffect(() => {
    const qq = urlParams.get("q"); if (qq) { setQ(qq); setTab("users"); }
    const s = urlParams.get("status"); if (s === "expiring") { setFilter("expiring"); setTab("users"); } else if (s === "expired") setFilter("closed"); else if (s === "active") setFilter("paid");
  }, [urlParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const all = users || [];
  const counts = useMemo(() => {
    const c: Record<UFilter, number> = { all: 0, paid: 0, trial: 0, basic: 0, pro: 0, ended: 0, cancelled: 0, closed: 0, expiring: 0 };
    for (const u of all) for (const f of FILTERS) if (matches(u, f)) c[f]++;
    return c;
  }, [all]);
  const admins = all.filter(isAdmin).length;
  const noAge = all.filter((u) => !isAdmin(u) && !u.ageConfirmed).length;
  const month = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit" }).format(new Date());
  const cancelledThisMonth = all.filter((u) => (u.subscriptionCancelledAt || u.cancelledAt || "").slice(0, 7) === month).length;
  const paidBasic = all.filter((u) => matches(u, "paid") && u.plan === "basic").length;
  const paidPro = counts.paid - paidBasic;
  // «Зміна до попереднього періоду» (каталог · Метрики 06): this month vs the previous one
  const prevMonth = (() => { const [y, m] = month.split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; })();
  const monthStart = `${month}-01`;
  const mk = (v?: string) => (v || "").slice(0, 7);
  const users0 = all.filter((u) => !isAdmin(u));
  const isTrialStart = (u: AdminUserOverview) => u.plan === "trial" || !!u.trialEndDate;
  const pctOf = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);
  const deltas: Partial<Record<UFilter, { d: number | null }>> = {
    all: { d: pctOf(all.length, all.filter((u) => (u.createdAt || "") < monthStart).length) },
    paid: { d: pctOf(counts.paid, users0.filter((u) => (u.plan === "basic" || u.plan === "pro") && (u.createdAt || "") < monthStart && (u.endDate || "") >= monthStart).length) },
    trial: { d: pctOf(users0.filter((u) => isTrialStart(u) && mk(u.createdAt) === month).length, users0.filter((u) => isTrialStart(u) && mk(u.createdAt) === prevMonth).length) },
    closed: { d: pctOf(cancelledThisMonth, all.filter((u) => mk(u.subscriptionCancelledAt || u.cancelledAt) === prevMonth).length) },
  };
  const prevMonthGen = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"][Number(prevMonth.slice(5)) - 1];

  const list = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/^@/, "");
    let r = all.filter((u) => matches(u, filter));
    if (ageOnly) r = r.filter((u) => !isAdmin(u) && !u.ageConfirmed);
    if (s) r = r.filter((u) => u.username.toLowerCase().includes(s) || (u.telegram || "").toLowerCase().includes(s));
    const by: Record<Sort, (a: AdminUserOverview, b: AdminUserOverview) => number> = {
      new: (a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""),
      name: (a, b) => a.username.localeCompare(b.username),
    };
    return [...r].sort(by[sort]);
  }, [all, filter, ageOnly, q, sort]);
  useEffect(() => { setPage(1); setMobileShown(PAGE_SIZE); }, [filter, ageOnly, q, sort]);
  useEffect(() => { sortMoved.current = true; }, [sort]);
  // Rows glide to their new place when the order changes (catalog · Data · sorting).
  useLayoutEffect(() => {
    const still = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<number, number>();
    rowEls.current.forEach((el, id) => {
      if (!el.isConnected) return;
      const top = el.getBoundingClientRect().top;
      const prev = prevTops.current.get(id);
      if (sortMoved.current && !still && prev !== undefined && Math.abs(prev - top) > 1) el.animate([{ transform: `translateY(${prev - top}px)` }, { transform: "none" }], { duration: 450, easing: "cubic-bezier(.2,.9,.25,1)" });
      next.set(id, top);
    });
    prevTops.current = next; sortMoved.current = false;
  });
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  useEffect(() => { if (page > pages) setPage(pages); }, [page, pages]);
  const paged = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selected = all.find((u) => u.id === selectedId) || paged[0] || null;

  const openCard = (u: AdminUserOverview) => { setSelectedId(u.id); setRowConfirm(null); if (!wide) setSheetOpen(true); };

  async function extend(u: AdminUserOverview) {
    const prev = u.endDate;
    const next = extendedEndDate(u.endDate, extendDays);
    try {
      await authService.updateUser(u.id, { endDate: next });
      await load();
      toast.success(`Підписку продовжено до ${next.split("-").reverse().slice(0, 2).join(".")}`, {
        description: `@${u.username} · +${extendDays} днів`, duration: 10_000, className: "v3-toast-10s",
        action: { label: <UndoRing />, onClick: async () => { try { await authService.updateUser(u.id, { endDate: prev }); toast.info("Продовження скасовано", { description: "Дата повернулась як була" }); } catch (e) { toast.error((e as Error).message); } load(); } },
      });
    } catch (e) {
      toast.error("Продовження не збережено", { description: navigator.onLine ? `@${u.username}: ${(e as Error).message}` : "Немає з’єднання. Спробуйте ще раз.", action: { label: "Повторити", onClick: () => extend(u) } });
    } finally { setRowConfirm(null); setExtendFor(null); }
  }

  const [saving, setSaving] = useState(false);
  async function saveForm(f: UserForm) {
    if (!form) return;
    setSaving(true);
    const plan = f.role === "user" ? f.plan : undefined;
    const price = plan === "pro" ? settings?.proPrice || 600 : plan === "basic" ? settings?.basicPrice || 300 : 0;
    try {
      if (form.mode === "create") {
        if (all.some((u) => u.username.toLowerCase() === f.username.toLowerCase())) { toast.error("Логін уже зайнятий", { description: `@${f.username} вже є — оберіть інший логін` }); return; }
        const r = await authService.createUser({ username: f.username, telegram: f.telegram, role: f.role === "user" ? "user" : "admin", priceMonth: f.role === "user" ? String(price) : "0", startDate: f.role === "user" ? f.startDate : "", endDate: f.role === "user" ? f.endDate : "", plan, trialEndDate: plan === "trial" ? f.endDate : undefined });
        if (f.role === "owner" && r.userId) await authService.updateUser(r.userId, { isOwner: true } as never);
        setForm(null);
        if (r.userId) { setNewId(r.userId); window.setTimeout(() => setNewId(null), 2200); }
        setPassword({ username: r.username, password: r.password, meta: `${f.role === "owner" ? "Овнер" : f.role === "admin" ? "Адміністратор" : "Користувач"}${f.role === "user" && f.endDate ? ` · до ${shortDate(f.endDate)}` : ""}` });
        const planTxt = f.role !== "user" ? (f.role === "owner" ? "Овнер" : "Адміністратор") : plan === "trial" ? `План ${settings?.trialPlan === "basic" ? "Базова" : "Pro"} · пробний ${settings?.trialDays || 7} днів` : `План ${plan === "pro" ? "Pro" : "Базова"}`;
        toast.success(`@${r.username} створено`, {
          description: `${planTxt}${f.role === "user" && f.endDate ? ` · до ${f.endDate.split("-").reverse().slice(0, 2).join(".")}` : ""}`,
          action: r.userId ? { label: "Відкрити", onClick: () => { setTab("users"); setSelectedId(r.userId!); if (!wide) setSheetOpen(true); } } : undefined,
        });
      } else {
        const u = form.user;
        const patch: Record<string, unknown> = { username: f.username, telegram: f.telegram };
        if (!roleLockReason(me, { username: u.username, isAdmin: isAdmin(u), isOwner: u.isOwner })) {
          patch.role = f.role === "user" ? "user" : "admin";
          if (me?.isOwner) patch.isOwner = f.role === "owner";
        }
        if (f.role === "user") {
          Object.assign(patch, { startDate: f.startDate, endDate: f.endDate, birthDate: f.birthDate || undefined, ageConfirmed: f.ageConfirmed });
          if (!u.proUntil && plan && plan !== u.plan) Object.assign(patch, { plan, priceMonth: price, ...(plan === "trial" ? { trialEndDate: f.endDate } : {}) });
        }
        await authService.updateUser(u.id, patch as never);
        setForm(null);
        toast.success("Дані оновлено", { description: `@${f.username}` });
      }
      await load();
    } catch (e) { toast.error((e as Error).message || "Помилка"); }
    finally { setSaving(false); }
  }

  const [busyDelete, setBusyDelete] = useState(false);
  async function doDelete() {
    if (!deleting) return;
    setBusyDelete(true);
    try { await authService.deleteUser(deleting.id); toast.success(`@${deleting.username} видалено`, { description: "Ставки й оплати залишились у журналі дій." }); const gone = deleting.id; setDeleting(null); setSheetOpen(false); setLeavingId(gone); await new Promise((r) => window.setTimeout(r, 360)); setLeavingId(null); setSelectedId(null); await load(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusyDelete(false); }
  }
  async function doReset() {
    if (!resetting) return;
    try { const r = await authService.resetPassword(resetting.id); setResetting(null); setPassword({ username: r.username, password: r.password, meta: "новий пароль", title: "Пароль скинуто" }); }
    catch (e) { toast.error((e as Error).message); }
  }

  const exportCsv = () => downloadCsv("users.csv", ["Логін", "Telegram", "Роль", "План", "Ціна", "Підписка з", "Підписка до", "Статус", "Сплачено", "Вік підтверджено"],
    list.map((u) => { const p = planCell(u, settings); return [u.username, u.telegram || "", u.isOwner ? "Овнер" : isAdmin(u) ? "Адміністратор" : "Користувач", p.plan, p.price, u.startDate || "", u.endDate || "", STATUS_UI[statusOf(u)].label, String(u.paidTotal || 0), u.ageConfirmed ? "так" : "ні"]; }));

  const sums: { key: UFilter; label: string; value: number; note: string }[] = [
    { key: "all", label: "Усі облікові записи", value: all.length, note: `з них ${admins} ${plural(admins, "адміністратор", "адміністратори", "адміністраторів")}` },
    { key: "paid", label: "Платні · Базова і Pro", value: counts.paid, note: `Базова ${paidBasic} · Pro ${paidPro}` },
    { key: "trial", label: "На пробному періоді", value: counts.trial, note: convPct === null ? "конверсію порахуємо після перших пробних" : `у платний переходять ${convPct}%` },
    { key: "closed", label: "Закінчилась або скасована", value: counts.closed, note: `скасовано за місяць: ${cancelledThisMonth}` },
  ];
  const segs: { key: UFilter; label: string; short: string }[] = [
    { key: "all", label: "Усі", short: "Усі" }, { key: "trial", label: "Пробний", short: "Пробний" }, { key: "basic", label: "Базова", short: "Базова" },
    { key: "pro", label: "Pro", short: "Pro" }, { key: "ended", label: "Закінчилась", short: "Закінчилась" }, { key: "cancelled", label: "Скасована", short: "Скасована" },
  ];
  const emptyPlatform = users !== null && all.filter((u) => !isAdmin(u)).length === 0;
  const filtered = !!q.trim() || filter !== "all" || ageOnly;
  const resetFilters = () => { setQ(""); setFilter("all"); setAgeOnly(false); };
  const ro = (u: AdminUserOverview) => ({ username: u.username, isAdmin: isAdmin(u), isOwner: u.isOwner });

  const card = selected && (
    <UserCardPanel key={selected.id} user={selected} settings={settings} extendDays={extendDays} online={online}
      deleteReason={deleteBlockReason(me, ro(selected))}
      resetReason={canResetPassword(me, ro(selected)) ? null : "Скидати пароль адміністратора може лише овнер"}
      onEdit={() => setForm({ mode: "edit", user: selected })} onDelete={() => setDeleting(selected)} onResetPassword={() => setResetting(selected)}
      onExtend={() => setExtendFor(selected)} onChanged={load} onClose={wide ? undefined : () => setSheetOpen(false)} />
  );

  const pickable = paged.filter((u) => !isAdmin(u));
  const allPicked = pickable.length > 0 && pickable.every((u) => picked.has(u.id));
  const togglePick = (id: number) => setPicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(pickable.map((u) => u.id)));
  const pickedUsers = all.filter((u) => picked.has(u.id));
  async function extendPicked() {
    const targets = pickedUsers.filter((u) => canQuickExtend(u));
    if (!targets.length) { toast.info("Немає кого продовжувати", { description: "Серед вибраних немає активних підписок." }); return; }
    setBulkBusy(true);
    const prev = targets.map((u) => ({ id: u.id, endDate: u.endDate }));
    let ok = 0;
    for (const u of targets) { try { await authService.updateUser(u.id, { endDate: extendedEndDate(u.endDate, extendDays) }); ok++; } catch { /* counted below */ } }
    setBulkBusy(false); setPicked(new Set()); await load();
    toast.success(`Продовжено ${ok} ${plural(ok, "підписку", "підписки", "підписок")} на ${extendDays} днів`, {
      description: ok < targets.length ? `Не вдалося: ${targets.length - ok}` : targets.map((u) => `@${u.username}`).join(", "), duration: 10_000, className: "v3-toast-10s",
      action: { label: <UndoRing />, onClick: async () => { for (const x of prev) { try { await authService.updateUser(x.id, { endDate: x.endDate }); } catch { /* ignore */ } } await load(); toast.info("Продовження скасовано", { description: "Дати повернулись як були" }); } },
    });
  }
  // «Найближча оплата» живе в Оплатах (блок «Очікуються оплати»); тут — лише за логіном або нові спочатку.
  const sortHead = (label: string, key: "name") => {
    const on = sort === key;
    const desc = false;
    return (
      <span role="columnheader" aria-sort={on ? (desc ? "descending" : "ascending") : "none"}>
        <button type="button" className={`v3-sorth${on ? " is-on" : ""}`} onClick={() => setSort(sort === "name" ? "new" : "name")}>
          {label}<ArrowDown size={13} strokeWidth={2.4} className={`v3-sorth-ar${desc ? " is-up" : ""}`} aria-hidden="true" />
        </button>
      </span>
    );
  };

  const rows = (
    <div className={`v3-urows${xwide ? " is-xwide" : ""}`} role="table" aria-label="Користувачі">
      <div className="v3-uth" role="row"><span role="columnheader" className="v3-uth-who" aria-sort={sort === "name" ? "ascending" : "none"}><button type="button" role="checkbox" aria-checked={allPicked} aria-label="Вибрати всіх на сторінці" className={`v3-ckb${allPicked ? " is-on" : ""}`} disabled={!pickable.length} onClick={toggleAll}><Check size={12} strokeWidth={3.4} aria-hidden="true" /></button>{sortHead("Користувач", "name").props.children}</span><span role="columnheader">План</span><span role="columnheader">Наступна оплата</span>{xwide && <><span role="columnheader">Сплачено</span><span role="columnheader">AI сьогодні</span></>}<span role="columnheader">Статус</span><span role="columnheader" className="v3-r">Швидка дія</span></div>
      {users === null && loading ? Array.from({ length: 6 }, (_, i) => <div key={i} className="v3-urow is-skel" aria-hidden="true"><span className="v3-uwho"><span className="v3-skel v3-skel-light v3-skel-av" /><span className="v3-skel v3-skel-light" style={{ width: 140 }} /></span><span className="v3-skel v3-skel-light" style={{ width: 70 }} /><span className="v3-skel v3-skel-light" style={{ width: 110 }} /><span className="v3-skel v3-skel-light" style={{ width: 80 }} /><span /></div>)
        : paged.length ? paged.map((u) => {
          const st = statusOf(u), ui = tagOf(u), p = planCell(u, settings), n = nextCell(u), sel = wide && selected?.id === u.id;
          return (
            <div key={u.id} className="v3-urow-wrap">
              <div role="row" ref={(el) => { if (el) rowEls.current.set(u.id, el); else rowEls.current.delete(u.id); }} className={`v3-urow${sel ? " is-sel" : ""}${picked.has(u.id) ? " is-picked" : ""}${newId === u.id ? " is-new" : ""}${leavingId === u.id ? " is-leaving" : ""}`}>
                <button type="button" className="v3-urow-open" tabIndex={-1} aria-hidden="true" onClick={() => openCard(u)} />
                <span role="cell" className="v3-uwho">{isAdmin(u) ? <span className="v3-ckb-gap" aria-hidden="true" /> : <button type="button" role="checkbox" aria-checked={picked.has(u.id)} aria-label={`Вибрати @${u.username}`} className={`v3-ckb${picked.has(u.id) ? " is-on" : ""}`} onClick={() => togglePick(u.id)}><Check size={12} strokeWidth={3.4} aria-hidden="true" /></button>}<UserAvatar username={u.username} telegram={u.telegram} /><span className="v3-uname"><button type="button" onClick={(e) => { e.stopPropagation(); openCard(u); }}>@{hl(u.username, q)}{!isAdmin(u) && !u.ageConfirmed && <span className="v3-tag v3-tag-age">21+ ?</span>}</button><small>{u.telegram ? `t.me/${u.telegram.replace(/^@/, "").replace(/^https?:\/\/t\.me\//, "")}` : "Telegram не вказано"}{u.isOwner ? " · Овнер" : ""}</small></span></span>
                <span role="cell" className="v3-uplan"><strong>{p.plan}</strong><small>{p.price}</small></span>
                <span role="cell" className={`v3-unext ${n.cls}`}>{n.text}</span>
                {xwide && <><span role="cell" className="v3-upaid">{isAdmin(u) ? "—" : `${(u.paidTotal || 0).toLocaleString("uk-UA")} ₴`}</span><span role="cell" className="v3-muted">{isAdmin(u) ? "—" : settings?.aiDailyLimit ? `${u.aiToday || 0} з ${settings.aiDailyLimit}` : u.aiToday || 0}</span></>}
                <span role="cell"><span className={`v3-tag ${ui.cls}`}>{ui.label}</span></span>
                <span role="cell" className="v3-uact">{canQuickExtend(u) && <button type="button" className="v3-ext" disabled={!online} title={online ? `Продовжити підписку на ${extendDays} днів` : "Запрацює після відновлення зв’язку"} onClick={(e) => { e.stopPropagation(); setRowConfirm(rowConfirm === u.id ? null : u.id); }} aria-expanded={rowConfirm === u.id}>+{extendDays} днів</button>}</span>
              </div>
              {rowConfirm === u.id && (
                <div className="v3-pop" role="dialog" aria-label={`Продовжити ${u.username}`}>
                  <strong>Продовжити @{u.username} на {extendDays} днів?</strong>
                  <span>до {shortDate(u.endDate) || "—"} → <b>{shortDate(extendedEndDate(u.endDate, extendDays))}</b> Без запису оплати — якщо гроші прийшли, краще «Додати оплату» в картці.</span>
                  <div><button type="button" className="v3-btn v3-btn-ghost v3-btn-sm" onClick={() => setRowConfirm(null)}>Скасувати</button><button type="button" className="v3-btn v3-btn-blue v3-btn-sm" autoFocus onClick={() => extend(u)}>Продовжити</button></div>
                </div>
              )}
            </div>
          );
        }) : emptyState()}
    </div>
  );

  function emptyState() {
    if (emptyPlatform) return <div className="v3-uempty"><span className="v3-empty-halo" aria-hidden="true"><span className="v3-uempty-ico is-outline v3-empty-float"><UserPlus size={22} /></span></span><strong>Додайте першого користувача</strong><span>Тут будуть облікові записи, підписки й оплати. Поки є лише {admins === 1 ? "ваш акаунт" : "акаунти адміністраторів"}.</span><button type="button" className="v3-btn v3-btn-blue" onClick={() => setForm({ mode: "create" })}>Створити користувача</button></div>;
    const segLabel = segs.find((s) => s.key === filter)?.label.toLowerCase() || sums.find((s) => s.key === filter)?.label.toLowerCase();
    return <div className="v3-uempty"><span className="v3-empty-halo" aria-hidden="true"><span className="v3-uempty-ico v3-empty-float"><SearchX size={22} /></span></span><strong>Нікого не знайдено</strong><span>{q.trim() ? `За запитом «${q.trim()}»${filter !== "all" ? ` серед «${segLabel}»` : ""} немає збігів. Спробуйте інший логін${filter !== "all" || ageOnly ? " або шукайте серед усіх" : ""}.` : "У цьому фільтрі нікого немає."}</span><div className="v3-uempty-acts">{q.trim() && <button type="button" className="v3-btn v3-btn-ghost" onClick={() => setQ("")}>Очистити пошук</button>}{(filter !== "all" || ageOnly) && <button type="button" className="v3-btn v3-btn-blue" onClick={() => { setFilter("all"); setAgeOnly(false); }}>Шукати серед усіх</button>}</div></div>;
  }

  // Phone: pull the list down to refresh (catalog · Mobile · refresh) and hold a card for its menu (catalog · Mobile · long press).
  const onListTouchStart = (e: React.TouchEvent) => { const t = e.touches[0]; touch.current = { ...touch.current, y: t.clientY, x: t.clientX, moved: false }; };
  const onListTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0], dy = t.clientY - touch.current.y, dx = t.clientX - touch.current.x;
    if (Math.abs(dy) > 8 || Math.abs(dx) > 8) { touch.current.moved = true; if (touch.current.t) { window.clearTimeout(touch.current.t); touch.current.t = null; setPressId(null); } }
    if (window.scrollY <= 0 && dy > 0 && !refreshing && Math.abs(dy) > Math.abs(dx)) { setPulling(true); setPull(Math.min(110, dy * 0.5)); }
  };
  const onListTouchEnd = async () => {
    if (!pulling) return;
    setPulling(false);
    if (pull < 60) { setPull(0); return; }
    setPull(56); setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); setPull(0); }
  };
  const pressStart = (id: number) => { touch.current.long = false; setPressId(id); touch.current.t = window.setTimeout(() => { touch.current.long = true; touch.current.t = null; setPressId(null); setMenuId(id); if (navigator.vibrate) navigator.vibrate(10); }, 500); };
  const pressEnd = () => { if (touch.current.t) { window.clearTimeout(touch.current.t); touch.current.t = null; } setPressId(null); };
  const menuUser = all.find((u) => u.id === menuId) || null;

  const mobileList = (
    <div className="v3-umobile">
      <label className="v3-msearch"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Пошук користувачів" placeholder="Логін або Telegram" value={q} onChange={(e) => setQ(e.target.value)} />{q && <button type="button" onClick={() => setQ("")} aria-label="Очистити пошук"><X size={14} /></button>}</label>
      <div className={`v3-mfilters${counts.expiring > 0 ? " has-exp" : ""}`}>
        <Dropdown className="v3-mselect-dd" ariaLabel="План" prefix="План:" value={filter} onChange={(v) => setFilter(v as UFilter)} options={[...segs.map((s) => ({ value: s.key as UFilter, label: `${s.label} · ${counts[s.key]}` })), ...(filter === "paid" ? [{ value: "paid" as UFilter, label: `Платні · ${counts.paid}` }] : []), ...(filter === "closed" ? [{ value: "closed" as UFilter, label: `Закінчилась або скасована · ${counts.closed}` }] : []), ...(filter === "expiring" ? [{ value: "expiring" as UFilter, label: `Закінчуються · ${counts.expiring}` }] : [])]} />
        {counts.expiring > 0 && <button type="button" className={`v3-fchip${filter === "expiring" ? " is-on" : ""}`} aria-pressed={filter === "expiring"} onClick={() => setFilter(filter === "expiring" ? "all" : "expiring")}><span className="v3-fchip-n is-exp">{counts.expiring}</span>Закінчуються{filter === "expiring" && <X size={14} className="v3-fchip-x" aria-hidden="true" />}</button>}
        {noAge > 0 && <button type="button" className={`v3-fchip${ageOnly ? " is-on" : ""}`} aria-pressed={ageOnly} aria-label={`Вік не підтверджено: ${noAge}`} onClick={() => setAgeOnly(!ageOnly)}><span className="v3-fchip-n is-age">{noAge}</span>Вік ?{ageOnly && <X size={14} className="v3-fchip-x" aria-hidden="true" />}</button>}
      </div>
      <div className="v3-mmeta"><Dropdown className="is-link" ariaLabel="Сортування" value={sort} onChange={(v) => setSort(v as Sort)} options={[{ value: "new", label: "Нові спочатку" }, { value: "name", label: "За логіном" }]} />{updatedAt && <span>оновлено о {updatedAt}</span>}</div>
      <div className={`v3-ptr${pulling ? " is-drag" : ""}${pull >= 60 && !refreshing ? " is-ready" : ""}`} style={{ height: pull }} role="status" aria-live="polite">
        {refreshing ? <span className="v3-ptr-sp" aria-hidden="true" /> : <span className="v3-ptr-ar" aria-hidden="true">↓</span>}
        <span>{refreshing ? "Оновлюємо…" : pull >= 60 ? "Відпустіть, щоб оновити" : pull > 0 ? "Потягніть, щоб оновити" : ""}</span>
      </div>
      <ul className="v3-mcards" onTouchStart={onListTouchStart} onTouchMove={onListTouchMove} onTouchEnd={onListTouchEnd} onTouchCancel={onListTouchEnd}>
        {users === null && loading ? Array.from({ length: 5 }, (_, i) => <li key={i} className="v3-mcard is-skel" aria-hidden="true"><span className="v3-skel v3-skel-light v3-skel-av" /><span className="v3-skel v3-skel-light" style={{ width: "60%" }} /><span className="v3-skel v3-skel-light" style={{ width: 60 }} /></li>)
          : list.length ? list.slice(0, mobileShown).map((u) => {
            const st = statusOf(u), ui = tagOf(u), p = planCell(u, settings);
            const d = daysLeft(u);
            const tag = isExpiring(u) ? (d === 0 ? "сьогодні" : `${d} ${plural(d, "день", "дні", "днів")}`) : ui.label;
            const line = isAdmin(u) ? `${u.isOwner ? "Овнер" : "Адмін"} · повний доступ` : st === "blocked" ? `${p.plan} · самообмеження до ${shortDate(u.selfLimitedUntil!)}` : st === "cancelled" ? `${p.plan} · скасовано ${shortDate(u.subscriptionCancelledAt || u.cancelledAt || u.endDate)}` : st === "trial" ? `Пробний · до ${shortDate(u.endDate)}` : st === "ended" ? `${p.plan} · закінчилась ${shortDate(u.endDate)}` : `${p.plan} · оплата ${shortDate(u.endDate)}`;
            return (
              <li key={u.id} className={`v3-mitem${menuId === u.id ? " is-lifted" : ""}`}><button type="button" className={`v3-mcard${pressId === u.id ? " is-press" : ""}`}
                onTouchStart={() => pressStart(u.id)} onTouchEnd={pressEnd} onTouchCancel={pressEnd} onContextMenu={(e) => { e.preventDefault(); setMenuId(u.id); }}
                onClick={() => { if (touch.current.long) { touch.current.long = false; return; } openCard(u); }}>
                <span className="v3-mcard-lp" aria-hidden="true" />
                <UserAvatar username={u.username} telegram={u.telegram} />
                <span className="v3-mcard-who"><strong>@{hl(u.username, q)}{!isAdmin(u) && !u.ageConfirmed && <span className="v3-tag v3-tag-age">21+ ?</span>}</strong><small>{line}</small></span>
                <span className={`v3-tag ${ui.cls}`}>{tag}</span>
              </button>
              {menuId === u.id && (
                <div className="v3-lpmenu" role="menu" aria-label={`Дії з @${u.username}`}>
                  {canQuickExtend(u) && <button type="button" role="menuitem" disabled={!online} onClick={() => { setMenuId(null); setExtendFor(u); }}><Plus size={16} aria-hidden="true" />Продовжити на {extendDays} днів</button>}
                  {u.telegram && <a role="menuitem" href={`https://t.me/${u.telegram.replace(/^@/, "").replace(/^https?:\/\/t\.me\//, "")}`} target="_blank" rel="noopener noreferrer" onClick={() => setMenuId(null)}><Send size={16} aria-hidden="true" />Написати в Telegram</a>}
                  <button type="button" role="menuitem" onClick={() => { setMenuId(null); openCard(u); }}><ArrowRight size={16} aria-hidden="true" />Відкрити картку</button>
                </div>
              )}
              </li>
            );
          }) : <li className="v3-mcard-empty">{emptyState()}</li>}
      </ul>
      {menuUser && <div className="v3-lpscrim" onClick={() => setMenuId(null)} aria-hidden="true" />}
      {list.length > mobileShown && <button type="button" className="v3-btn v3-btn-ghost-dark v3-btn-block" onClick={() => setMobileShown(mobileShown + PAGE_SIZE)}>Показати ще {Math.min(PAGE_SIZE, list.length - mobileShown)}{list.length - mobileShown > PAGE_SIZE ? ` із ${list.length - mobileShown}` : ""}</button>}
    </div>
  );

  return (
    <div className="v3-page v3-users">
      <section className="v3-hero v3-hero-row">
        <div>
          <h1 className="v3-title">Користувачі</h1>
          <p className="v3-subtitle"><span className="v3-hide-mobile">Облікові записи, підписки, оплати й доступ до MatchIQ.</span><span className="v3-only-mobile">{all.length} {plural(all.length, "запис", "записи", "записів")} · {counts.paid} платних · {counts.trial} на пробному</span></p>
        </div>
        <div className="v3-chips">
          {!emptyPlatform && <ExportCsvButton className="v3-chip v3-hide-mobile" onClick={exportCsv} disabled={!list.length} />}
          <button type="button" className="v3-btn v3-btn-primary v3-hide-mobile" disabled={!online} onClick={() => setForm({ mode: "create" })}><Plus size={17} aria-hidden="true" />Створити користувача</button>
          <button type="button" className="v3-fab v3-only-mobile" aria-label="Створити користувача" disabled={!online} onClick={() => setForm({ mode: "create" })}><Plus size={20} strokeWidth={2.4} aria-hidden="true" /></button>
        </div>
      </section>

      {!(emptyPlatform && !exclCount) && <div className="v3-ptabs" role="tablist" aria-label="Розділи">
        <PillTrack active={tab} />
        <button type="button" role="tab" aria-selected={tab === "users"} className={`v3-ptab${tab === "users" ? " is-on" : ""}`} onClick={() => setTab("users")}>Усі користувачі</button>
        <button type="button" role="tab" aria-selected={tab === "excl"} className={`v3-ptab${tab === "excl" ? " is-on" : ""}`} onClick={() => setTab("excl")}>Самообмеження{exclCount ? <span>{exclCount}</span> : null}</button>
      </div>}

      {!online && <div className="v3-offline-users" role="status"><WifiOff size={16} aria-hidden="true" /><span>Немає інтернету. Список станом на {updatedAt || "—"} — створення, оплати й продовження недоступні.</span><button type="button" className="v3-btn v3-btn-ghost-dark v3-btn-sm" onClick={() => { if (navigator.onLine) load(); else toast.info("Досі немає з’єднання"); }}>Перевірити ще раз</button></div>}

      {tab === "excl" ? <SelfLimitationsTab onCount={setExclCount} /> : <>
        {error && users !== null && <div className="v3-stale" role="alert"><AlertTriangle size={18} aria-hidden="true" /><span>Не вдалося оновити список: {error}. Показано дані станом на {updatedAt}.</span><button type="button" onClick={load}>Спробувати ще раз</button></div>}
        {error && users === null ? (
          <div className="v3-dcard v3-uerror" role="alert">
            <span className="v3-uerror-ico" aria-hidden="true">!</span>
            <strong>Не вдалося завантажити користувачів</strong>
            <span>Сервер не відповів. Фільтри й пошук збережено.</span>
            {showErr && <code className="v3-uerror-det">{error}</code>}
            <div><button type="button" className="v3-btn v3-btn-blue" onClick={load}>Спробувати ще раз</button><button type="button" className="v3-btn v3-btn-ghost-dark" aria-expanded={showErr} onClick={() => setShowErr((v) => !v)}>{showErr ? "Сховати" : "Деталі"}</button></div>
          </div>
        ) : emptyPlatform && wide ? (
          <>
            {/* Design «Користувачі · порожньо»: nobody but admins yet */}
            <section className="v3-sums" aria-label="Підсумки">
              <div className="v3-sum is-static"><span className="v3-sum-l">Усі облікові записи</span><strong className="v3-sum-v">0</strong><span className="v3-sum-n">лише {admins === 1 ? "ваш акаунт овнера" : "адміністратори"}</span></div>
              <div className="v3-sum is-static"><span className="v3-sum-l">Платні · Базова і Pro</span><strong className="v3-sum-v">0</strong><span className="v3-sum-n">—</span></div>
              <div className="v3-sum is-static"><span className="v3-sum-l">На пробному періоді</span><strong className="v3-sum-v">0</strong><span className="v3-sum-n">—</span></div>
              <div className="v3-sum is-static"><span className="v3-sum-l">Адміністратори</span><strong className="v3-sum-v"><RollingNumber key={`adm-${admins}`} text={String(admins)} /></strong><span className="v3-sum-n">{(() => { const o = all.find((u) => u.isOwner); return o ? `@${o.username} · овнер` : "—"; })()}</span></div>
            </section>
            <section className="v3-users-empty">
              <div className="v3-wcard v3-ue-main">
                <div className="v3-ue-ghost" aria-hidden="true">{[40, 47, 54, 61, 68, 45].map((w, i) => <div key={i} className="v3-ue-grow"><i className="is-av" /><div><i style={{ width: `${w}%`, height: 12 }} /><i style={{ width: `${25 + (i % 4) * 5}%`, height: 9, marginTop: 8 }} /></div><i style={{ height: 12 }} /><i style={{ height: 22, borderRadius: 999 }} /></div>)}</div>
                <div className="v3-ue-over">
                  <span className="v3-ue-ico" aria-hidden="true"><UserPlus size={28} strokeWidth={1.8} /></span>
                  <h2>Додайте першого користувача</h2>
                  <p>Створіть обліковий запис і оберіть план: пробний на {settings?.trialDays || 7} днів, Базова або Pro. Пароль згенерується автоматично.</p>
                  <div><button type="button" className="v3-btn v3-btn-primary" disabled={!online} onClick={() => setForm({ mode: "create" })}>Створити користувача</button><Link to="/settings" className="v3-btn v3-btn-ghost">Тарифи</Link></div>
                </div>
              </div>
              <aside className="v3-dcard v3-ue-side">
                <strong>Що з’явиться тут</strong>
                <ol>
                  <li><span>1</span><div><b>Список і картка користувача</b><small>План, наступна оплата, вік 21+, нотатка й історія змін</small></div></li>
                  <li><span>2</span><div><b>Оплати й чеки</b><small>Ручний облік оплат і чек, який можна надіслати в Telegram</small></div></li>
                  <li><span>3</span><div><b>Статистика ставок</b><small>Ставки, вінрейт і профіт кожного користувача</small></div></li>
                </ol>
              </aside>
            </section>
          </>
        ) : <>
          <section className="v3-sums v3-hide-mobile" aria-label="Підсумки">
            {sums.map((x) => <button key={x.key} type="button" className={`v3-sum${filter === x.key ? " is-on" : ""}`} aria-pressed={filter === x.key} onClick={() => setFilter(x.key)}><span className="v3-sum-l">{x.label}</span><strong className="v3-sum-v">{users === null ? "—" : <RollingNumber key={`${x.key}-${x.value}`} text={String(x.value)} />}</strong><span className="v3-sum-n">{(() => { const dd = deltas[x.key]; if (!dd || dd.d === null || users === null) return null; const d = dd.d; const good = d >= 0; return <><span className={`v3-dl ${filter === x.key ? "is-onblue " : ""}${d === 0 ? "is-flat" : good ? "is-up" : "is-down"}${d < 0 ? " is-neg" : ""}`} title={`до ${prevMonthGen}`}><ArrowUp size={10} strokeWidth={3} aria-hidden="true" />{`${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d).toLocaleString("uk-UA", { maximumFractionDigits: 1 })}%`}</span><span className="sr-only">{d >= 0 ? "зростання" : "падіння"} до {prevMonthGen} </span></>; })()}{x.note}</span></button>)}
          </section>

          {!wide ? mobileList : (
            <section className="v3-users-main">
              <div className="v3-wcard v3-ulist" aria-busy={loading}>
                <div className="v3-ulist-tools">
                  <label className="v3-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Пошук користувачів" placeholder="Знайти за логіном або Telegram" value={q} onChange={(e) => setQ(e.target.value)} />{q && <button type="button" onClick={() => setQ("")} aria-label="Очистити пошук"><X size={14} /></button>}</label>
                  <div className="v3-seg v3-seg-soft" role="group" aria-label="Фільтр за статусом">
        <PillTrack active={filter} />
                    {segs.map((s) => <button key={s.key} type="button" className={filter === s.key ? "is-on" : ""} aria-pressed={filter === s.key} onClick={() => setFilter(s.key)}>{s.label} <span className="v3-seg-n">{counts[s.key]}</span></button>)}
                  </div>
                  {counts.expiring > 0 && <button type="button" className={`v3-fchip is-light${filter === "expiring" ? " is-on" : ""}`} aria-pressed={filter === "expiring"} onClick={() => setFilter(filter === "expiring" ? "all" : "expiring")}><span className="v3-fchip-n is-exp">{counts.expiring}</span>Закінчуються за 7 днів{filter === "expiring" && <X size={14} className="v3-fchip-x" aria-hidden="true" />}</button>}
                  {noAge > 0 && <button type="button" className={`v3-fchip is-light${ageOnly ? " is-on" : ""}`} aria-pressed={ageOnly} aria-label={`Вік не підтверджено: ${noAge}`} onClick={() => setAgeOnly(!ageOnly)}><span className="v3-fchip-n is-age">{noAge}</span>Вік не підтверджено{ageOnly && <X size={14} className="v3-fchip-x" aria-hidden="true" />}</button>}
                  <Dropdown className="is-light v3-sort-dd" ariaLabel="Сортування" value={sort} onChange={(v) => setSort(v as Sort)} options={[{ value: "new", label: "Нові спочатку" }, { value: "name", label: "За логіном" }]} />
                </div>
                {rows}
                {picked.size > 0 && (
                  <div className="v3-bulk" role="region" aria-label="Дії з вибраними">
                    <span className="v3-bulk-n">Вибрано <b key={picked.size}>{picked.size}</b></span>
                    <button type="button" className="v3-btn v3-btn-primary v3-btn-sm" disabled={!online || bulkBusy} onClick={extendPicked}>{bulkBusy ? "Продовжуємо…" : `+${extendDays} днів`}</button>
                    <ExportCsvButton className="v3-btn v3-btn-ghost-dark v3-btn-sm" size={14} label="CSV" onClick={() => downloadCsv(`users-selected-${new Date().toISOString().slice(0, 10)}.csv`, ["Логін", "Telegram", "План", "До"], pickedUsers.map((u) => [u.username, u.telegram || "", planCell(u, settings).plan, u.endDate || ""]))} />
                    <button type="button" className="v3-icon-btn v3-bulk-x" aria-label="Зняти вибір" onClick={() => setPicked(new Set())}><X size={16} /></button>
                  </div>
                )}
                {list.length > 0 && (
                  <div className="v3-pager">
                    <span>Показано <b>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, list.length)}</b> із <b>{list.length}</b>{filtered && list.length !== all.length ? ` · усього ${all.length}` : ""}{updatedAt && ` · оновлено о ${updatedAt}`}</span>
                    <nav aria-label="Сторінки">
                      <button type="button" className="v3-round" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Попередня сторінка"><ChevronLeft size={15} /></button>
                      {Array.from({ length: pages }, (_, i) => i + 1).filter((n) => pages <= 7 || n === 1 || n === pages || Math.abs(n - page) <= 1).map((n, i, arr) => <span key={n} className="v3-pg-wrap">{i > 0 && n - arr[i - 1] > 1 && <span className="v3-pg-gap">…</span>}<button type="button" className={`v3-pg${n === page ? " is-on" : ""}`} aria-current={n === page ? "page" : undefined} onClick={() => setPage(n)}>{n}</button></span>)}
                      <button type="button" className="v3-round" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Наступна сторінка"><ChevronRight size={15} /></button>
                    </nav>
                  </div>
                )}
              </div>
              {card}
            </section>
          )}
        </>}
      </>}

      {!wide && <Dialog open={sheetOpen && !!selected} onOpenChange={setSheetOpen}><DialogContent className="v3-sheet v3-sheet-card"><DialogTitle className="sr-only">Картка користувача</DialogTitle><DialogDescription className="sr-only">Підписка, профіль, ставки, оплати й нотатка</DialogDescription>{card}</DialogContent></Dialog>}

      {extendFor && <ExtendConfirmDialog open={!!extendFor} onOpenChange={(o) => { if (!o) setExtendFor(null); }} items={[{ user: { id: extendFor.id, username: extendFor.username, role: extendFor.role, telegram: extendFor.telegram, priceMonth: String(extendFor.priceMonth || ""), startDate: extendFor.startDate, endDate: extendFor.endDate }, days: daysLeft(extendFor) }]} days={extendDays} busy={false} subtitle="Дата закінчення зсунеться без запису оплати." onConfirm={() => extend(extendFor)} />}

      <UserFormDialog mode={form?.mode || "create"} open={!!form} user={form?.mode === "edit" ? form.user : null} settings={settings}
        canAppointOwner={!!me?.isOwner} roleLock={form?.mode === "edit" ? roleLockReason(me, ro(form.user)) : null} busy={saving}
        onOpenChange={(o) => { if (!o) setForm(null); }} onSave={saveForm} />
      <PasswordDialog data={password} onClose={() => setPassword(null)} />
      <DeleteUserDialog username={deleting?.username || ""} open={!!deleting} busy={busyDelete} onOpenChange={(o) => { if (!o) setDeleting(null); }} onConfirm={doDelete} />
      <Dialog open={!!resetting} onOpenChange={(o) => { if (!o) setResetting(null); }}>
        <DialogContent className="v3-modal sm:max-w-[440px]">
          <DialogTitle className="v3-modal-title">Скинути пароль @{resetting?.username}?</DialogTitle>
          <DialogDescription className="v3-modal-sub">Старий пароль перестане працювати. Новий покажемо один раз — передайте його користувачу.</DialogDescription>
          <div className="v3-modal-foot"><span /><div className="v3-modal-actions"><button type="button" className="v3-btn v3-btn-ghost" onClick={() => setResetting(null)}>Скасувати</button><button type="button" className="v3-btn v3-btn-blue" onClick={doReset}>Скинути пароль</button></div></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
