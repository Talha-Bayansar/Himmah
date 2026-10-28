# Groups and relationships — local implementation

Current release: [complete dropped-feature removal and app integration](../REMOVAL.md) supersedes earlier statements below about retained legacy products, standalone People navigation and the previous schema lineage.

Current continuation: [Who to contact and authorized hosted rollout](COMMUNICATION_STATUS.md) supersedes the earlier local-only status below.

28 October 2026, continuing `rebuild/people-foundation`. The owner authorized continuing the People rebuild after approving the compact cards/mobile controls. This increment implements groups and family/other relationships; it is not a remote cutover.

## Delivered

- Groups: create/edit, optional description, active/archived search, counts and independently reloadable detail routes. Contacts and Groups have real navigation tabs.
- Group membership: paginated rosters, contact-profile membership sections, adding a contact from either its profile or the group, and multi-select batches of up to 50. Existing members are visibly checked/disabled. Selections survive searches/pages and can be removed even while hidden by a filter. Batch outcomes distinguish saved, already assigned and failed contacts; partial successes remain saved and failed selections remain reviewable.
- Ending membership requires a reason. Old intervals remain available; rejoining creates another interval. Archiving a contact/group ends active memberships in the same database transaction, with history/audit updates. Restore never recreates ended memberships. Contact archive confirmation shows the active membership count.
- Relationships: a bounded Family and relationships preview on contact detail with a dedicated paginated full-list route, selecting another contact and a relationship type, explicit direction, and two sentence previews before saving. The other contact's role is derived from the same edge, not a second editable inverse row.
- Built-in father/child, mother/child, parent/child, sibling/sibling and guardian/ward labels are seeded for existing/new rebuild organizations. Sibling edges canonicalize endpoints so reverse entry cannot duplicate them. Self-links and cross-tenant references fail.
- Organization-defined relationship types: add, edit localized labels, archive and restore through `/workspace/:organizationId/manage/relationship-types`. All EN/NL/TR labels are required. Label edits publish an immutable version; existing edges retain their saved labels. Code, category and direction semantics cannot change after creation. Reciprocal types use the same label both ways. Archiving a type blocks new use without removing existing links.
- Ending a relationship requires a reason and preserves the edge/history on both contact profiles. No family relationship grants account access, proves legal authority or automatically chooses a communication contact; the UI states these boundaries.

## Routes and permissions

People lists/details are `/workspace/:organizationId/people/contacts`, `/contacts/:contactId`, `/groups` and `/groups/:groupId`. New API collections live under `/api/organizations/:orgId/people/`: groups, group members/options/assignments/history, contact memberships/group-options/relationships and relationship types.

All reads/writes require a verified active owner/admin membership in the rebuild schema. Volunteers do not gain standalone directory access. Every collection and selector uses validated, scoped cursor pagination (25 default, 50 maximum) with deterministic timestamp/ID ordering and request cancellation. Counts are SQL aggregates. All query keys include user/org/resource/filter scope; current-access failure in any People subview hides the page and clears private People cache entries.

Commands serialize on the organization root and check actor/access before reading receipts. Contact/group/edge versions protect edits, including both contact versions on creation of a relationship. A form keeps its opening version through background refresh. Operations, append-only audit entries and receipt writes commit together. Replays return minimal IDs/outcomes and never skip current authorization. No contacts/accounts are created implicitly by linking records.

## Migration/install boundary

The first baseline remains intact. `0001_tiresome_marvel_zombies.sql` adds the group, membership, type/version, relationship and associated event/receipt tables. Tenant references use composite foreign keys. The accompanying `directory.sql` installs membership-interval and relationship canonicalization/immutability guards, organization defaults, archive propagation and transactional commands.

Fresh local test installation order is:

1. All numeric `db/rebuild/generated/*.sql` files in filename order.
2. `db/rebuild/contacts.sql`.
3. `db/rebuild/directory.sql`.

The full bundle is required before enabling the new API; triggers are installed once on a fresh local database in tests. This is not a remote migration command or an idempotent installer. A reviewed migration runner must journal custom SQL before any real deployment. Do not replay old `db/migrations/generated` into a rebuild database or run this bundle on an inherited/unverified connection.

The default-off `HIMMAH_PEOPLE_ENABLED` gate remains. No hosted navigation, database/auth pairing, deployment binding, old table set or external account was changed. Follow [PLAN](PLAN.md) for project/branch/endpoint verification before remote integration.

## Remaining People work

Routine/emergency communication assignments and Who to contact routing, separately recorded legal guardianship, managed staff/organization onboarding integration, exports/retention and explicit historical backdating/correction commands remain later increments. Membership end/rejoin and relationship end/replacement are implemented; unrestricted editing of historical intervals is not exposed. The existing managed auth proxy remains in use, but new directory membership uses `himmah.staff_memberships`, not a copy of old participant links.

The proposed ownership/invitation changes and final worker/navigation removal of old modules are still integration work. No operational activities, attendance, cash, learning, points or game feature was added by this increment.

## Verification scope

The actual generated schema and command SQL are exercised locally through the real People API/store in PGlite. Tests cover directional inverses, reciprocal duplicates, immutable labels, custom types, overlapping membership rejection, end/rejoin/archive/restore, per-contact outcomes, foreign-tenant references, pagination, receipt replay/revocation and rollback on audit failure. These tests do not establish independent PostgreSQL-session locking/concurrency behavior; that remains a prerequisite for remote readiness.

Interaction tests cover independent detail routes, successful creation without an unnecessary discard prompt, picker paging/search and removable hidden selections, expected-version payloads, end/cancel behavior, both relationship previews, localized type editing and private-cache removal after access failure. Browser previews use production assets with synthetic intercepted APIs, not real people or live accounts. Physical-device keyboard/PWA installation and hosted auth/database integration remain unverified.


Executed validation:

- `npm run check`: passed strict types, documentation links and 235 tests (96 Node/domain/API/SQL, 3 actual Worker-runtime, 136 UI). The final group-membership audit refinement was also rechecked through all 23 focused People SQL/API tests, including an assertion of the affected contact, actor and reason.
- `npm run build`, `npm run test:contrast`, focused Prettier checks and `git diff --check`: passed. Production contrast minimum remains 5.87:1.
- Local Chromium: 36 page combinations (Groups list/detail, contact detail and relationship types across EN/NL/TR at 320/390/768px), plus 9 long-dialog checks. One primary heading, no horizontal overflow, compact card padding, 44px phone section actions/menu triggers, and reachable dialog submit/cancel controls. No browser exceptions. Previews were visually inspected: [group](previews/groups-phone.png), [contact with relationships](previews/contacts-phone.png), [relationship-type dialog](previews/relationship-type-dialog-phone.png).

Rebuild artifact SHA-256 values (not evidence of remote application):

| Artifact | SHA-256 |
| --- | --- |
| Generated 0000 baseline | `f38e434814f52fb311568ef5ab5af6fca61d9131ebc45d38bb01181014bc69df` |
| Generated 0001 groups/relationships | `89e11c6faf506b5ad1479d32b86644382071dd187f9a014afb97b4de337843c3` |
| contacts.sql | `5ff02dbb2a55c96ca806ed543320c57c5295b36ecaf9948abb96bfca3c164b2b` |
| directory.sql | `1a162e8cadad000fbac0ca40df736571afe0293165e33fab6b68b93a88b95528` |


Follow-up UI refinement: contact-profile memberships and relationships now use three-record previews with totals and View all navigation. Full child pages retain the list/search/history/mutation behavior described above. See [profile collection behavior](PEOPLE_STATUS.md) for routes, query-cache separation and the scope of this change.
