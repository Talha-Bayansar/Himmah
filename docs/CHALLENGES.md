# Configurable engagement challenges

Organizations define optional challenges independently of attendance, quizzes, reward spending and Futsal seasons. Examples are authored by the organization; the platform does not prescribe religious obligations or assess religious worth. No uploads, public rankings, automatic quizzes or private messaging are introduced.

## Discovery and lifecycle

Owners/admins open **Activities → Challenges**. Volunteers retain their current Activities/People navigation; attendance/manual-award grants do not grant challenge management or review permission. Participants have Progress, Challenges, Rewards and Coupons in daily navigation; Profile remains in the header. Real challenge and submission detail URLs reload independently, with one Back to the parent. All growing catalogues, submissions and candidate/group pickers use scoped cursor pages, search, infinite/load-more/retry patterns and authorization-loss hiding. The PWA still starts at `/hub`.

Create a draft with a name (2–80 characters), instructions (1–2,000), fixed whole points (1–10,000), optional opening/deadline and either everyone or up to 50 eligible groups. These numerical bounds are implementation defaults. Dates are entered in the saved organization timezone and stored as UTC; ambiguous/nonexistent DST times are rejected. Either bound may be omitted. The deadline is exclusive. Publishing makes the challenge visible and freezes its instructions, points, dates and target group IDs. Group membership remains current: a published group challenge is available only to active members of a current, active target group. A challenge cannot be published after its deadline. Upcoming challenges can be viewed but not submitted early.

Archive stops new submissions and direct completions, preserving pending review and all histories. There is no restore/delete or editing of published rules in this version; create a new challenge for a different opportunity. SQL guards enforce frozen rules/audiences as well as API checks.

## Participant completion and staff review

A verified, actively linked participant can submit only for themselves while a published challenge is open and they are eligible. The server derives the person from their account and snapshots the challenge version, points, nickname, submission note and contribution time. A short optional completion note is visible only to authorized organizers and its author. Advise against sensitive/private information. There are no proof uploads.

Each person has one completion record per challenge. Pending submissions can be withdrawn with confirmation, without awarding points. Rejected/withdrawn submissions can be resubmitted while open and currently eligible; every transition is audited. Approval is final and cannot be resubmitted even after a point correction. Feedback is participant-visible, so reviewers must use respectful, appropriate language; it is required when asking for another attempt. There is no peer submission access or staff identity/reason exposure through participant APIs.

Owners/admins review pending submissions and explicitly confirm approval or rejection. A submitted eligibility snapshot is honored after group membership changes, a deadline or challenge archival; an archived person cannot receive a new award. Historical account links block reviewing or directly awarding one's own completion, including after disconnection and a later staff role. Another organizer is required. Staff may reject an archived member's pending submission to resolve it.

Owners/admins can also record an eligible person's completion directly while the challenge is open, with a required participant-visible note and confirmation. The picker excludes pending/approved records and historical self-links, retains current candidate versions, and is cursor-paginated. Direct recording uses the current server time as contribution time; there is no backdated direct-completion workflow in this increment. Previously rejected/withdrawn records can be directly approved only with the expected version.

## Ledger, privacy and integrity

Approval/direct recording atomically creates one `source=challenge` ledger entry and marks the completion approved. Review time and actor are separate from contribution time. Organization serialization, expected versions, one-record-per-person constraints and immutable receipt keys prevent races, duplicate points and contradictory final outcomes. A failed audit or ledger write rolls the entire decision back. Engagement earned totals, reports and the reward wallet use existing ledger sums; no redemption mutation or game credit is issued by a challenge approval.

Owners/admins correct challenge awards through the member's existing point history with a reason, expected ledger revision and confirmation. Adjustments preserve source, rule version and original contribution time. A correction changes the earned balance and current points shown on the completion without reopening it. Closed engagement-period snapshots remain unchanged.

Separate actor-bound UUID receipts cover entity edits, submissions, withdrawal and review. Exact retries return the committed result; different actors/payloads conflict. Current identity/role is checked before replay. Uncertain responses freeze the exact request/UUID and reviewed versions; forms warn before abandoning and never queue private mutations offline. Known permission errors hide loaded private content. Codes, uploads, third-party services and new credentials are not needed.

Migration `0012_ordinary_praxagora` creates challenges, frozen audience links, submissions, immutable events and immutable receipts; it extends ledger sources and preserves challenge source/rule version on manual corrections. Canonical functions are `db/migrations/functions/challenges.sql` and `points.sql`. Participant/staff APIs are separate and verify session, email, organization, role and current linked identity. Worker CSRF, JSON, rate limits and private no-store boundaries are preserved.
