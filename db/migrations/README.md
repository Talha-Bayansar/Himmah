# Active schema lineage

`generated/` is a clean Drizzle baseline containing only retained staff/organization, People, scheduling, attendance and generic notification infrastructure. `functions/` installs read-only People projections, scoped attendance permissions, transactional attendance saves and generic staff push infrastructure. People commands remain in `db/rebuild/`.

Generate with `npm run db:generate`. `node scripts/schema-install-plan.mjs` produces the complete fresh-install plan and SHA-256 without connecting to any database. A fresh install must use an independently verified empty Himmah database. Do not apply this new baseline over a deployed schema.

The upgrade from the previous deployment is explicitly scoped in `db/removals/20261028_remove_dropped_features.sql`, followed by the four current function files in the same transaction. See [authorized removal](../../docs/REMOVAL.md). Old migrations that recreated removed products are deleted from the working tree and preserved in Git history. No generic reset or provider-schema deletion is supplied.

The additive `0008_learning.sql` introduces independent organization learning resources, immutable publications, recipient credentials and attempts. PostgreSQL column-specific SET NULL preserves the tenant key and learning history when optional activity/session context is deleted. Install with the guarded `scripts/learning-plan.mjs`, first on the verified validation branch. See [learning behavior](../../docs/LEARNING.md).
