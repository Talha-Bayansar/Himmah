# Hub interactive prototype

Run `npm ci`, then `npm run dev` in the project. Server uses port 3101. This is a local development app, not a deployed production service.

## Explore the connected flows

1. Youth Home: choose a sample member in the header, open an activity and register. Point history does not change merely because of registration.
2. Switch to staff view (sidebar on desktop, top controls on phone). Open Check-in and select the activity.
3. Mark the selected member present. Review changes, then confirm. For an attendance-points activity, the linked grant appears in the member's history.
4. Return to youth view and open My progress. Both attendance and points reflect the saved sample state.
5. Correct a saved presence in staff view. A reason is required; only linked attendance points are adjusted, preserving the contribution history.
6. Give points from staff Home or Members & points. Select one or more members, amount and reason, review recipients and confirm.
7. Create an activity through Details, Schedule, Points and Review. Choose attendance-only, automatic attendance points, custom approval or manual awards. Publishing makes it available in the activity list and check-in picker.
8. Switch to Olive Community to explore an independent sample workspace with no game license and no automatic points. Hub remains usable.
9. Reset demo or refresh to discard sample changes. Save draft retains a single activity draft in memory for the current demo workspace; it is not durable storage.

## Current limits

All records are fictional and held in browser memory. Refresh resets the demo. The role/member/workspace switches are preview controls, not authentication or authorization. No real records should be entered. The domain functions reject invalid/scoped sample operations, but only a future authenticated server can provide actual organization isolation.

Only one-off same-day activities are supported. Automatic attendance grants work; custom contributions use the manual award flow. No registration deadlines, recurrence, waitlist, occurrence closure, guardian workflow, attendance correction requests, offline synchronization, exports, notification delivery or persistent settings yet. Same-browser editing is synchronous; production multi-staff concurrency is not implemented, though roster revisions are checked by the model.

Dates and point caps are sample configuration, not final organization policy. Activity times are labeled Europe/London; real configurable timezone behavior is not implemented. Hub points are contribution history, not a spendable wallet. Futsal is an explanatory connected-app page, not a playable game or deployed integration.

## Verification

`npm run check` runs generated Next.js types, TypeScript checking, documentation links and domain tests. `npm run build` verifies an optimized app build. Browser interaction/visual QA requires an available supported browser connection; HTTP serving alone does not verify all rendered interactions or accessibility.
