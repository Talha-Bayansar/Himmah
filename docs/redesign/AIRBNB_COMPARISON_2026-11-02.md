# Airbnb mobile reference compared with Himmah

Review date: **2 November 2026**. Himmah application source: **a0f0d18**. This is an assessment and proposed improvement order, not authorization to replace the adopted [design system](../DESIGN_SYSTEM.md) or change product behavior.

## Assessment

Himmah's design document captures the useful Airbnb principles well. The implementation applies its colors, controls and list anatomy more consistently than its page-level information hierarchy. The largest remaining gap is how much context, metadata and navigation appear **before the task**. A page can use correct buttons and spacing tokens and still make users scroll to find their work.

My recommendation is a focused composition and consistency pass, beginning with session detail, attendance management and learning detail. A replacement palette, proprietary font, new illustration library or another full redesign would not address the strongest observed problems.

## Evidence and limits

- **Published Airbnb evidence:** first-party 2025/2026 mobile product releases, host-tool and reservation guidance, accessibility statement, and first-person historical DLS/typography accounts. Sources are listed below. Host operations are a closer reference for Himmah staff than guest accommodation discovery alone.
- **Observed Himmah evidence:** fresh Chromium renders of the current production assets, in Dutch at 390×844 and 320×844. Seven pages at each width plus the contact sheet at each width: **14 page views and two sheet views**. Header/nav, actual rendered typography, content positions and document overflow were inspected. No page exceptions or horizontal document overflow occurred in these samples.
- Core operational pages used synthetic API fixtures to inspect presentation; learning used the actual local API/SQL with disposable fixtures. These are not hosted customer records, a production-data audit or proof of every behavior/state. Fresh screenshots are linked below. Older design references were inspected as historical context, not treated as the current app.
- **Airbnb limitations:** no authenticated native iOS/Android walkthrough, app build-specific inspection, private design-system access or pixel measurement of Airbnb's native interface was performed. The web research interface exposed linked official mobile asset references/descriptions, but did not provide decoded image pixels for visual measurement. Conclusions about Airbnb use published evidence; aesthetic/composition judgments about Himmah are our analysis. Exact current Airbnb font metrics, spacing, radii, animation curves and behavior are not established here.
- Recommendations are explicitly proposed. This review changes documentation and synthetic evidence only, not application UI, schemas, permissions, scoring or money flows.

## What the Airbnb evidence establishes

**A system of meaningful components.** Saarinen's historical DLS account describes reusable components with required/optional content and platform conventions, rather than only isolated style tokens [A1]. The relevant lesson is consistent anatomy and composition. It does not prove that every current Airbnb component has an unchanged historical API.

**Typography is managed as a system.** Airbnb's 2018 Cereal account describes named type styles, real-content testing and coordinated cross-platform integration [A2]. Himmah can apply that approach with its system font; this is not evidence that we should obtain or copy Cereal, nor a specification of Airbnb's current type scale.

**Organize around the user's current job.** Airbnb's host guidance describes Today as the opening destination for current/upcoming reservations, with Calendar, Listings, Messages and Menu serving distinct work [A3]. The 2026 reservation update brings common actions, times, notes and relevant changes into reservation context [A4]. This supports evaluating Himmah by how quickly staff can reach the current session and its work.

**The product language has evolved.** The 2025 announcement explicitly describes a dimensional, animated design direction [A5]. The 2026 release describes further homepage, planning and booking changes [A6]. These are references for intentional expression and evolving composition, not a reason to decorate an attendance roster or freeze Himmah around a 2016/2025 screenshot.

**Accessibility requires more than appearance.** Airbnb describes mobile assistive-technology, text-size and small/large-phone testing, reduced motion and Load more, while disclosing limitations [A7]. Himmah's own WCAG 2.2 AA target should remain its acceptance standard; neither Airbnb's statement nor our automated checks establish full conformance.

## Three-way comparison

“Strong” means the evidence supports the direction; it is not an Airbnb similarity percentage or accessibility certification.

