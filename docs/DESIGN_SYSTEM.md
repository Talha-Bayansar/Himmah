# Himmah design system

**Standing owner preference, adopted 29 October 2026:** apply the Airbnb-informed design language to every existing and future Himmah interface. This is the implementation contract for the [design research](redesign/AIRBNB_DESIGN_RESEARCH.md), adapted to Himmah’s community operations. New features and fixes must reuse this system. When an existing screen is changed, bring its affected patterns into conformity instead of introducing another local style.

The owner authorized implementing the direction directly. The research document remains a historical account of evidence and proposed values; this document records the choices adopted for the application. Product behavior, capabilities and financial integrity remain governed by their existing specifications.

## Principles

- **Coherent:** the same task and component have the same presentation and behavior across People, Activities, Manage and account screens.
- **Welcoming:** readable text, warm neutral surfaces, Himmah forest accents and plain language. Design English, Dutch and Turkish together.
- **Focused:** one main task at a time; names, times, amounts and status lead. Decoration must earn its space.
- **Communicative:** actions explain their consequences, feedback appears near the task, and failures give a useful next step.

Airbnb is a reference for clarity and craft, not a source of assets or product features. Preserve Himmah’s identity, use licensed/system fonts, and retain domain distinctions such as registration, attendance and cash.

## Sources of truth

| Layer                            | Implementation             | Ownership                                                                             |
| -------------------------------- | -------------------------- | ------------------------------------------------------------------------------------- |
| Foundations and semantic palette | `src/styles/theme.css`     | Type roles, spacing, surfaces, colors, radii, focus, elevation and reduced motion     |
| Public/front-door styles         | `src/styles/app.css`       | Marketing, sign-in/setup and retained public layout; aliases point to semantic tokens |
| Workspace patterns               | `src/styles/workspace.css` | Directory, entity, session, attendance, cash, settings, navigation and form layout    |
| Shared primitives                | `src/components/ui/`       | Button, input, label, select, card, tabs, drawer, menu and confirmation behavior      |
| Shared patterns                  | `src/components/shared/`   | Directory layouts, form surfaces, item actions, feedback and pagination               |

Root styles load in the order theme → app → workspace. Do not add another override stylesheet or copy a page pattern into a new feature. Fix the owning component or pattern. Domain-specific layout may live in the owning pattern stylesheet, using semantic tokens rather than a separate palette.

## Foundations

| Role                 | Adopted choice                                                         |
| -------------------- | ---------------------------------------------------------------------- |
| Typeface             | System UI sans serif; no remote font request or Airbnb font dependency |
| Page surface         | Warm near-white `#fdfcf9`                                              |
| Raised/card surface  | White                                                                  |
| Main text            | Neutral dark `#242a27`                                                 |
| Supporting text      | `#626962`, with explicit contrast verification                         |
| Primary action/brand | Himmah forest `#153f36`, white foreground                              |
| Quiet surface        | Neutral `#f2f3ef`; secondary forest tint `#eef3ee`                     |
| Page title           | Responsive 28–32px, restrained negative tracking, 650 weight           |
| Body/control         | 16px; supporting content 14px                                          |
| Spacing              | 4/8/12/16/24/32/48px roles                                             |
| Page gutter          | 24px desktop, 20px phone, 16px narrow phone; respect safe areas        |
| Corners              | Controls 12px, cards 20px, sheets 24px top corners                     |
| Targets              | At least 44px; typical text fields and buttons 48px                    |
| Forms                | 680px reading/input width within the existing page shell               |
| Elevation            | Flat base; subtle raised controls when needed; clear overlay depth     |
| Motion               | Brief press feedback, restrained transitions, reduced-motion override  |

Semantic positive, warning and critical colors are separate from brand roles. A status includes text; color alone never communicates attendance, payment, selection or failure. Amounts and repeated numeric summaries use tabular numerals.

Use spacing according to relationships: 4–8px between label and value, 12–16px within a component and 24–32px between sections. Do not preserve unnecessary height just to keep cards equally tall. Long content may grow naturally.

## Layout and components

### App chrome

Keep the organization visible in a compact fixed header. Retain existing destinations and capability-aware navigation. Phone navigation sits above the bottom safe area; desktop navigation moves below the header. Active state uses text/icon emphasis and a small marker, avoiding a large filled tile. Reserve content space for fixed chrome and ensure focused controls can scroll clear of it.

### Lists and directory pages

Use `DirectoryHeader`, `DirectoryToolbar`, `DirectoryList`, `DirectoryItem` and `DirectoryRecord`. Align title, search, rows and footer to one gutter. Search uses an inset icon and a quiet surface; filters wrap without squeezing the search field. Rows use a readable name, optional secondary detail, neutral avatar and compact trailing action. Divider-separated rows are the normal directory pattern, including organizations, contacts, groups, staff, invitations, access and cash balances.

A linked row has one navigation link and no nested buttons. Separate row actions remain siblings where required. Identity may wrap. Do not render account IDs as names. Keep errors, empty results and permission loss distinct.

