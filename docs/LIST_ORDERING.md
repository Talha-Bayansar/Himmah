# List ordering audit — 9 November 2026

Owner requested a review of every existing list/view, changing arbitrary ordering while preserving useful existing orders. Reviewed the application stores, SQL-backed previews, selectors, local finite choices and the current component gallery. Ordering is applied before SQL pagination; sorting a loaded page alone would produce an incorrect directory.

| List/view family | Final order | Decision and purpose |
| --- | --- | --- |
| Organizations and switcher | Name A–Z | Changed from creation time; find a workspace by its name. |
| Contacts and contact selectors | Display name A–Z | Changed; shared by directory, relationship/responsibility selection, group membership choices and learning recipient choices. |
| Groups and group selectors | Name A–Z | Changed; consistent in directories, activity audiences and reporting/export filters. |
| Current group members, contact groups and family relationships | Person/group name A–Z | Changed; active collections are working directories. History-enabled collections retain newest-record-first. |
| Staff directory and staff assignment choices | Current resolved staff name A–Z | Changed, retaining current managed-profile name and stored-name fallback. IDs are never display names. |
| Staff grants and invitations | Newest grant/invitation first | Kept; these management lists expose recently issued access. Their audit histories stay newest-event-first. |
| Activities | Name A–Z | Changed; activity names are reusable categories, independent of creation time. |
| Home upcoming preview and full Upcoming agenda | Start time ascending | Kept; current sessions remain included until they end, followed by the next sessions. |
| Full Recently finished agenda | End time descending | Added; latest finished session first across activities, including archived activity history where currently authorized. Cancelled sessions are excluded. |
| Activity-specific sessions | Upcoming start ascending / past start descending | Kept; current chronological planning/history is already useful. Recurrence reviews retain series position/date order. |
| Present attendance and all-contact check-in/add lists | Person name A–Z | Changed; staff can scan the roster reliably. Present/disabled and payment state do not move a person between positions. |
| Previous-attendee check-in suggestions | Most recent accessible attended session first | Kept; recency is the purpose of this view. Contact ID breaks equal-time ties. |
| Registrations, expected rosters and registration choices | Person name A–Z | Changed; registration event history remains newest-event-first. |
| Cash balances and allocation candidates | Person name A–Z | Changed; these are working participant lists. Receipt/correction history remains newest-record-first, including backdated receipt context. |
| Insights activity breakdown and activity/group selectors | Activity/group name A–Z | Changed; the activity's creation date has no reporting meaning. Trend series remain chronological, with score distributions ascending by score. |
| Participation follow-up | Oldest recorded last visit first; newest added first for no-recorded-visit view | Kept; the first identifies longest gaps and the second highlights recently added people. Neither infers absence. |
| Learning item catalog | Newest created first | Kept; authoring starts with recently created work. Search/context filters remain available. |
| Learning participant/result directories | Participant name A–Z | Changed; attempts remain latest sequence first, publications latest version first and question/answer order stays author-defined. |
| Learning context choices | Activities/contacts by name; sessions by actual start date descending | Changed; session creation date is replaced by its meaningful scheduled date. Historical context remains available. |
| Live quiz rooms / lobby | Newest room / newest join first | Kept; hosts need the current room and newest arrivals. Participant numbers and quiz phase/question order remain authoritative. |
| Contact methods | Preferred first, then kind/value | Changed; primary details precede alternatives. Who-to-contact keeps explicit purpose/priority/usability rules; equal-priority summary candidates now use name order rather than UUID order. Responsibility-management records retain newest assignment first. |
| Contact/group/access/attendance/registration/cash histories | Newest recorded event first | Kept; histories answer what changed most recently. |
| Notifications | Newest currently relevant notice first | Kept; queue priority is separate from inbox order. |
| Custom contact fields, wizard steps, answer choices, finite filters and management actions | Defined/form/workflow order | Kept; these are curated sequences, not entity directories. Timezone search keeps the current selection first, then the existing IANA choice order. |
| CSV rows | Contacts by name; operational reports by their existing chronological source key | Contacts changed; report chronology kept. Contact creation dates remain factual output fields. |

## Pagination and integrity

The shared server name-order helper uses one case-insensitive database key with a stable ID tie-breaker in the predicate and ORDER BY. The response carries that key for the opaque scoped cursor while preserving the actual created date. Cursor input remains bounded and actor/organization/collection/filter-bound; malformed keys and legacy timestamp-only cursors are rejected for newly alphabetical lists. Refresh a list after a rename or deployment. Histories and chronological suggestions retain timestamp cursors. This is a consistent database order, not a promise of language-specific dictionary collation.

Additive indexes support the main tenant contact/group name directories. No contact, group, session, registration, payment, learning or access record is rewritten by this ordering change. Reference list states, selection limits, greyed-out assigned contacts and permission filters remain unchanged. Existing sign-out/scope-loss clearing remains in force.

## Sessions and start reminders

The existing `/workspace/$organizationId/schedule` route now has URL-backed Upcoming / Recently finished tabs with separate query/cursor scopes and the same search, manual Load more and refresh controls. Home retains its bounded upcoming preview and adds a Recently finished shortcut. Past rows open attendance directly when staff can record it; otherwise they open session details. See [Insights/navigation](INSIGHTS.md) and [personal reminders](SESSION_FOLLOWING.md).

Tests exercise more than two pages of names, case-insensitive/equal-name ordering, current audience/tenant scope, recent-session order and cursor separation. The agenda browser harness runs through Worker dispatch plus disposable SQL, verifies reload/search/direct attendance and captures 16 translated/responsive states. The infrastructure record identifies the exact executed suites, migration digest and deployed release.
