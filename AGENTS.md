# Agent instructions — Himmah Futsal

## Read at the start

Read README.md, docs/PROJECT_CONTEXT.md, docs/DECISIONS.md, docs/INFRASTRUCTURE.md, and the documents relevant to your task. They are the durable project context. Current user instructions take precedence. Update docs when behavior or infrastructure changes.

## Owner's intent

Build Himmah as a modular engagement platform for mosques and other community organizations, without an age restriction on its audience or public landing page. The original pilot serves mosque youth aged 11–15; retain safeguarding for any youth programs. Himmah Hub is the standalone engagement app (members, groups, activities, attendance and points); Himmah Futsal is its optional connected game. Read docs/HUB.md before planning implementation. Build Hub workflows first; preserve all Futsal requirements for the connected game milestone. Both Club Manager and Team League belong in the first playable product. Both must support league and tournament formats; mode and format are independent choices. Organizers need a validated pre-season settings builder. Multi-organization isolation is a foundation requirement, even when piloting with one mosque. Future billing is organization-level and provider-neutral; Stripe or Mollie is undecided, not an instruction to integrate payments now. Preserve the football squads, configurable seasons, engagement-to-training loop, simulated matches, league standings, and volunteer control. Do not quietly simplify it into a points-only tracker or remove a mode.

Distinguish owner-confirmed requirements from implementation proposals. Numerical balancing, branding, stack choices, roster fillers, and pilot size are defaults to validate, not owner commitments. Never describe unfinished functionality as shipped.

## Isolation is mandatory

- Work only in this repository for this project. Never change `/workspace/kermes-pay` or parent workspace configuration as a side effect.
- Use port 3101. Check availability; do not terminate another project's processes.
- Do not use inherited DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, or deployment credentials without verifying they belong to Himmah Futsal. The shared environment currently contains another project's bindings.
- Use HIMMAH_DATABASE_URL and HIMMAH_DATABASE_URL_UNPOOLED in this project's ignored .env.local. No fallback to a generic DATABASE_URL.
- Use the dedicated Neon project and development branch listed in docs/INFRASTRUCTURE.md. Never migrate main during development. If project credentials are missing, fail clearly.
- Do not change global Git authentication or global application configuration. Use project-local dependencies and settings.

## Configurable engagement is core

Read docs/ENGAGEMENT.md. Each organization defines its own activities and earning rules, or uses manual-only awards. Quizzes and attendance are optional sources, never mandatory game mechanics or hard-coded training inputs. The engine consumes normalized, authorized engagement awards through a ledger and season conversion rules. Keep engagement points separate from football standings points. Hub awards must not require a game season. They need actor, organization-scoped recipient, optional Hub engagement period, reason, occurrence time, idempotency and audited corrections; game eligibility and allocation are separate records. Never allow direct rating/total edits as an award shortcut.

## Organizer accounts and production boundary

Read docs/ORGANIZATION_ONBOARDING.md before changing auth, Worker routing or database setup. `/` is the public landing page; `/start` is persistent early-access organizer setup. No demo route or fictional youth workflows may be exposed in the deployed app. Keep prototype fixtures/tests as internal development material only. The onboarding database branch contains organizer accounts and must not be reset or used for synthetic seeding. Use development for migrations/tests; keep main untouched unless explicitly authorized. Participant records are private nickname-only roster entries, separate from login accounts. Their creation requires staff authorization/consent attestation. Participant login linking is implemented through organizer-attested, verified-email invitations; read docs/PARTICIPANT_ACCESS.md before changing it. The app does not verify guardians or replace the organization's enrollment process. Never enroll real participants or send invitations as test fixtures. Staff access uses verified-email-bound, expiring invitation links; never send invitation emails automatically.

## Engineering defaults

TypeScript strict mode; mobile-first responsive web app. Required stack: TanStack Start, Router, Query and Form; Paraglide JS localization (English, Dutch, Turkish); shadcn/ui components; Better Auth (currently managed by Neon); PostgreSQL on Neon and Drizzle migrations. Do not introduce Next.js or a competing app/form/data framework without an explicit user request. Keep football calculations pure in src/domain with injected, seeded randomness and versioned rules. Match inputs, training outcomes, and results must persist; refreshes and job retries cannot reroll them.

Read docs/FUTSAL_SETUP.md before changing Futsal. Preserve both modes/formats, owner/admin pilot policy, source-independent points, deterministic previews and exact receipts. Prepared setup is immutable and is not playable activation. Squad/training/match execution must use persisted versioned snapshots and may not reroll them or spend Hub contributions.

Read docs/NOTIFICATIONS.md before changing notifications, device registration, sign-out cleanup or scheduled push delivery. Preserve recipient-link snapshots, current-access checks, transactional events, generic lock-screen payloads, bounded leased retries, endpoint validation and explicit device permission. Never send synthetic test pushes to real devices.

