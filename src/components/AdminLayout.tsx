import { useState } from "react";
import { Link, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Users, LogOut, TrendingUp, Menu, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const navigation = [
  { label: "Дашборд", href: "/dashboard", icon: LayoutDashboard },
  { label: "Користувачі", href: "/users", icon: Users },
];

function NavItems({ location }: { location: string }) {
  return (
    <>
      {navigation.map((item) => {
        const Icon = item.icon;
        const isActive = location === item.href;

        return (
          <Link
            key={item.href}
            to={item.href}
            className={cn(
              "group relative flex items-center gap-3 px-5 py-4 rounded-card text-base font-normal transition-all duration-200",
              isActive
                ? "bg-primary text-white shadow-primary-glow"
                : "text-muted hover:text-ink hover:bg-surface-subtle"
            )}
          >
            <Icon className="h-5 w-5" strokeWidth={1.5} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </>
  );
}

export default function AdminLayout() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    setLogoutOpen(false);
    logout();
  };

  return (
    <div className="min-h-screen bg-canvas flex">
      {/* ── Left Sidebar ── */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-72 lg:flex-col">
        <div className="flex grow flex-col gap-y-6 overflow-y-auto bg-white px-6 py-8 border-r border-hairline shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
          {/* Logo */}
          <div className="flex h-16 shrink-0 items-center gap-3">
            <div className="w-12 h-12 bg-primary rounded-card flex items-center justify-center shadow-primary-glow">
              <TrendingUp className="w-6 h-6 text-white" strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-ink leading-tight">MatchIQ</h1>
              <p className="text-xs text-subtle">Адмін</p>
            </div>
          </div>

          <div className="-mx-6 border-t border-hairline" />

          {/* Nav */}
          <nav className="flex flex-1 flex-col">
            <ul className="flex flex-1 flex-col gap-y-6">
              <li>
                <ul className="space-y-1">
                  <NavItems location={location.pathname} />
                </ul>
              </li>

              {/* Bottom section */}
              <li className="mt-auto space-y-3">
                <div className="px-5 py-4 bg-surface-subtle rounded-card border border-hairline flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold">
                    {user?.username?.[0]?.toUpperCase() || "A"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{user?.username}</p>
                    <p className="text-xs text-muted">Адміністратор</p>
                  </div>
                </div>

                <Button className="w-full justify-start !bg-danger-bg !text-danger !border !border-red-200 hover:!bg-red-100 !shadow-none rounded-btn" onClick={() => setLogoutOpen(true)}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Вийти
                </Button>
              </li>
            </ul>
          </nav>
        </div>
      </aside>

      {/* ── Logout confirmation dialog ── */}
      <Dialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-danger-bg flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-danger" strokeWidth={1.5} />
            </div>
            <DialogTitle className="text-center">Підтвердження виходу</DialogTitle>
            <DialogDescription className="text-center">
              Ви впевнені, що хочете вийти з адмін-панелі?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center gap-3">
            <Button variant="outline" onClick={() => setLogoutOpen(false)} className="rounded-btn min-w-[100px]">
              Скасувати
            </Button>
            <Button onClick={handleLogout} className="rounded-btn min-w-[100px] !bg-danger !text-white hover:!bg-danger/90 !shadow-none !border-0">
              Вийти
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Mobile header ── */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 border-b border-hairline bg-surface/90 backdrop-blur-sm flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1 -ml-1 rounded-lg hover:bg-surface-subtle transition-colors"
          >
            <Menu className="h-5 w-5 text-ink" strokeWidth={1.5} />
          </button>
          <h1 className="text-lg font-semibold text-ink">MatchIQ Admin</h1>
        </div>
        <button
          onClick={() => setLogoutOpen(true)}
          className="p-1.5 rounded-lg hover:bg-danger-bg transition-colors text-muted hover:text-danger"
        >
          <LogOut className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </header>

      {/* ── Mobile slide-out nav ── */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-white border-r border-hairline shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-hairline">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary rounded-card flex items-center justify-center shadow-primary-glow">
                  <TrendingUp className="w-5 h-5 text-white" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-base font-semibold text-ink leading-tight">MatchIQ</p>
                  <p className="text-xs text-subtle">Адмін</p>
                </div>
              </div>
              <button onClick={() => setMobileOpen(false)} className="p-1.5 rounded-lg hover:bg-surface-subtle">
                <X className="h-5 w-5 text-subtle" strokeWidth={1.5} />
              </button>
            </div>
            <nav className="flex-1 px-4 py-6 space-y-1">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-card text-base transition-colors",
                      isActive
                        ? "bg-primary text-white"
                        : "text-muted hover:text-ink hover:bg-surface-subtle"
                    )}
                  >
                    <Icon className="h-5 w-5" strokeWidth={1.5} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="px-4 py-4 border-t border-hairline space-y-3">
              <div className="flex items-center gap-3 px-4 py-3 bg-surface-subtle rounded-card border border-hairline">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold">
                  {user?.username?.[0]?.toUpperCase() || "A"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{user?.username}</p>
                  <p className="text-xs text-muted">Адміністратор</p>
                </div>
              </div>
              <Button
                className="w-full justify-start !bg-danger-bg !text-danger !border !border-red-200 hover:!bg-red-100 !shadow-none rounded-btn"
                onClick={() => { setMobileOpen(false); setLogoutOpen(true); }}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Вийти
              </Button>
            </div>
          </aside>
        </div>
      )}

      {/* ── Main content ── */}
      <main className="flex-1 lg:pl-72 pt-14 lg:pt-0">
        <Outlet />
      </main>
    </div>
  );
}
