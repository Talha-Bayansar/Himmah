# Members, groups and staff access

Open a saved organization at `/start`. Its overview opens at `/workspace/:organizationId/overview`; Members, Groups, Staff access and Invitations each have their own `/members`, `/groups`, `/staff` and `/invitations` page under the same workspace. Compact icon/text navigation scrolls horizontally on phones, marks the current page and brings it into view. Browser Back, reload and direct links work; the active page heading receives focus without opening the keyboard. Organization details stay on the overview. Owners/admins see all management pages. Volunteers can access their saved workspace details but cannot administer the directory or read its private roster API.

## Participant records and groups

Add a display name/nickname and confirm that the organization is authorized to maintain the record and has required permission/consent. Store only the nickname, organization, lifecycle/version metadata and actor/time of that attestation. No birth dates, photos, guardian contacts, credentials or youth login accounts are collected in this milestone. An attestation is not a substitute for the organization’s guardian/enrollment process; complete that before enrolling real youth accounts.

Members can belong to multiple groups. Open a group to view its members; use Add to group from the full roster. Archive/restore members or groups without deleting historical assignments. Renames and lifecycle changes require the latest version; stale saves return a conflict and refresh the list. Destructive/archive/remove/access changes use shared confirmations. Unsaved modal edits use shared discard confirmation and Router unload protection.

## Staff invitations

Owners invite administrators or volunteers. Administrators invite volunteers. The creator receives a private shareable link, displayed once; no email is sent automatically. Lost links require a new invitation, and the old invitation can be revoked.

The link uses `/join#token`. The token stays in the browser fragment and is sent only in same-origin POST bodies for preview/acceptance. Only its SHA-256 digest is stored. A recipient signs up/signs in, verifies the matching email, reviews the organization and role, and explicitly accepts. Invitations expire after seven days. Revoked/expired/wrong-email invitations fail without disclosing another recipient’s address. The creator must still hold the necessary role.

Acceptance is atomic and retry-safe. Existing membership roles are preserved, and consumed invitations cannot recreate membership after removal. Owners control staff-role changes; no owner transfer or additional-owner grant exists in this milestone. Owners/self-access cannot be removed here; admins cannot remove another admin or promote staff. Staff names from accepted invitations are recorded as display-name snapshots. Existing organizer memberships without snapshots display their localized role.

## Infinite fetching convention

Growing lists and pickers use bounded cursor pages: organizations, participants, groups, group members, staff, invitations and the group picker. Default 25 records, maximum 50; the database reads at most limit+1 for next-page detection. No total counts or fetch-all endpoints are used.

Order by `created_at desc, id desc` (staff uses user ID). Cursor payloads retain Postgres timestamp precision and bind to user/tenant, resource, search, archive and group filters. Cursors are UTF-8/base64url and validated; they are not authorization credentials. Every page rechecks real membership/permissions independently.

TanStack useInfiniteQuery keys include identity, organization and filters; fetches receive AbortSignal. Debounced search resets cursor scope. InfiniteFooter automatically fetches near the sentinel and exposes a keyboard-accessible Load more button, pending spinner, retry and end state. ListSkeleton handles initial loading. Next-page errors retain loaded rows and stop automatic retries. Unauthorized errors hide private content. Sign-out cancels/removes private directory and invitation queries.

## Storage and security

Migration 0001 adds hub_people, hub_groups, hub_group_people, hub_invitations, hub_directory_audit and an optional staff display-name snapshot. Composite foreign keys prevent cross-organization group assignments. Organization/lifecycle/page indexes support bounded reads. Mutation SQL checks and locks the actor’s current role; API guards are additional protection. Audits contain actor/action/entity references, not participant names or raw tokens. CSRF, verified email, payload limits and directory rate limits apply to mutations. No directory response or invite is cached by the PWA service worker.

## Validation and boundaries

PGlite executes the actual parameterized SQL and generated migrations with synthetic in-memory fixtures: isolation, duplicate retries/audits, group foreign keys, archive/restore, stale versions, tied timestamps, search escaping, roles, invitation preview/acceptance/replay/expiry/revocation and required consent. Component tests cover page appending/retry retention, sentinel deduplication, confirmation cancellation and form submission. Workerd auth regression checks remain required.

Development and onboarding receive the same generated migration and journal hash, in that order. Main stays unchanged, and onboarding receives no synthetic participant data. Hosted multi-account/browser flows still need physical testing where the workspace browser/network restrictions prevent it.

## Phone forms

Shared Radix/shadcn dialogs and confirmations fit window.visualViewport, including keyboard resize and panning events, with a 100dvh fallback. Dialogs align near the visible top on narrow screens and scroll when content is taller; focus remains trapped. Directory form actions stay sticky, inputs use 16px text and 48px height, and controls have visible focus outlines and at least 44px button targets. Group creation uses group-specific help instead of the participant consent explanation. Dirty forms preserve values when discard is cancelled, including route/history navigation. Actual iOS/Android keyboards still require phone verification; Chromium viewport resizing checks layout but does not reproduce every device keyboard behavior.
