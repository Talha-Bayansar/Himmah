# Who to contact — implementation and rollout

Current release: [complete dropped-feature removal and app integration](../REMOVAL.md) supersedes earlier statements below about retained legacy products, standalone People navigation and the previous schema lineage.

28 October 2026. The owner authorized implementation, commits, pushing and deployment in the current conversation. This supersedes the earlier local-only authorization for this release. No database reset is part of this rollout.

## Behavior

- Contacts retain their own phone/email. Explicit, independent assignments select another same-organization contact, routine/emergency purpose, priority 1–99 and phone/email/either channel. Family links never create assignments, permissions or legal authority.
- Routine uses direct details first when allowed (default true), then assigned contacts by priority. Emergency uses designated contacts first, with direct details only as an explicitly enabled fallback (default false). Methods use preferred first, then newest timestamp/ID.
- Routing considers all active candidates before bounding the recommendation to three equally ranked options. Counts disclose missing allowed channels and equal-ranking alternatives. No usable method is an explicit state. Staff can review every assignment in the full list; the application sends no messages.
- Profile shows at most three assignment rows, SQL total and View all. `/workspace/:org/people/contacts/:contact/communication` reloads independently, with URL-backed name search/history, 25-row cursor pages, infinite scrolling/manual retry and one page scroll area. The management list uses immutable creation timestamp/ID order; recommendation priority is calculated separately over the whole candidate set.
- Add/end and preference commands use parent contact versions, current owner/admin authorization, transactional audit and retry receipts. Ending requires a reason; changing a designation means ending and adding its replacement. Assignments preserve their original purpose, priority, channel and endpoints.
- Archiving either endpoint ends active assignments. The responsible person's confirmation discloses affected people; restore does not reactivate responsibilities. Historical names remain current names, not snapshots of historical personal details.
- New interface text is localized in English, Dutch and Turkish. Shared compact cards, phone add controls, 44px actions, dirty-form confirmation and scoped cache invalidation remain in use.

## Hosted adapter

The existing managed-auth session and `public.hub_memberships` remain the staff-access authority. `db/rebuild/hosting.sql` initializes only organization identity/name and staff-role scaffolding in `himmah`, and transactionally synchronizes subsequent organization/membership changes through database triggers. Role downgrade, deletion and identity/scope changes revoke the old scope immediately. Participant links never become staff access. No legacy contacts, family links, points or game data are copied; no authentication account is created. Hosted organization setup, invitations and ownership continue through the existing workflows.

People is reached through Manage → Contacts; its header links back to Manage. Legacy areas stay available. The Worker requires `HIMMAH_PEOPLE_ENABLED=true`; this release explicitly enables it after installing the schema. Missing/false continues to fail closed. Rollback disables that flag or redeploys the previous Worker; retain the additive schema/data.

## Installation

`scripts/people-install-plan.mjs` produces SQL and a SHA-256 digest; it never connects or executes remotely. It installs generated rebuild migrations in order, then `contacts.sql`, `directory.sql`, `communication.sql`, `hosting.sql`, and an installation receipt in a single transaction. Its database/role/schema-presence guard and advisory lock fail on an unexpected or already installed target. Do not rerun it as an incremental migration tool. Independently verify project, branch, endpoint and database before executing it; never use inherited generic database credentials.

This is an additive new schema, not a reset or legacy data migration. Both existing application tables and managed auth remain intact. No synthetic contact/account/device data is installed on the hosted branch.

## Executed validation

Focused local SQL/API checks cover defaults, family independence, preferred methods, channel restrictions, direct policies, missing-channel fallback, 28 extra candidates, equal priorities, filtered totals, cursor pages, self/foreign/stale/duplicate rejection, exact retries, retained history, archive/restore, audit-failure rollback and denied access/replay. Hosted-adapter checks cover new organizations, admin/owner access, volunteer downgrade, deletion/re-add and participant exclusion.

Six new UI checks cover recommendations and missing states, saved preferences, unrelated-contact selection, uncertain retry with the same request key, reasoned ending, scope-loss reporting and archived management suppression. Existing UI regressions remain part of the full check.

Production Chromium walkthroughs checked 54 views: profile and five full lists × EN/NL/TR × 320/390/768px. No horizontal overflow, nested section scroll areas, extra headings, undersized action menus or browser exceptions. Automatic next-page loading, Back preview bounds and reloadable URL filters passed. Fixtures intercept synthetic APIs; they do not establish hosted sign-in or physical-device behavior. See [communication phone preview](previews/contact-communication-phone.png).

Full check, build, contrast and rollout outcomes are recorded in the release entry in [infrastructure history](../INFRASTRUCTURE.md). PGlite does not establish real independent PostgreSQL-session concurrency. Legal guardianship assertions, erasure/retention and exports remain separate work.
