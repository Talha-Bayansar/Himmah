# Infrastructure status

Verified 17 October 2026. Resource identifiers only; never commit credentials.

## Local repository

- Name: Himmah Futsal; slug: himmah-futsal.
- Path: /workspace/himmah-futsal; independent Git repository, branch main.
- Remote: https://github.com/Talha-Bayansar/Himmah.git (private repository created by owner).
- The owner supplied this remote on 18 October 2026. Git access verified; the repository was empty before connecting. Local origin now points here.
- Initial publication uses Git over github.com. API-based repository creation was blocked previously by api.github.com returning Forbidden; this does not prevent the Git transport.

## Neon — provisioned and verified

- Project: himmah-futsal.
- Project ID: blue-glade-25303766.
- Console: https://console.neon.tech/app/projects/blue-glade-25303766
- Region: aws-eu-central-1 (Frankfurt), PostgreSQL 17.
- Database: himmah_futsal; owner role: himmah_owner.
- Main branch: br-little-king-b94zh3u1; reserved for eventual production, currently empty and not protected.
- Development branch: br-wandering-truth-b9rcp1wm; ready, synthetic data only.
- Read-only SQL against development confirmed database name, role, and PostgreSQL version.
- Dedicated credentials are saved in ignored .env.local (0600). HIMMAH_DATABASE_URL is pooled; HIMMAH_DATABASE_URL_UNPOOLED is direct. Shared workspace variables were not modified.
- Drizzle organization/membership schema is now applied to development and onboarding (see below). No real youth records.
- Account compute defaults retained. Explicit suspend-time configuration was rejected, so do not assume an idle suspension interval or promise a free tier. No plan upgrade or paid add-on was requested.
- Neon CLI 8.8.0 installed but has no authenticated profile. Connected Neon tools performed provisioning; no browser login launched.

## Other services

Cloudflare static hosting is now provisioned (see deployment below). Managed Neon Auth is now enabled for organizer onboarding. No file storage, scheduler, analytics, AI provider, payment service, or custom domain provisioned. Add these only when needed. Stripe CLI is unavailable and https://stripe.directory is denied by network policy, so that provisioning route could not be used. Dedicated Neon provisioning succeeded through the existing connection.

## Isolation

Kermes Pay files and settings were not changed. No inherited database, auth or deployment binding is assigned to Himmah Futsal. Reserved app port: 3101. Database and branches belong to this project only.

## Local Hub prototype

Next.js/React application added on reserved port 3101. Uses fictional browser-memory state only; does not read project or inherited database credentials. Initially local-only; now published through a separate Cloudflare Worker below. The demo does not use application tables; the organizer portal uses the schema below.

## Cloudflare phone-testing deployment

- URL: https://himmah-hub.talha-bayansar.workers.dev
- Worker: himmah-hub, separate from Kermes Pay.
- Version: b821afe3-e7c9-4aba-8564-76b70cad90e8.
- Published at the owner's request for testing on a phone.
- Static Next.js export (`out/`) served by Cloudflare Workers assets; no runtime secrets, database bindings or API server deployed.
- Public sample-data prototype only. No authentication; fictional data resets on refresh and is not shared between phones.
- Re-deploy with `npm run deploy`; use the configured Cloudflare account identity, never copy secrets into wrangler.jsonc.
- Future authenticated/server features need a deliberate deployment change; static hosting cannot provide them.

Cloudflare confirmed successful upload and active deployment. Direct page verification from this workspace is blocked by the outbound proxy (403 for the workers.dev hostname); phone/browser rendering has not been verified here.

## Persistent organizer onboarding

- Dedicated branch: onboarding (`br-cool-art-b9jm6gkq`), based on main; reserved for early-access organizer accounts/workspaces, not synthetic seeding. Main remains unchanged.
- Neon managed Better Auth enabled; trusted origin is the existing Cloudflare app URL. Uses managed email-code verification and recovery. Shared email delivery is for early access; production SMTP setup is still needed.
- Initial Drizzle migration applied first to development, then onboarding, with standard migration journal records. Tables: hub_organizations and hub_memberships.
- Worker now has a real `/api/*` handler while serving static exported UI. `HIMMAH_DATABASE_URL` is encrypted Worker secret storage and targets onboarding; the development `.env.local` was not overwritten. No Kermes Pay credentials were used.
- Non-secret vars: HIMMAH_AUTH_URL and HIMMAH_APP_ORIGIN. Native ONBOARDING_LIMITER binding throttles signup/auth IPs and workspace creation by user.
- Portal URL: https://himmah-hub.talha-bayansar.workers.dev/start/
- Org creation/retry and membership-filter SQL tested against development with synthetic organizers: one workspace, one owner membership, zero rows visible to a different user. Onboarding was not seeded with fictional youth or test organizations.
- Browser signup, verification-email delivery and session restoration remain unverified from this workspace due to its network restrictions.

Latest organizer portal deployment: `042d9883-2720-4bdf-be59-9fccf1460383` (Cloudflare confirmed active). The original static-only deployment record above is historical.

## TanStack migration

Next.js/static export is superseded by TanStack Start SSR on the same himmah-hub Worker and URL. Build output is dist/client plus dist/server; deployment uses the generated dist/server/wrangler.json. Existing encrypted database secret, managed Better Auth service, trusted origin, rate limiter and organization rows are retained. There is no database or identity migration. Local Vite/Cloudflare may materialize ignored .dev.vars from the project-local development .env.local; these files are never public client assets or committed. Local mutations still need a deliberately configured matching auth/database branch and allowed local origin.

TanStack migration validation: 19 domain/API tests and 8 component interaction tests pass. Production Workerd preview renders both demo and organizer pages, serves built assets, returns 401 for anonymous account requests, 404 for disabled admin endpoints and local environment files. Managed auth is lazily imported in browser interactions to avoid SDK module-scope crypto initialization during Cloudflare SSR.

Latest TanStack/shadcn deployment: `47f12b0d-7340-4e45-8b84-fd40654d603e`, confirmed active at 100% traffic. Encrypted database binding and auth/origin/rate-limit bindings are retained. Hosted browser/email verification remains unavailable from this workspace; local production Workerd and component tests are recorded above.

## Public landing page and UI refinement

Public introduction now lives at `/`, sample Hub at `/demo`, and organizer onboarding remains `/start`. Landing CTAs use TanStack Router; no database, identity or tenant-permission changes. Refined responsive shadcn control sizing and existing workflow copy.

Validation: 19 domain/API tests and 10 component interaction tests pass, including landing-to-onboarding and landing-to-demo navigation. Type checks, documentation links and production build pass. Local production Workerd serves all three routes and their built assets; anonymous account requests remain 401, disabled auth-admin paths and environment files remain 404. A real browser/phone visual check is still pending because browser tooling is unavailable here.

Latest landing/UI deployment: `0b34d416-da7b-4d53-897c-5da94e15a0c8`. Same dedicated Cloudflare Worker; organizer database secret and managed-auth/origin/rate-limit bindings retained.

## Live-only deployment and localization

The previous public-demo decision is superseded: `/` now introduces only working organizer account/workspace features; `/start` handles registration, verification, sign-in/recovery and saved workspace setup/list/detail. `/demo` and `/demo/` resolve to 404. Internal Hub fixtures remain in source/tests but no demo module or fictional activity content ships in production client JavaScript. No database schema, identity or existing organizer/workspace changes.

Added Paraglide JS 2 with English, Dutch and Turkish, request-scoped SSR middleware and the independent himmah_locale cookie (SameSite=Lax, secure on HTTPS). Language switching preserves form values and updates HTML language/metadata. The message-format compiler plugin is an npm dependency rather than a network CDN fetch. Generated translation/runtime files are ignored and compiled in Vite/type checks/tests. Stack remains aligned with Kermes Pay; that project was inspected read-only and not changed.

Verification: strict types/docs checks, 23 domain/API/localization tests and 13 component interaction tests pass. Catalog completeness, concurrent SSR locale isolation, invalid-locale fallback, localized confirmations/errors, preserved signup values and workspace details are covered. Production Workerd serves translated HTML/metadata and assets in all three languages, varies HTML by Cookie, rejects language-only anonymous sessions with 401 and returns 404 for removed demos/disabled auth-admin paths/environment files. Production CSS button audit reproduces the original global-anchor override at 1.02:1; repaired variants range from 5.87:1 to 11.69:1. CI runs this audit after building. These are component/CSS/HTTP checks: real browser layout, hosted signup and email delivery remain unverified because browser tooling/host access are unavailable here.

Latest live-only/localized Worker version: `f634cc68-9f30-4f5a-a32d-1ff85e27d878`. Organizer database secret, managed-auth origin and rate limiter retained.

## Signup integration repair, broader audience and PWA

Owner reported an initial-submit signup failure. Neon configuration confirms email/password signup enabled and the app origin trusted. Inspection plus real-client tests found the custom proxy missing the installed SDK server middleware marker/client metadata, and UI code assuming returned errors where the managed wrapper throws normalized AuthApiError exceptions. Corrected both integration paths; added stable rate-limit responses, password guidance and preservation of successful signup if verification-code delivery fails. Exact live provider rejection from the owner's attempt remains unknown; no real signup or email delivery was replayed. Existing users, database schema and secrets remain untouched.

