# Peak Signal Data Spine

**Single source of truth.** Every agent, the Chief of Staff, and Brian read this before acting and write to it after. Voice transcripts and docs feed into these five fields only. No freeform notes.

## Current State

- **Objective:** Build the AI implementation partnership business (Peak Signal) from project to million-dollar scale using agent swarms, retainers, and value-share.
- **Status:** TASK-006 second test call filed (2026-09-01 ~5:01 PM MT) — Brian Watson, Altspace Coworking, 970-201-1236. Name-first + live site lookup + formula estimates (`needs baseline`) + Formspree/email proved. Residual: ASR partials/repetition and hangup GitHub write still missing.
- **Owner:** Brian (human) + Coding (turn-taking + hangup GitHub write) + Chief of Staff (Altspace files landed)
- **Blockers:** Transcript still dumps incremental ASR partials; agent fired Q3 three times. Hangup did not write `clients/altspace-coworking/` — CoS filed instead.
- **Next action:** Coding fix mute/barge-in so partials are not stored as separate turns, and confirm hangup GitHub write path on Autoscale.

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

### TASK-006 — Patch intake agent: name first, live site lookup, turn-taking, pricing formula
- **Posted by:** Brian
- **Assigned to:** Chief of Staff / Coding
- **Status:** partial (2026-09-01). Second test call run (Altspace). Name-first, site lookup, formula estimates, Formspree/email pass. Repetition + hangup GitHub write fail.
- **Prompt:** `prompts/voice-intake-assessment-agent.md` patched. Task file: `clients/peak-signal/06-task-intake-agent-patch-2026-09-01.md`.
- **Scope:** (A) opening captures name + business before Q1; live site lookup after, capped at a few seconds, three fields only; turn-taking guard documented for Replit voice layer; pricing formula fills estimates instead of "Brian fills"; scorecard gains Site lookup section. (B) Telephony: mute outbound audio from inbound recognition, barge-in guard. (C) Second test call with a different business to verify.
- **Done when:** Second test call produces clean name capture, site lookup, no repetition, filled estimates, full write-back.
- **Result:** https://github.com/brianscottwatson-cell/brain/blob/main/clients/altspace-coworking/transcript.md and scorecard.md.

## Log

- 2026-08-29 4:23 PM MT: TASK-004 deployed. Brian told to test-call 970-660-5088.
- 2026-08-29 5:10 PM MT: Brian completed the first assessment call. Write-back failed — no transcript, scorecard, or email landed. TASK-005 posted to troubleshoot and patch the save-to-spine step.
- 2026-08-29 5:10 PM MT: TASK-005 sim-task-005 write-back proof. Transcript + scorecard on brain. Email brianscottwatson@gmail.com. Prompt patched both repos. Live hangup still deploying.
- 2026-08-31: Test run complete — spine coherent, no drift detected.
- 2026-09-01: Live test call — Brian Watson, Colorado Hot Tub LLC, 970-201-1236. Write-back proved (Formspree + scorecard + email + spine). Gaps: repetition, no name up front, no site lookup, blank estimates. TASK-006 posted.
- 2026-09-01 ~10:40 AM MT: TASK-006 live on Autoscale. Name-first + site lookup + inbound mute/echo re-ask. Voice URL still POST https://getpeaksignal.com/api/voice (track=inbound_track). CoS owns second test-call.
- 2026-09-01 ~10:52 AM MT: Confirmed GITHUB_TOKEN exists in Peak Replit workspace Secrets and Autoscale production secrets. Hangup GitHub write should run. Second test-call still CoS.
- 2026-09-01 ~5:01 PM MT: Second test call — Brian Watson, Altspace Coworking, 970-201-1236, altspacecowork.com. Name-first + site lookup + needs-baseline estimates + Formspree/email. Repetition remains. Hangup GitHub write missed; CoS filed clients/altspace-coworking/. TASK-006 partial.
- 2026-09-02: Test run complete — spine coherent, no drift detected.
- 2026-09-03: Test run complete — spine coherent, no drift detected.
- 2026-09-03 ~5:16 PM MT: Test run complete — spine coherent, no drift detected.
- 2026-09-04: Test run complete — spine coherent, no drift detected.
- 2026-09-04 ~11:01 AM MT: Test run complete — spine coherent, no drift detected.
