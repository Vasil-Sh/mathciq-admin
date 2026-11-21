import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Activity, BarChart3, Bell, Bot, CalendarDays, ChevronDown, ChevronRight, CircleDollarSign, CreditCard, FileText, Gamepad2, Gift, Hand, History, Image, LayoutDashboard, List, Megaphone, MessageCircle, Receipt, Send, Settings2, Tag, UserCog, Users } from "lucide-react";
import UserAvatar from "@/components/UserAvatar";
import { useMatchCounts } from "@/lib/navCounts";

type Badges = { usersExpiring?: number; supportOpen?: number; matchesError?: boolean; matchesStopped?: boolean; matchesErrorText?: string };
type Sub = { label: string; to: string; key: string; icon: typeof Users };
type Item = { label: string; to: string; icon: typeof Users; group?: "ads" | "matches" | "settings"; subs?: Sub[] };

const SETTINGS: Sub[] = ([
  ["tariffs", "Тарифи", Tag], ["trial", "Пробний період", Gift], ["ai", "AI-аналіз", Bot], ["texts", "Тексти й дисклеймери", FileText], ["alerts", "Попередження", Bell],
  ["receipt", "Чек оплати", Receipt], ["templates", "Шаблони повідомлень", MessageCircle], ["account", "Мій акаунт", UserCog], ["banners", "Банери", Image],
] as [string, string, typeof Users][]).map(([k, l, icon]) => ({ key: k, label: l, icon, to: `/settings#${k}` }));

const ITEMS: Item[] = [
  { label: "Дашборд", to: "/dashboard", icon: LayoutDashboard },
  { label: "Користувачі", to: "/users", icon: Users },
  { label: "Оплати", to: "/payments", icon: CreditCard },
  { label: "Ставки", to: "/bets", icon: CircleDollarSign },
  { label: "Реклама", to: "/banners", icon: Megaphone, group: "ads", subs: ([["banners", "Банери", Image], ["telegram", "Telegram-групи", Send], ["bookmakers", "Букмекери", Hand], ["stats", "Статистика", BarChart3]] as [string, string, typeof Users][]).map(([k, l, icon]) => ({ key: k, label: l, icon, to: k === "banners" ? "/banners" : `/banners?tab=${k}` })) },
  { label: "Матчі", to: "/matches", icon: Gamepad2, group: "matches", subs: ([["matches", "Матчі", CalendarDays], ["parsers", "Парсери", Activity], ["manual", "Додані вручну", List], ["teams", "Команди", Users]] as [string, string, typeof Users][]).map(([k, l, icon]) => ({ key: k, label: l, icon, to: k === "matches" ? "/matches" : `/matches?tab=${k}` })) },
];

/**
 * Phone menu: a 272-px drawer from the left over a dimmed page (as in mobile betting apps).
 * Sections with sub-screens (Реклама, Матчі, Налаштування) open in place with a chevron.
 */
