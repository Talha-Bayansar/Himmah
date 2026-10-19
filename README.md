# Himmah — Hub and Futsal

A community engagement platform for mosques and organizations: take part, learn together, develop your players, and compete in simulated five-a-side football leagues and tournaments. Both play modes support either format. Built for independent mosque/organization workspaces, with optional organization billing planned for later.

“Himmah” expresses aspiration and determination. Working project name, chosen 17 October 2026; trademark/domain availability has not been checked.

Himmah Hub is the standalone membership, attendance and points app. Himmah Futsal is an optional connected game; future games can use the same contribution history. Hub and game licenses are organization-level. The existing folder and infrastructure retain their himmah-futsal names for continuity; no resources have been renamed.

Installable app for iOS and Android. See [PWA installation and maintenance](docs/PWA.md).

Live app: **https://himmah-hub.talha-bayansar.workers.dev**. The landing page starts organizer onboarding at `/start`. English, Dutch and Turkish are supported through Paraglide JS.

## Project status

The deployed app contains working organizer registration, email verification, sign-in/recovery and persistent organization setup/list/detail. Owners/admins can manage private participant nicknames, groups, group assignments, archiving and staff invitation links. Members, groups, staff and invitations have dedicated mobile-friendly pages and keyboard-aware forms. Fixed navigation and a paginated organization switcher keep daily use compact; profile preferences and organization details live in Settings. All growing lists use cursor-based infinite fetching. Activities and scheduled sessions, attendance with optional automatic points, manual point awards, engagement periods and scoped volunteer assignments are implemented. Participant logins and Futsal gameplay remain future work. The old fictional Hub component remains internal development/test material; `/demo` has been removed and returns 404. See [infrastructure](docs/INFRASTRUCTURE.md) and [organization onboarding](docs/ORGANIZATION_ONBOARDING.md).

## Start here

- [Archived prototype and development fixtures](docs/PROTOTYPE.md)
- [Member/group management and pagination](docs/MEMBERS_AND_GROUPS.md)
- [Scoped volunteer assignments](docs/VOLUNTEER_ACCESS.md)
- [Approved Hub feature design](docs/HUB.md)
- [Detailed Hub screen designs](docs/HUB_SCREEN_DESIGNS.md)
- [Visual design board](docs/designs/hub-screens.html)
- [Agent instructions](AGENTS.md)
- [Owner preferences and confirmed requirements](docs/PROJECT_CONTEXT.md)
- [Product specification](docs/PRODUCT.md)
- [Game rules and balancing proposals](docs/GAME_DESIGN.md)
- [Dynamic activities and manual points](docs/ENGAGEMENT.md)
- [Pre-season configuration](docs/SEASON_SETTINGS.md)
- [Multi-organization platform and future billing](docs/PLATFORM.md)
- [Architecture and conceptual data model](docs/ARCHITECTURE.md)
- [Delivery roadmap](docs/ROADMAP.md)
- [Youth privacy and safeguarding](docs/SAFEGUARDING.md)
- [Development and infrastructure](docs/DEVELOPMENT.md)
- [Decision log](docs/DECISIONS.md)

## Local foundation

Requires Node.js 24 and npm. Run `npm ci` then `npm run check`.
Run `npm run dev` for the TanStack Start app on port **3101**. `npm run build` creates the Cloudflare client/server build in `dist/`; `npm start` previews it on the same port. `npm run test:contrast` audits button colors from the production build. `npm run deploy` publishes the generated Worker configuration. `npm run check` verifies types, documentation links, domain/API tests and component interaction tests.

Required stack: **TanStack Start, Router, Query, Form · Better Auth (managed by Neon) · Paraglide JS · shadcn/ui · PostgreSQL/Drizzle · Cloudflare Workers**. See [stack and UI conventions](docs/STACK_AND_UI.md).

The organizer portal uses managed Better Auth and a dedicated Neon branch. The archived Hub component and tests use fictional data and are not routed or included in the production JavaScript graph. No real youth enrollment is available. See [prototype archive](docs/PROTOTYPE.md).

This repository is independent of `/workspace/kermes-pay`. Never reuse its credentials, database, auth, deployment, or repository.

Private project; no open-source license has been selected.
