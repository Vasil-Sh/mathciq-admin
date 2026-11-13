import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  BarChart3, ChevronDown, CircleDollarSign, CreditCard, History, KeyRound, LayoutDashboard,
  LogOut, Megaphone, Menu, MessageCircle, MonitorSmartphone, Settings2, Swords, Users, X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavBadges } from "@/hooks/useNavBadges";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

type NavKey = "support" | "matches";
const navigation: { label: string; href: string; icon: typeof Users; badge?: NavKey }[] = [
  { label: "Дашборд", href: "/dashboard", icon: LayoutDashboard },
  { label: "Користувачі", href: "/users", icon: Users },
  { label: "Оплати", href: "/payments", icon: CreditCard },
  { label: "Ставки", href: "/bets", icon: CircleDollarSign },
  { label: "Реклама", href: "/banners", icon: Megaphone },
  { label: "Матчі", href: "/matches", icon: Swords, badge: "matches" },
  { label: "Підтримка", href: "/support", icon: MessageCircle, badge: "support" },
  { label: "Налаштування", href: "/settings", icon: Settings2 },
];

function Logo({ onClick }: { onClick?: () => void }) {
  return (
    <Link to="/dashboard" className="v3-logo" onClick={onClick} aria-label="MatchIQ Admin — дашборд">
      <span className="v3-logo-mark"><BarChart3 size={18} strokeWidth={2.4} aria-hidden="true" /></span>
      <span className="v3-logo-name">MatchIQ</span>
      <span className="v3-logo-badge">Admin</span>
    </Link>
  );
}

