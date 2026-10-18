# Configurable engagement and awards

## Confirmed requirement

Every organization chooses how participants earn points. Activities can be quizzes, attendance, volunteering, custom challenges or any approved activity the organization defines. Authorized staff can award extra points manually for an individual's contributions, without setting up a quiz or even an activity. Manual-only operation is fully supported in both modes and formats.

## Proposed organizer workflow

Create reusable activity types (name, description, points/earning rule, verification method, availability and repeat limits), then schedule occurrences as needed. Sources may be volunteer confirmation, optional attendance check-in, optional quiz scoring, or manual awards. Start with validated fixed awards and bounded staff-entered amounts; avoid arbitrary executable formulas. Add richer rule types only when implemented and validated.

Example organization choices, not defaults:

| Organization | Earning setup |
| --- | --- |
| A | Lecture attendance: 10 points; optional quiz: up to 10 |
| B | Helping prepare events: 15 points; custom volunteering activities |
| C | Volunteer manually enters points each week for each participant |

For a manual award, select the season, participant(s), points and activity/reason. Show the total and cap impact before confirmation. Bulk entry creates a distinct auditable award per recipient with retry protection. No participant can approve or manually award their own points. A volunteer who also participates requires another authorized approver.

## Three distinct concepts

- Engagement points: recorded contributions under organization rules.
- Training benefit: derived from eligible points using the active season's conversion and caps.
- Football competition points: earned from match outcomes or bracket advancement, never directly from an activity award.

The training engine receives normalized eligible points/allocations, not quiz scores or source-specific conditions. Manager mode applies benefits to the participant's squad; shared Team League applies them to their player. Whether points are spent or merely measured per training window is a season rule to resolve, not an implicit assumption.

## Award records and corrections

Each award records organization, season, recipient membership, amount, reason/activity reference (optional for manual awards), source type and source-event ID, occurrence and recording times, actor/system issuer, and earning-rule version where applicable. Distinguish volunteer-visible reasons from participant-safe descriptions; never expose private absence circumstances or sensitive activity details to peers.

Use append-only ledger entries, authorization, transactions, source deduplication and explicit manual-request idempotency keys. Validate participants belong to the selected season/organization and that amounts are within policy. Frequency and aggregate limits must hold under concurrent requests and bulk operations, not just browser validation.

Correct mistakes through linked reversal/adjustment entries with actor and reason, not by overwriting totals or ratings. Define a nonnegative eligibility/balance policy and what happens when already-used points are reversed. Never reroll completed training or matches; late grants and corrections follow the published next-window policy. A completed season requires an explicit audited correction process.

## Season and rule changes

Season activation freezes point-to-training conversion, caps and cutoff policy. Organizers can add activities and manual awards during active seasons within those constraints. Activity earning rules are versioned; edited point values apply to future awards and do not retroactively rewrite history. Make deadlines and available opportunities clear to participants.

## Optional modules

Quizzes may supply normalized awards after server-side scoring, with protected answers and deduplicated attempts. Attendance may supply awards after authorized check-in, with no duplicate grant for the same occurrence. Neither is required to create a season, train players, run fixtures or complete the competition. No built-in Friday schedule, fixed quiz weighting or mandatory category names.

## Acceptance cases

Run all mode/format combinations without a quiz. Two organizations use different activity types and point values without code changes. Manually award one participant, then a group, and retry without double granting. Prevent self-awards and cross-organization awards. Edit an activity rule without changing old entries. Correct an already-consumed award without changing recorded match results. Verify conversion caps for concurrent and backdated awards, and document late-award policy before the pilot.
