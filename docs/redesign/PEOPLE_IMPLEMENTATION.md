# Contacts, relationships and groups — implementation design

Status: concrete Phase 1 design for review, prepared 28 October 2026. This document specifies the next implementation; it does not introduce application code, executable migrations, remote writes or a reset. It applies the [owner brief](OWNER_BRIEF.md) and selected [operational permissions](WORKFLOWS.md). Field limits and technical choices below are agent-selected defaults, adjustable during implementation with recorded rationale.

## Slice boundary

Deliver staff-managed contacts with optional direct contact methods, multiple groups, directional/reciprocal relationships, routine/emergency communication assignments and separately recorded guardianship assertions. A contact never creates an authentication account. No points, rewards, games, assessment, cash or session tables are required for this slice.

Reuse managed staff authentication, organization membership and invitation security patterns. Correct the old administrator invitation policy so only owners can appoint administrators. Owners/admins manage People; volunteers receive no standalone directory access in this slice. Later check-in uses a purpose-specific projection rather than the administrative contact endpoint. No custom role editor, account-link table, photos, document uploads, free-form dossier, automatic merge or family account portal.

## Proposed physical schema

Use a new application PostgreSQL schema named `himmah` for the fresh migration lineage. Keep provider-managed auth schemas untouched. Use Drizzle `pgSchema('himmah')`, qualify all custom SQL and never depend on an inherited search path. This makes the new table set distinguishable from old `public.hub_*` tables without permitting shared-database use. The actual database must still be independently verified as Himmah-only. Fresh database provisioning and migration execution follow [PLAN](PLAN.md).

Unless stated otherwise, tenant rows use `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`, `organization_id uuid NOT NULL`, `version integer NOT NULL DEFAULT 1 CHECK (version > 0)`, `created_at/updated_at timestamptz NOT NULL`, and `created_by/updated_by text NOT NULL`. Require unique `(organization_id,id)` on reference targets. Every tenant FK includes organization ID, with restrictive deletion. Server timestamps supply time; editable effective times are separate fields. Creation actor/history remain valid after staff revocation, so actor identifiers are not cascade-linked to active membership rows.

### Existing foundation to rebuild minimally

- `organizations`: UUID ID, name (trimmed 1–100), slug (3–48, lowercase letters/digits/hyphens, globally unique), IANA timezone, locale (`en|nl|tr`), version/audit columns. Do not add currency until cash is implemented. Organization creation and first owner membership are atomic and idempotent.
- `staff_memberships`: composite PK `(organization_id,user_id)`, provider `user_id text`, role (`owner|admin|volunteer`), active flag, version/audit columns. Index `(user_id,active,organization_id)`. Provider identity is validated through managed auth, not created by SQL. Serialize ownership changes with an organization lock to protect the last active owner.
- `staff_invitations`: UUID ID, org, normalized email, requested role (`admin|volunteer`), token hash unique, expiry, accepted user/time or revoked time, version/audit columns. Issuance and acceptance are audited. Owner issues admin invitations; admin may issue volunteer invitations only. Acceptance binds verified email, not a supplied user ID. No automatic email sending.

Do not build session/group operational grants before their consuming module. Keep owner/admin directory checks explicit now; add scoped grant tables with the scheduling/check-in slice.

### `contacts`

| Column | Type / rule |
| --- | --- |
| display_name | text, trimmed 1–120 characters; Unicode names allowed, no control characters |
| given_name / family_name | nullable text, trimmed 1–120 when supplied; display name remains independent |
| archived_at / archived_by | nullable timestamp/text pair; both null or both non-null |
| Common identity/version/audit fields | As above |

No uniqueness constraint on names. No mandatory birth date, consent-attestation field, phone, email or user ID. Organization remains responsible for appropriate collection/consent processes; omission of a generic checkbox is not a claim that consent is unnecessary. Add specific evidence only when a defined process needs it.

Indexes: `(organization_id,archived_at,created_at DESC,id DESC)` and `(organization_id,id)` unique. Initial search is escaped case-insensitive substring of display/given/family name, query length <=120. Do not claim a normal B-tree accelerates substring search; assess trigram indexing only with representative data and explicit extension review. Pagination remains bounded regardless.

### `contact_methods`

`contact_id uuid`, `kind text CHECK IN ('phone','email')`, `value text`, `normalized_value text`, `preferred boolean DEFAULT false`, `ended_at timestamptz NULL`, plus common columns. Composite FK to contacts. Email <=254 characters; phone display value <=64. Validate email shape, preserve submitted address for display and normalize for lookup without claiming delivery verification. Require an international dialing code when adding a phone, preserve display formatting and normalize to E.164; no guessed country. No SMS/email verification is implemented.

