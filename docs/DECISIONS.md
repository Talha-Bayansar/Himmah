# Decision log

## 2026-10-17 — Product requirements

Confirmed: two modes, futsal squads, equal starting strength, engagement/Friday quiz affecting training growth, simulated matches, competition table, configurable team groupings and season end, organizer-controlled prizes, own-phone access. Source: owner conversation. Details in PROJECT_CONTEXT.md.

## 2026-10-17 — Project identity and isolation

Working name chosen by agent: Himmah Futsal; slug himmah-futsal. Dedicated folder, Git repository, Neon project and environment variables. Reserve port 3101. Never reuse Kermes Pay infrastructure. Private GitHub visibility is the default because youth-focused project requirements do not call for public source.

## 2026-10-17 — Technical direction

Proposed: TypeScript, Next.js, Drizzle and Neon PostgreSQL. Only TypeScript foundation is installed now; no framework scaffolding or hosting commitment. Europe/Frankfurt chosen as provisional Neon region, not a complete determination of data residency/compliance.

## 2026-10-17 — Game defaults pending validation

Seven-player manager roster, virtual fillers, baseline training, capped bonuses, new-season resets, point/tie-break rules and pilot size remain proposals. Need balance experiments and owner review before real seasons. Do not silently promote example percentages to final rules.

## 2026-10-18 — Formats, settings and multiple organizations

Owner-confirmed: tournament format in both modes, broad pre-season game configuration, and multiple independent mosque/organization workspaces. Treat mode (Club Manager or shared participant team) separately from format (league or tournament). Proposed initial tournament format: single elimination, with group stage plus knockout as a later option; exact tournament variants are not yet confirmed.

Use organization-scoped membership, configuration and game records from the first persistence implementation. Cross-organization isolation is mandatory, not a feature to retrofit when subscriptions launch. Snapshot validated settings on season activation. Draft templates can be reused; active results cannot change when templates are edited.

Future monetization is a possible organization-level subscription/paywall. Preserve a provider-neutral entitlement boundary. Stripe and Mollie are candidates, not selected providers. No billing service, prices, tiers, or payment integration are authorized by this planning addition.

## 2026-10-18 — Source-independent engagement and manual awards

Owner clarified: quizzes must not be hard-coded. Each organization controls its earning system through custom activities, optional quizzes/attendance, or manually assigned individual points. This supersedes earlier wording that treats Friday quizzes as a required core mechanic. All four mode/format combinations must work with manual awards only.

Architecture proposal: one audited, append-only engagement ledger and versioned activity rules, feeding a source-independent season training conversion. Football standings points remain separate. No database/application implementation is claimed by this update.

## 2026-10-18 — Standalone Hub, connected apps and approved Hub scope

Owner accepted Hub as a standalone attendance/engagement product with Futsal as an optional licensed app and future games sharing the same contribution history. One account across apps; tenant-specific memberships and permissions remain mandatory. Hub records do not require a game license or season. Game-specific eligibility/allocations are separate from authoritative contributions. No universal spendable wallet is implied.

Owner approved the Hub feature design captured in HUB.md. Prioritize Hub core workflows before the Futsal engine milestone. Retain both Futsal modes/formats in its first playable version. Initial implementation may share a repository and tooling, with separate app experiences; no repository, database or infrastructure rename is required by this change. Pricing/tiers/provider and exact UI details are not settled.
