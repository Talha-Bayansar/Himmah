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

## Mobile management pages and keyboard visibility

Owner reported a phone keyboard covering the group input in a centered dialog and requested separate management pages. Keep `/start` for account/workspace selection; use `/workspace/:organizationId/:section` for overview, members, groups, staff and invitations. Sections use real Router links, active-page semantics, horizontal navigation on narrow screens and focus on the section heading. Keep existing identity/organization-scoped infinite pagination, authorization, loading skeletons and destructive/dirty confirmations. No schema or account migration.

Use the visual viewport to size/reposition shared dialogs and confirmations when keyboards open, with scrolling, 16px inputs, larger controls and stronger focus outlines. Directory save/cancel actions remain reachable through sticky positioning. Do not disable browser zoom. Group forms explain groups rather than participant records. Preserve setup’s successful-save boundary before routing to its new overview, so completed setup does not ask to discard saved data.

## Compact fixed chrome, organization switching and settings

Owner rejected the crowded header, requested profile/settings for language and sign-out, persistent navigation that does not shift with content, an organization switcher and removal/relocation of the low-purpose Workspace tab. Use three primary sections: Members, Groups and Settings. Fix navigation to the bottom on phones and below the fixed header on wider screens, reserving corresponding content/safe-area space. The header contains only the current organization switcher and a profile shortcut. Move profile/language/install/sign-out controls and read-only organization details to Settings; retain staff/invitation pages as Settings destinations. Keep confirmed sign-out, private-cache clearing, keyboard-aware dialogs, skeletons and dirty-form blockers.

Use `/settings` for account preferences before selecting an organization; anonymous auth/onboarding retains its language selector. Owners/admins open Members by default, volunteers Settings. Old overview links redirect to Settings. Organization switching reuses identity-scoped infinite cursor pages and preserves the current section when the new role permits it. Do not fetch every organization or introduce new stored preferences, auth identities or database changes.

## Centered scrollable dialogs

Owner clarified that mobile modals should stay centered, with scrolling when a focused input is obscured; a bottom sheet was an optional alternative. Retain the existing shared Radix dialogs and visual-viewport sizing, remove the narrow-screen top alignment, and center in the visible viewport both before and after keyboard resize. Preserve bounded height, overflow scrolling, sticky form actions and focus trapping/restoration. Focus visibility checks also account for the dialog bounds and sticky action area.

## Routable group membership pages and compact switcher

Owner requested that group member views survive reloads as real pages, and reported the large organization-label/chevron gap. Replace selected-group component state with `/workspace/:organizationId/groups/:groupId`; fetch current group metadata via a bounded, authorized `GET /api/organizations/:id/groups/:groupId` and retain the existing infinite group-filtered member query. Group detail lookup checks tenant and owner/admin role in both API and SQL, with missing/archived groups unavailable. Keep real group-list/back links, loading/error states, localized guidance and query cancellation. Hide the old Add member action in a group view because it created an unassigned roster entry; direct users to the existing Add to group flow. No schema or auth changes.

The switcher button now sizes to its contents with the chevron adjacent to the label; free header space sits before the separate profile shortcut. Keep long-name truncation and fixed header/navigation dimensions. Future entity detail pages must load independently from addressable routes, rather than depend on previously selected records.

## Membership-aware group options and icon actions

Owner reported that already-assigned groups remained selectable and showed a misleading add spinner. Add a member-specific paginated group-options read, returning an authoritative assigned flag with each active group. Include member identity in query keys/cursor scope, check active-member availability and tenant/owner-admin authorization, and keep bounded pages/search. Existing memberships show a checkmark and translated Already in this group status and are disabled. Refresh membership state when opening the picker; do not offer stale choices during an initial/background refresh failure. Only the group being added shows a spinner, while other choices are disabled for the write. Existing idempotent assignment/audit rules remain the server safeguard for concurrent changes. No schema migration.

Owner wants an app-like mobile interaction style as a general preference: consistent Lucide icons with visible localized labels and touch-sized item controls. Add icons to member/group/staff/invitation row actions and form save/cancel/copy/close actions. Keep accessible labels, confirmations and real links; do not replace discoverable actions with unlabeled icons. Record this preference in AGENTS.md.

## Current organization is a disabled choice

Apply the same non-selectable state used for existing group memberships to the organization switcher. The current organization shows a visible translated Current organization label and checkmark, remains readable, and is disabled. Selecting it cannot close the picker, trigger navigation or show pending state; other paginated choices keep their existing behavior.

## Compact item menus and app-focused PWA entry

Owner requested fewer visible row controls: retain one clear primary action where useful and put secondary actions in a dropdown; use only the dropdown where no primary action stands out. Active groups keep their real View members link. Member/group rename/archive/restore/group assignment and staff/invitation controls use shared accessible icon-and-label ItemActions menus. Current staff roles are disabled choices, and all permission guards/confirmations remain. Queue modal actions after menu focus/scroll locks release and restore focus after cancelling a controlled dialog, including dialogs opened without a Radix Trigger.

