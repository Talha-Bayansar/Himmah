# Architecture

Current stack: TypeScript, TanStack Start/Router/Query/Form, managed Neon Better Auth, Neon PostgreSQL/Drizzle, Cloudflare Workers, shadcn/Lucide, Paraglide EN/NL/TR and a public-only PWA cache.

`src/modules/people` owns contacts, methods, groups, relationships and independent communication routing in schema `himmah`. Public `hub_organizations` and `hub_memberships` remain the staff/organization authority, synchronized through the small hosted adapter. Scheduling and scoped attendance reference canonical People identities. They have no points/earning dependency.

The active Drizzle baseline includes only retained features. Explicitly removed products and their migrations/assets are gone from the working tree; Git preserves history. See [removal](REMOVAL.md), [current product](redesign/PRODUCT.md), [model](redesign/MODEL.md) and [infrastructure verification](INFRASTRUCTURE.md).
