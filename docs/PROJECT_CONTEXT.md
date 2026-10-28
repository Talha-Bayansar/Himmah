> Historical scope: superseded for the rebuild on 28 October 2026 by the [current redesign](redesign/README.md) and [owner brief](redesign/OWNER_BRIEF.md). Retained as prior decisions/implementation reference, not current product requirements.

# Project context and preferences

## Owner and purpose

The owner volunteers with mosque youth aged 11–15. The aim is to encourage mosque involvement, learning, good deeds (salih amel), and positive friendships through a game they want to return to. Everyone joins using their own phone.

The owner already has a separate Kermes Pay app in this environment and explicitly wants no interference between projects.

## Confirmed by the owner

- A game with football squads from the start, focused on five-a-side/futsal.
- Two modes: each person manages a virtual club; or people are players in small configurable teams.
- Team League example: four teams with three participants each. This is an example, not a fixed limit.
- Equal starting team strength.
- Organization-defined activity points improve the chance/rate of player growth on training day. The weekly Friday lecture quiz is the original use case, not a mandatory app mechanic (clarified 18 October).
- Better developed players improve the probability of winning simulated fixtures.
- Football-style league table and points system.
- Organizer-defined competition periods with a chosen end date and organizer-selected rewards/winners.
- Team League should motivate teammates to encourage each other to participate.
- Initialize a GitHub repository, capture durable agent context, choose a name, and provision tools including a separate Neon database.

## Proposed defaults, not yet confirmed

Himmah Futsal branding; seven-player Manager squads; two virtual fillers for a three-person Team League lineup; guaranteed basic training; weekly bonus caps; rating resets each season; no chat; invite-only accounts; a four-to-six-week pilot; Next.js and Drizzle; Europe/Frankfurt database region. See decision log.

Support obligations from the Deen through respectful learning and private encouragement. The earlier discussion proposed excluding private worship from competitive scoring. Review exact challenge categories with the owner and mosque lead before implementation.

## Collaboration preferences

Act on authorized work, keep updates concise, preserve decisions in the repo, and avoid repeated permission requests for routine implementation. Explain blockers accurately. Do not treat suggested numeric examples as agreed rules. No delegation requested.

## Questions to resolve during design, not blockers to setup

Mosque name and branding; language(s); season timezone; approximate participant count; available rewards and budget; exact training thresholds; parent/guardian enrollment process; Team League captain/tactics permissions; team sizes above five and rotation fairness; quiz retry/accessibility policy; late joining and withdrawal.

## Confirmed additions — 18 October 2026

- Both Club Manager and Team League support a tournament alternative to league competition.
- Organizers can change a variety of game settings and parameters before starting a season.
- The platform must support other organizations/mosques running their own youth programs independently.
- Allow a future organization paywall/subscription; Stripe or Mollie are possible later providers. Billing provider, pricing, tiers, and launch timing remain undecided. Do not provision or integrate payments yet.

“Team League” remains the current mode identifier/name for compatibility. It describes participants playing in shared teams, not a restriction to league format. A clearer display name such as “Team Play” is proposed.

## Confirmed clarification — configurable earning system

Each mosque defines how participants earn engagement points: quizzes, attendance, custom activities, or manual awards for work done at the mosque. A mosque can use manual awards only. Do not require a quiz module, lecture schedule or particular activity category to run any mode/format. Exact awarding rules and conversion to training are configurable; the core game consumes points, not quiz-specific inputs.

## Approved platform and Hub direction

The owner accepted the separation into a standalone engagement app and connected games, with organization licenses for individual apps. Himmah Hub is the working name for the foundation; Himmah Futsal is an optional game add-on. Shared accounts; organization-specific access. Future games can use the same engagement history without erasing or consuming that history. Payment provider, prices, limits and billing integration timing remain undecided.

Owner approved the Hub feature proposal: youth home/progress/activities/personal attendance and points/connected apps; fast volunteer attendance and manual points; organization membership/groups, custom earning rules, independent engagement periods, reports, settings and licenses. First release prioritizes members/roles/groups, activities, attendance, manual/configurable awards, personal history, reporting and the Futsal connection. Quizzes, QR self-check-in, badges, rewards redemption and richer announcements can follow. Detailed screen flows and edge policies remain to design. See HUB.md.

## Organization registration priority

Owner reiterated that other organizations must be able to register independently and asked to continue after the prototype deployment. Implemented early-access organizer signup and saved workspace setup as the next increment. Demo activity workflows remain separate until the authenticated membership/data milestone. Youth invitations and consent processes remain prerequisites to real youth enrollment.

## Explicit stack and UI preferences

