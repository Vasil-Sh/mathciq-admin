import { useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";

export function useLogin() {
  const { login, isLoading } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notAdmin, setNotAdmin] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");

      if (!username.trim() || !password.trim()) {
        setError("Введіть логін і пароль");
        return;
      }

      const result = await login(username.trim(), password);
      if (result.notAdmin) {
        setNotAdmin(username.trim().replace(/^@/, ""));
        setPassword("");
        return;
      }
      if (!result.success) {
        setError(result.error || "Помилка входу");
      }
    },
    [username, password, login]
  );

  return {
    username,
    setUsername,
    password,
    setPassword,
    isLoading,
    error,
    setError,
    notAdmin,
    resetNotAdmin: () => { setNotAdmin(null); setUsername(""); },
    handleSubmit,
  };
}
