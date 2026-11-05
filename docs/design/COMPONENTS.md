# Component and page reference gallery

Current implementation references: **2–3 November 2026**, owner-approved Airbnb comparison implementation. Images contain synthetic names and disposable local learning data only. The original [audit captures](audit-20261102/home.png) are historical before-images. The [design system](../DESIGN_SYSTEM.md) defines the current contract.

## Current phone composition

| Pattern | Reference | Contract |
| --- | --- | --- |
| Home | [390px](../../tests/design-baselines/home-390-nl.png) | Compact upcoming preview, then monthly overview, then shortcuts; scoped volunteer variant. |
| Directory | [320px](../../tests/design-baselines/contacts-320-nl.png) | Shared rows, quiet search, compact filter entry; one primary creation action. |
| Session detail | [390px](../../tests/design-baselines/session-390-nl.png) | Main work before optional supporting detail. |
| Attendance/payment roster | [390px](../../tests/design-baselines/attendance-390-nl.png) | Read-only short counts, disclosed amounts, visible row actions and secondary More menu. |
| Learning administration | [320px](../../tests/design-baselines/learning-320-nl.png) | Compact version/state; actions belong to the selected task. |
| Quiz Results | [390px](../../tests/design-baselines/results-390-nl.png) | Report before per-person detail; interactive graphs and text alternatives retained. |
| Learning wizard | [320px](../../tests/design-baselines/wizard-320-nl.png) | Four steps, one active section, no repeated visual orientation. |

## Complete components and states

| Component | References | Interaction contract |
| --- | --- | --- |
| Short form | [Open](../../tests/design-baselines/sheet-320.png), [invalid](../../tests/design-baselines/invalid-320.png) | No opening autofocus; persistent labels; inline associated native/domain errors; keyboard entry. |
| Mutation feedback | [Pending](../../tests/design-baselines/pending-320.png), [unconfirmed save](../../tests/design-baselines/failure-320.png) | Stable button geometry, disabled reviewed fields, retained draft and original retry identity. |
| Confirmation | [Discard](../../tests/design-baselines/discard-320.png) | Explicit destructive verb; cancellation keeps the draft; confirmed dismissal restores trigger focus. |
| More | [Menu](../../tests/design-baselines/menu-320.png) | Labelled 44px commands, consequential grouping, Escape restores focus. |
| Filters | [Active](../../tests/design-baselines/filters-320.png) | Immediately applied choice, active indicator, reset, no fake save. |
| Collection states | [Empty](../../tests/design-baselines/contacts-empty.png), [loading](../../tests/design-baselines/contacts-loading.png), [error](../../tests/design-baselines/contacts-error.png), [25 rows](../../tests/design-baselines/contacts-long-end.png) | Distinct meaningful feedback; normal document scrolling; short lists have no redundant completion message. |
| Larger text | [Results at 125%](../../tests/design-baselines/results-enlarged.png) | Wrapped tabs/controls and readable gutters; content is allowed to grow. |

Read-only counts use `MetricSummary`; actionable reporting uses `Statistic`. Refresh uses `UtilityButton`; mutations use `ActionButton`; entity navigation uses full-row links; destructive commands use `ItemActions` and the reviewed confirmation. Native date/select behavior and existing searchable entity pickers remain intentional. Correctness colors belong to released results, never decorative answer tiles or financial animation.

## Reproduce and review

Use Node 24, `npm ci`, and system Chromium (`/usr/bin/chromium`, or `HIMMAH_CHROMIUM_PATH`). In separate terminals:

```sh
npm run build
npm run start
```

```sh
npm run test:design
```

The script is hard-bound to **http://localhost:3101**, intercepts API traffic, and uses disposable PGlite/real learning API plus synthetic operational fixtures. The only simulated write is a delayed contact save returning HTTP 503. It never sends hosted participant/financial writes. Do not point it at a hosted service. It checks 84 visual states, including seven page compositions in NL at 320/390/768/1280px and EN/TR at 320px, plus sheet/invalid/pending/failure/discard/filter/menu, collection and enlarged-text states. It asserts no horizontal overflow/page exceptions, primary-task placement, tab-panel separation, unclipped navigation labels, field association/footer spacing, pending geometry/locking and focus restoration. Domain suites separately cover permissions, exact retries and data integrity.

Actual screenshots, differences and measured page positions go to ignored `.artifacts/design/`. PNG comparison requires equal dimensions and allows fewer than 0.5% strongly differing pixels (channel difference over 35) for minor rasterization. It supplements behavioral and human review; it is not an accessibility certification. Review the visible control, viewport and full-page composition rather than approving a threshold alone.

After an intentional change, inspect actual images and measurements, then use `npm run test:design:update` to update committed baselines. Run `npm run test:design` again to establish reproducibility; never update baselines merely to hide an unexplained failure. Chromium/font/platform differences can require a reviewed environment-specific baseline change. Keep image content synthetic and date/version this gallery when changing its design contract. Add a new state for a meaningful regression, not a test that merely mirrors a CSS class.

## Search coverage — 3 November 2026

