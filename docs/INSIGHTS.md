# Organization Insights

Insights is the owner/admin reporting destination in the main navigation, at `/workspace/$organizationId/insights`. It follows the shared design system: a short overview, compact metric cards, a participation chart with accessible numeric details, session balances and a divided activity list. Date/activity/group filters and definitions are disclosures; long activity/group choices use searchable paginated sheets. The default is the current calendar month through today in the organization's timezone. Filter changes apply explicitly and are stored in the URL. Date ranges are inclusive, valid calendar dates, up to 366 days; queries convert them to half-open timezone-aware instants. Trend buckets are Monday-start weeks or calendar months, including zero periods. Dates and amounts are localized in English, Dutch and Turkish.

## Access and data boundaries

Reporting is an organization-wide owner/admin capability. Attendance/collection assignments do not grant organization Insights. The API checks verified identity and current membership on every read; the SQL itself independently verifies the owner/admin role and tenant. Activity/group IDs must belong to the current organization. Filter/picker cursors bind user, organization, filters and list kind. GET requests are rate limited, responses are no-store, and authenticated reports never enter the public PWA cache. Known permission loss clears report/option caches and the open picker, then requires an explicit retry. Unavailable filter selections remain recoverable by clearing/changing the filters.

Reports aggregate existing records in one SQL statement/snapshot; they do not write attendance, financial records or inferred absence. The overview/trend is returned on the first page; activity rows use stable creation timestamp/ID pagination, 25 default and 50 maximum. Subsequent activity pages do not duplicate/recalculate the displayed overview. Query keys include user, organization and every applied filter. Refresh recomputes current recorded data; the report displays its generation time and timezone. Active filter names remain visible outside the filter disclosure.

## Metric definitions

| Metric | Definition |
| --- | --- |
| Started sessions | Non-cancelled sessions whose start falls in the selected dates and is no later than report generation. Group selection includes sessions addressed to that group or with recorded group attendance/confirmed registration. |
| Attendances | Current present contact/session rows in those sessions; the same person attending twice contributes two. |
| Unique attendees | Distinct contact IDs among those present records. Archived contacts remain included in recorded history. |
| First recorded | Unique attendees whose earliest currently recorded presence anywhere in this organization falls within the window. It means first recorded attendance, not first-ever visit or newly created contact. |
| Returning | Unique attendees with an earlier currently recorded presence in this organization, even when that earlier activity is outside the selected activity filter. First plus returning equals unique attendees. |
| Previous period | Attendances during the immediately preceding equal number of local calendar days, with the same activity/group filters. The exact comparison dates are shown. |
| Registered attendance | Present rows with a currently confirmed reservation for the same contact/session. The report also gives total confirmed reservations and walk-in present rows separately. No percentage or absence is inferred. |
| Group cohort | Membership effective at each session's start, using valid-from/valid-to history. Ended membership and archived contacts/groups remain reportable. `EXISTS` predicates avoid counting multiple memberships twice. Group totals overlap and must not be added. |
| Charged | Actual immutable principal charges for sessions starting in the selected window, including cancelled/future sessions and contacts no longer present. This is recorded debt, not an inferred fee for every attendee. |
| Recorded paid / outstanding | Current active allocations on those charges, with receipt reversals and contact-specific corrections excluded. Outstanding is principal minus active allocations. All current money is EUR, enforced by the source schema. |
| Cash by receipt date | Effective recorded receipts whose occurrence date lies in the selected window, independent of session dates and participation cancellation. Reversed receipts are excluded; per-contact corrections reduce their original receipt totals. This is recorded cash tracking, not a bank balance or physical-refund report. |
| Group cash | With a group filter, only active receipt allocations attributable to the historical session group cohort are counted. Unallocated cash is not assigned to a group. |
| Unallocated cash | With no group filter, the still-unallocated part of receipts in the cash occurrence window. Positive amounts remain visible. Correcting a contact's allocation reduces effective recorded cash without changing original unallocated cash. |

Corrections recompute both current and prior reports; these are live views rather than frozen accounting statements. Cashflow is separated from session balances so a late payment is not counted as newly charged debt or assigned to the wrong session. Learning and exports remain separate increments from this attendance/payment reporting release.

## Implementation and evidence

The report uses `src/server/insights-store.ts` and `insights-api.ts`, existing indexes and installed financial correction helpers. No schema migration or historical data rewrite is required. SQL tests cover tenant/role isolation, timezone/DST boundaries, first/returning classification, archived contacts, overlapping/ended groups, registration/walk-ins, cancelled and future sessions, cash outside session windows, unallocated money, reversals/corrections and filter-bound cursors. Query plans are reviewed against disposable fixtures, not claimed as a production-scale benchmark. Current execution/deployment evidence is in [infrastructure history](INFRASTRUCTURE.md).
