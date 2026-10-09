# Peak Signal Spine (board)
Last updated: 2026-10-09 15:03 MT by Chief of Staff. Stale if > 7 days (drift checker flags).
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

- 2026-10-09 ~3:03 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-10-09 ~2:03 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-10-09 ~1:03 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-10-09 ~12:03 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-10-09 ~11:06 AM MT: Test run complete — spine coherent, no drift detected.
- 2026-10-09 ~10:04 AM MT: Test run complete — spine coherent, no drift detected.
- 2026-10-09 ~9:05 AM MT: Test run complete — spine coherent, no drift detected.
- 2026-10-08 ~5:03 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-10-08 ~4:03 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-10-08 ~3:03 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-10-08 ~2:03 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-10-08 ~1:03 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-10-08 ~12:03 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-10-08 ~11:03 AM MT: Test run complete — spine coherent, no drift detected.
- 2026-10-08 ~10:04 AM MT: Test run complete — spine coherent, no drift detected.
- 2026-10-08 ~9:04 AM MT: Test run complete — spine coherent, no drift detected.
- 2026-10-07 ~5:03 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-10-07 ~4:03 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-10-07 ~3:03 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-10-07 ~2:03 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-10-07 ~1:03 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-10-07 ~12:03 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-10-07 ~11:03 AM MT: Test run complete — spine coherent, no drift detected.
- 2026-10-07 ~10:03 AM MT: Test run complete — spine coherent, no drift detected.
- 2026-10-07 ~9:04 AM MT: Test run complete — spine coherent, no drift detected.
- 2026-10-06 ~5:04 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-10-06 ~4:03 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-10-06 ~3:03 PM MT: Test run complete — spine coherent, no drift detected. Peak-signal pointer merged back onto this five-field board so both spine.md copies match.
