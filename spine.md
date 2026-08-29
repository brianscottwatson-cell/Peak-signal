# Peak Signal Data Spine

**Single source of truth.** Every agent, the Chief of Staff, and Brian read this before acting and write to it after. Voice transcripts and docs feed into these five fields only. No freeform notes.

## Current State

- **Objective:** Build the AI implementation partnership business (Peak Signal) from project to million-dollar scale using agent swarms, retainers, and value-share.
- **Status:** TASK-004 deployed. Five-question Ara prompt live on Autoscale. POST https://getpeaksignal.com/api/voice returns 200 Stream TwiML. Brian completed a test call; write-back failed. TASK-005 open.
- **Owner:** Brian (human) + Chief of Staff (agent)
- **Blockers:** Voice intake agent answered the test call but never wrote transcript, scorecard, or email back to the spine. Save-to-spine step likely unwired. Peak-signal#1 and brain#4 unmerged. Skimmer login failed (invalid credentials).
- **Next action:** Chief of Staff troubleshoots call logs, patches the agent prompt, deploys, and proves write-back with a simulated call.

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
- **Status:** deployed (2026-08-29 4:23 PM MT). Test call completed but write-back failed.
- **Result:** artifacts/api-server/src/voice-ara.ts + ara-prompt.md (Hey GREET + five questions). Autoscale republished, healthy. Do not touch site pages.
- **Done when:** Brian hears the new intro and five questions on 970-660-5088.

### TASK-005 — Troubleshoot voice intake write-back and patch agent prompt
- **Posted by:** Brian
- **Assigned to:** Chief of Staff / Coding
- **Status:** open
- **Prompt:** Check the call logs for the most recent call to 970-660-5088 and find where the write-back failed. Patch the agent prompt at prompts/voice-intake-assessment-agent.md so that after the five questions finish, it transcribes the full call, generates the one-page scorecard, saves both to the brain repo, and emails the scorecard to brian@getpeaksignal.com. Deploy the patched prompt to Replit, run one simulated call to prove the write-back works, and report the deployment status plus the simulated scorecard on the spine.
- **Done when:** A simulated call produces a transcript, scorecard, email, and spine update.

## Log

- 2026-08-29 4:23 PM MT: TASK-004 deployed. Brian told to test-call 970-660-5088.
- 2026-08-29 5:10 PM MT: Brian completed the first assessment call. Write-back failed — no transcript, scorecard, or email landed. TASK-005 posted to troubleshoot and patch the save-to-spine step.
