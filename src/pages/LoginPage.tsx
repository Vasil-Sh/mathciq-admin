import { useLogin } from "@/hooks/useLogin";
import { Loader2, LogIn, User, Lock, Shield } from "lucide-react";

export default function LoginPage() {
  const {
    username,
    setUsername,
    password,
    setPassword,
    isLoading,
    error,
    handleSubmit,
  } = useLogin();

  return (
    <div className="min-h-screen bg-void flex items-center justify-center p-4">
      {/* Grid pattern overlay */}
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.03] pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="grid" patternUnits="userSpaceOnUse" width="48" height="48">
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#ffffff" strokeWidth="0.4" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      <div className="relative z-10 w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-card bg-carbon border border-graphite mb-6">
            <Shield className="w-8 h-8 text-lavender" strokeWidth={1.5} />
          </div>
          <h1 className="font-serif text-[48px] font-normal text-ghost leading-none mb-3">
            MatchIQ
          </h1>
          <p className="text-ash text-sm font-normal" style={{ letterSpacing: "-0.03em" }}>
            Адміністративна панель
          </p>
        </div>

        {/* Login card */}
        <div className="card-dark p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-ash mb-2">
                Логін
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-steel" strokeWidth={1.5} />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoFocus
                  autoComplete="username"
                  className="w-full h-11 pl-10 pr-4 rounded-[6px] border border-graphite bg-void text-ghost text-sm placeholder:text-steel focus:border-lavender focus:ring-1 focus:ring-lavender/30 focus:outline-none transition-colors"
                  placeholder="username"
                  style={{ letterSpacing: "-0.03em" }}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-ash mb-2">
                Пароль
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-steel" strokeWidth={1.5} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full h-11 pl-10 pr-4 rounded-[6px] border border-graphite bg-void text-ghost text-sm placeholder:text-steel focus:border-lavender focus:ring-1 focus:ring-lavender/30 focus:outline-none transition-colors"
                  placeholder="••••••••"
                  style={{ letterSpacing: "-0.03em" }}
                />
              </div>
            </div>

            {error && (
              <div className="rounded-[6px] border border-danger/30 bg-danger/10 p-3">
                <p className="text-sm text-danger">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 rounded-[6px] bg-ghost text-void font-medium text-sm hover:bg-bone transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ letterSpacing: "-0.03em" }}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
              ) : (
                <LogIn className="h-4 w-4" strokeWidth={1.5} />
              )}
              {isLoading ? "Вхід..." : "Увійти"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-graphite" style={{ letterSpacing: "-0.03em" }}>
            Лише для авторизованих адміністраторів
          </p>
        </div>
      </div>
    </div>
  );
}
