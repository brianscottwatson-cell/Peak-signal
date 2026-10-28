# Peak outbound voice

Manual Twilio calls on `POST /api/voice/outbound`. The route is mounted from `voice-ara.ts`. It stays **off** unless `PEAK_OUTBOUND_ENABLED` is exactly `1`. Any other value, including unset, returns 404 for the dial and for quote approvals. No redial and no queue.

Inbound `PEAK_VOICE_MODE` is not read here.

## Modes

`mode` defaults to `book`.

**Book** (today's call). Opening: "I'm calling to book {task}". Speaks as "{name}'s assistant". Outcomes: booked, alternate offered, declined, voicemail, no answer. Cap: 240 seconds. No approval token. No allowlist. No AI disclosure beyond the existing recording line.

**Quote.** Asks a business for rates on behalf of Brian at Peak Signal, unless another identity is selected. Requires a per-number approval token issued for that plan, and an allowlist hit. The first sentence says it is an AI assistant calling for Brian at Peak Signal, and that the call is recorded. Cap defaults to 420 seconds (7 minutes).

A number on `PEAK_OUTBOUND_DNC` is refused in **both** modes (`403 do_not_call`). The list is empty until that variable is set, so booking does not change until then. That shared check is intentional: a do-not-call entry means do not dial.

Booking still speaks its greeting as soon as the session is ready, with interruption ignored while that greeting plays. It does not wait for hello, and it does not say "Hello?" after silence. Quote mode does those things. Booking behavior is otherwise unchanged aside from the shared do-not-call check.

## Quote identity

With nothing configured, the caller is Peak Signal for Brian. No phone number is stored on an identity.

| Source | Role |
|---|---|
| Request `identity` | Wins when present |
| `PEAK_OUTBOUND_IDENTITY` | Used when the request omits `identity` |
| Built-in `peak` | Peak Signal, Brian. This is the default |
| Built-in `cht` | Colorado Hot Tub, Justin and Heather. Optional. Not the default |
| `PEAK_OUTBOUND_IDENTITIES` | JSON array of extra `{id, business, contacts}` objects. Cannot replace `peak` or `cht`. Entries with an email or a phone number are ignored |

The opening first sentence is: "Hi, this is an AI assistant calling for Brian at Peak Signal, and this call is recorded." Another identity uses the same shape with that identity's contacts and business. The callback number is not part of the sentence. It is read from `PEAK_OUTBOUND_CALLBACK_NUMBER` when the call is placed.

## Quote behavior

The quote prompt does not book. It never books, pays, gives card details, puts down a deposit, signs up, or agrees to terms. If asked, it says someone will follow up.

It repeats each price and number back and gets confirmation, asks one question at a time, and reads every captured figure and detail back before hanging up.

Turn-taking, quote calls only: wait for the other party to say hello before the opening line, say that line once, stop when interrupted, and after about 5 seconds of silence say "Hello?" once and wait. It does not press keys or navigate a phone menu.

`PEAK_OUTBOUND_LEAVE_VOICEMAIL=1` allows one short voicemail. Otherwise the quote call does not leave a message.

## Quote results

The agent reports only what the other person said. Omitted, blank, or unknown fields are stored as `not provided`. The server does not copy the task into a rate.

Outcomes: `quote_received`, `partial_info`, `call_back_requested` (name and time when given), `transferred`, `wrong_number` (including a closed business), `declined`, `voicemail`, `no answer`, `ivr_only`.

Fields: rate, crew size, minimum hours, travel charge, same-day availability, notice needed, insurance, certificate of insurance, on-call interest, person spoken to, callback preference, callback time. Their words and what they promised are quoted in the summary.

The summary uses the same Formspree post and the same recording callback as booking. Line 1 is the outcome and the headline rate. Then their words, a Promised list, an Unclear / not provided list, the fields, the line-type warning, and the recording link.

## Callback number

Read when the call is placed. Nothing in the repo is a callback number.

| Config | What the agent may say |
|---|---|
| `PEAK_OUTBOUND_CALLBACK_NUMBER` is valid US E.164 | That number only |
| Value missing or not US E.164 | No number. It says it cannot give a number on this call |
| `PEAK_OUTBOUND_MENTION_MAIN_LINE=1` and no valid callback number | It may say they can call the business main line. It still speaks no digits |

An invalid callback value is not spoken.

## Approval

`POST /api/voice/outbound/approvals` with `X-Peak-Outbound-Secret`. The first response is the plan. It does not include a token.

```json
{
  "to_number": "+1XXXXXXXXXX",
  "approved_by": "Brian",
  "business_name": "Example Movers",
  "task": "a local two-bedroom move",
  "number_source": "Brian's note"
}
```

`approved_by` is who typed the approval (`Brian`, or `Grok Bot for Brian` when relaying that typed yes). Omit `identity` to call for Brian at Peak Signal. `number_source` is a label for where the destination came from. It is not a phone number. Omitted, it is stored as `not provided`.

The plan states who is calling for whom, the destination and its source, the line-type warning, the exact opening line, the questions, and the limits: cap in minutes, the never-commit rule, and that voicemail is off unless `PEAK_OUTBOUND_LEAVE_VOICEMAIL=1`. The callback number is not written into the plan or the log. It is still read from the environment when the call is placed.

A second request with `"confirm_plan": true` and the returned `plan_id` issues the token. The body has to match the plan. The token is `{16 hex id}.{64 hex secret}`, bound to that plan and destination, single use, and kept in process memory. There is no signing key in the repo. A restart drops unused plans and tokens, which fails closed. Logs record id, number, who, time, line type, and the plan summary. They do not record the secret, the full token, or a callback number.

A quote call dials only with a token issued for that plan and destination. A different task, identity, business, cap, or voicemail setting is `approval_plan_mismatch` and does not consume the token.

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
| `PEAK_OUTBOUND_QUOTE_TIME_LIMIT_SEC` | Quote cap in seconds. Default 420. Allowed 60 through 900. Otherwise 420. The plan shows this in minutes |
| `PEAK_OUTBOUND_LEAVE_VOICEMAIL` | Quote only. `1` allows one short voicemail. Anything else leaves none |
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
   - Leave `PEAK_OUTBOUND_IDENTITY` unset to call for Brian at Peak Signal. Set it, or send `identity`, only to select another identity such as `cht`
   - `PEAK_OUTBOUND_CALLBACK_NUMBER` only if the agent should speak a callback. Otherwise leave it unset. Do not put that number in the repo
   - `PEAK_OUTBOUND_LEAVE_VOICEMAIL` only if a quote call may leave one short message. Otherwise leave it unset
   - `PEAK_OUTBOUND_DNC` if any numbers must be refused
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `XAI_API_KEY`, and `HOSTNAME` are the existing voice values
5. Restart or republish so the process sees those secrets. The gate is still off, so the route stays 404.
6. Set `PEAK_OUTBOUND_ENABLED=1` only after the typed approval, then restart or republish again.
7. Read the plan before any token is issued. Check who is calling, the destination, the warning, the opening line, and the limits:

```bash
curl -sS -X POST "https://<host>/api/voice/outbound/approvals" \
  -H "Content-Type: application/json" \
  -H "X-Peak-Outbound-Secret: <secret>" \
  -d '{"to_number":"+1XXXXXXXXXX","approved_by":"Brian","business_name":"Example Movers","task":"a local two-bedroom move","number_source":"number Brian owns"}'
```

8. Issue a token only after that plan is acceptable. Repeat the same fields and add the plan id:

```bash
curl -sS -X POST "https://<host>/api/voice/outbound/approvals" \
  -H "Content-Type: application/json" \
  -H "X-Peak-Outbound-Secret: <secret>" \
  -d '{"to_number":"+1XXXXXXXXXX","approved_by":"Brian","business_name":"Example Movers","task":"a local two-bedroom move","number_source":"number Brian owns","confirm_plan":true,"plan_id":"<plan_id>"}'
```

9. Place one test call to a number Brian owns. Use the token once, for that same destination, business, and task. For a mobile or unknown line, include `"accept_line_warning": true` only after reading the warning. Omit `identity` so the caller is Brian at Peak Signal.

```bash
curl -sS -X POST "https://<host>/api/voice/outbound" \
  -H "Content-Type: application/json" \
  -H "X-Peak-Outbound-Secret: <secret>" \
  -d '{"mode":"quote","to_number":"+1XXXXXXXXXX","business_name":"Example Movers","task":"a local two-bedroom move","approval_token":"<token>"}'
```

10. Turn it off by setting `PEAK_OUTBOUND_ENABLED` to anything other than `1`, or deleting it, then restart or republish. The handler reads the flag on every request. A secret change still has to reach the process.

Press-keys, hold, and IVR navigation, a live human joining the call, batch calling, and simulated test calls are not part of this copy.

## Tests

From the repo root, with dependencies installed:

```bash
node --experimental-strip-types voice/peak/peak-outbound.test.ts
node --experimental-strip-types voice/peak/peak-quote.test.ts
```

Numbers in the tests are 555-01xx ranges. Fetch is stubbed.

The quote dial model is `docs/verification/PeakQuoteGate.tla`.
