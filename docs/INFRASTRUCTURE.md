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
- No application schema, migrations, or real youth records yet.
- Account compute defaults retained. Explicit suspend-time configuration was rejected, so do not assume an idle suspension interval or promise a free tier. No plan upgrade or paid add-on was requested.
- Neon CLI 8.8.0 installed but has no authenticated profile. Connected Neon tools performed provisioning; no browser login launched.

## Other services

No hosting, auth provider, storage, email, scheduler, analytics, AI provider, payment service, or domain provisioned. Add these only when needed. Stripe CLI is unavailable and https://stripe.directory is denied by network policy, so that provisioning route could not be used. Dedicated Neon provisioning succeeded through the existing connection.

## Isolation

Kermes Pay files and settings were not changed. No inherited database, auth or deployment binding is assigned to Himmah Futsal. Reserved app port: 3101. Database and branches belong to this project only.

## Local Hub prototype

Next.js/React application added on reserved port 3101. Uses fictional browser-memory state only; does not read project or inherited database credentials. No hosting or new cloud service was provisioned. The previously created Neon database remains without application tables.
