# Peak Signal Data Spine

**Single source of truth.** Every agent, the Chief of Staff, and Brian read this before acting and write to it after. Voice transcripts and docs feed into these five fields only. No freeform notes.

## Current State

- **Objective:** Build the AI implementation partnership business (Peak Signal) from project to million-dollar scale using agent swarms, retainers, and value-share.
- **Status:** Concept locked. Business plan saved. Roster expansion prompt ready. First cron test pending.
- **Owner:** Brian (human) + Chief of Staff (agent)
- **Blockers:** None yet. Need first real client pilot to validate the factory.
- **Next action:** Run the Chief of Staff roster expansion prompt; then test the spine sync cron.

## Loop Rules

1. **Write protocol:** Update only these five fields, same format, every time. No freeform.
2. **Read-before-act:** No agent starts work without reading this file first.
3. **Cron referee:** Runs every few hours, diffs spine against recent voice transcripts and docs, flags conflicts, merges into one coherent version.
4. **Schema evolution:** Add or drop fields deliberately, in one commit, with a note on why. Never let agents silently fork the format.

## Log

- 2026-08-29: Spine created. Five fields locked. First test cron to be scheduled.
- 2026-08-29: Test run complete — spine coherent, no drift detected.
