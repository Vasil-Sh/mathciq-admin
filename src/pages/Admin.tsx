import { useSearchParams } from "react-router-dom";
import UserCardPanel from "@/components/users/UserCardPanel";
import UserAvatar from "@/components/UserAvatar";
import ExtendConfirmDialog from "@/components/ExtendConfirmDialog";
import { extendedEndDate, shortDate, daysLabel as daysWord } from "@/lib/subscriptions";
import { canResetPassword, deleteBlockReason, roleLockReason } from "@/lib/permissions";
import { useAuth } from "@/contexts/AuthContext";
import { useSessionFilter } from "@/hooks/useSessionFilter";
import UserEditorDialog from "@/components/UserEditorDialog";
import { useState, useEffect, useMemo } from "react";

import { authService } from "@/lib/authService";
import { cleanPrice, parseDate, getDaysUntilExpiry, isSubscriptionActive } from "@/lib/adminUtils";
import { fetchSettings } from "@/lib/adminSettingsApi";
import { downloadCsv } from "@/lib/csv";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, ChevronLeft, ChevronRight, Crown, Download, Plus, RefreshCw, Search, ShieldCheck, Users, X } from "lucide-react";
import { toast } from "sonner";
import type { UserData, StatusFilter, SortDirection } from "@/types";

const EMPTY_USER: Omit<UserData, "isActive" | "daysUntilExpiry"> = { telegram: "", username: "", priceMonth: "", startDate: "", endDate: "", isAdmin: false };

function todayFormatted() { const d = new Date(); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; }
function monthLaterFormatted() { const d = new Date(); d.setMonth(d.getMonth() + 1); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; }
function useWide() {
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1180px)").matches);
  useEffect(() => { const m = window.matchMedia("(min-width: 1180px)"); const f = () => setWide(m.matches); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, []);
  return wide;
}

