import { api } from "./apiClient";

/** One kind of server error (same source + message without numbers), as kept by the backend. */
export interface ServerError { id: number; source: "api" | "process" | "console"; message: string; detail: string; path: string; status?: number | null; severity?: "critical" | "warning" | "info"; hint?: string; count: number; firstAt: string; lastAt: string }
export const fetchServerErrors = async () => (await api.get<{ errors: ServerError[] }>("/admin/server-errors?limit=100")).errors || [];
export const resolveServerError = (id: number | "all") => api.delete(`/admin/server-errors/${id}`);
