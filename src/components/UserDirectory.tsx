import { Search, X, SlidersHorizontal, RefreshCw, Pencil, Trash2, Zap, ShieldCheck, Users, ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseDate, cleanPrice } from "@/lib/adminUtils";
import type { UserData, StatusFilter, SortDirection } from "@/types";

interface Props {
  rows: { user: UserData; originalIndex: number }[];
  counts: { all: number; active: number; expired: number };
  filteredCount: number;
  updated: string;
  busy: boolean;
  search: string;
  onSearch: (value: string) => void;
  status: StatusFilter;
  onStatus: (value: StatusFilter) => void;
  sort: SortDirection;
  onSort: (value: SortDirection) => void;
  page: number;
  pageSize: number;
  totalPages: number;
  onPage: (value: number) => void;
  onRefresh: () => void;
  onEdit: (user: UserData, index: number) => void;
  onExtend: (index: number) => void;
  onDelete: (index: number) => void;
}

const dateLabel = (value: string) => parseDate(value)?.toLocaleDateString("uk-UA") || "—";

function SubscriptionStatus({ user }: { user: UserData }) {
  const days = user.daysUntilExpiry;
  const urgent = user.isActive && days !== undefined && days <= 7;
  return <div className="directory-status">
    <span className={`subscription-pill ${!user.isActive ? "is-expired" : urgent ? "is-ending" : "is-active"}`}><i />{!user.isActive ? "Завершена" : urgent ? "Завершується" : "Активна"}</span>
    <small>{!user.isActive ? "Потребує продовження" : days === undefined ? "" : days === 0 ? "Закінчується сьогодні" : days > 3650 ? "Довгострокова підписка" : `Залишилось днів: ${days}`}</small>
  </div>;
}

export default function UserDirectory(p: Props) {
  const start = p.filteredCount ? (p.page - 1) * p.pageSize + 1 : 0;
  const end = Math.min(p.page * p.pageSize, p.filteredCount);
  return <section className="card-admin user-directory" aria-label="Список користувачів" aria-busy={p.busy}>
    <header className="directory-heading">
      <div><div className="directory-title"><h2>Список користувачів</h2><span>{p.counts.all}</span></div><p>Керуйте обліковими записами та підписками</p></div>
      <div className="directory-sync"><span title={p.updated}>Оновлено {p.updated ? p.updated.split(', ')[1] || p.updated : "—"}</span><button type="button" onClick={p.onRefresh} disabled={p.busy} aria-label="Оновити список користувачів" title="Оновити список"><RefreshCw size={15} className={p.busy ? "animate-spin" : ""} /></button></div>
    </header>
    <div className="directory-toolbar">
      <div className="directory-tabs" role="group" aria-label="Фільтр за статусом">
        {([{ key: "all", label: "Усі" }, { key: "active", label: "Активні" }, { key: "expired", label: "Прострочені" }] as const).map(tab => <button key={tab.key} type="button" aria-pressed={p.status === tab.key} onClick={() => p.onStatus(tab.key)} className={p.status === tab.key ? "selected" : ""}>{tab.label}<span>{p.counts[tab.key]}</span></button>)}
      </div>
      <div className="directory-filters">
        <div className="directory-search"><Search size={16} /><input aria-label="Пошук користувачів" placeholder="Знайти за логіном або Telegram" value={p.search} onChange={e => p.onSearch(e.target.value)} />{p.search && <button type="button" onClick={() => p.onSearch("")} aria-label="Очистити пошук"><X size={14} /></button>}</div>
        <Select value={p.sort || "none"} onValueChange={value => p.onSort(value === "none" ? null : value as SortDirection)}><SelectTrigger className="directory-sort" aria-label="Сортування користувачів"><SlidersHorizontal size={14} /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Без сортування</SelectItem><SelectItem value="asc">Найближче завершення</SelectItem><SelectItem value="desc">Найпізніше завершення</SelectItem></SelectContent></Select>
      </div>
    </div>
    <div className="directory-table-scroll" tabIndex={0} role="region" aria-label="Таблиця користувачів, доступне горизонтальне прокручування">
      <table className="directory-table">
        <thead><tr><th scope="col">Користувач</th><th scope="col">Тариф / міс.</th><th scope="col" aria-sort={p.sort === "asc" ? "ascending" : p.sort === "desc" ? "descending" : "none"}><button type="button" onClick={() => p.onSort(p.sort === null ? "asc" : p.sort === "asc" ? "desc" : null)}>Період підписки<ArrowUpDown size={12} /></button></th><th scope="col">Статус підписки</th><th scope="col">Роль</th><th scope="col" className="directory-actions-heading">Дії</th></tr></thead>
        <tbody>{p.rows.length ? p.rows.map(({ user, originalIndex }) => <tr key={user.id ?? originalIndex}>
          <td><div className="directory-person"><span className={`directory-avatar ${user.isAdmin ? "is-admin" : ""}`}>{user.isAdmin ? <ShieldCheck size={18} /> : user.username.charAt(0).toUpperCase()}</span><div><strong title={user.username}>{user.username}</strong><span>{user.telegram || "Telegram не вказано"}</span></div></div></td>
          <td><span className="directory-price">{Number(cleanPrice(user.priceMonth)).toLocaleString("uk-UA")}<small>грн</small></span></td>
          <td><div className="directory-dates"><span><i />{dateLabel(user.startDate)}</span><strong><i />{dateLabel(user.endDate)}</strong></div></td>
          <td><SubscriptionStatus user={user} /></td>
          <td><span className={`directory-role ${user.isAdmin ? "is-admin" : ""}`}>{user.isAdmin && <ShieldCheck size={12} />}{user.isAdmin ? "Адмін" : "Користувач"}</span></td>
          <td><div className="directory-actions"><button type="button" disabled={p.busy} onClick={() => p.onEdit(user, originalIndex)} aria-label={`Редагувати ${user.username}`} title="Редагувати користувача"><Pencil size={15} /></button><button type="button" disabled={p.busy} onClick={() => p.onExtend(originalIndex)} aria-label={`Продовжити підписку ${user.username} на 30 днів`} title="Продовжити на 30 днів" className="extend-action"><Zap size={15} /></button><button type="button" disabled={p.busy} onClick={() => p.onDelete(originalIndex)} aria-label={`Видалити ${user.username}`} title="Видалити користувача" className="delete-action"><Trash2 size={15} /></button></div></td>
        </tr>) : <tr><td colSpan={6}><div className="directory-empty"><Users size={29} /><h3>{p.busy ? "Завантаження користувачів…" : "Користувачів не знайдено"}</h3><p>{p.search || p.status !== "all" ? "Спробуйте інший запит або змініть фільтр." : "Додайте першого користувача, щоб розпочати."}</p>{(p.search || p.status !== "all") && <button onClick={() => { p.onSearch(""); p.onStatus("all"); }}>Скинути фільтри</button>}</div></td></tr>}</tbody>
      </table>
    </div>
    <footer className="directory-pagination"><p>Показано <strong>{start}–{end}</strong> із <strong>{p.filteredCount}</strong>{p.filteredCount !== p.counts.all && <span> · усього {p.counts.all}</span>}</p><nav aria-label="Сторінки користувачів"><button type="button" disabled={p.page <= 1} onClick={() => p.onPage(p.page - 1)} aria-label="Попередня сторінка"><ChevronLeft size={16} /></button><span><strong>{p.page}</strong> / {p.totalPages}</span><button type="button" disabled={p.page >= p.totalPages} onClick={() => p.onPage(p.page + 1)} aria-label="Наступна сторінка"><ChevronRight size={16} /></button></nav></footer>
  </section>;
}
