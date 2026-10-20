# Futsal gameplay v1

Both Club Manager and Team Play now support completing leagues and single-elimination tournaments. Setup remains `draft → prepared`; gameplay has a separate versioned `active → completed` state. Cancellation of the setup stops further gameplay. Frozen setup snapshots are never rewritten.

## Opening and running a season

Owners/admins use Manage → Connected apps → Himmah Futsal → season → Play. Create/fill/lock setup first, then confirm Activate season. This creates equal-strength squads. Process next event executes exactly one due training or match round, with confirmation and a saved receipt. Events follow the locked calendar; the server/database clock determines what is due. The page refreshes every 30 seconds. Execution is organizer-triggered in this pilot, not automatically scheduled by the push worker. Missed events can be processed later in their original order.

Assigned, linked participants open Himmah Futsal from My progress. They see only activated competitions they belong to, football standings/results and squad attributes. They cannot activate, process, change settings, inspect raw engagement allocations or fetch staff histories. Current link revocation, roster-person archival and staff-role separation are checked in SQL on each request. Peer person IDs, source details and point histories are not returned. Nicknames and football ratings are visible only inside the assigned competition.

## Point scale and conversion

Before locking, Training and fairness exposes points per bonus step, percentage-point increase per step and capped bonus chance. An editable hypothetical point amount immediately previews the result without saving anything. The safety limits remain 1–1,000 points per step, 1–10 percentage points per step and 5–40% maximum chance. Ten points per step and 100 points per step are equivalent when the second organization awards ten times as many points. Conversion cannot change after setup is locked.

Training reads the normalized Hub ledger; it has no quiz or attendance dependency. Each participant's eligibility time for a ledger entry is the later of its recording time and activity occurrence time. A correction uses the original award's occurrence time and its own recording time. Entries belong to the half-open window `[previous cutoff, current cutoff)`; the first starts at preparation. Late awards and corrections move to the next applicable window, rather than changing completed training. Negative net points clamp to zero in that window, without carrying negative debt or removing earned ratings. Records after the final training do not affect this season. Multiple games/seasons can measure the same contribution; nothing is spent from Hub or reward wallets.

Each saved training event includes the input allocation/eligibility map, chance, target attribute/player, before/after values and bonus outcome. Database commit recomputes and compares the allocation, preventing a stale read or archival race from committing different inputs. Inactive/archived participants receive no further training. Historical squad nicknames/ratings remain preserved for organizers.

## Engine and fairness

`futsal-game-v1` is a pure, seeded engine. At activation all attack, defence and control attributes equal the season's starting rating. Club Manager uses the configured five/seven-player squad and rotates its participant's training target through that squad. Team Play gives each person their own player and fills the five places with equal virtual players. Fillers do not receive engagement growth. Each eligible participant gets guaranteed baseline training plus the capped chance of bonus growth in one attribute. The saved ceiling is enforced.

The first five players are the fixed balanced lineup. Seven-player Manager reserves train but do not enter the lineup in v1; tactical/lineup controls are a subsequent improvement. No injuries, transfers, paid boosts, stakes, chat or real photographs are introduced.

Match attack/defence strength combines the first five players' relevant attributes and control. Goals use bounded Poisson means `clamp(2.2 * exp((attack - opposing defence) / 90), 0.7, 5.5)` and an independent seeded stream per saved fixture ID; no home bonus is applied. A tied knockout match uses a saved penalty decision with a strength-adjusted chance bounded to 35–65%. Byes advance without a played match. Exact team strength inputs, goals, winner and penalty flag persist. Reloads/retries never reroll outcomes.

League standings use configured football points, goal difference, goals scored and shared rank for exact ties. UUID ordering only stabilizes display; it does not break shared sporting places. Tournament rounds resolve persisted earlier winners. Completion is automatic after the last planned event; league leaders or the final winner are shown. Prize criteria remain descriptive: no automatic Hub reward issuance or prize handout is added.

These are explicit pilot defaults, not a claim of validated long-term game balance. Higher attributes improve expected outcomes, not guaranteed victories. The single-attribute growth cap limits advantages. More detailed tactical choices, a rated balance pilot, automatic scheduling and notifications can follow without rewriting completed outcomes.

## Persistence, authorization and retries

Migration `0015_happy_blackheart` creates `futsal_games` and `futsal_game_events`, scoped FKs, unique season versions and organization/request receipts. Mutations lock organization/admin membership, season and game; compare expected version/prior state; check due time; and append immutable audit/outcome history in the same transaction. Replays are bound to actor, organization, season and operation/version, and recheck current authorization. Audit failure rolls back game state. Completed state and all event rows cannot be updated/deleted. Worker APIs ignore client state, point allocations, engine seeds, outcomes and clocks. Private APIs use no-store; auth/CSRF and rate limits remain shared with Hub.

Game state is a bounded season aggregate: at most 16 entries, 112 virtual players and 240 played fixtures. Training history is stored separately, fetched with bounded cursor/infinite scrolling pages rather than growing the state with every participant outcome. Participant season lists also paginate. Detail views use real reloadable routes. Page controls stay in document flow; bottom navigation retains the keyboard fix.

## Isolated fast-forward verification

Run `npm run test:futsal-season`. It loads real migrations, store and API commands into disposable PGlite PostgreSQL, creates synthetic organizations/people/awards, then completes all four mode/format combinations. Only that local database replaces `futsal_game_now()` with a test clock. Production has no fast-forward setting, endpoint or environment switch. The normal Worker and SQL commands execute every step; receipts, version conflicts, due-time gates, role/tenant isolation, participant redaction/revocation, rollback, immutable history and untouched Hub balances are checked.

The same suite exercises full pure seasons with 2, 3, 4, 5 and 16 entries, byes, replay determinism, equal baselines, point-scale equivalence and growth ceilings. Test output reports each four-team season's completed event and match counts. No production test accounts, seasons, messages or pushes are created.