Partial unique indexes `(org,contact_id,kind,normalized_value) WHERE ended_at IS NULL` and `(org,contact_id,kind) WHERE preferred AND ended_at IS NULL`. Same email/phone may belong to different contacts; warn owners/admins of possible duplicates but never merge. Method removal end-dates it. Changes to a value end the old method and create a replacement in one transaction; assignments follow contact/channel preference rather than copying a method's value. Index `(org,contact_id,created_at DESC,id DESC)`.

### `groups` and `group_memberships`

`groups`: `name text` trimmed 1–100, nullable description <=500, archive pair, common columns. Unique `(org,lower(name))` for active groups only; archive permits name reuse, restore conflicts must be resolved explicitly. Index `(org,archived_at,created_at DESC,id DESC)`.

`group_memberships`: common columns, `group_id`, `contact_id`, `valid_from timestamptz`, `valid_to timestamptz NULL`, `end_reason text NULL` <=300. Composite FKs to group/contact. Check `valid_to IS NULL OR valid_to > valid_from`. Unique active `(org,group_id,contact_id) WHERE valid_to IS NULL`. Use half-open intervals `[from,to)`. Prevent all historical interval overlaps via a constraint trigger that locks the parent group row, then checks intersecting ranges for that pair. Every membership writer takes that lock before checking/inserting; do not rely only on the partial unique index. This avoids requiring an extension for exclusion constraints in the initial slice.

Initial UI adds/ends membership at server time; ordinary users cannot backdate. Administrative historical correction uses a reasoned command that validates all affected intervals under the same lock. Index `(org,contact_id,valid_from,id)` and `(org,group_id,valid_from,id)`. Archiving a contact/group ends active memberships at the archive timestamp; records and previous intervals remain. Restoring does not silently restore memberships.

### `relationship_types` and `relationship_type_versions`

`relationship_types`: common columns, `code text` stable lowercase code <=50, archived pair; unique `(org,code)` across history. `relationship_type_versions`: UUID ID, org, `type_id`, `revision integer >0`, `forward_labels jsonb`, `inverse_labels jsonb` (nonempty `en/nl/tr` strings <=80), `category ('family','other')`, `symmetric boolean`, created actor/time. Composite FK to type; unique `(org,type_id,revision)` and `(org,id)`. Validate JSON structure both server-side and with database checks; published versions immutable.

Seed father/child, mother/child, parent/child, sibling/sibling, guardian/ward per organization in the organization creation transaction. Built-ins use localized labels; organization-defined labels explicitly support all three locales. Seeded guardian is a social relationship label, not verified legal authority. A single parent's inverse may be labelled Child for father/mother/parent without creating a second independent child type.

Owners/admins can add a type, archive it or publish a new label version. Directionality/category/symmetry are immutable for a type; a semantic change needs a new type. Existing relationships pin a version. Renaming does not rewrite history. No implicit graph inference (for example a shared parent does not auto-create a sibling relationship).

### `contact_relationships`

Common columns, `source_contact_id`, `target_contact_id`, `type_id`, `type_version_id`, `valid_from`, `valid_to`, optional `end_reason` <=300. All same-org composite FKs; use a composite version FK to prove the version belongs to the referenced type. Check endpoints differ and valid interval. Source **is the forward role of** target: A is father of B, so B displays A as Father and A displays B as Child. Forms show a sentence preview in both directions before save.

Symmetric relationships sort UUID endpoints into canonical order. A database trigger checks canonicalization and type/version consistency; services normalize before insert. Active unique `(org,type_id,source_contact_id,target_contact_id)`. Reject overlapping intervals for the same canonical typed edge under an organization row lock; phase 1 relationship writes are infrequent, so prefer a simple correct lock over premature fine-grained locking. Distinct types/multiple parents are allowed; do not enforce a legal family structure through graph constraints. Reverse-directed edges of directional types are separate assertions, not automatically deduplicated as reciprocal.

Indexes on `(org,source_contact_id,created_at DESC,id DESC)` and target equivalent. End-date rather than delete; correction preserves prior endpoint/type assertion and creates a replacement. Archived people retain relationship history, but are excluded from new selectors and operational routing. Archiving a relationship type blocks new relationships, not existing viewing or end-dating.

### `communication_assignments`

