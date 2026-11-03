# Staff notification infrastructure

Generic private staff notification history and per-device opt-in Web Push remain. Visibility requires current organization staff membership. Sign-out removes the current browser subscription; device management, leased delivery retry, expiration handling and generic lock-screen payloads are retained.

Notifications, event emitters and deep links for the removed points/rewards/challenges/participant features are deleted. The retained generic kind is `staff_notice`; no new event producer or real test message is introduced by this cleanup. No participant link ID or participant audience exists in the current schema.

See [removal](REMOVAL.md) and [infrastructure](INFRASTRUCTURE.md) for rollout verification.

Preferences presentation (3 November 2026): current-device status and explicit enable/disable remain in the main settings view. Disable on all devices is in the shared More menu, retaining its destructive confirmation and separate scope. Privacy/delivery guidance is disclosed; denied permission, iOS installation, unsupported browser and unavailable configuration remain visible. Read errors use shared task-local feedback with retry. Permission timing, subscription persistence/locale synchronization, device revocation and sign-out cleanup are unchanged. See the [current Preferences references](design/COMPONENTS.md#preferences--3-november-2026).