All ordinary directory/picker searches now use SearchField, including RecordOptions, activity/group choices, attendance and Insights selectors. The command-palette primitive retains its distinct combobox semantics. Current added references: [activity-form picker at 320px](../../tests/design-baselines/activity-picker-320.png) and [attendance sheet at 320px](../../tests/design-baselines/attendance-picker-320.png). The browser harness checks shared ancestry, theme surface, inset icon alignment and touch height across visible search fields, including phone form/sheet contexts and no opening autofocus. Query/filter/pagination behavior is unchanged.

### People search correction — 3 November 2026

The earlier search pass missed ordinary text inputs in the shared People Picker and collection views. These now use SearchField too. Current references cover the reported [relationship form](../../tests/design-baselines/relationship-create-390.png), [contact-person form](../../tests/design-baselines/communication-create-390.png), [group assignment sheet](../../tests/design-baselines/contact-group-picker-390.png) and [group member list](../../tests/design-baselines/group-members-390.png), at both 320/390px. Contact methods/groups/relationships/communication and relationship-type management also have phone baselines. The harness checks spacing before results/filters, shared field anatomy, no opening autofocus and no overflow. Typecheck additionally rejects bare inputs wired to common query/search state; a negative run against the previous source correctly identified all seven missed definitions.

## Preferences — 3 November 2026

The shared account/preferences screen now follows the compact identity + divided-section pattern. Current references: [Dutch phone](../../tests/design-baselines/preferences-390-nl.png), [narrow Turkish](../../tests/design-baselines/preferences-320-tr.png), [desktop reading column](../../tests/design-baselines/preferences-1280-nl.png), [More menu](../../tests/design-baselines/preferences-menu.png), [all-device confirmation](../../tests/design-baselines/preferences-confirmation.png) and [expanded guidance](../../tests/design-baselines/preferences-help.png). Current-device action/status leads; all-device disable is secondary; the full language name fits its native control. Essential [blocked-permission](../../tests/design-baselines/preferences-denied.png), [iOS installation](../../tests/design-baselines/preferences-ios.png), [unsupported browser](../../tests/design-baselines/preferences-unsupported.png), [unavailable configuration](../../tests/design-baselines/preferences-unavailable.png), [loading](../../tests/design-baselines/preferences-loading.png) and [recoverable error](../../tests/design-baselines/preferences-error.png) states remain explicit.

`npm run test:design` now runs the existing 84 states plus `scripts/test-preferences.mjs` (20 additional states). The Preferences script uses local production assets, a synthetic account and mocked browser/device APIs. It checks 320/390/768/1280px and narrow EN/NL/TR, full language-label fit, reading width, no autofocus/overflow, action visibility, collapsed guidance, distinct device scope/confirmation cancellation, language changes/reload persistence and loading retry. It mocks subscription status and locale synchronization only; native permission prompts, real subscription changes/revocation and sign-out are not performed. Actuals go to ignored `.artifacts/preferences/`; reviewed baselines share `tests/design-baselines/` and update via the same explicit baseline command. This adds 20 to the core 84 references; it does not replace physical-device testing.

## Personal session notifications — 3 November 2026

Activity/session details retain their primary operational action. A compact outline bell control opens the shared simple sheet for personal following and reminder timing. Session inheritance is stated before the controls. Native options use short complete labels in EN/NL/TR; device permission is explained separately, without an automatic prompt. Current-task errors, locked exact retry and explicit conflict refresh follow the shared form contracts.

Current local synthetic references: [Dutch narrow](../../tests/design-baselines/follow-sheet-320-nl.png), [English narrow](../../tests/design-baselines/follow-sheet-320-en.png), [Turkish narrow](../../tests/design-baselines/follow-sheet-320-tr.png), [Dutch phone](../../tests/design-baselines/follow-sheet-390-nl.png), [tablet](../../tests/design-baselines/follow-sheet-768-nl.png), [desktop](../../tests/design-baselines/follow-sheet-1280-nl.png). The core visual harness opens the actual sheet, verifies no field autofocus/overflow, and saves changes-only settings with the reviewed version. SQL/API tests exercise permissions, overrides and event delivery independently; visual screenshots do not test push-provider delivery.

## Contact import — 3 November 2026

The Contacts header retains Add contact as primary; More contains Import contacts. The dedicated File / Columns / Review page uses the shared form width, native selectors, divided selection rows and inert MetricSummary totals. Phone progress puts each number above its complete label; advancing scrolls the progress into view without autofocus. Possible duplicates start unselected and show bounded existing/file matches. Unknown-save feedback precedes the retry action; the reviewed payload stays locked. The final count and View contacts action confirm completion without an account/participation side effect.

Current synthetic references: [Contacts menu](../../tests/design-baselines/contacts-import-menu-390.png), [Dutch mapping](../../tests/design-baselines/import-columns-320-nl.png), [Turkish review](../../tests/design-baselines/import-review-320-tr.png), [English enlarged review](../../tests/design-baselines/import-review-320-en-enlarged.png), [unconfirmed save](../../tests/design-baselines/import-unknown-390-en.png) and [completion](../../tests/design-baselines/import-complete-390-en.png). `scripts/test-contact-import.mjs` uses actual local SQL/API, safe synthetic files and rollback-isolated contexts. It covers 32 normal/enlarged/long-name EN/NL/TR phone/tablet/desktop states and a committed save whose first response is lost, proving the retry creates one contact. No real file/member data or hosted import is used. This harness is included in `test:design`.

