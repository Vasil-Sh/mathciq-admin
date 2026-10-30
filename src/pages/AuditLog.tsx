import {telegramUsername} from "@/lib/telegram";
import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { ShieldCheck, Wallet, UserPlus, Pencil, Trash2, KeyRound, CalendarDays, Filter, RefreshCw, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { api, getAuthToken, getApiBase } from "@/lib/apiClient";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
type Entry = {
  id: string;
  actor_name: string;
  actor_telegram?: string | null;
  action: string;
  target: string;
  target_username?: string | null;
  details: Record<string, unknown>;
  status: string;
  created_at: string;
};
const fields: Record<string, string> = {
  note: "Нотатка",
  paymentId:"Оплата №", amount:"Сума", currency:"Валюта", paidOn:"Дата оплати", periodStart:"Період з", periodEnd:"Період до", extendSubscription:"Продовження доступу", cancelReason:"Причина скасування",
  username: "Логін",
  telegram: "Telegram",
  description: "Опис",
  href: "Посилання",
  endDate: "Підписка до",
  startDate: "Підписка з",
  priceMonth: "Тариф",
  role: "Роль",
  title: "Назва",
  active: "Увімкнено",
  screen: "Екран",
  slot: "Слот",
  startsOn: "Показ з",
  endsOn: "Показ до",
  placeholderEnabled: "Плейсхолдер",
};
const screenNames: Record<string, string> = {
  matches: "Матчі",
  journal: "Журнал ставок",
  analytics: "Аналітика",
  strategies: "Стратегії",
  "risky-teams": "Ризиковані команди",
};
function visibleDetails(entry: Entry) { return Object.entries(entry.details).filter(([key])=>key !== 'targetUsername' && !key.startsWith('_')); }
function formatValue(key:string,value:unknown): string {
 if(value === null || value === undefined || value === '') return 'Не вказано';
 if(typeof value === 'boolean') return value ? 'Так' : 'Ні';
 if(key==='screen') return screenNames[String(value)] || String(value);
 if(key==='role') return value==='admin' ? 'Адміністратор' : 'Користувач';
 if(['startDate','endDate','startsOn','endsOn'].includes(key) && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value).split('-').reverse().join('.');
 return String(value);
}
function Changes({entry}:{entry:Entry}) {
 const changes=entry.details._changes as Record<string,{before:unknown;after:unknown}> | undefined;
 if(changes) return Object.keys(changes).length ? <>{Object.entries(changes).map(([key,value])=><div key={key} className="audit-change"><span className="text-muted">{fields[key] || key}: </span><span className="audit-before">{formatValue(key,value.before)}</span><span aria-label="змінено на"> → </span><strong className="audit-after">{formatValue(key,value.after)}</strong></div>)}</> : <span className="text-muted">{entry.target.endsWith('/reset-password') ? 'Пароль замінено' : 'Без зміни значень'}</span>;
 return <>{visibleDetails(entry).length > 0 && <small className="audit-legacy-note">Попередні значення не збережені</small>}{visibleDetails(entry).map(([key,value])=><div className="audit-change" key={key}><span className="text-muted">{fields[key] || key}: </span>{formatValue(key,value)}</div>)}{!visibleDetails(entry).length && '—'}</>;
}
function action(entry: Entry) {
  if(entry.target.endsWith("/payments")) return "Додавання оплати";
  if(entry.target.startsWith("/admin/payments/") && entry.target.endsWith("/cancel")) return "Скасування оплати";
  if(entry.target.endsWith("/note")) return "Оновлення нотатки";
  if (entry.target.endsWith("/reset-password")) return "Скидання пароля";
  if (entry.target === "/auth/register") return "Створення користувача";
  if (entry.target.includes("/banners/slots/"))
    return "Налаштування плейсхолдера";
  if (entry.target.startsWith("/auth/users/") && entry.action === "PUT" &&
      visibleDetails(entry).length === 1 && "endDate" in entry.details)
    return "Зміна терміну підписки";
  const subject = entry.target.includes("/banners") ? "банера" : "користувача";
  return `${entry.action === "POST" ? "Створення" : entry.action === "DELETE" ? "Видалення" : "Оновлення"} ${subject}`;
}
function targetLabel(entry: Entry) {
  if(entry.target.includes("/payments")) return entry.target_username || "Запис оплати";
  if(entry.target.endsWith("/note")) return entry.target_username || "Внутрішня нотатка";
  const userId = entry.target.match(/^\/auth\/users\/(\d+)/)?.[1];
  if (userId) return entry.target_username || (typeof entry.details.targetUsername === "string" ? entry.details.targetUsername : null) || (typeof entry.details.username === "string" ? entry.details.username : "Акаунт видалено · username не збережено");
  if (entry.target === "/auth/register") return typeof entry.details.username === "string"
    ? `Логін: ${entry.details.username}` : "Новий обліковий запис";
  const slot = entry.target.match(/^\/banners\/slots\/(\d+)/)?.[1];
  if (slot) return `Екран «Матчі» · слот ${slot}`;
  const bannerId = entry.target.match(/^\/banners\/(\d+)/)?.[1];
  if (entry.target.startsWith("/banners")) return typeof entry.details.title === "string"
    ? `Банер «${entry.details.title}»` : bannerId ? `Банер №${bannerId}` : "Новий банер";
  return "Налаштування застосунку";
}
function ActorAvatar({entry}: {entry:Entry}) {
 const handle = telegramUsername(entry.actor_telegram);
 const [failedHandle,setFailedHandle] = useState<string | null>(null);
 const showPhoto = /^[a-zA-Z0-9_]{5,32}$/.test(handle) && failedHandle !== handle;
 return <span className="audit-row-icon audit-actor-avatar" aria-hidden="true">{showPhoto ? <img src={`https://t.me/i/userpic/320/${handle}.jpg`} alt="" loading="lazy" onError={()=>setFailedHandle(handle)} onLoad={e=>{if(e.currentTarget.naturalWidth <= 1)setFailedHandle(handle)}}/> : <ShieldCheck size={19}/>}</span>;
}
function ActionIcon({entry}: {entry:Entry}) {
 const Icon = entry.target.includes('/payments') ? Wallet : entry.target.endsWith('/reset-password') ? KeyRound : entry.action === 'DELETE' ? Trash2 : entry.action === 'POST' ? UserPlus : 'endDate' in entry.details ? CalendarDays : Pencil;
 return <span className="audit-row-icon" aria-hidden="true"><Icon size={19}/></span>;
}
export default function AuditLog() {
  const [urlParams] = useSearchParams();
  const userId=urlParams.get('userId') || '';
  const history=urlParams.get('history') || '';
  const [searchDraft,setSearchDraft]=useState(''), [search,setSearch]=useState('');
  const [from,setFrom]=useState(''), [to,setTo]=useState('');
  const [category,setCategory] = useState("all");
  const [status,setStatus] = useState("all");
  const [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const [entries, setEntries] = useState<Entry[]>([]),
    [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    api
      .get<{ entries: Entry[]; hasMore: boolean }>(`/admin/audit?page=${page}&category=${category}&status=${status}&q=${encodeURIComponent(search)}&from=${from}&to=${to}&userId=${encodeURIComponent(userId)}&history=${encodeURIComponent(history)}`)
      .then((data) => {
        if (live) {
          setEntries(data.entries);
          setHasMore(data.hasMore);
        }
      })
      .catch((e) => {
        if (live) setError(e.message || "Не вдалося завантажити журнал");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [page, revision, category, status, search, from, to, userId, history]);
  return (
    <div className="page-container audit-page">
      <div className="admin-page-hero">
        <div>
          <p className="page-eyebrow">ІСТОРІЯ ЗМІН</p>
          <h1 className="page-title">Журнал дій</h1>
          <p className="page-subtitle">
            Хто, коли та що змінив у панелі адміністратора.
          </p>
        </div>
        <Button
          variant="default"
          disabled={loading}
          onClick={() => setRevision((v) => v + 1)}
        >
          <RefreshCw size={16} />
          Оновити
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              try {
                const res = await fetch(
                  `${getApiBase()}/admin/audit/export?category=${category}&status=${status}&q=${encodeURIComponent(search)}&from=${from}&to=${to}&userId=${encodeURIComponent(userId)}`,
                  { headers: { Authorization: `Bearer ${getAuthToken()}` } },
                );
                if (!res.ok) throw new Error("HTTP " + res.status);
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "audit-log.csv";
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              } catch (e) {
                toast.error((e as Error).message || "Не вдалося експортувати");
              }
            }}
          >
            <Download size={16} />
            Експорт CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const days = window.prompt("Видалити записи журналу старші ніж (днів):", "180");
              if (!days) return;
              const n = Number(days);
              if (!Number.isInteger(n) || n < 1) return;
              api
                .delete<{ removed?: number }>(`/admin/audit/cleanup?days=${n}`)
                .then((r) => {
                  toast.success(`Видалено ${r.removed ?? 0} записів`);
                  setRevision((v) => v + 1);
                })
                .catch((e) => toast.error((e as Error).message || "Не вдалося очистити"));
            }}
          >
            <Trash2 size={16} />
            Очистити
          </Button>
        </div>
      </div>
      {userId && <div className="audit-history-context"><span>Історія користувача {urlParams.get('username') || ''} · записи з моменту підключення журналу</span><Link to="/audit">Увесь журнал</Link></div>}
      <section className="card-admin audit-log">
        <div className="audit-filters">
          <div className="audit-filter-tabs" role="group" aria-label="Тип записів">
            {[['all','Усі дії'],['users','Користувачі'],['banners','Банери']].map(([value,label]) => <button key={value} type="button" aria-pressed={category===value} onClick={()=>{setCategory(value);setPage(1)}}>{label}</button>)}
          </div>
          <label className="audit-result-filter"><Filter size={17} aria-hidden="true"/><span className="sr-only">Результат дії</span><select value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}}><option value="all">Усі результати</option><option value="success">Виконано</option><option value="failed">Помилки</option><option value="pending">Не підтверджено</option></select></label>
        </div>
        <form className="audit-search-filters" onSubmit={e=>{e.preventDefault();setSearch(searchDraft.trim());setPage(1)}}>
          <label>Username автора або користувача<input value={searchDraft} onChange={e=>setSearchDraft(e.target.value)} placeholder="Пошук за username" maxLength={100}/></label>
          <label>Від<input type="date" value={from} max={to || undefined} onChange={e=>{setFrom(e.target.value);setPage(1)}}/></label>
          <label>До включно<input type="date" value={to} min={from || undefined} onChange={e=>{setTo(e.target.value);setPage(1)}}/></label>
          <Button type="submit" variant="default">Знайти</Button>
          {(search || from || to) && <Button type="button" variant="outline" onClick={()=>{setSearch('');setSearchDraft('');setFrom('');setTo('');setPage(1)}}>Скинути</Button>}
        </form>
        {loading ? (
          <p className="p-8" role="status">
            Завантаження історії…
          </p>
        ) : error ? (
          <div className="p-8" role="alert">
            <p>{error}</p>
            <Button variant="outline" onClick={() => setRevision((v) => v + 1)}>
              Спробувати знову
            </Button>
          </div>
        ) : entries.length === 0 ? (
          <p className="p-8 text-muted">
            За вибраними фільтрами записів немає.
          </p>
        ) : (
          <div className="audit-table-wrap">
            <table className="audit-table">
              <thead>
                <tr>
                  <th scope="col">Коли</th>
                  <th scope="col">Хто</th>
                  <th scope="col">Дія</th>
                  <th scope="col">Зміни</th>
                  <th scope="col">Результат</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <time dateTime={entry.created_at}>
                        <span>{new Date(entry.created_at).toLocaleDateString("uk-UA", {timeZone:"Europe/Kyiv",dateStyle:"short"})}</span>
                        <span className="audit-time">{new Date(entry.created_at).toLocaleTimeString("uk-UA", {timeZone:"Europe/Kyiv",hour:"2-digit",minute:"2-digit"})}</span>
                      </time>
                    </td>
                    <td>
                      <div className="audit-cell-content"><ActorAvatar entry={entry}/><strong>{entry.actor_name}</strong></div>
                    </td>
                    <td>
                      <div className="audit-cell-content"><ActionIcon entry={entry}/><div><strong>{action(entry)}</strong><small>{targetLabel(entry)}</small></div></div>
                    </td>
                    <td>
                      <Changes entry={entry}/>
                    </td>
                    <td>
                      <span
                        className={`audit-status audit-status-${entry.status}`}
                      >
                        {entry.status === "success"
                          ? "Виконано"
                          : entry.status === "failed"
                            ? "Помилка"
                            : "Не підтверджено"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="audit-pagination">
          <Button
            variant="outline"
            disabled={loading || page === 1}
            onClick={() => setPage((v) => v - 1)}
          >
            <ChevronLeft size={16} />
            Назад
          </Button>
          <span>Сторінка {page}</span>
          <Button
            variant="outline"
            disabled={loading || !!error || !hasMore}
            onClick={() => setPage((v) => v + 1)}
          >
            Далі
            <ChevronRight size={16} />
          </Button>
        </div>
      </section>
    </div>
  );
}