Public copy is age-neutral in English/Dutch/Turkish and welcomes community organizations beyond the initial youth pilot. Added iOS/Android standalone PWA manifests, opaque app/maskable/touch icons, 44 portrait/landscape iOS startup screens, optional translated install controls, safe-area styling and production service-worker registration. Public static assets and an offline notice are the only caches; API/auth requests, account records and authenticated HTML are never cached. The offline notice uses canonical `/offline` because Cloudflare redirects `/offline.html`; caching the canonical response avoids returning a redirected response to offline navigation.

Verification: strict types/docs and 45 tests pass (27 domain/API/localization/PWA plus 18 component/client interactions). Tests cover the real Neon client against the actual proxy with a fake upstream, normalized thrown rate-limit/account-exists errors, successful signup with failed code delivery, native install prompts, translations, icon/startup dimensions and cache privacy. Production build/contrast audit pass. Local Workerd serves all localized manifests, service worker, icons and 44 startup images with correct types; canonical offline URL is 200 without redirect. Removed demo remains 404, anonymous account 401, environment files 404. App icon was visually inspected. Actual hosted signup/email and physical-device installation/splash behavior remain unverified because direct-host/browser/device access is unavailable here.

Latest Worker version: `17bae902-0555-4d0c-881c-4f1e4f451128`, confirmed active at 100% traffic. Existing database secret and managed-auth/origin/rate-limit bindings retained. See PWA.md for installation and regeneration.

## Confirmed Cloudflare-native fetch receiver fix

The subsequent signup screenshot prompted a real Workerd reproduction. Root cause: the API default dependencies stored the native global fetch function directly, then invoked it as a method on a different object. Cloudflare threw TypeError “Illegal invocation” before any auth-service request; the existing catch returned the screenshot’s generic 503. Prior proxy-header/error-message changes did not correct this runtime cause.

Replaced the native function reference with an arrow forwarding to globalThis.fetch, preserving the required receiver. No auth-provider migration, account recreation, database changes, new logging of identities or Kermes Pay modifications. The production Vite bundle was inspected and retains the corrected wrapper.

Added a real Workerd suite using the actual API source/default dependencies and a second local Worker as the auth fixture. The old source variant reproduces 503; the corrected source returns signup 201, sends verification requests, normalizes cookies, restores authenticated account reads and rejects cross-origin POSTs. No real auth accounts are created, emails sent or screenshot details used in fixtures. This now runs in npm test/CI through test:worker.

Validation: strict types/documentation, 27 domain/API/PWA/localization tests, 2 actual Worker-runtime integration tests and 18 SDK/component tests pass (47 total), alongside production build and contrast audit. Hosted email delivery and real browser signup remain unverified due to restricted host/browser access, but the previously untested native-runtime failure is reproduced and fixed.

Latest Worker: `d114565a-d28c-450b-aa2a-90fb775116f5`, confirmed active at 100% traffic; existing database/auth/rate-limit bindings retained.

## Persistent members/groups and infinite fetching

Added private participant nickname records, multiple group assignments, rename/archive/restore, staff access management and verified-email-bound shareable invitations. Owners/admins administer the directory; volunteers have a saved membership without directory administration. Participant entries do not create login accounts or replace guardian enrollment policy. Invitation preview/acceptance uses POST bodies and the link’s fragment; only token digests persist. No invitation email is sent automatically.

All growing live lists now use scoped keyset pages and useInfiniteQuery: organizations, members, groups, group members, staff, invitations and the group picker. Default 25/max 50 records, limit+1 lookahead, stable timestamp/ID ordering, Unicode-safe account/organization/filter-bound cursors, cancellation and shared infinite-scroll/manual loading/retry/end controls. Loaded rows remain visible after next-page errors. SQL queries authorize every page against real membership; cursors carry no permissions.

Generated Drizzle migration 0001_quiet_miracleman applied as one transaction with standard journal hash/timestamp first to development, then onboarding. Adds five scoped tables, composite group/person foreign keys, page indexes and optional staff display-name snapshots. Main unchanged. Post-migration onboarding checks showed zero new people, groups, invitations and audit records; no synthetic data or existing-account changes. Local PGlite tests execute the actual migrations and parameterized store SQL using in-memory synthetic fixtures.

Validation: 61 tests pass (37 domain/API/Postgres/localization/PWA, 2 Workerd and 22 component/client), strict types/docs, production build and contrast audit. Coverage includes pagination ties and Unicode, SQL tenant/role isolation, idempotent creates/audits/assignments, stale versions, archive/restore, consent requirement, invitation preview/expiry/revocation/acceptance/replay, owner protection and infinite-page retry/confirmation cancellation. Local production HTTP serves /start and /join with privacy metadata/assets, rejects anonymous directory requests with 401 and keeps demo/environment paths 404. Live multi-account/browser review remains unavailable from this workspace.

Latest Worker: `073a6429-666f-4434-9af0-3a1925888dfb`, confirmed active at 100% traffic. Existing database secret/auth/origin bindings retained. New DIRECTORY_LIMITER namespace 693875421 allows 60 directory mutations per minute/user; ONBOARDING_LIMITER remains 10 auth attempts per minute/IP and existing organization-creation limits. PWA privacy and native fetch-receiver fix are preserved. See MEMBERS_AND_GROUPS.md.

## Dedicated mobile management pages and keyboard-aware forms

Workspace selection/setup stays at /start. Saved organizations open /workspace/:organizationId/overview; members, groups, staff and invitations have separate section URLs. The compact icon/text navigation uses real Router links, active-page semantics, horizontal scrolling and heading focus. Organization details stay on overview; management pages retain the organization name. Direct navigation, reload and browser Back work without fetching all organization memberships. Existing directory pagination/cursors, scopes, API authorization and archived history remain unchanged.

Shared shadcn/Radix dialogs and confirmations follow visualViewport height/offset when a keyboard resizes or pans the visible area. Narrow-screen dialogs align near the visible top and scroll, with sticky form actions, 16px inputs, 48px fields and larger buttons/checkboxes. Focus indicators and input scrolling preserve keyboard accessibility and browser zoom. Group forms use group-specific help. Setup marks a successful save before navigation so persisted details do not prompt for discard.

Validation: 64 automated tests pass (37 domain/API/Postgres/localization/PWA, 2 Workerd, 25 component/client), strict TypeScript/docs checks, production build and contrast audit (minimum button ratio 5.87:1). Added coverage for dedicated route/history navigation, heading/input focus, dirty-form cancel/confirm, successful setup routing and visual-viewport resize/cleanup. Local Chromium, using synthetic intercepted API responses only, verified real rendered 390px mobile layouts, no horizontal page overflow, 16px fields, focused inputs and Save/Cancel visible in a reduced 360px viewport, discard confirmation, direct links, reload and Back. Screenshots were inspected; this simulation does not prove actual iOS/Android keyboard behavior or hosted multi-account flows.

Latest Worker: cfc45ab9-8394-4a22-b1e7-927e07f2d249. No database/schema/auth migration or new services. Existing database secret, auth/origin bindings, rate limits, PWA privacy and native fetch receiver fix retained. No real participant records were created during testing.

## Minimal header, fixed navigation and organization switcher

The authenticated shell now reserves space for a compact fixed header containing only the organization switcher and a profile shortcut. Members, Groups and Settings form fixed bottom navigation on phones and fixed top navigation below the header on wider screens. Loaded content, long organization names and translated labels do not change the chrome’s height/position; page headings remain focus targets for route announcements. Profile/language/install/sign-out controls and organization details live in Settings. Staff access and invitations remain dedicated pages linked from Settings. /settings supports account preferences before choosing an organization; anonymous auth/onboarding retains language selection. The previous /overview URL redirects to /settings; owners/admins now open Members and volunteers Settings.

The organization switcher reuses the identity-scoped useInfiniteQuery, bounded cursor pages and shared InfiniteFooter states. It identifies the current organization, restores focus on close, supports managing organizations at /start, and preserves the current section when the new membership permits it. Private directory queries remain scoped to identity/organization/filters; sign-out still requires confirmation and cancels/removes private caches. No schema, database, identity or service changes.

Validation: 65 automated tests pass (37 domain/API/Postgres/localization/PWA, 2 Workerd, 26 component/client), strict types, documentation links, production build and CSS contrast audit. New/updated interaction checks cover settings-only account controls, translated confirmations, default routes, paginated organization switching, replacement of scoped directory rows, focus restoration, dirty navigation and saved setup. Chromium checks using synthetic local intercepted APIs verify fixed header/navigation geometry while scrolling, changing sections, changing all three locales and switching organizations; no horizontal overflow at 320/390/1280px, reduced keyboard-height form visibility, pagination and legacy overview redirect. Screenshots inspected. This does not verify physical iOS/Android keyboard behavior or hosted auth/email flows.

Latest Worker: e0766432-6693-4846-b0a2-e5f5b9dbe51b, confirmed active at 100% traffic. Dedicated database secret, auth/origin/rate-limit bindings, PWA privacy and native fetch receiver fix retained. No real participant records created during testing.

## Centered mobile dialogs with overflow scrolling