Lists retain server pagination, URL filters where implemented and a manual Load more action. Profile collections remain bounded to three preview records with total counts and View all navigation. No nested infinite lists in profiles.

### Cards and detail sections

Use cards to group a meaningful object or summary. Cards are flat, with one owner of padding. `Card` provides default and compact density; do not add a second padding layer through inline CardContent classes. Prefer section headings and dividers over nested cards. Session detail is a page with sections; session list items remain bounded cards.

At most one prominent primary action per entity card. Secondary actions use `ItemActions` or a compact contextual control. Pure information may have no action. Repeated essential tasks such as marking attendance remain visible. Save/Cancel and confirmation choices are workflow exceptions.

Phone section-add actions stay 44px icon controls with localized accessible names; wider screens may show labels. Icons are functional Lucide glyphs. New decorative images, photo requirements or animation libraries are not needed to implement a normal operational feature.

### Forms

Follow [form classification](FORMS.md). Short forms use the shared bottom sheet; complex workflows use independently reloadable pages. Use consistent labels, 16px controls, visible boundaries and errors near the fields. Inputs, native selects and textareas share control geometry. Page actions blend into the page surface; sheets use their own surface consistently.

Do not autofocus fields or form headings. Preserve keyboard access, focus trapping/restoration, safe-area and visual-viewport sizing, draft guards, version snapshots, pending states and exact retry identity. Successful saves return to the originating context without a discard prompt. Do not exchange a functioning workflow for a decorative wizard.

### Attendance and money

Use compact roster rows with visible attendance actions and subordinate payment status for authorized staff. Present uses a textual positive state. No charge yet, Unpaid, Partially paid and Paid remain distinct; never infer a charge or cash movement from attendance.

Financial summaries emphasize the amount and its label. Before recording cash, show received, allocated, unallocated and any new charge. Preserve current scope checks, exact retries, atomicity and reasoned correction history. Styling must not hide a relevant conflict, permission error or uncertain save.

### Information hierarchy and daily tasks

Show the identity, current state and next action first. Repeated lists use compact time ranges rather than full scheduling panels. Do not place several explanatory paragraphs or accounting breakdowns before the work. Session detail shows compact attendance/payment counts. Management shows scoped counts/amounts and present contacts with compact selection/bulk actions; adding/removing replaces status forms. Keep essential restrictions and positive unallocated cash visible; move background guidance, secondary totals and profile history into clearly labeled disclosures. Full detail routes retain complete information.

A routine single-person cash payment uses a short sheet with the person already selected, the balance prefilled, an editable partial amount and the remaining balance. The explicit amount-labeled save is its confirmation; do not add a second confirmation for the same reviewed action. Keep a visible compact payment action in attendance and Payments, plus the full page for several people or receipt details. This is an intentional contextual-action exception alongside attendance, not permission to stack prominent card buttons. Preserve exact retries and current authorization.

### Feedback and states

Every new component must define loading, empty, populated, long-content, pending, failure, disabled/read-only and permission states where relevant. Keep skeleton geometry close to content. End-of-list guidance is quiet. Unavailable actions explain their actual rule when useful. Use contextual messages, not long repeated policy paragraphs.

## Required implementation review

For each UI change, check:

1. Reuse the owning component/pattern and semantic tokens; no isolated visual vocabulary.
2. Preserve one primary action, compact secondary actions and correct page/sheet classification.
3. Verify phone, tablet and desktop widths; long names; EN/NL/TR; empty/loading/error and permission states.
4. Verify visible keyboard focus, readable contrast, 44px targets, 16px form inputs, zoom/reflow and reduced motion. Target WCAG 2.2 AA; a CSS contrast check alone does not establish conformance.
5. Preserve pagination, return navigation, drafts, authorization and financial semantics. Run meaningful existing interaction tests.
6. Use synthetic data for screenshots. Report actual browser/device coverage and any unverified assistive-technology or physical-keyboard behavior.

Exceptions must be justified by the user’s task, documented beside the owning pattern and consistent with the principles. A new component is warranted only when existing ones cannot express the required interaction. User instructions take precedence over this preference.

Release and validation evidence belongs in [infrastructure history](INFRASTRUCTURE.md). The preference is durable in this file and `AGENTS.md`, so it applies to future repository implementations as well as this redesign.

## Visual examples

These are synthetic-data Chromium captures of the implemented design in Dutch at a 390px viewport. They demonstrate the shared language, not real contact or financial records. They do not replace physical iOS/Android or assistive-technology testing.

- [Contact directory](design/contacts-mobile.png)
- [Session detail](design/session-mobile.png)
- [Short contact form sheet](design/contact-sheet-mobile.png)
- [Complex cash form page](design/cash-form-mobile.png)
- [Quick single-person payment sheet](design/quick-payment-mobile.png)

### Unified attendance and payment management

Session detail uses a short present/paid/unpaid summary and one management action. Management combines scoped counts and expected/paid/outstanding amounts with the present-contact list. Use compact divided rows, visible paid/unpaid actions and selection-local bulk controls for up to 50 contacts. Secondary receipt details/history remain on demand. Do not restore absent/excused status forms or stack large action buttons.