Read docs/CHALLENGES.md before changing challenges. Published rules/audience IDs are frozen; only owner/admin review/direct recording may create a challenge award. Preserve self-link checks, private submissions, expected versions, receipt retries and once-per-person ledger integrity. Corrections never reopen an approved completion.

Read docs/REWARDS.md before changing rewards or spending. Wallet availability is earned minus pending reservations minus handouts; never debit the engagement ledger for a redemption. Participants may reserve/cancel only their own pending rewards through self-scoped APIs; catalogue management and final handouts remain owner/admin-only. Keep these permissions separate from volunteer award permissions, enforce atomic balance/stock checks, snapshot prices and preserve audited final history.

Read docs/VOLUNTEER_ACCESS.md before changing volunteer access. Group/activity grants independently allow attendance (including linked attendance point reconciliation) and new manual awards. Enforce current scope for reads, histories, references, bulk writes and receipt retries; hide cached private details after authorization failures. Manual corrections, directory changes and period reports remain owner/admin only. Revocation and staff role/removal changes preserve audit history.

Enforce permissions, configurable earning rules, manual awards, optional quiz scoring, approvals, rating growth, and prize administration on the server. A participant may not approve their own participation or fetch quiz answer keys before submission. Bound every query by organization, season, membership, and role as relevant. Derive authorized organization scope from verified membership, never trust a client-supplied organization ID alone. Apply tenant scope to jobs, caches, exports and files too. An organization subscription never grants access to another organization or stronger players. Keep safety constraints outside organizer-configurable game settings.

Use transactions, unique constraints, and idempotency keys for training, match execution, and reward claims. Snapshot rules when a season starts; do not silently change active-season outcomes. Record volunteer corrections with actor, reason, and time.

Store UTC timestamps and an explicit season timezone. Keep secrets out of Git, tool output, logs, screenshots, and documentation. Commit only example variable names and non-secret resource IDs.

## Mandatory UI and data patterns (owner preferences)

- Distinguish navigation from actions: use shared RouteTabs with real links and aria-current for route-backed views; use shadcn tabs for in-page panels and aria-pressed segmented choices for form modes. Never style page tabs as primary/outline mutation buttons. Paired actions use shared gaps and stretch to the same height when translated labels wrap; icon-only controls remain fixed square touch targets. Separate account-switching alternatives from invitation acceptance with clear spacing.

- Entity detail headings keep the title and fixed-size more menu in one row on phones; titles wrap in the remaining space instead of pushing the menu into a centered standalone row. List-page create actions may still stack.
- Card primary/menu pairs give the labelled action the remaining width and keep the more trigger a fixed 44px square. Target `.item-actions-trigger` directly because Radix can replace data-slot; verify actual trigger dimensions. Search/filter rows need a consistent 12px gap and reset label/select margins.
- Keep list items compact: show at most one clear primary action (such as opening details), and place secondary actions in the shared ItemActions dropdown. If no primary action stands out, put all item actions in the menu. Ellipsis triggers need localized per-item accessible labels and 44px targets; menu options keep icons/labels and destructive confirmations. Use shared menu-to-dialog focus handling rather than opening overlapping modal layers.
- Make interactions feel native on phones: use consistent Lucide icons alongside visible localized labels for common actions and item controls (view, add, rename, archive/restore, remove, revoke, save/cancel). Avoid bare text-only item actions. Icon-only controls need localized accessible names and at least 44px touch targets; decorative icons are aria-hidden. Show pending state on the action/item actually being changed, not every option in a list.
- Build UI from the installed shadcn primitives in src/components/ui. Preserve the Himmah theme and accessible labels. All 62 registry components are installed; the legacy React Hook Form wrapper is compatibility source only. Application forms use TanStack Form.
- Search toolbars keep icons and controls vertically centered with input margins reset. On phones, give search its own full-width row and put compact checkbox filters below; translated filter labels must not squeeze the input. Bulk relationship pickers retain bounded selections across search/pages and show existing relationships checked, labelled and disabled.
- Growing server-backed lists consistently use cursor pagination and TanStack Query useInfiniteQuery. Bound pages on the server (25 default, 50 maximum), scope keys/cursors by user/organization/filters, use stable created_at+ID ordering, cancel stale fetches, and use the shared InfiniteFooter sentinel plus accessible Load more/retry/end states. Retain loaded records after next-page errors. Never fetch all records for lists or pickers. Fixed enum options and unrouted legacy fixtures are exempt.
- Prioritize phones: management areas have their own bookmarkable routes and an announced active page. Use a compact fixed organization/profile header, fixed bottom navigation on phones and fixed top navigation on wider screens, with reserved content space and safe-area padding. Keep daily organizer navigation to Activities, People, Rewards and Manage. Members and Groups use real-route tabs under People. Manage groups reports, team/staff/invitations/volunteer access, and organization details. Keep language, installation and sign-out in the personal profile (header shortcut); never turn it into a catch-all for organization workflows. Participant navigation is progress/challenges/rewards/coupons, with Profile in the header; volunteers see Activities and People. No empty Workspace/Home tab. Organization switching uses the same bounded infinite-query pattern as other growing lists. Forms use at least 16px inputs, 44px touch targets, clear focus outlines and centered, keyboard-aware, scrollable dialogs through the shared visible-viewport helper. Keep focused fields and submit/cancel actions reachable; preserve zoom and dirty-form confirmations.
- Each page has at most one back control, pointing to its immediate parent route; nested detail components must not add a second back control. Keep it left-aligned and avoid extra navigation gaps.
- Entity detail views, including group member lists, must use real bookmarkable routes that reload independently. Fetch the entity metadata by its ID with organization/role authorization; never depend on a previously selected in-memory record to render a page. Keep transient dialogs and form edits in local state.
- Use TanStack Router for route navigation and its blockers for unsaved changes. Use TanStack Query for remote reads/mutations; keys include user and organization where relevant. Clear private query/mutation caches on sign-out. Keep server authorization independent of client caches.
- Page/section loading uses shape-matched Skeleton components. Never use a spinner as the whole page loading UI. Keep loading, empty, error and unauthorized states distinct.
- Pending interactions (submit, save, sign-in/out, resend, retry, etc.) use the shared ActionButton/Spinner with disabled duplicate submission and aria-busy. Do not add artificial delays to synchronous local demo actions.
- Destructive actions always require the shared shadcn AlertDialog confirmation before mutation: sign-out, delete/remove, reset, cancel registration, discard unsaved changes, replace password, and future destructive operations. Explain impact, provide Cancel, and give the confirm button a specific action label. Do not use window.confirm for app flows. Browser-native beforeunload prompts are the unavoidable fallback when closing/reloading a dirty page.
- Shared primitives live in src/components/shared. Use their pending/focus/cancel behavior rather than copying another modal or spinner implementation. Test confirm versus cancel and retry behavior for material mutations.

