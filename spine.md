# Peak Signal Data Spine

**Single source of truth.** Every agent, the Chief of Staff, and Brian read this before acting and write to it after. Voice transcripts and docs feed into these five fields only. No freeform notes.

## Current State

- **Objective:** Build the AI implementation partnership business (Peak Signal) from project to million-dollar scale using agent swarms, retainers, and value-share.
- **Status:** Voice Intake Assessment Agent script ready. Live /api/voice already streams Ara. Twilio Console VoiceUrl cannot be read from here (no Twilio API). Five-question prompt not published to Replit yet (session expired; box held for Skimmer).
- **Owner:** Brian (human) + Chief of Staff (agent)
- **Blockers:** TASK-003 blocked: no Twilio API. Replit session expired. Skimmer login in progress on the computer.
- **Next action:** After Skimmer, Brian confirms Twilio Voice webhook is POST https://getpeaksignal.com/api/voice, then signs into Replit so Coding can publish the five-question Ara prompt. Then Brian test-calls 970-660-5088.

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
- **Result:** 7 built master seats + 8 factory names. KB stubs in Drive and Peak-signal#1 + brain#4.

### TASK-002 — Build Voice Intake Assessment Agent
- **Posted by:** Brian (via Grok)
- **Assigned to:** Chief of Staff
- **Status:** done (prompt). Live 970 still needs the five-question publish (TASK-003 / Coding).
- **Result:** Prompt at `prompts/voice-intake-assessment-agent.md`. Live /api/voice already returns Ara Stream TwiML.

### TASK-003 — Swap Twilio number to Voice Intake Assessment Agent
- **Posted by:** Brian (via Grok)
- **Assigned to:** Chief of Staff
- **Status:** blocked (2026-08-29) — Twilio API not reachable from this environment. No credentials stored.
- **Instructions:** Re-point the Peak number's voice webhook to the Voice Intake Assessment Agent. If API is not reachable, document the exact manual step and mark blocked.
- **Manual step for Brian:**
  1. Twilio Console → Phone Numbers → Active → +1 970 660 5088
  2. Voice Configuration → A CALL COMES IN → Webhook, HTTP POST, URL `https://getpeaksignal.com/api/voice`
  3. Save. Do not point Voice at `/contact` or Formspree.
  4. Sign into Replit on this computer so Coding can publish the five-question prompt to `/api/voice`.
  5. Test-call 970-660-5088. Expect the free AI assessment greeting and five questions.
- **Done when:** Incoming calls reach the five-question Voice Intake Assessment Agent, not the intake form.
- **Probe (2026-08-29):** POST https://getpeaksignal.com/api/voice already returns `<Connect><Stream url="wss://peak-signal.replit.app/api/voice/stream/..."/></Connect>`. That is Ara, not the web form. Remaining work is Console confirmation + Replit publish of the new script.

## Log

- 2026-08-29: TASK-003 posted. Twilio number reported routed to intake form.
- 2026-08-29: TASK-003 blocked. No Twilio API. Live /api/voice already streams Ara. Manual step documented. Replit publish waiting on box after Skimmer.
