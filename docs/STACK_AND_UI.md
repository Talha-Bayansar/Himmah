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
| Database | Neon PostgreSQL, Drizzle schema/migrations |

## Preserved behavior and accounts

The existing identity service already runs Better Auth; its SDK is Neon's supported Better Auth wrapper. Keep it while Managed Auth is the backend. The TanStack migration does not move password hashes, recreate users, change IDs or revoke existing sessions. Self-hosting Better Auth would be a separate identity migration with its own plan.

`/` remains the synthetic demo; `/start` is the persistent organizer portal. Router handles top-level navigation and unsaved-change blocking; the prototype's internal Hub panels remain local demo state. Query handles account, organization list/detail reads, auth and organization mutations. Form handles credentials, verification/recovery, organization setup, activity drafts and manual awards. The database and API authorization model are unchanged.

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
- `npm test`: domain/API tests plus JSDOM component interaction tests.
- `npm run build`: production client and SSR Worker build.
- `npm run deploy`: deploy the generated Cloudflare configuration, preserving runtime secrets.

JSDOM interaction tests validate confirmation decisions, pending states, Query cache cleanup and form workflows; they are not browser screenshots or proof of email delivery. Direct hosted browser verification remains subject to workspace network/tool availability.

The managed Better Auth browser wrapper initializes a tab ID on module import. It is loaded lazily inside browser interactions through authClient(), avoiding module-scope crypto initialization in Cloudflare SSR. Do not replace this boundary with a static runtime import in a server-rendered route.

Legacy branded layouts use --app-muted for secondary text so they do not override shadcn’s --muted background token. The shared theme remains the source of component colors.
