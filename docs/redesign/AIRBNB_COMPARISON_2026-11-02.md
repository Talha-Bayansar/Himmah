# Airbnb mobile reference compared with Himmah

Review date: **2 November 2026**. Himmah application source: **a0f0d18**. This is an assessment and proposed improvement order, not authorization to replace the adopted [design system](../DESIGN_SYSTEM.md) or change product behavior.

## Assessment

Himmah's design document captures the useful Airbnb principles well. The implementation applies its colors, controls and list anatomy more consistently than its page-level information hierarchy. The largest remaining gap is how much context, metadata and navigation appear **before the task**. A page can use correct buttons and spacing tokens and still make users scroll to find their work.

My recommendation is a focused composition and consistency pass, beginning with session detail, attendance management and learning detail. A replacement palette, proprietary font, new illustration library or another full redesign would not address the strongest observed problems.

Component-level follow-up: the [appearance and interaction comparison](#component-appearance-and-interaction-comparison) finds that pending-button geometry, sheet draft/focus handling, menu dismissal and chart selection work well in sampled states. The clearest component gaps are feedback wording/presentation, confirmation verbs and explicit role/state contracts.

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

## Component appearance and interaction comparison

Extension requested after the page-level review. The existing native-Airbnb evidence limits still apply: **Himmah geometry and states below are directly inspected; exact current Airbnb component geometry, haptics, springs and sheet detents are not verified.** Historical visual evidence [A1, A2, A10] is identified as historical. Current help/release sources establish particular interactions, not an undocumented universal component specification.

### Overall component finding

Himmah has a credible shared component foundation. Its buttons, fields, menus and short sheets are substantially more coherent than the uneven page compositions might suggest. The remaining component work is chiefly about **clearer differences between component roles, more contextual feedback, and complete state contracts**. More shadows, pill shapes or animation on every component would not be a justified response.

Airbnb's historical design account describes restrained controls, typographic communication and motion that connects overview to detail [A10]. Its current documented wishlist interaction puts a recognisable action directly on the relevant listing [A9]; search exposes task-specific parameters and filters [A8]. The transferable lesson is that the component's appearance, location and response should explain its job. It is not that every Himmah component should resemble an accommodation card.

### Appearance: comparison by component

The final column is a proposed Himmah direction, not a measured Airbnb token replacement.

| Component | Airbnb evidence / comparison boundary | Current Himmah appearance | Assessment and proposed direction |
| --- | --- | --- | --- |
| Primary, secondary and text buttons | Historical primary-action emphasis [A10]; contextual current host actions [A4]. Exact current fills, radii and heights unmeasured. | Forest filled primary; outlined secondary; forest text links. Normally 48px minimum, 12px corners, 16px semibold text; many actions include a 16px icon. | Good consistency. Define when each emphasis level is used, with fewer redundant icons on obvious text actions. Reserve full-width treatment for the task that warrants it, not every secondary route. Retain visible labels for money actions. |
| Icon controls / utility toolbar | Historical emphasis on understandable symbols plus text [A10]; current details keep actions contextual [A4]. | Quiet 44px More trigger versus frequently outlined 48px Refresh; Lucide glyphs use accessible action names. | Different roles can justify different treatments, but the rules should be explicit. Specify utility-button emphasis and alignment as a family; do not infer a button's importance from whichever variant a feature happened to use. |
| Cards, directory rows and avatars | Listing content and a heart action are documented [A9]; photography-led browsing is historical evidence [A10], not an operational-roster requirement. | Flat white cards with 20px corners; compact divider rows, neutral initial/icon avatars, name, metadata and trailing chevron/menu. | Directory rows are a strong adaptation. Keep people private and text-led. Define separate anatomy for a navigable row, informational summary and working roster so they do not all accumulate bordered containers and buttons. |
| Text fields and textareas | Search parameters/grouping are documented [A8]; a universal current floating-label style is **not** established. | White, visibly bordered controls, normally 48px high, 12px corners and 16px text; external semibold labels and separate help. | Legible and coherent, though a long stack of equally boxed controls can feel administrative. Strengthen field grouping and local help/error hierarchy. Do not replace persistent labels with placeholders or remove useful input boundaries to look lighter. |
| Search and filter controls | Dedicated search inputs and filters narrow choices [A8]; September 2026 adds further search/filter features with rollout qualifications [A11]. | Quiet inset-icon directory search, but some roster searches use a separate icon and outlined input. Archived filtering occupies its own checkbox row. | Consolidate search anatomy and active-filter presentation. A compact labelled filter control can save space; it must show active state and a clear reset. Copying Airbnb's destination/date search or adding AI is unnecessary. |
| Selectors and date/time controls | Parameter-specific search and calendar editing are documented [A8, A12]; native popup geometry is unverified. | Native selects styled like text fields; selected publication often consumes a whole row. Date/time inputs retain browser/platform pickers; longer entity choices use searchable sheets. | Keep native controls where their simplicity helps. Use compact read-only context for a single immutable version; a labelled selector when there is a real choice; searchable pickers for growing entity lists. Preserve timezone/DST rules. A rich custom calendar is a separate usability decision, not an automatic visual upgrade. |
| Tabs, segmented controls and steps | Stable destinations and platform conventions are documented [A1, A3]; exact current indicator animation is unverified. | Underlined route tabs for People; quiet filled segments for learning; numbered/checkmarked wizard steps. Main phone navigation has icons, labels and a short active marker. | These are valid distinct semantics. Name the three patterns and govern their spacing, selected states and wrapping. Improve narrow labels and avoid repeated step labels. Keep the recent auto-height fix. Do not replace route links with fake tab buttons. |
| Bottom sheets and confirmation dialogs | Focused editing and contextual actions are supported [A4, A12]; a universal Airbnb sheet shape/drag policy is not verified. | Warm sheet surface, 24px top corners, drag handle, dim overlay, labelled header and scrollable body. Confirmations use a distinct alert dialog. | The short sheet is one of our strongest components. Specify footer ownership, long-title behavior, dismissal and dirty-state handling. Keep the owner-approved no-autofocus behavior. Physical keyboard/drag/viewport behavior still needs device testing. |
| More menus | Current wishlist documentation uses a three-dot menu for management; the written example is desktop-specific [A9]. Native menu presentation is not verified. | Quiet square More trigger, floating white menu, labelled icons, 44px items, wrapped text, destructive variants. | Clear and usable. Use grouping/separators where consequential actions sit beside routine ones, and keep frequent working actions outside More. Do not replace every menu with a large action sheet for visual uniformity. |
| Checkboxes, selection rows and switches | Airbnb describes parameter selection and bulk edits [A8, A12]; exact checkbox/switch geometry is unverified. | Directory checkboxes render at 24px inside a labelled 44px row; selected roster/picker rows use checked state and quiet forest emphasis. Library switches have separate, smaller geometry. | Evaluate the actual clickable row, not just the glyph. Keep selected, disabled and already-present states distinct with text where needed. The installed switch primitive is not proof of a shipped touch-target bug; any use must provide a sufficient interaction target. |
| Statistics, status and chart components | Contextual information/actions are supported [A4]; September host dashboard enhancements are announcements, not proof of universal availability [A11]. No Airbnb graph-library claim is made. | Divided metrics with large values; semantic direction text/icons; interactive comparison sheets and Recharts graphs. Session/live/learning counts have separate implementations and different interaction semantics. | Recent reporting is a strong improvement. Share visual anatomy while explicitly distinguishing read-only totals, drill-down metrics and editable state. Preserve text, denominators and keyboard/touch readouts; avoid making every number look clickable. |
| Loading, empty, error and success feedback | Airbnb states reduced-motion and Load more support [A7]; its complete native loading/error component set is unverified. | Generic pulsing skeletons; inline status; several error patterns; unconditional end-of-list text; local copy/save feedback. | This needs more consistency than the normal buttons do. Match skeletons to the eventual component, keep short-list completion quiet, and unify error anatomy and task-specific recovery language. A toast is optional; accurate local feedback is essential. |
| Decorative / playful components | Published dimensional direction [A5] and historical expressive transitions [A10], without measured current timing. | Staff UI is restrained. Invitee quizzes deliberately use pastel answer tiles, letter badges, an emblem and score ring. | Keep the staff/invitee distinction. The quiz's tactile choices already provide appropriate personality. Do not apply game-like colors, celebration or dimensional effects to cash and attendance operations. |

### Interaction: direct checks in Himmah

Additional local probes exercised the current production assets with synthetic data at **390×844 and 320×844**, producing **24 recorded component-state observations**. A further Dutch 390px graph flow passed eight checks, including bar/native selection, textual feedback, question selection, refresh/reload, empty/guest states and zoom. These are targeted samples, not a complete accessibility audit. The failed-save response was deliberately mocked; no hosted records or money were written.

| Interaction | Direct result | What this means |
| --- | --- | --- |
| Open contact sheet | No field was autofocused at either width. Pressing Tab entered the first name field. | The no-autofocus requirement coexists with normal keyboard entry. Preserve it rather than copying an assumed Airbnb keyboard behavior. |
| Save → pending | Save kept the same position and approximately **110×50px** size at both widths. Save and Cancel disabled, `aria-busy` became true and the spinner appeared. | An initial source-level concern about two simultaneous icons was disproved by the rendered check: shared CSS hides the original icon while busy. This is a positive example, not a pending-button defect. |
| Failed save | The typed name remained, buttons became usable again and an alert appeared. | Draft retention works in the sampled failure. The error's visual hierarchy and wording need improvement; server-side exact replay was not tested by this mocked response. |
| Cancel dirty sheet | One confirmation appeared. Cancelling that confirmation retained the typed draft. Explicitly discarding then closed the sheet and restored focus to Add contact. | Guarding unsaved work and focus restoration worked at both widths. The confirmation's final verb is the weakness, not the existence of the confirmation. |
| Open More → Escape | The sampled menu items were 44px high. Escape closed the menu and restored focus to its trigger. | Good target sizing and dismissal behavior. Preserve this when changing visual treatment or grouping. |
| Keyboard tab selection | ArrowRight moved the learning selection to Participants and updated the `tab=participants` URL. | The selected visual state is connected to real navigation state. Keep route tabs and in-page tabs semantically distinct. |
| Archived checkbox | The checkbox checked/unchecked successfully and its visual box measured 24×24px. Its label row provides the larger target. | The small indicator alone is not an adequate basis for declaring a touch-target failure. |
| Chart selection | The score selector and tapping a bar produced the matching textual count and correct tooltip; question selection changed the displayed analysis. | Interaction is available beyond hover, with useful persistent feedback. This is already closer to the documented intent than a static decorative graph. |

Source-backed interactions not timed or directly exercised in this extension: button press scale/color, route transition continuity, native select/date popup behavior, drag dismissal and software-keyboard repositioning. Shared buttons define a short 120ms press transition and 0.98 press scale; quiz tiles define a small pressed displacement under normal motion. Global reduced-motion rules suppress animation/transition durations. These are **Himmah implementation values**, not Airbnb measurements. Native haptics, spring constants and exact animation parity remain unverified.

### Specific component improvements supported by the evidence

1. **Make feedback about the task.** The simulated contact-save failure says “De accountdienst is tijdelijk niet beschikbaar” (the account service is temporarily unavailable). That is not useful context for saving a contact. This path uses a plain paragraph alert, while other flows use a framed destructive alert. Define one message anatomy—task, known/unknown outcome, recovery—and consistent styling. Do not imply a save failed definitively when its outcome is uncertain. [Observed error](../design/audit-20261102/sheet-save-error-narrow.png).
2. **Name the destructive commitment.** The unsaved-change confirmation correctly asks whether to discard changes, but its red final button says “Doorgaan” (Continue). Use an explicit discard verb in this flow and maintain the distinction between cancel, discard and permanent deletion. [Observed confirmation](../design/audit-20261102/discard-confirmation.png).
3. **Define control roles before changing their shape.** A contextual utility, selected filter, entity link, form field and disclosure should not depend on the same combination of semibold text, rounded boundary and icon to convey their job. Specify when to use a quiet icon, outline button, filled primary, segmented selection or full-row link. This is a proposed design clarification, not evidence that Airbnb uses one radius or style for each category.
4. **Unify fields and pickers as complete components.** Include persistent label, optional marker, helper, invalid/read-only state, keyboard behavior, selected value and error association. Our field primitive supports error styling, but that alone does not connect each feature's summary error to the relevant field. Retain native selects where appropriate instead of replacing them all for appearance.
5. **Add explicit interaction contracts.** Document normal, focus, pressed, selected, pending, success, failure, disabled and read-only states, plus what happens on dismissal, Back and retry. Mark which states must preserve geometry and which can intentionally expand. Our measured pending button and menu are good baselines to retain.
6. **Use motion to explain change.** The public Airbnb material supports coherent parent/detail and expressive interaction concepts [A5, A10], not adding a spring everywhere. Himmah currently has press feedback and functional overlays but no shared route-continuity treatment. Consider restrained transitions only when they clarify a location/state change; keep rapid roster operations immediate and preserve reduced motion.

Representative fresh component evidence: [pending Save at 320px](../design/audit-20261102/button-pending-narrow.png), [More menu](../design/audit-20261102/more-menu.png), [failed-save sheet](../design/audit-20261102/sheet-save-error-narrow.png), [discard dialog](../design/audit-20261102/discard-confirmation.png). Existing [short sheet](../design/audit-20261102/contact-sheet.png) and [contact rows](../design/audit-20261102/contacts.png) show the default appearances.

Implementation owners: [Button](../../src/components/ui/button.tsx), [ActionButton](../../src/components/shared/action-button.tsx), [Card](../../src/components/ui/card.tsx), [directory layout](../../src/components/shared/directory-layout.tsx), [Input](../../src/components/ui/input.tsx), [NativeSelect](../../src/components/ui/native-select.tsx), [FormSurface](../../src/components/shared/form-surface.tsx), [Drawer](../../src/components/ui/drawer.tsx), [ItemActions](../../src/components/shared/item-actions.tsx), [ConfirmationProvider](../../src/components/shared/confirmation.tsx), [People error/form paths](../../src/modules/people/shared.tsx), [contact editor](../../src/modules/people/Contacts.tsx), [Statistic](../../src/insights/Statistic.tsx), [theme motion rules](../../src/styles/theme.css), and owning [workspace patterns](../../src/styles/workspace.css).

### Component work order

- **First:** contextual error messages/presentation, explicit confirmation verbs and field-level error contracts. These improve understanding without a palette or platform rewrite.
- **Next:** utility-button, search/filter, selector and summary variants, coordinated with the page hierarchy work above.
- **Then:** a durable component-state gallery and browser regression checks, followed by selective motion refinement where it helps.

Do not transfer a low-risk favourite/save interaction directly to cash collection or irreversible deletion. Preserve reviewed amounts, server confirmation, exact-retry identity, dirty guards, current permissions and the distinction between local selection and a committed record. The document's page/sheet and one-primary-action rules remain Himmah choices, not claimed universal Airbnb rules.

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

- **A8:** [Using search filters — Airbnb](https://www.airbnb.com/help/article/479), accessed 2 November 2026. Named search parameters and filter selection; not a native geometry specification.
- **A9:** [Use wishlists to save listings — Airbnb](https://www.airbnb.com/help/article/1236), accessed 2 November 2026. Listing heart action, saved context and management; menu instructions quoted by the page are explicitly desktop-specific.
- **A10:** [Airbnb: Communicating Clarity and Charm — Google Design](https://design.google/library/airbnb-invites-you-in). Historical 2016 case study with designer accounts of control restraint, primary-action emphasis, text and parent/detail motion. Not a current native token/animation specification.
- **A11:** [Airbnb 2026 September update — Airbnb](https://news.airbnb.com/en-au/airbnb-2026-september-update), 30 September 2026. Later search/filter and host-tool announcements with region/timing qualifications; not proof of rollout to every account.
- **A12:** [Updating settings and availability — Airbnb](https://www.airbnb.com/resources/hosting-homes/a/updating-settings-and-availability-649), 4 January 2024. Contextual calendar/bulk editing and explicit save; not a current sheet/datepicker visual specification.

The [original research](AIRBNB_DESIGN_RESEARCH.md) remains historical evidence; the [Himmah design system](../DESIGN_SYSTEM.md) remains the adopted implementation contract. This comparison proposes priorities without silently changing either product requirements or the approved palette.

Validation for this documentation review: fourteen fresh page renders and two sheets at the stated sizes had no page exceptions or horizontal document overflow. This does not establish all-state usability or accessibility. Documentation links and Git diff checks run separately; no application regression suite, native Airbnb app test, hosted database operation or application deployment is part of this review.

Component-extension validation: 24 fresh state observations across two phone widths completed without page exceptions; the separate Dutch chart flow passed eight checks. Draft save was mocked as an HTTP 503, with no hosted write. Sheet dismissal and focus restoration were checked after explicit discard and actual detachment. Documentation link/diff checks apply; no application changes, full regression rerun or deployment were required.

## Owner-approved implementation follow-up

After this assessment, the owner authorized implementing its findings throughout Himmah. The historical measurements and before-images above remain intact. The adopted [design system](../DESIGN_SYSTEM.md#adopted-composition-and-component-contracts--2-november-2026) and [current gallery](../design/COMPONENTS.md) now define the shipped direction.

| Finding | Implementation |
| --- | --- |
| Session management below optional detail | Main attendance/payment entry follows essential schedule/pricing/counts and precedes supporting registration/background sections. |
| Attendance preamble | Compact short counts; detailed money in a labelled expansion; removed compounded heading/section spacing. Scope/restriction notices and row actions retained. |
| Learning preamble and task actions | Compact status/version/release, task-specific Participants/Questions/Results controls, supporting context in settings and Live in More. |
| Home balance | Denser bounded preview; monthly overview before compact administrative shortcuts. |
| Wizard repetition | Four named steps and active section remain; redundant visual step narration removed while preserving accessible status. |
| Component roles/type | Semantic theme roles, shared read-only MetricSummary, interactive Statistic distinction, quiet square utilities, inset search and filter sheets. |
| Feedback and fields | Shared error anatomy with known-domain and unconfirmed-outcome wording; inline associated native/explicit field errors; pending form locks and retained drafts. |
| Confirmation/menu/pagination/navigation | Explicit Discard changes, consequential menu separators, quiet short-list completion, narrow Activities label reads Agenda and Turkish Home uses Başla, retaining their full accessible destination names. |
| Motion and durable validation | Reduced-motion-aware tab entry; local-only multi-width/language screenshot baselines, state gallery and composition/interaction assertions. No decorative roster/cash animation. |

No proprietary font, travel photography, 3D icon set, new database structure or speculative native haptics was necessary. Native iOS/Android, software keyboard, drag and assistive-technology verification remain device-validation work; exact Airbnb build-specific parity was never established by the audit. This is an implemented Himmah design improvement, not a claim that every Airbnb pattern applies to operational attendance/cash.

Fresh local composition measurements after implementation (synthetic Dutch fixture; viewport y positions, not universal content limits):

| Target | 390px before → after | 320px before → after |
| --- | --- | --- |
| Session main management button | 1028 → 585 | 1187 → 622 |
| First attendee name | 769 → 630 | 797 → 631 |
| Learning participant search | 779 → 571 | 890 → 682 |
| Quiz insights heading | 611 → 426 | 722 → 537 |
| Home monthly overview heading | 1047 → 582 | 1087 → 622 |

The session action now fits above fixed navigation at both phone widths in this fixture. Long real content may still require scrolling; essential restrictions are not hidden to satisfy a coordinate. Current references include **62 visual states / 42 page layouts**, narrow EN/NL/TR, NL tablet/desktop, pending/invalid/unconfirmed saves, discard, filters, menus, empty/loading/error/25-row collections and enlarged Results. The committed local harness also compares screenshots on a separate repeat run; domain and UI checks are recorded in [infrastructure history](../INFRASTRUCTURE.md). This does not turn the browser samples into native-device or accessibility certification.
