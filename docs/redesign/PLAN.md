# Phased rebuild and database reset strategy

Current Phase 2 increment: [session registration and expected rosters](../REGISTRATION.md) adds reservations, capacity, cancellation/history and attendance filters to the retained scheduling/attendance foundation. [Paid session pricing and registration charges](../PRICING.md) are also implemented. [Cash collection, sibling allocations and balances](../CASH.md) are now implemented. Recurrence, waivers, physical refunds and charge adjustments are still pending.

Current release: [complete dropped-feature removal and app integration](../REMOVAL.md) supersedes earlier statements below about retained legacy products, standalone People navigation and the previous schema lineage.

Status: delivery plan; owner subsequently authorized local implementation of the first contacts foundation. See [current implementation status](PEOPLE_STATUS.md). Remote reset/deployment remain outside this authorization. Each phase produces a reviewable slice and only its necessary tables. Existing test data needs no migration or backward compatibility. Preserve Git history and useful code.

## Phase 0 — reviewed design and isolated foundation

Review the owner brief, spec, workflows, entity model and open decisions. Apply the confirmed free-by-default, optionally paid, per-session charging scope; whole-program fees are deferred. Reconfirm infrastructure identity and auth/database pairing. Establish new migration lineage on a dedicated empty Himmah development database/branch, staff auth/membership/grants, audit/retry/version helpers and navigation shell; disable old jobs/routes in the rebuild branch. Do not disturb existing deployments during design.

Acceptance: two synthetic tenants cannot read/write/reference each other's entities, including forged IDs, cursors, grants and retry keys; revoked staff cannot replay successful receipts to access private data; no inherited credential fallback; last owner protected. Workerd managed-auth proxy/session tests and EN/NL/TR private-cache checks pass. New schema has no points/game/member-account prerequisite.

## Phase 1 — contacts, relationships and groups

The [concrete implementation design](PEOPLE_IMPLEMENTATION.md) specifies fields/constraints, transaction commands, endpoints, routes, reuse decisions and acceptance evidence for this slice.

Deliver contact details, multi-group membership, family/inverse relations, communication routing and restricted guardianship assertions. Implement contact/group detail routes, pagination, archive/history and accessible phone forms.

Acceptance: staff can create contacts without email/login, link siblings/parents without duplicated details, see both directional labels from one edge, assign independent emergency/routine contacts, and see a clear missing-method state. Reciprocal duplicates/self-links and cross-tenant edges fail. Family links confer zero access. Archiving preserves historical references. Verify more than one page, same names, contactless child and changed group membership.

## Phase 2 — sessions, registration, attendance and cash

Deliver one-off/recurring scheduling, intended/expected audiences, capacity-controlled registration, attendance-only check-in, session charges and sibling cash allocations, waivers/refunds/corrections and totals. Prefer small increments: scheduling → registration/expected roster → attendance decoupling → cash.

Acceptance: timezone/DST and recurrence retries never duplicate sessions; future edits cannot change completed history; two people competing for last place produce one confirmation. Unknown attendance remains unknown. Saved correction has actor/time/reason. EUR 15 sibling example in MODEL reconciles; receipt/refund retry and concurrency tests cannot overallocate or refund twice. Partial failure shows attendance and cash outcomes separately. Cancellation yields explicit outstanding/refund tasks. Scoped collectors cannot waive/refund or expose unrelated families. Phone keyboard, reload and weak-network conflict flows are verified.

## Phase 3 — insights

Deliver weekly/monthly contact/group/activity summaries using PRODUCT metric definitions. Show denominators, unmarked counts, currency partitions and freshness; avoid universal scores.

Acceptance: fixtures cover first-recorded/returning, archived contacts, overlapping groups, changed historical membership, walk-ins, cancellations, ungraded tests (when available), charge reductions, unallocated cash and refunds across report windows. Contact/session distinct counts reconcile with source rows; group totals disclose overlap. Insights permission is enforced independently. Review SQL plans with representative disposable data before claiming performance.

## Phase 4 — self-paced learning

Deliver activity-local quiz/test creation, manual question editing, publication versions, recipient credentials, availability/attempt controls, automatic/manual grading and release/results. Add reusable questions/AI drafts only after the core workflow; no AI dependency.

Acceptance: editing draft cannot rewrite a published version/attempt; answer keys never appear in participant payloads; concurrent attempt creation respects limits; expiry/attendance eligibility/revocation are server-enforced. Free-text answers remain pending until reviewed. Regrades preserve history. Unverified identities stay outside verified contact metrics. Scores work with no points/reward tables. Religious AI drafts cannot publish without organizer review.

## Phase 5 — live hosted quizzes

Prototype server coordinator on retained Cloudflare hosting, then approve transport/persistence model. Deliver controlled joining, host progression, authoritative deadlines/scoring, reconnect and private session rankings.

