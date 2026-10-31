# Participation follow-up

The owner-approved next increment is a read-only owner/admin list at `/workspace/$organizationId/follow-up`, linked from Home's next actions and detailed Insights. It helps staff find a contact and open their existing profile/Who to contact. It does not send messages, assign tasks or score engagement.

## Definitions

- **No recent visits:** active contacts with at least one valid recorded visit, but none in the chosen 7/30/60/90-day window. Default 30 days; oldest last visits first, then contact ID.
- **No recorded visits:** active contacts without any valid recorded visit, including newly added contacts. Separate category, newest added first; show the added date rather than an inferred absence.
- A valid visit is current recorded presence at a started, non-cancelled session. Removed presence and future/cancelled sessions do not count. Archived activity history still counts; archived contacts are excluded.
- Windows include today and the preceding days minus one, beginning at organization-local midnight. The exact inclusive starting date, organization timezone and generation time are shown. This handles calendar boundaries and daylight-saving changes.

Missing records do not establish absence or disengagement. No expected attendance, universal engagement score, payment inference or outreach permission is inferred. The initial view is organization-wide; no cohort filters or comparisons are implied.

## UI and privacy

Reuse shared compact directory rows, search, responsive tabs, labelled period control and an accessible refresh icon. Show last visit, activity and optional session topic; each row opens its contact profile. Keep definitions in a disclosure and use document scrolling. EN/NL/TR, no autofocus, visible focus and phone touch targets follow the design system.

Filters/search are URL-backed and independently reloadable. Growing lists use filter/actor/tenant-bound keyset cursors (25 default, 50 maximum), automatic loading and manual Load more. Counts apply to the searched categories, independently of the current page. Results are live: refresh after corrections; duplicate contacts crossing changing page boundaries appear once with their first visible snapshot.

Verified owner/admin access is enforced independently in API and SQL. Volunteers cannot request organization-wide reporting. Responses are no-store; private query keys include actor/organization/role/filter. Known access loss hides stale records and clears private child queries while retaining the organization context to prevent reload loops. No authenticated report enters service-worker caches.

## Implementation and validation

`follow-up-store.ts` resolves authorized organization-local bounds, scans current valid presence once for last visits, and returns counts/page metadata in one SQL statement. It uses the existing schema with no migration, historical rewrite or hosted data mutation.

SQL/API tests exercise local-day/DST boundaries, fractional timestamps, archived activity history, excluded archived contacts, cancelled/future sessions, removed attendance, newly added contacts, deterministic cursor pagination, searches, cross-filter/tenant/role denial and read-only behavior. UI tests cover definitions, profile links, categories, filters, retry/pagination, duplicate rows and private cache clearing. Release evidence is recorded in the infrastructure history.

Synthetic Dutch phone reference: [follow-up directory](redesign/previews/follow-up-phone.png).