export default function MobileDrawer({ open, onOpenChange, username, telegram, role, badges, auditCount }: {
  open: boolean; onOpenChange: (o: boolean) => void; username: string; telegram?: string | null; role: string; badges: Badges; auditCount: string;
}) {
  const { pathname, search, hash } = useLocation();
  const here = (to: string) => { const [p, q = ""] = to.split(/[?#]/); const tail = to.includes("?") ? `?${q}` : to.includes("#") ? `#${q}` : ""; return pathname === p && (tail ? (tail.startsWith("?") ? search === tail : hash === tail) : !search && !hash); };
  const groupOf = (p: string): string | null => (p.startsWith("/banners") ? "ads" : p.startsWith("/matches") ? "matches" : p.startsWith("/settings") ? "settings" : null);
  const [openGrp, setOpenGrp] = useState<string | null>(groupOf(pathname));
  useEffect(() => { if (open) setOpenGrp(groupOf(pathname)); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => onOpenChange(false);
  const toggle = (g: string) => setOpenGrp((x) => (x === g ? null : g));
  const mxN = useMatchCounts();

  const extra = (it: Item) => {
    if (it.to === "/users" && badges.usersExpiring) return <span className="v3-dr-badge is-amber" title="Підписка закінчується найближчими днями">{badges.usersExpiring}</span>;
    if (it.group === "matches" && badges.matchesError) return <span className="v3-dr-badge is-red" title={badges.matchesErrorText || "Помилка парсера"}>!</span>;
    if (it.group === "matches" && badges.matchesStopped) return <span className="v3-dr-noentry" role="img" aria-label="Парсери зупинені"><i /></span>;
    return null;
  };
  const subs = (list: Sub[]) => (
    <div className="v3-dr-subs">
      {list.map((s) => <Link key={s.key} to={s.to} className={`v3-dr-sub${here(s.to) ? " is-on" : ""}`} onClick={close}><s.icon size={17} aria-hidden="true" />{s.label}{s.key === "parsers" && badges.matchesStopped && !badges.matchesError ? <em>стоп</em> : s.to.startsWith("/matches") && mxN[s.key as keyof typeof mxN] != null && <b className="v3-dr-n">{mxN[s.key as keyof typeof mxN]}</b>}</Link>)}
    </div>
  );
  const row = (it: Item) => {
    const on = it.group ? groupOf(pathname) === it.group : pathname.startsWith(it.to);
    const Icon = it.icon;
    if (!it.subs) return <Link key={it.to} to={it.to} className={`v3-dr-row${on ? " is-on" : ""}`} onClick={close}><Icon size={20} aria-hidden="true" /><span>{it.label}</span><span className="v3-dr-end">{extra(it)}</span></Link>;
    const exp = openGrp === it.group;
    return (
      <div key={it.to}>
        <div className={`v3-dr-row v3-dr-grp${on ? " is-on" : ""}${exp ? " is-exp" : ""}`}>
          <Link to={it.to} className="v3-dr-glink" onClick={close}><Icon size={20} aria-hidden="true" /><span>{it.label}</span><span className="v3-dr-end">{extra(it)}</span></Link>
          <button type="button" className="v3-dr-gtog" aria-expanded={exp} aria-label={`${exp ? "Згорнути" : "Розгорнути"}: ${it.label}`} onClick={() => toggle(it.group!)}><ChevronDown size={18} className={`v3-dr-chev${exp ? " is-up" : ""}`} aria-hidden="true" /></button>
        </div>
        {exp && subs(it.subs)}
      </div>
    );
  };
  const setOn = pathname.startsWith("/settings"), setExp = openGrp === "settings";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="v3-dr-scrim" />
        <DialogPrimitive.Content className="v3-dr" aria-describedby={undefined}>
          <DialogPrimitive.Title className="sr-only">Меню</DialogPrimitive.Title>
          <Link to="/settings#account" className="v3-dr-me" onClick={close}>
            <UserAvatar username={username} telegram={telegram} className="v3-avatar v3-dr-av" />
            <span><strong>@{username}</strong><small>{role}</small></span>
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
          <div className="v3-dr-sep" />
          <nav className="v3-dr-nav" aria-label="Основна навігація">
            {ITEMS.map(row)}
            <div className="v3-dr-sep" />
            <Link to="/audit" className={`v3-dr-row${pathname.startsWith("/audit") ? " is-on" : ""}`} onClick={close}><History size={20} aria-hidden="true" /><span>Журнал дій</span><span className="v3-dr-end">{auditCount && <span className="v3-dr-badge is-red">{auditCount}</span>}</span></Link>
            <div className={`v3-dr-row v3-dr-grp${setOn ? " is-on" : ""}${setExp ? " is-exp" : ""}`}>
              <Link to="/settings" className="v3-dr-glink" onClick={close}><Settings2 size={20} aria-hidden="true" /><span>Налаштування</span></Link>
              <button type="button" className="v3-dr-gtog" aria-expanded={setExp} aria-label={`${setExp ? "Згорнути" : "Розгорнути"}: Налаштування`} onClick={() => toggle("settings")}><ChevronDown size={18} className={`v3-dr-chev${setExp ? " is-up" : ""}`} aria-hidden="true" /></button>
            </div>
            {setExp && subs(SETTINGS)}
          </nav>
          <Link to="/support" className="v3-dr-support" onClick={close}>
            <span className="v3-dr-sico"><MessageCircle size={18} aria-hidden="true" /></span><span>Підтримка</span>
            {!!badges.supportOpen && <span className="v3-dr-pill">{badges.supportOpen} {badges.supportOpen === 1 ? "нове" : "нових"}</span>}
          </Link>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Phone tab bar: Меню · Дашборд · Юзери · Оплати · Матчі (as on the design). */
export function MobileTabBar({ onMenu, menuOpen }: { onMenu: () => void; menuOpen: boolean }) {
  const { pathname } = useLocation();
  const tabs = [
    { to: "/dashboard", label: "Дашборд", icon: LayoutDashboard },
    { to: "/users", label: "Юзери", icon: Users },
    { to: "/payments", label: "Оплати", icon: CreditCard },
    { to: "/matches", label: "Матчі", icon: Gamepad2 },
  ];
  return (
    <nav className="v3-tabbar" aria-label="Швидкі розділи">
      <button type="button" className={`v3-tab${menuOpen ? " is-on" : ""}`} onClick={onMenu} aria-expanded={menuOpen}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></svg><span>Меню</span>
      </button>
      {tabs.map(({ to, label, icon: Icon }) => { const on = pathname.startsWith(to); return (
        <Link key={to} to={to} className={`v3-tab${on ? " is-on" : ""}`} aria-current={on ? "page" : undefined}><Icon size={22} strokeWidth={on ? 1.9 : 1.6} aria-hidden="true" /><span>{label}</span></Link>
      ); })}
    </nav>
  );
}
