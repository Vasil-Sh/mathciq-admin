import UserDirectory from "@/components/UserDirectory";
import UserEditorDialog from "@/components/UserEditorDialog";
import { useState, useEffect, useMemo } from "react";

import { authService } from "@/lib/authService";
import { cleanPrice, parseDate, getDaysUntilExpiry, isSubscriptionActive } from "@/lib/adminUtils";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Users, Calendar, CheckCircle, CheckCircle2, Copy, XCircle, Loader2, Bell, AlertTriangle, Crown, Plus, Pencil, Trash2, Save, X, Search, ArrowUpDown, ArrowUp, ArrowDown, Zap, User } from "lucide-react";
import { toast } from "sonner";
import type { UserData, StatusFilter, SortDirection } from "@/types";

const EMPTY_USER: Omit<UserData, "isActive" | "daysUntilExpiry"> = { telegram: "", username: "", priceMonth: "", startDate: "", endDate: "", isAdmin: false };

function todayFormatted() { const d = new Date(); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; }
function monthLaterFormatted() { const d = new Date(); d.setMonth(d.getMonth() + 1); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; }
function daysLabel(n: number) { if (n === 1) return "день"; if (n >= 2 && n <= 4) return "дні"; return "днів"; }
function subsLabel(n: number) { if (n === 1) return "підписка закінчується"; if (n >= 2 && n <= 4) return "підписки закінчуються"; return "підписок закінчуються"; }

