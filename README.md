# Himmah — Hub and Futsal

A mosque youth platform for ages 11–15: take part, learn together, develop your players, and compete in simulated five-a-side football leagues and tournaments. Both play modes support either format. Built for independent mosque/organization workspaces, with optional organization billing planned for later.

“Himmah” expresses aspiration and determination. Working project name, chosen 17 October 2026; trademark/domain availability has not been checked.

Himmah Hub is the standalone membership, attendance and points app. Himmah Futsal is an optional connected game; future games can use the same contribution history. Hub and game licenses are organization-level. The existing folder and infrastructure retain their himmah-futsal names for continuity; no resources have been renamed.

Phone-testing prototype: **https://himmah-hub.talha-bayansar.workers.dev** (sample data; resets on refresh).

## Project status

Runnable Hub prototype with fictional data: youth dashboard, activity registration, attendance review/corrections, manual point awards, personal history, organization switching and a one-off activity builder. Real accounts, database persistence and Futsal gameplay are not implemented yet. See [infrastructure](docs/INFRASTRUCTURE.md) for actual provisioning status.

## Start here

- [Run and explore the prototype](docs/PROTOTYPE.md)
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
Run `npm run dev` for the Hub prototype on port **3101**. `npm run build` creates a static export in `out/`; `npm start` previews that export with Wrangler on the same port. `npm run check` verifies types, documentation links and domain tests.

The prototype uses fictional data held in memory, resets on refresh and never connects to Neon or inherited credentials. Staff/youth and organization switches are demonstration controls, not authentication. Do not enter real youth records. See [Prototype guide](docs/PROTOTYPE.md).

This repository is independent of `/workspace/kermes-pay`. Never reuse its credentials, database, auth, deployment, or repository.

Private project; no open-source license has been selected.
