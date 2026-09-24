import { useLogin } from "@/hooks/useLogin";
import { Loader2, ArrowRight, User, Lock, ChartNoAxesCombined, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const { username, setUsername, password, setPassword, isLoading, error, handleSubmit } = useLogin();
  return <div className="login-shell">
    <section className="login-story">
      <div className="brand"><span className="brand-mark"><ChartNoAxesCombined size={23} /></span><span>Match<span className="text-blue-400">IQ</span><small>ADMIN WORKSPACE</small></span></div>
      <div><div className="text-[10px] tracking-[3px] text-blue-400 mb-6">ВАШ РОБОЧИЙ ПРОСТІР</div><h1>Бачити більше.<br />Керувати простіше.</h1><p>Усі показники, користувачі та підписки MatchIQ — в одному робочому просторі.</p><div className="login-art" aria-hidden="true">{[26,42,35,59,53,76,66,89,100].map((height,i) => <span key={i} style={{height: `${height}%`}} />)}</div></div>
      <div className="text-[11px] text-slate-400">MatchIQ · Панель адміністратора</div>
    </section>
    <section className="login-form-panel">
      <div className="login-form"><h2 className="page-title">Увійти до MatchIQ</h2><p className="page-subtitle mb-9">Введіть дані адміністратора, щоб продовжити.</p>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div><label htmlFor="login-username" className="block text-xs font-semibold mb-2">Логін</label><div className="relative"><User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-subtle" /><input id="login-username" type="text" value={username} onChange={e => setUsername(e.target.value)} autoFocus autoComplete="username" className="w-full h-12 pl-10 pr-4 rounded-input border border-hairline bg-surface text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" placeholder="Ваш логін" /></div></div>
          <div><label htmlFor="login-password" className="block text-xs font-semibold mb-2">Пароль</label><div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-subtle" /><input id="login-password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" className="w-full h-12 pl-10 pr-4 rounded-input border border-hairline bg-surface text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" placeholder="Введіть пароль" /></div></div>
          {error && <p role="alert" className="rounded-btn border border-red-200 bg-danger-bg p-3 text-sm text-danger">{error}</p>}
          <button type="submit" disabled={isLoading} className="w-full h-12 rounded-btn bg-primary text-white font-medium text-sm hover:bg-primary-hover transition-colors flex items-center justify-center gap-3 disabled:opacity-50 shadow-primary-glow">{isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{isLoading ? "Вхід…" : "Увійти до робочого простору"}{!isLoading && <ArrowRight size={17} />}</button>
        </form>
        <p className="mt-8 pt-6 border-t border-hairline flex items-center justify-center gap-2 text-[11px] text-muted"><ShieldCheck size={15} />Лише для авторизованих адміністраторів</p>
      </div>
    </section>
  </div>;
}
