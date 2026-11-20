# Notification scheduling and idle compute

The minute cron is retired. Cloudflare stores a single persistent next deadline in the private SQLite-backed `NotificationClock`. With no eligible reminders or pending native deliveries, there is no alarm and no background SQL. The old scheduled entry point deliberately does nothing, including late invocations after rollout. The unread badge refreshes on mount, focus, mutations and push events instead of every 30 seconds.

## Scheduling contract

An authoritative bounded-output SQL query returns only the earliest due timestamp from effective reminder follows, eligible start notices and useful pending delivery retries/device leases. It preserves current scope, mute, cancellation, presence, expiry and retry checks. Existing generators remain idempotent; native delivery claims at most ten jobs per batch, with four concurrent transports. A remaining backlog schedules another alarm with a ten-second minimum gap. Quiet hours, cooldowns and privacy policy remain enforced by delivery.

Verified authenticated organization/notification writes acquire a durable five-minute write lease before database mutation. The lease, dirty revision and safety alarm save atomically. Finish schedules reconciliation after the response; overlapping writes defer discovery until their leases finish. Revision checks prevent an older alarm from overwriting a newer mutation. A crash or unknown outcome leaves the safety alarm to rediscover committed work. Scheduling acknowledgement failures preserve the existing service-error/exact-retry contract rather than claiming confirmed success.

Successful authenticated reads can initialize or recover the clock. An HTML visit can request initial discovery once, but cannot reset a failure circuit. Repeated visits to an initialized clean clock do not query Neon or restart alarms. The binding has no public HTTP route, and stored state contains timing, opaque lease IDs and revision/failure metadata, never recipient details or credentials.

New notification-affecting authenticated endpoints must remain inside the wake guard. If future public/guest workflows create notification work, explicitly integrate durable scheduling; they currently bypass it because they create no such work. External SQL changes do not signal the clock: operational changes that alter reminder work must deliberately reconcile it. Do not add a periodic fallback scanner.

## Failure and recovery

Quota failures stop background queries until one recovery alarm at the next UTC month boundary. A successful authenticated foreground database operation can recover sooner. Other failures retry after 15 minutes, one hour, six hours and 24 hours, then stop after the fifth failure until successful foreground recovery. Public visits cannot defeat either circuit. Maintenance or missing database configuration disables alarms until a later initialization. This avoids Cloudflare automatic rapid retry storms.

This prevents idle polling from consuming new allowance; it does not restore already exhausted Neon quota or guarantee exact-time push delivery. Login remains dependent on Neon Auth/database availability. Free-plan idle suspension remains enabled through the provider default; no plan change or Neon schema migration is required.

## Validation and operations

Tests use disposable PGlite SQL and actual local Workerd SQLite Durable Objects with fake transports. They cover no-work dormancy, persistent real alarms, mutation/crash recovery, current deadlines, quota/backoff, middleware gates and 100 retired cron calls making zero outbound database/transport requests. No hosted synthetic notifications or real device pushes are needed.

Deployment uses the existing Himmah Worker, an empty cron list and SQLite migration `notification-clock-v1`. Verify the deployed version, empty schedules, `HIMMAH_NOTIFICATION_ALARMS=true` and the `NotificationClock` binding independently through Cloudflare. To stop all notification processing use the existing maintenance gate; removing cron alone no longer stops alarms.

References: [Cloudflare SQLite Durable Object pricing and Free availability](https://developers.cloudflare.com/durable-objects/platform/pricing/), [persistent alarms and retry behavior](https://developers.cloudflare.com/durable-objects/api/alarms/).
