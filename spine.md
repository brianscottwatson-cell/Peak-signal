# Peak Signal Spine (board)
Last updated: 2026-11-13 16:05 MT by Chief of Staff. Stale if > 7 days (drift checker flags).
History: spine-log.md. Store rules: Brian_OS/SOURCES_OF_TRUTH.md.

## Current State

- **Objective:** Build the AI implementation partnership business (Peak Signal) from project to million-dollar scale using agent swarms, retainers, and value-share.
- **Status:** TASK-006 still open. Altspace second call filed 2026-09-01. No later receipt closes it. Board lists open cards only.
- **Owner:** Brian (human) + Coding (turn-taking + hangup GitHub write) + Chief of Staff (Altspace files landed)
- **Blockers:** ASR partials and repetition remain. Hangup did not write `clients/altspace-coworking/` (CoS filed the transcript). TASK-022 stays open until the sync rule and drift-checker fail are done.
- **Next action:** Coding: fix mute/barge-in so partials are not stored as separate turns, and confirm the hangup GitHub write on Autoscale.

## Loop Rules

1. Write protocol: update only these five fields, same format. No freeform.
2. Read-before-act: no agent starts work without reading this file first.
3. Cron referee: soft ping reads this file, logs a material change, stays quiet otherwise.
4. Schema evolution: add or drop fields in one commit, with a note on why.
5. Receipt rule: before ending, write a receipt. No receipt, no done. See `prompts/boot-receipts.md`.
6. Drift-first: read open drift tasks (`clients/**/NN-drift-*.md`, Status open) before new work.
7. Drift checker: after spine sync, CoS may run `scripts/drift-checker.py` and review `clients/_drift-report-YYYY-MM-DD.md`.
8. Reasoning checker: `scripts/reasoning-checker.py` (`prompts/reasoning-checker.md`). Quiet if aligned.

## Board

Open tasks only. Cap 20 rows. More than 20: evening closeout asks Brian what to park.

| Task | Client | Owner bot | Status | Card |
|---|---|---|---|---|
| TASK-006 | peak-signal | CoS / Coding | open | clients/peak-signal/06-task-intake-agent-patch-2026-09-01.md |
| TASK-008 | peak-signal | Brian | open | clients/peak-signal/07-task-harness-dashboard-2026-09-03.md |
| TASK-020 | peak-signal | — | open | clients/peak-signal/20-task-canonical-customer-table-2026-09-07.md |
| TASK-021 | peak-signal | — | open | clients/peak-signal/21-task-brand-guide-collateral-skills-2026-09-07.md |
| TASK-022 | peak-signal | — | open | clients/peak-signal/22-task-spine-peak-brain-sync-2026-09-07.md |
| TASK-023 | peak-signal | — | open | clients/peak-signal/23-task-owner-harness-vs-cos-core-2026-09-07.md |
| TASK-033 | peak-signal | Brian | open | clients/peak-signal/08-task-cablefinder-loc8-agent-demo-2026-09-04.md |

## Claimed

Shared-file edits in flight. Cap 5.

| File | Bot | Since | Release when |
|---|---|---|---|
| (none) | — | — | — |

