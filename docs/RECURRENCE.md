# Recurring session planning

Implemented 30 October 2026 after owner approval. Weekly planning extends ordinary activity sessions; there is no second attendance or payment system.

## Staff flow

Owners/admins open an activity and choose **Plan recurring sessions**, a compact secondary action beside the existing single-session workflow. The independently reloadable page uses the shared form route (`session-series`, activity ID), normal page scrolling and no autofocus.

Choose the first possible start, end, one or more weekdays, and either 2–52 sessions or an inclusive last date within 366 days of the first date. The selected weekdays repeat every week. The first date is an inclusive lower bound; the first occurrence may fall later if that weekday is not selected. The start field initially selects its weekday and defaults the end to one hour later. Location and per-contact EUR price apply to all newly created occurrences. Review all actual dates, timezone, location and price before the explicit count-labelled creation action. Add individual topics afterward through the normal session edit sheet.

The preview and API expand the same organization-local calendar rule. The API regenerates creation dates from the rule, rather than trusting client-provided timestamps. Times stay at the selected wall-clock time across daylight saving. Ambiguous/repeated or nonexistent local start/end times reject the whole plan with the existing localized time error; no partial series or silently shifted dates are created.

Weekly patterns are finite and bounded. There is no background expansion, monthly recurrence, holiday skipping, collision/resource booking policy, automatic registration carry-over or indefinite schedule. Overlapping legitimate sessions are allowed as before. To plan a later period, create another reviewed series.

## Schedule changes

The session more menu offers **Change schedule** for unstarted editable sessions. The dedicated `session-schedule` form reloads authorized activity and current series metadata. Choose this session or this and following sessions; a standalone session only offers itself. The existing short edit sheet still edits one session's topic, metadata or times.

A future change includes the selected occurrence and later original positions in its series, excluding started/cancelled sessions. It shifts those existing local dates by the selected session's calendar day/time change and applies the chosen wall-clock duration to each. Previous individual date exceptions shift by the same amount; no session is recreated, revived, extended or deleted. The preview explicitly pairs current and proposed times with each existing topic. Overnight endings include their date. A single edit keeps series membership, allowing a later reviewed series change. Review is required even when only one editable occurrence remains.

Only start/end times and optimistic versions change. Each session retains its ID, topic, activity/name/audience snapshots, timezone, location, pricing, registration settings/registrations, attendance, charges and payments. Completed history never follows new defaults. Required-registration schedule freezes remain authoritative: if any affected old or proposed start is within 30 minutes, the whole change is refused. A change in a reviewed session version, cancellation or the eligible set also rejects the whole update. Refresh and review again preserves entered desired times and obtains a new command identity.

## Integrity and persistence

Drizzle migration `0007_session_series.sql` adds nullable series ID/position fields and a composite scoped unique index. Pair/bounds checks require both values together, with positions 0–51. Existing sessions retain null series membership and all old fields. The creation command stores the normalized local rule and explicit occurrence instants in an immutable `hub_session_operations` receipt, anchored to the first created session. Schedule commands retain old/new times and versions in receipt history. The existing scoped activity-deletion workflow includes these receipts and sessions; deleting an activity does not leave series metadata behind.

`hub_plan_sessions` independently enforces current owner/admin membership before exact replay, activity scope, cancellation, creation defaults/version and valid audience groups. Commands lock membership, request identity, activity and affected sessions in deterministic order. Complete-set/version/freeze checks precede any update; all writes and audit/command receipts commit in one transaction. Series creation snapshots current activity metadata into each normal session. It creates no registrations, attendance, debt or cash.

A lost response keeps the reviewed body and request key locked for exact retry. Successful retries return the original result, even after the first occurrence starts; payload changes or a different actor cannot reuse that key. Known conflicts require fresh review with a new key. The page keeps unsaved drafts, blocks pending navigation and confirms a deliberate leave once. Uncertain saves explain why exact retry should precede another plan. Successful saves invalidate organization queries and return to the validated same-organization origin, with an activity fallback. Private APIs remain no-store; mutations are never queued offline.

## Verification

Meaningful domain/API/SQL tests cover local weekdays, inclusive bounds, DST gap/duplicate rejection and stable local time, exact retries including after start, tenant/role denial, per-session/future versions, atomic stale/incomplete/frozen changes, skipped cancellation, preserved attendance/money/settings/topics, normal permanent deletion and an old-schema additive upgrade. UI cases cover page presentation, no autofocus, review before writes, successful return, failed-save identity, one/future scope, conflict review, drafts, inclusive dates and current role denial. Current executed results and rollout receipts are recorded in [infrastructure history](INFRASTRUCTURE.md).

## Cancellation — 31 October 2026

[Reviewed session/series cancellation](SESSION_CANCELLATION.md) is implemented separately from schedule changes. The session more menu opens a dedicated one/future date-and-payment-impact review. Started/already-cancelled sessions are excluded; all participation/financial history stays intact. No refund, waiver or attendance change is inferred.
