> Historical scope: superseded for the rebuild on 28 October 2026 by the [current redesign](redesign/README.md) and [owner brief](redesign/OWNER_BRIEF.md). Retained as prior decisions/implementation reference, not current product requirements.

# Himmah Hub — detailed screen designs v1

Design proposal for review, not implemented application behavior. All names and values in the visual mockup are fictional. [Open the visual design board](designs/hub-screens.html). Approved feature scope remains in [Hub](HUB.md).

## Shared design language

Mobile first, usable at 360px and with text enlarged to 200%. Warm white background, deep teal navigation, lime accents for progress, amber for pending changes. Calm, age-appropriate sports-club energy without childish decoration. No guilt-based streaks, religious-worth scores or compulsory competitive rankings. Organization accent colors may customize decorative elements, but cannot break contrast.

Use system fonts initially; 16px body text, clear headings, 44px minimum interaction targets. Every status has text as well as color. Progress and award animations respect reduced motion. Content can wrap for translated copy; do not assume names, dates or labels fit one line. Prepare logical alignment for future RTL support. Do not promise supported languages before translation work.

Phone: bottom navigation with Home, Activities, Progress, Apps; account/workspace menu in the header. Attendance and points are tabs within personal Progress. Staff switch to a clearly labeled Staff view, whose navigation is Today, Activities, Members, More. Switching roles or workspaces clears scoped content, pending requests and caches. Unsaved work requires Save/Discard/Stay before leaving; do not silently carry one organization's draft into another.

Desktop: left sidebar with the same destinations and organization switcher; constrained main column plus contextual side panel. Keyboard order follows visual reading order. Sticky actions must not obscure focused content, validation messages or the on-screen keyboard.

Proposed route examples: `/o/:slug/home`, `/o/:slug/progress`, `/o/:slug/apps`, `/o/:slug/staff/activities/:occurrence/check-in`, `/o/:slug/staff/activities/new`. Slugs never establish authorization.

## 1. Youth Home

### Purpose and priority

Answer: What's next? How am I doing? What can I join? A participant should understand the page without knowing about game rules or subscriptions.

Top-to-bottom phone layout:

1. Workspace name and account avatar/menu. Explicit organization switch if multiple memberships.
2. Greeting using approved nickname; reporting-period selector such as Autumn program.
3. Personal progress card: period points, contribution count and link to point history. Label points as contributions, not spendable money. Attendance stays private in its own view.
4. Next eligible activity: date/time in organization timezone, title, place, registration state, optional points rule, primary action.
5. Latest contributions: up to three entries with safe description, date, awarded points and status; link to full history.
6. Connected apps card, only when the organization has an accessible app. Futsal shows a shortcut, not a second source of truth for points.
7. Persistent bottom navigation.

### Actions and copy

| Item | Interaction | Result |
| --- | --- | --- |
| Period selector | Choose a Hub engagement period or all history | Refresh scoped aggregates; prevent older response overwriting new selection |
| Activity card | View details | See eligibility, location, time, points explanation and registration action |
| Register | Confirm one eligible occurrence | Show Registered only after server confirmation; repeated request cannot create duplicate bookings |
| Cancel booking | Confirm cancellation | Release reservation under activity policy; never change confirmed attendance retroactively |
| Point entry | View award | Participant-safe reason, amount, date, issuer label and correction trail; never staff notes |
| Attendance entry | Request correction | Choose record and short explanation; show Pending review, with duplicate-open-request prevention |
| Open Futsal | Launch licensed app | Shared sign-in; destination verifies organization membership and app entitlement |

No registration control for activities without registration. Full capacity: show Full and disable booking; no implicit waitlist in v1. Unregistered walk-ins are handled by staff, not unauthorized self-check-in. Display award details as “10 points after confirmed attendance” rather than promising points on registration.

### States

Loading uses stable skeletons; errors do not display zero as if fetched. First visit: “Your contributions will appear here once your volunteer confirms them.” No activities: “There are no upcoming activities yet.” No connected game: omit game promotion and keep Hub complete. Organization without point awards: emphasize next activity and personal participation history; do not introduce mandatory earning rules. Revoked membership: remove private content and return to authorized workspace selection. Partial failure: show independent retry per section and a last-updated label for explicitly cached data.

### Data and permission contract

