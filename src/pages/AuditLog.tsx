import { useEffect, useState } from "react";
import { History, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
type Entry = {
  id: string;
  actor_name: string;
  action: string;
  target: string;
  target_username?: string | null;
  details: Record<string, unknown>;
  status: string;
  created_at: string;
};
const fields: Record<string, string> = {
  username: "Логін",
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
function action(entry: Entry) {
  if (entry.target.endsWith("/reset-password")) return "Скидання пароля";
  if (entry.target === "/auth/register") return "Створення користувача";
  if (entry.target.includes("/banners/slots/"))
    return "Налаштування плейсхолдера";
  if (entry.target.startsWith("/auth/users/") && entry.action === "PUT" &&
      Object.keys(entry.details).filter(key => key !== "targetUsername").length === 1 && "endDate" in entry.details)
    return "Зміна терміну підписки";
  const subject = entry.target.includes("/banners") ? "банера" : "користувача";
  return `${entry.action === "POST" ? "Створення" : entry.action === "DELETE" ? "Видалення" : "Оновлення"} ${subject}`;
}
function targetLabel(entry: Entry) {
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
export default function AuditLog() {
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
      .get<{ entries: Entry[]; hasMore: boolean }>(`/admin/audit?page=${page}`)
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
  }, [page, revision]);
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
          variant="outline"
          disabled={loading}
          onClick={() => setRevision((v) => v + 1)}
        >
          <RefreshCw size={16} />
          Оновити
        </Button>
      </div>
      <section className="card-admin audit-log">
        <div className="audit-intro">
          <History size={20} />
          <p>
            Записи зберігаються з моменту підключення журналу. Паролі та токени
            не записуються. Час — Київ.
          </p>
        </div>
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
            На цій сторінці ще немає дій. Зміни користувачів і банерів
            з’являтимуться тут автоматично.
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
                        {new Date(entry.created_at).toLocaleString("uk-UA", {
                          timeZone: "Europe/Kyiv",
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </time>
                    </td>
                    <td>
                      <strong>{entry.actor_name}</strong>
                    </td>
                    <td>
                      <strong>{action(entry)}</strong>
                      <small>{targetLabel(entry)}</small>
                    </td>
                    <td>
                      {Object.entries(entry.details).filter(([key]) => key !== "targetUsername").length
                        ? Object.entries(entry.details).filter(([key]) => key !== "targetUsername").map(([key, value]) => (
                            <div key={key} className="audit-change">
                              <span className="text-muted">
                                {fields[key] || key}:{" "}
                              </span>
                              {value === null
                                ? "Без обмеження"
                                : typeof value === "boolean"
                                  ? value
                                    ? "Так"
                                    : "Ні"
                                  : key === "screen"
                                    ? screenNames[String(value)] ||
                                      String(value)
                                    : String(value)}
                            </div>
                          ))
                        : "—"}
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
