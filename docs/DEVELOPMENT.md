# Development

## Setup

Use `/workspace/himmah-futsal`. Node.js 24; npm with committed lockfile.

```sh
npm ci
npm run check
```

There is no runnable web app yet. Reserve port 3101 for the future dev server. Never stop Kermes Pay or edit its configuration to free a port.

## Environment isolation

`.env.local` is ignored. Copy names from `.env.example` only if this does not overwrite an existing local file. Provisioned database credentials belong only in that file or a dedicated secret manager. Do not paste them into issues or chat. The shared environment's generic DATABASE_URL and auth settings are not this project's configuration.

Use HIMMAH_DATABASE_URL (pooled application traffic) and HIMMAH_DATABASE_URL_UNPOOLED (direct migrations). The config module fails if either is absent; it does not read generic DATABASE_URL. Local environment loading into the future server/migration runner still needs implementation.

No app schema has been migrated. Add Drizzle when implementing persistence, keep generated migrations under db/migrations, and validate changes on development/temporary branches before any production application.

## Verification expectations as features arrive

Domain: reproducible seeded outcomes, equal starting strength, rating caps, fixtures/byes and tie-breakers.
Services: authorization across users/teams/seasons; quiz scoring; concurrent duplicate awards/training/matches; correction audit trail; frozen results.
UI: phone viewport, keyboard operation, readable contrast and slow/retried network requests.

## GitHub publication

The owner created https://github.com/Talha-Bayansar/Himmah.git. The local `origin` points to it. Publish committed work using normal Git transport:

```sh
git push origin main
```

API-based creation previously failed because api.github.com was denied. Git transport uses github.com; do not replace credentials or assume the API restriction blocks Git pushes. Inspect the remote and branch state before pushing; never force-push shared history by default.