Owner clarified that modals should remain centered rather than top-aligned; scroll or a bottom sheet was suggested when inputs are obscured. Retained shared Radix dialogs and removed the narrow-screen top/translation override. Dialogs and confirmations now center within the visual viewport, including keyboard height changes, while retaining bounded height, overflow scrolling, sticky form actions and focus trapping/restoration. Focus visibility checks also consider the dialog bounds and sticky action area.

Validation: npm run check passes all 65 tests, strict types and documentation links; production build and contrast audit pass. Extended the visual-viewport test to cover an input inside the screen but clipped by its dialog. Local Chromium with synthetic intercepted APIs checked centering at 390x844, 390x420, 390x280 and 1280x800, overflow in the shortest viewport, and focused input/Save visibility. Screenshots inspected. These viewport simulations do not verify a physical phone keyboard. No database/auth/PWA cache changes or real participant data used.

Latest Worker: 915e96d5-52d6-4e8b-91cb-6fccf004e724, confirmed active at 100% traffic; same dedicated app and infrastructure.

## Compact switcher and persistent group member routes

Group member views now use `/workspace/:organizationId/groups/:groupId`, independent of previously selected component state. The page reads current group metadata from a new bounded `GET /api/organizations/:id/groups/:groupId`, guarded by membership/role checks in both API and SQL, and keeps the existing group-filtered infinite member query. Missing, archived and inaccessible groups are unavailable rather than shown as an empty roster. Real group-list links, Back, direct entry and reload are supported. Group pages explain assigning existing members from Members instead of offering a create action that would leave them unassigned. Group metadata queries are scoped by user/organization/group and receive cancellation signals. No schema, database migration or auth change.

The organization switcher now sizes its trigger to the label/icons, with the chevron adjacent to the text; spare header width remains before the profile shortcut. Long-name truncation and fixed chrome are retained.

Validation: all 68 tests pass (38 domain/API/Postgres/localization/PWA, 2 Workerd, 28 component/client), strict types/docs, production build and contrast audit. Added real SQL/API coverage for group metadata tenant/role isolation and archived/unavailable states, plus UI tests for actual group links, filtered reads, direct entry, Back and errors. Chromium with synthetic local intercepted APIs checked compact label/chevron spacing at 320/390/1280px, group URLs, direct entry, reload with a changed server-supplied group name, filtered member fetching and Back. Screenshots inspected. Hosted multi-account/physical-device checks remain outside these synthetic tests; no real participant data was created.

Latest Worker: 764304e4-c144-4db5-8b24-f27166f8a21d, confirmed active at 100% traffic. Existing dedicated infrastructure, secrets, rate limits, PWA privacy and native fetch receiver fix retained.

## Membership-aware group picker and mobile action icons

Added GET /api/organizations/:org/people/:person/group-options. It checks active person availability and owner/admin membership, then returns bounded active-group cursor pages with an assigned boolean from organization/person-scoped memberships. The SQL also checks role/tenant/active-person eligibility. Cursor scopes and Query keys include the member; no fetch-all membership request or schema change. Existing assignments show a checkmark and translated status, remain readable and disabled, and never start an add mutation. Reopening refreshes membership state; options stay disabled during background refresh and initial refresh errors offer retry rather than stale choices. Only the selected new group spins during a write, competing choices stay disabled, and existing idempotent assignment/audit constraints still guard concurrent changes.

Member/group/staff/invitation actions now use Lucide icons with localized labels and touch-sized controls; rename/archive have outlined affordances. Save/cancel/copy/close also have icons. Pending row indicators are scoped to the record and operation. The owner’s general icon/mobile-app preference is recorded in AGENTS.md and project context.

Validation: npm run check passes all 70 tests (39 domain/API/Postgres/localization/PWA, 2 Workerd, 29 component/client), strict types/docs, production build and contrast audit. New real-SQL/API checks cover assigned flags, bounded pages, member-bound cursors, tenant/role isolation and archived/missing records. UI checks cover disabled existing memberships, zero duplicate writes, pagination and selected-only spinners. Local Chromium with synthetic intercepted APIs additionally verifies refreshed membership after reopening, different-member isolation and icon actions; screenshots inspected. No real member data, schema migration, auth changes or automated messages.

Latest Worker: ef381b11-96ad-423e-8acb-dce15fe2e101, confirmed active at 100% traffic. Existing dedicated infrastructure, secrets, rate limits, PWA privacy and native fetch receiver fix retained.

## Disabled current-organization option

The organization switcher now applies the same non-selectable-current-state convention as the group picker. Its current row shows a visible translated Current organization label and checkmark, stays fully readable and is disabled. The handler also guards the current ID before closing or navigating. Other paginated organization options and focus restoration are unchanged. The existing switcher interaction test now checks that clicking the current row cannot navigate or close the dialog.

Validation: npm run check passes all 70 tests, including the expanded current-option/cancel/focus/switching flow; strict types/docs, production build and contrast audit pass. No data/auth/schema changes.

Latest Worker: 9571a522-0d97-4199-8af5-b135720c6794, confirmed active at 100% traffic; existing dedicated infrastructure and privacy/auth safeguards retained.

## Compact item action menus and smart PWA start

Rows now use the shared shadcn/Radix ItemActions menu. Active groups keep View members as the one visible primary action; secondary member/group, staff-role/access and invitation actions move into per-item ellipsis menus with icons, localized labels and 44px targets. Items without a useful primary action use only the menu. Current staff-role choices are disabled, existing permission guards and destructive confirmations are retained, and pending indicators stay scoped to the operation/record. Menu modal actions wait for menu focus/scroll locks to release. Shared controlled dialogs/confirmations restore the opening element’s focus even without a Radix Trigger, preserving nested discard behavior and route changes.

All localized PWA manifests now use /app as start_url while retaining id /. The app entry checks session and one bounded membership page: verified single-organization users open Members (Settings for volunteers), multiple/partial organization pages open the chooser, no memberships open setup, and signed-out/unverified users enter sign-in/verification. Launch navigation replaces the entry history item. No fetch-all, stored private device preferences, database/schema/auth changes or changed PWA cache policy. Installed manifest adoption remains browser/OS-managed.

Validation: npm run check passes all 77 tests (39 domain/API/Postgres/localization/PWA, 2 Workerd, 36 component/client), strict types/docs, production build and contrast audit. Tests cover menu visibility, confirmation cancel/confirm, rename and dialog focus restoration, existing membership picker behavior through menus, six launch cases including partial pages, and all localized manifest launch URLs/stable IDs. Chromium with synthetic local intercepted APIs checks compact 320/390px rows, primary group links, menu-to-form/picker/confirmation flows, cancel vs archive, staff-role menu changes, released pointer locks, owner/volunteer/chooser/sign-in launches and manifests. Screenshots inspected, including completed menu fade-in. No real member/account data or external messages used.

Latest Worker: 3586b667-24b0-4111-abcf-4cff7fa0758b, confirmed active at 100% traffic. Existing dedicated infrastructure, secrets, rate limits, PWA privacy and native fetch receiver fix retained.

## Native role select text clipping

Removed the legacy select box padding override from the shared shadcn NativeSelect. Its fixed 36px height previously competed with 22px of vertical padding, leaving too little room for the text. Shared selects now use a 48px default height (44px small variant), zero vertical padding, reserved chevron space and a 16px font utility. Context-specific form font sizing remains in place. Staff role changes already use the item action menu; the invitation role selector and other shared selects receive the underlying fix.

Validation: all 77 tests, strict types/docs, production build and button contrast audit pass. Local Chromium with synthetic intercepted APIs verifies Volunteer and Administrator in the invitation form at 320/390/768px: 48px height, 16px text, sufficient content height for the text line, no horizontal overflow or browser errors. Focused phone screenshot inspected. No actual iOS/Android keyboard verification, private data changes, migration or auth changes.

Latest Worker: 6f052803-423e-4daa-a2e6-14f4ad1a1853, confirmed active at 100% traffic. Dedicated infrastructure, secrets and privacy/auth safeguards retained.

## Persistent one-off activities

Added Drizzle migration 0002_hesitant_thing, applied transactionally with its standard journal hash/timestamp first to development, then onboarding. Main remains unchanged. The new hub_activities table has organization ownership, unique creation keys, bounded scheduling/details, immutable timezone snapshots, optimistic versions, cancellation state and keyset indexes. Onboarding post-migration verification shows zero activities; no sample/member/account records were written during testing.

New authenticated activity list/detail/create/update/cancel endpoints retain same-origin CSRF checks, write rate limiting, no-store responses and server-derived membership authorization. SQL independently guards reads by organization membership and writes by owner/admin role, with audit writes in the same statement. Matching creation retries return the original record; conflicting edits are rejected. Verified volunteers can read activities but cannot manage them.

The Activities navigation entry opens bounded cursor pages with search and a cancelled filter. Real detail routes reload by ID without listing records. TanStack forms use centered scrollable mobile dialogs, 16px inputs, interaction spinners, dirty-form guards and explicit cancellation confirmation. English, Dutch and Turkish copy is included. Activity times are entered/displayed in the activity's saved organization timezone, with ambiguous/nonexistent DST wall times rejected. Cancelled records remain accessible and read-only. Recurrence, eligibility, registration, attendance and points remain later slices.

