# Himmah — Hub and Futsal

A mosque youth platform for ages 11–15: take part, learn together, develop your players, and compete in simulated five-a-side football leagues and tournaments. Both play modes support either format. Built for independent mosque/organization workspaces, with optional organization billing planned for later.

“Himmah” expresses aspiration and determination. Working project name, chosen 17 October 2026; trademark/domain availability has not been checked.

Himmah Hub is the standalone membership, attendance and points app. Himmah Futsal is an optional connected game; future games can use the same contribution history. Hub and game licenses are organization-level. The existing folder and infrastructure retain their himmah-futsal names for continuity; no resources have been renamed.

## Project status

Project foundation and documentation. The game and account system are not implemented yet. See [infrastructure](docs/INFRASTRUCTURE.md) for actual provisioning status.

## Start here

- [Approved Hub feature design](docs/HUB.md)
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
This currently checks TypeScript and the documentation links; no web server is implemented.
The future app uses port **3101** and its own project-specific secrets.

This repository is independent of `/workspace/kermes-pay`. Never reuse its credentials, database, auth, deployment, or repository.

Private project; no open-source license has been selected.
