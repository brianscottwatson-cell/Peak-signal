# Replit Agent — copy Peak outbound quote files

Do NOT set `PEAK_OUTBOUND_ENABLED`.
Do NOT place a call. Do NOT change Replit secrets, Twilio webhooks, or env vars.
Do NOT edit `PEAK_VOICE_MODE` or inbound `/api/voice`.
Copy the files below, build, and stop. Enabling the route waits for Brian's typed approval. The later steps are in `voice/peak/README.md` under "Waiting on Brian's typed approval".

`POST /api/voice/outbound` is already mounted from `voice-ara.ts`. Quote mode is a `mode: "quote"` body on that same route, plus `POST /api/voice/outbound/approvals`. Both stay 404 until `PEAK_OUTBOUND_ENABLED` is exactly `1`.

## Files from GitHub Peak-signal

`peak-outbound.ts` imports `./peak-quote`, `./peak-identity`, `./peak-phone`, and `../brotli-guard`. Those relative imports work for both of these trees:

- `artifacts/api-server/src/voice-ara.ts` and `artifacts/api-server/src/peak/`
- `artifacts/api-server/src/voice/voice-ara.ts` and `artifacts/api-server/src/voice/peak/`

Copy into `artifacts/api-server/src/peak/` (or `src/voice/peak/` if that is where `peak-outbound.ts` already lives):

- `voice/peak/peak-outbound.ts` → `peak-outbound.ts` (replace the booking file)
- `voice/peak/peak-quote.ts` → `peak-quote.ts` (new)
- `voice/peak/peak-identity.ts` → `peak-identity.ts` (new)
- `voice/peak/peak-phone.ts` → `peak-phone.ts` (new)

`peak-outbound.ts` imports `../brotli-guard` (CVE-2026-111497). Also copy `voice/brotli-guard.ts` to `artifacts/api-server/src/brotli-guard.ts` and to `artifacts/api-server/src/voice/brotli-guard.ts`. If `voice-ara.ts` is not under `src/voice/`, the guard beside `voice-ara.ts` is the one the import resolves.

Do not add a phone number, a token secret, or an allowlist to these files. The default quote caller is Peak Signal for Brian. Colorado Hot Tub is optional and is not the default. Callback numbers come from `PEAK_OUTBOUND_CALLBACK_NUMBER` at call time. Approval is two steps: the plan is shown first, and a token is issued only after that plan is confirmed. Both are described in `README.md`. Do not put a personal number in these files.

These paths are on `main` only after this branch is merged. Until then, add `?ref=cursor/outbound-quote-mode-55af` to each contents URL.

Fetch with:

```bash
mkdir -p artifacts/api-server/src/peak artifacts/api-server/src/voice
for f in peak-outbound.ts peak-quote.ts peak-identity.ts peak-phone.ts; do
  curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github.raw" \
    -o "artifacts/api-server/src/peak/$f" \
    "https://api.github.com/repos/brianscottwatson-cell/Peak-signal/contents/voice/peak/$f"
done
curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github.raw" \
  -o "artifacts/api-server/src/brotli-guard.ts" \
  "https://api.github.com/repos/brianscottwatson-cell/Peak-signal/contents/voice/brotli-guard.ts"
cp artifacts/api-server/src/brotli-guard.ts artifacts/api-server/src/voice/brotli-guard.ts
```

If peak files already live under `src/voice/peak/`, change the `-o` directory to that path. Do not create a second copy.

## Stop after the copy

Do not run the build, do not Republish, and do not change secrets in this paste. Those steps wait for Brian's typed approval. They are written in `README.md` under "Waiting on Brian's typed approval", including:

```bash
cd artifacts/api-server && pnpm run build
```

Autoscale does not build api-server. A later Republish without that command would serve the previous `dist`. Do not Republish until Brian has typed approval.
