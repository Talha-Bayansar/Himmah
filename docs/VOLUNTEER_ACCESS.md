# Scoped volunteer access

Owners and admins manage **Settings → Volunteer assignments**. Invite staff as volunteers first, then assign one group or activity per grant. A volunteer may have several grants. Each grant independently enables attendance management and manual point awards; at least one permission is required. Changing the scope requires a new grant.

Group assignments follow current group membership. Activity assignments follow the activity's configured audience for manual awards, including all organization members when the audience is everyone. Attendance uses each session's saved audience, including retained attendance records. A group assignment covers only its own members in sessions whose audience includes that group or everyone. An activity assignment covers the session audience. Attendance permission includes the existing automatic point reconciliation for attendance changes; it does not enable manual awards.

Volunteers see only permitted activities, sessions and recipient records. Unrelated audience group names and IDs are omitted. The Members page supports searching, cursor pagination and bulk manual awards within manual-award scope. No directory editing, staff administration or engagement-period reporting is granted. Manual award corrections remain owner/admin work.

Point histories include the volunteer's own manual awards and their corrections while the recipient remains in scope, and attendance-source entries for attendance sessions and members they may currently manage. The displayed balance is labelled **Points visible to you** and sums only those entries. It is not the organization's full balance.

## Enforcement and revocation

The server derives identity from the verified session and organization membership. Scope applies to list queries, search, details, histories, optional activity references, preview, bulk save and idempotency receipt replay. A bulk request containing any unauthorized recipient is rejected as a whole. Ordinary stale or ineligible recipients retain the existing documented per-recipient outcomes. Writes lock the organization and relevant membership/scope records so revocations and roster changes cannot silently race an award.

Reducing permissions and revoking a grant require confirmation. Updates check a version to prevent overwriting another administrator's edit. Grant, edit and revoke actions have append-only history with actor and timestamp. Staff and scope names are snapshotted so removal does not erase history. Removing staff or changing their role automatically revokes existing grants; later reinvitation or role changes do not restore them. Archived groups and cancelled activities make grants inactive; restoring the target can reactivate a grant that was not revoked.

New requests, including retries of completed receipts, recheck permission. Client refetches hide data on known authorization failures. Previously downloaded information cannot be remotely erased. Authenticated data remains excluded from service-worker caches and offline mutation queues.

Roster records are separate from login accounts. There is currently no reliable identity link to determine whether a volunteer is also a participant. Before linking participant accounts, add explicit self-approval restrictions; this feature does not authorize a youth account rollout. Public religious rankings and attendance breakdowns remain excluded.
