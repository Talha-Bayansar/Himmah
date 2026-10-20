# Gameplay verification — 20 October 2026

## Whole-season results

The real migration/store/API rehearsal now completes all four combinations in a disposable PostgreSQL database. No production test seasons or accounts are created.

| Mode | Format | Completed events | Played matches | Final outcome |
| --- | --- | ---: | ---: | --- |
| Club Manager | League | 6 | 6 | Completed; table leaders calculated |
| Club Manager | Tournament | 5 | 3 | Completed; final winner calculated |
| Team Play | League | 6 | 6 | Completed; table leaders calculated |
| Team Play | Tournament | 5 | 3 | Completed; final winner calculated |

Each example has four teams. Team Play has twelve synthetic people; Club Manager has four synthetic managers with seven-player squads. Events count training plus rounds, excluding activation. A fixture winner is saved, not chosen again on reload or retry. Fresh isolated runs create new season seeds and may have different champions; each saved season remains deterministic.

Coverage includes:

- Every implemented mode/format with 2, 3, 4, 5 and 16 teams, including knockout byes and final advancement.
- Equal starting attributes; capped single-attribute growth; unchanged virtual fillers; rating ceiling and point-scale equivalence.
- Clock gates; create/assign/lock/activate/process/reload commands; exact receipts; stale version conflicts; current role and tenant scope.
- Atomic rollback after an injected gameplay audit failure; immutable completed state and append-only history.
- Authorized participant read-only access, redacted person IDs and engagement inputs, denied staff history/mutations, immediate link revocation and paginated histories.
- A synthetic 60-point award and a -30 correction counted as 30 before cutoff. A late 500-point award is deferred to the next applicable window. Hub ledger amounts remain unchanged throughout training/matches.
- Production-asset UI walkthroughs with intercepted APIs complete all four combinations, cancel activation once, confirm it, process every event, reload completion and inspect squads/history. Participant views have no execution controls or private growth records; English/Dutch/Turkish layouts are checked at 320/390/768px.

## Deterministic balance smoke check

Across 4,000 saved sample seeds, equal-strength home/away sides won 1,572 / 1,613 times respectively; the remainder were draws. Boosting the home lineup's three attributes by 10 increased home wins to 1,948 over the same seeds. This establishes the intended direction and lack of a material home bias in the initial engine, not long-term game-balance validation. Normal training raises only one attribute by the season's small capped amount.

## Run it again

From the repository root:

```sh
npm run test:futsal-season
```

The runner creates its own temporary database and synthetic roster, advances only its local database clock, runs the production store/API commands and prints results. It takes seconds rather than waiting for calendar days. There is no production fast-forward switch.

In the app, owners/admins open a locked season's Play tab, activate it and process due events. The server clock enforces real dates. Assigned participants use Himmah Futsal from My progress. Automatic jobs, tactics/lineup changes and automatic prize handouts are not included in this release.

## Regression results

The full `npm run check` run passed 189 tests (71 domain/API/PostgreSQL/PWA, three Worker runtime, 115 UI), strict types and documentation checks. The additional deterministic balance case passed in the four-case focused gameplay suite, bringing verified distinct coverage to 190 tests. The focused suite was rerun after adding late-record, archive/revocation and rollback edge cases. Production build and CSS contrast checks pass (minimum 5.87:1). These checks do not establish physical-phone keyboard behavior or long-term gameplay balance.
