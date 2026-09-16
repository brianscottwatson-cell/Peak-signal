# CHT Grok Voice — ring website shop ~10s, then agent

**Spec:** brain `clients/colorado-hot-tub-llc/19-voice-grok-after-ring-2026-09-08.md`  
Brian Watson 2026-09-16: inbound stays on 720; Dial the public website shop `+19705312897` (coloradohottubllc.com), **not** Heather/Justin personal cells; loop-safe ring-first.

## Twilio
- **Inbound (stays here):** `+17207800753`
- **Dial target (website shop):** `+19705312897` (`CHT_SHOP_NUMBER`, coloradohottubllc.com)
- Voice URL on the inbound 720 DID: `POST https://getpeaksignal.com/api/cht-voice` (or peak-signal.replit.app)
- Status callback (optional): `POST .../api/cht-voice/status`
- Recording callback: `POST .../api/cht-voice/recording`

**Go-live:** keep Twilio Voice URL on `+17207800753`. With ring-shop on, inbound 720 Dials the website shop for ~10s, then the agent. Do **not** Dial inbound `Called` when it equals the shop DID.

## Flow
1. **Ring-first (go-live):** inbound stays on `+17207800753`. With `CHT_RING_SHOP=1` and `CHT_SHOP_NUMBER=+19705312897` (`CHT_RING_NUMBERS` empty), Dial the public website shop for `timeout="10"` (~3–4 rings). Action → `/api/cht-voice/agent` → Grok if no answer.
2. **Loop guard:** never Dial the inbound `Called`/`To` number, and never Dial the caller. If inbound Called **equals** the shop DID (`+19705312897`), shop Dial is skipped (self-dial would loop) and the call goes straight to the agent.
3. **720 test, ring off:** leave `CHT_RING_SHOP` unset and `CHT_RING_NUMBERS` empty → straight to Grok.
4. Greeting (no recording disclosure): “Thanks for calling Colorado Hot Tub… What were you calling about today?”
5. Phone confirm: agent speaks US numbers in **3-3-4** groups with a sentence-break pause between groups (not one digit stream).
6. Hangup → Formspree **shop** + Peak. Recording URL in the message body (Formspree cannot attach Twilio MP3s).

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
| `CHT_RING_SHOP` | `1` = ring first (Dial website shop). `0` = never ring. Unset = ring only when `CHT_RING_NUMBERS` is non-empty. |
| `CHT_SHOP_NUMBER` | **Go-live Dial target.** Default `+19705312897` (coloradohottubllc.com). Used when `CHT_RING_NUMBERS` is empty and inbound Called ≠ this number. |
| `CHT_RING_NUMBERS` | Optional extra lines later only. Comma-separated E.164. Not the primary go-live path. If set, those numbers are Dialed instead of the shop DID. |
| `CHT_FORMSPREE` | Shop Formspree. Default `https://formspree.io/f/xgogybaj`. **Intended inbox: info@coloradohottubllc.com** — confirm that destination in the Formspree form settings. This repo does not change Formspree routing. |
| `PEAK_FORMSPREE` | Peak copy. Default `https://formspree.io/f/mgobgrlr`. |
| `CHT_CALLS_PATH` | JSON call log (default `<cwd>/data/cht-calls.json`). |

### Go-live Replit env (inbound 720 → Dial website shop)
```
CHT_RING_SHOP=1
CHT_SHOP_NUMBER=+19705312897
```
Inbound stays on `+17207800753`. Do **not** put personal cells in `CHT_RING_NUMBERS` for go-live. Leave it empty so 720 Dials the website shop. Optional later: extra ring lines in `CHT_RING_NUMBERS` only if Brian adds them.

If inbound Called equals `+19705312897`, the loop guard skips Dial and the agent answers immediately.

### 720 test (no shop ring)
Leave `CHT_RING_SHOP` unset and `CHT_RING_NUMBERS` empty. Twilio Voice URL on `+17207800753` stays `POST https://getpeaksignal.com/api/cht-voice`.

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
`cht-phone.ts` owns spoken NANP grouping and ring-target resolution (loop guard). Check:

```
node --experimental-strip-types voice/cht/cht-phone.test.ts
```
