# Peak Signal Data Spine

**Single source of truth.** Every agent, the Chief of Staff, and Brian read this before acting and write to it after. Voice transcripts and docs feed into these five fields only. No freeform notes.

## Current State

- **Objective:** Build the AI implementation partnership business (Peak Signal) from project to million-dollar scale using agent swarms, retainers, and value-share.
- **Status:** TASK-004 deployed. Five-question Ara prompt live on Autoscale. POST https://getpeaksignal.com/api/voice returns 200 Stream TwiML. Awaiting Brian test-call on 970-660-5088.
- **Owner:** Brian (human) + Chief of Staff (agent)
- **Blockers:** Test-call result not in yet. Peak-signal#1 and brain#4 unmerged. Skimmer login failed (invalid credentials).
- **Next action:** Brian test-calls 970-660-5088. Expect: "Hey, this is your business assessment for Peak Signal..." then five questions. CoS files transcript/scorecard/email/spine after.

## Loop Rules

1. **Write protocol:** Update only these five fields, same format, every time. No freeform.
2. **Read-before-act:** No agent starts work without reading this file first.
3. **Cron referee:** Soft ping: read the spine, log if changed, stay quiet otherwise. Never re-run expand-roster or TASK-001 from this loop.
4. **Schema evolution:** Add or drop fields deliberately, in one commit, with a note on why. Never let agents silently fork the format.

## Translation Board (tasks)

### TASK-001 — Expand roster + knowledge base
- **Status:** done (2026-08-29). PRs Peak-signal#1 and brain#4 still open.

### TASK-002 — Build Voice Intake Assessment Agent
- **Status:** done (prompt). Live line updated under TASK-004.

### TASK-003 — Swap Twilio number to Voice Intake Assessment Agent
- **Status:** done enough. Brian confirmed Voice already POSTs https://getpeaksignal.com/api/voice. Live probe 200 Stream TwiML.

### TASK-004 — Publish five-question voice intake to Replit
- **Posted by:** Brian
- **Assigned to:** Chief of Staff / Coding
- **Status:** deployed (2026-08-29 4:23 PM MT). Awaiting test-call result.
- **Result:** artifacts/api-server/src/voice-ara.ts + ara-prompt.md (Hey GREET + five questions). Autoscale republished, healthy. Do not touch site pages.
- **Done when:** Brian hears the new intro and five questions on 970-660-5088.

## Log

- 2026-08-29 4:23 PM MT: TASK-004 deployed. Brian told to test-call 970-660-5088.
