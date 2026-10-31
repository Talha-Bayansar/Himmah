# Himmah

Himmah manages community contacts, relationships, groups, activities, registration, attendance and operational payment tracking. Staff accounts and organization access are retained; contacts do not need accounts. Organization Insights reports participation and payments; learning is the next extension.

Home is the organization starting page, with upcoming sessions, quick actions and monthly insights. The shared organization switcher, Profile and Home / People / Activities / Manage navigation remain available; detailed Insights opens from Home. Volunteers see scoped Home / Activities without organization-wide reports. English, Dutch and Turkish are supported.

Futsal, games, points, engagement periods, rewards/coupons, challenges and participant-account workflows have been deleted from the active source and clean database schema. See [removal and rollout](docs/REMOVAL.md) for executed verification and remote deployment status. Git retains prior versions.

- [Design system and standing UI preference](docs/DESIGN_SYSTEM.md)
- [Product and implementation context](docs/redesign/README.md)
- [People and communication](docs/redesign/COMMUNICATION_STATUS.md)
- [Insights and metric definitions](docs/INSIGHTS.md)
- [Archive and permanent activity deletion](docs/ACTIVITY_DELETION.md)
- [Optional session topics](docs/SESSION_TOPICS.md)
- [Unified attendance and payments](docs/CASH.md)
- [Infrastructure record](docs/INFRASTRUCTURE.md)
- [Development](docs/DEVELOPMENT.md)

Use Node 24 and `npm ci`. Run `npm run check`, `npm run build` and `npm run test:contrast`. Local preview uses port 3101. Only verified Himmah-specific database/auth bindings are accepted; generic inherited database credentials are never used.

[Recurring session planning](docs/RECURRENCE.md) supports reviewed weekly series and one/future schedule changes while retaining per-session history.

[Reviewed session/series cancellation](docs/SESSION_CANCELLATION.md) previews affected dates and recorded money, preserving attendance/payment history.
