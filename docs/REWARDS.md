# Rewards and private coupons

The owner approved rewards and redemption after the engagement, reporting and scoped-volunteer workflows. This supersedes earlier roadmap statements deferring spendable rewards. Rewards remain optional; an organization may continue using attendance and points without them. Participants can claim rewards from their private catalogue and show a reusable-to-view, single-use-to-collect QR coupon. Owners/admins validate collection. See [Participant access](PARTICIPANT_ACCESS.md). There is no payment, public catalogue or public ranking.

## Workflow

Owners and admins open **Rewards**, create a reward, then open its real detail URL. The **Member eligibility** view searches active organization members, showing available points and a default eligible-only filter. The **Redemptions** view is a persistent URL search state with searchable, status-filtered history. Both lists and the catalogue use bounded cursor pagination and the shared infinite/load-more/retry pattern. Member details also display the reward wallet.

Each reward has a name, optional description, positive whole point cost, optional total stock and archive state. Implementation bounds are 2–80 characters for names, 1,000 for descriptions, 1–1,000,000 points and 0–1,000,000 total stock. Blank stock means unlimited; zero means no stock. Total stock includes both pending reservations and handed-out rewards, so editing stock cannot lower it below existing commitments. Archive blocks new reservations, while preserving management of existing ones. Restore reopens future reservations.

One confirmed reservation reserves one item for one active member. Repeated reservations are allowed if points and stock permit; there is no implicit once-per-person limit or expiration. Reward name, cost, member nickname and staff names are snapshotted for history. Later edits never reprice existing reservations. A stale reward version is rejected so staff cannot unknowingly confirm a changed cost.

A pending reservation can be marked handed out after an explicit final review. It can instead be cancelled with a required 1–300 character reason and destructive confirmation. Cancellation releases points and stock. Handed-out and cancelled records are final; there is no delete, post-handout refund or physical-return workflow. Archived members/rewards do not prevent completing or cancelling an existing reservation. This honors existing reservations even if a later points correction reduces the balance. Organizers should review commitments before handing out a reward.

## Earned and spendable points

- Earned points are the current all-time sum of the existing engagement ledger, including its corrections. Existing earned points are available immediately; no migration backfill is required.
- Reserved points are costs of pending reservations.
- Spent points are costs of handed-out rewards.
- Available points = earned − reserved − spent.

Redemptions never insert negative engagement awards, change engagement-period snapshots, reduce earned totals or allocate game credit. The future game integration consumes engagement history separately. The wallet can become negative after a legitimate point correction. Show that deficit honestly, preserve existing reservations/handouts, and block new reservations until available points recover. Cancelling a pending reservation releases its reservation amount; it does not create new earned points.

Eligibility currently means active member, active reward, sufficient available points and stock. There are no group restrictions, reward periods, paid points, lotteries, activity-specific requirements or automatic prize decisions. Such conditions require explicit future design.

## Permissions, integrity and retries

Only verified owners/admins can use staff wallet, eligibility, catalogue and redemption management APIs or mutate rewards. Participant APIs separately expose only their own sanitized wallet/history and active catalogue. Scoped volunteer attendance/manual-award grants do not imply spending authority. Every SQL read and write checks organization and role, independently of UI controls. Roster records are linked only through verified participant invitations. Historical identity links prevent staff from fulfilling their own reward, even after disconnection.

Reservation and catalogue writes lock the organization, current actor membership and reward. New reservations also lock the recipient and recompute the wallet and stock inside the same transaction. Engagement award/correction operations take the same organization lock. Requests across different rewards cannot spend the same balance twice; requests for the last item cannot overbook it. A failure writing audit history rolls back the reservation as well.

Creation requests use organization-scoped UUID idempotency keys. Reservation retries must match the original creator, reward and canonical request payload; changed payloads conflict. Staff role is rechecked before any receipt replay. Final-status retries do not repeat side effects or audit events, while conflicting final transitions fail. Version checks prevent overwriting concurrent reward edits or pending-reservation transitions. Uncertain network failures keep the exact request frozen for safe retry and warn before abandoning it.

Reward create/edit/archive and redemption reserve/handout/cancel actions retain append-only before/after audit records, actor and time. Redemption provenance/cost cannot be rewritten. The visible history retains original names, status, staff/timestamps and cancellation reason. Search/filter cursors and query keys bind organization, user and filters. Private data is never service-worker cached or queued offline; loaded records are hidden after known authorization errors, while ordinary later-page service failures preserve usable pages. Previously downloaded information cannot be remotely erased.

## Participant claims and collection

A currently linked, verified participant can reserve one reward from **Rewards**, after reviewing its cost. The server derives the recipient from the current account, checks the displayed reward version and atomically reserves points/stock. It never accepts a client price or target person. Exact claim retries reuse the original UUID receipt, even after catalogue changes; a new request with a stale version conflicts. Current access is checked before receipt replay.

**My coupons** has searchable, cursor-paginated Available/History tabs and real reloadable detail URLs. Pending details show a locally generated QR and copyable link/code. Only that participant can retrieve their code. They can cancel their own pending coupon with confirmation; the audit reason is the localized `participant_cancelled` marker. Cancellation releases stock and points. This also applies to existing pending staff reservations. Revocation/archive blocks personal access and new claims, while staff retain existing commitment management. Final records cannot be cancelled or collected again.

Owners/admins open **Rewards → Collect a reward**, explicitly enable the rear camera or paste a code/link. Preview shows the organization-scoped reward snapshot and nickname; scanning never hands anything out automatically. Explicit confirmation completes collection using the existing transactional handout rules. Volunteers cannot preview or collect. Historical identity links still block self-collection, including a participant who later becomes staff. Concurrent collection/cancellation has one final winner, and identical collection retries do not repeat the audit or spending.

Migration `0011_flimsy_komodo` adds immutable coupon rows, backfills codes only for existing pending reservations, and issues a code atomically for all new reservations. Each code concatenates two random UUIDs without hyphens (64 hexadecimal characters, approximately 244 random bits). Codes are recoverable so holders can reopen the same QR after reload. They are private lookup identifiers, not bearer authorization: collection always requires a verified owner/admin session in the same organization, state checks and review. This differs deliberately from hash-only invitation secrets. Codes are absent from growing lists, audit payloads and staff preview responses. They appear in the collection URL fragment, never its query/path, and contain no nickname or reward data. No external QR service or camera upload is used. Camera decoding is local and loaded only when requested; streams stop after a scan, closure, navigation or backgrounding. Clipboard/manual paste supports devices without camera access. PWA private-cache rules remain unchanged.
