# Engagement periods

Engagement periods are private owner/admin reporting windows, independent of football seasons, earning rules and point awards. Open **Settings → Engagement periods** to create or browse them. Each period and group-filtered view has a reloadable URL. Volunteers and participant accounts cannot access this reporting slice.

## Dates and totals

A period has a name, first day, included last day and saved organization timezone. Whole local days are converted in Postgres to a half-open UTC window: first local midnight through midnight after the last day. This includes daylight-saving changes correctly. Calendar dates must be valid and between 2000 and 2100 (implementation bounds, not program policy). Open periods allow name/date edits with a version check; their timezone stays fixed. Future periods and overlapping windows are supported.

Points are the sum of existing ledger entries whose **contribution occurrence time** falls in the window, including linked correction deltas. Recording time does not decide which window receives an award. Nothing copies points into another ledger or changes a member balance. The same contribution may appear in overlapping reports; never add overlapping period totals together.

Attendance counts current recorded states of non-cancelled sessions whose **start time** falls in the window. The same multi-day session belongs to the window containing its start. Missing attendance is never inferred as absent or unmarked; an explicitly saved unmarked record counts as recorded unmarked. This is not a scheduled-opportunities denominator, attendance percentage or finalization feature.

Member reports include the organization's current roster, including archived entries, with zero metrics where appropriate. Group reports use current group membership while open; a member can appear in several groups. The overall total counts each person once. Do not add group totals together. The UI states these policies and distinguishes live from frozen reports. Member/group names and archive indicators remain private.

All growing period/member/group lists use bounded cursor pages (25 default, 50 maximum), tenant/user/filter/revision-bound cache keys/cursors, cancellation, skeletons and accessible load-more/retry states. Group-filtered report URLs store the group ID in the query string; views and filters survive reloads. Search is reset when changing report view/group to avoid applying a group-name search to member names.

## Closing and preserved history

**Close period** requires a destructive confirmation describing its permanent effect. It saves a snapshot of member names/archive state, group names/archive state, group membership, points and recorded attendance. One SQL statement observes these metrics and names consistently using Postgres MVCC, then marks the period closed in the same transaction. No roster/point/attendance data is returned in bulk to the browser for this operation. The short organization lock is shared with points writes; concurrent source writes belong to the report only if visible to the closing statement's database snapshot.

Closing is allowed before or after the selected end date. It freezes what is recorded and visible at closure; it does not claim the window has elapsed or stop source activity. Later backdated awards, corrections, new members, renames and membership changes keep updating their source histories and other open periods but never rewrite this closed report. Closed reports are read-only; this first slice has no reopen, delete or report-revision workflow. A future audited report revision would need a separate design. Do not treat a closed snapshot as a new points balance or game allocation.

Postgres triggers protect closed period metadata and snapshot rows from UPDATE/DELETE. Retention/privacy work must explicitly handle this protection. Closing retries return the existing closed period without duplicating snapshots or audit events. A stale version on an open period conflicts rather than closing or editing somebody else's newer dates. Creation keys avoid duplicate periods after an uncertain response; the form freezes and retries its exact request when a save is unconfirmed. Dirty/uncertain form exits use the shared confirmation. No private report or draft is persisted offline.

## Storage and permissions

Drizzle migration `0006_brainy_luke_cage` adds `hub_engagement_periods`, `hub_period_members` and `hub_period_groups` with organization-scoped foreign keys, page indexes and metadata constraints. `db/migrations/functions/periods.sql` is the readable definition of the versioned live-report helper, mutation function and immutable-history triggers.

API reads/writes require a verified owner/admin in the organization, and storage queries/functions repeat tenant/role checks. Writes retain same-origin CSRF validation and the existing per-user limiter. Responses use no-store. Summary metrics are calculated on the server; only bounded report pages cross the network. Source records are never modified by period creation/editing/closing.

Optional [attendance earning rules](ATTENDANCE_EARNING.md) now supply confirmed points to open reports using the session-start occurrence date. Closed snapshots remain frozen. Public rankings, quizzes, exports, goals, game licensing, billing and participant accounts remain separate work.
