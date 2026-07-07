import { useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";

export function useLogin() {
  const { login, isLoading } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");

      if (!username.trim() || !password.trim()) {
        setError("Введіть логін та пароль");
        return;
      }

      const result = await login(username.trim(), password);
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
    handleSubmit,
  };
}
