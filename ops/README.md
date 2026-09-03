# Peak Signal Ops / Harness (TASK-008)

Password-gated dashboard at `/ops` on the Peak Signal Replit Autoscale app.

## Env
- `OPS_PASSWORD` — required to unlock (also accepts `HARNESS_PASSWORD`)
- `GITHUB_TOKEN` — read brain `clients/` (same secret as voice hangup)

## Mount (api-server)
1. Copy `ops-router.ts`, `ops.html`, `cht.html` into `artifacts/api-server/src/ops/`
2. In routes: `import { opsRouter } from "./ops/ops-router"; app.use("/ops", opsRouter);`
3. Ensure `express.json()` is on before the router
4. Set `OPS_PASSWORD` in workspace + Autoscale production secrets
5. Build + republish Autoscale

## Routes
- `GET /ops` — login + client list
- `GET /ops/c/:slug` — client harness (CHT first)
- `POST /ops/api/login` `{ "password": "..." }`
- `GET /ops/api/clients` — brain folders
- `GET /ops/api/clients/:slug` — notes/tasks/plugins from markdown

No Skimmer dollars. Read-only. From-line Brian at Peak Signal.
