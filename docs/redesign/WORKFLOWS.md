# Workflows and permissions

All actions below require current organization membership/capability checks on the server, including receipt retries. Relationship records never grant access. The owner delegated selection of logical starting permissions and attendance rules on 28 October 2026. The defaults below are selected under that delegation, not individually owner-specified requirements. Future learning/live policies remain proposals unless explicitly selected.

| Flow | Steps and failure/correction handling |
| --- | --- |
| Staff entry | Sign in/verify → load bounded organization memberships → choose organization → scoped navigation. Expired/revoked access clears private views; no contact account is created. |
| Contact setup | Search for duplicates → create contact with optional direct details → assign multiple groups → add family role/inverse → separately set communication/emergency/guardian facts → inspect Who to contact. Allow identical names; warn rather than merge automatically. |
| Relationship | Select two same-org contacts → choose directional or reciprocal type → preview inverse → save once atomically. End-date/correct with history; changing role definitions cannot rewrite past assertions. Reject self-links and duplicate active edges. |
| Contact routing | Prefer usable direct contact method, otherwise ranked active communication assignments for the requested purpose; emergency uses emergency assignments only. Display multiple equal priorities and missing channels for staff resolution. Do not infer legal authority from routing. |
| Program/event setup | Create activity → intended groups/contacts/all → one session or bounded recurrence preview → timezone/location/price overrides → registration rules/capacity → publish. Review affected future sessions before series changes. |
| Registration | Staff selects eligible contact → check capacity under lock → confirm registration and snapshot session charge atomically → optional expected-roster inclusion. Retry returns same result; concurrent last-place registrations cannot both succeed. Cancellation retains history and explicitly handles charge reduction/refund due. |
| Session day | Open session → expected/registered roster with search/status/balance → mark present/absent/excused or undo to unmarked → cash button prefilled with outstanding amount → choose allocations (including siblings) → confirm receipt. Attendance save and cash receipt have separate pending/success/error states. Payment failure cannot erase attendance; attendance failure cannot fabricate receipt. |
| Cash correction | Show receipt and allocations → authorized refund or reasoned reversal/replacement → check refundable amount under lock → append history and update balances transactionally. Retry cannot double collect/refund; stale balance shows conflict and current value. |
| Attendance correction | Open saved mark/history → change with expected version and reason → confirm → append before/after actor/time/reason. Conflict requires reloading/reapplying. Bulk returns per-contact outcomes; preserve failed items for explicit retry. |
| Insights | Select weekly/monthly window, group/activity → server aggregates authorized scope → show denominator, unmarked and data freshness → optional privileged export later. |
| Self-paced authoring | Within activity/session choose quiz/test → add manual questions → scoring/answer keys/review rubric → inherited audience with explicit overrides → availability/attempt limits/pass/result visibility → review → publish immutable version. Reusable/AI questions copy into draft; AI never publishes. |
| Self-paced attempt | Organizer issues expiring credential to approved recipient → server validates availability, audience/optional attendance and attempts → create pinned-version attempt → autosave answers → idempotent submit → automatic scoring and/or reviewer queue → release results under publication policy. Expiry/revocation denies further writes. |
| Live hosting | Choose published quiz → host opens room → participants submit nickname with code/link → host approves and optionally confirms contact link → start question → server accepts one response before deadline → close/reveal → publish scoped leaderboard → next question → finish and save results. Host can pause before next question; active deadline changes require explicit versioned room event. |
| Live reconnect | Possession token restores same approved participant and server state/event sequence; fetch missing events/snapshot. Duplicate answers return original receipt; conflicting second answer rejected. Host reconnect restores authoritative room; no clock rerun or score reroll. |

## Selected starting permissions

Use three staff role presets: owner, administrator and volunteer. Scope volunteer grants to an activity or named sessions, optionally restricted to groups. A group restriction intersects session access; it never grants access to unrelated sessions. No custom role builder is required initially.

| Action | Owner | Administrator | Volunteer |
| --- | --- | --- | --- |
| Transfer ownership, appoint/remove administrators | Yes; retain at least one owner | No | No |
| Organization settings, invite/revoke volunteers and assign operational grants | Yes | Yes | No |
| Create/edit/archive contacts, methods, relationships, groups and restricted guardianship assertions | Yes | Yes | No |
| Create/publish/edit/cancel activities and sessions; configure prices/capacity | Yes | Yes | No |
| Registration and expected-roster changes | Yes | Yes | Assigned-session check-in grant permits registering existing eligible contacts as walk-ins within capacity; no cancellation, eligibility or capacity override |
| Attendance read/write and history | Yes | Yes | Assigned contacts/sessions only; correction window below |
| Cash balances and receipt collection/allocation | Yes | Yes | Separate explicit collection grant; within assigned session/contact scope |
| Refund, waiver, price adjustment, finalized receipt correction/reallocation | Yes | Yes | No |
| Organization insights and financial reports | Yes | Yes | Session operational counts only; collection totals only with collection grant |
| Staff data export/bulk extraction | Separate future capability | Separate future capability | No |

