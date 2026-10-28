import { useLogin } from "@/hooks/useLogin";
import { Loader2, ArrowUpRight, ChartNoAxesCombined, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const { username, setUsername, password, setPassword, isLoading, error, handleSubmit } = useLogin();
  return <main className="adm-login">
    <section className="adm-login-panel" aria-labelledby="adm-login-title">
      <header className="adm-login-header"><div className="adm-login-brand"><span className="brand-mark"><ChartNoAxesCombined size={22} aria-hidden="true" /></span>MatchIQ</div><span>ADMIN WORKSPACE</span></header>
      <div className="adm-login-form">
        <p className="adm-login-eyebrow"><span /> ПАНЕЛЬ АДМІНІСТРАТОРА</p>
        <h1 id="adm-login-title">З поверненням.</h1>
        <p className="adm-login-description">Увійдіть, щоб керувати користувачами, підписками та даними MatchIQ.</p>
        <form onSubmit={handleSubmit} aria-label="Вхід адміністратора" aria-busy={isLoading}>
          <div className="adm-login-field"><label htmlFor="login-username">Логін</label><input id="login-username" name="username" type="text" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" placeholder="Ваш логін" /></div>
          <div className="adm-login-field"><label htmlFor="login-password">Пароль</label><input id="login-password" name="password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" placeholder="Введіть пароль" /></div>
          {error && <p role="alert" className="adm-login-error">{error}</p>}
          <button type="submit" disabled={isLoading} className="adm-login-submit"><span>{isLoading ? "Вхід…" : "Увійти до робочого простору"}</span><span className="adm-login-submit-icon" aria-hidden="true">{isLoading ? <Loader2 className="animate-spin" size={18} /> : <ArrowUpRight size={18} />}</span></button>
        </form>
        <p className="adm-login-security"><ShieldCheck size={16} aria-hidden="true" />Лише для авторизованих адміністраторів</p>
      </div>
      <footer className="adm-login-footer"><span>© {new Date().getFullYear()} MatchIQ</span><span>Робочий простір адміністратора</span></footer>
    </section>
    <aside className="adm-login-story" aria-labelledby="adm-login-story-title">
      <div className="adm-login-story-top"><span>ОГЛЯД. КЕРУВАННЯ. КОНТРОЛЬ.</span><span>01 — 03</span></div>
      <div className="adm-login-story-content"><p className="adm-login-eyebrow">MATCHIQ / ADMIN</p><h2 id="adm-login-story-title">Уся платформа.<br /><span>Один робочий простір.</span></h2><p>Дані, доступи та контент — поруч, щоб зосередитися на роботі.</p>
        <ol><li><span>01</span><div><h3>Користувачі та підписки</h3><p>Керуйте акаунтами й доступом до MatchIQ.</p></div></li><li><span>02</span><div><h3>Показники та записи</h3><p>Переглядайте аналітику платформи та записи ставок.</p></div></li><li><span>03</span><div><h3>Контент застосунку</h3><p>Керуйте банерами в окремому розділі.</p></div></li></ol>
      </div>
      <p className="adm-login-story-footer">MatchIQ · Панель адміністратора</p><span className="adm-login-watermark" aria-hidden="true">MatchIQ</span>
    </aside>
  </main>;
}