| Area | Airbnb reference / principle | Himmah document | Current Himmah assessment |
| --- | --- | --- | --- |
| Job-focused hierarchy | Today and contextual reservation work [A3, A4] | Strong: identity, state, next action first | **Partial.** Session management and attendance rows appear late; quiz administration precedes tab content. |
| Component consistency | Required/optional anatomy and reuse [A1] | Strong: directories, shared sheets, one padding owner | **Strong foundation, partial composition.** Directories/sheets are consistent; feature-level headings and summaries still have separate layout implementations. |
| Typography | Named roles and realistic content testing [A2] | Defines page/body/supporting roles; hierarchy is required | **Partial.** Main titles are consistent, while section/row/metric roles are often defined separately in feature CSS. |
| Useful whitespace | Our interpretation of hierarchy and content grouping | Clear relationship-based spacing rules | **Partial.** Controls have sensible internal spacing, but stacked section gaps create an excessive preamble on some pages. |
| Contextual actions | Reservation work stays in context [A4] | One prominent action; compact secondary actions; explicit exceptions | **Mixed.** Menus and quick payment are good; the correct main action is not always near the relevant identity. |
| Forms and task focus | Historical reusable patterns plus current contextual work [A1, A4] | Strong page/sheet classification and no autofocus | **Mostly strong.** Contact sheet and payment sheet are good references. Wizard orientation repeats several labels before editing begins. |
| Reporting | Clear information and decisions; no claim of a specific Airbnb graph library | Interactive shadcn/Recharts, textual alternatives and explicit definitions | **Strong recent improvement.** Question/score reports use progressive detail; their parent page still delays access. |
| Responsive navigation | Platform conventions and responsive components [A1] | Stable destinations, readable labels, safe areas | **Mostly strong.** No overflow in sampled views; the Activities label truncates on the 320px phone. |
| Expression and motion | Published dimensional/animated direction [A5] | Restrained staff UI, playful invitee exception, reduced motion | **Intentional difference.** Forest identity and playful quizzes are appropriate; no basis for adding ornamental motion to routine staff work. |
| System validation | Coordinated product testing [A2, A7] | Strong review checklist | **Needs stronger durable tooling.** Current checked-in tests mainly assert behavior; fresh screenshot scripts remain task-local, and some older reference images no longer match current components. |

## Concrete findings

### 1. Session detail delays its main action — high priority

In the paid, optional-registration fixture, **Manage attendance and payments** starts at y≈1028 on the 390px screen and y≈1187 at 320px. Both exceed the 844px viewport, with usable content ending earlier above fixed navigation. Source order places schedule, pricing, statistics, registration, audience, location, description and session information before that action.

This conflicts with the document's task-first principle even though the individual sections look coherent. Move the primary management entry beside/below the session's essential identity/time/short counts, before optional background detail. An adaptive action region is another possibility, provided it respects bottom navigation, keyboard and safe areas. Keep actual cancellation, scope and payment restrictions visible; do not hide them to achieve an arbitrary height.

Evidence: [session render](../design/audit-20261102/session.png); owning implementation [Sessions.tsx](../../src/activities/Sessions.tsx), especially the full-detail section and `session-actions-primary` after supporting sections.

### 2. Attendance management gives too much initial space to context — high priority

The first present-contact name begins at **y≈769 / 797** on the 390px / 320px samples. At 390px it is at the fixed bottom-navigation boundary. Staff see the title, Add action, repeated session identity, date, six summary values, a partial-payment explanation and search before the list they came to manage.

Keep a short identity/date summary, compact present/paid/unpaid totals and Add/search accessible. Put detailed monetary breakdowns in a clearly labelled expansion, while preserving essential restrictions and relevant payment exceptions. Keep row-level paid/unpaid actions visible and preserve the existing unified attendance/payment model.

Evidence: [management render](../design/audit-20261102/attendance.png); [Attendance.tsx](../../src/attendance/Attendance.tsx) and [SessionStats.tsx](../../src/attendance/SessionStats.tsx).

### 3. Learning detail has a long administrative preamble — high priority

