# People foundation — local implementation status

Current continuation: [Who to contact and authorized hosted rollout](COMMUNICATION_STATUS.md) supersedes the earlier local-only status below.

28 October 2026, branch `rebuild/people-foundation`.

## Implemented locally

The contacts slice now includes:

- Independent name-only contacts, optional given/family names, search and paged active/archived lists.
- Reloadable list/detail routes at `/workspace/:organizationId/people/contacts` and `/workspace/:organizationId/people/contacts/:contactId`.
- Optional own phone/email methods, preferred channel method, atomic replacement and end-dated removal. Shared methods across different contacts are allowed; identical active methods within one contact are rejected.
- TanStack Form/Query/Router screens, shared confirmations/action menus/skeletons/infinite footer, dirty-form protection and EN/NL/TR messages.
- Server membership checks for verified owner/admin accounts, tenant-scoped queries/FKs, expected-version conflicts, atomic audit/receipt writes and current-access checks on retries.
- A separate Drizzle rebuild baseline in `db/rebuild/generated`, generated from `src/modules/people/schema.ts` using `drizzle.rebuild.config.ts`; `db/rebuild/contacts.sql` defines the transactional commands. Old generated migrations/schema remain intact.

The module has no imports of points, rewards, participant account linking or Futsal. It reuses pure pagination/contracts and shared UI/request utilities. The existing Worker still hosts legacy modules; full navigation/entry/worker cleanup is a later integration step.

## Boundaries and setup

`HIMMAH_PEOPLE_ENABLED` must be exactly `true` to enable the new API. It is intentionally unset by default and no deployment binding was changed. Routes are directly addressable but are not linked into the old production navigation. Disabled APIs show an unavailable state; they never query a partially prepared new schema.

The new SQL uses `himmah.organizations` and `himmah.staff_memberships`, not old `public.hub_*` memberships. There is no automatic copy/sync of old accounts/organizations. Managed auth still validates the signed-in identity; the same verified user ID must have membership in the new foundation. Local SQL tests seed synthetic organizations/users directly in disposable PGlite. This is test setup, not public onboarding.

Before real development integration, follow [PLAN](PLAN.md) to verify Himmah project/branch/endpoint/database/role and auth pairing. Apply all generated rebuild migrations, then contacts.sql and directory.sql transactionally to that isolated target through a reviewed migration procedure. No remote migration runner, drop/reset command or fallback to generic environment credentials is added. Old migrations must not run on the rebuild database.

## Deliberate increments from the design

This is the first working contacts slice, not completion of all [People implementation design](PEOPLE_IMPLEMENTATION.md). The new foundation organization table currently holds only identity/name/audit fields and staff membership. Onboarding, owner-transfer/invitation changes, organization locale/timezone settings and operational grants remain to implement with their consuming flows. Do not expose new organization setup until its complete access/ownership workflow exists.

Groups, effective membership history, family/other relationships and organization-defined versioned relationship types are now implemented locally; see [the continuation status](GROUPS_RELATIONSHIPS_STATUS.md). Contact/group archive now ends active memberships without reactivating them on restore. Communication preferences/routing, guardianship assertions, contact erasure/retention and exports remain separate work.

