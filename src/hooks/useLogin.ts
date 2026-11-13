import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";

export function useLogin() {
  const { login, isLoading } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notAdmin, setNotAdmin] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<"empty" | "auth" | "other" | null>(null);
  // Lock after too many attempts: epoch ms when the next try is allowed (survives reloads).
  const [lockedUntil, setLockedUntil] = useState<number>(() => Number(sessionStorage.getItem("loginLockedUntil") || 0));
  const [now, setNow] = useState(Date.now());
  const locked = lockedUntil > now;
  useEffect(() => {
    if (!lockedUntil) return;
    const id = window.setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= lockedUntil) { setLockedUntil(0); sessionStorage.removeItem("loginLockedUntil"); setError(""); setErrorKind(null); }
    }, 1000);
    return () => window.clearInterval(id);
  }, [lockedUntil]);
  const lockLeft = locked ? Math.ceil((lockedUntil - now) / 1000) : 0;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (locked) return;
      setError("");
      setErrorKind(null);

      if (!username.trim() || !password.trim()) {
        setError("Введіть логін і пароль");
        setErrorKind("empty");
        return;
      }

      const result = await login(username.trim(), password);
      if (result.notAdmin) {
        setNotAdmin(username.trim().replace(/^@/, ""));
        setPassword("");
        return;
      }
      if (!result.success) {
        if (result.retryAfter) {
          const until = Date.now() + result.retryAfter * 1000;
          sessionStorage.setItem("loginLockedUntil", String(until));
          setNow(Date.now());
          setLockedUntil(until);
        }
        setError(result.error || "Помилка входу");
        setErrorKind(result.retryAfter ? "other" : result.attemptsLeft !== undefined ? "auth" : "other");
      }
    },
    [username, password, login, locked]
  );

  return {
    username,
    setUsername,
    password,
    setPassword,
    isLoading,
    error,
    errorKind,
    setError,
    locked,
    lockLeft,
    notAdmin,
    resetNotAdmin: () => { setNotAdmin(null); setUsername(""); },
    handleSubmit,
  };
}
