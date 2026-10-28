# Session registration and expected rosters

The owner approved this operational slice after reviewing the distinction between group membership, reservations and attendance. Contacts/groups remain the directory; a registration reserves a place at one session. Attendance records what happened and never implicitly creates a reservation.

## Staff workflow

Open an activity, open a session, then choose Registrations. The page independently reloads its session and authorized registration data. It provides confirmed/cancelled reservations, the amended expected roster, the original roster and administrator change history. Search/view filters live in the URL. Lists and contact pickers use stable timestamp/ID cursors, 25 default/50 maximum, automatic append and manual Load more.

The registration settings sheet chooses optional drop-in or required registration and an optional capacity. Existing sessions default to optional/unlimited without backfilling records. Capacity cannot fall below confirmed reservations. Settings lock when check-in opens, 30 minutes before the session starts. Session schedule changes that would move a required-registration session across that boundary are rejected; the session UI explains the lock. Cancellation remains separate and preserves reservations/history.

Choose Register contact, select one current eligible contact and save. A reservation creates no attendance mark, account or cash record. A cancelled contact may register again, with a new version on the same registration identity. Cancelling requires a reason and explicit confirmation; it frees a place and retains history. Registrations close when the session ends or the session/activity is cancelled.

For required-registration sessions, confirmed registrations are expected. Before check-in, this is a draft. The initial roster freezes at the check-in cutoff and later changes require a reason. The first read/write after that cutoff materializes the snapshot under the same locks used by every registration command; each post-cutoff command freezes it before changing reservations. No scheduled task or automatic absence is needed. Original inclusion is immutable through subsequent amendments; current inclusion changes with explicit late registrations/cancellations. Group changes never rewrite the roster.

Open/drop-in sessions have no expected denominator, even when optional reservations exist. Attendance can filter all eligible contacts, confirmed registrants or expected contacts. Recording a walk-in's attendance does not register them, consume a reservation place or silently add them to expected attendance. Existing retained attendance and registered/expected archived contacts remain inspectable.

Owner/admin can manage registration within the tenant. Volunteers with a current scoped attendance grant can see only allowed contacts and register an existing eligible contact during check-in, within capacity. They cannot change settings, cancel reservations, access organization-wide history or override eligibility/capacity. Revocation blocks reads, new writes and replay of an earlier successful request. There is no public registration link or contact login.

Short forms use the shared shadcn/Vaul bottom sheet with no autofocus, visible focus, safe areas, visual-viewport sizing and guarded dismissal. Uncertain writes freeze their exact payload/key for retry. Business conflicts retain the draft for review. Setting edits retain the version opened by the user. If check-in opens while a registration sheet is already open, a rejected late write reveals the reason field and can be corrected without losing the selection.

This slice adds free reservations and registration-based expected rosters. Recurring schedule generation, manual expected rosters for open sessions, capacity/eligibility overrides, waitlists, prices/charges/cash and insights remain future slices. No payment provider, permanent contact account or removed feature is introduced.

## Schema, commands and release

Drizzle migration `db/migrations/generated/0001_session_registration.sql` adds five tenant-scoped tables: settings, registrations, original/amended expected contacts, immutable events and immutable request receipts. Composite session/contact FKs reject cross-tenant references. One current registration per session/contact prevents duplicate reservations. Invoker SQL functions in `db/migrations/functions/registration.sql` enforce current permissions, session serialization, capacity, expected versions and canonical payload replay in one transaction. Audit failures roll back changes and receipts together. No RLS claim is made; the server functions and queries explicitly enforce access.

`node scripts/registration-plan.mjs` emits the additive upgrade transaction and its SHA-256 digest, without connecting or reading credentials. It verifies database/role/current baseline, fails if registration tables already exist and stores the digest as a table comment. It must only be applied to freshly verified Himmah targets. Fresh installation uses the updated schema install plan; never run the baseline against an existing database. Historical removal scripts are not this feature's upgrade path.

The organization chooser now reuses the shared directory list/item/record primitives: compact icon, name, role and trailing chevron, with the entire row linked to the appropriate workspace. It removes stacked card padding and the large inline Open workspace action.

Verification and deployment evidence are recorded in [infrastructure history](INFRASTRUCTURE.md). The new SQL/API tests cover capacity, exact retries, tenant FKs, revocation, scoped volunteers, original/amended rosters, independent walk-in attendance, cancellation history and rollback. UI tests cover direct routes, URL state, uncertain retries, reason/confirmation, version snapshots and access loss. Production browser screenshots use synthetic data; they do not claim signed-in or physical-device testing.