Common columns, `subject_contact_id`, `responsible_contact_id`, `purpose ('routine','emergency')`, `priority smallint CHECK BETWEEN 1 AND 99`, `channel ('phone','email','any')`, `allow_direct boolean` is **not** needed here (belongs to subject policy below), valid interval, end reason. Composite endpoint FKs; distinct contacts. Unique active `(org,subject,responsible,purpose,channel)`; prevent overlapping duplicate intervals under subject lock. Index `(org,subject,purpose,priority,id)`.

Add `contact_communication_preferences`: PK `(org,contact_id)`, FK contact, `routine_direct_allowed boolean DEFAULT true`, `emergency_direct_allowed boolean DEFAULT false`, version/audit fields. Create with contact. Staff can route routine communication through a parent without changing/deleting the child's own phone/email. Guardianship/family records never populate these preferences or assignments automatically. Do not add private instructions/free-text communication notes initially.

Routing at server time: filter ended/archived assignments and archived responsible contacts; for routine use usable direct preferred methods first only when direct contact is allowed, then assignment priority ascending. For emergency use emergency assignments first; direct contact is an explicitly enabled fallback. Within a contact/channel use preferred method then newest `(created_at,id)`; equal-priority responsible contacts are displayed as alternatives, not silently chosen. If methods are unusable show the assignment as missing a channel and continue to the next usable candidate. Return a visible 'no usable contact method' state when none exist. No staff messaging/sending is part of routing.

### `guardianship_assertions`

Common columns, `subject_contact_id`, `guardian_contact_id`, `authority_kind text` 1–80 (organization terminology), `verification_state ('unverified','staff_attested')`, nullable `verified_by/verified_at`, valid interval, end reason. Endpoint composite FKs, distinct contacts, valid dates, and verified pair required exactly for staff-attested records. Unique active `(org,subject,guardian,authority_kind)`; disallow overlapping equivalent intervals under subject lock. Index `(org,subject,created_at DESC,id DESC)`.

Staff attestation means an administrator records the organization's check, not that Himmah legally validated custody. Only owners/admins read or manage this section. No document store, evidence text, expiry reminders or account access rules in this slice. Revocation/correction retains prior assertions with reason; identity/family roles never infer attestation.

### `people_audit_events` and `operation_receipts`

Audit event: UUID ID, org, actor user ID, action, entity type/ID, entity version, optional reason <=300, `occurred_at timestamptz`, `change_summary jsonb`. Summaries contain changed field names, referenced IDs and non-PII state transitions; never copy phone/email/name values, tokens or guardianship details. Membership and relationship histories preserve prior assertions; this is an operational audit, not a full historical PII snapshot. Index `(org,entity_type,entity_id,occurred_at DESC,id DESC)`.

Receipt: composite unique `(org,actor_id,operation,request_key uuid)`, canonical request SHA-256, entity IDs/versions and outcome, created time. Store minimal results, not stale private detail responses. Retry rechecks current authorization and reloads a fresh authorized projection; archived or revoked access may yield a minimal completion receipt rather than private entity data. Mutation, audit and receipt commit atomically. Do not expire receipts for active data in the initial slice; define a retention policy before production erasure.

## Commands and transaction contracts

Each write accepts `requestKey` and expected versions for all mutable aggregate roots it changes. Derive actor from verified session; org is a requested scope subject to membership authorization. Validate inputs before locks, then recheck current access under locks. Use one transaction: authorization → receipt conflict/replay → lock/validate → mutate → audit → receipt. All code paths must share lock order: organization → membership → groups ordered by UUID → contacts ordered by UUID → child records. Prefer a coarse organization lock for relationship/type/archive commands initially. No HTTP-driver sequence that pretends multiple independent requests are a transaction: use a database operation function or supported real transaction transport.

Commands: `create/update/archive/restoreContact`, `add/replace/endContactMethod`, `updateCommunicationPreferences`, `create/update/archive/restoreGroup`, `assign/end/correctGroupMembership`, `create/archiveRelationshipType`, `publishRelationshipTypeLabels`, `create/end/correctRelationship`, `create/end/updateCommunicationAssignment`, `create/end/correctGuardianshipAssertion`.

Archived contacts/groups are read-only except restore and reasoned historical correction by administrators. Archive confirmation shows affected active membership count and dependent routing warning. If an archive would disable a responsible contact, warn about affected subjects; assignments remain in history and routing ignores that contact immediately. Restoring does not reactivate ended membership or expired responsibility. No physical delete UI initially.

