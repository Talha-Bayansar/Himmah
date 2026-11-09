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

## Native interruption balance — 5 November 2026

Personal follows and browser permission remain separate, explicit opt-ins. The inbox retains currently relevant updates under the existing visibility rules; native delivery has an additional policy:

- Routine pushes pause from 22:00 to 08:00 in the organization's timezone. An upcoming cancellation within two hours bypasses quiet hours and the routine cooldown. These are best-effort notifications, not exact alarms.
- Changes wait two minutes before native delivery. Rapid edits supersede older fingerprints, so only the current update can be sent. Changes/cancellations more than seven days away remain in-app only.
- Routine pushes have a five-minute gap per device across organizations. The queue excludes stale/read/inaccessible notices and prioritizes imminent cancellations, then reminders. It claims at most one delivery per device at once; concurrent jobs cannot claim another for that active device lease. This complements the existing bounded 20-job/four-request delivery batch.
- A one-hour reminder is not pushed again when a current change/cancellation notice for that same session was created within the preceding ten minutes. Its in-app reminder is unaffected.
- Quiet/cooldown deferrals reschedule without consuming provider retry attempts. Expired reminders and notices for sessions that have started are skipped, rather than delivered after the useful window. Current membership, access, follow version, fingerprint and unread state are still rechecked before transport.
- Native notifications use a separate generic grouping tag per session. Different sessions no longer overwrite each other's alert; rapid updates to the same session replace its displayed alert. Lock-screen content remains generic. Sent/in-flight notifications cannot be recalled.

The shared follow sheet and Preferences explanation disclose quiet hours and the imminent-cancellation exception. No new broadcast, automatic follow, participant messaging or permission prompt is introduced. Policy tests cover daytime/nighttime, timezone, imminent/far cancellations, edit debounce, cooldown, reminder redundancy and per-device queue leases/attempt preservation. Worker transport tests still use fake endpoints; never send a synthetic native push to an actual device for verification.

Organization settings now configures quiet-hour start/end or disables quiet hours. Unconfigured organizations retain 22:00–08:00. All boundaries use the current organization timezone with minute precision across DST. Follow sheets show current organization hours; Preferences explains organization policy without hardcoded times. Personal follows/reminder choices/device permissions are unchanged. Policy-only deferrals are re-evaluated after settings changes while provider retry backoff remains intact. See [organization settings](ORGANIZATION_SETTINGS.md).

## Attendance reminder at session start — 9 November 2026

The owner requested a reminder when a session starts. Existing effective follows with reminders enabled (`reminderMinutes=60`) now include a second, operational start reminder. Changes-only (`0`), disabled session overrides and unfollowed activities/sessions remain excluded. Following and native device permission remain separate opt-ins; no staff member is automatically enrolled. The shared sheet explains the additional reminder. Cash-only/view-only staff do not receive an attendance reminder.

The minute job creates at most 100 start notices per run, at/after start and before the earlier of session end or 15 minutes after start. It excludes cancelled sessions/archived activities and any session with a present contact in the recipient's current attendance scope. A unique actor/session/planned-start index prevents repeats across overlapping follows, retries and jobs. No attendance, debt or payment is created. Starting a late job never backfills older sessions.

Inbox and delivery recheck effective follow/version, fingerprint, current attendance permissions, useful time window and whether attendance has begun in that scope. Recording presence suppresses the queued reminder. Start reminders open unified attendance management. Their native message names no organization, activity or contact: it only says that a session started and asks staff to record attendance. Quiet hours, routine device cooldown, lease/retry budgets and generic per-session grouping still apply. A deferral extending beyond the useful window is skipped. Expired notices are hidden; this remains a task inbox rather than an audit history or exact alarm.

Schema migrations `0016_session_started.sql` / `0017_directory_order.sql` and `session-starts.sql` are installed through `scripts/session-starts-plan.mjs`, requiring the previous organization-settings digest. The plan fingerprints all pre-existing application rows before/after and never invokes either notification generator. Validation uses disposable SQL and fake push endpoints only; no hosted synthetic pushes are sent.