Validation: npm run check passes all 83 tests (41 domain/API/PostgreSQL/localization/PWA, 2 Workerd, 40 component/client), strict types and docs checks; production build and contrast audit pass. Real PostgreSQL-compatible PGlite tests execute migrations and parameterized store queries for tenant/role isolation, duplicate creation, keyset pages, version conflicts, cancellation and atomic audit. UI tests cover pagination failure/retry, confirmed versus cancelled mutations, preserved creation inputs/idempotency keys, discard confirmation and independent volunteer detail reads. Chromium with local synthetic intercepted APIs checks creation, short-viewport form scrolling, 320/390/768px layouts, detail URL reload, editing and cancellation. No actual mobile OS keyboard or real account mutations were used.

Latest Worker: 6eded9d4-4a4f-4a61-8ab7-cc2182f75e24, confirmed active at 100% traffic. Existing dedicated secrets, auth bindings, native fetch wrapper and PWA privacy safeguards retained. Browser checks also verified Dutch/Turkish activity headings and layouts after locale changes.

## Consistent activity description label spacing

Included shared Textarea controls in the directory form's 8px label-to-control spacing rule, matching Input and NativeSelect. Local production Chromium checks all five activity fields at 320/390px for equal 8px gaps and no horizontal overflow; production build and contrast audit pass. This is a CSS-only change with no data/auth/schema changes.

Latest Worker: eb6fd705-cfbf-4ee5-b122-407d2affe9e1, confirmed active at 100% traffic.

## Activity card layout refinement

Activity list and detail cards now use explicit 16px section spacing instead of inherited paragraph margins. The header aligns a calendar badge, wrapping title and existing action menu; detail pages keep their announced h1 inside the card, removing the previous empty header. Start/end dates and times are grouped in a subtle schedule panel with the timezone directly below; date/time lines remain deliberate across locales. Location and description use readable text, aligned icons and a separate description divider. List cards retain one full-width primary detail link. Very narrow cards stack the schedule columns; long titles/locations wrap without pushing actions outside the card. No forms, authorization, data or schema changes.

Validation: all 83 tests, final strict typecheck, production build, documentation and contrast checks pass. Local Chromium with synthetic APIs verifies consistent section gaps, long titles/locations, 320/390/768px layouts, English/Dutch/Turkish activity views, detail reload and unchanged create/edit/cancel interactions. List/detail screenshots inspected; no real organization data was mutated.

Latest Worker: 2c11861f-9038-45a5-aa3e-0609036acf7d, confirmed active at 100% traffic.

## Activity/session separation and group audiences

Drizzle migration 0003_odd_vanisher introduces hub_activity_sessions with an organization/activity composite foreign key, bounded audience group IDs, schedule index, optimistic versions and cancellation reason. Activities gain bounded default group IDs; legacy dates become nullable but are retained. The migration copies every legacy one-off occurrence into its first session with original details, timestamps and cancellation state. Applied first to development with the journal hash/timestamp. Main remains unchanged.

Activity creation now saves reusable metadata without scheduling. Owners/admins can choose everyone or up to 20 active same-organization groups through a cursor-paginated picker; selected archived groups remain removable. The cap bounds saved audience summaries, not the organization's group directory. Server SQL independently validates group ownership/active state. Session creation locks and checks the activity revision, snapshots metadata/audience and has an organization/activity-scoped idempotency key. Forms preserve the revision and audience they opened with, preventing an unnoticed background update from changing the new session audience.

Sessions have Upcoming/Past paginated lists and independent /workspace/:organizationId/activities/:activityId/sessions/:sessionId URLs. Upcoming includes ongoing sessions until they end; pagination uses starts_at+ID and binds cursors to the user, organization, activity and view. Detail routes resolve through the parent Outlet. Future time/location changes and cancellation reasons are audited; normal edits/cancellation are blocked once started. Existing sessions retain saved names/descriptions/locations/timezones/group identities after default changes. Archiving an activity blocks new sessions without cancelling existing ones. Group display names remain current; this does not snapshot the participant roster or implement youth logins/attendance.

Validation: npm run check passes all 87 tests (41 domain/API/PostgreSQL/localization/PWA, 2 Workerd, 44 component/client). The final targeted eight activity/session UI tests also pass, including keeping the original parent version when the cache changes while a form is open. Real PostgreSQL-compatible tests execute migrations and parameterized SQL for legacy preservation, tenant/group isolation, bounded keyset paging, matching/mismatching retries, parent revision conflicts, immutable saved audiences, archive behavior, started-history guards and audit deduplication. Group pagination buttons explicitly use type=button so Load more/retry cannot submit an enclosing form. No new service, auth change, offline mutation queue or private response caching.

Migration 0003 is now also applied transactionally to onboarding with its standard journal entry. Post-migration counts: one existing activity and one preserved session; a scoped comparison of original name/description/location/start/end/timezone/cancellation fields found zero preservation mismatches. No synthetic activity/group/member/account data was written to onboarding. Legacy dates remain retained; main remains untouched.

Final validation includes strict type checks, production build and contrast audit, plus a repeat Chromium flow using local synthetic intercepted APIs: activity creation with selected groups, scheduling in a short phone viewport, saved session name/audience after activity edits, direct session reload, cancellation reason with cancel/confirm, Upcoming/Past views, EN/NL/TR and 320/390/768px layouts. Screenshots inspected. Actual iOS/Android keyboard and real user mutations were not exercised. Dedicated auth bindings, native fetch wrapper, rate limits and PWA private-data safeguards are retained.

Latest Worker: 82bb753f-5f72-4ea1-99f5-07b631610e75, confirmed active at 100% traffic.

## One back control per activity/session page

The activity page now owns the single parent-navigation control, including loading/error states. Activity details link to the activity list; session details link to their activity. The nested Sessions component no longer renders its own back control, and its detail layout removes the extra session-section top margin. The owner’s general one-back-control preference is recorded in AGENTS.md. Regression checks assert exactly one parent link and its destination on both detail levels. No data/schema/auth changes.

Validation: all 87 tests, strict types/docs, production build and contrast audit pass. Chromium with synthetic local APIs verifies exactly one back link and its parent destination on both activity and session details, including session reload, mobile layout and existing activity/session interactions. Updated phone screenshot inspected: the session card follows a single left-aligned parent link with no duplicate navigation gap. No real user data was changed.

Latest Worker: 78ec1aa9-3e62-43f9-b375-1917bc5226eb, confirmed active at 100% traffic.

## Session attendance, bulk check-in and corrections

Added Drizzle migration 0004_curvy_susan_delgado, first applied transactionally to development with its standard journal hash/timestamp. It adds scoped attendance, request receipt and append-only change tables, composite session/person/request foreign keys, state/version/reason constraints and a history-page index. The invoker function hub_save_attendance is included as versioned migration SQL; its readable definition is also kept in db/migrations/functions/attendance.sql. Main remains unchanged.

New authenticated attendance roster/history/save endpoints sit under each session and retain same-origin CSRF checks, existing write rate limiting and no-store responses. Both API and SQL restrict attendance to owners/admins; verified volunteers cannot read or mutate these records until assignments exist. The saved session audience drives eligibility, while recorded people remain visible for corrections after archiving or leaving a group. Unmarked is never inferred as absent. Roster pages and history use bounded cursor pagination, stable timestamp/ID order and private user/org/activity/session/filter query keys.

One transaction locks staff membership, session, relevant people and group-membership rows, checks each expected attendance version and returns per-member saved/unchanged/conflict/ineligible/reason-required outcomes. Corrections require a reason; previous/new state, actor and version are audited. Identical request receipts replay the original result without repeating writes, even after subsequent corrections; mismatching actor/payload cannot reuse a key. UUIDs and member order are normalized before deduplication. New check-in opens at session start; cancelled sessions are read-only. No points, emails, youth logins, registration finalization or offline mutation queue are added.

The phone UI has a dedicated reloadable attendance route with one back link to the session, status totals/filter/search, 44px selection targets, selection capped at 50, individual/bulk forms, named partial-failure summaries and paginated private history dialogs. Unmarked records default to Present in the recording form. Saved-state changes require confirmation. Unconfirmed writes freeze the submitted payload and retry the same key; leaving warns that the write may have reached the server and refreshes the roster. The UI makes no optimistic attendance changes. English, Dutch and Turkish copy is complete; skeleton/pending/focus/dirty-form patterns and service-worker privacy rules are retained.

Validation: npm run check passes all 95 tests (43 domain/API/PostgreSQL/localization/PWA, 2 Workerd, 50 component/client). Final targeted attendance SQL/API tests (2) and component tests (6) also pass after the form/retry and UUID-normalization refinements. PostgreSQL-compatible PGlite tests execute the actual migrations/function/parameterized reads for eligibility and tenant isolation, bounded pages, canonical payload validation, partial saves, lost-response replay, stale revisions, required reasons, unmark corrections, retained archived/out-of-audience history, no duplicate audits, started/cancelled guards and role restrictions. Actual multi-connection lock contention was not exercised.

