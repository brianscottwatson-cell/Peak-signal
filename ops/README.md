# Peak Signal Ops / Harness (TASK-008)

Password-gated dashboard at `/ops` on the Peak Signal Replit Autoscale app.

## Env
- `OPS_PASSWORD` — required to unlock (also accepts `HARNESS_PASSWORD`)
- `GITHUB_TOKEN` — read brain `clients/` (same secret as voice hangup)
- `CHT_CALLS_PATH` — optional override for the CHT call JSON (default `<cwd>/data/cht-calls.json`)

## Mount (api-server)
1. Copy `ops-router.ts`, `ops.html`, `cht.html` into `artifacts/api-server/src/ops/`
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
5. Twilio Voice URL on `+17207800753` → `POST https://getpeaksignal.com/api/cht-voice`. Go-live: `CHT_RING_SHOP=1` + `CHT_SHOP_NUMBER=+19705312897` (Dial the website shop number, not personal cells). Never Dial inbound Called when it equals the shop DID.

## Heather confirm
1. Open `https://getpeaksignal.com/ops` and log in with `OPS_PASSWORD`.
2. Open Colorado Hot Tub (`/ops/c/colorado-hot-tub-llc`).
3. Call **+1 720 780 0753**, leave a name + need, hang up.
4. Refresh the dashboard — the call row and recording link should appear. Wait a minute if recording still says Processing.

No Skimmer dollars. Read-only. From-line Brian at Peak Signal.
