import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CornerDownLeft, Search, User } from "lucide-react";
import { authService } from "@/lib/authService";
import type { AdminUser } from "@/types";

export type PaletteLink = { label: string; href: string; icon: typeof Search; hint?: string };

/**
 * Швидкий пошук (Ctrl K / ⌘K): розділи адмінки й користувачі за логіном або Telegram.
 * Стрілки — вибір, Enter — перейти, Esc — закрити.
 */
export default function CommandPalette({ open, onClose, links }: { open: boolean; onClose: () => void; links: PaletteLink[] }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ(""); setActive(0);
    window.setTimeout(() => input.current?.focus(), 30);
    if (!users) authService.fetchUsers().then(setUsers).catch(() => setUsers([]));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/^@/, "");
    const pages = links.filter((l) => !s || l.label.toLowerCase().includes(s)).map((l) => ({ key: l.href, label: l.label, sub: l.hint || "Розділ", icon: l.icon, href: l.href }));
    const people = s.length >= 1 && users
      ? users.filter((u) => u.role !== "admin" && (u.username.toLowerCase().includes(s) || (u.telegram || "").toLowerCase().includes(s))).slice(0, 6)
          .map((u) => ({ key: `u${u.id}`, label: `@${u.username}`, sub: u.telegram ? `Користувач · ${u.telegram}` : "Користувач", icon: User, href: `/users?q=${encodeURIComponent(u.username)}` }))
      : [];
    return [...people, ...pages];
  }, [q, users, links]);

  useEffect(() => { setActive(0); }, [q]);
  // Модальне вікно: решта застосунку недоступна для фокуса, після закриття фокус повертається туди, звідки відкрили
  useEffect(() => {
    if (!open) return;
    const back = document.activeElement as HTMLElement | null;
    const root = document.getElementById("root");
    root?.setAttribute("inert", "");
    return () => { root?.removeAttribute("inert"); if (back && document.contains(back)) back.focus(); };
  }, [open]);
  if (!open) return null;

  const go = (href: string) => { onClose(); navigate(href); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter" && items[active]) { e.preventDefault(); go(items[active].href); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  return createPortal(
    <div className="v3-cmd-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="v3-cmd" role="dialog" aria-modal="true" aria-label="Швидкий пошук">
        <div className="v3-cmd-in">
          <Search size={18} aria-hidden="true" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Користувач, розділ…" aria-label="Пошук" role="combobox" aria-expanded="true" aria-controls="v3-cmd-list" aria-activedescendant={items[active] ? `cmd-${items[active].key}` : undefined} />
          <kbd>Esc</kbd>
        </div>
        <ul id="v3-cmd-list" className="v3-cmd-list" role="listbox">
          {items.map((it, i) => {
            const Icon = it.icon;
            return (
              <li key={it.key} id={`cmd-${it.key}`} role="option" aria-selected={i === active} className={i === active ? "is-on" : ""} style={{ animationDelay: `${Math.min(i, 8) * 0.02}s` }} onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); go(it.href); }}>
                <span className="v3-cmd-ico"><Icon size={16} aria-hidden="true" /></span>
                <span className="v3-cmd-txt"><strong>{it.label}</strong><small>{it.sub}</small></span>
                {i === active ? <CornerDownLeft size={15} className="v3-cmd-enter" aria-hidden="true" /> : <ArrowRight size={15} className="v3-cmd-ar" aria-hidden="true" />}
              </li>
            );
          })}
          {!items.length && <li className="v3-cmd-empty">Нічого не знайдено за «{q}»</li>}
        </ul>
        <div className="v3-cmd-foot"><span><kbd>↑</kbd><kbd>↓</kbd> вибір</span><span><kbd>Enter</kbd> перейти</span><span><kbd>Ctrl</kbd><kbd>K</kbd> відкрити будь-де</span></div>
      </div>
    </div>,
    document.body,
  );
}