## Data exports — 4 November 2026

Manage contains a divided Data exports entry. Contacts, Insights and session management use their shared More menus, preserving the primary operational action. The dedicated read-only filter page has one CSV download action; report-specific help stays brief and detailed format/limit/group definitions remain disclosed. File language is separate from interface language. Native date/state/report/language controls, the shared SearchField and paginated Insights picker keep existing form width, spacing, gutters and focus behavior.

The prepared/error message precedes Download, and scrolls with the action above fixed phone navigation without autofocus. Pending file reads lock their selected filters. Invalid dates remain editable. Read failures preserve choices, known access loss removes private context, and navigation/filter changes abort late responses. No discard dialog or automatic file generation is introduced for these read-only filters. The explicit success wording is CSV prepared, not proof that a browser saved the file.

`scripts/test-exports.mjs` uses real disposable local SQL/API for file contents, a controlled synthetic generation time and fresh browser contexts. It covers all seven report types, narrow EN/NL/TR, enlarged text, tablet/desktop, whole-session scope, historical groups, private/error/limit/pending/prepared/empty states and contextual entry. It reads an actual browser download and checks Unicode, selected data and formula protection. No hosted/member CSV is generated. This harness is part of `test:design`; current captures live in `tests/design-baselines/exports-*.png`.

Current export references: [Turkish enlarged contacts](../../tests/design-baselines/exports-contacts-320-tr-enlarged.png), [Dutch balances](../../tests/design-baselines/exports-balances-320-nl.png), [empty file](../../tests/design-baselines/exports-empty-390.png), [pending](../../tests/design-baselines/exports-pending-390.png), [read failure](../../tests/design-baselines/exports-error-390.png), [whole session](../../tests/design-baselines/exports-session-390.png) and [Insights menu](../../tests/design-baselines/exports-insights-entry-390.png). The new harness has 54 captures; the existing core gallery retains its 91 states with the affected secondary-action references updated.

## Searchable selection refinement — 4 November 2026

Export/Insights filters and learning context use full-width `SelectionOption` rows with a trailing circular check, selected surface/border, separate archived/date detail and an explicit Cancel action. Selection applies in one tap; no redundant Done control. Filter launchers and learning context use `PickerTrigger` with a value and chevron. People/attendance/record, activity audience, learning recipient and cash allocation multi-selects share `choice-row` spacing, trailing square checks and distinct disabled states, preserving selection limits, existing assignments and Add/Save behavior.

The export harness adds narrow EN/NL/TR and enlarged activity sheets, reopened selected group state, Escape/focus restoration and one current option checks. The core gallery continues covering contact/group assignment, activity-form and present/disabled attendance pickers. See current [group picker](../../tests/design-baselines/exports-group-picker-390.png) and [attendance picker](../../tests/design-baselines/attendance-picker-320.png). Native finite selects/date fields retain platform behavior.

## Custom fields — 5 November 2026

Manage → Contact fields uses the shared directory heading/divided rows and square More menu, with short definition sheets. Contact forms with active fields are reloadable pages in the standard reading column; Required labels and blank yes/no choices distinguish missing from false/zero. Profiles use a divided Additional details definition list. Import reuses explicit column controls; exports preserve typed values and safe headers. Native finite choices retain platform interactions.

`scripts/test-custom-fields.mjs` uses actual disposable People SQL/API and synthetic definitions to capture 29 EN/NL/TR phone/tablet/desktop/enlarged states. It checks no overflow, sheet/form no autofocus and consistent full-page actions. References include [phone definitions](../../tests/design-baselines/custom-fields-390-nl.png), [definition sheet](../../tests/design-baselines/custom-field-editor-390-nl.png) and [narrow contact form](../../tests/design-baselines/custom-contact-form-320-tr.png). Notifications retains the existing Preferences disclosure and shared follow sheet, adding the relevant quiet-hour explanation.

## Organization settings — 5 November 2026

The existing Organization route provides the owner/admin full form with General / Regional / Notifications sections and a contact-field link. Reuses the standard reading column, shared page surface/actions and input labels. The IANA timezone chooser uses shared choice rows/search with the current choice first; FormSurface's optional fixed footer keeps Cancel accessible for long lists. Native time inputs stack below 360px, including enlarged text, so AM/PM segments remain visible. Saved language affects new exports, leaving personal interface language intact.

`scripts/test-organization-settings.mjs` captures 24 phone/tablet/desktop EN/NL/TR/enlarged states through the actual Worker handler and disposable SQL, including save → Manage, default export language and visible picker footer. References: [Dutch form](../../tests/design-baselines/organization-settings-390-nl.png), [narrow enlarged actions](../../tests/design-baselines/organization-settings-actions-320-tr-enlarged.png) and [timezone sheet](../../tests/design-baselines/organization-settings-timezone-picker-390.png). Existing form no-autofocus, draft/version/retry and shared selection contracts apply.
