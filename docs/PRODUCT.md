# Product specification

## Core loop

Activity or Friday lecture → quiz/verified contribution → training allocation → player development → tactics → simulated fixture → table and match report.

## Competition modes

### Club Manager

One participant owns one virtual futsal club. All clubs start with equal total strength. Manager chooses identity, lineup, tactics, and training targets. Their own engagement powers squad development. Proposed roster: five starters and two substitutes.

### Team League

Organizer creates teams and assigns participants. Each participant owns a player identity, not a club-management role. Individual engagement develops their player, contributing to team performance. For four teams of three, proposed lineups add two equally strong virtual teammates per team. Organizer configuration must explicitly validate supported roster sizes; do not pretend arbitrary sizes are implemented.

Shared team tactics need a clear captain/voting rule before implementation. A player should have a useful action even when teammates are absent.

## Organizer capabilities

Create draft seasons with mode, timezone, start/end, registration window, schedule, rules, rewards, and tie-breakers. Assign teams and volunteers. Publish quizzes and activities. Approve contributions. Schedule training and fixtures. Inspect job failures and retry safely. Make audited corrections. Finalize standings and record prize decisions separately from sporting results.

## Participant capabilities

Accept an invite, choose an approved nickname/avatar, see eligible challenges, submit quizzes, see personal confirmation status, train, prepare for matches, view match reports and private league standings. Team League shows teammates' football progress without revealing attendance or private quiz records.

## Season lifecycle

Draft → registration → active → completed → archived. Cancellation is an explicit audited state. Lock rules and baseline rosters at activation. Freeze standings after completion; any correction requires a visible revision and reason. Never silently change a winner by re-simulating a match.

## MVP boundaries

Both modes, invitation access, volunteer controls, quizzes, approvals, training, tactics, match reports, fixtures, standings, and season rewards. No transfer market, chat, public profiles, real-money economy, or live user-controlled football.

## Acceptance examples

A 12-participant Team League can run as four teams of three; each has a valid five-player lineup. A separate Manager season starts with equal-strength clubs. A quiz submission cannot award points twice. A volunteer correction leaves an audit record. A repeated match job returns the existing result. Season dates and reward decisions remain under organizer control.
