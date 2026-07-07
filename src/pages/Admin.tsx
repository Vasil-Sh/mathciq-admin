import { useState, useEffect, useMemo } from "react";

import { authService } from "@/lib/authService";
import { cleanPrice, parseDate, getDaysUntilExpiry, isSubscriptionActive } from "@/lib/adminUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Calendar, CheckCircle, XCircle, Loader2, Bell, AlertTriangle, Crown, Plus, Pencil, Trash2, Save, X, Search, ArrowUpDown, ArrowUp, ArrowDown, Zap } from "lucide-react";
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
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingIndex, setDeletingIndex] = useState(-1);

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
      toast.success(`Користувача "${result.username}" створено!`, { description: `Пароль: ${result.password}`, duration: 15000 });
      setNewUser({ ...EMPTY_USER }); setAddDialogOpen(false);
      await fetchUsers();
    } catch (err: unknown) { toast.error((err as { message?: string }).message || "Помилка"); }
    finally { setLoading(false); }
  };

  const openEditDialog = (u: UserData, i: number) => { setEditingUser({ ...u }); setEditDialogOpen(true); };

  const handleSaveEdit = async () => {
    if (!editingUser?.id) return; setLoading(true);
    try {
      await authService.updateUser(editingUser.id, { telegram: editingUser.telegram, username: editingUser.username, role: editingUser.isAdmin ? "admin" : "user", priceMonth: cleanPrice(editingUser.priceMonth), startDate: editingUser.startDate, endDate: editingUser.endDate });
      toast.success("Дані оновлено!"); setEditDialogOpen(false); setEditingUser(null);
      await fetchUsers();
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

  const getExpiryBadge = (u: UserData) => {
    if (!u.isActive) return <Badge variant="expired"><XCircle className="mr-1.5 h-3.5 w-3.5" />Закінчилась</Badge>;
    const days = u.daysUntilExpiry ?? -999;
    if (days <= 3 && days >= 0) return <span className="inline-flex items-center rounded-btn bg-amber-500/10 text-amber-600 border border-amber-300 px-2.5 py-0.5 text-xs font-medium animate-pulse"><AlertTriangle className="mr-1.5 h-3.5 w-3.5" />{days === 0 ? "Сьогодні!" : `${days} ${daysLabel(days)}`}</span>;
    if (days <= 7) return <Badge variant="warning"><Bell className="mr-1.5 h-3.5 w-3.5" />{days} {daysLabel(days)}</Badge>;
    return <Badge variant="active"><CheckCircle className="mr-1.5 h-3.5 w-3.5" />Активна ({days} {daysLabel(days)})</Badge>;
  };

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-8 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-ink">Користувачі</h2>
          <Button onClick={() => { setNewUser({ ...EMPTY_USER, startDate: todayFormatted(), endDate: monthLaterFormatted() }); setAddDialogOpen(true); }} className="!bg-success-bg !text-success !border !border-green-200 hover:!bg-green-100 !shadow-none">
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

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[{ icon: Users, label: "Всього", value: users.length, color: "text-primary" }, { icon: CheckCircle, label: "Активні", value: activeUsers, color: "text-success" }, { icon: Crown, label: "Адміни", value: adminUsers, color: "text-warning" }, { icon: XCircle, label: "Неактивні", value: inactiveUsers, color: "text-danger" }].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="card-admin p-6 flex flex-col gap-3">
              <Icon className={`h-5 w-5 ${color}`} strokeWidth={1.5} />
              <div><p className="text-xs text-muted uppercase tracking-wider">{label}</p><p className="text-4xl font-bold text-ink mt-1 tracking-tight">{value}</p></div>
            </div>
          ))}
        </div>

        {/* Users Table */}
        <div className="card-admin overflow-hidden">
          <div className="p-6 border-b border-hairline">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-surface-subtle rounded-btn"><Users className="h-5 w-5 text-ink" strokeWidth={1.5} /></div>
                <div><h2 className="text-lg font-semibold text-ink">Список користувачів</h2><p className="text-xs text-muted mt-0.5">Оновлено: {lastUpdate || "—"}</p></div>
              </div>
              <div className="text-sm text-muted">Показано: {displayedUsers.length} з {users.length}</div>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3 rounded-btn bg-surface-subtle border border-hairline p-3">
              <div className="inline-flex rounded-btn bg-surface p-1 border border-hairline shadow-sm">
                {[{ key: "all" as StatusFilter, label: "Всі", count: users.length }, { key: "active" as StatusFilter, label: "Активні", count: activeUsers }, { key: "expired" as StatusFilter, label: "Прострочені", count: inactiveUsers }].map(tab => (
                  <button key={tab.key} onClick={() => setStatusFilter(tab.key)} className={`px-4 py-2 rounded-btn text-sm font-medium transition-all ${statusFilter === tab.key ? "bg-primary text-white shadow-primary-glow" : "text-muted hover:text-body hover:bg-surface-subtle"}`}>{tab.label}<span className={`ml-2 text-xs font-semibold ${statusFilter === tab.key ? "text-white/70" : "text-subtle"}`}>{tab.count}</span></button>
                ))}
              </div>
              <div className="relative flex-1 min-w-[180px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-subtle" />
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Пошук..." className="w-full h-10 pl-9 pr-9 rounded-input border border-hairline bg-surface text-ink text-sm placeholder:text-subtle focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-colors" />
                {searchQuery && <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle hover:text-ink"><X className="h-4 w-4" /></button>}
              </div>
              <Select value={sortDirection ?? "none"} onValueChange={v => setSortDirection(v === "none" ? null : v as SortDirection)}>
                <SelectTrigger className="w-auto min-w-[200px]">
                  <div className="flex items-center gap-2">
                    {sortDirection === "asc" ? <ArrowUp className="h-4 w-4 text-primary" /> : sortDirection === "desc" ? <ArrowDown className="h-4 w-4 text-primary" /> : <ArrowUpDown className="h-4 w-4 text-subtle" />}
                    <SelectValue placeholder="Сортувати" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без сортування</SelectItem>
                  <SelectItem value="asc">Скоро закінчаться ↑</SelectItem>
                  <SelectItem value="desc">Пізніше закінчаться ↓</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="border-r border-hairline">Telegram</TableHead>
                  <TableHead className="border-r border-hairline">Username</TableHead>
                  <TableHead className="border-r border-hairline">Ціна</TableHead>
                  <TableHead className="border-r border-hairline">Початок</TableHead>
                  <TableHead className="border-r border-hairline"><button onClick={() => setSortDirection(p => p === null ? "asc" : p === "asc" ? "desc" : null)} className="flex items-center gap-1 hover:text-ink transition-colors">Закінчення{sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : sortDirection === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3" />}</button></TableHead>
                  <TableHead className="border-r border-hairline">Статус</TableHead>
                  <TableHead className="border-r border-hairline">Адмін</TableHead>
                  <TableHead className="text-center">Дії</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedUsers.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-16 text-muted">{loading ? <div className="flex items-center justify-center gap-2"><Loader2 className="h-5 w-5 animate-spin" />Завантаження...</div> : <div><div className="p-6 bg-surface-subtle rounded-card inline-block mb-4"><Users className="h-12 w-12 text-subtle" /></div><p>{searchQuery || statusFilter !== "all" ? "Нічого не знайдено" : "Немає даних"}</p></div>}</TableCell></TableRow>
                ) : displayedUsers.map(({ user: u, originalIndex }) => (
                  <TableRow key={originalIndex} className={u.isActive && u.daysUntilExpiry !== undefined && u.daysUntilExpiry <= 3 && u.daysUntilExpiry >= 0 ? "!bg-warning-bg/50" : ""}>
                    <TableCell className="text-ink font-medium border-r border-hairline">{u.telegram}</TableCell>
                    <TableCell className="border-r border-hairline">{u.username}{u.isAdmin && <span className="ml-1.5">👑</span>}</TableCell>
                    <TableCell className="border-r border-hairline"><Badge variant="active">{cleanPrice(u.priceMonth)} грн</Badge></TableCell>
                    <TableCell className="text-muted border-r border-hairline"><div className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-subtle" />{u.startDate}</div></TableCell>
                    <TableCell className="text-muted border-r border-hairline"><div className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-subtle" />{u.endDate}</div></TableCell>
                    <TableCell className="border-r border-hairline">{getExpiryBadge(u)}</TableCell>
                    <TableCell className="border-r border-hairline">{u.isAdmin ? <Badge variant="admin"><Crown className="mr-1 h-3.5 w-3.5" />Так</Badge> : <Badge variant="default">Ні</Badge>}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => handleExtend(originalIndex)} className="flex items-center justify-center w-8 h-8 rounded-btn hover:bg-success-bg text-success transition-colors" title="Продовжити на 30 днів"><Zap className="h-4 w-4" /></button>
                        <button onClick={() => openEditDialog(u, originalIndex)} className="flex items-center justify-center w-8 h-8 rounded-btn hover:bg-surface-hover text-primary transition-colors" title="Редагувати"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => confirmDelete(originalIndex)} className="flex items-center justify-center w-8 h-8 rounded-btn hover:bg-danger-bg text-danger transition-colors" title="Видалити"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Add Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-success" />Додати користувача</DialogTitle><DialogDescription>Заповніть дані нового користувача</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Telegram *</Label><Input value={newUser.telegram} onChange={e => setNewUser({ ...newUser, telegram: e.target.value })} placeholder="@username" className="mt-1.5" /></div>
              <div><Label>Username *</Label><Input value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })} placeholder="login" className="mt-1.5" /></div>
            </div>
            <div><Label>Ціна / місяць (грн)</Label><Input value={newUser.priceMonth} onChange={e => setNewUser({ ...newUser, priceMonth: e.target.value })} placeholder="100" className="mt-1.5" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Дата початку</Label><div className="mt-1.5"><DatePicker value={newUser.startDate} onChange={val => setNewUser({ ...newUser, startDate: val })} placeholder="Оберіть дату" /></div></div>
              <div><Label>Дата закінчення</Label><div className="mt-1.5"><DatePicker value={newUser.endDate} onChange={val => setNewUser({ ...newUser, endDate: val })} placeholder="Оберіть дату" /></div></div>
            </div>
            <label className="flex items-center gap-2 text-sm text-body cursor-pointer"><input type="checkbox" checked={newUser.isAdmin} onChange={e => setNewUser({ ...newUser, isAdmin: e.target.checked })} className="rounded accent-primary" />Адміністратор</label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddDialogOpen(false)}>Скасувати</Button>
            <Button onClick={handleAddUser} disabled={loading} className="!bg-success-bg !text-success !border !border-green-200 hover:!bg-green-100 !shadow-none">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Створити</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="h-5 w-5 text-primary" />Редагувати: {editingUser?.username}</DialogTitle><DialogDescription>Змініть дані користувача</DialogDescription></DialogHeader>
          {editingUser && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Telegram</Label><Input value={editingUser.telegram} onChange={e => setEditingUser({ ...editingUser, telegram: e.target.value })} className="mt-1.5" /></div>
                <div><Label>Username</Label><Input value={editingUser.username} onChange={e => setEditingUser({ ...editingUser, username: e.target.value })} className="mt-1.5" /></div>
              </div>
              <div><Label>Ціна / місяць (грн)</Label><Input value={editingUser.priceMonth} onChange={e => setEditingUser({ ...editingUser, priceMonth: e.target.value })} className="mt-1.5" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Дата початку</Label><div className="mt-1.5"><DatePicker value={editingUser.startDate} onChange={val => setEditingUser({ ...editingUser, startDate: val })} /></div></div>
                <div><Label>Дата закінчення</Label><div className="mt-1.5"><DatePicker value={editingUser.endDate} onChange={val => setEditingUser({ ...editingUser, endDate: val })} /></div></div>
              </div>
              <label className="flex items-center gap-2 text-sm text-body cursor-pointer"><input type="checkbox" checked={editingUser.isAdmin} onChange={e => setEditingUser({ ...editingUser, isAdmin: e.target.checked })} className="rounded accent-primary" />Адміністратор</label>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditDialogOpen(false)}>Скасувати</Button>
            <Button onClick={handleSaveEdit} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Зберегти</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-danger"><Trash2 className="h-5 w-5" />Видалити користувача?</DialogTitle><DialogDescription>Ви впевнені, що хочете видалити "<span className="text-ink font-medium">{users[deletingIndex]?.username}</span>"? Цю дію неможливо скасувати.</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Скасувати</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Видалити</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
