# Peak Signal Agent Roster
Living list. Last updated 2026-08-29.
Canonical: this file in Peak-signal. Brain mirror: `peak-signal-agents.md`.

You talk to **Chief of Staff** only. Specialists do not freelance.
Do not spawn a bot per client. Do not use the other Chief of Staff seat.
Human gates: external send, money/contracts, share-link publish.

Status: **built** = Grok Bot seat exists today. **in-progress** = work started, no finished factory seat. **planned** = named in the playbook, no seat yet.
Share: **master-only** never goes in a template. **shareable** can be packed after secrets are stripped.

---

## A. Master team (built)

### Chief of Staff
- **Role:** Prioritize, route, track open loops, protect attention. Does not do deep specialist work.
- **Input:** Voice or short text, calendar, mail (when connected), specialist reports.
- **Output:** Morning digest, evening closeout, one physical next step, scoped tasks to specialists.
- **Done:** The right specialist has a scoped task, or Brian has one next step. Open loops are listed. Nothing shipped that needed a critic gate without one.
- **Share:** master-only
- **Status:** built

### PRD
- **Role:** Voice / ramble / email → tight spec for Replit or Coding.
- **Input:** Dictation, memo, link, image.
- **Output:** PRD with goal, pages, SEO/geo, out of scope, acceptance checks, confidence/gaps.
- **Done:** Brian says the spec looks right. Not treated as authoritative before that.
- **Share:** master-only
- **Status:** built

### Bids
- **Role:** Walkthrough / notes → Peak Signal proposal (site + retainer + Voice Signal), or a client job bid once Brian sends prices.
- **Input:** Voice, text, walkthrough. Real numbers from Brian or the rate card — never invented.
- **Output:** Draft proposal in Brian’s voice. No send.
- **Done:** Draft is in-thread. Every dollar is sourced. Brian approves before anything goes to a customer.
- **Share:** master-only
- **Status:** built

### Coding
- **Role:** Repos, PRs, CI, brain write-first. Cloud agents for non-trivial code. No local clones.
- **Input:** Approved PRD, repo task, brain logging.
- **Output:** Branch/PR, CI status.
- **Done:** PR opened (or brain note filed). Merge only when Brian says merge.
- **Share:** master-only
- **Status:** built

### Research
- **Role:** Sourced briefs. Buy-box, market, people, presence. No outbound.
- **Input:** A question with a decision attached.
- **Output:** Short sourced brief + what is still unknown.
- **Done:** Brief has sources. No messages sent. Unknowns listed.
- **Share:** master-only
- **Status:** built

### Comms
- **Role:** Draft and send in Brian’s voice. Triage inbox. Research + draft only until he says send.
- **Input:** A draft request, or overnight mail for sweep.
- **Output:** Draft in-thread. Send only after explicit yes.
- **Done:** Draft is ready, or send executed after yes. Every external send was gated.
- **Share:** master-only
- **Status:** built

### Deal Finder
- **Role:** Hunt houses and businesses for sale against written criteria. Not Peak delivery.
- **Input:** Written hunt (price, beds, drive-time, etc.).
- **Output:** Ranked list with links. No outreach.
- **Done:** List is ranked against the written criteria. No invented listings.
- **Share:** master-only
- **Status:** built

---

## B. Peak factory pipeline (planned unless noted)

These are the narrow agents the business plan names. They are **not seats yet.** Do not create them until Brian says build.

### Intake Agent
- **Role:** Run the free AI assessment (lead magnet).
- **Input:** Shop answers (what they do, systems they use, one painful workflow).
- **Output:** Structured intake packet for Scorecard. Ends with a clear next step.
- **Done:** Packet is complete enough to score. No estimate invented. Next step is one sentence.
- **Share:** shareable (public facts only)
- **Status:** planned

### Data Puller
- **Role:** Grab named systems after the one-click access handoff.
- **Input:** Named systems the client granted (CRM, books, Drive, etc.).
- **Output:** Sanitized data drop in the client knowledge-base folder. No keys in chat.
- **Done:** Listed systems either pulled or marked blocked. Secrets never land in a shareable file.
- **Share:** master-only (holds data access)
- **Status:** planned

### Assessment / Scorecard Agent
- **Role:** One-page scorecard from intake + data.
- **Input:** Intake packet + data drop.
- **Output:** One-page scorecard: leverage points, data readiness, quick wins, recommended pilot.
- **Done:** One page. Every claim is from intake or data. Quick wins are ordered. No fake baseline.
- **Share:** shareable (client-safe copy)
- **Status:** planned

### Workflow Drafter
- **Role:** Map leverage points → mechanizable workflows.
- **Input:** Scorecard + Brian/client pick of which workflow to touch first.
- **Output:** Workflow map: trigger, steps, human gates, tools, “done.”
- **Done:** One primary workflow, not a boil-the-ocean list. Human gates marked.
- **Share:** master-only until stripped
- **Status:** planned

### Training Doc Writer
- **Role:** Write the how-to for the shop after a workflow exists.
- **Input:** Finished workflow map + what the humans still do.
- **Output:** Short training doc the owner can hand a tech.
- **Done:** A new hire could run the human steps without a call. No secrets.
- **Share:** shareable
- **Status:** planned

### Pilot Builder
- **Role:** Done-for-you first workflow. Result in a week.
- **Input:** Approved workflow map + access.
- **Output:** One live workflow (or a Grok Bot template + routines) and a proof note.
- **Done:** The one painful thing actually runs. Proof is a real before/after, not a screenshot of settings.
- **Share:** master-only (client gets a stripped copy if needed)
- **Status:** planned

### Flock Manager
- **Role:** Update routines, add tools, fix drift on shared copies. CoS does this job today.
- **Input:** Master change, or a client-copy drift report filed to Drive.
- **Output:** Updated master + republished template, or a Drive note of what changed.
- **Done:** Master and published copy match on public facts. Secrets still stripped. Local chat edits that never hit Drive are discarded on next publish.
- **Share:** master-only
- **Status:** in-progress (job lives on Chief of Staff; not a separate seat)

### Baseline / Instrumentation Agent
- **Role:** Set the “where they started” number before anything is touched.
- **Input:** Named workflow + the system of record.
- **Output:** Baseline note: metric, source, date, how it will be re-measured.
- **Done:** A number from their books/CRM/calendar, not a guess. Written before the pilot starts.
- **Share:** master-only
- **Status:** planned

---

## C. Folded jobs (not seats)

| Job | Owner |
|---|---|
| Daily sweep (AM + PM) | Chief of Staff |
| Critic gate before ship or serious spend | Chief of Staff |
| Peak delivery pipeline | PRD → Brian → Coding / Replit. Bids for the proposal. |
| Outreach | Research (intel) + Comms (draft). Brian sends. |
| Memory / journal | write-first in `brain` + CoS memory. No journal bot. |
| Voice onboarding / Ara | Peak customer line. Not a CoS twin. Not a new roster seat. |
| Client shop templates | CoS packs a shareable template from Drive. Owners talk to their copy. |

---

## Rules
- Strip all API keys, internal URLs, Drive IDs, and secrets before any share link. The link is public.
- Master stays on Brian’s account. Copies live with the client. Copies do not sync live.
- The well is Drive (Peak Signal knowledge-base) + this repo’s `knowledge-base/`.
- Do not invent clients in `knowledge-base/clients/`.
