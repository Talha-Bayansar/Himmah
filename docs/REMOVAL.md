# Removal of dropped features

Completed: committed, pushed, and deployed on the verified Himmah Worker. Both development and hosted onboarding have zero removed-feature tables/functions/fields. The hosted cutover preserves sixteen contacts, two groups, two activities, three sessions, nine attendance records and existing staff/organization access. See the [verification record](INFRASTRUCTURE.md).

28 October 2026. The owner explicitly requested deleting all dropped features from both the application and database schemas, continuing the earlier authorization to commit, push and deploy. This supersedes previous instructions to retain optional product implementations in the working tree; Git history remains intact.

## Scope

Deleted Futsal/game experiences and PWA assets, points and attendance earning, engagement periods/snapshots, rewards/redemptions/coupons and QR collection, challenges/submissions/reviews, and permanent participant-account invitations/linking/progress. Removed routes, API dispatch, stores, domain/UI code, feature-specific notifications, translations, styles, dependencies and obsolete documentation/tests. The old migrations that recreated these products are replaced by a clean baseline.

Retained managed staff authentication, organizations, staff invitation/access management, canonical People, activities/sessions, scoped attendance/correction history, generic staff notifications/Web Push and the public-only PWA infrastructure. Registration, cash, Insights and learning remain planned; removal does not claim those new increments are built.

## App integration

Owner/admin launch now opens People directly. People shares the main organization switcher, Profile and People / Activities / Manage navigation. Volunteers open scoped Activities. Manage no longer serves as an entry to a separate People mini-application. Deleted product URLs and APIs are unavailable. Old directory section bookmarks resolve to People.

The duplicate old directory tables are removed too. Contact/group identities and membership are transferred to canonical People so activities/attendance use the same contacts staff manage. Existing activity, session and attendance IDs/history remain. Contacts gain no account or inferred legal/communication authority from this transfer.

## Schema and deployment

The reviewed upgrade is `db/removals/20261028_remove_dropped_features.sql`. It verifies database/role and the previously installed People digest, takes an advisory transaction lock, moves retained directory identities, removes an explicit trigger/function/table allowlist, deletes dropped-feature notification data, removes obsolete earning fields from saved attendance/access JSON, and reconnects retained foreign keys to People. It uses no CASCADE, broad schema drop, provider deletion or other-project target.

Run it and the current `people-adapter`, `access`, `attendance` and `notifications` function files in one transaction after local and dedicated development verification. Unexpected dependencies fail the whole transaction. Record a SHA-256 receipt in `himmah.feature_removal_receipts`. The clean Drizzle baseline is for fresh databases, not an automatic deployed upgrade.

The reserved main branch was inspected and has no public application tables. Development and onboarding are the explicit upgrade targets; all belong to verified project `blue-glade-25303766`. Auth/provider schemas remain unchanged. The Worker supports a short `HIMMAH_MAINTENANCE=true` cutover (API returns 503 and scheduled delivery pauses), then normal service resumes on the cleaned schema. An old Worker requiring deleted tables is no longer a valid rollback; retain the cleaned release and repair forward.

## Validation and status

Local real SQL has verified fresh installation and upgrade from the exact previous Git baseline. The upgrade test includes existing contacts, groups, attendance, earning data and scoped access; it proves preserved retained records, absent dropped relations/functions/fields and rollback on an unexpected dependency. Core tests exercise post-removal activity creation/retry, strict DST handling, canonical audiences, attendance corrections/retry/audit rollback, volunteer revocation, staff invitations and generic staff notification access. Negative tests check deleted API families, schema definitions, route files, PWA assets and dependencies.

Final test totals, browser evidence, remote upgrade receipts and active deployment are recorded in [infrastructure history](INFRASTRUCTURE.md) as they are executed. Historical status files describe earlier releases; this removal record supersedes their claims that legacy products remain available.


Executed validation before hosted cutover: `npm run check` passes 140 tests (69 Node/domain/SQL/API, three actual Worker-runtime and 68 UI), strict types and documentation links. Production build, button contrast audit (minimum 5.87:1), Prettier and `git diff --check` pass. The final archived-contact upgrade refinement was rerun successfully against the historical schema.

Production Chromium checked 99 views: 54 People profile/full-list views plus 45 Activities/Manage/Staff/Invitations/Access views, across EN/NL/TR and 320/390/768px. It verified one heading, no horizontal overflow or nested collection scrolling, three primary navigation links with one active entry, no deleted-product links, and invitation inputs with at least 16px text/44px height. People infinite paging, Back preview limits and URL-filter reloads passed. Browser errors: zero. Screenshots were visually reviewed. These are synthetic-API checks, not live signed-in or physical-device tests.

[Manage preview](redesign/previews/manage-phone.png) · [Staff invitation preview](redesign/previews/staff-invite-phone.png).
