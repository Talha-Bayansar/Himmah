# Architecture

## Current state and intended stack

Current repository: a runnable Next.js/React Hub prototype, docs, domain state transitions/tests and provisioning records. Demo state is browser-memory-only and fictional. A separate organizer portal now uses managed authentication, a Cloudflare API and persistent organizations/memberships. Persistent youth/activity data and the scheduler remain future work.

Proposed stack: Next.js App Router and TypeScript, responsive browser UI, server-side application services, Drizzle schema/migrations, Lakebase Postgres on Neon. Hosting is undecided and not provisioned. Do not add hosting, storage, AI services, or payment processing merely because integrations are available.

src/domain holds pure versioned game calculations independent of UI/database. Application services enforce access and orchestrate transactions. Scheduled work calls the same services as audited administrator retries. PostgreSQL stores authoritative state. Browser state is never authoritative for quiz answers, points, ratings, or results.

## Conceptual entities (not implemented tables)

Organization; identity; organization membership and role; invitation; participant profile; consent record; season, format and settings snapshot; organization settings template; season entry; club/team; roster membership; player and attribute snapshot; activity; contribution approval; quiz/question; quiz attempt and answer; engagement ledger; training allocation/result; lineup/tactics; fixture; tournament round/bracket slot/advancement; simulation result/events; reward definition/award; job execution; audit event.

Separate account identity from game profile. Avoid mandatory email addresses or dates of birth for children until enrollment is agreed. Every mutable row belongs to an organization and relevant season. Use foreign keys and composite constraints to prevent cross-season/team references.

## Integrity requirements

- Unique engagement award per participant/activity/award type.
- If the optional quiz source is enabled, unique scored attempt per quiz policy; answer keys accessible only through protected server operations.
- Unique training per player/week/rules version and fixture result per fixture.
- Transactionally validate eligibility, consume capped credits, record outcomes, and mark jobs complete.
- Use database locking or compare-and-set status changes for concurrent execution.
- Store immutable inputs and rules/engine version; retries use saved results.
- Audit corrections, changes of team, prize decisions, and season closure.
- Secrets and privileged database connections stay on the server.

## Environments

Dedicated Neon project, main reserved for eventual production and development branch for synthetic data. Future preview branches must be schema-only or based on sanitized data once children's records exist. No copying real youth data into previews. Use project-specific env variables and fail closed if they are missing. Migrations use the direct connection; app requests use pooling. Never push application migrations to main automatically.

## Authentication decision pending

Invite-only membership with participant, volunteer, and administrator roles. Select and implement authentication during the enrollment milestone; evaluate Neon managed authentication using its current skill and support constraints then. No auth service is claimed to be configured now.

## Multi-organization foundation

See [Platform architecture](PLATFORM.md). The initial schema must carry organization ownership through all game records and membership-scoped authorization. Use composite foreign keys to block cross-tenant references. Include organization scope in job payloads, idempotency keys, caches, logs, file paths and exports. Never treat a paid subscription as authorization. Verify isolation using at least two synthetic organizations before the pilot.

## Season configuration and format

Mode and format are separate fields. Validate a typed draft configuration, produce a fixture/bracket and training preview, then persist an immutable versioned rules snapshot on activation. Reference that snapshot from every training and match. Use a format-specific result: league table or knockout bracket/champion. Persist bracket advancement in the same transaction as the fixture result.

## Future subscription boundary

Prepare a small provider-neutral organization entitlement interface when implementing the application; do not build billing infrastructure now. Payment records/webhook receipts eventually belong to the platform billing domain and reference an organization, not youth profiles. Providers and actual plans remain undecided. No schema or integration is implemented by this documentation update.

## Source-independent engagement

[Engagement system](ENGAGEMENT.md) supersedes any earlier quiz-centric core-loop assumptions. Add conceptual activity definitions, versioned earning rules, award events, correction events and training allocations. Quiz/question/attempt entities are optional module records, not dependencies of the simulation. Manual, attendance and quiz sources invoke the same authorized award service. Domain training takes eligible point allocations and a season conversion snapshot; it does not query source types.

Ledger events are append-only; calculate balances from grants and linked corrections, with transactional caps and source-scoped deduplication. An optional balance cache must reconcile with the ledger. Track consumed allocations so points cannot fund multiple training runs unintentionally. Corrections after a cutoff preserve completed training/results and apply the published future adjustment policy.

## Hub and connected game boundary — supersedes season-required awards

Himmah Hub owns organization identities/memberships, groups, activities/occurrences, attendance, engagement periods, earning rules, awards and corrections. Hub can run without Futsal. A game owns its seasons, squad state, eligibility windows, training allocations and results. Engagement awards reference a Hub member and optionally a Hub reporting period, never a required game season. Game-season eligibility is a separate association/view. Earlier season-scoped award language must be interpreted through this boundary.

Shared sign-in supports separate app experiences. Proposed initial code organization is a single repository with app-specific entry points and shared identity/API contracts; no runnable app split is implemented yet. Games consume versioned, tenant-authorized contribution APIs, not direct writes to Hub totals. Corrections have stable IDs and a documented propagation/reconciliation policy. Each game handles updates idempotently and preserves already-finalized results. API permissions expose only eligible participant references/awards, not guardian information or private notes. Capture event order/cursors for reconciling missed updates before relying on notifications.

Organization entitlements include Hub access and optional Futsal access; exact plan identifiers remain provisional. App licenses are distinct from staff permissions. Turning off Futsal must not disable Hub attendance or erase contributions. Contribution history can power multiple games; any future cross-app spendable currency requires a separately specified wallet and consumption policy.

## Organizer onboarding implementation

See [Organization onboarding](ORGANIZATION_ONBOARDING.md) for the persistent account/workspace boundary, same-origin managed auth proxy, API authorization, Drizzle migrations and onboarding branch. The existing demo is preserved independently. Do not interpret the earlier pending-auth design sections as current setup instructions.