## Localization and live UI

Keep the stack similar to Kermes Pay without modifying that project or sharing its credentials, databases or locale cookie. All shipped user-facing copy, errors, confirmations, loading labels and metadata use Paraglide messages from messages/en.json, nl.json and tr.json. Use request-scoped Paraglide middleware for SSR and the independent himmah_locale cookie. Language changes preserve unfinished forms. Do not hard-code new English UI copy. The deployed app exposes working features only; do not add sample data, mock controls or roadmap promotions. Button-as-link text must retain shadcn token colors; avoid global link inheritance overriding layered utilities. Run the production CSS contrast audit after building.

## PWA and authentication maintenance

The app is an installable PWA for iOS/Android. Manifest start_url is /hub (/app redirects there for older installations), with stable id /. The smart entry uses a single bounded membership page: verified single-organization staff go to Activities and participants go to My progress; multiple/partial organization pages go to the chooser, empty memberships to setup, and signed-out/unverified users to sign-in/verification. Do not fetch all organizations at launch or store private account/org data on the device. Keep Himmah icons/manifest/splash assets isolated from other projects. `npm run pwa:assets` regenerates assets and localized offline text; build runs it automatically. Service worker may cache only public hashed assets/icons and a static offline notice. Never cache authenticated HTML, auth/API responses or queue account mutations offline. Keep iOS startup metadata, maskable Android icons and safe-area layouts.

Cloudflare native fetch must remain bound to its global receiver. Never store a bare globalThis.fetch reference on a dependency object and invoke it as a method; use an arrow wrapper. Run the real Worker runtime regression (`npm run test:worker`) for auth/proxy changes, because Node/mock fetch does not catch receiver errors.

The managed Neon client throws normalized AuthApiError exceptions on non-2xx responses (snake_case codes), in addition to returning Better Auth error unions in some cases. Handle both via authFailure/authError. Preserve form values, give specific localized messages, and keep successful signup in verification if code delivery fails. Same-origin auth proxy follows the installed SDK middleware-header contract after CSRF validation. Do not claim a user's exact live failure is reproduced without evidence.

## Youth experience

Read docs/SAFEGUARDING.md before implementing accounts or engagement features. Private worship is not a public metric of religious worth. No paid advantages, betting, private messaging, real youth photos, or public attendance breakdown in the initial product. Religious content is authored/reviewed by the mosque; do not invent authoritative religious rulings.

## Workflow and validation

Carry authorized work through implementation and relevant verification without routine confirmation questions. Ask only for consequential missing decisions or external access that cannot be resolved. Do not deploy, buy extra services, or send messages to third parties without applicable authorization.

Use rg for discovery. Keep changes focused. Run npm run check and meaningful tests for changed game rules, authorization, persistence, and retries once implemented. Do not add empty tests or claim nonexistent coverage. Report what changed, evidence of verification, and material blockers.

Before committing, inspect git diff --check and git status. Never commit .env files, credentials, real children's records, database dumps, or local provisioning responses. Keep docs/INFRASTRUCTURE.md and docs/DECISIONS.md accurate.