export default function AdminLayout() {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const onAudit = pathname.startsWith("/audit");
  const badges = useNavBadges(user?.username, onAudit);
  const roleName = user?.isOwner ? "Овнер" : "Адмін";
  const initial = (user?.username || "A").replace(/^@/, "").charAt(0).toUpperCase();
  const handle = (user?.username || "admin").replace(/^@/, "");
  const loginAt = Number(localStorage.getItem("loginAt") || 0);
  const loginNote = loginAt ? `вхід ${new Date(loginAt).toDateString() === new Date().toDateString() ? "сьогодні" : new Date(loginAt).toLocaleDateString("uk-UA", { day: "numeric", month: "short" })} о ${new Date(loginAt).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}` : "";

  useEffect(() => { setMobileOpen(false); setAccountOpen(false); }, [pathname]);
  useEffect(() => {
    if (!accountOpen) return;
    const close = (e: MouseEvent) => { if (!accountRef.current?.contains(e.target as Node)) setAccountOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAccountOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [accountOpen]);

  const badgeFor = (key?: NavKey) => {
    if (key === "support" && badges.supportOpen) return <span className="v3-count" aria-label={`${badges.supportOpen} відкритих звернень`}>{badges.supportOpen}</span>;
    if (key === "matches" && badges.matchesError) return <span className="v3-count" aria-label={badges.matchesErrorText || "Помилка парсера"} title={badges.matchesErrorText || "Помилка парсера"}>!</span>;
    return null;
  };
  const auditCount = badges.auditUnseen ? (badges.auditMore ? `${badges.auditUnseen}+` : String(badges.auditUnseen)) : "";

  const auditButton = (
    <Link to="/audit" className={`v3-audit${onAudit ? " is-active" : ""}`} aria-label={auditCount ? `Журнал дій: ${auditCount} нових змін` : "Журнал дій"} aria-current={onAudit ? "page" : undefined} title="Журнал дій">
      <History size={19} aria-hidden="true" />
      {auditCount && !onAudit && <span className="v3-count v3-count-float">{auditCount}</span>}
    </Link>
  );

  return (
    <div className="v3-shell">
      <a href="#main-content" className="skip-link">Перейти до вмісту</a>
      <header className="v3-header">
        <Logo />
        <nav aria-label="Основна навігація" className="v3-nav">
          {navigation.map(({ label, href, badge }) => (
            <NavLink key={href} to={href} className={({ isActive }) => `v3-navlink${isActive ? " is-active" : ""}`}>
              {label}{badgeFor(badge)}
            </NavLink>
          ))}
        </nav>
        <div className="v3-header-end">
          {auditButton}
          <div className="v3-account" ref={accountRef}>
            <button type="button" className="v3-account-btn" aria-haspopup="menu" aria-expanded={accountOpen} onClick={() => setAccountOpen((o) => !o)}>
              <span className="v3-avatar" aria-hidden="true">{initial}</span>
              <span className="v3-account-copy"><strong>@{(user?.username || "admin").replace(/^@/, "")}</strong><small>{roleName}</small></span>
              <ChevronDown size={16} aria-hidden="true" />
            </button>
            {accountOpen && (
              <div className="v3-account-menu" role="menu">
                <div className="v3-account-head">
                  <span className="v3-avatar v3-avatar-ink" aria-hidden="true">{initial}</span>
                  <span><strong>@{handle}</strong><small>{roleName}{loginNote && ` · ${loginNote}`}</small></span>
                </div>
                <Link role="menuitem" to="/settings#account" className="v3-menu-item"><KeyRound size={17} aria-hidden="true" />Мій пароль</Link>
                <Link role="menuitem" to="/settings#account" className="v3-menu-item"><MonitorSmartphone size={17} aria-hidden="true" />Активні сесії</Link>
                <Link role="menuitem" to={`/audit?q=${encodeURIComponent(handle)}`} className="v3-menu-item"><History size={17} aria-hidden="true" />Мої дії в журналі</Link>
                <div className="v3-menu-sep" />
                <button role="menuitem" type="button" className="v3-menu-item is-danger" onClick={() => { setAccountOpen(false); setLogoutOpen(true); }}><LogOut size={17} aria-hidden="true" />Вийти</button>
              </div>
            )}
          </div>
          <button type="button" className="v3-burger" onClick={() => setMobileOpen(true)} aria-label="Відкрити меню" aria-expanded={mobileOpen}><Menu size={21} aria-hidden="true" /></button>
        </div>
      </header>

      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="v3-mobile-menu">
          <DialogTitle className="sr-only">Меню</DialogTitle>
          <DialogDescription className="sr-only">Розділи панелі адміністратора</DialogDescription>
          <div className="v3-mobile-top">
            <Logo onClick={() => setMobileOpen(false)} />
            <button type="button" className="v3-icon-btn" onClick={() => setMobileOpen(false)} aria-label="Закрити меню"><X size={20} aria-hidden="true" /></button>
          </div>
          <nav aria-label="Основна навігація" className="v3-mobile-nav">
            {[...navigation.slice(0, -1), { label: "Журнал дій", href: "/audit", icon: History, badge: undefined }, navigation[navigation.length - 1]].map(({ label, href, icon: Icon, badge }) => (
              <NavLink key={href} to={href} className={({ isActive }) => `v3-mobile-link${isActive ? " is-active" : ""}`} onClick={() => setMobileOpen(false)}>
                <Icon size={20} aria-hidden="true" />{label}
                {href === "/users" && !!badges.usersExpiring && <span className="v3-push v3-expiring"><span>{badges.usersExpiring}</span>закінчуються</span>}
                {href === "/audit" && auditCount && !onAudit && <span className="v3-push v3-count">{auditCount}</span>}
                {badgeFor(badge) && <span className="v3-push">{badgeFor(badge)}</span>}
              </NavLink>
            ))}
          </nav>
          <div className="v3-mobile-account">
            <div className="v3-mobile-account-who">
              <span className="v3-avatar v3-avatar-lg" aria-hidden="true">{initial}</span>
              <div><strong>@{(user?.username || "admin").replace(/^@/, "")}</strong><small>{roleName} · MatchIQ</small></div>
            </div>
            <div className="v3-mobile-account-actions">
              <Link to="/settings#account" className="v3-btn v3-btn-ghost-dark" onClick={() => setMobileOpen(false)}><KeyRound size={16} aria-hidden="true" />Пароль і сесії</Link>
              <button type="button" className="v3-btn v3-btn-danger-outline" onClick={() => { setMobileOpen(false); setLogoutOpen(true); }}><LogOut size={16} aria-hidden="true" />Вийти з акаунта</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <main id="main-content" className="v3-main"><Outlet /></main>
      <footer className="v3-footer"><span>MatchIQ / Панель керування</span><span>Все важливе. В одному місці.</span></footer>

      <Dialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <DialogContent className="v3-modal sm:max-w-[440px]">
          <DialogTitle className="v3-modal-title">Вийти з адмінки?</DialogTitle>
          <DialogDescription className="v3-modal-sub">Незбережені зміни в Налаштуваннях буде втрачено.</DialogDescription>
          <div className="v3-modal-foot"><span /><div className="v3-modal-actions">
            <button type="button" className="v3-btn v3-btn-ghost" onClick={() => setLogoutOpen(false)}>Скасувати</button>
            <button type="button" className="v3-btn v3-btn-red" onClick={() => { setLogoutOpen(false); localStorage.removeItem("loginAt"); logout(); }}>Вийти</button>
          </div></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
