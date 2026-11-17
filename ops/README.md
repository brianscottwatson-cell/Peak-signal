# Peak Signal Ops / Harness (TASK-008)

Password-gated dashboard at `/ops` on the Peak Signal Replit Autoscale app.

## Env
- `OPS_PASSWORD` — required to unlock (also accepts `HARNESS_PASSWORD`)
- `GITHUB_TOKEN` — read brain `clients/` (same secret as voice hangup)
- `CHT_CALLS_PATH` — optional override for the CHT call JSON (default `<cwd>/data/cht-calls.json`)
- `CHT_METRICS_PATH` — optional override for the Google metrics JSON. Leave unset in production so the bundled snapshot is used.
- `CHT_SKIMMER_PATH` — optional override for the Skimmer counts JSON. Leave unset in production so the bundled snapshot is used.

## Mount (api-server)
1. Copy `ops-router.ts`, `cht-metrics.ts`, `cht-metrics.json`, `cht-skimmer.ts`, `cht-skimmer.json`, `json-modules.d.ts`, `ops.html`, and `cht.html` into `artifacts/api-server/src/ops/`. Copy `voice/brotli-guard.ts` to `artifacts/api-server/src/voice/brotli-guard.ts` (`ops-router` imports `../voice/brotli-guard`).
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
- `GET /ops/api/clients/:slug/metrics` — CHT Google metrics snapshot (auth required, read-only). No write route.
- `GET /ops/api/clients/:slug/skimmer` — CHT Skimmer counts (auth required, read-only). Invoice figures are counts. No write route. Revenue stays not connected.

## Google metrics
Committed rows live in `ops/cht-metrics.json` (one object per month; append a line to add a month). `ops/cht-metrics.ts` imports that file.

Autoscale `artifacts/api-server/build.mjs` bundles `src/index.ts` with esbuild into `dist/index.mjs`, then copies only `ops.html` and `cht.html` into `dist/ops/`. It does not copy JSON. The import is what puts the rows in the bundle, so they load after `cd artifacts/api-server && pnpm run build` without a new `copyFileSync` line. Copy `cht-metrics.json` next to `ops-router.ts` under `src/ops/` before that build. `json-modules.d.ts` is what lets api-server `tsc` accept the JSON import (`resolveJsonModule` is off there).

A runtime read of `data/cht-metrics.json` would miss in production: that path is not in the image. `data/cht-calls.json` is different — cht-voice writes it on the instance disk at runtime.

## Skimmer counts
Committed snapshot: `ops/cht-skimmer.json`, imported by `ops/cht-skimmer.ts` the same way as the Google file, so esbuild inlines it. Copy both into `src/ops/` before `pnpm run build`.

Quotes created (with approved / rejected / sent-pending), finished work orders, and invoices issued are monthly counts. November 2026 is partial (`Nov 1-11`) and is not compared with October. The read also stores open work orders, active customers, customers on routes, and outstanding invoices. Outstanding invoices and invoices issued are counts. The revenue panel stays not connected.

Null metrics render as `not captured`. Month-over-month change is the absolute difference and the percent versus the previous month. Nothing is shown when either value is null, or when either month is `partial`. A move from 0 shows the absolute difference only. A partial month shows a Partial month label and `partial_note` (November 2026: `through Nov 10`).

## CHT call log
cht-voice writes real Twilio calls only (`CA…` CallSid) to `data/cht-calls.json`.
The dashboard does not invent rows. Revenue stays not connected. Quote and service-job counts are the Skimmer snapshot, not a live feed.
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