Local production Chromium with synthetic intercepted APIs verifies route entry/reload/single back link, pagination error/retry, same-key lost-response retry, confirmation cancel/confirm, private audit history, named partial bulk failures, future-session write guards, volunteer restriction, EN/NL/TR and 320/390/768px layouts. Phone and short-viewport form screenshots were inspected. No real participant/account mutations or actual mobile OS keyboard checks were used. Production build, strict types, docs and contrast checks pass.

Migration 0004 is also applied transactionally to onboarding with its journal entry. Post-migration verification retained two existing activities and two sessions, with zero attendance records, request receipts or change rows; the attendance function exists. No synthetic records were added to onboarding, and main remains untouched. Existing dedicated database/auth bindings, native fetch wrapper, rate limits and private-cache safeguards are retained.

Latest Worker: e87d4027-bac5-4b92-b7a7-bba2a17c75b6, confirmed active at 100% traffic.


## Search layout and bulk group membership checkpoint (2026-10-18)

Deployed Worker `2a17650a-a7c6-4b26-9b94-06c421952cc3` to Himmah Hub; Cloudflare deployments API verified the version receives 100% of traffic. Shared search/filter controls are vertically centered and mobile search uses a full-width row. Group detail pages offer a paginated bulk member picker with existing memberships disabled and an atomic, audited batch endpoint (1–50 people). No migration or new infrastructure was required; neither Kermes nor the reserved Neon main branch was changed.

Validation: `npm run check` passes all 97 tests (44 Node/domain/API/PostgreSQL, 2 real Worker runtime, 51 UI); production build and button contrast audit pass (minimum 5.87:1). Chromium checked Members, Groups and Activities in en/nl/tr at 320/390/768px for centered controls, adequate search width and no horizontal overflow; the bulk picker disabled an existing member and submitted one selected batch. UI tests cover selection retention across pages/search and failed-save retry; SQL/API tests cover authorization, tenant isolation, all-or-nothing eligibility and duplicate audit prevention. Browser tests used synthetic local API fixtures only; no live participant data was seeded or changed. Deployment activation is verified through Cloudflare's API; direct workers.dev requests remain unavailable from this environment.

## Manual points ledger checkpoint (2026-10-19)

Drizzle migration `0005_left_proudstar` adds the points ledger and immutable request receipts, scoped foreign keys, keyset indexes, the invoker `hub_save_points` function and UPDATE/DELETE protection on ledger entries. Readable SQL is in `db/migrations/functions/points.sql`. Applied transactionally first to development, then onboarding, with standard migration hash `9428f0334fffc352ad144131333bb0aa246894363ae1214e386ad66ab7ae6801` and journal timestamp `1792398464207`. Reserved main and Kermes remain untouched.

Onboarding post-migration verification retained two activities, two sessions and zero attendance records, with zero point entries/receipts and the points function present. No sample data or real-member award operations were sent to the live database during validation.

Deployed Worker `10239dcf-b156-4477-8ae4-226ec4a01e41`; Cloudflare deployments API confirms 100% activation. New owner/admin workflows include single/bulk awards from Members/group pages, real member detail URLs, private balances/paginated histories, optional activity/session references and reasoned append-only corrections. Existing dedicated bindings/auth proxy, rate limits, same-origin protection and private-cache boundaries remain in place. No new external service, payment integration or automated attendance-to-points rule was added.

Validation: `npm run check` passes all 103 tests (46 Node/domain/API/PostgreSQL, 2 actual Worker runtime, 55 UI), with additional targeted PostgreSQL checks of simultaneous receipt retries and session references passing after the full run. Production build and button contrast audit pass (minimum 5.87:1). Chromium checked real member route direct entry/reload, exactly one Back control, en/nl/tr layouts at 320/390/768px, 16px phone inputs, linked activity/session awards, correction cancel/confirm with retained originals, and group-filtered bulk selection across search with explicit partial results. Browser APIs were synthetic and local. Direct workers.dev access remains blocked from the execution environment; deployment activation was verified through Cloudflare's API.

See [Manual points](MANUAL_POINTS.md) for policy defaults, concurrency/receipt behavior, staff-only reasons, future account-linking self-approval checks, and deferred configurable earning rules/engagement periods/game allocation.

## Engagement periods checkpoint (2026-10-19)

Drizzle migration `0006_brainy_luke_cage` adds organization-scoped engagement periods and immutable member/group snapshot tables, with the live-report helper, versioned create/edit/close function, constraints and history guards in `db/migrations/functions/periods.sql`. Applied transactionally first to development and then onboarding using migration hash `00d3f46e2efcf2ccc0ae1341210344cbaa4ae313d22cc56d4a20cccee4796faa` and journal timestamp `1792401641288`. Reserved main and Kermes remain untouched. Post-migration onboarding verification retained two activities, two sessions and two existing point entries, with zero periods/snapshot rows and the save function present. No source points/attendance/roster data or synthetic live records were written during validation.

Deployed Worker `2cc41d99-162c-4510-84f1-f7011dcc7ae0`; Cloudflare deployments API verifies 100% activation. Settings now links to private owner/admin period management. Dated member/group reports and group-filter URLs reload independently; confirmed closure freezes names, memberships and totals without altering source records. No new service, credential, billing integration or cache policy was introduced.

Validation: `npm run check` passes 108 tests (48 Node/domain/API/PostgreSQL, 2 actual Worker runtime, 58 UI), with additional targeted PostgreSQL checks of late corrections after closure and duplicate close audit prevention passing afterward. Build and production button contrast audit pass (minimum 5.87:1). Chromium checked Settings discovery, en/nl/tr at 320/390/768px, 16px phone date inputs, successful creation/navigation without a discard prompt, group report deep link/reload, single Back control, close cancel/confirm, frozen controls and closed-period filtering. Browser APIs were synthetic/local. Direct workers.dev access remains unavailable from the execution environment; deployment activation was verified through Cloudflare's API.

See [Engagement periods](ENGAGEMENT_PERIODS.md) for exact date boundaries, overlap/group membership policy, recorded-state attendance semantics and permanent closing behavior.

## Optional attendance earning checkpoint (2026-10-19)

Drizzle migration `0007_true_bloodstrike` adds activity/session attendance-point defaults, saved session rule revisions, source/revision metadata for ledger entries and the scoped `hub_attendance_awards` root link. It installs the shared preview/save operation, session-rule immutability trigger and manual-correction protection for attendance-source awards. Readable definitions are in `db/migrations/functions/attendance.sql` and `points.sql`; previous migration SQL files remain unchanged.

Applied transactionally first to development, then onboarding, with migration hash `b238682e5e2a8f6b8d8deda2f0cc3c9010b9dee0050f2b54cc79269b0abfb297` and journal timestamp `1792404455077`. Onboarding retained two activities, two sessions, zero attendance marks, two point entries and one period. Existing sessions have zero attendance-point rules, existing ledger entries remain manual, and there are zero attendance-award roots. The preview function exists. No historical awards/backfill, sample records or real check-in mutations were sent to live storage. Reserved main and Kermes remain untouched.

Deployed Worker `32ac5c6b-f01c-4a48-b7b0-f2d70da865f1`; Cloudflare deployments API verifies 100% activation. Owners/admins can opt an activity into fixed attendance awards for subsequently created sessions. Rule-enabled saves require a server preview and explicit confirmation; attendance and linked ledger grant/reversal/restoration share one transaction and receipt replay protection. Dedicated auth/database bindings, CSRF validation, rate limits and private-cache boundaries remain intact. No new external service or credential was provisioned.

Validation: `npm run check` passes all 113 tests (50 Node/domain/API/PostgreSQL, 2 real Worker runtime, 61 UI). Production build and button contrast audit pass (minimum 5.87:1). PostgreSQL tests cover session snapshots across default changes, preview with zero persisted writes, no-rule behavior, grant/reversal/restoration, concurrent/exact retries, partial/ineligible outcomes, stale versions, reason requirements, manual-correction rejection, source occurrence dates and an injected ledger failure that rolls back attendance/receipt changes. UI tests cover opt-in settings, preview versus confirmed save, exact uncertain retry and correction cancel/confirm. Chromium checked en/nl/tr at 320/390/768px, preserved saved-session amounts after default edits, preview cancellation without writes, confirmed grant and reversal, and managed-source point history links. Browser APIs were synthetic and local. Direct workers.dev requests remain unavailable from this environment; activation was verified through Cloudflare's API.

See [Attendance earning](ATTENDANCE_EARNING.md) for rule scope, confirmation, correction and future identity/aggregate-cap boundaries.

Checkbox spacing correction (2026-10-19): Worker `1da30f21-fe0d-4ef4-8ccc-408cff84d5f8` is verified active at 100%. The general block-label form selector now excludes `.directory-check`; the earning-rule checkbox keeps its flex layout with its text in a dedicated span. Chromium measured a 10px checkbox/text gap and centered wrapped text in en/nl/tr at 320/390/768px without overflow. Build and production contrast audit pass. No database or rule behavior changed.

## Scoped volunteer access checkpoint (2026-10-19)