export default function Admin() {
  const [urlParams,setUrlParams] = useSearchParams();
  const roleFilter = ["user","admin"].includes(urlParams.get("role") || "") ? urlParams.get("role")! : "all";
  const newOnly = urlParams.get("new") === "month";
  const [selectedId,setSelectedId]=useState<number|null>(null);
  const [mobileCardOpen,setMobileCardOpen]=useState(false);
  const [confirmRow,setConfirmRow]=useState<number|null>(null);
  const [cardExtendOpen,setCardExtendOpen]=useState(false);
  const wide = useWide();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState("");
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useSessionFilter<StatusFilter>("users.status", "all", ["all", "active", "expired"]);
  const [searchQuery, setSearchQuery] = useSessionFilter<string>("users.search", "");
  const [sortDirection, setSortDirection] = useSessionFilter<SortDirection>("users.sort", null, [null, "asc", "desc"]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newUser, setNewUser] = useState({ ...EMPTY_USER });
  const [defaultPrice, setDefaultPrice] = useState("");
  const [extendDays, setExtendDays] = useState(30);
  const { user: currentAdmin } = useAuth();
  const [lastCreatedPassword, setLastCreatedPassword] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [lastResetPassword, setLastResetPassword] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingIndex, setDeletingIndex] = useState(-1);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => { fetchUsers(); }, []);

  useEffect(() => {
    fetchSettings()
      .then((s) => {
        if (s.defaultMonthlyPrice > 0) setDefaultPrice(String(s.defaultMonthlyPrice));
        if (Number.isInteger(s.subscriptionDays) && s.subscriptionDays > 0) setExtendDays(s.subscriptionDays);
      })
      .catch(() => {});
  }, []);

  const fetchUsers = async () => {
    setLoading(true); setError("");
    try {
      const allUsers = await authService.fetchUsers();
      setUsers(allUsers.map(u => {
        const endDate = u.endDate || "";
        return { id: u.id, createdAt: u.createdAt, telegram: String(u.telegram ?? ""), username: String(u.username ?? ""), priceMonth: cleanPrice(String(u.priceMonth || "")), startDate: u.startDate || "", endDate, isActive: isSubscriptionActive(endDate) && (!u.startDate || (parseDate(u.startDate)?.getTime() ?? 0) <= Date.now()), isAdmin: u.role === "admin", isOwner: !!u.isOwner, daysUntilExpiry: getDaysUntilExpiry(endDate) };
      }).filter(u => u.username));
      setLastUpdate(new Date().toLocaleString("uk-UA"));
    } catch (err: unknown) { setError(`Не вдалося завантажити користувачів: ${(err as Error).message || "помилка з'єднання"}`); }
    finally { setLoading(false); }
  };

  const handleAddUser = async () => {
    if (!newUser.username.trim() || !newUser.telegram.trim()) { toast.error("Заповніть Telegram та Username"); return; }
    if (users.some(u => u.username.toLowerCase() === newUser.username.toLowerCase().trim())) { toast.error("Користувач з таким username вже існує"); return; }
    setLoading(true);
    try {
      const result = await authService.createUser({ username: newUser.username.trim(), telegram: newUser.telegram.trim(), role: newUser.isAdmin ? "admin" : "user", priceMonth: cleanPrice(newUser.priceMonth.trim()), startDate: newUser.startDate.trim(), endDate: newUser.endDate.trim() });
      setLastCreatedPassword(result.password);
      toast.success(`Користувача "${result.username}" створено!`);
      await fetchUsers();
    } catch (err: unknown) { toast.error((err as { message?: string }).message || "Помилка"); }
    finally { setLoading(false); }
  };

  const handleCloseAddDialog = () => {
    setAddDialogOpen(false);
    setLastCreatedPassword("");
    setNewUser({ ...EMPTY_USER });
  };

  const openEditDialog = (u: UserData, i: number) => { setEditingUser({ ...u }); setLastResetPassword(""); setEditDialogOpen(true); };

  const handleSaveEdit = async () => {
    if (!editingUser?.id) return; setLoading(true);
    try {
      await authService.updateUser(editingUser.id, { telegram: editingUser.telegram, username: editingUser.username, role: editingUser.isAdmin ? "admin" : "user", ...(currentAdmin?.isOwner ? { isOwner: !!editingUser.isOwner } : {}), priceMonth: cleanPrice(editingUser.priceMonth), startDate: editingUser.startDate, endDate: editingUser.endDate });
      toast.success("Дані оновлено!"); setEditDialogOpen(false); setEditingUser(null); setLastResetPassword("");
      await fetchUsers();
    } catch (err: unknown) { toast.error((err as { message?: string }).message || "Помилка"); }
    finally { setLoading(false); }
  };

  const handleCloseEditDialog = () => {
    setEditDialogOpen(false);
    setEditingUser(null);
    setLastResetPassword("");
  };

  const handleResetPassword = async () => {
    if (!editingUser?.id) return;
    setLoading(true);
    try {
      const result = await authService.resetPassword(editingUser.id);
      setLastResetPassword(result.password);
      toast.success(`Пароль для "${result.username}" скинуто!`);
    } catch (err: unknown) { toast.error((err as { message?: string }).message || "Помилка"); }
    finally { setLoading(false); }
  };

  const extendUser = async (u: UserData, withUndo = true) => {
    if (!u.id) return;
    const prev = u.endDate;
    const next = extendedEndDate(u.endDate, extendDays);
    setLoading(true);
    try {
      await authService.updateUser(u.id, { endDate: next });
      await fetchUsers();
      toast.success(`@${u.username} продовжено до ${shortDate(next)}`, withUndo ? {
        description: "Без запису оплати", duration: 10_000, className: "v3-toast-10s",
        action: { label: "Скасувати", onClick: async () => { try { await authService.updateUser(u.id!, { endDate: prev }); toast.info("Продовження скасовано", { description: "Дата повернулась як була" }); } catch (e) { toast.error((e as Error).message); } await fetchUsers(); } },
      } : undefined);
    } catch (err: unknown) { toast.error((err as { message?: string }).message || "Помилка"); }
    finally { setLoading(false); setConfirmRow(null); setCardExtendOpen(false); }
  };

  const confirmDelete = (i: number) => { const blocked = users[i] && deleteBlockReason(currentAdmin, users[i]); if (blocked) { toast.error(blocked); return; } setDeletingIndex(i); setDeleteDialogOpen(true); };

  const handleDelete = async () => {
    const u = users[deletingIndex]; if (!u?.id) return; setLoading(true);
    try { await authService.deleteUser(u.id); toast.success(`Користувача "${u.username}" видалено!`); setDeleteDialogOpen(false); setDeletingIndex(-1); await fetchUsers(); }
    catch (err: unknown) { toast.error((err as { message?: string }).message || "Помилка"); }
    finally { setLoading(false); }
  };

  useEffect(()=>{const status=urlParams.get("status"); if(status === "all" || status === "active" || status === "expired") {setStatusFilter(status);setSearchQuery("");} const q=urlParams.get("q"); if(q) setSearchQuery(q);},[urlParams]);
  const scopedUsers = users.filter(u=>roleFilter === "all" || (roleFilter === "admin" ? u.isAdmin : !u.isAdmin));
  const activeUsers = scopedUsers.filter(u => u.isActive).length;
  const inactiveUsers = scopedUsers.filter(u => !u.isActive).length;
  const adminUsers = users.filter(u => u.isAdmin).length;
  const expiringUsers = users.filter(u => u.isActive && u.daysUntilExpiry !== undefined && u.daysUntilExpiry <= 3 && u.daysUntilExpiry >= 0);

  const displayedUsers = useMemo(() => {
    let result = users.map((u, i) => ({ user: u, originalIndex: i }));
    if(roleFilter !== "all") result=result.filter(({user:u})=>roleFilter === "admin" ? u.isAdmin : !u.isAdmin);
    if(newOnly) { const month=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit'}).format(new Date()); result=result.filter(({user:u})=>u.createdAt?.slice(0,7) === month); }
    if (statusFilter === "active") result = result.filter(({ user: u }) => u.isActive);
    else if (statusFilter === "expired") result = result.filter(({ user: u }) => !u.isActive);
    const q = searchQuery.trim().toLowerCase();
    if (q) result = result.filter(({ user: u }) => u.telegram.toLowerCase().includes(q) || u.username.toLowerCase().includes(q));
    if (sortDirection) result = [...result].sort((a, b) => { const da = parseDate(a.user.endDate); const db = parseDate(b.user.endDate); const ta = da ? da.getTime() : 0; const tb = db ? db.getTime() : 0; return sortDirection === "asc" ? ta - tb : tb - ta; });
    return result;
  }, [users, statusFilter, searchQuery, sortDirection, roleFilter, newOnly]);

  // Reset page when filter/search changes
  useEffect(() => { setPage(1); }, [statusFilter, searchQuery, roleFilter, newOnly]);

  const exportUsersCsv = () => {
    const rows = displayedUsers.map(({ user: u }) => [
      u.username,
      u.telegram,
      u.isAdmin ? "Адміністратор" : "Користувач",
      u.priceMonth || "",
      u.startDate || "",
      u.endDate || "",
      u.isActive ? "Активний" : "Неактивний",
    ]);
    downloadCsv(
      "users.csv",
      ["Username", "Telegram", "Роль", "Тариф", "Підписка з", "Підписка до", "Статус"],
      rows,
    );
  };

  const totalPages = Math.max(1, Math.ceil(displayedUsers.length / PAGE_SIZE));
  const pagedUsers = displayedUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Clamp page when the list shrinks (e.g. after deleting all users on the
  // last page) — otherwise the page index goes out of range and shows "no data".
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const selected = users.find(u => u.id === selectedId) || pagedUsers[0]?.user || null;
  const needsExtend = (u: UserData) => !u.isAdmin && (!u.isActive || (u.daysUntilExpiry ?? 99) <= 7);
  const setRole = (value: string) => { const next = new URLSearchParams(urlParams); if (value === "all") next.delete("role"); else next.set("role", value); setUrlParams(next); setPage(1); };
  const openCard = (u: UserData) => { setSelectedId(u.id ?? null); setConfirmRow(null); if (!wide) setMobileCardOpen(true); };
  const openAdd = () => { setNewUser({ ...EMPTY_USER, priceMonth: defaultPrice, startDate: todayFormatted(), endDate: monthLaterFormatted() }); setLastCreatedPassword(""); setAddDialogOpen(true); };
  const start = displayedUsers.length ? (page - 1) * PAGE_SIZE + 1 : 0;
  const end = Math.min(page * PAGE_SIZE, displayedUsers.length);
  const statusOf = (u: UserData) => !u.isActive ? { t: "Закінчилась", c: "v3-tag-red" } : (u.daysUntilExpiry ?? 99) <= 7 ? { t: (u.daysUntilExpiry ?? 0) === 0 ? "Сьогодні" : `${daysWord(u.daysUntilExpiry ?? 0)}`, c: (u.daysUntilExpiry ?? 0) <= 2 ? "v3-tag-red" : "v3-tag-amber" } : { t: "Активна", c: "v3-tag-green" };
  const sums = [
    { key: "all", label: "Усі користувачі", value: users.length, note: "усі облікові записи", on: statusFilter === "all" && roleFilter === "all", go: () => { setStatusFilter("all"); setRole("all"); } },
    { key: "active", label: "Активні", value: activeUsers, note: "з активною підпискою", on: statusFilter === "active" && roleFilter === "all", go: () => { setStatusFilter("active"); setRole("all"); } },
    { key: "admin", label: "Адміністратори", value: adminUsers, note: "мають права керування", on: roleFilter === "admin", go: () => { setStatusFilter("all"); setRole("admin"); } },
    { key: "expired", label: "Неактивні", value: inactiveUsers, note: "підписка закінчилась", on: statusFilter === "expired" && roleFilter === "all", go: () => { setStatusFilter("expired"); setRole("all"); } },
  ];
  const card = selected && (
    <UserCardPanel key={selected.id} user={selected} extendDays={extendDays} deleteReason={deleteBlockReason(currentAdmin, selected)}
      onEdit={() => openEditDialog(selected, users.findIndex(u => u.id === selected.id))}
      onDelete={() => confirmDelete(users.findIndex(u => u.id === selected.id))}
      onExtend={() => setCardExtendOpen(true)} onChanged={fetchUsers}
      onClose={wide ? undefined : () => setMobileCardOpen(false)} />
  );

  return (
    <div className="v3-page v3-users">
      <section className="v3-hero v3-hero-row">
        <div>
          <h1 className="v3-title">Користувачі</h1>
          <p className="v3-subtitle">Люди, підписки та доступ до MatchIQ.{lastUpdate && <span className="v3-dim"> · Оновлено {lastUpdate.split(", ")[1] || lastUpdate}</span>}</p>
        </div>
        <div className="v3-chips">
          <button type="button" className="v3-chip" onClick={exportUsersCsv}><Download size={15} aria-hidden="true" />Експорт CSV</button>
          <button type="button" className="v3-btn v3-btn-primary" onClick={openAdd}><Plus size={17} aria-hidden="true" />Додати користувача</button>
        </div>
      </section>
      {error && <div className="v3-stale" role="alert"><AlertTriangle size={18} aria-hidden="true" /><span>{error}</span><button type="button" onClick={fetchUsers}>Повторити</button></div>}

      <section className="v3-sums" aria-label="Підсумки">
        {sums.map(x => <button key={x.key} type="button" className={`v3-sum${x.on ? " is-on" : ""}`} aria-pressed={x.on} onClick={x.go}><span className="v3-sum-l">{x.label}</span><strong className="v3-sum-v">{x.value}</strong><span className="v3-sum-n">{x.note}</span></button>)}
      </section>

      <section className="v3-users-main">
        <div className="v3-wcard v3-ulist" aria-busy={loading}>
          <div className="v3-ulist-head">
            <div><h2 className="v3-h2">Список користувачів <span className="v3-count-chip">{scopedUsers.length}</span></h2><p className="v3-note-dark">Клік по рядку — картка користувача</p></div>
            <button type="button" className="v3-round" onClick={fetchUsers} disabled={loading} aria-label="Оновити список"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /></button>
          </div>
          <div className="v3-ulist-tools">
            <div className="v3-seg v3-seg-soft" role="group" aria-label="Статус підписки">
              {([["all", "Усі", scopedUsers.length], ["active", "Активні", activeUsers], ["expired", "Прострочені", inactiveUsers]] as const).map(([k, l, n]) => <button key={k} type="button" className={statusFilter === k ? "is-on" : ""} aria-pressed={statusFilter === k} onClick={() => setStatusFilter(k)}>{l}<span>{n}</span></button>)}
            </div>
            <label className="v3-search"><Search size={16} aria-hidden="true" /><input aria-label="Пошук користувачів" placeholder="Логін або Telegram" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />{searchQuery && <button type="button" onClick={() => setSearchQuery("")} aria-label="Очистити пошук"><X size={14} /></button>}</label>
            <select className="v3-select" aria-label="Роль" value={roleFilter} onChange={e => setRole(e.target.value)}><option value="all">Усі ролі</option><option value="user">Користувачі</option><option value="admin">Адміністратори</option></select>
            <select className="v3-select" aria-label="Сортування" value={sortDirection || "none"} onChange={e => setSortDirection(e.target.value === "none" ? null : e.target.value as SortDirection)}><option value="none">Без сортування</option><option value="asc">Найближче завершення</option><option value="desc">Найпізніше завершення</option></select>
            {newOnly && <button type="button" className="v3-filter-chip" onClick={() => { const next = new URLSearchParams(urlParams); next.delete("new"); setUrlParams(next); }}>Нові цього місяця <X size={13} aria-hidden="true" /></button>}
          </div>

          <div className="v3-urows" role="table" aria-label="Користувачі">
            <div className="v3-uth" role="row"><span role="columnheader">Користувач</span><span role="columnheader">Тариф</span><span role="columnheader">Доступ до</span><span role="columnheader">Статус</span><span role="columnheader">Роль</span><span role="columnheader" className="v3-sr">Дія</span></div>
            {pagedUsers.length ? pagedUsers.map(({ user: u }) => {
              const st = statusOf(u); const sel = wide && selected?.id === u.id;
              return (
                <div key={u.id} className="v3-urow-wrap">
                  <div role="row" className={`v3-urow${sel ? " is-sel" : ""}`} onClick={() => openCard(u)}>
                    <span role="cell" className="v3-uwho"><UserAvatar username={u.username} telegram={u.telegram} /><span className="v3-uname"><button type="button" onClick={e => { e.stopPropagation(); openCard(u); }}>@{u.username}</button><small>{u.telegram || "Telegram не вказано"}</small></span></span>
                    <span role="cell" className="v3-num">{Number(u.priceMonth) ? `${Number(u.priceMonth)} ₴` : <span className="v3-muted">—</span>}</span>
                    <span role="cell"><span className="v3-num">{shortDate(u.endDate) || "—"}</span></span>
                    <span role="cell"><span className={`v3-tag ${st.c}`}>{st.t}</span></span>
                    <span role="cell"><span className={`v3-role${u.isOwner ? " is-owner" : u.isAdmin ? " is-admin" : ""}`}>{u.isOwner ? <Crown size={12} aria-hidden="true" /> : u.isAdmin ? <ShieldCheck size={12} aria-hidden="true" /> : null}{u.isOwner ? "Овнер" : u.isAdmin ? "Адмін" : "Користувач"}</span></span>
                    <span role="cell" className="v3-uact">{needsExtend(u) && <button type="button" className="v3-ext" disabled={loading} onClick={e => { e.stopPropagation(); setConfirmRow(confirmRow === u.id ? null : u.id ?? null); }} aria-expanded={confirmRow === u.id}>+{extendDays} днів</button>}</span>
                  </div>
                  {confirmRow === u.id && (
                    <div className="v3-pop" role="dialog" aria-label={`Продовжити ${u.username}`}>
                      <strong>Продовжити @{u.username} на {extendDays} днів?</strong>
                      <span>до {shortDate(u.endDate) || "—"} → <b>{shortDate(extendedEndDate(u.endDate, extendDays))}</b> Без запису оплати — якщо гроші прийшли, краще «Додати оплату» в картці.</span>
                      <div><button type="button" className="v3-btn v3-btn-ghost v3-btn-sm" onClick={() => setConfirmRow(null)}>Скасувати</button><button type="button" className="v3-btn v3-btn-blue v3-btn-sm" autoFocus disabled={loading} onClick={() => extendUser(u)}>Продовжити</button></div>
                    </div>
                  )}
                </div>
              );
            }) : <div className="v3-uempty"><Users size={28} aria-hidden="true" /><strong>{loading ? "Завантаження користувачів…" : "Нікого не знайдено"}</strong><span>{searchQuery || statusFilter !== "all" ? "Спробуйте інший запит або змініть фільтр." : "Додайте першого користувача."}</span>{(searchQuery || statusFilter !== "all") && <button type="button" className="v3-btn v3-btn-ghost v3-btn-sm" onClick={() => { setSearchQuery(""); setStatusFilter("all"); }}>Скинути фільтри</button>}</div>}
          </div>

          <div className="v3-pager">
            <span>Показано <b>{start}–{end}</b> із <b>{displayedUsers.length}</b>{displayedUsers.length !== scopedUsers.length && ` · усього ${scopedUsers.length}`}</span>
            <nav aria-label="Сторінки"><button type="button" className="v3-round" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Попередня сторінка"><ChevronLeft size={16} /></button><span><b>{page}</b> / {totalPages}</span><button type="button" className="v3-round" disabled={page >= totalPages} onClick={() => setPage(page + 1)} aria-label="Наступна сторінка"><ChevronRight size={16} /></button></nav>
          </div>
        </div>

        {wide && card}
      </section>

      {!wide && <Dialog open={mobileCardOpen && !!selected} onOpenChange={setMobileCardOpen}><DialogContent className="v3-sheet"><DialogTitle className="sr-only">Картка користувача</DialogTitle><DialogDescription className="sr-only">Профіль, ставки, оплати й нотатка</DialogDescription>{card}</DialogContent></Dialog>}

      {selected && <ExtendConfirmDialog open={cardExtendOpen} onOpenChange={setCardExtendOpen} items={[{ user: { id: selected.id!, username: selected.username, role: selected.isAdmin ? "admin" : "user", telegram: selected.telegram, priceMonth: selected.priceMonth, startDate: selected.startDate, endDate: selected.endDate }, days: selected.daysUntilExpiry ?? 0 }]} days={extendDays} busy={loading} subtitle="Дата закінчення зсунеться без запису оплати." onConfirm={() => extendUser(selected)} />}

      <UserEditorDialog mode="add" open={addDialogOpen} onClose={handleCloseAddDialog}
        value={newUser} onChange={updates => setNewUser(current => ({ ...current, ...updates }))}
        onSave={handleAddUser} busy={loading} password={lastCreatedPassword} />
      {editingUser && <UserEditorDialog mode="edit" userId={editingUser.id} roleLock={roleLockReason(currentAdmin, editingUser)} canAppointOwner={!!currentAdmin?.isOwner} open={editDialogOpen} onClose={handleCloseEditDialog}
        value={editingUser} onChange={updates => setEditingUser(current => current ? { ...current, ...updates } : current)}
        onSave={handleSaveEdit} busy={loading} password={lastResetPassword} onResetPassword={canResetPassword(currentAdmin, editingUser) ? handleResetPassword : undefined} />}

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="v3-modal sm:max-w-[460px]">
          <DialogTitle className="v3-modal-title">Видалити @{users[deletingIndex]?.username}?</DialogTitle>
          <DialogDescription className="v3-modal-sub">Акаунт зникне назавжди. Ставки й оплати залишаться в журналі дій. Цю дію не можна скасувати.</DialogDescription>
          <div className="v3-modal-foot"><span /><div className="v3-modal-actions"><button type="button" className="v3-btn v3-btn-ghost" onClick={() => setDeleteDialogOpen(false)}>Скасувати</button><button type="button" className="v3-btn v3-btn-red" onClick={handleDelete} disabled={loading}>{loading ? "Видаляємо…" : "Видалити"}</button></div></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
