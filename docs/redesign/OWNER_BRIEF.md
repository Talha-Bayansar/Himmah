We are redesigning Himmah, an existing application. Read the repository before making changes, then turn the requirements below into durable project documentation, a proposed domain/data model, workflows and a phased rebuild plan.

Repository: https://github.com/Talha-Bayansar/Himmah.git
Previous workspace path: /workspace/himmah-futsal
Current situation
The old application grew around engagement points, rewards, challenges and a connected Futsal game. We now want to reconsider the product foundation, architecture and database schema.

Existing data is entirely disposable test data. No data migration or backward compatibility is required. Preserve Git history and useful code/components, but do not let the old schema constrain the redesign. Verify that any database reset targets Himmah before executing it.

The previous cloud workspace stopped working with “No usable execution environment is available.” The redesign has only been discussed in chat; its specification has not yet been saved to the repository. Existing docs and AGENTS.md may therefore describe outdated product requirements. The decisions in this prompt supersede conflicting older product scope.
Product purpose
Himmah should be a modular platform that helps mosques and other community organizations:
- Manage contacts, their relationships and groups.
- Organize recurring activities and one-off events.
- Manage registrations and attendance.
- Track cash collected for paid activities.
- Understand participation through weekly/monthly insights.
- Create educational quizzes and tests connected to activities.
The platform must be useful without points, rewards, games or permanent member accounts. Do not impose an age restriction on the product; youth programs remain an important use case.
1. Contacts and groups
Contacts are people, independent of authentication accounts. Staff must be able to manage contacts who never sign in.

Support contact details and group membership. A contact can belong to multiple groups. Design for future account linking, but permanent member-account workflows are deferred.
2. Relationships between contacts
Relationships are part of the core foundation.

Examples include father, mother, parent, child, sibling and guardian. Each person remains a separate contact; do not duplicate a parent’s contact details into their child’s record.

Requirements:
- Multiple relationships per contact.
- Extensible relationship roles/types.
- Directional relationships and their inverse, such as father/child.
- Reciprocal relationships, such as siblings.
- A clear way to identify whom staff should contact when a contact has no phone/email.
- Distinguish family relationships from communication responsibilities, legal guardianship and emergency-contact responsibilities.
- A relationship must not automatically grant access to another person’s records.
A “Family and relationships” section and “Who to contact” area are proposed UI patterns. Organization-defined types and communication priorities should be considered in the detailed design.
3. Activities, events and sessions
Support recurring programs and one-off events through a coherent scheduling foundation.

Example: “Friday sohbet” is an activity; each Friday’s gathering is a session with its own time, location and attendance.

Distinguish:
- Intended audience.
- Registration or expected participation.
- Actual attendance.
Avoid designing separate incompatible attendance systems for recurring activities and one-off events.
4. Attendance
Staff need a fast mobile attendance workflow from the activity/session.

Support corrections and history. Unknown or unrecorded attendance must not automatically mean confirmed absence.

Future face recognition may assist selection, but it is not part of the initial implementation.
5. Paid activities and manual cash tracking
Do not add online payments initially. Almost all payments are cash: children bring money from their parents, and the organizer collects it on the activity day.

The workflow should support:
- Setting the activity/session price.
- Knowing what each registered contact owes.
- Quickly marking cash received during check-in.
- Unpaid, partially paid, paid and waived situations.
- Refunds and audited corrections.
- One payment covering multiple contacts, such as siblings.
- Who collected the money and when.
- Activity totals and outstanding balances.
Keep registrations, attendance, charges and payments as separate records, but display attendance and payment information together in an efficient activity-day interface.

Unresolved design question: charges per session versus charges for an entire recurring program. Recommend a practical initial scope and explain it before finalizing the schema.

This is operational cash tracking, not a request to build full accounting software or integrate Stripe/Mollie.
6. Insights
Provide weekly/monthly engagement summaries and useful statistics across contacts, groups and activities.

Initial proposed metrics:
- Attendance counts and unique attendees.
- First-time and returning attendees.
- Participation trends by activity and group.
- Contacts with no recent recorded participation.
- Registered versus attended counts.
- Amount owed, collected and outstanding.
- Assessment completion, scores and pass rates once learning exists.
Define each metric clearly. Attendance percentages require an eligible/expected audience. Avoid inventing a universal engagement score as the foundation.
7. Learning: self-paced quizzes and tests
Learning is the first fundamental extension of the core platform.

Educational activities need a quick creation flow directly within the activity/session:
1. Add quiz or test.
2. Choose the format.
3. Add questions.
4. Review audience, timing and scoring.
5. Publish.
6. Review results from the activity.
Carry over the activity/session context and intended audience automatically. Optionally restrict participation to recorded attendees.

