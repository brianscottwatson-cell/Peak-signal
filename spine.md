# Peak Signal Data Spine

**Single source of truth.** Every agent, the Chief of Staff, and Brian read this before acting and write to it after. Voice transcripts and docs feed into these five fields only. No freeform notes.

## Current State

- **Objective:** Build the AI implementation partnership business (Peak Signal) from project to million-dollar scale using agent swarms, retainers, and value-share.
- **Status:** TASK-005 sim write-back proved. clients/sim-task-005/transcript.md and scorecard.md on brain. Email to brianscottwatson@gmail.com. Prompt patched in Peak-signal and brain. Live Ara hangup still being wired on Replit so 970 calls file the same way.
- **Owner:** Brian (human) + Coding (hangup) + Chief of Staff (real-call filing)
- **Blockers:** Live 970 hangup still Formspree-only until Replit Autoscale picks up GitHub write-back. Peak-signal#1 and brain#4 unmerged. Skimmer login failed.
- **Next action:** Deploy hangup write-back to Replit Peak Signal Autoscale. Hold further Replit after that. CoS files the real 4:42 PM MT Brian Watson test-call.

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
- **Status:** sim proved (2026-08-29). Live Replit hangup deploy in flight.
- **Prompt:** Patch hangup so it transcribes, writes scorecard, saves to brain clients/<slug>/, emails brianscottwatson@gmail.com (not brian@getpeaksignal.com), updates spine. Deploy, sim, report.
- **Done when:** A simulated call produces a transcript, scorecard, email, and spine update.
- **Result:** https://github.com/brianscottwatson-cell/brain/blob/main/clients/sim-task-005/transcript.md and scorecard.md. Estimates left as Brian fills.

## Log

- 2026-08-29 4:23 PM MT: TASK-004 deployed. Brian told to test-call 970-660-5088.
- 2026-08-29 5:10 PM MT: Brian completed the first assessment call. Write-back failed — no transcript, scorecard, or email landed. TASK-005 posted to troubleshoot and patch the save-to-spine step.
- 2026-08-29 5:10 PM MT: TASK-005 sim-task-005 write-back proof. Transcript + scorecard on brain. Email brianscottwatson@gmail.com. Prompt patched both repos. Live hangup still deploying.
- 2026-08-31: Test run complete — spine coherent, no drift detected.
- 2026-09-01: Test run complete — spine coherent, no drift detected.
