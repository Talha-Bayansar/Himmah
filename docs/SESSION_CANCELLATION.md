# Reviewed session and series cancellation

Owner-approved 31 October 2026. Owners/admins may cancel one session or that occurrence and following unstarted occurrences of its finite [recurring series](RECURRENCE.md). This closes planned work while preserving its history; it is separate from archiving or permanently deleting an activity.

## Staff workflow

Choose **Cancel session** in the session more menu. The independently reloadable `session-cancel` form route uses the activity ID and a validated session search parameter, with the originating same-organization return link. The complex review uses the shared page form, document scrolling, no autofocus, EN/NL/TR and the normal safe-area/keyboard rules.

The page initially previews this session. A series also offers This and following sessions, using the same original series positions as schedule changes. Already-cancelled and started occurrences are skipped; a started/cancelled selected anchor cannot start a new cancellation. Standalone sessions have no series selector. An unstarted required-registration session may still be cancelled after check-in opens: roster freezing prevents schedule rewriting, not explicit cancellation. At most 52 existing occurrences are affected; no future generation, rescheduling or extra activity is inferred.

Review every affected date and topic, confirmed registration count, any recorded attendance, charge count and effective collected cash. Cash includes unallocated cash belonging to the affected session and subtracts existing receipt corrections/reversals using the same definitions as Cash. Enter a reason (required, trimmed, at most 300 characters). One count-based destructive confirmation states the number of sessions/confirmed registrations and recorded cash, with explicit preservation and no automatic refund/waiver. Declining writes nothing and keeps the draft. Keep sessions/Back uses the normal single discard guard when a draft exists.

On success, return to the origin without a discard prompt and invalidate organization queries, including Home, the full agenda, activity/session details, management and Insights. Cancelled occurrences disappear from Home/agenda. The activity's session list still shows their cancelled state/reason. Session views flag actual charges or effective collected money for administrator review; fully reversed unallocated cash with no charge does not create a false payment-review flag. Scoped volunteers do not receive this administrator-only flag or the cancellation preview's monetary impact.

## Records and payment follow-up

Cancellation changes only `cancelled`, `cancellation_reason` and the session's optimistic version. IDs, topics, dates, audience, locations, fees, registrations/settings/expected rosters, attendance and its history, charges, receipts, allocations, reversals and corrections remain unchanged. Confirmed reservations remain historical records; the existing cancellation rules close further registrations/collection. No absence, cancellation fee, refund, waiver, attendance removal, payment correction or external message is created.

Existing charge reads mark cancelled-session charges as requiring review. The page/detail warning calls attention to retained money/debt; staff must review that situation explicitly. A receipt correction records an incorrect entry and is not a physical refund. This increment does not add refunds, waivers, a review-completion queue or automatic communications.

## API and transaction contract

- GET the activity's sessions endpoint with `cancellationPreview=<anchor UUID>&scope=one|future`.
- POST the same endpoint with `cancelPlan=true` and `anchor`, `scope`, `snapshot`, `reason`, `key`.
- Verified membership and current owner/admin role are checked in the API and independently in SQL. Both requests use the activity rate limiter and no-store responses. No private data/mutations enter offline caches.

`hub_session_cancellation_preview` returns bounded dates/counts and a scope-bound review digest. It hashes the exact current session rows, registrations/settings, attendance, charges, receipts, allocations and their corrections/reversals. A new registration/receipt/correction, changed session metadata/version, changed cancellation/start eligibility or changed target set invalidates the review, even when the visible aggregate happens to be the same.

`hub_cancel_sessions` takes current membership, request, activity and ordered session locks consistent with existing operational commands. After locks, it regenerates and verifies the complete current preview. All cancellations, per-session audit entries and the immutable `hub_session_operations` receipt commit atomically; an audit failure rolls the whole operation back. The receipt retains original cancellation flags/reasons/versions, the reviewed scope/hash and the common new reason. Existing permanent activity deletion includes these receipts automatically; there is no new table or provider-schema change.

Current authorization precedes exact receipt replay, including when the sessions are already cancelled or the activity is later archived. Same request/body returns the original result. A different actor/body cannot reuse the key. A lost response locks the reviewed payload and entered reason for Retry cancellation, without another destructive confirmation. A known conflict requires Refresh and review again, a fresh snapshot/key and another confirmation; the entered reason stays. Known access loss hides the reviewed data and clears private child caches while retaining the surrounding organization context, avoiding a reload loop. The previous version-checked single-session PATCH remains a single-session operation for existing clients; it never expands to a series.

## Installation and verification

Definitions live in `db/migrations/functions/session-cancellation.sql`. The guarded `scripts/session-cancellation-plan.mjs` verifies the database/role/series baseline, uses an advisory install lock, checks unchanged session data under table locks and records a source digest on the command function. No Drizzle table migration is necessary. Validate locally and on the isolated PostgreSQL branch before installing on verified development/hosted targets.

Meaningful tests cover one/future/standalone scope, current role and tenant isolation, started/already-cancelled exclusions, registration/cash/correction/version/target-set conflicts, check-in-open cancellation, untouched participation/financial history, immutable receipt replay, changed payload/actor denial, audit rollback, payment-review privacy, explicit later correction, and normal permanent deletion. UI/browser coverage checks menu-to-page routing/reload, dates/impact, one destructive confirmation, decline, no autofocus, failed draft/exact retry, fresh conflict review, origin/discard guards, scope loss and mobile reflow. Executed results and rollout evidence belong in [infrastructure history](INFRASTRUCTURE.md).
