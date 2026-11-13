import { getDaysUntilExpiry, parseDate } from "@/lib/adminUtils";
import type { AdminUser } from "@/types";

const pad = (n: number) => String(n).padStart(2, "0");
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** New end date after extending by `days`: counts from the later of today and the current end date. */
export function extendedEndDate(endDate: string, days: number): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const current = parseDate(endDate);
  const base = current && current > today ? current : today;
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return isoDate(next);
}

export function shortDate(value: string): string {
  const d = parseDate(value);
  return d ? d.toLocaleDateString("uk-UA", { day: "numeric", month: "short" }) : value;
}

export interface ExpiringUser {
  user: AdminUser;
  days: number;
}

/** Non-admin users whose access ends within `withinDays` (today included), soonest first. */
export function expiringUsers(users: AdminUser[], withinDays = 7): ExpiringUser[] {
  return users
    .filter((u) => u.role !== "admin")
    .map((user) => ({ user, days: getDaysUntilExpiry(user.endDate) }))
    .filter(({ days }) => days >= 0 && days <= withinDays)
    .sort((a, b) => a.days - b.days);
}

export const daysLabel = (n: number) =>
  n === 0 ? "сьогодні" : `${n} ${n % 10 === 1 && n % 100 !== 11 ? "день" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "дні" : "днів"}`;

export const money = (n: number) => `${Math.round(n).toLocaleString("uk-UA")} ₴`;
