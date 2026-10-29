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


## Accuracy and workflow improvements — 2026-10-29
- Dashboard monetary amounts are labelled as estimates based on current subscription tariffs/terms, not recorded payments. Historical amounts may change when those fields change.
- Per-paid-user monthly amount divides by paid users in the same month, not new registrations; administrators, free accounts and future subscriptions do not inflate that denominator.
- Current-state cards are independent of the selected reporting month and link to filtered user lists. Reporting selection uses exactly the selected month or the current year.
- Failed refresh retains the last loaded dashboard data and provides retry.
- Audit search matches actor or target username; dates use inclusive Kyiv calendar-day bounds.
- New successful mutations record allowlisted before/after values. Old records explicitly lack previous values. No passwords/tokens are included.
- User editor links to subscription history; new history entries filter actual date/tariff changes, while older entries use the previously recorded request fields.


## Manual payments
- Open a user card from the username, then Payments → Add payment.
- UAH amounts, payment date, inclusive subscription period and optional note. Payment dates cannot be in the future.
- Extending subscription is opt-in and only moves the end date forward. The payment, access change and audit entry commit atomically.
- Request UUID prevents a repeated submission from recording the same payment twice.
- Cancellation requires a reason, preserves the original record and removes it from dashboard totals. It neither refunds money nor rolls back access dates.
- Dashboard totals use recorded payments in the selected month/current year, separately from tariff estimates. No bank verification or payment-provider integration is implied.
- Historical payment records retain the username even if the account is deleted.
- Apply backend migration 0013_admin_payments.sql before deploying the updated server. Applied locally; no production deployment.
- Validation tests passed; real PostgreSQL endpoint checks used temporary tables for creation, extension, idempotency, cancellation, audit rollback and deletion preservation. Real user payments were not created by tests.
