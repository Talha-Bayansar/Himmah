# Decision log

## 2026-10-17 — Product requirements

Confirmed: two modes, futsal squads, equal starting strength, engagement/Friday quiz affecting training growth, simulated matches, competition table, configurable team groupings and season end, organizer-controlled prizes, own-phone access. Source: owner conversation. Details in PROJECT_CONTEXT.md.

## 2026-10-17 — Project identity and isolation

Working name chosen by agent: Himmah Futsal; slug himmah-futsal. Dedicated folder, Git repository, Neon project and environment variables. Reserve port 3101. Never reuse Kermes Pay infrastructure. Private GitHub visibility is the default because youth-focused project requirements do not call for public source.

## 2026-10-17 — Technical direction

Proposed: TypeScript, Next.js, Drizzle and Neon PostgreSQL. Only TypeScript foundation is installed now; no framework scaffolding or hosting commitment. Europe/Frankfurt chosen as provisional Neon region, not a complete determination of data residency/compliance.

## 2026-10-17 — Game defaults pending validation

Seven-player manager roster, virtual fillers, baseline training, capped bonuses, new-season resets, point/tie-break rules and pilot size remain proposals. Need balance experiments and owner review before real seasons. Do not silently promote example percentages to final rules.
