import { useEffect, useRef, useState } from "react";
import { getExpiringWindow } from "@/lib/usersModel";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import PageErrorBoundary from "@/components/PageErrorBoundary";
import { BarChart3, Bug, Check, ChevronDown, CircleDollarSign, CreditCard, History, KeyRound, LayoutDashboard, LogOut, Megaphone, Menu, MessageCircle, MonitorSmartphone, Search, Settings2, Swords, Users, X, Send } from "lucide-react";
import CommandPalette from "@/components/CommandPalette";
import { useAuth } from "@/contexts/AuthContext";
import UserAvatar from "@/components/UserAvatar";
import { api, getRefreshToken } from "@/lib/apiClient";
import { plural } from "@/lib/dashboardInsights";
import { useNavBadges } from "@/hooks/useNavBadges";
import { setIconBadge } from "@/lib/appBadge";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import StarField from "./StarField";
import MobileDrawer, { MobileTabBar } from "@/components/MobileDrawer";
import PillTrack from "@/components/PillTrack";
import { PageSearchProvider, usePageSearchHost, isPhoneWidth } from "@/lib/pageSearch";
import { fetchServerErrors } from "@/lib/serverErrorsApi";

type NavKey = "support" | "matches";
const navigation: { label: string; href: string; icon: typeof Users; badge?: NavKey }[] = [
  { label: "Дашборд", href: "/dashboard", icon: LayoutDashboard },
  { label: "Користувачі", href: "/users", icon: Users },
  { label: "Оплати", href: "/payments", icon: CreditCard },
  { label: "Ставки", href: "/bets", icon: CircleDollarSign },
  { label: "Реклама", href: "/banners", icon: Megaphone },
  { label: "Матчі", href: "/matches", icon: Swords, badge: "matches" },
  { label: "Telegram", href: "/telegram", icon: Send },
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
  return <PageSearchProvider><AdminShell /></PageSearchProvider>;
}

/** Phone header search field (design 22.11): replaces the logo and buttons; «Скасувати» closes it and clears the query. */
function HeaderSearch() {
  const ps = usePageSearchHost();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ps?.open) inputRef.current?.focus(); }, [ps?.open]);
  if (!ps?.open || !ps.placeholder) return null;
  const close = () => { ps.setQ(""); ps.setOpen(false); };
  return (
    <div className="v3-hsearch" role="search">
      <label className="v3-hsearch-field">
        <Search size={17} aria-hidden="true" />
        <input ref={inputRef} type="search" enterKeyHint="search" aria-label={ps.placeholder} placeholder={ps.placeholder} value={ps.q} onChange={(e) => ps.setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") close(); }} />
        {ps.q && <button type="button" className="v3-hsearch-clear" aria-label="Очистити пошук" onClick={() => { ps.setQ(""); inputRef.current?.focus(); }}><X size={12} strokeWidth={3} aria-hidden="true" /></button>}
      </label>
      <button type="button" className="v3-hsearch-cancel" onClick={close}>Скасувати</button>
    </div>
  );
}

