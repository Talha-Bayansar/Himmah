# Participant account access

Owners/admins can open a member's details, choose **Participant access** from its action menu, and invite the participant to a private personal area. This is separate from staff access. Roster creation alone still creates no login.

## Enrollment and consent

An organizer checks the recipient identity and completes the organization's enrollment/consent process, including guardian authorization where applicable, before explicitly attesting this in the invitation form. The app records the organizer and attestation timestamp; it does **not** verify guardians, store consent documents, collect birth dates, or determine legal eligibility. Agree local safeguarding, withdrawal, retention, support and recovery processes before enrolling real participants. Use an approved nickname for both roster and login display names.

Invitations are bound to one verified email and an existing active organization member. The organizer copies a private link for manual delivery; Himmah does not automatically send invitations. Links expire after seven days. Only a token hash is stored, and the raw token appears in the URL fragment (`/participate#…`), never the query/path. Share it only through the organization's approved channel. Normal Better Auth signup, verification and password recovery remain in use. Participant signup does not require an adult-organizer declaration; creating an organization separately always requires the adult authorization affirmation validated on the server.

The verified recipient reviews the organization and nickname, then confirms account linking. One active account per roster member and one active roster link per account per organization are enforced. The same account may belong to different organizations. Staff and participant access in the **same** organization are mutually exclusive in this first version; a separate staff identity or deliberate disconnection is required. This is a version-one policy, not a general age restriction.

## Personal experience

`/hub` (with `/app` as a compatibility redirect) opens **My progress** for a participant with a single organization. Multiple organizations use the normal paginated chooser and switcher. Personal navigation has My progress, Rewards, Redemptions and Profile; bookmarks reload independently. Staff page URLs redirect participants to their home, and all staff APIs independently reject their role.

The dashboard shows only the signed-in person's nickname, earned/reserved/spent/available points and paginated point entries. Entry labels identify source and adjustments without exposing staff award reasons, activity names that might disclose other people, actor identities or absence reasons. The reward catalogue shows active names/descriptions, cost and personal availability; redemption history shows only that participant's reward snapshots, status and dates. Organizations must keep catalogue descriptions appropriate for participant viewing. No public rankings, peer records, attendance breakdown or staff-only details are returned.

This milestone is read-only for participants. They ask an organizer to reserve a reward, and owners/admins retain reservation, cancellation and handout authority. Self-service purchases, QR coupons, scanning and physical validation are **not implemented**. Engagement history remains independent of spending.

## Revocation and integrity

Owners/admins may revoke an unused invitation or disconnect a linked account. Disconnect requires a reason and destructive confirmation, invalidates pending invitations, and preserves earned points, reservations and history. Archiving a roster member automatically disconnects accounts and invalidates pending invitations. Restoring the roster does not restore access: a new invitation is required. Removing/demoting the inviter invalidates their unaccepted invitations. Accepted retry links succeed only while the original account link is active, never after disconnection.

Historical links remain identity evidence after disconnection. Any later staff account known to represent that member cannot award/correct its own points, approve its own attendance, or fulfill its own reward. These checks run in the transactional SQL before receipt retries. Unrelated staff must perform those operations. A previously unknown second identity cannot be inferred from a nickname; organizers remain responsible for checking real identity and preventing duplicate-account abuse.

Lists use bounded keyset pagination and user/organization-scoped TanStack Query keys. Service failures retain loaded pages; authorization failures hide private content. Access is rechecked on every request. Revocation cannot erase information already viewed or captured; the next request/reload rejects it. No private API, HTML or account data is cached by the PWA service worker and no account mutations are queued offline.

## Implementation and verification

Schema and migration `0010_sturdy_red_skull` add separate participant invitations, links and immutable events. Readable functions live in `db/migrations/functions/participants.sql`. `participant-store.ts` selects sanitized columns and derives the target from the authenticated account. `/api/organizations/:org/me[/points|rewards|redemptions]` accepts no target member ID; owner/admin `/participants/:member` routes manage access. Mutations retain the Worker CSRF, JSON, session, verification and rate-limit boundaries.

PostgreSQL tests execute real migrations and parameterized queries against synthetic PGlite data. UI tests verify consent, exact uncertain retries, destructive confirmation, personal lists and hiding private cached details after permission loss. Browser checks use local synthetic API fixtures; they do not prove hosted email delivery, physical keyboard behavior or legal consent. See the deployment checkpoint in [Infrastructure](INFRASTRUCTURE.md) for completed verification.
