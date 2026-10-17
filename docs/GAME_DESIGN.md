# Game design — version 0 proposal

The engagement-to-development relationship and two modes are confirmed. All numbers below are tunable proposals and must be versioned, simulated, and reviewed before a real season.

## Players and training

Use attack, defence, passing, and goalkeeping attributes; overall rating is a derived display, not a separate editable score. Start everyone with equal competitive strength; role distributions can differ only without creating a hidden advantage.

Proposed training: one guaranteed attribute improvement per eligible weekly training, plus a chance of one additional improvement. Example bonus probabilities: 10% basic, 25% one contribution, 40% activity plus strong quiz, maximum 50%. Final improvement size and weekly caps are undecided. Manager-mode bonuses target a limited number of players; Team League bonuses develop the participant's player.

Participation, quiz completion, quiz understanding, and personal improvement can contribute. Define accessible alternative activities and prevent repeat farming. Do not expose a public engagement score as religious merit. Attendance confirmation is server-side and scoped to an activity.

## Simulation

Five active players including goalkeeper. Formation and tactics modify bounded team characteristics. A seeded engine produces chances, goals, and a short event timeline. No claim of realistic physics is needed. Save engine/rules version, seed, lineup and ratings snapshot, tactics, events, and final score. Never use Math.random directly inside domain calculations.

Save training seed/outcome too. Training and fixtures are idempotent scheduled commands, with a safe manual retry. Attribute ranges, bonus ceilings, and eligibility are validated on the server.

## Table and rewards

Proposed points: win 3, draw 1, loss 0. Proposed tie-breakers: points, goal difference, goals scored, then shared placing or an announced playoff. Organizer must pick the final policy before activation. Rewards can recognize league results, improvement, and teamwork; prize decisions are recorded separately, with published criteria. Never require payment to compete or buy stronger players.

## Balance validation

Run reproducible Monte Carlo experiments before the pilot. Measure equal-team symmetry, effect of modest rating gaps, tactic strengths, score distribution, upset probability, and cumulative season runaway. Targets must be chosen and documented before declaring balance acceptable. Confirm an engaged team has an advantage without near-guaranteed wins. Reset season strength by default; trophies and cosmetics can persist.

## Edges requiring explicit rules

Late joins, withdrawn participants, quiz retries and ties, offline check-in, corrected approvals after training, cancelled activities, postponed fixtures, odd team counts/byes, non-divisible season duration, simultaneous team tactic edits, substitutes and participation above five players, disconnected clients, season closure while jobs are pending. Corrections must not silently reroll completed training or fixtures.