Only the current member's totals/history and eligible organization activities. Aggregate period values from the canonical ledger once per contribution, including corrections. Never sum overlapping period totals into an all-time balance. Shared-app access does not expose other members' history. Show dates with timezone context on details; store instants in UTC.

### Acceptance

A youth in two mosques cannot see mixed totals. An attendance-only organization has a useful Home. Missing Futsal access does not block activities. Registration retry does not double-book; capacity checks are transactional. A point correction changes personal history without implying a game match has been rerun.

## 2. Volunteer Check-in

### Purpose and layout

Complete a busy activity roster accurately with minimal taps. Opening a check-in requires staff membership and permission for the activity's groups.

1. Header: Staff view, activity title, occurrence date/time and roster revision.
2. State summary: Present / Absent / Excused / Unmarked; registration count is separate.
3. Search nickname or authorized staff display name; filters for group, registration and attendance.
4. Roster rows: safe name, booking state, current saved attendance, large attendance picker.
5. Selection toolbar: choose visible members, then Mark present/absent/excused. “Select visible” never silently selects hidden filtered records.
6. Add walk-in: search existing eligible organization members, then add to occurrence. New-account enrollment is a separate authorized workflow.
7. Sticky footer: unsaved-change count, Review changes button.

Attendance states: unmarked, present, absent, excused. Registration is separate: registered or not registered. Every draft edit shows “Not saved”; it is never indistinguishable from confirmed presence. Default action cannot mark the entire roster absent.

### Save flow

Review panel lists changes and predicted automatic awards, with any cap/eligibility exclusions. Example: “8 attendance changes; up to 60 points across 6 members.” Predictions are provisional; the server revalidates on save. Show this summary even for attendance-only activities (“No automatic points”).

Submit using one stable request ID plus expected per-record revisions. Disable duplicate taps while sending. Server authorizes and transactionally applies each member's attendance and linked award; return per-member outcomes so a bulk save may partially succeed. A single member's attendance and award must not diverge because of a partial transaction. If award is intentionally pending approval, label that state explicitly.

Result: “6 saved, 1 conflict, 1 needs another approver.” Keep successful rows saved; isolate unsaved failures. Retry only unresolved items with correct idempotency/revision handling. For uncertain network outcome, retry/check the same operation ID; do not create a fresh award request blindly.

Conflicts show latest saved state, who last edited if authorized, and the proposed change. Refresh/reapply with an explicit decision; never last-write-wins silently. No offline check-in guarantee: show “Connection lost. Changes are not confirmed.” Keep an in-memory draft while this screen remains open; navigating away warns about loss. Do not persist youth rosters in local storage by default.

### Corrections and finalization

Editing confirmed attendance opens a correction panel: old/new status, required staff reason, participant-safe summary and linked award impact. Attendance changing from present to absent/excused may reverse its linked automatic award; it must not reverse unrelated manual awards. Corrections use linked ledger entries, preserve history and do not reroll games. Already-consumed points follow the published future-adjustment policy.

Finalizing an occurrence requires separate permission and confirmation. Proposed v1 default: unresolved unmarked members remain unmarked; show a warning and permit explicit bulk resolution before closing. Registration alone is not proof of absence. After closure, corrections require the dedicated audited flow, not ordinary roster editing. This default needs owner review before pilot.

Volunteer participating in this event: own row cannot be self-approved or awarded; another authorized approver is required. Adding a walk-in checks membership, group eligibility and any capacity policy. First-release proposal: no silent capacity override; only permitted administrators may use an explicit, audited override if that feature is implemented.

### Manual points companion action

“Give points” opens a sheet for one member or a selected group: amount per person, participant-safe reason, optional activity/Hub period and private staff note only if justified by policy. Never require a game season. Display each recipient, total proposed award and cap impact before submitting. Enforce bounded amounts, permitted scope and no self-award. Each recipient gets an idempotent ledger event; partial failures are individually retryable. Negative amounts are not ordinary grants; mistakes use the correction workflow.

### Acceptance

Present → save → retry gives one automatic award. Two volunteers editing the same row produce a visible conflict. Reversing attendance adjusts only its linked grant. Search/filter bulk selection cannot touch hidden members. A permission change during an open screen blocks unauthorized save. Failure for one member does not disguise successful saves or duplicate them on retry.

## 3. Activity Setup

### Purpose and structure