In the populated open-quiz fixture, participant search starts at **y≈779 / 890**. In Results, the insights heading begins at **y≈611 / 722**. Back navigation, a wrapping title, state, Live quizzes, a full-width publication selector, contextual sharing/counts and result-release text precede the tabs and their content. The 320px tab wrap is now structurally correct, but consumes another row.

Use a compact quiz identity/version/status region and put tab navigation closer to it. Define actions by the selected task: sharing/assignment for Participants, editing for Questions where authorized, report controls for Results. Older-version and held-result state must remain explicit, but can be concise. Do not remove version safety or release controls.

Evidence: [learning render](../design/audit-20261102/learning.png), [narrow Results render](../design/audit-20261102/results-narrow.png); [Learning.tsx](../../src/learning/Learning.tsx). The new [LearningInsights](../../src/learning/LearningInsights.tsx) content is not the main source of this preamble.

### 4. Home is coherent, but its promised overview is spread over several screens — medium priority

The three upcoming entries are useful, consistently styled and bounded. In this fixture, **Quick actions starts at y≈701 and This month at y≈1047** on the 390px screen. At 320px the monthly section starts near y≈1087. This is not a layout failure: content must scroll. It does mean Home's actions and insights are subordinate to a relatively tall three-entry preview and four administrative shortcuts.

Consider a compact next-session / current-work emphasis, a short monthly insight teaser and fewer highest-value shortcuts, with clear routes to the full agenda/report. Choose ordering based on staff tasks, not on copying Airbnb guest discovery. Preserve the capability-specific volunteer view and all comparison definitions.

Evidence: [Home render](../design/audit-20261102/home.png); [Dashboard.tsx](../../src/dashboard/Dashboard.tsx), [SessionList.tsx](../../src/dashboard/SessionList.tsx).

### 5. The wizard repeats orientation; the sheet is a better density reference — medium priority

The first title input starts at **y≈493 / 514**. The page title/intro, four-step navigation, Step 1 of 4 line and Details section heading consume much of the first screen. The wizard is a useful owner-requested workflow; its existence is not the issue. Remove redundant orientation text or repeated section naming, retaining progress, validation, review and navigation.

The contact sheet already has a focused title, short explanation, labelled controls and a compact action row. The existing quick-payment sheet likewise concentrates on person, amount, consequence and save. Retain these patterns.

Evidence: [wizard](../design/audit-20261102/wizard.png), [fresh contact sheet](../design/audit-20261102/contact-sheet.png), [existing quick-payment reference](../design/quick-payment-mobile.png); [LearningEditor.tsx](../../src/learning/LearningEditor.tsx), [FormSurface](../../src/components/shared/form-surface.tsx).

### 6. Some small details still feel like administrative scaffolding — lower priority

The contact directory is consistent and scannable, but the separate archived checkbox row adds height above results, and a short three-record list always ends with a full end-of-list sentence. A more compact filter affordance and quieter conditional pagination completion could improve the experience. This is an opportunity, not a violation of the current pagination contract.

At 320px, the bottom Activities label is ellipsized. Prefer a tested short mobile label or a layout that keeps the destination readable; preserve accessible full labels. The long organization name truncating in a compact switcher is a different, intentional case because the switcher provides its full context.

Evidence: [contacts](../design/audit-20261102/contacts.png), [320px navigation](../design/audit-20261102/results-narrow.png); [infinite-list.tsx](../../src/components/shared/infinite-list.tsx), workspace navigation styles in [workspace.css](../../src/styles/workspace.css).

## What to strengthen in our guidelines

The present guidelines are largely sound. Proposed additions should make them executable rather than add more aesthetic adjectives:

