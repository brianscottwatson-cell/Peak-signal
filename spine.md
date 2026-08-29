# Peak Signal Data Spine

**Single source of truth.** Every agent, the Chief of Staff, and Brian read this before acting and write to it after. Voice transcripts and docs feed into these five fields only. No freeform notes.

## Current State

- **Objective:** Build the AI implementation partnership business (Peak Signal) from project to million-dollar scale using agent swarms, retainers, and value-share.
- **Status:** Concept locked. Business plan saved. Roster expansion prompt ready. Spine sync cron live. Task posted to translation board.
- **Owner:** Brian (human) + Chief of Staff (agent)
- **Blockers:** None yet. Need first real client pilot to validate the factory.
- **Next action:** Chief of Staff reads the board task, expands the roster into peak-signal-agents.md, builds knowledge-base/ placeholders, and reports back on the board.

## Loop Rules

1. **Write protocol:** Update only these five fields, same format, every time. No freeform.
2. **Read-before-act:** No agent starts work without reading this file first.
3. **Cron referee:** Runs every few hours, diffs spine against recent voice transcripts and docs, flags conflicts, merges into one coherent version.
4. **Schema evolution:** Add or drop fields deliberately, in one commit, with a note on why. Never let agents silently fork the format.

## Translation Board (tasks)

### TASK-001 — Expand roster + knowledge base
- **Posted by:** Brian (via Grok)
- **Assigned to:** Chief of Staff
- **Status:** open
- **Instructions:** Read `prompts/chief-of-staff-expand-roster.md`. Expand `peak-signal-agents.md` (and mirrored `agents/README.md`) into the full living roster with name, role, input, output, done-checklist, master/shareable, status for each agent. Create `knowledge-base/` folder with the empty placeholder files listed in the prompt. Mirror into Peak-signal repo. When done, update this task status to done and add a log entry here.
- **Done when:** Roster has 8+ agents detailed; knowledge-base/ exists with placeholders; both repos updated; spine log notes completion.

## Log

- 2026-08-29: Spine created. Five fields locked. First test cron to be scheduled.
- 2026-08-29: Test run complete — spine coherent, no drift detected.
- 2026-08-29: TASK-001 posted to translation board. Chief of Staff to pick it up, expand roster, build knowledge-base placeholders.
