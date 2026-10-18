# Agent instructions — Himmah Futsal

## Read at the start

Read README.md, docs/PROJECT_CONTEXT.md, docs/DECISIONS.md, docs/INFRASTRUCTURE.md, and the documents relevant to your task. They are the durable project context. Current user instructions take precedence. Update docs when behavior or infrastructure changes.

## Owner's intent

Build a phone-friendly game for mosque youth aged 11–15. Both Club Manager and Team League belong in the first playable product. Both must support league and tournament formats; mode and format are independent choices. Organizers need a validated pre-season settings builder. Multi-organization isolation is a foundation requirement, even when piloting with one mosque. Future billing is organization-level and provider-neutral; Stripe or Mollie is undecided, not an instruction to integrate payments now. Preserve the football squads, configurable seasons, engagement-to-training loop, simulated matches, league standings, and volunteer control. Do not quietly simplify it into a points-only tracker or remove a mode.

Distinguish owner-confirmed requirements from implementation proposals. Numerical balancing, branding, stack choices, roster fillers, and pilot size are defaults to validate, not owner commitments. Never describe unfinished functionality as shipped.

## Isolation is mandatory

- Work only in this repository for this project. Never change `/workspace/kermes-pay` or parent workspace configuration as a side effect.
- Use port 3101. Check availability; do not terminate another project's processes.
- Do not use inherited DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, or deployment credentials without verifying they belong to Himmah Futsal. The shared environment currently contains another project's bindings.
- Use HIMMAH_DATABASE_URL and HIMMAH_DATABASE_URL_UNPOOLED in this project's ignored .env.local. No fallback to a generic DATABASE_URL.
- Use the dedicated Neon project and development branch listed in docs/INFRASTRUCTURE.md. Never migrate main during development. If project credentials are missing, fail clearly.
- Do not change global Git authentication or global application configuration. Use project-local dependencies and settings.

## Engineering defaults

TypeScript strict mode; mobile-first responsive web app. Proposed application stack: Next.js, PostgreSQL on Neon, Drizzle migrations. Keep football calculations pure in src/domain with injected, seeded randomness and versioned rules. Match inputs, training outcomes, and results must persist; refreshes and job retries cannot reroll them.

Enforce permissions, quiz scoring, approvals, rating growth, and prize administration on the server. A participant may not approve their own participation or fetch quiz answer keys before submission. Bound every query by organization, season, membership, and role as relevant. Derive authorized organization scope from verified membership, never trust a client-supplied organization ID alone. Apply tenant scope to jobs, caches, exports and files too. An organization subscription never grants access to another organization or stronger players. Keep safety constraints outside organizer-configurable game settings.

Use transactions, unique constraints, and idempotency keys for training, match execution, and reward claims. Snapshot rules when a season starts; do not silently change active-season outcomes. Record volunteer corrections with actor, reason, and time.

Store UTC timestamps and an explicit season timezone. Keep secrets out of Git, tool output, logs, screenshots, and documentation. Commit only example variable names and non-secret resource IDs.

## Youth experience

Read docs/SAFEGUARDING.md before implementing accounts or engagement features. Private worship is not a public metric of religious worth. No paid advantages, betting, private messaging, real youth photos, or public attendance breakdown in the initial product. Religious content is authored/reviewed by the mosque; do not invent authoritative religious rulings.

## Workflow and validation

Carry authorized work through implementation and relevant verification without routine confirmation questions. Ask only for consequential missing decisions or external access that cannot be resolved. Do not deploy, buy extra services, or send messages to third parties without applicable authorization.

Use rg for discovery. Keep changes focused. Run npm run check and meaningful tests for changed game rules, authorization, persistence, and retries once implemented. Do not add empty tests or claim nonexistent coverage. Report what changed, evidence of verification, and material blockers.

Before committing, inspect git diff --check and git status. Never commit .env files, credentials, real children's records, database dumps, or local provisioning responses. Keep docs/INFRASTRUCTURE.md and docs/DECISIONS.md accurate.
