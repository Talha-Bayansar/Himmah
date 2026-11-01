# Self-paced learning

Owner-approved first release, 31 October 2026. A learning item belongs to an organization. Activity and session links are optional context; a session link implies its parent activity. Standalone spontaneous quizzes are supported. This supersedes the original activity-local proposal. Learning is independent of attendance, registration, charges and cash.

## Staff experience

Owners/admins open Learning from Home's next actions or Manage. Activity and session more menus open a filtered learning directory; Create inherits that context, which can be removed. The main navigation retains Home / People / Activities / Manage. Volunteers have no learning administration access in this increment; scoped learning grants remain a later feature.

Growing directories, contact choices and participant/results lists use scoped keyset pagination (25 default, 50 maximum), search, manual Load more and document scrolling. Editors and multi-contact assignment are independently reloadable pages; small pickers, result details and open-link sharing use the shared no-autofocus bottom sheet. All shipped controls/errors are EN/NL/TR and follow the design system.

The editor uses four steps: Details, Questions, Access and Review. Steps can be revisited without losing draft values. Questions has a selector with readiness, an expandable overview and one editable question at a time; duplicate, move and remove commands live in its more menu. Added/duplicated/reordered questions keep the intended selection. Removing a nonempty question requires confirmation. A final overview links directly to each question and section, with options/feedback in disclosures. Step validation points to the first incomplete question or invalid details/date settings. Saving remains one explicit final draft command, with publication separate; step navigation never writes partial records. Pending/uncertain saves lock all steps and replay the exact reviewed draft. Initial forms do not autofocus; user-driven step changes scroll the progress navigation into view without focusing fields.

The editor supports 1–50 multiple-choice questions, 2–6 options each, one correct answer, one point per question, optional feedback, title/description, optional availability instants, and immediate or staff-controlled result release. Question order is explicit. Staff input dates in the organization's timezone; ambiguous/nonexistent local DST instants are rejected rather than shifted. Empty date bounds are allowed. There is no countdown timer or pass/fail threshold.

Saving updates a draft. Publishing creates an immutable numbered question/settings snapshot, with at most 50 publications per item. Publishing a new version closes answering on older versions and requires fresh links; existing attempts/results survive. The detail page identifies unpublished draft changes and offers explicit publication. Questions, Participants and Results share one item page; staff can inspect up to five preserved attempts per participant in a result sheet. Older versions remain selectable for reviewing/releasing their own results. Closing/reopening answering still respects configured dates. Releasing results is explicit and irreversible.

## Participation modes

- **Contact assignments:** staff explicitly select up to 50 active contacts and generate individual links. Links identify the assignment, not the person holding the device. Forwarding a link does not verify identity. Links are displayed once and can be copied; generating a replacement revokes the old credential while preserving the same assignment/attempt allowance. No message is sent.
- **Open participation:** one shared link and an on-device QR code. Participants enter an unverified display name. No name is automatically matched to a contact. Each browser credential gets its own guest principal and one submitted attempt by default; clearing cookies or using another browser can bypass real-person limits. This limitation is shown, not presented as identity verification.

A participant sees an introduction, one question per screen, clear progress, Previous/Next, a review of unanswered questions and one explicit final Submit. Each option selection saves to the server with optimistic revision and an idempotency key. The selection remains visible during saving/failure; uncertain saves lock further answering and retry the exact request. No offline mutation queue exists. Reload resumes the saved attempt through its private credential. The review may submit unanswered questions for zero points; there is no automatic submission at the deadline.

Initially one submitted attempt is allowed. Staff may explicitly allow an additional attempt, to five total; an unfinished attempt must be resumed. Concurrent starts lock the item/version/principal and reuse the same in-progress attempt. Previous submissions and scores never change. Automatic grading uses the published answer key on the server. Manual release hides both the score and answer key until staff release them. Before opening, participants without an attempt receive only introductory metadata and a question count, not the questions. Submitted results remain readable after closing/republication while their credential is valid; revoked credentials cannot replay or read them.

## Credentials and security

Staff administration independently checks verified account membership in API and SQL; every entity/cursor/query is tenant/actor/filter scoped. Tokens use 32 cryptographically random bytes. Only SHA-256 hashes reach database rows/operation receipts; raw links are displayed in staff memory once. Links carry their token in a URL fragment, which is removed before exchanging it via same-origin JSON POST for a Secure, HttpOnly, SameSite=Strict cookie scoped to that item's public API path. Guest resumption uses a separate private cookie; the shared open link alone cannot read another guest's attempt. Cookies expire after 30 days; organizer access/expiry/revocation still applies to each request.

