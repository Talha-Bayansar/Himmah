# Multiple organizations and future billing

## Confirmed direction

Himmah Futsal must support independent mosques and other organizations using it with their own youth. An organization paywall may be added later, possibly using Stripe or Mollie. Provider, pricing, packaging and commercial timing are undecided. This document is architecture guidance, not an implemented subscription service.

## Workspace ownership

Each organization owns its branding, staff roles, youth profiles, invitations, consent records, activities, quizzes, settings templates, seasons, rosters and rewards. Identity can have memberships in multiple organizations; permissions and participant progress remain separate. Choose an active workspace explicitly. Do not create a global youth leaderboard or disclose membership in another mosque.

Separate organization owner/admin, volunteer and participant roles. Reserve platform administration for platform operations; it must not silently give ordinary staff access to all youth data. Define audited support access before using it.

## Data and execution isolation

Proposed initial deployment: shared application and PostgreSQL database with explicit organization ownership, membership checks and composite foreign keys. A separate database per mosque is not currently required. This is separate from the mandatory infrastructure isolation from Kermes Pay.

Authorize organization scope on the server from a verified identity and membership. Client IDs are selectors, never proof of permission. Every tenant-owned API read/write, job, export, leaderboard, file and cache must enforce that scope. Include organization in uniqueness and idempotency boundaries where records are tenant-local. Apply the same rules to workers as to HTTP requests. Database row policies may provide defense in depth, but do not replace application authorization.

Test two organizations with overlapping role patterns: guessed IDs, workspace switching, revoked access, quiz answer access, fixture execution, cache reuse and export downloads must not leak or mutate another organization's data.

## Future commercial boundary

The intended payer is the organization, not a child. Candidate plan limits include participant seats, active seasons or premium organizer features; these are examples, not chosen tiers. Introduce provider-neutral entitlements so game services ask whether an organization can perform an action rather than query a provider directly. Keep sporting rules and subscription state separate.

Until billing launches, use an explicit internal access policy; do not accidentally deny all pilot organizations because a payment service is absent. Pricing, trials, invoices/tax, grace periods and cancellation/data-access behavior need product decisions before implementation.

When authorized later, use a billing adapter for the selected provider. Map external customers/subscriptions to organization IDs. Verify webhook signatures, persist deduplicated event IDs, handle retries/out-of-order events, and reconcile status using provider APIs. Only authorized organization billing administrators manage checkout. A success redirect cannot itself grant entitlements. Never send youth participation, worship, quiz or rating records to a payment provider.

On cancellation or overdue invoices, preserve match history and youth records under the agreed retention policy. Define read-only/grace/export behavior before enforcing a paywall; do not delete records automatically as a billing side effect.

## Rollout

Build tenant ownership and roles with the first persistent application. Rehearse two synthetic workspaces before onboarding another real mosque. Deliver billing later after provider selection and sandbox testing; no provider SDK, account, webhook or paid service is needed for this requirements update.

## Separate app licenses and standalone Hub

Hub is the foundation product; organizations may license Hub alone. Futsal and future games are optional app entitlements using shared identity and Hub contribution APIs. Youth do not buy licenses. Preserve granular workspace roles as well as app entitlements; a license is not permission to view all organization records.

Proposed packaging: one Hub license plus a Futsal add-on, with bundles possible later. Prices, seat limits, trial rules and payment provider remain undecided. Games do not own Hub contributions and cannot remove them on cancellation. Define active-season/grace/read-only behavior before enabling paid licenses. No billing implementation is included now.
