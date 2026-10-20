# Futsal season setup

Owner approved the first Futsal increment on 20 October 2026: mode/format selection, dates, participants/teams, equal starting strength, bounded engagement-to-training rules and a review before freezing settings. This is a persistent organizer setup tool, not the playable game. Training execution, virtual player creation, tactics, match simulation, standings, automatic advancement and prize administration remain subsequent milestones.

## App boundary and navigation

Hub → Manage → Connected apps → Himmah Futsal opens a separate `/futsal/:organizationId` app area. Its fixed navigation contains Seasons and Back to Hub; organization/profile/notification controls reuse shared identity. Each new/settings/entries/review screen has an independent, reloadable route and one immediate-parent Back control. Organization switching inside Futsal returns to that organization's Futsal list. Hub's normal daily navigation and PWA `/hub` entry remain unchanged.

The season list initially shows all statuses, so a newly locked setup stays findable; status filters are explicit.

The explicit initial app policy permits verified owners/admins in each organization to manage season setup. Volunteers and participants cannot inspect setup, candidates or assignments. The API checks current membership and SQL repeats owner/admin authorization on every query/command and receipt replay. No app license or billing SDK is introduced; this pilot access policy is independent of a later provider-neutral organization entitlement. Hub works with no Futsal season or payment service. Participant gameplay access will be introduced with the actual game experience, not placeholder youth pages.

## Supported settings and defaults

Numbers are implementation defaults, not owner-confirmed balancing results. Both Club Manager and Team Play (legacy identifier `team_league`) independently support league or single-elimination tournament formats.

- Two to sixteen clubs/teams. Club Manager assigns one Hub participant to a club with five or seven virtual squad places; default seven. Team Play assigns two to five human participants per five-a-side team; default three, with equal virtual fillers planned for remaining places. All entries in a season share the same configuration. No unsupported arbitrary roster sizes are offered.
- Equal initial attribute rating 30–70 (default 50), ceiling 31–99 (default 90), strictly above the initial rating. These are saved setup parameters, not generated player attributes yet.
- Guaranteed growth 1–2, bonus growth 1–2, total growth cap 2–3 per training window; combined growth must fit the cap. Growth applies to one attribute of one player per participant/window, not every squad attribute. Target choice and actual training outcomes are future work.
- Every 1–1,000 eligible Hub points adds 1–10 percentage points of bonus chance, capped at 5–40%; defaults 10 points, 5 percentage points and 30%. `trainingBenefit` previews this pure formula, clamps negative net points to zero and never spends contributions. No quiz, attendance or Friday-specific dependency is introduced. Actual ledger-window allocation and late correction handling are not implemented by setup.
- Local-calendar training and round cadence of 1–14 days (default seven), organization timezone saved at creation, preparation/start/deadline timestamps stored in UTC. Maximum preparation-to-deadline duration is 180 days, with at most 128 planned trainings. Drafts may be saved with old dates, but preparation must still be future at setup locking.
- The first training cutoff is one local hour before the first match. Further preparation cutoffs step backward at the selected cadence, stopping at preparation start. Training can optionally continue between rounds. Same-day tournaments can use preparation-only training; each round still needs its own supported calendar day. There is no same-day multi-round scheduling option in v1.
- League: one or two meetings per pair; win 1–5, draw 0–3, loss 0–1, with win > draw >= loss. Tie order is points, goal difference, goals scored, shared placing. Default 3/1/0.
- Tournament: single elimination, stable saved random draw or chronological entry order, appropriate byes, and penalties as the fixed future tied-match resolution policy. There is no group stage or third-place control. The setup records this policy; penalties and advancement are not executed yet.
- Optional description and prize criteria are saved, but do not issue Hub rewards or choose winners.

Unused mode/format fields are normalized by the API, rather than carrying hidden incompatible controls into the snapshot. Server and database validators enforce supported settings. Calendar preview additionally validates every local slot; ambiguous/nonexistent DST times are rejected instead of shifted. The timezone formatter/offset cache contains only calendar offsets, no account or participant data.

## Drafts and assignment

Create/edit uses TanStack Form and a mobile page, with expandable training/football/prize sections. Invalid combined settings open the advanced sections. Unsaved route changes and abandonment of uncertain requests require confirmation. Unknown network/server outcomes freeze the request and receipt key for exact retries. A stale version never silently overwrites another organizer's settings.

Clubs and teams have names and a paginated participant picker. Existing assignments to another entry in that season are checked, labelled and disabled. Selections/nicknames survive search and page changes. A person may join different seasons, but only one entry per season. Server and SQL verify active organization membership records, roster size, per-season uniqueness and entry limits. Replacing draft members, removing entries and cancelling a season require confirmation; Hub members and points are preserved. Reducing capacity or changing a mode/team size requires removing incompatible draft entries first.

Season, entry and candidate lists use the shared user/org/filter-scoped cursor and infinite-query pattern (25 default, 50 maximum), with loaded-page retention after next-page errors and private-data hiding after authorization loss. Preview is an explicitly bounded aggregate of at most sixteen entries/five people each; its complete roster is required to validate the plan and is not an unbounded Hub directory fetch. The derived schedule is bounded to thirty rounds and 128 training slots.

## Schedule and locking

The pure, versioned `src/domain/futsal-setup.ts` generates circle-method league rounds and seeded knockout brackets. Every pair meets exactly the configured number of times, odd leagues have byes, and knockout byes do not face other byes. Later rounds reference earlier winners; no fictional score or winner is created. The saved season seed stabilizes random draws across reloads and retries. Draft changes may legitimately alter a draft plan; locking prevents any later redraw.

Setup lifecycle is **draft → prepared**, or cancellation with a reason. The UI calls the transition **Lock setup**, deliberately distinct from starting playable matches. The server derives the plan; client-supplied plans are ignored. The database transaction rechecks current role, expected version, active participants, roster completeness and future preparation, then snapshots settings, rules version, seed, roster nicknames and schedule atomically. This phase does not mark a season as an active playable game.

Prepared rules, names, dates, snapshot and roster tables are guarded against updates/deletes. Cancellation preserves a prepared snapshot. Historical snapshots and the locked entry list retain the saved nicknames after later Hub nickname changes. An eventual game activation must separately recheck enrollment and persist engine/training/match state without changing these setup records. There is no unlock, regeneration or automatic match job in this increment.

`futsal-setup-v1` is a setup rules version, not a claim that a balanced match engine exists. Defaults need reproducible balance experiments before the first real playable season.

## Persistence, retries and audits

Drizzle migration `0014_outgoing_retro_girl` adds `futsal_seasons`, `futsal_entries`, `futsal_entry_members`, `futsal_requests` and `futsal_events`. Composite foreign keys enforce organization/season/entry/person scope. The generated migration creates the rules validator before the table check, then installs canonical commands and immutable guards from `db/migrations/functions/futsal.sql`.

All commands lock the organization and current admin membership, then the season. Expected season versions cover roster edits as well as settings. Every command has an actor/payload-bound UUID receipt and append-only audit event; exact retries return the committed identity. Concurrent requests cannot double-create, duplicate assignments or replace a reviewed setup. Any audit/receipt failure rolls back settings, assignments and snapshots together. Reads and mutations use server-authorized organization scope; setup has no public listing, direct total/rating edits or points-writing shortcut.

No Hub ledger entries, wallet balances, push subscriptions, accounts or invitations are written by setup. No new external service is needed. Test only synthetic rosters in local/development environments; do not seed real organizations or create real participant fixtures.
