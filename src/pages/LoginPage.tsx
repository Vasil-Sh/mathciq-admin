import { useLogin } from "@/hooks/useLogin";
import { Loader2, LogIn, User, Lock } from "lucide-react";

export default function LoginPage() {
  const { username, setUsername, password, setPassword, isLoading, error, handleSubmit } = useLogin();

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
      <svg className="absolute inset-0 w-full h-full opacity-[0.02] pointer-events-none" xmlns="http://www.w3.org/2000/svg">
        <defs><pattern id="grid" patternUnits="userSpaceOnUse" width="48" height="48"><path d="M 48 0 L 0 0 0 48" fill="none" stroke="#000" strokeWidth="0.4" /></pattern></defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      <div className="relative z-10 w-full max-w-md">
        <div className="card-admin p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-ink mb-2">Логін</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-subtle" strokeWidth={1.5} />
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" className="w-full h-11 pl-10 pr-4 rounded-input border border-hairline bg-surface text-ink text-sm placeholder:text-subtle focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-colors" placeholder="username" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-2">Пароль</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-subtle" strokeWidth={1.5} />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="w-full h-11 pl-10 pr-4 rounded-input border border-hairline bg-surface text-ink text-sm placeholder:text-subtle focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-colors" placeholder="••••••••" />
              </div>
            </div>
            {error && (
              <div className="rounded-btn border border-red-200 bg-danger-bg p-3">
                <p className="text-sm text-danger">{error}</p>
              </div>
            )}
            <button type="submit" disabled={isLoading} className="w-full h-11 rounded-btn bg-primary text-white font-medium text-sm hover:bg-primary-hover transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-primary-glow">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              {isLoading ? "Вхід..." : "Увійти"}
            </button>
          </form>
          <p className="mt-6 text-center text-xs text-subtle">Лише для авторизованих адміністраторів</p>
        </div>
      </div>
    </div>
  );
}