A short wizard for organization administrators or specifically authorized activity editors. Draft → Preview → Published → Completed/Cancelled. Drafts are visible only to permitted staff.

| Step | Fields and controls | Validation |
| --- | --- | --- |
| Details | Title, description, location, eligible groups | Required title, at least one valid eligible group; no cross-organization IDs |
| Schedule | Date, start/end, organization timezone, one-off/weekly recurrence, recurrence end | End after start; bounded recurrence; explicit handling of ambiguous/nonexistent daylight-saving times |
| Participation | Registration on/off, booking window, optional capacity, walk-in policy | Positive capacity when enabled; registration closes no later than activity start by default; no unsupported waitlist |
| Points | No points / automatic presence award / staff-approved custom contribution / manual awards only | Valid bounded amounts/rule limits and confirmation permissions; no quiz dependency |
| Review | Youth preview, staff summary, occurrence count, points explanation | Revalidate all steps and show blocking errors before publishing |

First proposed recurrence scope: one-off and weekly on selected weekdays until a selected end date, with an implementation-defined safe occurrence cap. Daily/custom calendars are later work unless explicitly added. Dates are generated in the organization timezone so a weekly 18:00 event remains at 18:00 through daylight-saving changes. Exact cap and booking policy remain configurable defaults to approve.

### Points configuration

No points: attendance remains available and creates no award. Automatic presence: fixed amount after an authorized presence confirmation, once per member/occurrence. Custom contribution: organization-defined title/amount/repeat limit plus staff approval; completion is separate from attendance. Manual only: no automatic award; staff use the manual points sheet. These are templates for a generic awarding service, not hard-coded categories of mosque work.

Show conversion separately: “These are Hub contribution points. Each connected game applies its own eligibility and training rules.” Never ask for Futsal settings here. Do not allow paying to increase awards.

### Draft, preview and publish

Use explicit Save draft with a saved timestamp; warn on unsaved navigation. Preserve entered data after validation failure. Preview exactly what eligible youth will see, including timezone, registration status and how points are earned. Publish with a stable operation ID and expected draft revision. Concurrent publish cannot create duplicate occurrences. Permission loss fails with an explanation and keeps no unauthorized server mutation.

Confirmation: “Activity published — 6 occurrences created.” Offer View activity and Open check-in, as permitted. Youth visibility is limited to eligible members, not a public URL.

### Edit/cancel behavior

Editing a recurring activity asks “This occurrence” or “This and future occurrences.” Completed attendance and awards retain their original rule/version. Changing earning amounts applies prospectively, never rewrites awarded points. Changing capacity below existing registrations requires explicit resolution; never drop bookings silently. Changing eligibility must not silently remove historical participation.

Cancellation retains history, prevents new registration/check-in and shows a clear cancelled state. Existing awarded points are not silently erased; any reversal uses an explicit correction policy. First release need not send email/push; display the updated state in-app and tell staff that no external notification was sent.

### Acceptance

Publish an attendance-only event and check in a member with no ledger grant. Publish a manual-only activity without any quiz, game or point rule. Retried publish generates one set of occurrences. Recurrence across a clock change preserves local event time. Invalid configuration returns to the relevant step without losing other fields. Editing a future occurrence does not change completed attendance or previous point amounts.

## Shared component and state inventory

Workspace switcher; role-view switch; activity card; points history row; period selector; safe member row; attendance picker; bulk selection toolbar; status badge; review sheet; field error summary; stale-edit conflict panel; empty/error/loading blocks; sticky action footer. Focus enters dialogs at the heading and returns to the triggering control. Inline errors link from a top summary; save outcomes are announced through an accessible live region. Never rely on toasts alone for save failures.

## Handoff and implementation order

1. Review the design board and resolve branding/labels and proposed check-in finalization defaults.
2. Implement a fictional-data prototype of these three flows, clearly labeled sample data, including no-points and manual-only variants.
3. Add persisted authorization, records and idempotent services after the schema/API contract is reviewed.
4. Verify phone/desktop layout, keyboard/zoom, poor connection, conflicting staff edits, self-approval blocks and two-organization isolation.

Out of scope for this deliverable: runnable UI, login provider selection, new infrastructure, billing, automated quizzes, QR attendance and working game integrations. The HTML board is a local static design artifact; buttons illustrate placement only.
