# Himmah — community organization platform

Current direction (28 October 2026): contacts, relationships and groups; activities and sessions; registration, attendance and cash tracking; insights; self-paced learning and live hosted quizzes. Staff sign-in is required, contact accounts are optional future work. Points, rewards and Futsal are deferred. There is no platform age restriction.

**Start with the [redesign package](docs/redesign/README.md)**: owner-confirmed scope, proposed decisions, product specification, workflows, entity model, source audit and phased rebuild/reset plan. The [People foundation](docs/redesign/PEOPLE_STATUS.md)—contacts, groups, relationships and Who to contact—is implemented. This release enables it through Manage → Contacts using existing staff access. See the [implementation and rollout](docs/redesign/COMMUNICATION_STATUS.md) and [infrastructure record](docs/INFRASTRUCTURE.md) for verified deployment status. Activities and later redesign phases remain planned; older workflows stay accessible. No database reset or legacy contact migration is part of this release.

- [Agent instructions](AGENTS.md)
- [Verbatim owner brief](docs/redesign/OWNER_BRIEF.md)
- [Infrastructure history and isolation](docs/INFRASTRUCTURE.md)
- [Decision history](docs/DECISIONS.md)
- [Stack/UI implementation reference](docs/STACK_AND_UI.md)
- [PWA implementation reference](docs/PWA.md)

Keep TypeScript, TanStack Start/Router/Query/Form, Better Auth (currently managed Neon), PostgreSQL/Neon/Drizzle, Cloudflare, shadcn/ui/Lucide and Paraglide EN/NL/TR unless a specific audit finding justifies change. Preserve Himmah visual identity and mobile-first PWA behavior.

## Local development

Node.js 24 and npm. `npm ci`, `npm run check`, `npm run dev` (reserved port **3101**). `npm run build` produces the Cloudflare build. For this documentation pass, `npm run docs:check` verifies links without credentials. Old feature tests reflect old behavior and are not redesign acceptance criteria.

This repository is independent of `/workspace/kermes-pay`. Never modify that project/shared configuration or use inherited credentials for Himmah. The new clone does not contain the previous ignored Himmah env files. Use only verified Himmah-specific configuration; follow the reset runbook before any future database operation.

Existing source, migrations and historical docs remain intact for reuse and Git history. Older product requirements are superseded by the owner brief; historical implementation/deployment reports are not fresh verification. Private project; no open-source license selected.
