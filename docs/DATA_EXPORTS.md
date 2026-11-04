# Data exports

Owner-approved increment after contact import. Owners/admins can explicitly download CSV from Manage → Data exports. Contacts → More carries the current contact search/state; Insights → More carries the applied reporting dates/activity/group/bucket; session management → More opens the whole-session scope. No main navigation destination is added. Filters live in the URL and reload independently. Opening a page resolves authorized context names only: it never generates a file automatically.

## Reports and definitions

| Report | Rows and filters |
| --- | --- |
| Contacts | One contact per row, active/archived/all state, literal name search and current group membership. Includes names, contact ID, creation time, active membership count and one primary active email/phone: preferred, otherwise earliest creation/ID. Other methods/relationships are not represented by these primary-detail columns. |
| Attendance | Current present contact/session rows for started, non-cancelled sessions in the organization-local inclusive date range. Archived contacts remain in history. Includes actual recorded charge/paid/outstanding values; absent/unmarked people are never inferred. |
| Session balances | Actual principal charges for sessions starting in the range, including future/cancelled sessions and people no longer present. Effective allocations exclude receipt reversals/contact corrections. Group filtering uses the same historical cohort/session selection as Insights. |
| Recorded cash | Effective receipts by cash occurrence date, independently of session dates. Reversals are excluded; contact-specific corrections reduce effective amounts. Group selection includes only that historical cohort's active allocations; unallocated cash is blank because it has no group. No physical-refund/bank balance is inferred. |
| Insights overview | Current raw metrics and amounts from the existing Insights statement. Definitions and comparison semantics remain in [Insights](INSIGHTS.md). |
| Participation trend | Monday-start weekly or calendar-month period rows from the same report, including zero periods. |
| Activity totals | All matching activity totals in the report snapshot, beyond the browser's currently loaded page. |

Activity/group pickers reuse the shared paginated Insights picker and SearchField. Date windows are real calendar dates, inclusive in organization timezone, up to 366 days. Session start and receipt date are separate filters. Financial/attendance historical cohorts evaluate membership at the session start; contact directories use current membership. Archived activities/groups remain selectable for historical reporting.

Whole-session scope is available from management for attendance/balances/cash. It includes the whole selected session and its recorded receipts regardless of the date controls, which are hidden. Retained cancelled/future presence is included in that exact session's roster. An explicit cancelled column, session identifiers, UTC start and local start/timezone preserve context. Clearing this scope returns to normal date filtering. Global attendance/Insights retain their started/non-cancelled definition.

An attendee without a recorded charge has blank monetary cells and **No recorded charge**, never an inferred unpaid fee. Balance rows separately identify current presence. CSV generation creates no debt, registration, attendance, account, payment or notification. This increment requires no schema migration or hosted data write.

## File and integrity contract

- A download is one fresh SQL statement/snapshot, independently checking current tenant and owner/admin membership. The API also verifies managed identity, verified email, current organization role, target IDs and strict filters. Scoped check-in/collection grants do not authorize exports. Repeated/unknown API parameters are rejected; queries are parameterized.
- Each file contains at most 10,000 data rows and 8 MiB. SQL bounds detail rows and prevents aggregation of oversized detail payloads; CSV generation checks complete row count and encoded size. Oversized exports fail with a filter-refinement error, never a truncated file or implicit first-page export.
- UTF-8 BOM, RFC-style comma separation, quoted/escaped fields and CRLF support Unicode and spreadsheet import. File language selects EN/NL/TR headers/status values; amounts always use exact EUR decimal-point values with two decimals, without locale grouping. Dates use ISO text; organization and session timezone columns distinguish boundaries and local time.
- Untrusted text that could become a spreadsheet formula, including leading whitespace/control/invisible characters and `= + - @`, is prefixed with an apostrophe before CSV quoting. Typed numeric cells are validated separately and retain numeric meaning. CSV text is never HTML or executable content.
- Records carry organization, generation time, report timezone, applicable period, name/state/group/activity filters and trend period unit. Filenames use an allowlisted report/period/language pattern rather than user-provided names. Empty results produce column headers with zero data rows, without an invented record.
- Files use attachment, CSV content type, no-store/private caching, no-sniff and sandbox headers. Auth/API content never enters public PWA caches. No export file or raw report is saved in Himmah, queued offline or sent to third parties. Native browser downloads remain under the user's control.

Filters remain editable after errors; invalid ranges disable downloading while permitting correction. Only an explicit click fetches CSV. Pending downloads lock their reviewed filters. Scope/navigation changes abort a pending read and prevent late file creation; object URLs are revoked on scope loss, permission loss, expiry and unmount. Known access loss hides private context and requires retry. Successful preparation states a row count/generation time; it does not claim the browser saved a file. Retrying is a fresh read, so live records may have changed.

## Verification

Disposable SQL tests reconcile detail sums and all Insights exports across date/activity/group filters, DST/local boundaries, historical memberships, cancellation/future sessions, archived contacts, late receipts, reversals and corrections. Additional tests cover no-charge attendance, primary methods, literal searches, 10,001-row rejection/recovery, strict parameters, foreign tenants/targets, current role revocation, UTF-8/localization, exact amounts and formula protection. A real Workerd test verifies the CSV response and gate/role/verification/rate/size errors. UI tests cover direct entry, preserved filters, invalid dates, read retries, permission loss, abort cleanup and no volunteer requests. Browser fixtures download actual local SQL/API CSVs with synthetic records only. Execution/deployment evidence is recorded in [infrastructure history](INFRASTRUCTURE.md).
