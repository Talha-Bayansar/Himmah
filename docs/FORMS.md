# Form presentation

The owner requested two form categories on 28 October 2026. The implementation keeps Himmah's original typography, page padding, forest/lime palette and controls.

| Form | Presentation | Reason |
| --- | --- | --- |
| Activity creation/editing | Dedicated page | Metadata, audience policy and multiple group selections |
| Staff access creation/editing | Dedicated page | Staff, scope and permission choices; uncertain-save retry state |
| Relationship type creation/label editing | Dedicated page | Directional labels in English, Dutch and Turkish |
| Contact relationship creation | Dedicated page | Contact/type selection, direction and relationship preview |
| Communication responsibility creation | Dedicated page | Contact, purpose, channel and priority |
| Bulk group member assignment | Dedicated page | Paginated multiple selection and partial-save outcomes |
| Contact creation/name editing | Bottom sheet | Three short name fields |
| Contact phone/email editing | Bottom sheet | Kind, value and preferred flag |
| Group creation/editing | Bottom sheet | Name and description |
| Contact-to-group assignment | Bottom sheet | One group selection |
| Staff invitation creation | Bottom sheet | Email and role |
| Session creation/editing/cancellation | Bottom sheet | Short scheduling edit or cancellation reason |
| Attendance recording/correction | Bottom sheet | Status and correction reason |
| Communication preferences | Bottom sheet | Two explicit policy toggles |
| End membership/relationship/responsibility | Bottom sheet | Reason and optional note |
| Sign-in, sign-up, verification, password recovery, organization setup and profile/settings | Existing page | Already have page space and established navigation |

Complex workflows have independently reloadable routes at `/workspace/$organizationId/forms/$form/$recordId`; `new` identifies creation. Existing records load through authorized APIs, independently of the previous screen's cache. The surrounding organization portal remains responsible for account/organization scope. Server permissions, optimistic versions, request keys and audit rules remain authoritative.

`FormSurface` provides a named, focused page heading or the existing shadcn Drawer/Vaul primitive. Short forms open from the bottom on all viewport sizes, with a drag handle, rounded top, constrained desktop width, focus restoration, safe-area padding and visual-viewport sizing. Long sheet content can scroll when the keyboard reduces space. Page forms use document scrolling. Every form retains explicit Cancel/Save controls and mutation-local pending states. Read-only history, organization switching, link sharing and destructive confirmation overlays are outside the form classification.

Unsaved drafts prompt on navigation/dismissal. An approved Cancel/Back action bypasses the navigation guard once, avoiding a second prompt. Pending saves cannot be dismissed. Failed saves preserve entered values and retry identity; successful saves return without a discard prompt. Page return links retain the originating route and filters, are normalized and restricted to the same organization. Directly opened forms have a stable fallback destination.

No database schema or API contract change is required. Browser viewport/gesture evidence and deployment status are recorded in [infrastructure history](INFRASTRUCTURE.md). Browser fixtures use synthetic records and do not replace physical iOS/Android keyboard testing.