Owner/admin access does not bypass tenant boundaries. A volunteer has no organization-wide contact search or family graph. Session views expose names and relevant group labels plus a deliberate Who to contact action for operational communication. That action shows the selected responsible contact's name, role and usable channel; emergency details appear only in the emergency-contact view. Never expose guardianship evidence, unrestricted notes, unrelated relatives or another person's activity history. Audit access to restricted contact details without copying their values into logs.

A cash collector can allocate a single receipt across siblings only when every target charge is within their grant. Otherwise an administrator records the combined payment; do not reveal hidden sibling charges as a shortcut. No cash balance/status appears to attendance-only volunteers. Staff can hold attendance and collection grants together for a combined day-of interface.

Learning author/reviewer/host capabilities will be scoped to activities when learning is built. No volunteer acquires those privileges from attendance or cash grants. Temporary learners/live participants receive only their own attempt/room capability; contact links never grant staff or family access.

## Selected expected-roster and attendance defaults

- Registration-required sessions: confirmed registrations form the expected roster. Do not count the whole intended audience as expected.
- Open/drop-in sessions: no expected denominator by default. Staff can explicitly create an expected roster from selected contacts/groups when that matches the activity. Audience eligibility alone never implies expected attendance.
- Freeze the initial expected roster when check-in opens, default 30 minutes before the session starts. Earlier registration closure does not freeze it; confirmed changes before check-in update the draft roster. Store the freeze and subsequent change history.
- Later confirmed registrations and cancellations update expected membership explicitly in the same registration operation, with actor/time/reason. Group changes never update a frozen roster automatically. A walk-in is recorded as such and enters the amended expected roster only through explicit registration or staff inclusion, never from a present mark alone. Reports show the amended denominator, late additions/removals and present walk-ins outside it; original roster remains inspectable.
- Attendance states are unmarked, present, absent and excused. No automatic absence at closing. Excused remains part of the raw expected denominator, with a separate count; do not silently improve percentages by excluding it.
- Check-in volunteers may make initial marks and reasoned corrections in their current scope until 24 hours after session end. Every saved-state change requires a reason and version check; destructive reversals require confirmation. After that, administrators make corrections. Initial unknown-to-mark saves are audited without requiring a reason field.
- Administrators may reopen or correct historical attendance with a reason; cancelled sessions are read-only unless an administrator explicitly reopens attendance with recorded justification. Cancellation itself never wipes attendance or finances.
- Capacity and eligibility overrides, cancellation fee decisions, charge changes/refunds and directory creation remain administrator actions. Registering an existing contact at check-in is one explicit action; free/paid status determines whether it creates a charge. No unpaid balance blocks attendance automatically.

Acceptance examples: an open lecture with 20 present and no expected roster shows 20 attendees and no attendance percentage; a registered session with 20 expected, 15 present, 2 absent, 1 excused and 2 unmarked shows 75% attendance plus those status counts. An extra present walk-in outside that roster is shown separately, not as 16/20. Adding that person explicitly to expected membership yields 16/21 with the roster amendment disclosed.

## Live authority and privacy details

Recommend a single authoritative room coordinator with persisted ordered events/checkpoints, question version, server open/deadline timestamps and scoring version. Server receipt time decides lateness; client countdown is cosmetic. Proposed speed formula: correct answer earns base plus a bounded bonus proportional to remaining server time, clamped to [0, duration]; incorrect/time-expired earns zero. Freeze weights, tie rules and latency/accessibility policy before start. Use score then cumulative accepted response time then stable join order for deterministic ties. This is a recommendation to validate, not a mandated balance.

Store unique `(room, question, participant)` responses and replay receipts; serialize close/answer races. Tokens are high-entropy, hashed at rest, room/participant-scoped, expiring and revocable; join codes are short-lived discovery only, rate-limited, not identity credentials. Bound room capacity and joining attempts; rotate/close codes, reject impersonation and allow removal. Do not accept client contact IDs as proof. On lost coordinator state, restore committed events; pause/void an uncertain question rather than score from client clocks. Persist before acknowledging responses. Validate the chosen coordinator's recovery guarantees in phase 5.

Default public room leaderboard uses approved nicknames only, no contact names/IDs, family data or attendance. Participants see own detailed answers/results; host sees permitted room detail. Organizations can hide ranking or show top entries only. Do not publish a leaderboard to a globally accessible URL by default. Revocation removes future access; retention/erasure policy governs stored room identities.
