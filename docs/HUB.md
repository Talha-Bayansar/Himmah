# Himmah Hub — approved feature direction

Status: approved feature direction. Organizer authentication/workspaces and private member/group management are implemented. Activities now have reusable defaults and group audiences, with separate scheduled sessions, preserved details, Upcoming/Past views and cancellation history. Existing one-off activities become their first sessions. Owner/admin attendance now includes paginated eligible rosters, bulk check-in, retry-safe saves and audited corrections. Points, volunteer assignments, recurring scheduling, draft/publish and connected games remain later milestones. Point values and remaining edge policies require review. The legacy sample-data prototype is internal only.

## Purpose and boundaries

A standalone phone-friendly app for mosque youth engagement and volunteer administration. Hub owns membership, attendance and contributions. Games, starting with Futsal, are separate app experiences that can use eligible contributions through an authorized interface. A mosque needs no game license to use Hub.

## Youth experience

| Screen | Purpose |
| --- | --- |
| Home | Upcoming activities, recent points and brief updates |
| My progress | Personal achievements and progress for a selected period; richer badges/goals later |
| Activities | Eligible activities, details, and registration where enabled |
| My attendance | Own attendance history and correction request |
| My points | Award history with date, points and participant-safe reason |
| Connected apps | Available licensed apps using the same account |

Youth see their own private records. Peer views and optional leaderboards must not expose attendance histories, sensitive notes, guardian details or religious-worth rankings.

## Volunteer experience

Fast roster check-in is the primary workflow. Open an activity occurrence, find an eligible participant and mark attendance; support bulk updates, walk-ins and corrections. Distinguish registration from attendance: registered is a booking state, while present/absent/excused are attendance outcomes. Unmarked must not silently mean absent before finalization.

Optional attendance rules award points after confirmed presence; attendance-only operation is supported. Volunteers can award manual points to one person or a selected group, review approval queues and record correction reasons. Enforce role/group scope, no self-approval, idempotency and concurrent-edit handling on the server. Bulk awards need per-recipient records and a clear summary of failures.

## Organization administration

- Members and groups: invitations, youth/volunteer/admin roles, age or program groups; restricted guardian information.
- Activities: one-off and recurring activities with occurrences, description, time/location, eligibility, optional registration/capacity and reusable templates.
- Earning rules: custom activities, fixed or bounded awards, verification method, availability and repeat limits; optional quiz module later; manual-only supported.
- Engagement periods: independent reporting windows such as autumn or Ramadan, unrelated to football seasons. Closing a period preserves history. Define overlapping-period membership and avoid counting one contribution twice in totals.
- Recognition: organizer-recorded awards initially; badges, shared goals and optional scoped leaderboards later. Spendable rewards redemption is not part of the first release.
- Reporting: attendance trends, activity participation, points, pending approvals and corrections; authorized filtered exports.
- Settings/access: branding, timezone/language preferences, roles, rules and licensed apps. Billing and provider integration later.

## First-release scope

Organization workspaces, accounts/roles/groups; activities and fast volunteer attendance; configurable/manual awards; personal attendance and point history; independent engagement periods and basic reporting; secure contribution interface for Futsal.

Defer automated quizzes, QR self-check-in, full badges/goals, spendable rewards, richer announcements and payment processing. These can follow the core workflows. A manual-only mosque and a mosque tracking attendance without points must both be supported.

## First three screen flows

### Youth Home

Show active workspace, next eligible activity, recent contributions and shortcuts to personal history and licensed apps. Empty state explains how to join an activity; no-game-license state leaves all Hub features available. No public display of absence or quiz results.

### Volunteer Check-in

Select group and activity occurrence → search/mark roster or add eligible walk-in → review changes and any automatic points → save → show confirmed and failed entries. Show a conflict on stale edits rather than silently replacing another volunteer's update. Correction flow records a reason and reconciles linked awards without duplicate points. Poor connectivity must show pending versus confirmed state explicitly; offline operation is not promised for the first release.

### Activity Setup

Enter details, groups, occurrence/recurrence and optional capacity → choose no points, fixed attendance award, approved custom contribution or manual-only handling → preview participant information and volunteer workflow → publish. Editing a recurring series must distinguish future occurrences from completed history. Attendance and award rules remain independently configurable.

## Acceptance criteria

An organization can record attendance and award points without any game season, quiz or game license. A volunteer can check in a roster and award points without editing individual profiles. Retried attendance saves/bulk awards do not duplicate contributions. Corrections leave an audit trail and reconcile linked awards according to published policy. A youth sees their own history; another organization cannot access it. A game uses eligible contributions without changing the original record. Hub continues working if a game entitlement is removed.

## Decisions before a real pilot

Enrollment/guardian process; role/group visibility; exact point policies and caps; absence finalization; correction-request handling; recurrence/timezone changes; walk-in eligibility and registration capacity; engagement period overlap; exports/retention; notifications and accessibility/languages. These are not blockers to sketching the three core flows.

## Detailed design deliverable

See [Screen designs v1](HUB_SCREEN_DESIGNS.md) for Youth Home, Volunteer Check-in and Activity Setup, including permissions, failure states and acceptance criteria. The linked static HTML board is a visual proposal, not a working application.
