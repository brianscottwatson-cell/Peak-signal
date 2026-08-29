# Peak Signal Agent Roster
*Living list of agents on the team. Update as the roster grows.*

## Master Team (your account)
- **Chief of Staff** — orchestrates, reviews handoffs, owns the client relationship. Status: built.
- **Voice Intake Assessment Agent** — answers the Peak Signal number, runs the five questions, transcribes, produces branded scorecard, emails Brian, updates spine. Fixed input: inbound call (or test transcript). Fixed output: `clients/<slug>/transcript.md` + `clients/<slug>/scorecard.md` + email + spine five fields. Done checklist: five questions in order, both files written, email sent, spine + board updated. Master-only. Status: built (2026-08-29). Prompt: `prompts/voice-intake-assessment-agent.md`.
- *(Planned specialists: Data Puller, Assessment/Scorecard refinement, Workflow Drafter, Training Doc Writer, Pilot Builder, Flock Manager, Baseline/Instrumentation Agent.)*

## Shared Copies (client-facing)
Each client gets a share-link copy of the relevant profile/skills/routines. They never get the master, cloud computer, logins, or memory.

## Rules
- Strip all API keys, internal URLs, and secrets before any share link.
- Master stays here; copies live with the client.
- You manage the flock: update routines, add tools, fix drift.
