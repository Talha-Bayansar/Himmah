# Agent instructions — Himmah

## Read first and precedence

Read [current redesign context](docs/redesign/README.md), [owner brief](docs/redesign/OWNER_BRIEF.md), [specification](docs/redesign/PRODUCT.md), [workflows](docs/redesign/WORKFLOWS.md), [model](docs/redesign/MODEL.md), [audit](docs/redesign/AUDIT.md), [plan](docs/redesign/PLAN.md) and [infrastructure history](docs/INFRASTRUCTURE.md). The 28 October 2026 owner brief supersedes older product scope. Keep confirmed requirements separate from recommendations and open decisions. Save changes in decisions/documentation; never describe proposals as shipped.

The owner subsequently authorized local implementation of the reviewed People foundation. Continue with local code, generated rebuild migrations and disposable local tests. The owner subsequently authorized committing, pushing and deploying the People changes including Who to contact. The owner now explicitly requires complete deletion of all dropped features from app code and database schemas, including the deployed Himmah development/onboarding databases. Targeted removal is authorized; unrelated/provider schemas and other projects remain excluded. All existing data is disposable; migration/backward compatibility is unnecessary. This does not permit using unverified database targets.

## Product foundation

Contacts independent of accounts; family relationships and separate communication/legal/emergency responsibilities; multi-group membership; activities and sessions; registration; attendance; operational cash; insights. Learning is the first extension (self-paced quizzes/tests, then live hosted quizzes). Staff authentication and organization access are required from the beginning. Permanent contact accounts/guardian access, Futsal, engagement points/periods, rewards/coupons, challenges and games are removed from active code and schemas. Online payments and face recognition are outside current scope. Preserve useful code and Git history. There is no platform age restriction; youth safeguards still apply. Relationship links grant no application access.

Old code/docs are implementation history, not mandatory requirements. Do not retain points dependencies in core attendance or learning, restore Futsal to active scope, or add payments SDKs. Superseded code and documentation remain available in Git history. Read [feature removal](docs/REMOVAL.md) before schema/deployment work.

## Isolation

- Work only in this repository; never change `/workspace/kermes-pay`, shared configuration or another project's database.
- Use port 3101, check availability, never terminate another project's process.
- Never assume inherited DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL or Cloudflare credentials belong to Himmah. Do not print secrets or inspect secret files for discovery.
- Only verified project-local ignored HIMMAH_DATABASE_URL / HIMMAH_DATABASE_URL_UNPOOLED, managed HIMMAH_AUTH_URL and HIMMAH_APP_ORIGIN may be used. Fail closed without project-specific access; no generic fallback.
- Infrastructure IDs in docs are historical until reverified. Follow the reset runbook; main/onboarding are not routine development targets. Never apply a reset/migration/deployment without applicable session authorization; the current release has explicit deployment authorization.
- Keep global Git/application configuration unchanged. Use project-local dependencies.

## Architecture and integrity

Retain TypeScript; TanStack Start/Router/Query/Form; managed Neon Better Auth pending isolated validation; Neon PostgreSQL/Drizzle; Cloudflare; shadcn/ui/Lucide; Paraglide EN/NL/TR; mobile PWA. Modular monolith is proposed. Add tables only for the phase implemented. Inspect source and relevant historical implementation docs before refactoring.

Server authorization must enforce tenant/capability scope on every read/write/retry/job/export. Composite tenant FKs, audit history, optimistic versions and transactional idempotency belong in the foundation. Attendance, charges, payments and learning results are distinct. Unknown attendance is not absence. Cash refunds/waivers/corrections retain history. Published learning rules and server-authoritative live scoring must be versioned; nicknames do not verify contact identity.

## UI and maintenance conventions

Preserve Himmah leaf/forest/lime/warm background/typography. Real bookmarkable routes reload independently. Navigation: People, Activities, Insights, Manage; learning contextual to activities; language/account settings in Profile. Compact organization switcher and phone navigation. Use TanStack Query keys scoped by user/org/filter; growing lists use cursor/infinite pagination, stable timestamp+ID order, 25 default/50 maximum and accessible manual Load more. Skeleton page loading; action-local disabled spinner for pending mutations. Fixed square icon menus for secondary actions; Lucide labels, 44px touch targets, keyboard-aware scrollable forms and visible focus. Destructive actions/sign-out use accessible confirmation dialogs. Reuse shared primitives/focus/viewport helpers. Localize all shipped text/errors in EN/NL/TR, resolving messages within render/request.

Keep service-worker caches public-only: never cache authenticated HTML, auth/API/private records or queue mutations offline. Clear private caches on sign-out/scope loss. Keep secrets server-only and exclude them from Git/logs/screenshots. Preserve Cloudflare native fetch receiver wrappers and managed-auth proxy/error handling; auth changes require actual Workerd regression tests.

Owner list consistency: retain the original directory layout for Contacts, Groups, Staff, Invitations and Staff assignments. Reuse `directory-layout.tsx` and the shared directory CSS for headings, search bars, compact avatar rows and square secondary actions. Apply page padding once in OrganizationPortal; do not add narrower, independently padded People wrappers. Contact/group rows are full-row navigation links. Resolve staff display names from current managed account profiles with stored-name fallback; never render account IDs as names. Preserve this pattern for future list pages.

Owner UI refinement: informational cards should be compact, with one layer of padding rather than stacked card/content padding. Contextual section-add actions use a fixed 44px icon control on phones with a localized accessible name; show the text label on wider screens. Reuse the shared compact Card density where appropriate.

Owner form focus: do not autofocus fields or page headings when opening forms. Keep normal keyboard navigation, focus trapping and restoration on sheet dismissal.

Owner form presentation: complex workflows use independently reloadable pages; simple forms use the shared shadcn/Vaul bottom sheet. Follow [form classification](docs/FORMS.md), `FormSurface` and `PeopleForm`; never introduce a centered dialog for an input workflow. Keep confirmations in accessible alert dialogs. Preserve unsaved-change guards, one confirmation per leave action, failed-save drafts/request identity, current tenant authorization, version snapshots, localized labels, keyboard-aware sizing, safe areas and focus restoration. Page return links preserve the originating filters and must remain in the current organization.

Owner-approved child-list pattern: contact profiles show at most three rows per collection, an SQL total count and a real View all link. Full lists live on independently reloadable routes with their own infinite pagination and URL-backed search/history filters. Do not put auto-expanding infinite lists or nested scroll areas inside entity overview sections. Keep preview/full query caches separate. Form pickers keep bounded pagination within their page or sheet.

Owner-approved registration: session reservations and attendance are independent. Follow [registration behavior](docs/REGISTRATION.md): optional drop-in by default; required sessions derive expected contacts from confirmed reservations, freeze the original at check-in opening and audit later amendments. Enforce capacity under session locks, current scoped permissions, immutable events/receipts, snapshot versions and reasoned cancellation. Never mark attendance or create cash/account records as a side effect. Organization choices use the shared compact full-row directory links.

## Workflow and validation

Use rg for discovery. Carry authorized work through relevant checks without repeated routine permission questions. Do not send external messages/invitations, synthetic real-device pushes, provision services or deploy without applicable authorization. No delegation requested.

For documentation-only changes run `npm run docs:check` and `git diff --check`. For implementation run typecheck and meaningful changed-domain/SQL/authorization/retry/UI tests; build/contrast and Workerd tests as appropriate. Report only executed checks and their limits; old reports are not new verification. Before committing inspect status/diff; never commit env files, credentials, real contact data or database dumps.
