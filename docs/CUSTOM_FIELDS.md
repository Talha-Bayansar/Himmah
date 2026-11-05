# Custom contact fields

Owner-approved increment, 5 November 2026. Manage → Contact fields configures organization-specific contact details. Owner/admin access follows the existing canonical People permissions; volunteers do not gain contact-directory access. Fields never create accounts, attendance, reservations, charges or notifications.

## Definitions and values

Up to 50 definitions per organization, including archived fields. Types are text (1,000 characters), bounded finite number (absolute value at most 10^12), ISO calendar date, yes/no and single choice (2–30 unique labels). Labels are at most 100 characters and unique among active fields. A definition's type and choices remain fixed; its label and required flag can be edited. Stable IDs keep values attached when labels change. Archive hides a field from forms; restore makes it available again. Both preserve existing values, profile visibility and exports.

Required applies on the next contact creation/edit and on imports. Existing contacts are not retroactively changed. Missing remains distinct from false/zero. Archived values cannot be edited or accidentally erased by saving active values. Plain-text values are bounded and never rendered as HTML.

Contact forms with configured active fields use bookmarkable `/people/contacts/new` and `/people/contacts/$contactId/edit` pages. Simple name-only forms and definition edits retain the shared bottom sheet. Shared native controls, explicit required labels, one reading column, no opening autofocus, unsaved draft guards and explicit save apply. Failed unconfirmed writes lock the reviewed payload and retry identity.

## Integrity

The API and SQL independently enforce the current tenant/admin role. Definition commands serialize on the organization and check versions, current access before exact receipts, type/choice immutability, uniqueness and bounds. Contact commands retain contact versions/receipts/audit; a definition snapshot prevents silently saving against changed field rules. Archived values are retained from the previous contact state. No field values are added to general staff/session notifications.

Definitions/values/receipts live in `himmah.contact_custom_fields`, `contact_custom_values` and `contact_field_receipts`. Values use the composite organization/contact foreign key. Definition changes are audited; contact changes retain their existing audit and request receipts. All private reads remain no-store and account/organization scoped.

## CSV

The existing File / Columns / Review import includes active fields in explicit mapping. The 1 MiB file / 500-row bounds remain, with at most 55 columns and a 4 MiB normalized JSON request bound. Dates use YYYY-MM-DD, numbers use a decimal point (finite scientific notation is accepted), choice values match exactly, and yes/no accepts true/false, 1/0 or EN/NL/TR yes/no labels. Required/unmapped or invalid values prevent those rows from reaching review. Existing contacts are never overwritten.

The review fingerprint includes current definitions and row values. A changed definition or duplicate snapshot prevents a stale commit; successful exact retries retain the original result. Contact exports include active and archived definitions, stable ID headers and typed values, with the existing formula protection, single-read snapshot, privacy and whole-file size rejection. False, zero and empty cells stay distinct.

## Installation and verification

Generated migration `0013_contact_custom_fields.sql` and `db/migrations/functions/custom-fields.sql` are applied through `scripts/custom-fields-plan.mjs`. The guarded transaction verifies the previous import digest/database/role, fingerprints every existing canonical People/public hub table and rejects changed records or unexpected initial field data. Rehearse on the verified isolated validation branch before onboarding. Notification queue indexing is the separate `0014_push_device_queue.sql` / `scripts/push-queue-plan.mjs` addition.

Tests use disposable PGlite, the actual People/import/export APIs and synthetic browser data. No hosted contact or field is created for validation. See [infrastructure receipts](INFRASTRUCTURE.md) and the [component gallery](design/COMPONENTS.md).
