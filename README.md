# Himmah

Himmah manages community contacts, relationships, groups, activities and attendance. Staff accounts and organization access are retained; contacts do not need accounts. Registration, operational cash, insights and learning remain planned redesign increments.

People is the primary owner/admin entry, with a shared organization switcher, Profile and People / Activities / Manage navigation. Volunteers open their scoped Activities. English, Dutch and Turkish are supported.

Futsal, games, points, engagement periods, rewards/coupons, challenges and participant-account workflows have been deleted from the active source and clean database schema. See [removal and rollout](docs/REMOVAL.md) for executed verification and remote deployment status. Git retains prior versions.

- [Design system and standing UI preference](docs/DESIGN_SYSTEM.md)
- [Product and implementation context](docs/redesign/README.md)
- [People and communication](docs/redesign/COMMUNICATION_STATUS.md)
- [Infrastructure record](docs/INFRASTRUCTURE.md)
- [Development](docs/DEVELOPMENT.md)

Use Node 24 and `npm ci`. Run `npm run check`, `npm run build` and `npm run test:contrast`. Local preview uses port 3101. Only verified Himmah-specific database/auth bindings are accepted; generic inherited database credentials are never used.
