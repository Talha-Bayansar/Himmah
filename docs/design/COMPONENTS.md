# Component and page reference gallery

Current implementation reference: **2 November 2026**, owner-approved Airbnb comparison implementation. Images contain synthetic names and disposable local learning data only. The original [audit captures](audit-20261102/home.png) are historical before-images. The [design system](../DESIGN_SYSTEM.md) defines the current contract.

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

The script is hard-bound to **http://localhost:3101**, intercepts API traffic, and uses disposable PGlite/real learning API plus synthetic operational fixtures. The only simulated write is a delayed contact save returning HTTP 503. It never sends hosted participant/financial writes. Do not point it at a hosted service. It checks 62 visual states, including seven page compositions in NL at 320/390/768/1280px and EN/TR at 320px, plus sheet/invalid/pending/failure/discard/filter/menu, collection and enlarged-text states. It asserts no horizontal overflow/page exceptions, primary-task placement, tab-panel separation, unclipped navigation labels, field association/footer spacing, pending geometry/locking and focus restoration. Domain suites separately cover permissions, exact retries and data integrity.

Actual screenshots, differences and measured page positions go to ignored `.artifacts/design/`. PNG comparison requires equal dimensions and allows fewer than 0.5% strongly differing pixels (channel difference over 35) for minor rasterization. It supplements behavioral and human review; it is not an accessibility certification. Review the visible control, viewport and full-page composition rather than approving a threshold alone.

After an intentional change, inspect actual images and measurements, then use `npm run test:design:update` to update committed baselines. Run `npm run test:design` again to establish reproducibility; never update baselines merely to hide an unexplained failure. Chromium/font/platform differences can require a reviewed environment-specific baseline change. Keep image content synthetic and date/version this gallery when changing its design contract. Add a new state for a meaningful regression, not a test that merely mirrors a CSS class.
