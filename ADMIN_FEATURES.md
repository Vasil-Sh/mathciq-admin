# Admin features — 2026-10-28

## Banners
- Desktop/phone preview is available in the banner editor.
- Five placements: matches, journal, analytics, strategies and risky teams.
- Slots 1 and 2 appear before/after content on the four new screens; matches retain their existing schedule positions.
- Start/end dates use Europe/Kyiv calendar days; the end date is inclusive. Empty dates mean no boundary.
- Enabled campaigns outside their period are not returned by the public API. Open screens refresh every 60 seconds.
- Admin states: disabled, scheduled, showing, finished. The enabled switch controls eligibility; expired campaigns remain saved for editing.
- Overlapping enabled campaigns for the same screen/slot are rejected. Non-overlapping campaigns are allowed. All saved campaigns remain visible in admin.

## Subscriptions and filters
- Expiry reminder includes +30 days, starting from the later of today and the existing end date.
- Users/bets search, sorting and selected filters persist in session storage.

## Audit
- /audit is admin-only, with 30 entries per page.
- Records actor, timestamp, target, permitted changed fields and success/failure for user creation, editing, deletion, password reset, banner changes and placeholders.
- Passwords, tokens and image uploads are excluded. Old actions are not reconstructed.
- An attempt is saved before mutation. If the audit database is unavailable, the mutation is blocked. Unconfirmed finalization remains visibly unconfirmed.

## Backend deployment
Deploy the accompanying mathciq backend changes and apply backend/src/db/migrations/0011_banner_schedule_audit.sql with the migration runner before starting the updated server. Applied to the local localhost database; production was not deployed.

## Verification
- Admin TypeScript and Vite build passed.
- 13 backend tests and 6 client placement tests passed.
- Local database date-boundary checks passed; all verification rows were rolled back.
- All five public banner API placements returned 200; unauthenticated audit returned 401.
- Main application full typecheck still reports errors outside the changed banner files. Full PWA build is blocked by existing image assets over the precache size limit. Backend full typecheck reports errors in riskyTeams.ts and hltvEventsScraper.ts.
- Browser visual verification was unavailable in this session.
