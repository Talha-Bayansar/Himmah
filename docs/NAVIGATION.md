# Navigation and discovery

Daily organizer work has four primary destinations:

| Destination | Features |
| --- | --- |
| Activities | Activity setup, sessions, attendance and optional attendance points |
| People | Members and Groups on route-backed tabs; bulk assignment, point awards, personal member history and participant access |
| Rewards | Catalogue, eligibility, reservations and redemption history |
| Manage | Engagement-period reports; staff, invitations and volunteer permissions; organization details |

The header keeps the organization switcher and a personal profile shortcut. Profile contains identity, language, installation and confirmed sign-out. Volunteers and participants can open read-only organization details from Profile; organizers find these under Manage. Organization details has its own reloadable `/organization` section; Manage is `/manage`. Existing feature URLs remain valid. Reports, staff, invitations and volunteer assignments have one Back to Manage; top-level Rewards has no unnecessary Back to Profile, and its detail pages retain Back to Rewards. Active navigation follows the parent feature for nested pages.

Volunteers see Activities and People, reflecting their current scoped capabilities. Participants retain personal progress, rewards, redemption history and profile. Neither sees organizer management options. Direct management URLs redirect to a permitted starting page; server APIs continue enforcing current roles and scopes independently.

The installed app uses `/hub` as its start URL and retains manifest id `/`. The previous `/app` path redirects there. One bounded membership page routes verified staff with a single organization to Activities, participants to My progress, and multiple/partial memberships to the chooser. Signed-out accounts go to sign-in/verification and empty memberships to organization setup. No last-workspace preference or private data is stored on the device.

Navigation stays fixed with reserved space and safe-area padding. Fixed feature lists are navigation, not unbounded data fetches; member/activity/reward/report/staff data continues using cursor pagination, query cancellation and user/organization-scoped caches. Existing loading skeletons, keyboard-aware forms, destructive confirmations and en/nl/tr localization remain required. No synthetic counters, empty dashboards or future-feature controls are added.
