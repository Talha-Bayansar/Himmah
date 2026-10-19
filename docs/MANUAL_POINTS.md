# Manual engagement points

Implemented first slice: owner/admin manual awards, batch entry, private member details and append-only point history. This works without an engagement period, attendance record, quiz, game season or license. Attendance-only remains the default; [optional attendance earning rules](ATTENDANCE_EARNING.md) now support explicitly confirmed linked awards.

## Staff workflow

Members and group member pages offer **Award points**. Choose up to 50 active member records across bounded cursor pages/searches, then enter a positive whole amount per member, a staff-only reason, contribution date/time and optional activity/session link. Group filtering is a selection convenience; these roles can award any active organization member. Review recipient count, amount per member and combined amount before confirming. A member's name opens their real `/workspace/:organization/members/:member` page, with balance, awards, adjustments and **Award points** for that member.

The form currently allows 1–10,000 points per member, a 1–300 character reason, and contribution dates from 2000 up to now. These are bounded implementation defaults, not agreed scoring policy. Contribution times use the organization timezone and reject nonexistent/ambiguous daylight-saving times. A reason is always required. Activity/session references are optional context, not proof of participation, eligibility or attendance. A session reference must belong to the selected activity and organization. Historical/archived references remain valid for corrections and existing history.

Bulk responses name each saved, unchanged, ineligible or conflicting member; there is no misleading all-success message for a partial save. Archived members cannot receive new awards, but their saved history and corrections remain available. Lists, recipient pickers and optional reference pickers use bounded infinite queries, tenant/user/filter cache keys, cancellation and load-more/retry states. No fetch-all operation is introduced.

## Corrections and totals

An original award is never edited or deleted. **Correct points** sets its desired value from 0–10,000, requires a reason and confirmation, and appends the difference linked to that original award. Zero reverses the award. The event's original contribution time and activity/session references stay attached; correction recording time and actor are new. A stale expected revision returns a conflict rather than replacing another staff member's correction. No-op corrections add no ledger entry. The private history shows both originals and adjustments, original award reasons for linked adjustments, current corrected award values, contribution/recording dates and the organizer's display name (or a generic organizer label if no longer available).

The balance is the sum of ledger deltas, calculated server-side. Corrections cannot make an individual award negative, so ordinary authorized operations cannot produce a negative balance. There is no spendable currency, redemption or direct total edit. Future games must use independent eligibility/allocation records; corrections must never reroll completed training or matches. Dated reporting is now available through [engagement periods](ENGAGEMENT_PERIODS.md), without changing awards. Configurable aggregate/frequency caps, richer earning rules and automatic sources, and game integration remain later work.

## Persistence and permissions

Drizzle migration `0005_left_proudstar` adds `hub_points_entries`, `hub_points_requests`, composite organization/member/activity/session/request/original foreign keys and history indexes. The ledger rejects UPDATE/DELETE via a trigger. The readable transaction function is `db/migrations/functions/points.sql`, included in the versioned migration. Retention/deletion work must deliberately handle this ledger protection and privacy requirements rather than deleting rows through ordinary app flows.

Every read and write requires a verified owner/admin in the organization; SQL repeats role and tenant checks. Volunteers have no access until assignment/approval rules exist. The current participant roster has no login-account linkage, so targets are private roster IDs, never staff account IDs. Before linking participant/staff accounts, add an explicit no-self-approval identity check and an alternate approver; names are not identity evidence. Youth account access and participant-safe history descriptions remain separate work; all current award reasons are staff-only.

`hub_save_points` uses a short organization row lock to serialize request receipts across staff accounts, then locks member rows in stable ID order. This deliberately simple first implementation serializes point writes per organization; it can be narrowed after measuring actual contention. Valid members save atomically with their immutable request receipt; ineligible/conflicting members receive individual outcomes. Unique request keys bind organization, actor and canonical payload. Repeating the same request returns the original response even if later corrections or archival changed the current state; changing actor/payload returns a key conflict. Canonical sorted recipient IDs prevent order/case differences from producing duplicate logical recipients.

An uncertain network/server response freezes the original request and fields so retry sends exactly the same key and payload. Known pre-commit validation/authorization failures leave the form editable. Leaving an uncertain request requires a warning to review history before issuing another award. The app never claims an unconfirmed save succeeded, retries a mutation automatically, persists private drafts to local storage or queues writes offline. APIs use no-store and same-origin CSRF validation plus the existing per-user write rate limiter.

## Verification

PostgreSQL tests execute all real Drizzle migrations and parameterized store SQL in PGlite. They cover scoped reads/writes, positive bounds, canonical recipients, partial outcomes, receipt replay/key mismatch, linked corrections, stale/concurrent revisions, immutable entries, optional context references and private HTTP permissions. UI tests cover award/correction confirm versus cancel, exact uncertain retry payloads, bulk pagination and history retention on next-page errors. Browser checks use synthetic local APIs, never live roster writes.


Attendance-source awards are now managed through attendance rather than the manual correction form. Their ledger entries identify the source and link to the session check-in page; the server rejects direct manual corrections to them. Manual extra awards remain independent.