## Log
- 2026-11-13 ~4:17 PM MT: Referee soft-ping — prior CoS log (16:05) noted; Current State and Board unchanged.
- 2026-11-13 ~4:05 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-13 ~3:07 PM MT: Referee soft-ping — prior CoS log (15:05) noted; Current State and Board unchanged.
- 2026-11-13 ~3:05 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-13 ~2:08 PM MT: Referee soft-ping — prior CoS log (14:05) noted; Current State and Board unchanged.
- 2026-11-13 ~2:05 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-13 ~1:05 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-13 ~1:00 PM MT: Referee soft-ping — prior CoS log (12:04) noted; Current State and Board unchanged.
- 2026-11-13 ~12:04 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-13 ~12:00 PM MT: Referee soft-ping — prior CoS log (11:05) noted; Current State and Board unchanged.
- 2026-11-13 ~11:05 AM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-13 ~11:00 AM MT: Referee soft-ping — prior CoS log (10:06) noted; Current State and Board unchanged.
- 2026-11-13 ~10:06 AM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-13 ~10:01 AM MT: Referee soft-ping — prior CoS log (09:07) noted; Current State and Board unchanged.
- 2026-11-13 ~9:07 AM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-12 ~6:00 PM MT: Referee soft-ping — prior CoS log (5:06) noted; Current State and Board unchanged.
- 2026-11-12 ~5:06 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-12 ~5:00 PM MT: Referee soft-ping — prior CoS log (4:05) noted; Current State and Board unchanged.
- 2026-11-12 ~4:05 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-12 ~3:16 PM MT: Referee soft-ping — prior CoS log (3:05) noted; Current State and Board unchanged.
- 2026-11-12 ~3:05 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-12 ~3:00 PM MT: Referee soft-ping — prior CoS log (2:05) noted; Current State and Board unchanged.
- 2026-11-12 ~2:05 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-12 ~2:00 PM MT: Referee soft-ping — prior CoS log (1:05) noted; Current State and Board unchanged.
- 2026-11-12 ~1:05 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-12 ~1:00 PM MT: Referee soft-ping — prior CoS log (12:05) noted; Current State and Board unchanged.
- 2026-11-12 ~12:05 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-12 ~12:00 PM MT: Referee soft-ping — prior CoS log (11:04) noted; Current State and Board unchanged.
- 2026-11-12 ~11:04 AM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-12 ~10:17 AM MT: Referee soft-ping — prior CoS log (10:05) noted; Current State and Board unchanged.
- 2026-11-12 ~10:05 AM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-12 ~10:00 AM MT: Referee soft-ping — prior CoS log (09:08) noted; Current State and Board unchanged.
- 2026-11-12 ~9:08 AM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-11 ~5:09 PM MT: Referee soft-ping — prior CoS log (5:06) noted; Current State and Board unchanged.
- 2026-11-11 ~5:06 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-11 ~4:16 PM MT: Referee soft-ping — prior CoS log (4:05) noted; Current State and Board unchanged.
- 2026-11-11 ~4:05 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-11 ~4:00 PM MT: Referee soft-ping — prior CoS log (3:06) noted; Current State and Board unchanged.
- 2026-11-11 ~3:06 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-11 ~2:13 PM MT: Referee soft-ping — prior CoS log (2:03) noted; Current State and Board unchanged.
- 2026-11-11 ~2:03 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-11 ~1:13 PM MT: Referee soft-ping — prior CoS log (1:04) noted; Current State and Board unchanged.
- 2026-11-11 ~1:04 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-11 ~12:13 PM MT: Referee soft-ping — prior CoS log (12:04) noted; Current State and Board unchanged.
- 2026-11-11 ~12:04 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-11 ~12:00 PM MT: Referee soft-ping — prior CoS log (11:04) noted; Current State and Board unchanged.
- 2026-11-11 ~11:04 AM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-11 ~11:00 AM MT: Referee soft-ping — prior CoS log (10:07) noted; Current State and Board unchanged.
- 2026-11-11 ~10:07 AM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-11 ~10:00 AM MT: Referee soft-ping — prior CoS log (09:05) noted; Current State and Board unchanged.
- 2026-11-11 ~9:05 AM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-10 ~5:09 PM MT: Referee soft-ping — prior CoS log (17:08) noted; Current State and Board unchanged.
- 2026-11-10 ~5:08 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-10 ~5:00 PM MT: Referee soft-ping — prior CoS log (16:04) noted; Current State and Board unchanged.
- 2026-11-10 ~4:04 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-10 ~4:00 PM MT: Referee soft-ping — prior CoS log (3:05) noted; Current State and Board unchanged.
- 2026-11-10 ~3:05 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-10 ~3:00 PM MT: Referee soft-ping — prior CoS log (2:04) noted; Current State and Board unchanged.
- 2026-11-10 ~2:04 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-10 ~1:11 PM MT: Referee soft-ping — prior CoS log (1:03) noted; Current State and Board unchanged.
- 2026-11-10 ~1:03 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-10 ~12:04 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-10 ~11:04 AM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-10 ~10:08 AM MT: Referee soft-ping — prior CoS log (10:07) noted; Current State and Board unchanged.
- 2026-11-10 ~10:07 AM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-10 ~9:09 AM MT: Referee soft-ping — prior CoS log (09:06) noted; Current State and Board unchanged.
- 2026-11-10 ~9:06 AM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-09 ~6:00 PM MT: Referee soft-ping — prior CoS log (17:06) noted; Current State and Board unchanged.
- 2026-11-09 ~5:06 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-09 ~5:00 PM MT: Referee soft-ping — prior CoS log (16:06) noted; Current State and Board unchanged.
- 2026-11-09 ~4:06 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-09 ~4:00 PM MT: Referee soft-ping — prior CoS log (15:04) noted; Current State and Board unchanged.
- 2026-11-09 ~3:04 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-09 ~3:00 PM MT: Referee soft-ping — prior CoS log (14:04) noted; Current State and Board unchanged.
- 2026-11-09 ~2:04 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-09 ~1:04 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-09 ~12:04 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-09 ~11:04 AM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-09 ~10:06 AM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-09 ~10:00 AM MT: Referee soft-ping — prior CoS log (09:05) noted; Current State and Board unchanged.
- 2026-11-09 ~9:05 AM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-06 ~5:07 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-06 ~4:05 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-11-06 ~3:06 PM MT: Test run complete — spine coherent, no drift detected.