Migration `0008_sticky_firedrake` adds scoped volunteer grants and immutable change history, permission helpers, automatic grant revocation on staff role/removal changes, and scoped attendance/manual-award transactions. Readable definitions are in `db/migrations/functions/access.sql`, `attendance.sql` and `points.sql`. Development migration succeeded with hash `138cbf0504d18f2ea0be6ac92013e792682cbc0eea61b437e8699fe4e459ab30` and journal timestamp `1792408733604`. See [Volunteer access](VOLUNTEER_ACCESS.md) for exact scope and audit rules.

Onboarding migration then succeeded transactionally with the same hash/timestamp. Verification retained two activities, three sessions, zero attendance marks, two point entries and one period, and created zero assignments. No synthetic records, historical backfill or live grant/check-in mutations were submitted; reserved main and Kermes remain untouched.

Validation covers 52 Node/database/domain/API checks, 2 real Worker runtime checks and 67 UI checks across suite and targeted reruns. Strict types, documentation links, production build and button contrast audit pass (minimum 5.87:1). Two existing UI cases exceeded their 5-second limit under concurrent load and passed in an isolated rerun. Additional focused PostgreSQL checks verify hostile mixed-scope bulk requests, independent attendance/manual capabilities, group versus activity visibility, point-history filtering, direct API denials and receipt replay after revocation. UI checks verify uncertain retries, reduction/revocation confirmation and hiding previously loaded session/history details after permission failures. Chromium with synthetic local APIs checked en/nl/tr at 320/390/768px, checkbox spacing, scoped bulk selection, hidden management navigation and revoked rosters. These checks do not verify physical phone keyboards or hosted email delivery.

Final Worker `ec44c130-72d7-4a28-b2d2-a0671c60dc1f` is verified active at 100% traffic through Cloudflare's deployments API. Dedicated secrets/auth/database bindings, private-cache boundaries, native fetch wrapper and CSRF protections remain unchanged. Final production Chromium checks pass without page errors. Direct workers.dev requests remain unavailable from this execution environment, so hosted activation was checked through Cloudflare's API. No new services or credentials were provisioned.

## Rewards checkpoint (2026-10-19)

Drizzle migration `0009_tough_the_phantom` adds organization-scoped rewards, immutable redemption provenance, and append-only reward/redemption audit records. Readable wallet and transactional save functions are in `db/migrations/functions/rewards.sql`. Development migration succeeded with hash `f194026e303cc8d056de70183f3b6f1b8ea5bf42844aef522cc3c373cd8fe5ee` and journal timestamp `1792410904343`. See [Rewards](REWARDS.md) for spending, stock, handout and cancellation policy. No new service or credential was provisioned.

The onboarding migration then succeeded transactionally with the same hash/timestamp. Read-only before/after verification retained 15 roster records, two activities, three sessions, zero attendance marks, two point entries, one engagement period and zero volunteer assignments. The new catalogue and redemption tables have zero rows. No historical points backfill, sample rewards, live reservations or handout mutations were submitted. Reserved main and Kermes remain untouched.

Validation: `npm run check` passed 129 tests (54 Node/domain/API/PostgreSQL, 2 real Worker runtime, 73 UI), followed by strict type/build checks after final layout/copy adjustments. PostgreSQL coverage includes last-item stock contention, shared-wallet spending across rewards, cancellation/refund of reservations, final handouts, negative availability after engagement corrections, price snapshots, stale versions, exact retries, role/tenant isolation, scoped pagination, immutable history and an injected audit failure rolling back the reservation. UI coverage includes uncertain request retries, dirty discard, cancellation/archive confirmations, archived discovery, negative wallet display and preserving pages on service failures while hiding them after permission loss. Browser APIs were synthetic/local; Chromium verified en/nl/tr at 320/390/768px, 16px form inputs, eligibility controls, real detail/history URLs and reload, one Back control, reservation/cancellation/handout flows and earned/spent/available balances. Production CSS contrast audit passes (minimum 5.87:1).

Worker `78fa68c2-b7f7-4467-965c-479a4a4cf137` is verified active at 100% traffic through Cloudflare's deployments API. Final layout checks include long reward titles with a compact 48px action menu beside the title; final production contrast and localization checks pass. Existing dedicated database/auth secrets, CSRF/rate limiting and PWA privacy boundaries remain in place. Direct workers.dev access remains blocked from this execution environment; hosted activation was verified through Cloudflare's API, and functional browser checks used intercepted synthetic APIs. No hosted organizer/member data was mutated for testing.

## Participant access checkpoint (2026-10-19)

Drizzle migration `0010_sturdy_red_skull` adds separate participant invitations, account links and immutable events, verified-email link acceptance, automatic archive disconnection, role-separation guards and historical identity checks for self-approval. Readable SQL is in `db/migrations/functions/participants.sql`; point/redemption overrides match their canonical function files. Development migration succeeded transactionally with hash `706fac0c56cff671fff580920952caf4a1f00e5abacc2a568a5fa72c1e4f2f9a` and journal timestamp `1792419564574`. Read-only verification confirmed the self-access helper and zero participant invitations/links. No new service or credential was provisioned. See [Participant access](PARTICIPANT_ACCESS.md) for enrollment responsibility, privacy, revocation and the read-only milestone boundary.

The onboarding migration then succeeded transactionally with the same hash/timestamp. Read-only verification retained 15 roster records, two activities, three sessions, zero attendance marks, two point entries, one engagement period, one reward and zero redemptions. Participant invitations and account links remain empty. No synthetic live accounts, invitations, links, awards, reservations or emails were created for testing. Reserved main and Kermes remain untouched.

Validation: `npm run check` passed 137 tests (56 Node/domain/API/PostgreSQL, 2 real Worker runtime, 79 UI). Final focused reruns passed 15 database/API checks and 5 participant UI checks, including one added authorization-loss case (138 distinct tests total). Final strict types pass. Tests cover consent/identity validation, expired/revoked/demoted-creator invitations, exact retries, tenant/role separation, sanitized self-only histories, disconnection/archive, preserved balances, immutable identity history, and actual self-attendance/manual-award/handout denial. UI checks cover participant signup without organizer adulthood, participant PWA launch, consent and destructive confirmation, retry-safe fragment sharing, read-only rewards and retaining service-failed pages while hiding private details after authorization loss.

Final production build, localization checks and CSS button contrast audit pass (minimum 5.87:1). Chromium with synthetic local APIs checked en/nl/tr at 320/390/768px: invite consent and 16px inputs, fragment-only sharing and acceptance, real account/history URL reloads, one Back control, participant home/rewards/history/settings, staff-route redirects, and disconnect cancel versus confirm. Participant tabs use short localized labels and retain full labels at the smallest width. A delayed-API browser check verifies loading skeletons and loaded navigation preserve height/position without overflow at all three widths. Screenshots were visually reviewed. These tests do not verify physical phone keyboards, hosted email delivery or local consent compliance.

Worker `cc2ebb27-01dd-437a-94ac-ab626d90aa8e` is verified active at 100% traffic through Cloudflare's deployments API. Existing dedicated database/auth bindings, CSRF/rate limiting, native fetch handling and PWA privacy boundaries are retained. Direct workers.dev access remains unavailable from this environment; activation was verified through Cloudflare's API and functional browser checks used synthetic local APIs. No hosted account, participant or reward mutations were performed as tests.

## Navigation redesign checkpoint (2026-10-19)

Organizer navigation now separates Activities, People, Rewards and Manage. Members/Groups use real-route tabs under People; Manage groups engagement reports, team/staff/invitations/volunteer permissions, and organization details. Profile is limited to identity, language, installation and confirmed sign-out; volunteers and participants can read organization details from there. Existing feature/detail URLs remain valid and back controls point to their new canonical parents. See [Navigation](NAVIGATION.md).

All localized PWA manifests now use `start_url: /hub` with stable `id: /`; `/app` redirects to `/hub`. Single-organization verified staff start in Activities, participants in My progress; the bounded chooser, sign-in/verification and empty-membership setup behaviors are retained. Landing-page sign-in uses the same entry. No database migration, new service, credential or private device persistence was introduced.

Validation: `npm run check` passed all 141 tests (56 Node/domain/API/PostgreSQL, 2 real Worker runtime, 83 UI). Coverage includes the new starting destinations, direct unauthorized management URL redirects without staff-data requests, independent organization-details reloads and Manage parent navigation, personal-only profile discovery, dirty-form navigation and organization switching. A final strict typecheck also passed. Production build and CSS button contrast audit pass (minimum 5.87:1).

Chromium using synthetic local APIs checked en/nl/tr at 320/390/768px: fixed daily navigation and full tab labels, People/Groups URLs/reload/active parents, top-level Rewards without an unnecessary Back, all five Manage destinations with reload and exactly one Back, personal profile contents, volunteer/participant navigation and permitted organization details, unauthorized management redirects, old `/app` compatibility, stable loading navigation and all localized `/hub` manifests. No live account, organization, participant, attendance or reward data was mutated for testing. Browser checks do not prove physical phone keyboards or hosted auth/email delivery.

Final layout review tightened Profile heading spacing and adapted compact Manage rows so Dutch compound titles fit on a 320px screen. Targeted production-browser layout checks pass in en/nl/tr at 320/390/768px, including full title widths; screenshots were visually reviewed. Worker `4c6a8c7d-8af2-48e3-870a-6921bd5d3075` is verified active at 100% traffic through Cloudflare's deployments API. Direct workers.dev access remains restricted in this environment; functional checks used synthetic local APIs and hosted activation used Cloudflare's API. Existing dedicated bindings and PWA privacy boundaries remain in place. Kermes Pay and all database branches were untouched by this redesign.

