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
