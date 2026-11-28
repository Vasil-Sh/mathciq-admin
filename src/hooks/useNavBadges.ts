import { useEffect, useState } from "react";
import { fetchSettings } from "@/lib/adminSettingsApi";
import { setExpiringWindow, isExpiring } from "@/lib/usersModel";
import { fetchUsersOverview } from "@/lib/adminBetsApi";
import { fetchTgSources } from "@/lib/tgSourcesApi";
import { api } from "@/lib/apiClient";
import { fetchParsers, PARSER_NAMES, parserHealth, PARSER_ISSUE } from "@/lib/dashboardInsights";

/**
 * Counters shown in the top navigation.
 *
 * - auditUnseen: audit entries by *other* admins since this admin last opened
 *   the audit log. Computed client-side from the first audit page; the marker
 *   lives in localStorage, so it is per browser. Opening /audit resets it.
 * - supportOpen: open support tickets: new + in work + waiting (/admin/support-tickets?filter=open).
 * - matchesError: a parser circuit is open (/admin/parsers); matchesErrorText
 *   is the tooltip, e.g. "HLTV не відповідає".
 * A failed request leaves the badge as it was (never made-up numbers).
 */
export interface NavBadges {
  auditUnseen?: number;
  /** true when the first audit page is full of unseen entries (show "30+") */
  auditMore?: boolean;
  supportOpen?: number;
  matchesError?: boolean;
  matchesErrorText?: string;
  /** every parser is stopped by hand — «Матчі» gets a no-entry sign */
  matchesStopped?: boolean;
  /** subscriptions ending within 7 days — shown on «Користувачі» in the mobile menu */
  usersExpiring?: number;
  /** posts the Telegram channels got since the admin last opened each (the same count as on the channels' avatars) */
  tgNew?: number;
}

/** New Telegram posts: a channel's posts now minus what it had when the admin last opened it (v3-tg-chseen). */
const TG_SEEN = "v3-tg-chseen";
let tgPosts: Record<string, number> = {};
const tgNewCount = () => { let seen: Record<string, number> = {}; try { seen = JSON.parse(localStorage.getItem(TG_SEEN) || "{}"); } catch { /* private mode */ }
  return Object.entries(tgPosts).reduce((n, [h, posts]) => n + (seen[h] != null ? Math.max(0, posts - seen[h]) : 0), 0); };

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

/** The «закінчуються» window is read once per page load. */
let windowLoaded = false;

export function useNavBadges(currentUser: string | undefined, onAuditPage: boolean): NavBadges {
  const [badges, setBadges] = useState<NavBadges>({});

  useEffect(() => {
    let cancelled = false;
    const loadOps = async () => {
      // open = new + in work + waiting for the user (same number as the «Звернення» tab)
      const [t, p] = await Promise.allSettled([api.get<{ tickets?: unknown[]; counts?: { open?: number } }>("/admin/support-tickets?filter=open").then((d) => d.counts?.open ?? d.tickets?.length ?? 0), fetchParsers()]);
      if (cancelled) return;
      if (t.status === "fulfilled") setBadges((b) => ({ ...b, supportOpen: t.value }));
      fetchTgSources().then((l) => { if (cancelled) return; tgPosts = Object.fromEntries(l.channels.map((c) => [c.handle, c.all?.posts ?? 0])); setBadges((b) => ({ ...b, tgNew: tgNewCount() })); }).catch(() => {});
      if (p.status === "fulfilled") {
        const bad = p.value.map((x) => [x, parserHealth(x)] as const).filter(([, h]) => h !== "ok");
        const stopped = p.value.length > 0 && p.value.every((x) => x.paused);
        setBadges((b) => ({ ...b, matchesStopped: stopped, matchesError: bad.length > 0, matchesErrorText: bad.map(([x, h]) => `${PARSER_NAMES[x.name] || x.name} ${PARSER_ISSUE[h as "down" | "flaky"]}`).join(", ") }));
      }
    };
    if (onAuditPage) {
      markAuditSeen();
      loadOps();
      setBadges((b) => ({ ...b, auditUnseen: 0, auditMore: false }));
      fetchUsersOverview().then((users) => setBadges((b) => ({ ...b, usersExpiring: users.filter(isExpiring).length }))).catch(() => {});
      return () => { cancelled = true; };
    }
    // First visit on this browser: start counting from now, not from the beginning of time.
    if (seenAt() === null) markAuditSeen();

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
      try {
        if (!windowLoaded) { const st = await fetchSettings().catch(() => null); setExpiringWindow(st?.expiringDays); windowLoaded = true; }
        const users = await fetchUsersOverview();
        if (!cancelled) setBadges((b) => ({ ...b, usersExpiring: users.filter(isExpiring).length }));
      } catch { /* same as above */ }
      await loadOps();
    };
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [currentUser, onAuditPage]);

  // the Telegram screen marks channels seen: the header follows at once (same tab — no storage event)
  useEffect(() => { const f = () => setBadges((b) => ({ ...b, tgNew: tgNewCount() })); window.addEventListener("mq-tg-seen", f); window.addEventListener("storage", f); return () => { window.removeEventListener("mq-tg-seen", f); window.removeEventListener("storage", f); }; }, []);
  return badges;
}