## Participant coupons checkpoint (2026-10-19)

Migration `0011_flimsy_komodo` adds immutable private collection codes, pending-reservation backfill and transactional self-claim/cancel/collection functions. Canonical SQL is in `db/migrations/functions/coupons.sql`; no existing earned points are rewritten. Development migration succeeded transactionally with SHA-256 `fb38ceafaaa1e76c27379eaec834fc7863e6b02238d75bbaea28633b86cb382c` and journal timestamp `1792433395840`. See [Rewards](REWARDS.md) for role, stock, balance and recoverable-code policy. No service, credential or payment integration was added. The PWA still starts at `/hub`.

The onboarding migration then succeeded transactionally with the same hash/timestamp. Before/after read-only checks retained two point entries and zero redemptions/pending reservations; zero coupon rows were needed. No synthetic live claims, participant links, scans, invitations or emails were submitted. Reserved main and Kermes remain untouched.

Validation: `npm run check` passed 152 tests (59 Node/domain/API/PostgreSQL, 2 real Worker runtime, 91 UI). Coverage includes atomic last-stock/shared-wallet claims, catalogue versions, exact claim/collection receipts, sanitized self-only coupon reads, tenant/role denials, cancellation versus collection, audit rollback, immutable codes/history and historical self-collection denial after disconnection. UI coverage includes claim review, uncertain retries, cancellation/collection cancel versus confirm, final coupon states, infinite-page error retention and permission-loss hiding, late camera permission resolution, background/unmount stream cleanup and camera denial fallback. The actual locally generated QR SVG decodes through the scanner library. Production build and CSS contrast audit pass (minimum 5.87:1).

Production Chromium with synthetic local APIs verified en/nl/tr at 320/390/768px: claim review and navigation, coupon/list URL reloads, private QR display, one Back control, cancellation and collection cancel versus confirm, final coupon reuse denial, camera permission failure with manual-code fallback, and no horizontal overflow. Screenshots were visually reviewed. These checks do not prove physical phone camera/keyboard behavior or hosted email delivery. No hosted user/reward mutations were performed as tests.

Worker `1ed16d0f-3174-4420-9cf0-2c653cf3279d` is verified active at 100% traffic through Cloudflare's deployments API. Direct workers.dev access remains restricted in this environment; functional browser checks used synthetic local APIs and hosted activation used Cloudflare's API. Dedicated auth/database bindings, CSRF/rate limiting, native fetch handling and private PWA cache boundaries remain unchanged.

## Mobile action consistency checkpoint (2026-10-19)

Shared buttons now wrap translated labels with a 48px default touch target; paired action rows and dialog footers use consistent gaps and stretch together, while icon controls remain square. Participant invitation account switching has a separate spaced section. People, rewards, participant access, period reports and coupon history use shared RouteTabs with real links/aria-current and an active underline. Volunteer scope choices retain buttons with explicit pressed state and segmented styling. Existing routes, mutations, confirmations, permissions and `/hub` PWA launch behavior are preserved. No database, credentials or service changes are needed.

`npm run check` passes all 152 tests (59 Node/domain/API/PostgreSQL, 2 real Worker runtime, 91 UI). Production build and CSS contrast audit pass (minimum 5.87:1).

Chromium with synthetic local APIs checked en/nl/tr at 320/390/768px: invitation acceptance/account-switch separation, equal-height paired actions with longer reservation labels, square icon controls, route-tab active states/navigation/reload, reward forms and member menus, pressed scope selectors, sign-out confirmation footers, public landing and signed-out sign-in layouts. Alternative sign-in links retain at least 44px touch targets. Screenshots were visually reviewed. Final strict TypeScript, documentation, build and contrast checks also pass. These checks do not prove physical phone keyboard behavior. No live accounts/data were changed for testing, and all database branches and Kermes Pay remain untouched.

Worker `837b8043-0bfc-464e-b16a-7e2000ef8a5b` is verified active at 100% traffic through Cloudflare's deployments API. Direct workers.dev access remains restricted here; functional browser checks used synthetic local APIs. Existing dedicated bindings and private PWA cache boundaries are unchanged.

## Compact card actions and search filters (2026-10-19)

Card primary/menu rows now allocate the remaining width to the labelled action and keep the more trigger at 44px square, including reward/member detail headers. Radix replaces the trigger data-slot, so CSS targets its stable class directly rather than assuming data-slot=button. Shared directory search/filter toolbars reset label/select margins, use a 12px row gap and keep mobile selects full-width. Attendance filters already have a separate 16px grid gap. No route, backend, database, credential or PWA launch changes are involved.

`npm run check` passes all 152 tests (59 Node/domain/API/PostgreSQL, 2 Worker runtime, 91 UI). Production build and CSS contrast audit pass (minimum 5.87:1). Functional behavior, permissions and confirmations are unchanged.

Production Chromium using synthetic local APIs checked en/nl/tr at 320/390/768px: actual `.item-actions-trigger` boxes are 44×44px with zero flex-grow (including detail headers), labelled card actions fill the remaining row, search/select boxes have a 12px mobile gap, member menus remain compact, and pages have no horizontal overflow. Screenshots were visually reviewed. No live user/data mutations were performed; physical phone keyboard behavior was not tested.

Worker `5b5841e5-cb6b-4895-9d67-3fa42520b973` is verified active at 100% traffic through Cloudflare's deployments API. Direct workers.dev access remains restricted here; functional browser tests used synthetic local APIs. Dedicated bindings and private-cache boundaries are unchanged; all database branches and Kermes Pay remain untouched.

## Configurable challenges checkpoint (2026-10-19)

Migration `0012_ordinary_praxagora` creates challenges, frozen target groups, private completion records, immutable audit events and actor/payload-bound receipts. It extends ledger sources with `challenge` and preserves original source/rule version on point corrections. Canonical functions are in `db/migrations/functions/challenges.sql` and `points.sql`; see [Challenges](CHALLENGES.md) for permissions, publication, eligibility, once-only approval and correction policy. The development migration succeeded transactionally with SHA-256 `78c8caa2368c56eee8e7562b43546a31843ea52936d26d0c5e0eebaf5e361110` and journal timestamp `1792447382604`.

The onboarding migration then succeeded transactionally with the same hash/timestamp. Before/after read-only counts retained three point entries, three redemptions and two participant links. New challenge/submission tables have zero rows. No live accounts, challenges, submissions, awards, invitations or emails were created as tests. Reserved main and Kermes remain untouched. No service, credential or payment integration was added; `/hub` remains the PWA entry.

`npm run check` passes 163 tests (61 Node/domain/API/PostgreSQL, 2 real Worker runtime and 100 UI). Coverage includes draft publication and rule/audience guards, group and private identity isolation, future/expired dates, version conflicts, competing review decisions, withdrawal/resubmission, direct recording and exact receipts, immutable events/final completion records, audit-failure rollback, ledger correction provenance, pagination, revocation and historical self-review denial. UI coverage includes discard/decision cancel-versus-confirm, receipt retries, candidate versions, participant-visible feedback requirements, infinite-page error retention and hiding private review details after permission loss. Final strict types and production build pass. Form textareas use a shared 16px mobile size.

Final focused reruns pass both challenge PostgreSQL/validation tests and all nine challenge UI tests after copy and mobile refinements. The injected review-audit failure test verifies both the pending/approved completion and its ledger award roll back together. Production build, strict TypeScript, documentation and CSS contrast checks pass (minimum 5.87:1).

Chromium with synthetic local APIs verified en/nl/tr at 320/390/768px: draft creation with paginated group selection, 16px inputs/textareas, publication confirmation, real challenge/review URL reloads, participant submission/history, withdrawal and approval cancel-versus-confirm, once-only completion controls, direct completion and canonical result navigation, four readable participant tabs, one Back and no horizontal overflow. Screenshots were visually reviewed. Final review confirmations name the recipient and snapshot points. These checks do not prove physical phone keyboard behavior or hosted email delivery. No hosted participant/challenge mutations were used as tests.

Worker `fd0e7f4d-4f88-4bee-b895-a0daad924a61` is verified active at 100% traffic through Cloudflare's deployments API. Direct workers.dev access remains restricted in this environment; functional browser checks used synthetic local APIs and hosted activation used Cloudflare's API. Existing dedicated database/auth bindings, CSRF/rate limiting, native fetch handling and private PWA cache boundaries remain unchanged.

### 20 October 2026 — challenge detail header alignment

Challenge detail titles and the more menu now stay in one row on phones. The title wraps within the available space and the menu remains a right-aligned 44px square; list-page create actions retain their stacked mobile layout. The preference is recorded in AGENTS.md.

Production build and CSS contrast audit pass (minimum 5.87:1). Chromium checked the production CSS with short, long and unbroken titles at 320/390/768px: all nine cases retain the right-aligned 44px menu without horizontal overflow. A header fixture screenshot was visually reviewed; these are isolated layout checks, not live account tests.

