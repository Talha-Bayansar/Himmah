# Pre-season settings

Owner-confirmed: organizers can configure a variety of game parameters before starting a season. The catalog below is proposed scope; precise defaults and ranges need validation, not all controls exist yet.

## Settings catalog

| Category | Proposed organizer controls |
| --- | --- |
| Structure | Club Manager or Team League; league or tournament; supported team/entry counts; roster sizes and virtual fillers |
| Calendar | Registration, preparation, start/end, timezone, training cadence, match/round dates and action cutoffs |
| League | Round-robin legs, win/draw/loss points, ordered tie-breakers |
| Tournament | Supported variant, seeding/draw policy, byes, tied-match resolution; optional third-place match if implemented |
| Starting squads | Equal baseline strength, role distribution, supported attribute range, season reset policy |
| Development | Baseline training, activity/quiz weights, bonus chance and size, weekly caps, maximum attributes |
| Quiz | Submission window, attempt limits, completion/score/improvement contribution, late policy |
| Activities | Eligible challenge categories, approval method, frequency limits, alternative contribution paths |
| Management | Available formations/tactics, lineup lock, captain/team decision policy |
| Participation | Entry cutoff, late joins, withdrawal/walkover rules, team assignment and supported substitutions |
| Rewards | Prize descriptions, eligibility, published criteria, organizer award permissions |

## Configuration lifecycle

1. Start from a supported preset, saved organization template or duplicated season.
2. Edit a draft; show plain-language consequences alongside controls.
3. Validate both individual ranges and combined settings on the server.
4. Preview fixtures or bracket, expected duration, training opportunities and rewards.
5. Activate atomically, saving the schema/rules/engine version and settings snapshot.
6. Future template edits affect future drafts only.

Validation must reject impossible calendars, unsupported roster sizes, invalid probability/attribute ranges, incompatible format settings, missing knockout tie resolution and conflicting training cutoffs. Concurrent activation may not create two schedules. A short tournament can have preparation training without training between every round.

## Changes after activation

Competitive rules, baseline ratings and bracket structure are frozen by default. Operational changes such as postponement require permission, reason, audit history and clear participant notice; preserve completed results. Define allowed changes explicitly. Never regenerate a live bracket to make a new setting fit. Duplicating a season is the usual path to different rules.

## Non-configurable boundaries

Tenant isolation, participant privacy, server-side scoring, immutable completed results, no paid player advantages and safeguarding requirements cannot be disabled through season settings. Billing controls belong to platform administration and do not change sporting fairness.
