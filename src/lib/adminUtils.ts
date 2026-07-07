// ── Admin utility functions ──

/** Clean price string: remove non-numeric except comma/dot, convert to number */
export function cleanPrice(raw: string): string {
  const cleaned = raw.replace(/[^\d.,]/g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? "0" : String(num);
}

/**
 * Parse a date from DD/MM/YYYY or YYYY-MM-DD format.
 * Returns the Date object, or null if parsing fails.
 */
export function parseDate(val: string): Date | null {
  if (!val || typeof val !== "string") return null;

  // YYYY-MM-DD (ISO)
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(val.trim());
  if (iso) {
    const d = new Date(+iso[1], +iso[2] - 1, +iso[3]);
    return isNaN(d.getTime()) ? null : d;
  }

  // DD/MM/YYYY (Ukrainian format)
  const dm = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(val.trim());
  if (dm) {
    const d = new Date(+dm[3], +dm[2] - 1, +dm[1]);
    return isNaN(d.getTime()) ? null : d;
  }

  const fallback = new Date(val);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/** Format a Date to DD/MM/YYYY */
export function formatDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

/** Days until a given end date (DD/MM/YYYY or YYYY-MM-DD). Negative = expired. */
export function getDaysUntilExpiry(endDate: string): number {
  const end = parseDate(endDate);
  if (!end) return -999;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/** Check if subscription is still active */
export function isSubscriptionActive(endDate: string): boolean {
  return getDaysUntilExpiry(endDate) >= 0;
}