function AdminShell() {
  const pageSearch = usePageSearchHost();
  const { pathname, hash } = useLocation();
  const { user, logout } = useAuth();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const [sessionCount, setSessionCount] = useState<number | null>(null);
  const [myActions, setMyActions] = useState<number | null>(null);
  const [logoutOthers, setLogoutOthers] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const onAudit = pathname.startsWith("/audit");
  const badges = useNavBadges(user?.username, onAudit);
  const roleName = user?.isOwner ? "Овнер" : "Адмін";
  const handle = (user?.username || "admin").replace(/^@/, "");
  const loginAt = Number(localStorage.getItem("loginAt") || 0);
  const loginNote = loginAt ? `вхід ${new Date(loginAt).toDateString() === new Date().toDateString() ? "сьогодні" : new Date(loginAt).toLocaleDateString("uk-UA", { day: "numeric", month: "short" })} о ${new Date(loginAt).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}` : "";

  useEffect(() => { setMobileOpen(false); setAccountOpen(false); }, [pathname]);
  // Counters in the account menu and the logout dialog — loaded when either opens.
  useEffect(() => {
    if (!accountOpen && !logoutOpen) return;
    let cancelled = false;
    api.get<{ sessions: unknown[] }>("/auth/sessions").then((r) => { if (!cancelled) setSessionCount(r.sessions?.length ?? null); }).catch(() => {});
    if (accountOpen) api.get<{ total?: number }>(`/admin/audit?page=1&category=all&status=all&q=&from=&to=&userId=&history=&actor=${encodeURIComponent(handle)}`).then((r) => { if (!cancelled && typeof r.total === "number") setMyActions(r.total); }).catch(() => {});
    return () => { cancelled = true; };
  }, [accountOpen, logoutOpen, handle]);
  useEffect(() => { if (logoutOpen) setLogoutOthers(false); }, [logoutOpen]);
  const otherSessions = sessionCount ? sessionCount - 1 : 0;

  async function doLogout() {
    setLoggingOut(true);
    // Revoke on the server first (best-effort), then clear the local session.
    try { await api.post(logoutOthers ? "/auth/logout-all" : "/auth/logout", logoutOthers ? { refreshToken: getRefreshToken() } : {}); } catch { /* local logout still happens */ }
    setLoggingOut(false);
    setLogoutOpen(false);
    localStorage.removeItem("loginAt");
    logout();
  }
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
    if (key === "matches" && badges.matchesStopped && !badges.matchesError) return <span className="v3-count v3-noentry" role="img" aria-label="Усі парсери зупинені" title="Усі парсери зупинені вручну"><i aria-hidden="true" /></span>;
    if (key === "matches" && badges.matchesError) return <span className="v3-count" aria-label={badges.matchesErrorText || "Помилка парсера"} title={badges.matchesErrorText || "Помилка парсера"}>!</span>;
    return null;
  };
  // the home-screen icon carries the same alerts as the menu badges
  const iconCount = (badges.supportOpen || 0) + (badges.auditUnseen || 0) + (badges.usersExpiring || 0) + (badges.matchesError ? 1 : 0);
  useEffect(() => { setIconBadge(iconCount); }, [iconCount]);
  const auditCount = badges.auditUnseen ? (badges.auditMore ? `${badges.auditUnseen}+` : String(badges.auditUnseen)) : "";

  // Швидкий пошук: Ctrl K / ⌘K з будь-якої сторінки
  const [cmdOpen, setCmdOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K" || e.code === "KeyK")) { e.preventDefault(); setCmdOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const searchButton = (
    <span className="v3-tip-wrap">
      <button type="button" className="v3-audit v3-search-btn" onClick={() => { if (pageSearch?.placeholder && isPhoneWidth()) pageSearch.setOpen(true); else setCmdOpen(true); }} aria-label="Швидкий пошук, Ctrl K" aria-keyshortcuts="Control+K">
        <Search size={19} aria-hidden="true" />
      </button>
      <span className="v3-tip" role="tooltip">Швидкий пошук <kbd>Ctrl K</kbd></span>
    </span>
  );
  // phone: a 🐞 next to the journal while the backend has unresolved errors (count = kinds of errors)
  const [errCount, setErrCount] = useState(0);
  useEffect(() => {
    let live = true;
    const load = () => { if (!isPhoneWidth() || document.visibilityState === "hidden") return; fetchServerErrors().then((l) => { if (live) setErrCount(l.length); }).catch(() => {}); };
    load();
    const t = window.setInterval(load, 60_000);
    const onVis = () => load();
    window.addEventListener("v3-server-errors", onVis); document.addEventListener("visibilitychange", onVis);
    return () => { live = false; window.clearInterval(t); window.removeEventListener("v3-server-errors", onVis); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  const onErrors = pathname.startsWith("/settings") && hash === "#errors";
  const errorsButton = errCount > 0 && (
    <Link to="/settings#errors" className={`v3-audit v3-errs-btn${onErrors ? " is-active" : ""}`} aria-label={`Помилки сервера: ${errCount}`} aria-current={onErrors ? "page" : undefined} title="Помилки сервера">
      <Bug size={19} aria-hidden="true" />
      {!onErrors && <span className="v3-count v3-count-float">{errCount > 99 ? "99+" : errCount}</span>}
    </Link>
  );
  const auditButton = (
    <Link to="/audit" onClick={(ev) => { if (onAudit && isPhoneWidth()) { ev.preventDefault(); window.dispatchEvent(new Event("v3-audit-hist")); } }} className={`v3-audit${onAudit ? " is-active" : ""}`} aria-label={auditCount ? `Журнал дій: ${auditCount} нових змін` : "Журнал дій"} aria-current={onAudit ? "page" : undefined} title="Журнал дій">
      <History size={19} aria-hidden="true" />
      {auditCount && !onAudit && <span className="v3-count v3-count-float">{auditCount}</span>}
    </Link>
  );

  return (
    // phone: the light screens set the light canvas from the URL at once — not after their lazy chunk loads (no dark flash between screens)
    <div className="v3-shell" data-light={/^\/(dashboard|users|payments|matches|bets|banners|support|audit|settings|telegram)(\/|$)/.test(pathname) ? "" : undefined}>
      {/* Фон «Зоряний пил»: рідкі крихітні точки ледь мерехтять (дизайн «Основа · фон застосунку») */}
      <StarField />
      <a href="#main-content" className="skip-link">Перейти до вмісту</a>
      <header className="v3-header">
        <Logo />
        <div className="v3-nav-group">
        <nav aria-label="Основна навігація" className="v3-nav">
          <PillTrack active={pathname} />
          {navigation.map(({ label, href, badge }) => (
            <NavLink key={href} to={href} className={({ isActive }) => `v3-navlink${isActive ? " is-active is-on" : ""}`}>
              {label}{badgeFor(badge)}
            </NavLink>
          ))}
        </nav>
          <span className="v3-audit-slot is-desk">{searchButton}{auditButton}</span>
        </div>
        <div className="v3-header-end">
          <div className="v3-account" ref={accountRef}>
            <button type="button" className="v3-account-btn" aria-haspopup="menu" aria-expanded={accountOpen} onClick={() => setAccountOpen((o) => !o)}>
              <UserAvatar username={user?.username || "admin"} telegram={user?.telegram} className="v3-avatar" />
              <span className="v3-account-copy"><strong>@{(user?.username || "admin").replace(/^@/, "")}</strong><small>{roleName}</small></span>
              <ChevronDown size={16} aria-hidden="true" />
            </button>
            {accountOpen && (
              <div className="v3-account-menu" role="menu">
                <div className="v3-account-head">
                  <UserAvatar username={user?.username || "admin"} telegram={user?.telegram} className="v3-avatar v3-avatar-ink" />
                  <span><strong>@{handle}</strong><small>{roleName}{loginNote && ` · ${loginNote}`}</small></span>
                </div>
                <Link role="menuitem" to="/settings#account" className="v3-menu-item"><KeyRound size={17} aria-hidden="true" />Мій пароль</Link>
                <Link role="menuitem" to="/settings#account" className="v3-menu-item"><MonitorSmartphone size={17} aria-hidden="true" /><span className="v3-menu-label">Активні сесії</span>{sessionCount !== null && <span className="v3-menu-count">{sessionCount}</span>}</Link>
                <Link role="menuitem" to={`/audit?actor=${encodeURIComponent(handle)}`} className="v3-menu-item"><History size={17} aria-hidden="true" /><span className="v3-menu-label">Мої дії в журналі</span>{myActions !== null && <span className="v3-menu-count">{myActions}</span>}</Link>
                <div className="v3-menu-sep" />
                <button role="menuitem" type="button" className="v3-menu-item is-danger" onClick={() => { setAccountOpen(false); setLogoutOpen(true); }}><LogOut size={17} aria-hidden="true" />Вийти</button>
              </div>
            )}
          </div>
          <span className="v3-audit-slot is-mob">{!pathname.startsWith("/dashboard") && searchButton}{errorsButton}{auditButton}</span>
        </div>
        <HeaderSearch />
      </header>
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} links={[...navigation, { label: "Журнал дій", href: "/audit", icon: History }].map(({ label, href, icon }) => ({ label, href, icon }))} />

      <MobileDrawer open={mobileOpen} onOpenChange={setMobileOpen} username={handle} telegram={user?.telegram} role={roleName} badges={badges} auditCount={onAudit ? "" : auditCount} onLogout={() => setLogoutOpen(true)} />

      <main id="main-content" className="v3-main"><PageErrorBoundary resetKey={pathname}><Outlet /></PageErrorBoundary></main>
      <MobileTabBar onMenu={() => setMobileOpen(true)} menuOpen={mobileOpen} />
      <footer className="v3-footer"><span>MatchIQ / Панель керування</span><span>Все важливе. В одному місці.</span></footer>

      <Dialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <DialogContent className="v3-modal sm:max-w-[440px]">
          <DialogTitle className="v3-modal-title">Вийти з адмінки?</DialogTitle>
          <DialogDescription className="v3-modal-sub">Незбережені зміни в Налаштуваннях буде втрачено.</DialogDescription>
          {otherSessions > 0 && (
            <label className={`v3-agree v3-agree-row${logoutOthers ? " is-on" : ""}`}>
              <input type="checkbox" className="sr-only" checked={logoutOthers} onChange={(e) => setLogoutOthers(e.target.checked)} />
              <span className={`v3-ck${logoutOthers ? " is-on" : ""}`} aria-hidden="true">{logoutOthers && <Check size={12} strokeWidth={3.2} />}</span>
              <span>Вийти також на інших пристроях <span className="v3-dim2">(ще {otherSessions} {plural(otherSessions, "сесія", "сесії", "сесій")})</span></span>
            </label>
          )}
          <div className="v3-modal-foot"><span /><div className="v3-modal-actions">
            <button type="button" className="v3-btn v3-btn-ghost" onClick={() => setLogoutOpen(false)}>Скасувати</button>
            <button type="button" className="v3-btn v3-btn-red" disabled={loggingOut} onClick={doLogout}>{loggingOut ? "Виходимо…" : "Вийти"}</button>
          </div></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