The add sheet supports multiple contacts, with currently present contacts checked, greyed out and disabled. Add selected explicitly saves; Done dismisses. Remove and Mark unpaid have one concise confirmation describing the payment correction; Mark paid reviews the exact remaining cash total. Preserve current scope, original audit/receipt history, independent registration, exact retries, conflict handling, and no autofocus. Remove clears that contact's active payment tracking without modifying another contact's receipt allocation.

### Session row action consistency

Each attendance row has one labelled paid/unpaid button and the shared square more menu. Put Remove and attendance history in the menu. Do not repeat paid/unpaid in that menu or place an unlabeled Remove icon beside the labelled primary action. Partial payment/receipt details is a distinct secondary task and must say so explicitly. Use one session management destination; receipt history is a lazy disclosure within it, with no second Payments page. Payment-only access renders its authorized subset on that same route.

### Insights

Use a focused report overview: four compact participation metrics, a restrained single-series trend with accessible period details, financial totals and divided activity rows. Keep advanced filters and metric definitions in labelled disclosures; applied date/cohort context stays visible. Searchable paginated filter choices use the shared bottom sheet with no autofocus. Preserve the distinction between recorded session balances and receipt-date cashflow, current access and data freshness. See [Insights definitions](INSIGHTS.md).

Insights mobile reference (synthetic data): [overview](design/insights-mobile.png).

### Dashboard

Home is the starting workspace destination. Show a bounded three-session chronological preview, compact contextual shortcuts and four monthly report figures. Reuse directory rows and Insights metric tokens; no nested cards, long guidance or independently scrolling lists. The full report opens separately from Home. Hide administrator actions and organization totals for volunteers; each section has independent loading, error/retry and freshness. Preserve the four-destination phone navigation for administrators and two scoped destinations for volunteers.

Dashboard reference (synthetic data): [mobile Home](design/dashboard-mobile.png).

Statistic comparisons share the `Statistic` component, metric icons and semantic positive/warning/neutral tokens. Always pair direction colors with an icon and localized text, show the baseline dates, avoid zero-denominator percentages, and use percentage points for ratios. Keep comparison units, financial polarity and contextual exceptions in docs/INSIGHTS.md. Detailed secondary ratios use divided rows, without extra nested cards.

Permanent activity deletion is a destructive secondary ItemActions command, available for active and archived activities. Use one count-based confirmation, clear irreversible/payment consequences and exact retry; changed data requires renewed review. Archive remains distinct and preserves history. See [deletion behavior](ACTIVITY_DELETION.md).

[Permanent deletion confirmation](design/activity-delete-mobile.png) — synthetic Dutch phone example. Destructive confirmations use the shared semantic destructive button variant.

Session topics are optional plain text. Where present, the topic leads the session identity and the activity name is subordinate context; dates remain visible. Empty topics preserve the existing activity/date hierarchy. Use the existing session sheet and shared directory/card typography, with long-text reflow and no autofocus. See [session topic behavior](SESSION_TOPICS.md).

[Optional session topic sheet](design/session-topic-mobile.png) — synthetic Dutch phone example.

Recurring planning and multi-session schedule review use the shared dedicated page form. Keep the existing one-session sheet and compact Plan recurring sessions / Change schedule secondary actions. Use bounded divided date rows, visible timezone and creation price/location, and paired old/new times when changing an existing series. The preview scrolls with the document. Follow [recurring session behavior](RECURRENCE.md) for snapshots, safe retries and history protection.

[Recurring date preview](design/recurring-preview-mobile.png) — synthetic Dutch 390px example, with document scrolling for longer series.

Home's coming-up preview and full planned-session agenda share `SessionList`: compact full-row session links, topic with activity context, local date/time range and optional location. The full agenda uses the shared directory heading/search, document scrolling and pagination footer; Home stays bounded to three rows. Keep the activity directory as the separate Activities destination. See [dashboard and planned-session behavior](INSIGHTS.md).

[Planned-session list](design/planned-sessions-mobile.png) — synthetic Dutch 390px example, sharing Home's compact session row.

Attendance rows use compact inset padding with vertically centered selection/name/menu controls. Render the payment-action area only when a visible action exists; free/read-only rows must not reserve blank action space. Selected rows use the shared quiet forest surface alongside the checked control. Retain the labelled paid/unpaid action and the shared more-menu hierarchy.

[Compact attendance rows](design/attendance-compact-mobile.png) — synthetic Dutch mobile example for a free session.

Cancellation with one/future scope uses a dedicated shared page: compact date/topic rows, short registration/charge/cash impact and a reason, followed by one destructive confirmation. Sessions without charges or effective cash do not show a payment warning; actual charges/effective cash stay visibly flagged for administrator review. Preserve failed drafts and exact retry, with no autofocus or repeated confirmations. See [reviewed cancellation](SESSION_CANCELLATION.md).

[Session cancellation confirmation](design/session-cancellation-mobile.png) — synthetic Dutch phone example with the reviewed counts and recorded cash.
