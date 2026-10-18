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
