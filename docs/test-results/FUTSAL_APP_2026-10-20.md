# Futsal app experience verification — 20 October 2026

Himmah Futsal has a separate install identity and launcher while retaining the Himmah leaf, colors, typography and shared accounts. Hub's existing identity and `/hub` launcher are preserved. No new domain, service, database migration or production test data is required.

- `npm run check`: 192 tests passed: 73 Node/domain/API/PostgreSQL/PWA, three real Worker runtime, 116 UI. Types and documentation links pass.
- Four full mode/format browser walkthroughs passed through Clubhouse, Squad, Competition, Training and Matchday, using production assets with synthetic intercepted APIs.
- Real game navigation, reloads, assigned-club defaults, organizer management links, fixed navigation, one visible heading/back control and no horizontal overflow were checked.
- English/Dutch/Turkish layouts passed at 320/390/768px. The clubhouse and squad screenshots were visually inspected for Himmah identity and readable player cards.
- Saved-result reveal/replay used only GET reads and local presentation state. Repeated reveals kept the same score.
- Single-organization, multi-organization and signed-out Futsal launchers passed. The profile stayed within `/futsal/profile`; changing language retained the Futsal manifest and Apple icon.
- Separate Hub/Futsal manifest IDs, start paths/scopes, icon dimensions, maskable assets and 44 mirrored iOS startup images were verified. Physical Android/iOS installation, native prompt availability and device splash presentation still require device verification.
- Actual local SQL/store/API tests verify participant training is scoped to the current linked person, excludes peer IDs and allocation maps, paginates, denies outsiders and stops working after link revocation/archival.
- Existing complete-season, retry, ledger-preservation, authorization, cache-exclusion, authentication and push-runtime tests remain passing. No game-engine rules or saved outcomes were changed.

The final production build and button contrast audit pass (minimum 5.87:1). Browser tests use local production assets rather than writing to real accounts. This report does not claim physical installation or long-term balance validation.

Chrome’s manifest parser reported no errors for either app, with Futsal ID/start `/futsal` and Hub ID `/`, start `/hub`. This validates manifest processing, not a physical OS installation.