Atomic create-contact may include bounded initial methods (max 10), group IDs (max 50) and communication preferences, all validated in the same transaction. Relationships and responsibilities are follow-up commands after contact creation so cancelled partial forms cannot create unintended third parties. Bulk group assignment accepts <=50 unique contacts, returning explicit per-item outcomes and per-item deduplication under one batch receipt. No hidden truncation of selectors or active assignments.

Error contract: stable localized codes `invalid_input`, `not_found_or_forbidden`, `version_conflict`, `request_key_conflict`, `duplicate_active_record`, `archived_reference`, `interval_overlap`, `last_owner`, `restore_name_conflict`. Do not expose whether an inaccessible foreign-tenant ID exists. On conflict retain form input, show current version and require deliberate reapply; never silently overwrite.

## HTTP and query contract

Use `/api/organizations/:orgId/people` as the administrative module prefix. Routes below are planned server endpoints, not currently implemented:

- `GET/POST /contacts`; `GET/PATCH /contacts/:id`; `POST /contacts/:id/archive|restore`.
- Contact child collections `/contacts/:id/methods`, `/relationships`, `/communication-assignments`, `/guardianships`, `/memberships`, `/history` with explicit command endpoints for ending/correcting records. Preferences use `/contacts/:id/communication-preferences`.
- `GET /contacts/:id/who-to-contact?purpose=routine|emergency` for admins now; session-scoped volunteer variant belongs to check-in phase and must verify assigned subject access.
- `/groups` and `/groups/:id` metadata; paged `/groups/:id/members`; bounded `POST /groups/:id/assignments`; end/correct assignment commands.
- `/relationship-types` with create/archive and version publication commands.

All collection endpoints validate `q`, active/history filters, limit (default 25/max 50) and opaque cursor. Order immutable `created_at DESC,id DESC`; history uses occurrence time + ID. Effective-time queries use separately validated `asOf` and include it in cursor scope. Cursor includes query version, user/org/parent/purpose/filters and ordering values; it is not authorization. Query keys include the same scope. Fetch limit+1; list responses `{items,nextCursor}` with projected fields only. No contact detail request returns unbounded arrays of relationships/memberships/history. Each section loads independently.

Who-to-contact returns paginated priority-ordered candidates and a server-calculated first usable recommendation across the whole authorized candidate set, not merely the first loaded page. Define cursor `(priority,assignment_id)` for candidates; disclose direct candidate and purpose policy separately. Total/missing-method counts are SQL aggregates. Direct methods are paged in their own section; selector UIs never fetch an entire organization. No finite cap on active relationships/methods/responsibilities that silently hides data; input batch bounds are not total-record caps.

Search inputs debounce and cancel stale requests; keys scope to exact filters. Stable metadata uses deliberate 60-second stale time with mutation invalidation; dynamic Who to contact refetches when opened and after relevant edits, no background polling. Membership/privacy authorization still runs on every request. Directory search does not match private contact methods initially; add normalized method lookup only if justified with explicit permissions/indexing.

## Screen and route map

Use `/workspace/:orgId/people` as the real-route parent, redirecting to `/people/contacts`. Children: `/people/contacts`, `/people/contacts/:contactId`, `/people/groups`, `/people/groups/:groupId`. Relationship types are configured at `/manage/relationship-types`. These supersede the earlier loose `/groups/:id` proposal for the rebuilt UI. No redirects/backward compatibility required for old member URLs.

Contact detail: header title/archive badge/fixed more menu; direct details; Who to contact (routine/emergency selector); Family and relationships; Groups; administrator-only Guardianship assertions; paged History. Relations show both role direction and contact link. Do not display legal assertions as a family badge or infer communication from family role. Each section has add action and separate paged states. No dashboard of points/rewards or account invitation CTA.

Create form: display name required, optional structured names and contact methods, optional group selection; allow save with name alone. Then offer Add relationship or Set who to contact as ordinary actions. Relation dialog: find/create counterpart via explicit separate contact flow, choose role and direction, preview both sentences, save. Responsibility dialog: choose subject/responsible contact, purpose/channel/priority; preview available channels and direct-contact policy. Group page: metadata + paged active members and historical membership filter; searchable picker preserves bounded selections across pages and marks existing memberships disabled.

Reuse shared `RouteTabs`, `ItemActions`, `ActionButton`, confirmation, `InfiniteFooter`, page skeleton and visible-viewport/focus helpers; TanStack Form for inputs, Query for server state and Router for all navigation. EN/NL/TR copy includes role sentence templates and missing-channel states. Escape values in all display; do not insert user-defined labels as HTML. Preserve dirty forms, keyboard access, zoom, 44px targets, one parent back link and shape-matched loading. Unauthorized scope changes remove private query data and mounted detail views immediately.

