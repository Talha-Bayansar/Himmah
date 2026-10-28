# Product specification

## Confirmed scope

Himmah helps mosques and other community organizations manage contacts and their relationships/groups, recurring activities and one-off events, registration, attendance and cash collections. It supports youth programs without restricting the entire product by age. It must work without contact logins, points, rewards or games.

Core staff tasks: find a contact and who to call; register a person; run a session on a phone; record attendance and cash independently; correct errors with history; view weekly/monthly participation and balances. Each organization is isolated. Family ties never confer permissions.

Learning extends activities with manually authored self-paced quizzes/tests and results, then live hosted quizzes. Creation carries activity/session context and audience into Add → format → questions → audience/timing/scoring review → publish → results. Optional reusable questions and reviewed AI drafts follow. Religious content always requires organizer review. Learning scores and live session points have no dependency on reward/engagement points.

Excluded initially: online payments and accounting integrations, Futsal, engagement/reward points, games, face recognition, permanent contact accounts/onboarding and guardian record access. Preserve old code in Git. Staff sign-in and organization access are initial requirements. Do not add payment providers or biometric infrastructure.

## Recommended operating rules

Contacts hold their own optional phone/email; missing details are valid. Communication responsibilities select another contact, purpose, priority and allowed channel; no copying a parent's phone to a child. Family links, documented legal guardianship, routine communication and emergency responsibility are separate facts. Display Family and relationships separately from Who to contact. If no usable contact method exists, show that explicitly.

One-off events are activities with one session. Recurring activities own generated sessions, each with time/location and overrides. Store UTC instants plus IANA timezone and local recurrence definition. Preview daylight-saving transitions; reject ambiguous/nonexistent local times until staff chooses. Changes target one session or future unstarted sessions; completed history never follows changed defaults. Cancellation preserves registrations, attendance and money history and presents any refund work explicitly.

Intended audience defines who may participate; registration reserves participation; expected roster defines the reporting denominator; attendance records what happened. Walk-ins can be registered during check-in subject to eligibility/capacity/override permission. No registration is inferred from attendance. Unmarked stays unknown, including after a session ends. Absence requires an explicit staff mark.

Owner-confirmed in follow-up: activities are free by default, optionally paid with a default price. Sessions inherit free/paid status and price with explicit overrides. Initially charge per registered contact per paid session; whole-program fees are deferred. Published session pricing and registration charge snapshots survive later price edits. Free registrations create no charge and show no cash workflow. Cancellations produce explicit charge adjustment/refund tasks rather than deleting records. A program fee would need a program enrollment charge and coverage/allocation policy; do not fake it as the first session's fee.

Cash is operational tracking: amount/currency, payer (optional contact or staff-entered label), collector, occurrence and recording timestamps. One receipt allocates to multiple same-organization contact charges. Show unpaid/partial/paid/waived and credit/refund-due separately. Waiver is a reasoned charge reduction, never fabricated cash. A collected amount can remain explicitly unallocated; never silently overallocate. Refunds reference the original receipt/allocation. No journal/accounting/tax system is proposed.

## Information architecture and UI acceptance

Recommend `/workspace/$organizationId/people`, `/people/$contactId`, `/groups/$groupId`, `/activities`, `/activities/$activityId/sessions/$sessionId`, `/sessions/$sessionId/check-in`, `/insights`, `/manage`. Final route names are proposals. People contains contacts/groups with relationship sections on contact detail. Activities owns learning and result entry points; a global library can follow. Profile in the header holds language and account settings. Compact organization switcher; phone bottom navigation and wider-screen navigation.

Preserve Himmah leaf branding, forest green/lime/warm canvas and typography. Retain TypeScript, TanStack Start/Router/Query/Form, managed Better Auth pending validation, Neon PostgreSQL/Drizzle, Cloudflare, shadcn/ui, Lucide, EN/NL/TR Paraglide and mobile PWA. No audit finding justifies changing the main stack.

Every detail route reloads independently with authorized metadata. Growing lists/pickers use scoped deterministic cursors, 25 default/50 maximum, infinite scrolling and accessible Load more. Use skeleton page loads, per-action pending spinners, fixed square icon menus, consistent touch targets/spacing, accessible labels, destructive confirmations and keyboard-aware scrollable forms. Separate unauthorized/error/empty/loading states. Clear private caches on sign-out and scope changes. Do not cache private HTML/API/auth or queue writes offline.

## Metric contract (proposed definitions)

Windows use organization timezone, Monday-start weeks and calendar months, converted to half-open UTC ranges. Participation dates use session start; cash uses occurrence date. Exclude cancelled sessions from participation; retain financial transactions. Corrections recompute reports; show generation time and filters. Archived contacts remain in historical counts.

| Metric | Definition |
| --- | --- |
| Attendance count | Number of distinct contact/session records currently marked present in the window. |
| Unique attendees | Distinct verified contact IDs among those present records. |
| First-time / returning | First-time: earliest known present session in this organization falls in the window; returning: present now with earlier recorded presence. This means first recorded, not first-ever mosque visit. |
| Activity trends | Attendance count and distinct contacts grouped by activity and session period, with prior comparable windows. |
| Group trends | Use membership effective at session start; disclose overlapping groups, so group totals are not additive. |
| No recent participation | Active contacts in selected scope with zero recorded presence in a chosen lookback, default 30 days; label missing data, never confirmed disengagement/absence. Show never-recorded separately. |
| Registered versus attended | Confirmed registrations for sessions in the window, present among those registrants, plus walk-in attendance separately; exclude cancelled registrations from denominator. |
| Attendance percentage | Expected contacts marked present / frozen expected contacts for those sessions. Present walk-ins outside that roster are separate. Show unmarked count and denominator; no denominator means no percentage. |
| Amount owed / outstanding | Owed: charge principal minus signed reductions/waivers for selected sessions. Outstanding: sum of positive net charge minus net allocations after refunds. Report credits separately. |
| Cash collected | Gross cash receipts minus actual refunds by cash occurrence window; include unallocated cash separately. Session-attributed allocated receipts are a different report, not identical to cash flow. Never sum currencies. |
| Assessment completion | Submitted valid attempts / assigned eligible recipients for a publication version; anonymous joins are separate and cannot create a contact-based completion rate. |
| Scores / pass rate | Use selected final reviewed attempt per version/contact (recommended best eligible score); pending review excluded and disclosed. Pass rate is passed / graded completed contacts under frozen threshold. |

No universal engagement score or religious-worth ranking. Reports require distinct server permissions and avoid leaking small-group sensitive detail to volunteers or live participants.

## Selected operational defaults

The owner delegated routine permission and attendance choices. Use the selected [permission matrix and roster rules](WORKFLOWS.md): separate scoped attendance/cash grants, administrator-only waivers/refunds, explicit expected rosters frozen at check-in opening (30 minutes before start), audited amendments, and volunteer attendance corrections until 24 hours after session end. Open/drop-in sessions have no percentage unless staff defines an expected roster. These selected defaults supersede earlier tentative wording on these topics.