The PWA now starts at /app with its existing id / unchanged. This entry checks the session and first bounded membership page. Verified users with one complete organization result go to Members, or Settings for volunteers. Multiple/partial organization pages use /start for selection; zero memberships use setup. Signed-out or unverified accounts go to /start?mode=signin for sign-in/verification. Navigation replaces the entry history item. Do not fetch every organization or add device-stored private preferences. Public / and manual /start behavior remain available.

## Persistent one-off activities

The next Hub slice is organization-owned, one-off scheduled activities. Owners/admins create, edit and cancel; verified volunteers can read their organization's activity details. Each activity stores a UTC start/end and a snapshot of the organization's IANA timezone. The form interprets wall times in that timezone, rejecting nonexistent/ambiguous daylight-saving times. The current implementation bounds duration to seven days, name to 80, location to 160 and description to 2,000 characters; these are implementation limits, not confirmed engagement policies.

Creation uses an organization-scoped request key, returning the original activity on matching retries. Changes use optimistic versions and an atomic staff-role guard/audit entry. Cancellation preserves records and is confirmed through the shared AlertDialog. Cancelled activities are read-only and remain discoverable via a list filter and their real detail URLs. No destructive deletion or restoration workflow is introduced. List order is newest-created with stable timestamp/ID cursors; it is not a chronological event calendar yet.

Activities have a fixed bottom-navigation entry. Lists retain the standard bounded infinite-query pattern; detail pages fetch independently by ID and do not fetch the list. Forms use TanStack Form and the shared centered/scrollable dialog with dirty-change confirmation. Recurrence, group eligibility, registration/capacity, attendance and earning rules are deliberately separate following slices; no quiz, award rule, youth account or game license is required for activity setup.

## Activities, session history and audiences

Activities now hold reusable name/description/default-location/timezone/audience settings. Their dates belong to separate sessions. Creating an activity no longer requires a date; owners/admins schedule sessions afterward. Legacy dates are retained in nullable compatibility columns, and migration 0003 copies every existing one-off activity into its first session (including past/cancelled ones) without removing originals. Archiving an activity prevents new sessions and default edits; it never bulk-cancels existing sessions.

Each session snapshots name, description, location, timezone and the selected group IDs. Changing activity defaults cannot rewrite an existing session. Future sessions support version-checked time/location edits and confirmed cancellation with an optional saved reason. Once a session starts, ordinary edits/cancellation are blocked in SQL; a future audited correction workflow is separate. New/backdated session creation is not supported in this slice. Session duration retains the seven-day implementation limit.

An empty audience group list means everyone; otherwise it contains 1–20 distinct active groups from the same organization. Twenty is a bounded implementation limit, not a confirmed organization policy. SQL validates ownership/active state both when saving defaults and when copying them into a new session. Group IDs are stored as bounded UUID arrays, with group summaries bounded by the same cap; group options still use normal cursor pages, never fetch-all. Existing selected archived groups can be removed from the form. Session group identities are frozen, while displayed group names/archival labels reflect current group records. This is not a frozen participant roster or participant account access-control implementation. Future attendance must derive eligibility from session group IDs, not current activity defaults, and preserve individual attendance history separately.

Each activity has Upcoming/Past session views; upcoming includes ongoing sessions until their end, and past means ended. Sessions order by start time and ID (ascending upcoming, descending past), with cursors bound to user/org/activity/view. Detail URLs are independent and reloadable, including nested session routes; the activity route yields to its session child via Outlet. Activity catalog cards show the next non-cancelled session when available. Staff reads remain organization-scoped; only verified owners/admins manage defaults/sessions. Draft/publish, recurrence, registration/capacity, attendance and points remain following slices.

## Session attendance check-in

Attendance is an owner/admin workflow in this slice. Volunteers cannot read or write private attendance until explicit activity/group assignments are implemented. Participant nickname roster records remain separate from account identities. No points, participation approvals, self-service youth accounts, public attendance views, automatic messages or game integrations are introduced.

A session roster uses its saved audience group IDs (or everyone), current active person/group membership and retained attendance records. Leaving the audience or archiving a person never hides saved history; authorized corrections remain possible. This is not a permanently frozen participant roster. Unmarked remains distinct from absent; no finalization or automatic absence is inferred. New check-in opens at the session start; ended sessions accept attendance and audited corrections, while cancelled sessions are read-only. This opening policy is an implementation default, not a confirmed program policy. A separate walk-in eligibility override, finalization and volunteer assignments remain later work.

