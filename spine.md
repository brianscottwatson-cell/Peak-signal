# Peak Signal Data Spine

**Single source of truth.** Every agent, the Chief of Staff, and Brian read this before acting and write to it after. Voice transcripts and docs feed into these five fields only. No freeform notes.

## Current State

- **Objective:** Build the AI implementation partnership business (Peak Signal) from project to million-dollar scale using agent swarms, retainers, and value-share.
- **Status:** Voice Intake Assessment Agent built and testable. Soft-ping board job live (hourly). Roster updated. Ready for first test call. Brian reports Twilio number is live and currently routed to the intake form — needs swap to the voice intake agent.
- **Owner:** Brian (human) + Chief of Staff (agent)
- **Blockers:** Peak-signal#1 and brain#4 unmerged. Twilio number still routed to intake form — needs re-point to Voice Intake Assessment Agent.
- **Next action:** Chief of Staff to re-point the Twilio number from the intake form to the Voice Intake Assessment Agent (TASK-003). Then Brian calls the number, runs the five-question flow, and confirms scorecard + email path. Merge the two PRs. Convert Heather and Justin to a paid pilot.

## Loop Rules

1. **Write protocol:** Update only these five fields, same format, every time. No freeform.
2. **Read-before-act:** No agent starts work without reading this file first.
3. **Cron referee:** Every 2 minutes intent; soft ping currently hourly (platform limit). Soft ping: read the spine, see if anything changed, update the log if it did, otherwise stay quiet. Never re-run expand-roster or TASK-001 from this loop.
4. **Schema evolution:** Add or drop fields deliberately, in one commit, with a note on why. Never let agents silently fork the format.

## Translation Board (tasks)

### TASK-001 — Expand roster + knowledge base
- **Posted by:** Brian (via Grok)
- **Assigned to:** Chief of Staff
- **Status:** done (2026-08-29)
- **Instructions:** Read `prompts/chief-of-staff-expand-roster.md`. Expand `peak-signal-agents.md` (and mirrored `agents/README.md`) into the full living roster with name, role, input, output, done-checklist, master/shareable, status for each agent. Create `knowledge-base/` folder with the empty placeholder files listed in the prompt. Mirror into Peak-signal repo. When done, update this task status to done and add a log entry here.
- **Done when:** Roster has 8+ agents detailed; knowledge-base/ exists with placeholders; both repos updated; spine log notes completion.
- **Result:** 7 built master seats + 8 factory names (Flock Manager in-progress as a CoS job, 7 planned, no new bots). KB stubs in Drive and https://github.com/brianscottwatson-cell/Peak-signal/pull/1 + https://github.com/brianscottwatson-cell/brain/pull/4. clients/ empty on purpose.

### TASK-002 — Build Voice Intake Assessment Agent
- **Posted by:** Brian (via Grok)
- **Assigned to:** Chief of Staff
- **Status:** done (2026-08-29)
- **Instructions:** Read `prompts/voice-intake-assessment.md`. Build the voice agent that answers the Peak Signal number, runs the five questions, transcribes the call, generates a Peak Signal-branded scorecard, emails results to Brian, and updates this spine. Schedule a soft-ping job that checks the board every two minutes and reports when done.
- **Done when:** Agent answers a test call, produces a scorecard, emails Brian, updates spine, posts to board.
- **Result:** Agent prompt live at `prompts/voice-intake-assessment-agent.md` (both repos). Templates at `clients/_template/transcript.md` + `scorecard.md` (brain). Roster updated. Soft-ping automation `Peak-Signal-Soft-Ping-Board` scheduled (hourly closest supported). Ready for Brian test call / simulated transcript.

### TASK-003 — Swap Twilio number to Voice Intake Assessment Agent
- **Posted by:** Brian (via Grok)
- **Assigned to:** Chief of Staff
- **Status:** open
- **Instructions:** Brian reports the Twilio number is live and currently hooked to the intake form. Re-point that number's voice webhook / routing to the Voice Intake Assessment Agent built in TASK-002 (prompt at `prompts/voice-intake-assessment-agent.md`). Confirm the change, update this task to done, and add a log entry. Do not store any credentials. If the Twilio API is not reachable from this environment, document the exact manual step Brian must run and mark the task blocked with that instruction.
- **Done when:** Incoming calls to the Peak Signal number reach the Voice Intake Assessment Agent, not the intake form.

## Log

- 2026-08-29: Spine created. Five fields locked. First test cron to be scheduled.
- 2026-08-29: Test run complete — spine coherent, no drift detected.
- 2026-08-29: TASK-001 posted to translation board. Chief of Staff to pick it up, expand roster, build knowledge-base placeholders.
- 2026-08-29: TASK-001 done. Roster + KB stubs written. Two-minute loop locked as soft ping only (read / log-if-changed / stay quiet). No re-run of expand-roster.
- 2026-08-29: Voice intake assessment spec saved to `prompts/voice-intake-assessment.md` in both repos. TASK-002 posted. Brian to test the call once built.
- 2026-08-29: TASK-002 done. Voice Intake Assessment Agent built (prompt + templates + roster). Soft-ping live. Brian can test via simulated transcript or live number when telephony is wired.
- 2026-08-29: TASK-003 posted. Brian reports Twilio number is live but still routed to the intake form — Chief of Staff to re-point it to the Voice Intake Assessment Agent.
