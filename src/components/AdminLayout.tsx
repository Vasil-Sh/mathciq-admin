import { useState } from "react";
import { Link, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LayoutDashboard, Users, LogOut, ChartNoAxesCombined, Menu, ChevronRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const navigation = [
  { label: "Дашборд", href: "/dashboard", icon: LayoutDashboard },
  { label: "Користувачі", href: "/users", icon: Users },
];

export default function AdminLayout() {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const currentPage = navigation.find(item => item.href === pathname)?.label || "Огляд";
  const sidebar = (close?: () => void) => <>
    <Link to="/dashboard" className="brand" onClick={close} aria-label="MatchIQ — дашборд">
      <span className="brand-mark"><ChartNoAxesCombined size={23} /></span>
      <span>Match<span className="text-blue-400">IQ</span><small>ADMIN WORKSPACE</small></span>
    </Link>
    <div className="sidebar-divider" />
    <div className="sidebar-section-label">РОБОЧИЙ ПРОСТІР</div>
    <nav aria-label="Основна навігація" className="space-y-1.5">
      {navigation.map(({ label, href, icon: Icon }) => <Link key={href} to={href} onClick={close} aria-current={pathname === href ? "page" : undefined} className={`sidebar-link ${pathname === href ? "is-active" : ""}`}>
        <Icon size={19} /><span>{label}</span>{pathname === href && <ChevronRight size={15} className="ml-auto" />}
      </Link>)}
    </nav>
    <div className="sidebar-bottom">
      <button className="sidebar-exit" onClick={() => { close?.(); setLogoutOpen(true); }}><LogOut size={17} /><span>Вийти з акаунта</span></button>
    </div>
  </>;
  return <div className="app-shell">
    <a href="#main-content" className="skip-link">Перейти до вмісту</a>
    <aside className="desktop-sidebar">{sidebar()}</aside>
    <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
      <DialogContent className="mobile-sidebar-dialog">
        <DialogTitle className="sr-only">Навігація</DialogTitle>
        <DialogDescription className="sr-only">Розділи панелі адміністратора</DialogDescription>
        {sidebar(() => setMobileOpen(false))}
      </DialogContent>
    </Dialog>
    <div className="app-content">
      <header className="workspace-header">
        <div className="flex items-center gap-3"><button onClick={() => setMobileOpen(true)} className="mobile-menu" aria-label="Відкрити навігацію"><Menu size={21} /></button><span className="hidden sm:inline text-muted">Робочий простір</span><ChevronRight size={14} className="hidden sm:block text-subtle" /><span className="font-medium">{currentPage}</span></div>
        <div className="flex items-center gap-3"><span className="header-role">Адміністратор</span><span className="header-avatar" title={user?.username}>{user?.username?.[0]?.toUpperCase() || "A"}</span></div>
      </header>
      <main id="main-content" className="min-w-0"><Outlet /></main>
      <footer className="workspace-footer"><span>MatchIQ / Панель керування</span><span>Все важливе. В одному місці.</span></footer>
    </div>
    <Dialog open={logoutOpen} onOpenChange={setLogoutOpen}>
      <DialogContent className="sm:max-w-md"><DialogHeader><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-danger-bg text-danger shrink-0"><LogOut size={21} /></span><DialogTitle className="text-left">Вийти з облікового запису?</DialogTitle></div><DialogDescription className="text-left">Щоб повернутися до робочого простору, потрібно буде увійти знову.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setLogoutOpen(false)}>Скасувати</Button><Button variant="destructive" onClick={() => { setLogoutOpen(false); logout(); }}>Вийти</Button></DialogFooter></DialogContent>
    </Dialog>
  </div>;
}
