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