Consider:
- Automatically scored questions.
- Organizer-reviewed answers for tests.
- Availability windows.
- Attempt limits.
- Configurable passing thresholds.
- Appropriate answer/result visibility.
- Individual and aggregate results.
- Fixed/versioned published rules so later edits cannot rewrite past results.
Manual authoring is required. Reusable questions and AI-assisted drafting from lecture notes are proposed conveniences. AI-generated questions must remain drafts until an organizer reviews them, particularly religious educational material.

Scores must remain useful independently of points. We may add integrations using results later; do not build a reward-points dependency into learning.
8. Learning: live hosted quiz mode
Also support a Kahoot-like experience:
- A host starts a live session.
- Participants join on their phones using a code or link.
- Questions have answer time limits.
- Correct answers earn session points.
- Faster correct answers can earn more points.
- An up-to-date session leaderboard.
- Host controls question progression and reveals.
These are quiz-session scores, separate from general engagement or future reward points.

Permanent member accounts are deferred, so propose a controlled temporary joining mechanism. Organizer-approved identities/nicknames and optional contact linking are possible approaches. Do not treat an unverified nickname as a verified contact result.

Detailed design must address server-authoritative timing/scoring, duplicate responses, reconnects and leaderboard privacy.
9. Deferred scope
- Futsal: removed from the active product for now; preserve previous work in Git for possible later reuse.
- Points, rewards and game integrations: optional future modules, not foundation dependencies.
- Online payments: excluded from the initial release.
- Face recognition: later, after the base platform. It may use member reference photos and group images to suggest attendees, with consent, privacy controls and staff confirmation.
- Permanent member/contact accounts and related onboarding: later. Parent/guardian access needs its own explicit permissions design.
Staff authentication and organization access are still required from the beginning.
Technical preferences to retain
Unless the repository audit identifies a specific reason to reconsider:
- TypeScript.
- TanStack Start, Router, Query and Form.
- Better Auth; inspect the current managed Neon implementation.
- PostgreSQL on Neon and Drizzle.
- Cloudflare hosting.
- shadcn/ui with Lucide icons.
- Paraglide JS: English, Dutch and Turkish.
- Mobile-first PWA.
The existing visual identity is generally acceptable: Himmah branding, forest green, lime accents, warm background and current typography. The problem is the product structure and foundation, not a demand to replace the visual design.

UI preferences:
- Real, bookmarkable routes that survive reloads.
- Simple mobile navigation and a compact organization switcher.
- Profile holds language and personal account settings.
- Cursor pagination/infinite scrolling for growing lists.
- Skeletons for page loading; spinners for pending interactions.
- Confirmation dialogs for destructive actions.
- Accessible, keyboard-aware forms and scrollable dialogs.
- Fixed-size icon menu buttons, with secondary card actions in dropdowns.
- Consistent spacing and touch targets.
Do not touch /workspace/kermes-pay, shared configuration or another project’s database. Previous local preview port was 3101. Never assume generic inherited credentials belong to Himmah.
Architecture direction — proposal, not final implementation
A modular monolith was recommended: one application/database with clear boundaries.

Potential modules:
- Organization/access foundation.
- Contacts, relationships and groups.
- Activities and scheduling.
- Registrations and attendance.
- Cash tracking.
- Learning and assessment results.
- Live quiz sessions.
- Insights.
Modules should extend core records through clear interfaces/events. Avoid premature microservices and avoid hard-coupling attendance to payments, learning or points.

Organization isolation, server-side permissions, audited corrections and idempotent writes belong in the foundation.
Proposed navigation — open to refinement
- People: contacts, groups and relationships.
- Activities: scheduling, sessions, registration, check-in and cash.
- Insights: reports and trends.
- Manage: organization and staff configuration.
- Personal profile in the header.
Learning should be directly accessible within activities. A global learning library can follow if needed.
What to do next
1. Verify workspace/repository access and inspect Git status.
2. Read existing instructions, architecture, schema and relevant docs.
3. Save this revised scope and decision history into the repository; update agent context so it no longer treats Futsal or points as mandatory.
4. Produce a concrete product specification, workflow map and proposed entity model.
5. Audit the current code: retain, refactor, replace or remove from active scope.
6. Produce a phased rebuild plan with acceptance criteria and a verified Himmah-only database reset strategy.
7. Clearly distinguish owner-confirmed requirements from recommended defaults and unresolved decisions.
Start with design/documentation and the audit. Do not jump straight into rebuilding the application, resetting databases or deploying. Existing data does not need migration, but we still need a coherent reviewed design before implementation.

Suggested delivery order:
1. Contacts, relationships and groups.
2. Activities, sessions, registration, attendance and cash collection.
3. Insights.
4. Self-paced quizzes/tests.
5. Live hosted quizzes.
6. Later extensions.
Avoid asking me to repeat decisions already captured here. Make practical proposals for remaining questions and explain their tradeoffs.