# Quick check-in

The owner approved a focused check-in screen and suggestions from earlier sessions on 5 November 2026. Open a session's Attendance & payments view and choose Quick check-in. The existing attendance route uses `checkIn=true`; source and search are URL-backed, reloadable and separate from the management search. Back returns to management with its filters. Payments remain in unified management.

## Staff workflow

- Previous attendees suggests contacts present in the last six accessible, non-cancelled earlier sessions of the same activity. Current contact, audience and staff permissions are independently rechecked. Order is most recent attended session, then contact ID. Suggestions never infer today's attendance, absence, registration, debt or payment.
- All contacts searches the existing authorized audience with server cursor pagination (25 by default, 50 maximum). Suggested cursors have separate user/organization/activity/session/source/search scope. Both sources keep already-present people visible and disabled.
- Check in saves one contact immediately through the existing audited, versioned and idempotent attendance command. The action has a local spinner; other commands are blocked until the outcome is confirmed. An unknown outcome retains the exact request and provides Try again. Confirmed saves refresh scoped management, session and reporting caches.
- Select multiple opens the existing bounded 50-contact picker, retaining greyed-out present contacts, pagination and explicit Add. No automatic marking from registration or prior attendance.
- Undo check-in reviews removal through the existing destructive confirmation using only the versions returned by the successful add. A changed attendance version or recorded payment makes this stale command fail without clearing money. Staff then review the current contact in management. Removal retains audit history; Undo never silently corrects a later payment.

Cancelled and not-started restrictions remain visible and server-enforced. Current access applies to suggestions, writes and receipt replays. Cash-only staff retain unified payment management and do not receive check-in access. No offline mutation queue, QR/self-service, arrival-time feature, new notification or schema migration is included.

## Design and validation

Reuse DirectoryHeader, SearchField, shared tabs, divided rows, ActionButton, existing selection sheet and confirmation primitives. Use compact names, one labelled check-in action, explicit present state, no autofocus, shared theme tokens and EN/NL/TR. Methodology and payment guidance are in About check-in so working rows remain easy to find. The page owns scrolling; the picker retains its bounded sheet list.

Meaningful validation covers real local SQL suggestion scope/order/pagination/audience/archive/revocation, existing atomic attendance/cash commands, UI one-tap/disabled/multiple/undo/exact retry and Worker dispatch/security. `scripts/test-quick-check-in.mjs` runs the production UI through createHandler plus disposable SQL, checks translated phone/tablet/desktop/enlarged layouts, reload/search/pagination, a committed-but-lost response, exact replay, Undo and zero charges created by attendance. Browser checks do not establish physical-device accessibility or native keyboard behavior. Executed checks and rollout evidence are recorded in [infrastructure](INFRASTRUCTURE.md).
