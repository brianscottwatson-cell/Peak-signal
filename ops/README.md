# Peak Signal Ops / Harness (TASK-008)

Password-gated dashboard at `/ops` on the Peak Signal Replit Autoscale app.

## Env
- `OPS_PASSWORD` — required to unlock (also accepts `HARNESS_PASSWORD`)
- `GITHUB_TOKEN` — read brain `clients/` (same secret as voice hangup)
- `CHT_CALLS_PATH` — optional override for the CHT call JSON (default `<cwd>/data/cht-calls.json`)

## Mount (api-server)
1. Copy `ops-router.ts`, `ops.html`, `cht.html` into `artifacts/api-server/src/ops/`. Copy `voice/brotli-guard.ts` to `artifacts/api-server/src/voice/brotli-guard.ts` (`ops-router` imports `../voice/brotli-guard`).
2. Copy `voice/cht/cht-call-store.ts` (and `cht-phone.ts`) with cht-voice into `artifacts/api-server/src/cht/` (writer). Ops reads the JSON file directly.
3. In routes: `import { opsRouter } from "./ops/ops-router"; app.use("/ops", opsRouter);`
4. Ensure `express.json()` is on before the router
5. Set `OPS_PASSWORD` in workspace + Autoscale production secrets
6. Build + republish Autoscale

## Routes
- `GET /ops` — login + client list
- `GET /ops/c/:slug` — client harness (CHT first)
- `GET /ops/c/colorado-hot-tub-llc` — CHT owner dashboard (call log v1)
- `POST /ops/api/login` `{ "password": "..." }`
- `GET /ops/api/clients` — brain folders
- `GET /ops/api/clients/:slug` — notes/tasks/plugins from markdown
- `GET /ops/api/clients/:slug/calls` — CHT inbound call log (auth required, read-only)

## CHT call log
cht-voice writes real Twilio calls only (`CA…` CallSid) to `data/cht-calls.json`.
The dashboard does not invent rows. Quotes / jobs / revenue show “not connected”.
No Skimmer dollars. No send-as-shop.

## Publish Autoscale (Brian)
1. Point the Peak-signal Replit Autoscale app at this branch (or merge to `main` and pull).
2. Copy the ops + cht files into `artifacts/api-server/src/` as above if the Replit tree is still a manual copy.
3. Confirm Autoscale secrets: `OPS_PASSWORD`, `XAI_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`.
4. **Publish** the Autoscale deployment (Replit Publish). A publish is required — pushing GitHub is not enough.
5. Twilio Voice URL: `+17207800753` → `POST https://getpeaksignal.com/api/cht-voice`. Do not point it at the shop line and do not Dial `+19705312897`. `CHT_RING_SHOP` unset or `0` goes straight to Grok. Owner cells, if any, belong in `CHT_RING_NUMBERS` with `CHT_RING_SHOP=1` (press 1 to accept).

## Heather confirm
1. Open `https://getpeaksignal.com/ops` and log in with `OPS_PASSWORD`.
2. Open Colorado Hot Tub (`/ops/c/colorado-hot-tub-llc`).
3. Call **+1 720 780 0753**, leave a name + need, hang up.
4. Refresh the dashboard — the call row and recording link should appear. Wait a minute if recording still says Processing.

No Skimmer dollars. Read-only. From-line Brian at Peak Signal.

## Telecom intake queue

`/ops/telecom` lists quote requests. Flags stay off until set to exactly `1`: `PEAK_TELECOM_CHAT`, `PEAK_TELECOM_INTAKE_ENABLED`. Approving a row does not email the customer and does not order service. Paste vendor or pricing results into a row with “Save vendor results” (`action: "attach-pricing"`). Those results stay on the queued request. This repo does not run a pricing lookup.

### Durable store

Replit Autoscale disk is ephemeral, and this app does not already have Postgres. When `REPLIT_DB_URL` is present, the queue is stored in Replit DB under `peak-telecom-requests`. Dev and tests use `TELECOM_REQUESTS_PATH` or `data/telecom-requests.json` when `REPLIT_DB_URL` is unset. A local file is still written as a cache. If that write fails and Replit DB is configured, the remote copy is the record.

### Email to Peak

On submit, Peak gets one machine-readable notice. The customer is not a recipient. There is no customer quote email in this change. A branded customer quote is deferred.

The mailer follows the Colorado Hot Tub service-request pattern: Resend’s HTTP API, `RESEND_API_KEY`, and a single business recipient. `PEAK_INTAKE_TO` is the recipient. `PEAK_INTAKE_FROM` is optional and defaults to `Peak Signal <onboarding@resend.dev>`. `reply_to` is the visitor so Peak can answer. If Resend is not configured, the same text is posted to `PEAK_FORMSPREE` without an attachment. The JSON is always in a fenced block in the body.

Subject:

`[PEAK-TELECOM-INTAKE v1] <requestId> <path> <businessName>`

`path` is `internet`, `voice`, `both`, `ucaas`, or `sdwan`.

The plain-text body has labeled lines (`Request ID`, `Path`, `Business`, `Prefilled vendor`, `Desired speeds`, `Fiber or broadband`, `Budget`, `Human follow-up`) and a fenced JSON block. Budget is `(not stated)` and JSON `null` unless the visitor typed a number. It is never filled in as 0. `Human follow-up` is `yes` for voice, both, UCaaS, and SD-WAN.

The fenced JSON is:

- `requestId`, `path`, `prefilledVendor`, `desiredSpeeds`, `accessType`, `budget`, `humanFollowUp`
- `opportunity`: a draft that validates against `data/loc8/opportunity.schema.json`, or `null`

UCaaS, SD-WAN, voice, and both include that draft when partner settings are present. `metadata.status` is `draft`. `metadata.environment` is `https://loc8.dev.cablefinder.net`. The draft has no opportunity id. The partner block is `LOC8_PARTNER_NAME`, `LOC8_PARTNER_EMAIL`, and `LOC8_PARTNER_PHONE`. Those values are not hardcoded. If they are missing, the request is still queued and `opportunity` is null.

Resend also attaches `telecom-intake.json` with the same JSON. `data/loc8/` is internal reference data and is not copied onto the public site.

Current provider and contract end, when the visitor supplies them, are written into `notes.opportunityNotes`. There is no separate new-install field.