Acceptance: forged client clocks/score/contact IDs do not influence results; duplicate/conflicting answers and deadline/close races resolve deterministically; reconnect resumes same identity without extra attempts; host loss/recovery does not rerun questions. Coordinator restart preserves acknowledged answers or invokes explicit void/pause recovery. Join flooding/removal and token revocation tested. Load test planned room size and agree speed bonus/accessibility/tie policy. Participants never receive private contact IDs, hidden keys or peers' detailed results.

## Phase 6 — later extensions

Consider permanent accounts/guardian permissions, reusable learning library and reviewed AI, consent-based staff-confirmed face suggestions, optional points/rewards/game integrations and online payments only under separate requirements. No current core tables should require any of these modules.

## Himmah-only reset runbook — fail closed

This is a verification strategy, **not a currently verified live reset target**. The clone and remote are verified; branch/endpoint/database ownership are only historical records until the steps below succeed. No destructive script or drop command is supplied in this design pass.

1. After design review and implementation authorization, preserve baseline Git SHA `973fa05` (prefer a descriptive archive tag) and all old migrations/functions. Work on an isolated feature branch. Do not rewrite Git history.
2. Obtain project-specific access without reading/using generic inherited credentials. Use only project-local ignored `HIMMAH_DATABASE_URL` (application pooled) and `HIMMAH_DATABASE_URL_UNPOOLED` (direct migration) plus independently verified `HIMMAH_AUTH_URL` / app origin. Never log credentials, URLs with passwords, or auth tokens. Missing access stops this sequence.
3. Read current control-plane metadata for **project `blue-glade-25303766`**. Verify project name/owner, branch ID, endpoint ID/hostname, database and role match the intended Himmah development target. Database name alone is insufficient. Compare against the pinned IDs in INFRASTRUCTURE. Reject main, onboarding, another project, aliases or any mismatch. Record only safe IDs/host identifiers and verification timestamp in a review artifact.
4. Prefer a new empty database on a dedicated rebuild development branch rather than resetting the existing branch. Branches may inherit old app/auth data: do not assume a branch is empty, and do not blindly clone the old schema as the new baseline. Inspect branch origin, table/function inventory and managed auth provisioning. No new service/paid upgrade is implied by this plan.
5. Using the exact verified direct connection, perform read-only identity checks (`current_database()`, `current_user`, server version) and inspect schemas, migration journal and dependencies. Match endpoint → project/branch through control-plane metadata. Confirm app and managed auth belong to the intended environment and decide explicitly whether staff test identities are retained or recreated. Never drop managed auth/provider schemas through application SQL.
6. Define exact application schema/table/function allowlist for reset if reuse is necessary; prohibit broad `DROP SCHEMA public CASCADE` or project/branch deletion. Inspect dependencies and avoid affecting provider tables. Use a transaction and advisory migration lock where supported; stop conflicting old jobs/connections. Review operation scope against target metadata immediately before execution. New blank database is safer and preferred.
7. Build a new reviewed Drizzle baseline and necessary module SQL in a new lineage; do not append a destructive reset migration to the old production chain. Run fresh-install and constraint checks in local PGlite/Postgres, then apply only to the verified rebuild development target using the direct connection. Confirm final schema hash/journal and absence of old points/game dependencies.
8. Seed only synthetic contacts/staff fixtures in this target. Test two-tenant isolation, exact retries, corrections, cash reconciliation and auth pairing. Point only local Himmah configuration to the new database; keep port 3101 and project cookie/manifest identities isolated. Do not modify Kermes Pay, parent configuration or generic environment bindings.
9. Review the resulting schema/application separately before any hosted cutover. Inventory scheduled notifications/push deliveries, old routes and Worker bindings so old code cannot run against incompatible tables. Deployment/cutover is a separate authorized action. Roll back code and bindings to the preserved baseline/old database if needed; no data migration is required. Retire old resources only after explicit scope verification.

## Validation for this documentation pass

Run the repository documentation link checker and `git diff --check`. No application runtime behavior is changed, so do not claim build, runtime, database or hosted tests passed based on historical reports. Rebuild phases require typecheck, applicable unit/SQL/Workerd/UI tests, production build/contrast checks and actual phone verification for keyboard/PWA behavior as relevant.

Executed 28 October 2026: `npm run docs:check` passed (all local Markdown links); `git diff --check` passed. Reviewed Git status: documentation and agent-context changes only. Application source, schema, migrations and deployment configuration are unchanged. Runtime/build/database tests were not run for this documentation-only change.

29 October clarification: paid participation is independent of required registration. Optional paid sessions support explicit session/contact charges and cash without a reservation; attendance never creates debt. See [cash flow](../CASH.md).
