# CHT Grok Voice — owner screen, then agent

**Spec:** brain `clients/colorado-hot-tub-llc/19-voice-grok-after-ring-2026-09-08.md`  
Inbound stays on `+17207800753`. The shop line `+19705312897` is **not** a ring target. Verizon no-answer forwarding from that line into Twilio was looping back into the shop voicemail.

## Twilio
- **Inbound (stays here):** `+17207800753`
- **Shop line (do not Dial):** `+19705312897` (`CHT_SHOP_NUMBER` is only the number the agent speaks)
- Voice URL on the inbound 720 DID: `POST https://getpeaksignal.com/api/cht-voice` (or peak-signal.replit.app). **No Voice URL change** for this fix.
- Status callback (optional): `POST .../api/cht-voice/status`
- Recording callback: `POST .../api/cht-voice/recording`
- Owner whisper: `POST .../api/cht-voice/screen`

## Flow
1. **Default:** `CHT_RING_SHOP` unset or `0` → straight to Grok. The shop DID is never inserted as a Dial target.
2. **Ring-first (optional):** `CHT_RING_SHOP=1` and `CHT_RING_NUMBERS` set to owner cells (not the shop). Dial those numbers for `timeout="10"`. Each `<Number>` has a whisper `url` and `machineDetection="Enable"`.
3. **Screen:** the answered leg hears “Colorado Hot Tub call. Press 1 to take it.” `<Gather numDigits="1" timeout="5">`. Digit 1 bridges and marks the parent call accepted. No digit, a wrong digit, or an answering machine `<Hangup/>`s that leg.
4. **After Dial:** `/api/cht-voice/agent` starts Grok unless a human pressed 1. `DialCallStatus=completed` alone is not acceptance (a whisper hangup can complete the leg).
5. **Forward-loop guard:** never Dial a number equal to `ForwardedFrom`, `CalledVia`, `From`, or inbound `Called`/`To` (E.164). If every target is filtered out, skip Dial and go straight to Grok.
6. Greeting (no recording disclosure): “Thanks for calling Colorado Hot Tub… What were you calling about today?”
7. Phone confirm: agent speaks US numbers in **3-3-4** groups with a sentence-break pause between groups (not one digit stream).
8. Hangup → Formspree **shop** + Peak. Recording URL in the message body (Formspree cannot attach Twilio MP3s).

## Mount (Peak Replit api-server — do not replace Peak /api/voice)
```ts
import { chtVoiceRouter, attachChtVoiceStream } from "./cht/cht-voice";
// routes:
app.use("/api/cht-voice", chtVoiceRouter);
// after expressWs(app):
attachChtVoiceStream(app);
```
Copy `cht-voice.ts` + `cht-phone.ts` + `cht-call-store.ts` + `cht-prompt.md` into `artifacts/api-server/src/cht/` (or `src/voice/cht/`) and copy the prompt into dist beside the bundle.

Peak `+19706605088` / `/api/voice` untouched.

## Env (Replit Autoscale secrets)

| Var | Role |
|---|---|
| `XAI_API_KEY` | Required. Existing Peak key. |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Start Twilio Call Recording + attach URL. |
| `HOSTNAME` | Public host for Stream / Dial action URLs (default `peak-signal.replit.app`). |
| `CHT_RING_SHOP` | `1`/`true`/`yes`/`on` = ring `CHT_RING_NUMBERS` only. `0`/`false`/`no`/`off` = never ring. **Unset = off** (previously unset rang whenever `CHT_RING_NUMBERS` was non-empty). |
| `CHT_SHOP_NUMBER` | Spoken fallback number only. Default `+19705312897`. **Not dialed.** |
| `CHT_RING_NUMBERS` | Optional owner cells, comma-separated E.164. Empty = no Dial targets (the shop line is not filled in). Never put `+19705312897` here. |
| `CHT_FORMSPREE` | Shop Formspree. Default `https://formspree.io/f/xgogybaj`. **Intended inbox: info@coloradohottubllc.com** — confirm that destination in the Formspree form settings. This repo does not change Formspree routing. |
| `PEAK_FORMSPREE` | Peak copy. Default `https://formspree.io/f/mgobgrlr`. |
| `CHT_CALLS_PATH` | JSON call log (default `<cwd>/data/cht-calls.json`). |

### Replit env (calls reach Grok, not shop voicemail)
```
CHT_RING_SHOP=0
```
Delete `CHT_RING_NUMBERS` if it lists `+19705312897`. `CHT_SHOP_NUMBER=+19705312897` may stay; it is not dialed. Then **Publish** Autoscale. Twilio Voice URL on `+17207800753` stays `POST https://getpeaksignal.com/api/cht-voice`.

Optional later, owner cells only (press 1 or the leg is dropped):
```
CHT_RING_SHOP=1
CHT_RING_NUMBERS=+1xxxxxxxxxx,+1yyyyyyyyyy
```
Do not include `+19705312897`.

## Recording
On agent stream start, starts a Twilio Call Recording (needs `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN`).
Callback: `POST /api/cht-voice/recording` → stores `RecordingUrl` (+ `.mp3`) into the hangup email.
Hangup email is a **short summary** + recording URL (full transcript not emailed). Formspree gets the URL in `message` — it cannot attach the MP3 binary.

## Formspree path
`emailShop()` POSTs the same summary to:
1. Shop form `CHT_FORMSPREE` (default `xgogybaj`) — shop inbox, intended **info@coloradohottubllc.com**.
2. Peak form `PEAK_FORMSPREE` (default `mgobgrlr`) — Peak copy, `_cc` Brian.

If shop mail is not landing on info@, fix the Formspree form’s email destination (Brian / Formspree account). Do not invent SMTP.

## Owner dashboard store
cht-voice also upserts each real Twilio call (`CA…` CallSid only) to:

`process.env.CHT_CALLS_PATH` or `<cwd>/data/cht-calls.json`

Fields: caller name, phone, need, summary, recordingUrl, timestamp, turns.
Ops reads the same file at `GET /ops/api/clients/colorado-hot-tub-llc/calls`.
Do not invent rows. Health-check `CallSid=T` is ignored.
Autoscale disk is instance-local — a republish may wipe the JSON. Do not republish between Heather’s confirm call and viewing the dashboard.

## Helpers
`cht-phone.ts` owns spoken NANP grouping and ring-target resolution (loop guard). From `voice/cht/`:

```
npm install
npm test
npm run build
```