Participant endpoints run without staff authentication, with feature/maintenance gates, same-origin and JSON mutation checks, strict body/input limits, and read/write rate limits keyed by hashed credentials or IP. API responses are no-store. Private HTML, tokens, answers and results never enter service-worker caches; browser graph/QR libraries are static assets only. Known access loss hides private data and clears child caches without deleting the surrounding organization context. A participant's transient query cache is removed on exit. Tokens and question answer keys are not logged or sent to external QR services.

## Data integrity and deployment

The additive Drizzle migration `0008_learning.sql` adds items, immutable publications, recipients, attempts and immutable command receipts. Optional composite tenant references use PostgreSQL column-specific SET NULL, preserving organization IDs when a linked activity/session is permanently deleted. Learning content/results remain. Draft edits validate tenant context; archived context can remain attached. Existing activity/session/attendance/cash rows are not rewritten.

`db/migrations/functions/learning.sql` owns scoped staff/public commands, ordered locks, current authority before retry replay, revision checks, deterministic grading and append-only submissions. Successful command plus minimal audit plus receipt commit atomically. Failed responses retry the same key/body; changed payloads conflict. Staff conflicts keep the draft visible and require loading the latest saved version before another edit, with an explicit discard warning. Scope loss is denied before replay. No attendance, reservation, payment, points or account creation is inferred.

`scripts/learning-plan.mjs` produces a guarded, digestable installation transaction for verified Himmah database/role and cancellation baseline. Validate on the isolated clone before development and hosted installation; reserved main/provider schemas are excluded. Fresh installs include learning through `schema-install-plan.mjs`. Custom current-publication/context constraints and column-specific delete behavior are recorded in the migration because Drizzle does not express the latter column subset.

Contact-profile learning previews, organization learning analytics, written answers/manual grading, regrading workflows, question libraries and live hosted quizzes are separate later increments. This release keeps result history on each learning item and does not assign learning scores to attendance insights.

Executed release evidence belongs in [infrastructure history](INFRASTRUCTURE.md).

Synthetic Dutch phone references: [question editor](design/learning-editor-mobile.png), [learning management](design/learning-detail-mobile.png), [released participant result](design/learning-result-mobile.png). These contain local disposable fixtures, not hosted records or access credentials.

Creator review reference: [four-step draft overview](design/learning-wizard-review-mobile.png). The question-editor reference above now shows the single-question wizard step.

Spacing references: [Details with shared peer actions](design/learning-wizard-details-mobile.png) and [Access with aligned wrapped date labels](design/learning-wizard-access-mobile.png). Explicit field groups keep label/control spacing consistent; all learning action rows reuse the shared directory-action layout.

## Participant presentation

The standalone participant shell shares a 680px reading column, responsive page gutters and safe-area-aware header. Introductory availability/counts lead, guest identity guidance stays with the name field, and detailed participation rules use a disclosure. Question choices have full-row radio targets, saved-state feedback and explicit answered progress. Review rows show the question, answer/unanswered state and edit affordance. User-driven question/view changes scroll into view without autofocusing a field.

Released results show a neutral score and compact, numbered question feedback with correct/incorrect/unanswered text and icons. Correct responses do not repeat the same answer as an expected answer; incorrect/unanswered responses retain the answer key and any explanation. No pass/fail threshold is inferred. The held-result state still withholds feedback until server release. Credentials, revisions, retries, grading and additional-attempt rules are unchanged. Synthetic mobile references: [introduction](design/learning-participant-intro-mobile.png), [question](design/learning-participant-question-mobile.png), [review](design/learning-participant-review-mobile.png), [results](design/learning-result-mobile.png).

### Playful invitee experience

The owner requested a more game-like presentation for invitees. The introduction now uses a compass/sparkle illustration and welcoming copy. Questions use lettered, softly colored tactile tiles (up to six choices), native radio behavior and a segmented journey paired with accessible answered progress. Phone choices stack; wider screens use two columns. Selecting an answer saves it but never advances automatically or reveals correctness. Review/edit, explicit submission, availability and exact retries retain their existing behavior.

The finish illustration celebrates completing a submission, including zero scores and held results. A released server score is visualized with a ring and its full textual score; held results contain neither score nor ring. Feedback remains the existing released question review. Brief entrance/press effects respect reduced-motion preferences. This is a presentation refinement, not a new points, timer, rewards or competitive-game system. Staff authoring is unchanged.