Owner requires Better Auth, TanStack Start/Router/Query/Form and the complete shadcn component set. Page loading uses skeleton layouts; interaction loading uses spinners. Every destructive action, including sign-out/delete/reset/discard, needs a confirmation modal. These are standing requirements, not optional implementation proposals. Existing accounts are already managed Better Auth; preserve those identities while changing the framework. Self-hosting or an identity-storage cutover was not requested.

## Public entry and UI refinement

Owner requested a refresh of existing UI/copy after the shadcn migration, plus a landing page that starts organization onboarding. Public entry is `/`, fictional demo is `/demo`, and persistent organizer setup is `/start`. Preserve clear early-access boundaries in public copy; do not present demo engagement workflows or planned games as persistent features.


## Confirmed localization and live-only deployment

Owner requires English, Dutch and Turkish using Paraglide JS and a stack very similar to Kermes Pay. Fix text/button contrast and test the UI. Remove demo parts from deployment and keep only real working features. This supersedes the previous public `/demo` decision; preserve internal fixtures and future product requirements, but do not ship mock screens or promotional unfinished features. Existing organizer identities/workspaces must remain intact.


## Audience and installed-app clarification

Owner confirmed the landing page must not impose an age limit: any mosque/community organization sharing the engagement goal should be able to use Himmah. The original 11–15 youth pilot remains historical context, not a platform audience restriction. Preserve youth safeguarding where relevant. Owner requested a PWA with iOS and Android icons/splash screens, plus a fix for signup failing on the initial submit. The exact provider error text and a live signup replay remain unavailable; distinguish verified client/proxy defects from unconfirmed production causes.


## Confirmed next milestone and pagination convention

Owner authorized building member/group management and explicitly requires consistent infinite scrolling for growing fetched lists. Implement shared bounded cursor APIs and useInfiniteQuery/sentinel + manual Load more fallback for organizations, participants, groups, staff, invitations and group pickers. Keep cursor/query scope tied to tenant/user/filter; preserve loaded rows on page errors.

Delivered foundation: private nickname roster records with staff consent attestation, multi-group assignment, rename/archive/restore, staff invitation links, acceptance and owner-controlled administrator roles. Roster entries do not create logins. Only owners/admins administer the directory; volunteers have a verified workspace membership but no directory administration. Guardian processes and youth account invitations remain a separate milestone. No automatic invitation emails are sent.

- Owner requests phone-first forms with focused inputs remaining visible above the keyboard, clear accessible focus and separate management pages with mobile navigation. Shared visual-viewport dialogs and routed workspace sections implement this preference.

- Owner wants a minimal header, language/sign-out on a settings/profile page, stable persistent navigation, an organization switcher and no low-purpose Workspace tab. Current design uses fixed phone bottom navigation (Members, Groups, Settings) and places organization details/staff/invitations in Settings.

- Owner prefers real, reloadable routes for entity detail views. Group membership views now have their own group-ID route and server-loaded metadata. Organization switcher chevrons should sit beside their label rather than at the far edge of a stretched button.

- Owner prefers a mobile app feel: item actions should use recognizable icons with their labels, rather than plain text-only actions. Group assignment pickers must visibly mark and disable existing memberships, with pending indicators limited to the selected action.

- Owner wants compact item rows: one obvious primary action at most; other actions in an icon-and-label dropdown, or all actions in the menu if no primary stands out. The installed PWA should open an app-focused starting point rather than public marketing.

Persistent one-off activities now have an Activities navigation entry, paginated lists, independent detail routes and organization-timezone scheduling. Owners/admins manage activities; volunteers can view them. Cancellation preserves history. Attendance, recurrence, registration and point rules are subsequent slices.

Activity/session separation supersedes the one-off-only checkpoint above: reusable activity defaults include everyone or up to 20 same-organization groups; sessions snapshot their details and audience. Session detail URLs reload independently, Upcoming/Past lists are paginated, and started sessions are protected from ordinary edits. New activities are unscheduled until staff adds a future session. Archiving blocks new sessions without cancelling existing ones. Attendance and participant eligibility enforcement remain the next slice.

Session attendance is implemented for owners/admins through a dedicated route. Check-in opens at session start; cancelled sessions are read-only. Paginated rosters use saved session audiences and retain saved records after membership changes/archiving. States are unmarked/present/absent/excused; changes to saved attendance require a reason and confirmation. Bulk results distinguish saved and failed members; retry receipts prevent duplicate writes. Volunteer assignments and configurable/manual points remain next work.


