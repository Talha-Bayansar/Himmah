# Delivery roadmap

## 0 — Foundation (this request)

Choose working name; isolate repository; document requirements and proposed rules; add agent instructions; provision dedicated database; record access blockers accurately. Done when checks pass and local commit exists; remote publication is tracked separately.

## 1 — Rules and game engine

Finalize supported team sizes, tactics permissions, training caps, fixture calendar and tie-breakers. Implement seeded training, fixtures, standings and simulation. Test idempotency boundaries and run reproducible balancing experiments. Exit: both modes can complete a fictional season through commands.

## 2 — Playable phone prototype

Home, club/player, challenges, training reveal, tactics, match report, league and basic organizer screens. Fictional Manager season plus four-team/three-person Team League. Exit: navigate the full loop on a narrow phone viewport, with explicit sample-data labeling.

## 3 — Persistent application

Versioned Drizzle migrations on development branch, invitation accounts and role enforcement, real activity approvals and quizzes, transactional ledgers, saved simulation results, scheduled jobs/manual retries and audit records. Exit: tested cross-user authorization and duplicate execution protection; no shared credentials.

## 4 — Pilot readiness

Confirm parent/guardian process, religious challenge policy, privacy/retention periods, content review, rewards, accessibility, organizer support and backup/recovery process. Test poor connections, season timezone, closure, correction and withdrawal flows. Exit: owner can administer a complete rehearsal without database access.

## 5 — Mosque pilot

Proposed 12 participants in four teams of three over four to six weeks, Team League first. Both modes remain product requirements. Observe return visits, understanding, encouragement versus pressure, volunteer workload and season balance; tune the next season without silently changing an active one.

## Next agent task

Begin milestone 1 with the existing documents. Resolve the few rules that affect the engine, then implement a pure seeded simulation and training model with meaningful tests. Do not start with production deployment or decorative screens.
