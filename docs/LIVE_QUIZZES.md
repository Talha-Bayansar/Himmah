# Live hosted quizzes

Owner-approved first version, 1 November 2026. A verified owner/admin opens a room from a current published learning version. Participants join by code or an on-device QR and answer together at the organizer's pace. This is separate from self-paced assignments, contact learning history, accounts, attendance, registration and money.

## Experience

Learning detail links to **Live quizzes**, with independently reloadable room history and host pages at `/workspace/$organizationId/learning/$learningId/live?room=…`. The host opens a waiting room, shares its ten-character code or `/play/:code` link, waits for participants and starts. No invitation or message is sent automatically. The `/play` entry page accepts grouped/lowercase codes and normalizes them. A nickname is optional: blank names use a localized player number. Named players also retain their number so duplicate nicknames remain distinguishable.

Joining closes when the first question starts. Each room accepts at most 200 guest credentials over its lifetime, including removed credentials. A browser can return with its private room cookie; another browser or cleared cookie is a different unverified guest, and cannot join after start. Nicknames do not verify identity or match contacts. Guests never gain staff access. Room access expires twelve hours after creation. Host history remains readable after expiry.

The host controls `waiting room → open answers → locked answers → reveal → next question`, then Finish on the last revealed question. Questions are untimed and choices may be changed while answering is open. The server closes the answer window atomically; a delayed client cannot submit to a locked or later question. Only the current question is sent to a joined guest, and its key/explanation appear only after reveal. Future questions are never sent early. No timers, speed bonuses, rankings, redeemable points or pass/fail threshold are added.

The final guest screen shows only that guest's score, one point per correct answer, against questions actually shown. The host sees per-question answered/correct counts for active guests and can inspect a searchable, paginated nickname/number roster. There is no public named leaderboard or access to another player's answers. Host-only group distributions are textual counts, with no hover-only interaction. Zero and missing answers remain distinct.

End quiz is a secondary confirmed action. It immediately locks answering and ends the room; the current question counts, future questions do not. Ending in the waiting room plays zero questions and never shows a 0/0 score. A finished room cannot restart; open a fresh room. Removing a guest is confirmed, revokes access before any receipt replay, preserves their answers and excludes them from active group counts. Removal does not free a historical guest place.

## Publication and data integrity

Rooms reference an immutable published snapshot. Creation requires the current published item, but subsequent source edits, republication or closing self-paced answering do not rewrite a running room. Self-paced date limits/release settings govern self-paced participation; live rooms use their own access deadline and explicit per-question reveal. A live reveal does not release the self-paced publication's results.

`0009_live_quizzes.sql` adds rooms, guest players, answers and command receipts. Composite tenant references, bounded constraints, publication matching, monotonic room transitions and immutable room/player identities protect scope and history. Answer writes and host transitions serialize on the room row. Answers freeze outside the active question; receipt history cannot be rewritten. Server functions check current owner/admin membership or the room-scoped guest credential before returning a prior receipt. Every retry retains the exact original key, target, revision and payload. An uncertain request locks further actions until resolved; polling never changes its identity. No offline mutation queue exists.

Only credential hashes reach Postgres. A successful join sets a Secure, HttpOnly, SameSite=Strict cookie scoped to that room's API path. Its secret is not embedded in the URL, QR, read response or server log. Public endpoints run before staff identification; an existing staff session never turns a guest into a verified contact. Same-origin JSON mutation checks, body/input bounds, no-store responses, feature/maintenance gates and rate limits remain enforced. Known removal/expiry/access loss hides stale private data and clears its transient query cache.

## Synchronization and layout

The first version uses automatic polling: joined guest state every three seconds, host state every four seconds, and an expanded waiting-room roster every fifteen seconds. Hidden tabs do not poll. Join forms and terminal/error states do not continually poll; requests resume on refresh/focus where valid. Network errors disable writes until refreshed; version checks still protect races. This is organizer-paced synchronization, not a latency-sensitive timed competition. There is no new realtime service or WebSocket dependency.

Live join limiting permits 240 joins/minute per IP so a 200-person group on one Wi-Fi can join. A separate 12,000/minute per-IP bound protects all public live traffic, while joined credentials retain the existing 60/minute bucket. `LIVE_JOIN_LIMITER` and `LIVE_IP_LIMITER` use dedicated namespaces alongside the existing limiters. Limits are local Cloudflare rate controls, not identity guarantees.

Host pages retain the operational design: fixed square secondary controls, joined/answered counts, one primary phase action, compact lists and document scrolling. Waiting-room counts/Start lead the sharing panel; rules/expiry stay in Room details. Invitees reuse the playful quiz shell, labelled native answer tiles, saved-state feedback, restrained color and reduced-motion behavior. New phase views scroll into view without autofocusing controls. Participant code/name entry are public route workflows, without an artificial overlay. Roster search uses nickname or player number, with filter-bound cursors; room history includes creation times. Roster/room histories use cursor pagination (25 default, 50 maximum) and manual Load more. All controls/errors are EN/NL/TR.

## Installation and validation

`scripts/live-plan.mjs` provides the additive transaction for verified `himmah_futsal` / `himmah_owner`, checks the installed learning digest and rejects unexpected/preexisting live tables. Test on the isolated validation clone before development and hosted/onboarding; reserved main and provider schemas are excluded. Fresh schema installation includes the generated migration and live functions. A digest comment records installation on the host function. Existing source/attendance/money rows are not migrated. No background job or cron change is needed.

See [infrastructure history](INFRASTRUCTURE.md) for executed test and deployment receipts. Physical-device, projector/QR scanning and real-network load testing are separate from local browser and SQL validation.

Synthetic Dutch references: [host waiting room](design/live-host-lobby-mobile.png), [participant question](design/live-question-mobile.png), [participant finish](design/live-finished-mobile.png) and [host group summary](design/live-host-summary-mobile.png). Codes and QR images belong only to disposable local fixtures.
