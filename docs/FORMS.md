# Form presentation

The owner requested two form categories on 28 October 2026. The owner subsequently adopted the [Himmah design system](DESIGN_SYSTEM.md): forms use its system typography, shared spacing, forest actions, warm neutral surfaces and consistent controls.

| Form | Presentation | Reason |
| --- | --- | --- |
| Activity creation/editing | Dedicated page | Metadata, audience policy and multiple group selections |
| Staff access creation/editing | Dedicated page | Staff, scope and permission choices; uncertain-save retry state |
| Relationship type creation/label editing | Dedicated page | Directional labels in English, Dutch and Turkish |
| Contact relationship creation | Dedicated page | Contact/type selection, direction and relationship preview |
| Communication responsibility creation | Dedicated page | Contact, purpose, channel and priority |
| Bulk group member assignment | Dedicated page | Paginated multiple selection and partial-save outcomes |
| Single-contact cash payment | Bottom sheet | One preselected contact, amount, remaining balance and explicit reviewed save |
| Session cash receipt and multi-contact allocation | Dedicated page | Receipt details, occurrence time and up to 50 allocations |
| Incorrect cash receipt correction | Bottom sheet | Short reason, preserved request identity and confirmation |
| Contact creation/name editing | Bottom sheet | Three short name fields |
| Contact phone/email editing | Bottom sheet | Kind, value and preferred flag |
| Group creation/editing | Bottom sheet | Name and description |
| Contact-to-group assignment | Bottom sheet | One group selection |
| Session registration, registration settings and reasoned cancellation | Bottom sheet | One contact choice or short policy/reason edit |
| Staff invitation creation | Bottom sheet | Email and role |
| Session creation/editing | Bottom sheet | Short scheduling edit |
| Session/series cancellation | Dedicated page | One/future scope, date/payment-impact preview, reason and destructive confirmation |
| Attendance participant adding | Bottom sheet | Search and select up to 50 eligible contacts; present contacts are visible but disabled; Add selected saves and Done dismisses |
| Communication preferences | Bottom sheet | Two explicit policy toggles |
| End membership/relationship/responsibility | Bottom sheet | Reason and optional note |
| Sign-in, sign-up, verification, password recovery, organization setup and profile/settings | Existing page | Already have page space and established navigation |

Directory edit workflows have independently reloadable routes at `/workspace/$organizationId/forms/$form/$recordId`; `new` identifies creation. Existing records load through authorized APIs, independently of the previous screen's cache. The surrounding organization portal remains responsible for account/organization scope. Server permissions, optimistic versions, request keys and audit rules remain authoritative.

`FormSurface` provides a named page heading or the existing shadcn Drawer/Vaul primitive. Short forms open from the bottom on all viewport sizes, with a drag handle, rounded top, constrained desktop width, focus restoration, safe-area padding and visual-viewport sizing. Long sheet content can scroll when the keyboard reduces space. Page forms use document scrolling. Opening a form does not autofocus a field or page heading. Keyboard navigation, sheet focus trapping and focus restoration remain available. Forms retain explicit Cancel/Save controls and mutation-local pending states. Attendance adding is a selection picker with Add selected and Done. Bulk remove/paid/unpaid use one review confirmation. Read-only history, organization switching, link sharing and destructive confirmation overlays are outside the form classification.

Unsaved drafts prompt on navigation/dismissal. An approved Cancel/Back action bypasses the navigation guard once, avoiding a second prompt. Pending saves cannot be dismissed. Failed saves preserve entered values and retry identity; successful saves return without a discard prompt. Page return links retain the originating route and filters, are normalized and restricted to the same organization. Directly opened forms have a stable fallback destination.

No database schema or API contract change is required. Browser viewport/gesture evidence and deployment status are recorded in [infrastructure history](INFRASTRUCTURE.md). Browser fixtures use synthetic records and do not replace physical iOS/Android keyboard testing.

Session cash collection uses the independently reloadable record-cash route because receipt details, occurrence time and multi-contact allocations form one complex workflow. Reasoned correction of an incorrect receipt uses the shared short bottom sheet and confirmation alert. Both preserve uncertain request identity and unsaved drafts.

Single-person cash recording is a simple sheet; its amount-labeled save is the explicit financial review. It offers More people or receipt details for the complex page. Preserve pending/uncertain request identity, conflict refresh, scope denial and no autofocus.

Recurring session planning and schedule changes use dedicated `session-series` / `session-schedule` page forms because weekday/ending choices and a bounded multi-session preview are a complex workflow. The existing short single-session create/edit/cancel sheet remains available. See [recurring planning](RECURRENCE.md).