The current shared pagination validator bounds searches at 80 characters (rather than the design's proposed 120); UI and API use the same limit. List ordering is immutable created timestamp + ID. Contact metadata, methods and audit history load independently. Method writes use the parent contact version, so concurrent name/detail edits produce a conflict rather than overwriting one another.

## Verification

- `npm run check` passed: strict typecheck, documentation links, 84 Node/domain/SQL/API tests, 3 actual Worker-runtime tests and 125 UI tests (212 total, including existing regressions). After the final method-menu and edit-version adjustments, typecheck and all 5 focused People UI tests passed again. The added regression proves that background refresh cannot advance an open form’s expected version or overwrite its draft. Final input validation changes passed all 11 focused SQL/API tests.
- New SQL/API tests execute the generated baseline plus actual command function in local PGlite. They cover name-only/duplicate-name creation, retries/key conflicts, tenant/volunteer denials, pagination, stale versions, preferred methods, atomic replacement, end-dated removal, archive/restore, injected audit-failure rollback and revoked access. The Worker dispatch test checks the default-off API, enabled dispatch without legacy-store access, same-origin rejection and no-store responses.
- Production build and button contrast audit passed (minimum 5.87:1). Prettier checks for changed source/config/tests and `git diff --check` passed.
- Local Chromium production-asset walkthrough uses intercepted synthetic API responses, not a live database/account. Checked EN/NL/TR at 320/390/768px: one heading, no horizontal overflow, fixed 44px action menus and no browser exceptions. Inspected the synthetic phone screenshot and corrected method-action layout before final verification. See [phone preview](previews/contacts-phone.png).

PGlite does not establish independent concurrent connection/locking behavior. Real PostgreSQL concurrency tests remain required before claiming race guarantees remotely. Hosted auth, deployment, physical-device keyboards/PWA installation and real database integration were not exercised. A Vite development server showed an SSR React hook error during concurrent generated-file reloads; browser validation used the production Worker preview. This does not establish a new source regression or resolve development HMR behavior.

No inherited database/auth/deployment credentials used, no remote data changed, no reset, and no deployment. Kermes Pay and shared workspace configuration were not modified.


## Compact mobile cards — owner refinement

Removed duplicated `Card` + content top padding. Shared Card now has an opt-in compact density (12px vertical padding, 16px horizontal content padding), used by People cards; existing default density is retained. Given/family names share a responsive two-column definition list with wrapping. The section add-detail control is an accessible 44×44 plus button below 640px and shows its label on wider screens.

Rebuilt production assets and passed typecheck, all 126 UI tests across 18 files (including five People tests), formatting/diff checks and contrast audit (minimum 5.87:1). Chromium checks with synthetic intercepted APIs passed EN/NL/TR at 320/390/768px, verifying actual card padding, 44px phone add controls, visible desktop labels, readable content width and no overflow. The refreshed [phone preview](previews/contacts-phone.png) was visually inspected. These are local checks, not physical-device or hosted validation.


## Profile collection previews and full-list pages

Owner approved replacing expanding profile sublists with bounded previews and dedicated lists. Contact details, groups, relationships and audit history now show at most three records each on the profile, with localized count badges and View all links. These preview reads explicitly request three rows and never mount infinite-scroll sentinels or nested scroll areas. Empty active lists still link to full views so historical records remain reachable.

Full routes are `/workspace/:organizationId/people/contacts/:contactId/{methods,groups,relationships,history}`. Each reloads authorized contact metadata by ID and only its selected collection. They retain independent infinite scrolling (25 default/50 maximum), accessible Load more/retry, one parent link, existing mutations and the page scroll area. Search for methods/groups/related contacts and group/relationship history filters are stored in `q`/`history` URL parameters. History itself is a chronological list. Search input preserves spaces while typing. The router retains its existing scroll-restoration behavior.

Preview and full-list query keys are separate, so returning from a long full list cannot expand the profile. API totals are SQL counts of the entire authorized filtered collection, independent of pagination cursor/limit. They are operational navigation counts, not immutable reporting snapshots; concurrent changes can affect later reads. No schema or migration changed.

Single-purpose group rosters and selection dialogs retain their existing pagination; this change replaces the four multi-section contact-profile lists. No list virtualization or separate per-section scrollbar was introduced.


Executed validation for collection previews:

- `npm run check`: strict types, documentation links and 242 tests passed (97 Node/domain/API/SQL, 3 real Worker-runtime, 142 UI). New SQL checks verify three-row pages, full filtered totals, pagination and tenant denials; six new UI checks cover bounded previews/no observers, dedicated list navigation, next-page failure/retry, deep-link filters, separate preview/full caches and searches containing spaces.
- Production build, contrast audit (minimum 5.87:1), focused Prettier checks and `git diff --check` passed.
- Chromium production-asset checks passed 45 combinations: overview and four full collections across EN/NL/TR at 320/390/768px. Verified no nested list scroll areas or horizontal overflow. A real viewport scroll appended the next groups page; browser Back restored a three-row overview; a fresh reload retained search/history filters. No browser exceptions. API responses were synthetic fixtures with up to 70 rows, not live accounts/data.
- Updated previews were visually inspected: [bounded profile](previews/contacts-phone.png) and [dedicated groups list](previews/contact-groups-phone.png). No remote database change or deployment occurred.
