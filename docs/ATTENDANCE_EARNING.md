# Optional attendance earning rules

Owners/admins can enable an activity default that awards a fixed number of points when attendance is saved as present. It is off by default. Manual awards remain independent; quizzes, periods and game seasons are not required.

## Configuration and snapshots

Activity creation/editing offers an explicit checkbox and a bounded 1–10,000 whole-point amount (implementation limits, not an agreed scoring policy). Zero means attendance-only. Changing the default affects only sessions created afterward, including future sessions; it does not rewrite already-scheduled sessions. Existing activities/sessions migrate to zero, with no historical backfill or automatic grant. Older clients omitting the new field during an activity edit preserve its saved value; an explicit zero disables it for subsequently created sessions.

A new session copies the activity amount and activity version as its earning-rule revision. Session detail, scheduling forms and attendance show the saved rule. Ordinary session edits retain it; a database trigger rejects changes to the amount/revision after insertion. This first rule type is fixed points for present, versioned by the activity configuration revision. Custom formulas, per-day aggregate caps, quizzes and a standalone earning-rule catalog are later work. The one-member/one-session source link is the enforced frequency boundary.

## Preview, confirmation and saving

For a session with a positive rule, the attendance editor first requests a bounded server preview for its selected 1–50 members. The preview shows names, eligibility/stale outcomes and each linked point delta. It has no persistent writes (no attendance, receipt, audit or ledger rows). Changing the status/reason clears the preview. A second explicit **Confirm attendance and points** action saves; correcting existing attendance also requires the shared destructive confirmation and a nonblank staff-only reason. Sessions without a rule retain the attendance-only workflow.

The API and SQL require explicit linked-point confirmation for rule-enabled saves. The server never accepts a client-supplied amount: it uses the immutable session rule. Attendance version checks ensure changes after preview produce a conflict rather than silently overwriting attendance. Source awards cannot be edited through the manual points endpoint, so an unchanged attendance revision cannot acquire a different ledger amount between preview/save. Partial batches report failed members without granting them points; eligible members can still save. Exact request keys/payloads survive uncertain responses and replay their original outcomes without double granting.

Attendance changes, attendance audit, point entries and their receipts are one database transaction. A ledger failure rolls back the attendance save and receipt as well. Writes share the short organization lock used by manual points and period closing, then lock membership/session/person rows. Preview uses the same calculation/validation path with persistence disabled. It briefly takes these locks to make a consistent preview, but does not reserve eligibility after the response.

## Award lifecycle

First saved presence creates an append-only attendance-source award and a unique organization/session/person link to its original entry. Changing present to absent/excused/unmarked appends a reversal; changing back to present appends a restoration against the same original. Net linked points stay zero or the saved session amount. Re-saving the same status does not create points or backfill a missing historical award. Stale or ineligible rows create no attendance/point change. Existing saved attendance remains correctable after archival/audience changes under the existing attendance policy, and its linked points reconcile accordingly.

Entries store source `attendance`, rule revision, organization/member/session/activity, actor, reason and session-start occurrence time. An optional initial staff reason is used when provided; otherwise the saved session name supplies the reason. Corrections retain their required reason. Point history identifies attendance awards and links back to session attendance; manual correction controls are hidden for these entries, and the server rejects bypass attempts with an explicit managed-source outcome. Original entries and adjustments remain immutable. Separate manual extra awards are still possible by deliberate organizer action.

The contribution date is the session start, so existing open engagement reports include attendance points in that date window. Closed period snapshots remain unchanged by later saves/corrections. No game training, match result or rating is modified.

## Permissions, privacy and boundaries

Verified owners/admins manage defaults, preview and save. SQL repeats tenant/role authorization, and source references use composite organization/member/session foreign keys. Volunteers require explicit current attendance scope; see [Volunteer access](VOLUNTEER_ACCESS.md). Historical participant account links prevent self-attendance approval even after disconnection. Reasons and histories are private to authorized staff. The earning feature creates no messages, public leaderboard or offline queue. Participant login is a separate [account-access workflow](PARTICIPANT_ACCESS.md).

Migration `0007_true_bloodstrike` adds activity/session defaults, session rule revisions, point source metadata and `hub_attendance_awards`. Existing point entries retain manual source semantics. It installs the shared preview/save operation, immutable-session-rule guard and manual-correction protection. The current readable definitions remain in `db/migrations/functions/attendance.sql` and `points.sql`; historical migration files are unchanged.

## Scoped volunteer access

Implemented group/activity assignments with independent attendance and manual-award permissions. This supersedes earlier blanket volunteer restrictions in this document. Owner/admin directory management, manual corrections and period reporting remain restricted. See [Volunteer access](VOLUNTEER_ACCESS.md) for scope, audit and revocation behavior.
