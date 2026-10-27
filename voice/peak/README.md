# Peak outbound voice

Manual Twilio calls on `POST /api/voice/outbound`. The route is mounted from `voice-ara.ts`. It stays **off** unless `PEAK_OUTBOUND_ENABLED` is exactly `1`. Any other value, including unset, returns 404 for the dial and for quote approvals. No redial and no queue.

Inbound `PEAK_VOICE_MODE` is not read here.

## Modes

`mode` defaults to `book`.

**Book** (today's call). Opening: "I'm calling to book {task}". Speaks as "{name}'s assistant". Outcomes: booked, alternate offered, declined, voicemail, no answer. Cap: 240 seconds. No approval token. No allowlist. No AI disclosure beyond the existing recording line.

**Quote.** Asks a business for rates. Requires a per-number approval token and an allowlist hit. Opening states that the caller is an AI assistant, names the business it represents, and says the call is being recorded. Cap defaults to 420 seconds (7 minutes).

A number on `PEAK_OUTBOUND_DNC` is refused in **both** modes (`403 do_not_call`). The list is empty until that variable is set, so booking does not change until then. That shared check is intentional: a do-not-call entry means do not dial.

## Quote identity

The call path looks up an id. It does not assume Colorado Hot Tub.

| Source | Role |
|---|---|
| Request `identity` | Wins when present |
| `PEAK_OUTBOUND_IDENTITY` | Used when the request omits `identity` |
| Built-in `cht` | Colorado Hot Tub, Justin and Heather. No phone number |
| `PEAK_OUTBOUND_IDENTITIES` | JSON array of extra `{id, business, contacts}` objects. Cannot replace `cht`. Entries with an email or a phone number are ignored |

## Quote result fields

The agent reports only what the other person said. Omitted, blank, or unknown fields are stored as `not provided`. The server does not copy the task into a rate.

Rate, crew size, minimum hours, travel charge, same-day availability, notice needed, insurance, certificate of insurance, on-call interest, person spoken to, callback preference.

The summary uses the same Formspree post and the same recording callback as booking. The quote body adds the identity, the line-type warning, the callback that was offered, and those fields.

## Callback number

Read when the call is placed. Nothing in the repo is a callback number.

| Config | What the agent may say |
|---|---|
| `PEAK_OUTBOUND_CALLBACK_NUMBER` is valid US E.164 | That number only |
| Value missing or not US E.164 | No number. It says it cannot give a number on this call |
| `PEAK_OUTBOUND_MENTION_MAIN_LINE=1` and no valid callback number | It may say they can call the business main line. It still speaks no digits |

An invalid callback value is not spoken.

## Approval tokens

`POST /api/voice/outbound/approvals` with `X-Peak-Outbound-Secret`.

```json
{ "to_number": "+1XXXXXXXXXX", "approved_by": "Brian" }
```

`approved_by` is who typed the approval (`Brian`, or `Grok Bot for Brian` when relaying that typed yes). The response returns `approval_token` once, plus `line_type` and `warning`.

The token is `{16 hex id}.{64 hex secret}`, bound to that destination, single use, and kept in process memory. There is no signing key in the repo. A restart drops unused tokens, which fails closed. Logs record id, number, who, time, and line type. They do not record the secret or the full token.

Default life is 1800 seconds. `PEAK_OUTBOUND_APPROVAL_TTL_SEC` may set 60 through 86400. Anything else uses 1800.

A quote call without a valid token is refused. Reuse, expiry, and a different destination are refused. A failed dial still consumes the token. A rate limit, a missing Twilio config, a do-not-call hit, or a line-type warning does not.

## Destination checks

Quote calls need `PEAK_OUTBOUND_QUOTE_ALLOWLIST`, a comma-separated list of US E.164 numbers. An empty or unset list blocks every quote call (`403 not_allowlisted`). Booking ignores the allowlist.

Before a token is issued, the server calls Twilio Lookup v2 line-type intelligence with the existing `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`. `Accept-Encoding` is `gzip, identity`.

| Lookup result | Treatment |
|---|---|
| `landline`, `fixedVoip`, `tollFree` | Not flagged |
| `mobile` | Risky. Warning names the cell-consent issue |
| Anything else, HTTP failure, `error_code`, or missing credentials | `unknown` or the raw type. Risky. The summary says the type could not be confirmed |

A risky number is not dialed unless the quote request sets `accept_line_warning` to boolean `true`. The 409 body repeats the warning. The token stays unused until that acknowledgement. The warning is also in the emailed summary.

## Caps and gate

| Variable | Effect |
|---|---|
| `PEAK_OUTBOUND_ENABLED=1` | Only value that opens the route |
| `PEAK_OUTBOUND_QUOTE_TIME_LIMIT_SEC` | Quote cap in seconds. Default 420. Allowed 60 through 900. Otherwise 420 |
| Booking cap | Stays 240. The quote variable does not change it |
| `PEAK_OUTBOUND_PER_MINUTE` / `PEAK_OUTBOUND_PER_DAY` | Shared by both modes. Defaults 1 and 10 |

Quote dials use the same Twilio recording and the same machine detection as booking.

## Copy into Replit

Voice files in this repo are copied by hand. `voice-ara.ts` already mounts `peakOutboundRouter`. This change adds modules next to it. Relative imports are `./peak-quote`, `./peak-identity`, `./peak-phone`, and `../brotli-guard`, which resolve when the tree below is copied either as `src/voice-ara.ts` + `src/peak/` + `src/brotli-guard.ts`, or as `src/voice/voice-ara.ts` + `src/voice/peak/` + `src/voice/brotli-guard.ts`.

Copy:

- `voice/peak/peak-outbound.ts` → `artifacts/api-server/src/peak/peak-outbound.ts`
- `voice/peak/peak-quote.ts` → `artifacts/api-server/src/peak/peak-quote.ts`
- `voice/peak/peak-identity.ts` → `artifacts/api-server/src/peak/peak-identity.ts`
- `voice/peak/peak-phone.ts` → `artifacts/api-server/src/peak/peak-phone.ts`
- `voice/brotli-guard.ts` → `artifacts/api-server/src/brotli-guard.ts` (and `src/voice/brotli-guard.ts` if `voice-ara.ts` lives under `src/voice/`)

Leave `voice-ara.ts`, `peak-forward.ts`, and `peak-prompt.ts` as they already are unless those copies are stale. Do not edit `PEAK_VOICE_MODE`.

## Waiting on Brian's typed approval

Do not set `PEAK_OUTBOUND_ENABLED`, do not place a call, and do not change Replit secrets as part of copying files. The steps below are the later enable path. They wait for Brian to type approval.

1. Copy the files in the list above.
2. From the Replit app root: `cd artifacts/api-server && pnpm run build`.
3. Republish. Autoscale does not build on its own. A stale `dist` keeps serving the previous route.
4. In Replit secrets, still with the gate off, set only what this call needs:
   - `PEAK_OUTBOUND_SECRET` (long random string; never commit it)
   - `PEAK_OUTBOUND_FROM` (the Twilio US E.164 line)
   - `PEAK_OUTBOUND_QUOTE_ALLOWLIST` (the one test number, US E.164)
   - `PEAK_OUTBOUND_IDENTITY=cht` or send `identity` on the request
   - `PEAK_OUTBOUND_CALLBACK_NUMBER` only if the agent should speak a callback. Otherwise leave it unset
   - `PEAK_OUTBOUND_DNC` if any numbers must be refused
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `XAI_API_KEY`, and `HOSTNAME` are the existing voice values
5. Restart or republish so the process sees those secrets. The gate is still off, so the route stays 404.
6. Set `PEAK_OUTBOUND_ENABLED=1` only after the typed approval, then restart or republish again.
7. Issue a token (this is the approval step; read `warning` before dialing):

```bash
curl -sS -X POST "https://<host>/api/voice/outbound/approvals" \
  -H "Content-Type: application/json" \
  -H "X-Peak-Outbound-Secret: <secret>" \
  -d '{"to_number":"+1XXXXXXXXXX","approved_by":"Brian"}'
```

8. Place one test call to a number Brian owns. Use the token once. For a mobile or unknown line, include `"accept_line_warning": true` only after reading the warning.

```bash
curl -sS -X POST "https://<host>/api/voice/outbound" \
  -H "Content-Type: application/json" \
  -H "X-Peak-Outbound-Secret: <secret>" \
  -d '{"mode":"quote","to_number":"+1XXXXXXXXXX","business_name":"Example Movers","task":"a local two-bedroom move","identity":"cht","approval_token":"<token>"}'
```

9. Turn it off by setting `PEAK_OUTBOUND_ENABLED` to anything other than `1`, or deleting it, then restart or republish. The handler reads the flag on every request. A secret change still has to reach the process.

## Tests

From the repo root, with dependencies installed:

```bash
node --experimental-strip-types voice/peak/peak-outbound.test.ts
node --experimental-strip-types voice/peak/peak-quote.test.ts
```

Numbers in the tests are 555-01xx ranges. Fetch is stubbed.

The quote dial model is `docs/verification/PeakQuoteGate.tla`.