1. **Page composition contracts:** for a list, entity detail, working roster, report and wizard, specify identity, essential status, main task, secondary detail and action placement. Assess the composed page, not just each component.
2. **A small set of complete typography roles:** define section title, row title, field label, metadata, metric and amount styles alongside page/body/supporting text. Different staff and invitee roles are valid; local numeric values should express a named role rather than an independent preference.
3. **Spacing ownership and hierarchy:** distinguish an element's internal spacing from the sum of neighbouring section gaps. Avoid fixing every instance of “crowded” by adding padding.
4. **Task-specific actions:** define which action leads each tab/view. One primary button is insufficient if it belongs to a different task or sits after a long informational preamble.
5. **One summary anatomy with explicit variants:** reuse foundations for reporting, session counts and live counts, while preserving read-only versus interactive meanings and different denominators. Do not make a number look tappable when it has no useful destination.
6. **Durable visual review:** keep a current component/reference gallery and reproducible browser snapshots for long EN/NL/TR titles, short/large datasets, small phones, enlarged text and relevant states. Add overlap/gutter/action-visibility checks. The prior tab-height bug demonstrates why a no-overflow assertion alone is insufficient.
7. **Separate stored references from current evidence:** some older gallery images show superseded cards/navigation or the wizard's former iconless Back control. Current code has those fixes. Date/version references so a screenshot is not mistaken for a current defect.

These are recommendations, not changes to the standing design document in this review.

## Recommended order

| Order | Work | Acceptance |
| --- | --- | --- |
| 1 | Session detail + attendance composition | The main management entry precedes optional detail; present contacts are reachable without a full page of context; required restrictions remain visible. |
| 2 | Learning detail + wizard hierarchy | Tab content appears sooner; version/release remain clear; repeated orientation is reduced; all existing draft/retry/permission behavior survives. |
| 3 | Shared type/summary/action anatomy and durable visual checks | Components have explicit roles, predictable spacing and representative long-content references; small-phone tab/toolbar collisions are caught automatically. |
| 4 | Home balance, filter/pagination polish and narrow navigation labels | Current work, next steps and insight entry are easy to discover; short lists remain quiet; destination labels stay understandable. |

Keep Himmah's forest/neutral identity, system font, compact people rows, privacy-aware neutral avatars, professional staff UI and deliberately playful invitee experience. Airbnb's proprietary typeface, travel photography, product categories and expressive 3D icons are not prerequisites for this improvement. Native haptics, exact motion matching, Safari keyboard behavior and screen-reader operation require separate direct device evidence.

## Sources checked

- **A1:** [Airbnb Design Language System — Karri Saarinen](https://karrisaarinen.com/dls/). Historical first-person component/platform account.
- **A2:** [Working Type — Airbnb Design](https://medium.com/airbnb-design/working-type-81294544608b), 18 December 2018. Named typography roles and realistic cross-platform integration; historical, not a current token specification.
- **A3:** [Exploring your hosting tools — Airbnb](https://www.airbnb.com/resources/hosting-homes/a/exploring-your-hosting-tools-738), 10 December 2025. Today/current work and distinct hosting destinations.
- **A4:** [Reservations, redesigned — Airbnb](https://www.airbnb.com/resources/hosting-homes/a/reservations-redesigned-765), 20 May 2026. Contextual reservation actions and information.
- **A5:** [2025 Summer Release announcement — Airbnb](https://news.airbnb.com/en-uk/2025-summer-release-now-you-can-airbnb-more-than-an-airbnb), 13 May 2025. Rebuilt app and stated dimensional/animated direction.
- **A6:** [2026 Summer Release — Airbnb](https://news.airbnb.com/product-releases/airbnb-2026-summer-release), 20 May 2026. Subsequent mobile homepage, discovery and planning changes.
- **A7:** [Accessibility Statement — Airbnb](https://www.airbnb.com/help/article/3928), accessed 2 November 2026. Testing practices, accessibility features and disclosed limitations.

The [original research](AIRBNB_DESIGN_RESEARCH.md) remains historical evidence; the [Himmah design system](../DESIGN_SYSTEM.md) remains the adopted implementation contract. This comparison proposes priorities without silently changing either product requirements or the approved palette.

Validation for this documentation review: fourteen fresh page renders and two sheets at the stated sizes had no page exceptions or horizontal document overflow. This does not establish all-state usability or accessibility. Documentation links and Git diff checks run separately; no application regression suite, native Airbnb app test, hosted database operation or application deployment is part of this review.
