import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";

/**
 * Counters shown in the top navigation.
 *
 * - auditUnseen: audit entries by *other* admins since this admin last opened
 *   the audit log. Computed client-side from the first audit page; the marker
 *   lives in localStorage, so it is per browser. Opening /audit resets it.
 * - supportOpen / matchesError: no backend yet — stay undefined, so the badge
 *   is simply not rendered (we never show made-up numbers).
 */
export interface NavBadges {
  auditUnseen?: number;
  /** true when the first audit page is full of unseen entries (show "30+") */
  auditMore?: boolean;
  supportOpen?: number;
  matchesError?: boolean;
}

const SEEN_KEY = "auditSeenAt";
const POLL_MS = 60_000;

interface AuditEntry { actor_name: string; created_at: string }

function seenAt(): number | null {
  const raw = localStorage.getItem(SEEN_KEY);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function markAuditSeen() {
  localStorage.setItem(SEEN_KEY, String(Date.now()));
}

export function useNavBadges(currentUser: string | undefined, onAuditPage: boolean): NavBadges {
  const [badges, setBadges] = useState<NavBadges>({});

  useEffect(() => {
    if (onAuditPage) {
      markAuditSeen();
      setBadges((b) => ({ ...b, auditUnseen: 0, auditMore: false }));
      return;
    }
    // First visit on this browser: start counting from now, not from the beginning of time.
    if (seenAt() === null) markAuditSeen();

    let cancelled = false;
    const load = async () => {
      try {
        const res = await api.get<{ entries: AuditEntry[]; hasMore: boolean }>(
          "/admin/audit?page=1&category=all&status=all&q=&from=&to=&userId=&history=",
        );
        if (cancelled) return;
        const since = seenAt() ?? Date.now();
        const me = (currentUser || "").toLowerCase();
        const fresh = res.entries.filter(
          (e) => new Date(e.created_at).getTime() > since && e.actor_name?.toLowerCase() !== me,
        );
        setBadges((b) => ({
          ...b,
          auditUnseen: fresh.length,
          auditMore: res.hasMore && fresh.length === res.entries.length,
        }));
      } catch {
        // Badge is a convenience — a failed request just leaves it as it was.
      }
    };
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [currentUser, onAuditPage]);

  return badges;
}