## File-by-file implementation order

1. **Foundation:** new feature branch preserving existing uncommitted design work; isolated schema/migration directory `db/rebuild/`; a separate Drizzle config `drizzle.rebuild.config.ts`; project-local database verification guard before any remote migration. Keep old schema/config/lineage intact until cutover. No default migration script selects the old or new remote implicitly.
2. **Contracts and services:** `src/modules/people/contracts.ts`, validation and error mapping; `schema.ts`; server-only `service.ts`/`store.ts`; directory authorization helper reusing managed verified identity. New endpoints dispatch from existing Worker without importing legacy points/participant/game stores into the module. Preserve native fetch/proxy behavior.
3. **Contacts and methods:** implement minimal contact CRUD/archive/restore and paged read UI first, with optimistic versions, receipts and audit. Add groups and effective membership next; then relationship type/version and edges; then routing/preferences and guardianship. Each increment is independently usable/tested.
4. **Routes/UI:** thin new route files, people query-key factory/client, screen components and shared form adapters. Update navigation/entry to staff-only rebuilt scope during the implementation cutover; do not link unfinished modules or placeholder controls. Existing working deployment remains untouched until separately authorized.
5. **Retire legacy dependencies:** new staff entry queries do not union participant links. Verify production imports do not pull old member progress/points/game dependencies into People. Preserve old source and tests as baseline reference; do not rewrite unrelated game logic.
6. **Review and cutover preparation:** document final generated migration hash, constraint inventory, actually executed checks and any deviations. Remote development setup follows the verified runbook; hosted deployment is separate work.

## Acceptance and verification checklist

| Scenario | Required evidence during implementation |
| --- | --- |
| Name-only contact and same-name contacts | Server/SQL + UI tests accept both without account, email, date of birth or a copied parent method. |
| Parent/child direction and sibling reciprocity | One edge renders correct inverse; symmetric duplicate insert races produce one active record; self/cross-tenant edges fail. |
| Independent responsibilities | Unrelated responsible adult works; family/guardian alone does not route or authorize; direct-contact disabled policy is honored; missing first-priority channel falls through with visible warning. |
| Historical group membership | Add/end/rejoin intervals are preserved; concurrent overlapping writes fail; archive ends active memberships and restore does not reopen them. |
| Guardian assertion privacy | Volunteer requests including guessed child IDs and history endpoints are denied; admin attestation never grants contact record access to guardian. |
| Receipt and edit concurrency | Exact retry makes one mutation/audit; changed payload key conflicts; stale version cannot overwrite; authorization revocation prevents receipt data leaks. Inject audit failure to prove rollback. |
| Cross-organization references | Two synthetic orgs, every reference and nested route, tampered cursor, retry and batch tested at both service and SQL layers. |
| Pagination and routing | More than 50 contacts/groups/edges; no omitted/duplicate pages at stable snapshot; recommendations can come from later candidate pages; active sections are never silently truncated. Concurrent list inserts follow documented keyset behavior rather than claiming a frozen snapshot. |
| Labels/types | Organization-specific inverse labels, version edit/archive, EN/NL/TR rendering and malicious text escaping; historical edges retain their pinned labels. |
| Archive and destructive controls | Cancel has no mutation; confirm shows impact; repeated click/retry safe; active responsible-contact archive warns and removes it from routing. |
| Mobile and reload | Direct contact/group URL reload, search/selection across pages, focus return and dirty form, pending/error/retry/loading/empty/denied states at narrow widths and actual phone keyboard where available. |
| Staff auth/ownership | Workerd proxy regression, verified-email invitation acceptance, admin cannot appoint admin, last owner cannot be removed in concurrent requests, no real emails/accounts used as fixtures. |

Execute SQL constraints and transaction functions against disposable local Postgres/PGlite; use real PostgreSQL where PGlite cannot model concurrency/locks. Test actual concurrent independent database sessions for race guarantees. Run typecheck, applicable SQL/API/UI/Workerd suites, docs checker, production build/contrast and `git diff --check`. Report device/remote limitations honestly. No tests are claimed executed by this design document.

## Ready-to-build outcome

The schema, commands, UI, boundaries and checks above are concrete enough to start local implementation after review. No new owner product question blocks this slice. The remaining external prerequisite is verified Himmah-specific development database/auth access before remote integration. Local pure logic, UI and disposable database work need not use inherited credentials. The current task ends with this design; it does not execute the rebuild or reset.
