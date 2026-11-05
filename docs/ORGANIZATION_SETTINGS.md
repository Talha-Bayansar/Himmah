# Organization settings

Owner-prioritized increment, 5 November 2026. Organization settings is implemented before duplicate management, which remains deferred. Manage → Organization settings is the existing reloadable `/workspace/$organizationId/organization` page. Owners/admins edit; volunteers retain the previous read-only organization details and cannot read the private settings API.

## Scope and defaults

- General: organization name, optional plain-text description (1,000 characters), contact email and international phone number. These are organization contact details; saving them does not send email, invite anyone or change an account. The workspace address/organization ID remain stable.
- Regional: organization timezone and EN/NL/TR default language. Reports and new activity defaults use the organization timezone. Existing activities, sessions, recurrence wall times, attendance and money retain their saved snapshots; settings never retime them. A timezone change may legitimately alter report calendar windows.
- Default language initializes new exports unless an explicit file language is chosen. It never changes personal interface language, existing files, quiz content or device notification language. Previously unconfigured organizations retain personal-language export fallback; the first explicit settings save establishes the chosen organization default.
- Notification quiet hours: enable/disable plus minute-precision start/end in the organization timezone, including windows crossing midnight. Enabled start/end must differ. Defaults remain 22:00–08:00 until configured. The delivery policy searches real instants across timezone/DST transitions, skips expired reminders and retains the imminent-cancellation exception, routine cooldown, debounce and redundancy checks. Personal follows and device consent remain separate.
- Contact fields: contextual link to the existing manager; no duplicate implementation or new navigation tab.

Saving quiet hours/timezone schedules policy-only pending deliveries for re-evaluation on the next job. Provider failure backoff is preserved. Saving settings generates no notifications or follows and never performs native delivery itself.

## Forms and integrity

The complex form is one page with General / Regional / Notifications sections, shared controls and one Save/Cancel pair. Time controls stack on narrow phones to avoid native AM/PM clipping. The timezone sheet reuses SearchField/SelectionOption, shows the current choice first, searches a fixed public IANA reference list in batches of 50 and keeps Cancel outside the scrolling options. No opening autofocus; normal focus restoration and unsaved-change guards apply.

Failed unconfirmed saves lock the reviewed payload/request identity for exact retry. Background refresh/errors preserve the draft. A newer version is announced without replacing edits; Reload latest requires explicit discard when dirty. Confirmed success leaves without a second discard prompt. All stored details are bounded/validated by API and SQL. Current owner/admin access precedes command receipt replay. Per-organization locking, versions, mirrored canonical organization names, audit and immutable exact receipts commit atomically; failures roll back all changes. API output is private/no-store; settings caches clear on access/verification loss and sign-out.

## Installation and verification

Generated `0015_organization_settings.sql` adds `hub_organization_settings` and `hub_organization_settings_requests`; no existing rows/defaults are rewritten. `db/migrations/functions/organization-settings.sql` supplies the command/receipt guard. `scripts/organization-settings-plan.mjs` verifies the existing push-index digest, database/role, records fingerprints of every prior public hub/canonical People table, and rejects changed rows or unexpected initial settings data. Rehearse on the verified isolated branch before onboarding; preserve provider schemas and unrelated databases.

SQL/API tests cover scope, version conflicts, retries, role loss before replay, full audit-failure rollback, canonical-name sync, unchanged session snapshots and preservation of provider backoff. Native Workerd tests exercise the registered GET/POST route and security gates. Browser tests use createHandler plus real disposable SQL to verify save → Manage, default export language without interface-language changes, no autofocus, phone/enlarged layouts and the fixed picker footer. No hosted settings, contact records or real-device pushes are created for validation. See [notification behavior](SESSION_FOLLOWING.md) and [rollout receipts](INFRASTRUCTURE.md).
