import { useEffect, useState } from "react";
import { BarChart3, ShieldCheck, WifiOff } from "lucide-react";
import { useLogin } from "@/hooks/useLogin";

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

export default function LoginPage() {
  const { username, setUsername, password, setPassword, isLoading, error, handleSubmit } = useLogin();
  const [showPassword, setShowPassword] = useState(false);
  const online = useOnline();

  return (
    <main className="v3-login">
      <div className="v3-login-grid">
        <section className="v3-login-story" aria-labelledby="v3-login-story-title">
          <div className="v3-logo v3-logo-static">
            <span className="v3-logo-mark"><BarChart3 size={18} strokeWidth={2.4} aria-hidden="true" /></span>
            <span className="v3-logo-name">MatchIQ</span>
            <span className="v3-logo-badge">Admin</span>
          </div>
          <div>
            <h1 id="v3-login-story-title">Уся платформа.<br />Один робочий простір.</h1>
            <p>Дані, доступи та контент — поруч, щоб зосередитися на роботі.</p>
          </div>
          <ul className="v3-login-tiles">
            <li><strong>Користувачі та підписки</strong><span>Акаунти й доступ до MatchIQ</span></li>
            <li><strong>Показники та записи</strong><span>Аналітика платформи й ставки</span></li>
            <li className="is-blue"><strong>Контент застосунку</strong><span>Реклама, матчі й підтримка</span></li>
          </ul>
        </section>

        <section className="v3-login-form" aria-labelledby="v3-login-title">
          <div>
            <p className="v3-login-eyebrow">Вхід адміністратора</p>
            <h2 id="v3-login-title">З поверненням.</h2>
            <p className="v3-login-lead">Увійдіть, щоб керувати користувачами, підписками та даними MatchIQ.</p>
          </div>

          {!online && <p className="v3-login-banner" role="status"><WifiOff size={16} aria-hidden="true" />Немає інтернету. Кнопка запрацює, щойно зв’язок повернеться.</p>}

          <form onSubmit={handleSubmit} aria-label="Вхід адміністратора" aria-busy={isLoading} noValidate>
            <div className="v3-field">
              <label htmlFor="login-username">Логін</label>
              <input id="login-username" name="username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder="Логін без @" aria-invalid={!!error} />
            </div>
            <div className="v3-field">
              <label htmlFor="login-password">Пароль</label>
              <div className="v3-input-wrap">
                <input id="login-password" name="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Введіть пароль" aria-invalid={!!error} aria-describedby={error ? "login-error" : undefined} />
                <button type="button" className="v3-input-action" onClick={() => setShowPassword((v) => !v)} aria-pressed={showPassword}>{showPassword ? "Сховати" : "Показати"}</button>
              </div>
              {error && <p id="login-error" role="alert" className="v3-field-error">{error}</p>}
            </div>
            <button type="submit" disabled={isLoading || !online} className="v3-btn v3-btn-primary v3-login-submit">
              {isLoading ? "Входимо…" : "Увійти до робочого простору →"}
            </button>
          </form>

          <p className="v3-login-security"><ShieldCheck size={16} aria-hidden="true" />Лише для авторизованих адміністраторів</p>
        </section>
      </div>
    </main>
  );
}