Saves contain 1–50 unique members, their expected versions, a fixed attendance state and a bounded staff-only reason. Valid members are saved in one transaction while stale/ineligible members receive explicit per-member outcomes. Changing any previously saved state requires a nonblank reason; clearing attendance preserves the record and its audit. The UI confirms corrections, performs no optimistic attendance writes, and displays both successful and failed names/outcomes before another attempt.

A Postgres invoker function serializes each session save, checks verified staff authorization via the API and owner/admin membership again in SQL, locks relevant roster/membership rows and checks the saved audience. Unique request receipts bind actor, organization, session, key and canonical payload; identical retries return the original result without reapplying changes, including after later corrections. A different payload or actor cannot reuse the key. Each actual change records previous/new state, actor, version, reason and timestamp. No-op saves do not add attendance history. Receipts and audit writes commit with the attendance transaction. The function is versioned in Drizzle migration 0004; later function changes require new migrations rather than modifying applied files. db/migrations/functions/attendance.sql is the readable current definition.

Attendance and per-member change history use bounded cursor pages with user/org/activity/session/filter scope, stable timestamps/IDs and AbortSignals. The phone UI supports at most 50 selected members, saved/failed summaries, an immutable same-key retry after an unconfirmed response, dirty/uncertain-leave confirmations, and private paginated audit dialogs. New check-in has its own reloadable route and exactly one back link to the session. Session metadata remains read-only after start; attendance is its own workflow. No private responses or mutation payloads are stored in service-worker/offline caches.


## Bulk group membership and search controls

Group detail pages now offer Add members for owners/admins. The member picker uses scoped cursor pages with search, retains up to 50 selections across pages/searches, and displays existing memberships as checked, labelled and disabled. Saving uses one bounded server request and one SQL statement: all selected people and the group must still be active in the organization, otherwise no memberships are added. Authorization is repeated in SQL; retries preserve uniqueness and do not duplicate group.add audit entries. This uses existing directory tables, with no migration or new service. Failed submissions retain selections and refresh options; unsaved selections use the shared discard confirmation.

Search/filter toolbars reset the inherited input top margin and center their controls. On phones, search takes its own full-width row, with a compact archived filter below; Members, Groups and Activities share this layout. Keep this pattern for future searchable lists so longer translated filters cannot squeeze the search field.


## Manual engagement ledger

Manual awards are independent of attendance, periods and games. Verified owners/admins can award 1–10,000 whole points to up to 50 active roster members, with required staff-only reason, past/current contribution time and optional scoped activity/session context. These numerical bounds are implementation defaults. Original entries cannot be edited/deleted; corrections append a linked delta toward a nonnegative corrected value with an expected revision and required reason/confirmation. Member balance is a database-derived sum, not spendable currency. Immutable request receipts return original per-member results on retry, with unknown outcomes retaining the exact payload. New member detail routes expose private history even after archival. See [Manual points](MANUAL_POINTS.md) for authorization, concurrency and deferred policies.


## Engagement reporting periods

Periods are independent dated reports, not award allocations. Whole inclusive local days use the saved organization timezone; points follow occurrence time (including corrections), attendance follows session start time and only recorded states. Open reports use current roster/group membership; archived rows remain visible. Overlapping periods or group memberships can display the same contribution but never create points; totals across overlapping views must not be added. Verified owners/admins access period/member/group cursor pages under Settings. Closing with confirmation saves names, memberships and metrics in one database statement/transaction, preserving a permanent report despite later source changes. Closed reports cannot be edited/reopened in this slice; source histories stay correctable. See [Engagement periods](ENGAGEMENT_PERIODS.md) for the full policy and concurrency boundary.


## Optional attendance earning rules

Activity defaults can enable fixed present awards (1–10,000 whole points); zero remains attendance-only. Sessions snapshot the amount and activity revision on creation, and existing schedules/records are never backfilled. Configured check-in requires a server preview and explicit linked-point confirmation. Saving attendance and its award/reversal/restoration is atomic, with one root source award per organization/session/member, version checks and replay receipts. Attendance-source awards are corrected through attendance, never the manual points form. Session start is their occurrence time; open period reports update and closed snapshots do not. See [Attendance earning](ATTENDANCE_EARNING.md) for exact boundaries and the existing account-linking safeguards.

## Scoped volunteer access

Implemented group/activity assignments with independent attendance and manual-award permissions. This supersedes earlier blanket volunteer restrictions in this document. Owner/admin directory management, manual corrections and period reporting remain restricted. See [Volunteer access](VOLUNTEER_ACCESS.md) for scope, audit and revocation behavior.

## Staff-managed rewards

The owner approved and we implemented rewards and redemption after scoped volunteer access. This supersedes earlier deferral of spendable rewards. Verified owners/admins manage the private catalogue, member eligibility, point/stock reservations, final handouts and audited pending cancellations. Earned engagement history stays separate from spending. See [Rewards](REWARDS.md) for policy defaults, balances, retries and deferred participant access.
