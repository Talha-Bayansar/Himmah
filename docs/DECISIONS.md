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


## Broader community audience, signup resilience and installable PWA

Owner reported signup failing on initial submit and requested age-neutral landing copy plus iOS/Android PWA support. Replace youth/age-specific public copy with community/organization wording across English, Dutch and Turkish. Adult account authorization remains distinct from participant age eligibility; no youth enrollment is introduced.

Compare the real installed Neon client and server adapter: the custom proxy lacked the official x-neon-auth-middleware marker/client metadata forwarding, and the UI assumed returned error unions even though the client throws normalized AuthApiError exceptions. Align headers after existing CSRF checks; handle snake_case and uppercase errors, preserve inputs and translate password/rate-limit/account-exists feedback. A failed verification-code delivery after account creation stays on the verification screen, with resend available. The exact cause of the owner's live attempt has not been independently established. No account/database migration or real-user signup test is performed.

Add localized standalone manifests, opaque regular/maskable icons, Apple touch icon and 44 device/orientation startup PNGs. Android splash generation uses manifest icons/colors; iOS uses explicit startup-image media links. Register a root-scoped service worker in production. Cache only public assets and the localized static offline notice; authenticated HTML and API calls remain network-only. Installation is user-initiated, with native prompt where available and translated iOS/browser guidance. No forced service-worker activation/reload that could discard a form.


## Confirmed Cloudflare fetch-receiver signup failure

A subsequent screenshot still showed the generic service error. Reproduced the default dependency call inside actual Workerd: storing globalThis.fetch on deps and invoking deps.fetch changes its receiver, causing TypeError “Illegal invocation” before any auth-service request. This deterministically returns the same 503 fallback; the earlier header/error-handling changes did not fix this underlying runtime defect.

Use a forwarding arrow that invokes globalThis.fetch with its proper receiver. Keep existing managed Better Auth accounts, proxy allowlist and tenant permissions. Add a real Worker-runtime suite using two local Workers: one bundles the actual API code with its production dependency defaults, the other simulates the upstream auth API without network access, real accounts or email. The old-code variant reproduces 503; the fixed variant verifies signup 201, verification, cookie normalization, authenticated account lookup and cross-origin rejection. Run this suite in npm test/CI. Kermes Pay runs Better Auth directly and does not share this faulty proxy dependency pattern; no changes or credential reuse there.


## Member/group directory and consistent infinite fetching

Owner authorized the next member/group milestone and made infinite scrolling a standing fetch pattern. Use tenant-bound keyset cursors, stable descending created_at/ID ordering, 25-row default/50-row maximum pages with one lookahead row, and shared sentinel/manual Load more/retry/end UI. Existing organization lists and group selection also use this pattern. No offset pagination, full-list pickers or total-count queries are needed. Cursors preserve timestamp precision and support Unicode filter text; they carry no authorization claims.

Participant records are minimal private nickname entries, with staff permission/consent attestation and no automatic account creation. Groups support multiple memberships. Rename/archive use optimistic versions; archiving preserves history and assignments. Owner/admin permissions are enforced in API and atomic SQL; volunteers cannot administer the directory. Group/person foreign keys include organization IDs. Changes are audited without participant names or raw invitation tokens in audit rows.

Adult staff invitations bind to a verified email, expire after seven days, and can be revoked. Creator’s current role is checked at acceptance. Store only SHA-256 token digests; show the link once and share manually, using /join#token so the secret does not enter server URL logs. Recipient previews the organization/role before explicit acceptance. Existing roles are preserved; accepting an old invite cannot restore removed membership. Owners cannot remove/demote themselves or grant another owner; admins cannot grant administrator access or remove admins.

Generate Drizzle migration 0001, test with PGlite and apply first to the isolated development branch, then onboarding. No main-branch changes or synthetic records in onboarding. Add a separate directory mutation limiter (60/minute/user), preserving the stricter auth limiter. Existing auth identities and the Cloudflare-native fetch binding fix remain intact.
