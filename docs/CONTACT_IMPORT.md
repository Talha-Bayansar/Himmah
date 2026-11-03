# Contact CSV import

First increment in the owner-approved sequence: contact import, exports, custom fields, duplicate management and organization settings. Notes/tasks remain deferred. This document describes contact import only; the other additions are not shipped by this increment.

## Staff flow

Owners/admins open **More → Import contacts** from the contact directory. The independently reloadable page uses File / Columns / Review steps, shared controls and normal document scrolling. Reloading starts a fresh import: private drafts are held in memory, never local storage or service-worker caches. Navigation away confirms discarding the file/mapping/review; no field is autofocused.

1. Choose a UTF-8 CSV, at most 1 MiB, 50 columns and 500 non-empty contact rows, with a header and comma/semicolon/tab separators. PapaParse handles quoting, escaped quotes, BOM and quoted line breaks. Invalid UTF-8, inconsistent columns and malformed quoting are rejected. The original file stays on the device; only mapped valid contact fields go to the API for duplicate review and saving.
2. Map display name, given name, family name, email and phone. Each source column may be used once; unmapped columns are ignored. A missing display name is composed from given/family names. Existing contact validation applies: names up to 120 characters, valid email, international phone with an explicit country code. There is one optional method per kind; imported methods are not automatically preferred. Invalid rows require fixing the file or an explicit skip. Groups/relationships/custom fields are not guessed from unknown columns.
3. Review names, methods and possible duplicates. Matches use exact case-folded/collapsed display name, normalized email or international phone within the current organization, including archived contacts and matches inside the file. This is a suggestion, not verified identity or fuzzy matching. Possible duplicates start unselected. Select one only when it represents a different person; a shared family phone/email does not prove duplication. Select new contacts never selects possible matches. An explicit selection creates new contacts only; existing contacts are never overwritten, merged or restored.
4. Save the selected contacts together. The success view gives created/skipped counts and a return to Contacts. Invalid and deliberately unselected rows are included in the skipped total.

Review rows expand in batches of 25 in document flow. Invalid-row guidance lists at most ten row references alongside the full explicit skip count. Each row shows at most three existing-contact names and five other file-row references, with full match counts. No nested scrolling directory, new navigation tab or stacked primary actions is introduced. EN/NL/TR use the same layout.

## Integrity

Every preview/write requires verified staff and current owner/admin access in the API; SQL independently enforces active canonical staff membership and tenant scope. Native CSV values are rendered as text, never HTML, formulas or executable content. No file, filename or contact values are logged, stored in import receipts or sent to third-party parsing services.

The final command carries canonical mapped rows, explicit selected row numbers, the review snapshot and actor-scoped request UUID. The server validates all rows and rechecks the duplicate snapshot under the organization lock used by ordinary contact commands. A new/changed possible match causes a conflict before any contact is written. A refreshed review restores safe default selection and requires another explicit save.

Contact/method inserts, create audit events and the command receipt commit in one transaction. Any error rolls back the whole batch. Receipts retain only the payload hash and counts, are immutable, and are replayed only after current authorization. A lost response locks the reviewed choices and retries the identical key/body; it never recreates the batch using a new key. Preview failure creates no records. Multiple deliberate imports with different keys can still create duplicates after explicit review; permanent deduplication/merging is a separate increment.

Imports create no accounts, invitations, groups, relationships, registration, attendance, debt, payments or notification events. Existing records and histories remain unchanged. Dedicated normalized-name and active-method indexes support bounded duplicate reviews.

## Installation and verification

Generated migrations `0011_contact_import.sql` / `0012_contact_import_lookup.sql`, functions `db/migrations/functions/contact-import.sql`, and guarded `scripts/contact-import-plan.mjs`. The additive plan verifies the Himmah database/role, prior following digest and absence of this installation. It hashes all existing canonical People/public hub rows before/after, aborts on changes and creates no contacts during installation. Test against a verified isolated branch before applying to onboarding; reserved main is excluded.

Tests use disposable local SQL and synthetic CSVs. They cover parsing/limits, selections, archived/shared-method matches, snapshot conflicts, current access/replay, atomic rollback, unknown saves, invalid-row skipping and draft guards. Browser visual evidence and hosted rollout receipts are recorded separately in infrastructure history; no real member list is used for validation.