Group pages support adding up to 50 members together through a paginated, searchable picker. Existing group members are visible and disabled. Owner preference: search bars must have vertically centered icons/controls; phone search stays full-width with compact filters beneath it.


Manual engagement points now support verified owner/admin individual and bulk awards (up to 50), staff-only reasons, organization-timezone contribution dates and optional activity/session links. Member names open real member detail routes with private balances and paginated ledger history. Corrections append linked adjustments with reasons and revision checks; requests are replay-safe and bulk outcomes explicit. Attendance remains independent. See MANUAL_POINTS.md for implementation bounds and remaining account-linking/cap policies.


Engagement periods are implemented under Settings for verified owners/admins: create/edit inclusive date windows in a saved timezone, view paginated private member/group points and attendance summaries, and close with confirmation to freeze names/membership/metrics. Period/group views have reloadable URLs. Existing ledger/attendance records supply the reports by date; no award duplication or attendance-to-points rule is introduced. See ENGAGEMENT_PERIODS.md for overlap, archived roster and closing policies.


Optional fixed attendance earning is implemented: activity defaults are off unless enabled; newly created sessions snapshot the amount/revision. Owners/admins review point deltas before confirming attendance saves. Attendance and linked ledger changes are atomic/replay-safe, corrections reverse/restore the same source award, and point history links back to attendance for managed corrections. Existing sessions stay attendance-only after migration, and manual awards remain independent. See ATTENDANCE_EARNING.md.

## Scoped volunteer access

Implemented group/activity assignments with independent attendance and manual-award permissions. This supersedes earlier blanket volunteer restrictions in this document. Owner/admin directory management, manual corrections and period reporting remain restricted. See [Volunteer access](VOLUNTEER_ACCESS.md) for scope, audit and revocation behavior.

## Staff-managed rewards

The owner approved and we implemented rewards and redemption after scoped volunteer access. This supersedes earlier deferral of spendable rewards. Verified owners/admins manage the private catalogue, member eligibility, point/stock reservations, final handouts and audited pending cancellations. Earned engagement history stays separate from spending. See Rewards (historical; retained in Git) for policy defaults, balances, retries and deferred participant access.

## Participant access increment — 19 October 2026

Organizer-attested participant invitation links, verified-email account linking and private progress, reward claims and QR coupons are implemented. See Participant access (historical; retained in Git) for exact role separation, consent responsibility, revocation, sanitized data and historical self-approval protection. Participants can reserve/cancel their own pending rewards; owners/admins confirm single-use QR collection. See Rewards (historical; retained in Git). Peer rankings and gameplay remain future work.

## Navigation redesign — 19 October 2026

Owner requested a clearer information architecture after feature growth. Daily organizer navigation is Activities, People, Rewards and Manage. People groups Members/Groups on real-route tabs; Manage groups reporting, team access and organization details. Profile contains personal preferences only. Volunteers see scoped Activities/People and participants keep personal progress/rewards/history/profile. PWA start_url moves to `/hub`, with `/app` redirecting for compatibility; single-organization staff start in Activities, participants in My progress. Existing feature/detail URLs remain supported. See [Navigation](NAVIGATION.md).

## Configurable challenges — 19 October 2026

Optional organization-authored challenges now support drafts, frozen publication settings, group eligibility, private participant submissions, organizer review/direct recording and exactly-once ledger awards. Attendance/quizzes remain optional and independent. See Challenges (historical; retained in Git).

## Confirmed addition — 20 October 2026

Build the notification centre with push notifications as well: private participant updates and organizer work alerts, unread/read states and links to existing workflows. Push is explicitly opt-in per device, with generic lock-screen text and personal controls. See [Notifications](NOTIFICATIONS.md).

## Confirmed next increment — Futsal setup, 20 October 2026

Owner approved starting Himmah Futsal with season configuration: both modes/formats, dates, participants, team sizes, equal starting strength, capped engagement-to-training settings and a review before freezing. The implementation distinguishes locking setup from executing a playable season; the subsequent gameplay increment now implements squads/training/simulation separately. Hub/Futsal remain separate experiences with later independent organization licensing. See Futsal setup (historical; retained in Git).

Gameplay v1 now supports organizer-triggered due training/matches and read-only assigned-participant competitions in both modes/formats. See gameplay (historical; retained in Git) for scope, fixed lineup policy, late-record handling and the isolated full-season runner.

Owner approved a distinct installable Futsal game experience that keeps Himmah identity: leaf/forest/warm canvas, club/player cards and real clubhouse/squad/competition/training routes. Separate manifest identity `/futsal` shares the existing origin, account/backend and public-only service worker; no new domain or database is required. See Futsal app (historical; retained in Git).
