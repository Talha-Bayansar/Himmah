# Delivery roadmap

## 0 — Foundation (this request)

Choose working name; isolate repository; document requirements and proposed rules; add agent instructions; provision dedicated database; record access blockers accurately. Done when checks pass and local commit exists; remote publication is tracked separately.

## 1 — Rules and game engine

Finalize supported team sizes, tactics permissions, training caps, fixture calendar, tournament variants and tie resolution. Define validated pre-season settings, source-independent engagement-to-training conversion and preview rules. Separate competition mode from league/tournament format. Implement seeded training, fixtures, standings and simulation. Test idempotency boundaries and run reproducible balancing experiments. Exit: both modes can complete fictional league and knockout seasons through commands; byes, advancement and configurable settings are covered.

## 2 — Playable phone prototype

Home, club/player, challenges, training reveal, tactics, match report, league/bracket, organization workspace and organizer season-settings screens. Fictional Manager season plus four-team/three-person Team League. Exit: navigate the full loop on a narrow phone viewport, with explicit sample-data labeling.

## 3 — Persistent application

Organization-scoped schema and composite foreign keys from the start. Versioned Drizzle migrations on development branch, invitation accounts and workspace role enforcement, configurable earning rules, custom activity approvals and manual awards, optional quiz/attendance adapters, transactional ledgers, saved simulation results, scheduled jobs/manual retries and audit records. Exit: tested cross-user and cross-organization authorization, immutable settings, tournament advancement and duplicate execution protection; no shared credentials.

## 4 — Pilot readiness

Confirm parent/guardian process, religious challenge policy, privacy/retention periods, content review, rewards, accessibility, organizer support and backup/recovery process. Test poor connections, season timezone, closure, correction and withdrawal flows. Exit: owner can administer a complete rehearsal without database access.

## 5 — Mosque pilot

Proposed 12 participants in four teams of three over four to six weeks, Team League first. Both modes remain product requirements. Observe return visits, understanding, encouragement versus pressure, volunteer workload and season balance; tune the next season without silently changing an active one.

## Current priority — Hub first (supersedes the sequence above)

1. Design Youth Home, Volunteer Check-in and Activity Setup using HUB.md, including empty, error and correction states.
2. Build standalone Hub membership/roles/groups, activities/occurrences and attendance; then configurable/manual awards and personal histories.
3. Add Hub engagement periods and basic reports. Verify a manual-only organization and an attendance-without-points organization using two isolated synthetic workspaces.
4. Establish the versioned, authorized contribution API and organization app-entitlement boundary; verify Hub works without a Futsal license.
5. Resume the Futsal game-engine and playable-app milestones above, preserving both modes and formats. Connect training to Hub contributions without reducing original contribution history.
6. Pilot, extend Hub with optional modules, and add paid billing only when explicitly scheduled.

No runnable Hub UI or API is implemented by this planning update. The next deliverable is the three core screen flows, not production deployment.

## 6 — Multi-organization rollout and optional billing

Rehearse independent onboarding, workspace roles, branding, templates and simultaneous competitions with two synthetic organizations before inviting a second real mosque. Organization isolation is already required in milestone 3, not postponed until here.

If/when the owner chooses to monetize: agree pricing, trial/limits, cancellation, grace and data access policy; select Stripe or Mollie using current documentation and skills. Integrate organization subscriptions behind provider-neutral entitlements with signed/idempotent webhook handling and sandbox verification. No youth checkout, paid stat boosts or cross-tenant billing access. Billing is not part of the initial pilot.

## Engagement acceptance gate

Verify custom activities and manual-only earning before treating the core loop as complete. No mandatory quiz configuration. Exercise a custom rule, attendance award, manual individual/bulk award, optional quiz award, duplicate submission, unauthorized/self-award, correction and training cutoff. Quiz automation may follow the shared award service; the core game must work without it.

## Prototype implementation checkpoint

The first three core flows are now implemented in Next.js with session-memory fictional data, plus activity registration, point/attendance histories, manual awards, organization switching and a connected-app information page. Automated domain tests cover award retries, linked corrections, roster revision conflicts, registration capacity and independent sample workspaces. No production authorization, persistent database integration, recurrence, scheduled activity lifecycle, correction requests or actual Futsal API exists yet. Next: review the runnable prototype, then implement membership/auth and a tenant-scoped persistent Hub data layer.

## Organizer onboarding checkpoint

Adult organizer signup/sign-in/email verification/recovery, persistent workspace creation/list/detail and session-derived membership checks are implemented separately at `/start/`. Initial organization/membership migrations are applied to development and a dedicated onboarding branch; demo activities remain in-memory. Next: verify signup/email/session flow on the hosted app, then implement authorized staff invitations and member/group management before connecting persistent activities and points.

## Owner-directed stack migration checkpoint

Runtime migrated to TanStack Start/Router on Cloudflare; Query manages remote account/organization data and mutations; Form manages application forms. All 62 shadcn registry components and helpers are installed, with source provenance. Shared skeleton, interaction spinner and destructive-confirmation patterns are required going forward. Existing managed Better Auth accounts and organization records remain unchanged. Domain/API and component interaction checks cover the migration; browser/email verification limits remain documented.

## Persistent activities checkpoint

Organizer onboarding, staff invitations and private members/groups are live. The next implemented slice adds organization-owned one-off activities with timezone-aware scheduling, independent detail URLs, editing, audited cancellation and bounded infinite lists. This supersedes the older prototype-only checkpoints above. Next: occurrence attendance with volunteer authorization, roster pagination, idempotent saves and explicit corrections; then configurable/manual awards and personal histories. Recurrence, eligibility and registration/capacity remain follow-up work, not shipped controls.

## Session and audience checkpoint

Activities now own reusable defaults and group eligibility; sessions own their saved schedule, details, audience and cancellation reason. Existing one-off records migrate into first sessions. Upcoming/past lists and real session detail routes are implemented with bounded pagination, retry protection and history guards. Next: session-scoped attendance with eligibility-aware rosters and audited corrections, then configurable/manual awards. Draft/publish and recurring scheduling remain later workflow additions.

## Attendance checkpoint

Session attendance now supports an eligible paginated roster, individual/bulk statuses, distinct unmarked/present/absent/excused states, same-request replay protection, per-member failure outcomes and reasoned corrections with private paginated history. Owners/admins are authorized; volunteers remain blocked pending assignments. Check-in opens at session start; cancelled sessions are read-only. Next: configurable/manual awards through the engagement ledger, then attendance-linked awards and personal histories. Volunteer assignments, finalization, walk-in overrides and richer registration remain separate follow-up features.
