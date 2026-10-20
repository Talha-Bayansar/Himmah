# Futsal rehearsal — 20 October 2026

## Conclusion and boundary

The implemented feature supports creating, configuring, assigning and locking a season. A complete playable season cannot be simulated yet: player generation, engagement allocation, executed training, match results, standings, tournament advancement and champion selection are not implemented. The examples below are schedule and chance previews, not fictional match results presented as working gameplay.

All data is synthetic. Database tests use an isolated local PostgreSQL engine (PGlite) loaded with the real migrations and real store/API implementations. Browser flows use production assets with intercepted synthetic API responses. No production organization, member, ledger, reward, notification or season is changed.

## Four-team rehearsal

Synthetic clubs/teams: Atlas, Hilal, Nur and Safa. Club Manager assigns one person per club; Team Play assigns three per team (12 synthetic participants). Starting rating is 50 for every entry. Preparation starts 1 November 2026; first match is 15 November at 20:00 Europe/Brussels. Weekly rounds and training, one league leg, deadline 31 December.

| Mode | Format | Rounds | Scheduled fixtures | Planned training windows |
| --- | --- | ---: | ---: | ---: |
| Club Manager | League | 3 | 6 | 5 |
| Club Manager | Tournament | 2 | 3 | 4 |
| Team Play | League | 3 | 6 | 5 |
| Team Play | Tournament | 2 | 3 | 4 |

Team Play league fixture preview:

| Round | Local date/time | Fixtures |
| --- | --- | --- |
| 1 | 15 Nov, 20:00 | Atlas–Safa; Hilal–Nur |
| 2 | 22 Nov, 20:00 | Nur–Atlas; Safa–Hilal |
| 3 | 29 Nov, 20:00 | Atlas–Hilal; Nur–Safa |

Each pair meets once. Reusing the saved seed/settings/entry order returns the same schedule. Tournament finals reference semi-final winners; no winners or scores are fabricated.

Default training formula preview (not an executed training):

| Eligible points in a window | Bonus chance |
| ---: | ---: |
| 0 | 0% |
| 10 | 5% |
| 30 | 15% |
| 60 | 30% |
| 100 | 30% |

The default formula specifies one guaranteed growth and at most two total growth for a target. The chance is capped; points are not spent. Actual point allocation and rating changes require the next implementation stage.

The complete settings, synthetic rosters and generated plans are in [example plans](futsal-example-plans.json). Regenerate them with `node --experimental-strip-types scripts/futsal-rehearsal.ts` from the repository root. This script only computes local previews and writes this JSON; it has no database connection or network effects.

## Verification scope

- Domain: all four mode/format combinations, entry counts 2–16, one/two league legs, pair coverage, home/away balance, knockout byes/winner references, deterministic draws, calendar limits and timezone/DST handling.
- Persistence/API: all migrations; create, assign, preview, lock and reload for both modes/formats, immutable snapshots/rosters/nicknames, reasoned cancellation, retries, stale versions, audit-failure rollback, assignment uniqueness and organization/role isolation. Setup leaves the Hub point ledger unchanged.
- UI: configured creation, canonical routes, unsaved-change confirmation, exact uncertain retries, selection retention, assigned-member disabling, next-page errors, authorization-loss hiding and confirm/cancel locking.
- Browser: create → assign → review → cancel lock → confirm lock → reload in each mode/format; English/Dutch/Turkish narrow/tablet layouts. Intercepted APIs validate UI integration, not hosted database connectivity.

## Next implementation required for a whole-season test

Persist equal-strength virtual squads, allocate authorized engagement to training windows, execute seeded training exactly once, then execute seeded matches and persist standings/bracket advancement. Add a local clock-controlled runner that completes a fictional season immediately without waiting for real dates. That runner must exercise the same commands as normal gameplay and preserve results on retry/reload. This rehearsal does not verify balance, fairness of match outcomes or physical-phone behavior.

## Observed results

- The four-mode/format rehearsal script passed; repeated generation returns identical plans, with the fixture and training-window counts shown above.
- Fresh browser walkthroughs passed all four create/assign/review/lock/reload flows and the English/Dutch/Turkish 320/390/768px matrix. No overflow or browser page errors were observed.
- All 68 domain/API/PostgreSQL/PWA tests and all three Worker-runtime tests passed. All 113 UI tests across 17 files also passed. `npm run check` completed successfully: **184 tests passed, zero failures**, plus strict types and documentation checks.
