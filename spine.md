# Peak Signal Data Spine

**Single source of truth.** Every agent, the Chief of Staff, and Brian read this before acting and write to it after. Voice transcripts and docs feed into these five fields only. No freeform notes.

## Current State

- **Objective:** Build the AI implementation partnership business (Peak Signal) from project to million-dollar scale using agent swarms, retainers, and value-share.
- **Status:** Living roster written (15 named). Knowledge-base stubs in Drive and in PRs. Spine sync cron live as a 2-minute soft ping.
- **Owner:** Brian (human) + Chief of Staff (agent)
- **Blockers:** Peak-signal#1 and brain#4 unmerged. Intake Agent is planned, so the first free assessment is blocked. Plan still says "Ryan Watson" (typo; owner is Brian Watson).
- **Next action:** Merge the two PRs. Do not re-run expand-roster. First real assessment only after Brian says build Intake.

## Loop Rules

1. **Write protocol:** Update only these five fields, same format, every time. No freeform.
2. **Read-before-act:** No agent starts work without reading this file first.
3. **Cron referee:** Every 2 minutes. Soft ping: read the spine, see if anything changed, update the log if it did, otherwise stay quiet. Never re-run expand-roster or TASK-001 from this loop.
4. **Schema evolution:** Add or drop fields deliberately, in one commit, with a note on why. Never let agents silently fork the format.

## Translation Board (tasks)

### TASK-001 — Expand roster + knowledge base
- **Posted by:** Brian (via Grok)
- **Assigned to:** Chief of Staff
- **Status:** done (2026-08-29)
- **Instructions:** Read `prompts/chief-of-staff-expand-roster.md`. Expand `peak-signal-agents.md` (and mirrored `agents/README.md`) into the full living roster with name, role, input, output, done-checklist, master/shareable, status for each agent. Create `knowledge-base/` folder with the empty placeholder files listed in the prompt. Mirror into Peak-signal repo. When done, update this task status to done and add a log entry here.
- **Done when:** Roster has 8+ agents detailed; knowledge-base/ exists with placeholders; both repos updated; spine log notes completion.
- **Result:** 7 built master seats + 8 factory names (Flock Manager in-progress as a CoS job, 7 planned, no new bots). KB stubs in Drive and https://github.com/brianscottwatson-cell/Peak-signal/pull/1 + https://github.com/brianscottwatson-cell/brain/pull/4. clients/ empty on purpose.

## Log

- 2026-08-29: Spine created. Five fields locked. First test cron to be scheduled.
- 2026-08-29: Test run complete — spine coherent, no drift detected.
- 2026-08-29: TASK-001 posted to translation board. Chief of Staff to pick it up, expand roster, build knowledge-base placeholders.
- 2026-08-29: TASK-001 done. Roster + KB stubs written. Two-minute loop locked as soft ping only (read / log-if-changed / stay quiet). No re-run of expand-roster.
