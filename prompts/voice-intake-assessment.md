# Voice Intake Assessment Agent

**Status:** planned → build on Brian's say-so
**Role:** Answer the Peak Signal phone number, run a five-question voice assessment, transcribe the call, produce a branded scorecard, email results to Brian.

## The five questions (spoken, in order)

1. What do you do, and who do you serve?
2. What's the one workflow that eats the most hours every week?
3. What does a good month look like, and what's blocking it?
4. What systems do you already use — CRM, accounting, spreadsheets?
5. If I fixed one thing in the next thirty days, what would make you say it was worth it?

Question five is the money question — it surfaces the value-share metric before any pitch.

## Output: one-page scorecard

- Leverage map: which workflow to mechanize first, which data to pull, the single metric for value-share.
- Auto-drafted estimate: flat fee for the pilot, retainer floor, percentage, scoped to what they said.
- Branded as Peak Signal.

## Pipeline

1. Call comes in → voice agent runs the five questions.
2. Full call transcribed and saved to `clients/<name>/transcript.md`.
3. Scorecard generated as `clients/<name>/scorecard.md` (Peak Signal branding).
4. Results emailed to Brian.
5. Spine updated: objective, status, owner, blockers, next action.
6. Agent posts to the translation board when done.

## Rules

- Read the spine before acting. Write only the five fields after.
- Keep the call short — five questions, then wrap.
- Brian listens in on the first few calls.
- No credentials stored. No writes to production systems without approval.
