# Personal session reminders

Owner-approved increment, 3 November 2026. Staff may personally follow an activity or one session from its detail view. There is no automatic enrolment and no new navigation destination. Attendance, registration, payment and guest learning are unaffected.

## Behavior

- Notifications opens a simple bottom sheet. Choose to follow and receive a reminder about one hour before each upcoming session, or changes/cancellations only. Activity follows apply to its sessions that the staff member can currently access.
- An explicit session preference overrides an activity preference, including turning notifications off for one session. Saving inherited settings creates that override. The sheet explains this; the first version has no reset-to-inherit command.
- Existing browser push permission is separate. Following creates private in-app notifications without a registered device. Native permission is requested only from the explicit Preferences action. Following never prompts for permission.
- A minute job produces at most 100 reminders per run, in start-time order. Following within the final hour may produce a reminder on the next run. This is best-effort delivery, not an exact alarm. Started/cancelled sessions and archived activities get no reminders.
- Upcoming schedule, timezone, location, topic/name and cancellation edits produce transactional notifications for current effective followers. Price-only edits and newly created sessions do not produce a change notification. Overlapping follows produce one notice. An older notice superseded by another edit is hidden; the inbox is not an audit log.
- Private inbox rows show session context and planned time. Opening a notice goes to unified attendance/payment management where authorized, otherwise session detail. Native lock-screen text is generic, without names, dates, amounts or contact information.

## Integrity and privacy

`hub_session_follows` belongs to the current staff membership and organization/activity/session through composite foreign keys. The unique activity/session preference includes a version/epoch. `hub_follow_requests` records actor-scoped exact command receipts. Current membership and scoped session/activity access are checked before reads, writes and receipt replay. An explicit session row overrides the inherited row. Every write is audited.

The SQL update trigger emits notices atomically with the schedule mutation, including recurring changes and cancellation. The minute generator uses an advisory transaction lock, excludes existing reminders before its bounded limit and has a unique (organization, actor, session, planned start) constraint. Re-following the same plan does not resend its reminder. A changed start permits a new reminder.

Delivery and inbox reads recheck current membership, scoped access, effective follow id/version and session fingerprint. Unfollow, settings changes, overridden inheritance, permission loss, archive and rescheduling suppress stale queued notices. Delivery also rechecks the unread state, device/lease and future planned start. Provider TTL is capped by the remaining time, up to one hour. Already sent/in-flight native notifications cannot be recalled; provider transport retains the existing retry semantics and generic collapsing tag.

Session/activity permanent deletion cascades through follows, receipts, notifications and deliveries without deleting contacts/accounts. Removing membership removes personal follows. No contact or financial records are changed by following or reminder generation.

The shared sheet retains drafts and command identity after an unknown outcome, disables edits during exact retry, and explicitly reloads the latest version before conflict review. It never autofocuses fields. EN/NL/TR use the same layout and localized controls. Query keys include actor/organization/target; private caches retain existing sign-out/scope-loss clearing.

## Implementation and rollout

- Schema: generated migration `0010_session_following.sql` and `db/migrations/functions/session-following.sql`.
- Guarded additive deployment plan: `scripts/session-following-plan.mjs`, requiring the prior live-quiz digest, verified database/role, and no prior follow installation. It creates no follows, reminders or pushes during installation.
- API: GET/POST the activity or session `/follow` endpoint. Worker authentication, verified-email, same-origin JSON mutation and People gates remain in force; SQL independently enforces scope.
- Cron: `runNotificationJobs` generates reminders before existing leased push delivery. Generation failure leaves existing delivery available. Maintenance skips both; the People gate skips session generation.
- Local tests use disposable SQL and fake push endpoints only. Never send synthetic hosted/device pushes to validate this feature.
