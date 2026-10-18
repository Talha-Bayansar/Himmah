# Required stack and UI conventions

Owner-directed requirements. These supersede earlier Next.js design proposals.

| Layer | Technology |
| --- | --- |
| Application/runtime | TanStack Start, Vite, Cloudflare Workers |
| Routing | TanStack Router with file routes and typed links |
| Remote state | TanStack Query, user/organization-scoped keys and mutations |
| Forms | TanStack Form, controlled fields and submission lifecycle |
| UI | shadcn/ui, Radix primitives, Tailwind CSS 4, Lucide icons |
| Authentication | Better Auth, currently managed by Neon, through the same-origin protected proxy |
| Localization | Paraglide JS, English/Dutch/Turkish catalogs, request-scoped SSR and Himmah-only cookie |
| Database | Neon PostgreSQL, Drizzle schema/migrations |

## Preserved behavior and accounts

The existing identity service already runs Better Auth; its SDK is Neon's supported Better Auth wrapper. Keep it while Managed Auth is the backend. The TanStack migration does not move password hashes, recreate users, change IDs or revoke existing sessions. Self-hosting Better Auth would be a separate identity migration with its own plan.

`/` is the public landing page; `/start` is the persistent organizer portal. `/demo` is removed. Internal Hub fixtures are unrouted and excluded from production JavaScript. Query handles account and organization reads/mutations; Form handles credentials, verification/recovery and organization setup. The database and API authorization model are unchanged.

The shared foundation matches Kermes Pay: TanStack Start/Router/Query/Form, shadcn/Radix, Tailwind 4, Paraglide, Drizzle/Neon and Cloudflare/Vite. Himmah preserves its existing Neon-managed Better Auth identities; Kermes Pay’s self-hosted auth and unrelated application features are not copied. No Kermes Pay files, credentials or settings are changed.

## Localization and contrast

Message catalogs live in messages/en.json, nl.json and tr.json. Paraglide compiles before type checks/tests and through its Vite plugin. Its message-format plugin is installed through npm and referenced locally, avoiding a build-time CDN dependency. Generated src/paraglide files are ignored. Never edit generated translations.

The cookie strategy uses `himmah_locale` with English fallback. Server middleware keeps simultaneous locale requests isolated and varies responses by Cookie. LocaleProvider changes language without a reload or form remount, updates HTML language/title/description and refreshes translated consumers. Stored user-entered names, slugs and IANA timezone identifiers are retained. Public API validation and managed-auth errors map to translated known messages; unknown provider details use a safe translated fallback. The locale cookie alone never triggers a managed-auth session request.

Global unlayered link color inheritance must exclude shadcn button links; otherwise it overrides Tailwind’s layered primary-foreground utility. `npm run test:contrast` reads production CSS and checks linked and native button variants at the normal-text WCAG AA threshold (4.5:1), including a reproduction of the original failing global override. This is a programmatic CSS/contrast audit, not a real browser screenshot/layout check. Darker secondary text also improves the organizer page’s labels and supporting text.


## Loading

Page/section reads use shape-matched Skeleton layouts. Router pending uses PageSkeleton; account/organization pending uses AccountSkeleton. Do not replace missing/error/unauthorized data with a fake empty total or spinner-only page. Cached refetches can retain existing content.

Pending interactions use ActionButton with shadcn Spinner, a specific label, disabled double submission and aria-busy. Validation failures preserve values; API errors are visible in alerts. No artificial loading delay is needed for synchronous in-memory demo actions.

## Confirmations

Use ConfirmationProvider/useConfirmation and shadcn AlertDialog before every destructive action: sign-out, delete/remove, reset, cancelling a booking, discarding unsaved edits, replacing a password, or equivalent future actions. Provide an impact statement, Cancel, and a specific confirmation label. No action may run until confirmed; cancel must preserve data/session. Use Router blockers for unsaved route/history changes. Browsers require native beforeunload prompts for closing/reloading; custom dialogs cannot replace that platform behavior.

## shadcn inventory and provenance

All 62 UI entries from the official new-york-v4 registry are installed locally under src/components/ui, with required dependencies/helpers. The registry host was unavailable in this environment, so official source was retrieved from shadcn-ui/ui on GitHub instead. [Source inventory](SHADCN_SOURCES.json) records canonical URLs and source SHA-256 hashes; [upstream license](SHADCN_LICENSE.md) is retained.

The registry still lists deprecated Toast files that were removed from current source; those three compatibility files come from official shadcn@3.0.0. Prefer Sonner for notifications. The legacy React Hook Form component is installed for completeness, but new application forms use TanStack Form and shadcn Field/Label/Input primitives.

Source adaptations: project import aliases, the combined Radix dependency for legacy Toast, and strict optional-property compatibility in Sonner/use-toast. Components are imported individually so unused chart/chat/etc. code is not eagerly shipped. Keep the Himmah color tokens and mobile accessibility when composing primitives.

## Development and verification

- `npm run dev`: Vite/Cloudflare on 3101; no other project's process or port is touched.
- `npm run typecheck`: generates typed routes and runs strict TypeScript.
- `npm test`: domain/API tests, real Workerd integration tests and JSDOM component interaction tests.
- `npm run test:worker`: actual default API dependencies inside Workerd, with a local-only auth fixture and no real accounts/email.
- `npm run build`: production client and SSR Worker build.
- `npm run deploy`: deploy the generated Cloudflare configuration, preserving runtime secrets.

JSDOM interaction tests validate confirmation decisions, pending states, Query cache cleanup and form workflows; they are not browser screenshots or proof of email delivery. Direct hosted browser verification remains subject to workspace network/tool availability.

The managed Better Auth browser wrapper initializes a tab ID on module import. It is loaded lazily inside browser interactions through authClient(), avoiding module-scope crypto initialization in Cloudflare SSR. Do not replace this boundary with a static runtime import in a server-rendered route.

Legacy branded layouts use --app-muted for secondary text so they do not override shadcn’s --muted background token. The shared theme remains the source of component colors.

## Phone navigation and forms

Workspace management uses `/workspace/:organizationId/:section` with Members, Groups and Settings as primary links. Keep the organization switcher and profile shortcut in a compact fixed header, with fixed bottom navigation on phones and fixed top navigation on wider screens. Reserve content space and safe-area padding so loaded records, long names and translated labels cannot move the chrome or cover the final rows. Mark the active section with aria-current and focus the new page heading. Settings contains profile/language/install/sign-out controls, organization details and links to dedicated staff/invitation pages. The old overview redirects to settings. The organization switcher reuses the existing bounded infinite query; preserve private keys, cursor scopes and dirty-route blockers.

Shared DialogContent and AlertDialogContent use useVisibleViewport to follow keyboard resize/panning with CSS variables and a 100dvh fallback. Keep narrow-screen dialogs near the visible top, scroll overflow and retain Radix focus trapping/restoration. Directory forms use 16px inputs, 48px field height, larger checkboxes, clear focus outlines and sticky Save/Cancel actions. Buttons have at least 44px touch targets. Do not disable zoom or replace shared discard confirmations. Successful workspace creation marks its saved boundary before route navigation.
