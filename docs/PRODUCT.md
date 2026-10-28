> Historical scope: superseded for the rebuild on 28 October 2026 by the [current redesign](redesign/README.md) and [owner brief](redesign/OWNER_BRIEF.md). Retained as prior decisions/implementation reference, not current product requirements.

# Product specification

## Core loop

Organization-defined activity or manual contribution → authorized engagement award → configurable training allocation → player development → tactics → simulated fixture → table and match report. Quizzes and attendance are optional sources; a manual-only organization must be fully supported.

## Competition modes

### Club Manager

One participant owns one virtual futsal club. All clubs start with equal total strength. Manager chooses identity, lineup, tactics, and training targets. Their own engagement powers squad development. Proposed roster: five starters and two substitutes.

### Team League

Organizer creates teams and assigns participants. Each participant owns a player identity, not a club-management role. Individual engagement develops their player, contributing to team performance. For four teams of three, proposed lineups add two equally strong virtual teammates per team. Organizer configuration must explicitly validate supported roster sizes; do not pretend arbitrary sizes are implemented.

Shared team tactics need a clear captain/voting rule before implementation. A player should have a useful action even when teammates are absent.

## Formats — independent of mode

Both modes support league seasons and tournaments. The organizer selects mode and format separately, creating four supported combinations. League uses fixtures and standings; tournament uses rounds, brackets, advancement and a final winner. “Team League” is a legacy mode name, not a format limitation.

Proposed first tournament: single elimination, organizer-chosen draw/seeding, byes for non-power-of-two entry counts, and a fixed draw-resolution policy (for example penalties). Group stage plus knockout is a possible extension, not yet a committed initial variant. Decide supported variants explicitly before implementation.

The engagement/training loop applies to either format. A short tournament can use a preparation window followed by fixed round cutoffs; do not require weekly training between same-day matches. Show the training/calendar consequences before activation.

## Organizer capabilities

Create draft seasons with mode, format, timezone, start/end, registration window, schedule, rules, rewards, and tie-breakers or knockout draw resolution. Use the validated settings builder described in Season settings (historical; retained in Git). Preview fixtures/brackets and training opportunities before activation. Save reusable organization templates and duplicate previous seasons into editable drafts. Assign teams and volunteers. Create custom activities and earning rules, optionally enable attendance or quizzes, approve contributions, and award points manually to individuals or selected groups with individual ledger entries. Schedule training and fixtures. Inspect job failures and retry safely. Make audited corrections. Finalize standings and record prize decisions separately from sporting results.

## Participant capabilities

Accept an invite, choose an approved nickname/avatar, see organization-defined opportunities, optionally submit quizzes when enabled, see personal award/confirmation status, train, prepare for matches, view match reports and private league standings. Team League shows teammates' football progress without revealing attendance or private quiz records.

## Season lifecycle

Draft → registration → active → completed → archived. Cancellation is an explicit audited state. Lock rules and baseline rosters at activation. Freeze standings after completion; any correction requires a visible revision and reason. Never silently change a winner by re-simulating a match.

## MVP boundaries

Both modes with league and tournament formats, pre-season settings, organization-scoped membership and administration, invitation access, volunteer controls, configurable activities and manual awards, optional quiz/attendance sources, approvals, training, tactics, match reports, fixtures/brackets, standings, and season rewards. Billing activation is a later milestone. No transfer market, chat, public profiles, real-money economy, or live user-controlled football.

## Acceptance examples

A 12-participant Team League can run as four teams of three; each has a valid five-player lineup. A separate Manager season starts with equal-strength clubs. A quiz submission cannot award points twice. A volunteer correction leaves an audit record. A repeated match job returns the existing result. Season dates and reward decisions remain under organizer control.

## Organization workspaces and later commercial use

Each mosque/organization runs its own participants, staff, branding, activities, quizzes, seasons, settings templates and rewards. A person can hold separate memberships in more than one organization, with explicit workspace switching and no shared youth progress by default. Roles are workspace-specific. A platform administrator is separate from an organization administrator; support access must be explicit and audited.

Future plans may limit seats, active seasons or features at the organization level. Billing must never sell player strength or expose payment flows to children. Exact plans, free/trial behavior and provider selection remain open. See [Platform architecture](PLATFORM.md).

## Additional acceptance examples

Each of the two modes can run a league or tournament. A six-entry knockout creates appropriate byes and exactly one final champion, with no replay on job retry. Invalid date/training/rating settings block activation with useful errors. Editing an organization template cannot alter an active season. A volunteer in mosque A cannot inspect mosque B by guessing a season, job or export ID. Future payment status changes affect only the subscribed organization and cannot modify ratings or historical results.

## Organization-defined earning system

See Engagement system (historical; retained in Git). Configure activity names, points, verification, repeat limits and availability, or award points manually without creating an activity. All sources feed the same audited ledger and capped season conversion rules. Engagement points improve training; they do not directly add football league-table points. A season with no quizzes, and a season with manual awards only, must both complete in either mode/format.