Worker `11668a4e-937b-4da5-bec0-f02971602ed9` is active at 100% traffic, verified through Cloudflare's deployments API. No database, authentication or PWA configuration changed.

`npm run check` passes all 163 tests (61 Node/PostgreSQL/API/domain, 2 Worker runtime and 100 UI), including strict types and documentation validation.

### 20 October 2026 — challenge detail card spacing

Challenge detail and submission cards now have 20px separation and a consistent 16px internal gap. Submission status badges fit their content instead of stretching across the card. Scoped heading/paragraph margins keep spacing controlled by the card grid; other settings panels retain their existing layout.

Production build and contrast audit pass (minimum 5.87:1). Chromium production-CSS fixtures at 320/390/768px verify card separation, internal gaps, compact badges and no horizontal overflow; the mobile screenshot was visually reviewed. These were isolated layout checks with synthetic content. Worker `21ebf3a3-6d1c-4209-888c-96304a6f81af` is verified active at 100% via Cloudflare's API. No database, auth or PWA configuration changed.

`npm run check` passes all 163 tests (61 Node/PostgreSQL/API/domain, 2 Worker runtime and 100 UI), strict types and documentation links.

### 20 October 2026 — notification centre and opt-in Web Push

Added private organization notification history, capped unread counts, a compact header bell, read controls and deep links to challenge decisions, point changes and reward workflows. Profile manages per-device push opt-in and confirmed device/all-device disable. English, Dutch and Turkish are supported. See [Notifications](NOTIFICATIONS.md) for event mappings, privacy, supported browsers and operational details.

Drizzle migration `0013_hard_pestilence` adds `hub_notifications`, `hub_push_devices` and `hub_push_deliveries`, transactional event/outbox triggers, current-recipient access checks and atomic registration limits. SHA-256 `d1cc8721c9a04c52e05558cfa9c58271f62f1d390326c7cc31bbf27d7be1e553`, journal timestamp `1792505262264`. Applied transactionally to dedicated development first, then onboarding, with an explicit previous-journal guard. Reserved main and Kermes remain untouched. Before/after onboarding counts retained four point entries, three redemptions, two participant links and one submission; the three new tables remained empty. No historical notification backfill or real account/device fixtures were created.

Dedicated Himmah VAPID keys are retained in ignored local configuration and encrypted Worker secret bindings `HIMMAH_VAPID_PUBLIC_KEY` / `HIMMAH_VAPID_PRIVATE_KEY`. The private key was checked absent from all client assets. The existing Worker gains a once-per-minute Cron Trigger and a bounded, leased, retryable push dispatcher using standards-based Web Crypto encryption/VAPID. No external paid push service, Firebase project, new database or billing integration was provisioned. Generic lock-screen payloads omit names, points, notes and coupon secrets. Current access is checked immediately before delivery; sign-out cleans up the current device.

`npm run check` passes 173 tests: 64 Node/domain/API/PostgreSQL/PWA, three real Worker runtime tests and 106 UI tests. Real SQL checks cover recipient snapshots, tenant/role isolation, cursors, read idempotency, transactional rollback/deduplication, linked point/challenge/reward events, exclusive leases, transient retries, expired-device deletion, access revocation and the ten-device limit. Worker runtime verifies encrypted/authenticated push requests via native fetch, throttling and expiration; provider requests target synthetic fixture Workers only. Service-worker tests verify safe click destinations and preserving other open forms. UI tests cover page failure/retry retention, immediate authorization-loss hiding, explicit permission, enable retry, disable confirmations, sign-out cleanup and waiting-worker activation without reload.

Chromium checked the actual app with synthetic API interception for owner/participant roles, en/nl/tr and 320/390/768px: direct notification URL reloads, mark-all, fixed header/bell geometry, Profile controls, no horizontal overflow and iPhone installation guidance. Screenshots were visually reviewed. Production build and CSS contrast audit pass (minimum 5.87:1). These checks do not prove physical iOS/Android push receipt; actual delivery requires each device's opt-in and supported OS/browser settings. No real test alerts, invitations or participant mutations were sent. PWA `/hub`, auth/CSRF/rate limits and private cache exclusions remain intact.

Final focused reruns pass both notification PostgreSQL/API tests and all six notification UI tests after account-expiration cleanup, cryptographic subscription-key validation and bounded mark-all responses. Final strict TypeScript, production build and contrast audit pass. The per-device cleanup path handles an expired session by revoking the browser endpoint; authenticated unverified users may remove only their own devices. All-device disable still requires a valid session.

Worker `976be4db-0fec-4e3f-92e2-5cc3c5cfab9d` is active at 100% traffic, verified through Cloudflare's deployments API. The schedules API confirms `* * * * *`; Worker settings confirm both dedicated VAPID secret bindings. Hosted device delivery was not used as a test. Direct workers.dev access remains restricted from this environment, so functional browser validation used local production assets and synthetic APIs.

### 20 October 2026 — Android notification status-bar badge

Android push notifications now use a dedicated 96px white leaf on a transparent background (`notification-badge.png`) rather than the opaque app tile as their badge. The full-color larger notification icon remains unchanged. The asset generator retains the SVG source; public cache v3 preloads the badge and removes the older public cache during normal service-worker activation. New notifications adopt the badge after activation; already displayed alerts may retain the previous image.

All six PWA tests pass, including image dimensions, white-only visible pixels, transparency and service-worker badge reference. The generated leaf was visually inspected. Production build and CSS contrast audit pass (minimum 5.87:1). Worker `bad53298-6545-4c6e-acd0-8250e6de0ba5` is verified active at 100% through Cloudflare's API. No database, push credentials or delivery settings changed. Physical Android status-bar rendering was not tested here.

`npm run check` passes all 174 tests (65 Node/domain/API/PostgreSQL/PWA, three Worker runtime and 106 UI), strict types and documentation checks.

### 20 October 2026 — persistent Futsal season setup

Added a separate Futsal app area reached through Hub → Manage → Connected apps, with real season/new/settings/entries/review routes and fixed Seasons/Back to Hub navigation. Verified owners/admins have explicit early-access setup permission; volunteers/participants cannot fetch setup/candidates/rosters. Hub remains standalone and the PWA still starts at `/hub`. No payment provider or new service is added.

Both Club Manager and Team Play support league and single-elimination tournament setup. Configurable dates, entry/team/squad sizes, equal baseline ratings, training cadence/caps/chance conversion, football rules and optional prize criteria are persisted. Paginated team pickers retain selections and disable existing assignments. The pure rules module generates stable saved-seed brackets with byes and round-robin schedules. **Lock setup** stores an immutable `prepared` snapshot of settings, seed, entrant nicknames and plan; it does not run virtual squads, training or matches. See [Futsal setup](FUTSAL_SETUP.md) for exact supported limits and next-stage boundaries.

Drizzle migration `0014_outgoing_retro_girl` adds five Futsal-owned tables, composite scope/uniqueness constraints, validators, transactional commands, immutable setup/roster guards and append-only audit/receipt guards. SHA-256 `2683edf77c89b20526195c36f87a207dc6a2a628f9a178f5abaf46226e2dbc7c`, journal timestamp `1792511609051`. Applied transactionally to development first, then onboarding with an explicit prior-journal guard. Reserved main and Kermes remain untouched. Before/after onboarding counts retained five point entries, four redemptions, two participant links and two submissions. New Futsal tables remained empty; no real seasons, assignments, accounts or test participants were created.

`npm run check` passes 184 tests (68 Node/domain/API/PostgreSQL/PWA, three real Worker runtime and 113 UI), strict types and documentation links. Futsal domain tests exercise both modes/formats with 2–16 entries, pair uniqueness, balanced home/away counts, legs, knockout byes/advancement references, deterministic draws, DST/local times and safe growth/calendar limits. Real SQL/API tests persist and lock all four combinations, test exact receipts, stale/concurrent writes, duplicate/foreign assignments, scoped cursors, current authorization/replay denial, frozen names/settings/rosters and rollback of an injected audit failure. No Hub ledger changes occur during setup.

Seven new UI tests cover configured creation/canonical navigation, one-confirmation discard, exact uncertain retries, persistent selections/disabled assigned participants, next-page error retention, authorization-loss hiding, locking cancel-versus-confirm and invalid-calendar feedback. Final focused SQL/domain and UI reruns pass after privacy/immutability and home/away refinements. Strict TypeScript, production build and contrast audit pass (minimum 5.87:1). Form controls use 16px text and 48px input/select targets; ordinary browser keyboard behavior is not a physical-device verification.

Production-asset browser walkthroughs passed all four mode/format create → assign → review → lock → reload flows with synthetic intercepted APIs. Final layout checks cover English/Dutch/Turkish at 320/390/768px, one visible heading/back control, exactly one active route tab, 48px inputs, compact icon actions and no horizontal overflow or browser errors. The season list defaults to all statuses so locked setups remain visible. Physical phone keyboard and live account writes were not exercised.

Worker `bc4bb30e-2d66-4eb7-85f9-1f891d0be0b8` is deployed at 100% traffic, verified through Cloudflare's deployments API. The minute push schedule remains in the deployment. Direct hosted access remains restricted from this environment; browser validation used local production assets. No secrets, billing services or Hub point balances changed.