export default function Admin() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState("");
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newUser, setNewUser] = useState({ ...EMPTY_USER });
  const [lastCreatedPassword, setLastCreatedPassword] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [lastResetPassword, setLastResetPassword] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingIndex, setDeletingIndex] = useState(-1);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    setLoading(true); setError("");
    try {
      const allUsers = await authService.fetchUsers();
      setUsers(allUsers.map(u => {
        const endDate = u.endDate || "";
        return { id: u.id, telegram: u.telegram || "", username: u.username || "", priceMonth: cleanPrice(String(u.priceMonth || "")), startDate: u.startDate || "", endDate, isActive: isSubscriptionActive(endDate), isAdmin: u.role === "admin", daysUntilExpiry: getDaysUntilExpiry(endDate) };
      }).filter(u => u.username));
      setLastUpdate(new Date().toLocaleString("uk-UA"));
    } catch { setError("Помилка завантаження даних"); }
    finally { setLoading(false); }
  };

  const handleAddUser = async () => {
    if (!newUser.username.trim() || !newUser.telegram.trim()) { toast.error("Заповніть Telegram та Username"); return; }
    if (users.some(u => u.username.toLowerCase() === newUser.username.toLowerCase().trim())) { toast.error("Користувач з таким username вже існує"); return; }
    setLoading(true);
    try {
      const result = await authService.createUser({ username: newUser.username.trim(), telegram: newUser.telegram.trim(), role: newUser.isAdmin ? "admin" : "user", priceMonth: cleanPrice(newUser.priceMonth.trim()), endDate: newUser.endDate.trim() });
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
      await authService.updateUser(editingUser.id, { telegram: editingUser.telegram, username: editingUser.username, role: editingUser.isAdmin ? "admin" : "user", priceMonth: cleanPrice(editingUser.priceMonth), startDate: editingUser.startDate, endDate: editingUser.endDate });
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

  const handleExtend = async (i: number) => {
    const u = users[i]; if (!u?.id) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const currentEnd = parseDate(u.endDate);
    const base = currentEnd && currentEnd > today ? currentEnd : today;
    const newEnd = new Date(base); newEnd.setDate(newEnd.getDate() + 30);
    const newEndStr = newEnd.toISOString().split("T")[0];
    setLoading(true);
    try { await authService.updateUser(u.id, { endDate: newEndStr }); toast.success(`Підписку продовжено — до ${newEndStr}`); await fetchUsers(); }
    catch (err: unknown) { toast.error((err as { message?: string }).message || "Помилка"); }
    finally { setLoading(false); }
  };

  const confirmDelete = (i: number) => { setDeletingIndex(i); setDeleteDialogOpen(true); };

  const handleDelete = async () => {
    const u = users[deletingIndex]; if (!u?.id) return; setLoading(true);
    try { await authService.deleteUser(u.id); toast.success(`Користувача "${u.username}" видалено!`); setDeleteDialogOpen(false); setDeletingIndex(-1); await fetchUsers(); }
    catch (err: unknown) { toast.error((err as { message?: string }).message || "Помилка"); }
    finally { setLoading(false); }
  };

  const activeUsers = users.filter(u => u.isActive).length;
  const inactiveUsers = users.filter(u => !u.isActive).length;
  const adminUsers = users.filter(u => u.isAdmin).length;
  const expiringUsers = users.filter(u => u.isActive && u.daysUntilExpiry !== undefined && u.daysUntilExpiry <= 3 && u.daysUntilExpiry >= 0);

  const displayedUsers = useMemo(() => {
    let result = users.map((u, i) => ({ user: u, originalIndex: i }));
    if (statusFilter === "active") result = result.filter(({ user: u }) => u.isActive);
    else if (statusFilter === "expired") result = result.filter(({ user: u }) => !u.isActive);
    const q = searchQuery.trim().toLowerCase();
    if (q) result = result.filter(({ user: u }) => u.telegram.toLowerCase().includes(q) || u.username.toLowerCase().includes(q));
    if (sortDirection) result = [...result].sort((a, b) => { const da = parseDate(a.user.endDate); const db = parseDate(b.user.endDate); const ta = da ? da.getTime() : 0; const tb = db ? db.getTime() : 0; return sortDirection === "asc" ? ta - tb : tb - ta; });
    return result;
  }, [users, statusFilter, searchQuery, sortDirection]);

  // Reset page when filter/search changes
  useEffect(() => { setPage(1); }, [statusFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(displayedUsers.length / PAGE_SIZE));
  const pagedUsers = displayedUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Clamp page when the list shrinks (e.g. after deleting all users on the
  // last page) — otherwise the page index goes out of range and shows "no data".
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="users-page">
      <div className="page-container space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4"><div><p className="page-eyebrow">КЕРУВАННЯ ПЛАТФОРМОЮ</p><h1 className="page-title">Користувачі</h1><p className="page-subtitle">Люди, підписки та доступ до MatchIQ.</p></div>
          <Button onClick={() => { setNewUser({ ...EMPTY_USER, startDate: todayFormatted(), endDate: monthLaterFormatted() }); setLastCreatedPassword(""); setAddDialogOpen(true); }} className="shadow-sm">
            <Plus className="h-4 w-4" />Додати користувача
          </Button>
        </div>
        {error && <Alert><AlertTriangle className="h-5 w-5 text-danger" /><AlertDescription>{error}</AlertDescription></Alert>}

        {expiringUsers.length > 0 && (
          <div className="rounded-card border border-amber-200 bg-warning-bg p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-warning mt-0.5 shrink-0" />
              <div>
                <strong className="font-medium text-ink">⚠️ {expiringUsers.length} {subsLabel(expiringUsers.length)} протягом 3 днів:</strong>
                <ul className="mt-2 space-y-1.5">{expiringUsers.map((u, i) => (
                  <li key={i} className="text-sm text-body">
                    <span className="font-medium text-ink">{u.telegram}</span> (<span>{u.username}</span>) — <span className="font-medium text-warning">{u.daysUntilExpiry === 0 ? "закінчується сьогодні" : `залишилось ${u.daysUntilExpiry} ${daysLabel(u.daysUntilExpiry ?? 0)}`}</span><span className="text-subtle ml-1">(до {u.endDate})</span>
                  </li>
                ))}</ul>
              </div>
            </div>
          </div>
        )}

        <div className="users-summary-grid">
          {[
            { icon: Users, label: "Всього користувачів", value: users.length, note: "Усі облікові записи", tone: "user-summary--blue" },
            { icon: CheckCircle, label: "Активні", value: activeUsers, note: "З активною підпискою", tone: "user-summary--green" },
            { icon: Crown, label: "Адміністратори", value: adminUsers, note: "Мають права керування", tone: "user-summary--amber" },
            { icon: XCircle, label: "Неактивні", value: inactiveUsers, note: "Підписка неактивна", tone: "user-summary--rose" },
          ].map(({ icon: Icon, label, value, note, tone }) => (
            <section key={label} className={`card-admin user-summary ${tone}`}>
              <div className="user-summary-top"><span className="user-summary-icon"><Icon size={19} strokeWidth={1.7} /></span><h2>{label}</h2></div>
              <strong className="user-summary-value">{value}</strong>
              <p className="user-summary-note"><span />{note}</p>
            </section>
          ))}
        </div>

        <UserDirectory
          rows={pagedUsers} counts={{ all: users.length, active: activeUsers, expired: inactiveUsers }}
          filteredCount={displayedUsers.length} updated={lastUpdate} busy={loading}
          search={searchQuery} onSearch={setSearchQuery} status={statusFilter} onStatus={setStatusFilter}
          sort={sortDirection} onSort={setSortDirection} page={page} pageSize={PAGE_SIZE}
          totalPages={totalPages} onPage={setPage} onRefresh={fetchUsers}
          onEdit={openEditDialog} onExtend={handleExtend} onDelete={confirmDelete}
        />
      </div>

      <UserEditorDialog mode="add" open={addDialogOpen} onClose={handleCloseAddDialog}
        value={newUser} onChange={updates => setNewUser(current => ({ ...current, ...updates }))}
        onSave={handleAddUser} busy={loading} password={lastCreatedPassword} />
      {editingUser && <UserEditorDialog mode="edit" open={editDialogOpen} onClose={handleCloseEditDialog}
        value={editingUser} onChange={updates => setEditingUser(current => current ? { ...current, ...updates } : current)}
        onSave={handleSaveEdit} busy={loading} password={lastResetPassword} onResetPassword={handleResetPassword} />}

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md !p-0 !gap-0 overflow-x-hidden overflow-y-auto">
          <div className="px-6 pt-6 pb-6">
            <DialogTitle className="flex items-center gap-2.5 mb-1.5">
              <div className="w-9 h-9 rounded-btn bg-danger-bg flex items-center justify-center"><Trash2 className="h-5 w-5 text-danger" /></div>
              Видалити користувача?
            </DialogTitle>
            <DialogDescription>Ви впевнені, що хочете видалити "<span className="text-ink font-medium">{users[deletingIndex]?.username}</span>"? Цю дію неможливо скасувати.</DialogDescription>
          </div>
          <div className="px-6 py-4 flex flex-row justify-end gap-3">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Скасувати</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Видалити</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
