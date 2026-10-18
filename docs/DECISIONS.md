# Decision log

## 2026-10-17 — Product requirements

Confirmed: two modes, futsal squads, equal starting strength, engagement/Friday quiz affecting training growth, simulated matches, competition table, configurable team groupings and season end, organizer-controlled prizes, own-phone access. Source: owner conversation. Details in PROJECT_CONTEXT.md.

## 2026-10-17 — Project identity and isolation

Working name chosen by agent: Himmah Futsal; slug himmah-futsal. Dedicated folder, Git repository, Neon project and environment variables. Reserve port 3101. Never reuse Kermes Pay infrastructure. Private GitHub visibility is the default because youth-focused project requirements do not call for public source.

## 2026-10-17 — Technical direction

Proposed: TypeScript, Next.js, Drizzle and Neon PostgreSQL. Only TypeScript foundation is installed now; no framework scaffolding or hosting commitment. Europe/Frankfurt chosen as provisional Neon region, not a complete determination of data residency/compliance.

## 2026-10-17 — Game defaults pending validation

Seven-player manager roster, virtual fillers, baseline training, capped bonuses, new-season resets, point/tie-break rules and pilot size remain proposals. Need balance experiments and owner review before real seasons. Do not silently promote example percentages to final rules.

## 2026-10-18 — Formats, settings and multiple organizations

Owner-confirmed: tournament format in both modes, broad pre-season game configuration, and multiple independent mosque/organization workspaces. Treat mode (Club Manager or shared participant team) separately from format (league or tournament). Proposed initial tournament format: single elimination, with group stage plus knockout as a later option; exact tournament variants are not yet confirmed.

Use organization-scoped membership, configuration and game records from the first persistence implementation. Cross-organization isolation is mandatory, not a feature to retrofit when subscriptions launch. Snapshot validated settings on season activation. Draft templates can be reused; active results cannot change when templates are edited.

Future monetization is a possible organization-level subscription/paywall. Preserve a provider-neutral entitlement boundary. Stripe and Mollie are candidates, not selected providers. No billing service, prices, tiers, or payment integration are authorized by this planning addition.

## 2026-10-18 — Source-independent engagement and manual awards

Owner clarified: quizzes must not be hard-coded. Each organization controls its earning system through custom activities, optional quizzes/attendance, or manually assigned individual points. This supersedes earlier wording that treats Friday quizzes as a required core mechanic. All four mode/format combinations must work with manual awards only.

Architecture proposal: one audited, append-only engagement ledger and versioned activity rules, feeding a source-independent season training conversion. Football standings points remain separate. No database/application implementation is claimed by this update.

## 2026-10-18 — Standalone Hub, connected apps and approved Hub scope

Owner accepted Hub as a standalone attendance/engagement product with Futsal as an optional licensed app and future games sharing the same contribution history. One account across apps; tenant-specific memberships and permissions remain mandatory. Hub records do not require a game license or season. Game-specific eligibility/allocations are separate from authoritative contributions. No universal spendable wallet is implied.

Owner approved the Hub feature design captured in HUB.md. Prioritize Hub core workflows before the Futsal engine milestone. Retain both Futsal modes/formats in its first playable version. Initial implementation may share a repository and tooling, with separate app experiences; no repository, database or infrastructure rename is required by this change. Pricing/tiers/provider and exact UI details are not settled.

## 2026-10-18 — Owner-created GitHub remote

Owner supplied https://github.com/Talha-Bayansar/Himmah.git and authorized connecting/publishing the local repository. Keep the local folder and dedicated Neon resource names unchanged. Use Git transport; earlier API creation failure is historical, not a general GitHub connectivity failure.

## Detailed Hub design v1

Created detailed interaction specifications and a local static visual board for the three agreed Hub workflows. Layout, styling, default finalization behavior, recurrence support and registration policies are design proposals for review, not newly owner-approved rules or implemented functionality. No infrastructure or application tables changed.

## First interactive Hub prototype

Implemented approved core screens as a Next.js application, using fictional in-memory data before production identity and persistence. User-authorized build follows the design handoff sequence. State transitions cover linked attendance awards/corrections, revision validation, manual grants and one-off activity publishing. Two sample workspaces and role/member switches are demo controls, not security boundaries. Do not use real youth records. Recurring activities, authentication, database/API integration and Futsal gameplay remain subsequent work.

## Cloudflare prototype deployment

Owner explicitly requested publishing for phone testing. Deploy the current client-only prototype as a static Next.js export through the dedicated himmah-hub Worker, without modifying Kermes Pay or sending database/auth credentials. Keep server-side authentication and persistence as future work; migrate deployment architecture when those features arrive.

## Early-access organization onboarding

Owner reiterated independent organization registration and asked to continue. Add a separate managed-Neon-auth organizer portal with persistent organization ownership/memberships, using a dedicated onboarding branch and a same-origin Cloudflare API. Preserve the sample-data demo. No custom self-managed password storage, billing, new youth enrollment or persistent attendance system is introduced by this increment. Development migration precedes onboarding migration; main remains unchanged.

## Owner-directed TanStack and shadcn migration

Replace Next.js with TanStack Start and Router, use TanStack Query for remote state and mutations, and TanStack Form for application forms. Install the complete official shadcn component set. Preserve the approved Himmah styling. Required interaction patterns: skeleton page loading, spinner pending actions and confirmation dialogs for destructive actions (including sign-out).

The existing identity service is managed Better Auth. Keep its users, sessions, proxy endpoints and database IDs; no identity-storage migration or replacement is needed to satisfy Better Auth. Cloudflare now runs TanStack Start SSR and the existing protected API, with generated Worker configuration. No database schema/data migration is part of this framework change.


## Public landing page and component layout refinement

Owner requested a landing page that initiates onboarding and a UI refresh after shadcn migration. Serve the public introduction at `/`, move the fictional interactive workspace to `/demo`, and keep persistent organizer onboarding at `/start`. Use explicit early-access copy: accounts/workspace setup are available, engagement workflows are sample-only and Futsal is planned. Repair wrapped-select flex sizing, navigation alignment, mobile controls and button wrapping while preserving the forest/lime theme. Existing unsaved-change guards, confirmation dialogs and auth boundaries remain in place.


## Live-only app, Paraglide localization and contrast fixes

Owner requested removing deployed demos, adding English/Dutch/Turkish with Paraglide JS and keeping the stack close to Kermes Pay. Remove `/demo` and all demo/unfinished-feature links and panels. Keep the working landing page, organizer auth/recovery and persisted workspace setup/list/detail. Internal Hub fixtures and tests remain as future implementation reference; this does not cancel the engagement/Futsal requirements.

Mirror Kermes Pay’s Paraglide cookie/SSR setup using an isolated `himmah_locale` cookie and English fallback. Use a locally installed message-format plugin for reproducible compilation without CDN access. Change language reactively so forms are preserved. Preserve existing managed Better Auth accounts; no identity or database migration. Fix the global anchor color inheritance that overrode shadcn button-link text, improve muted text contrast, and add a production-CSS contrast audit with a regression reproduction. Browser tools are unavailable in this environment; report component/CSS/SSR evidence separately from browser visual verification.
