# Development

Use Node 24, `npm ci`, and reserved port 3101 (`npm run dev` or `npm run start` after building). Never use another project's generic inherited database/auth variables. Cloudflare and Neon targets must be independently verified before remote operations.

`npm run check` runs strict types, documentation links, Node/domain/PGlite/API tests, actual Worker-runtime regressions and UI tests. `npm run build` generates PWA assets and production bundles; `npm run test:contrast` checks production button colors. Browser fixtures use synthetic APIs and do not prove hosted sign-in or physical-device keyboards.

The upgrade regression reads the complete previous baseline at Git commit `2b99501e0a4fb5fc2467180aef080bb079a9d563`; test checkouts must retain that history. See [active migrations](../db/migrations/README.md) and [removal rollout](REMOVAL.md).
