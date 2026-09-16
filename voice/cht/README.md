# CHT Grok Voice — ring website shop ~10s, then agent

**Spec:** brain `clients/colorado-hot-tub-llc/19-voice-grok-after-ring-2026-09-08.md`  
Brian Watson feedback 2026-09-16: paused phone readback + ring-first on the **website shop number** (not personal cells).

## Twilio
- Inbound DID: `+17207800753` → `POST https://getpeaksignal.com/api/cht-voice`
- Website shop number (coloradohottubllc.com): `+19705312897` (`CHT_SHOP_NUMBER`) — this is what ring-first Dials
- Status callback (optional): `POST .../api/cht-voice/status`
- Recording callback: `POST .../api/cht-voice/recording`

**Go-live:** keep Twilio Voice URL on `+17207800753`. Set `CHT_RING_SHOP=1` so inbound Dials `+19705312897` for ~10s, then the agent. Do **not** point `+19705312897` at this webhook and also Dial it (loop). Do **not** put Heather/Justin personal cells in go-live env.

## Flow
1. **Ring-first (production):** `CHT_RING_SHOP=1` → Dial `CHT_SHOP_NUMBER` (`+19705312897`) for `timeout="10"` (~3–4 rings). Action → `/api/cht-voice/agent` → Grok if no answer.
2. **Loop guard:** never Dial the inbound `Called`/`To` number, and never Dial the caller. If someone later pointed the shop DID at this webhook, shop fallback is skipped (self-dial would loop) and the call goes straight to the agent.
3. **`CHT_RING_NUMBERS`:** optional secondary only — extra E.164 lines if needed later. Not the go-live path. Leave unset.
4. **720 with ring off:** leave `CHT_RING_SHOP` unset → straight to Grok.
5. Greeting (no recording disclosure): “Thanks for calling Colorado Hot Tub… What were you calling about today?”
6. Phone confirm: agent speaks US numbers in **3-3-4** groups with a sentence-break pause between groups (not one digit stream).
7. Hangup → Formspree **shop** + Peak. Recording URL in the message body (Formspree cannot attach Twilio MP3s).

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
| `CHT_RING_SHOP` | **Go-live `1`.** Ring `CHT_SHOP_NUMBER` first. `0` = never ring. Unset = ring only if `CHT_RING_NUMBERS` is set (not the usual path). |
| `CHT_SHOP_NUMBER` | Website shop number. Default `+19705312897`. Dial target when inbound Called ≠ this number. |
| `CHT_RING_NUMBERS` | Optional extra E.164 lines later. **Not** Heather/Justin cells for go-live. Leave unset. |
| `CHT_FORMSPREE` | Shop Formspree. Default `https://formspree.io/f/xgogybaj`. **Intended inbox: info@coloradohottubllc.com** — confirm that destination in the Formspree form settings. This repo does not change Formspree routing. |
| `PEAK_FORMSPREE` | Peak copy. Default `https://formspree.io/f/mgobgrlr`. |
| `CHT_CALLS_PATH` | JSON call log (default `<cwd>/data/cht-calls.json`). |

### Go-live Replit env (720 inbound → Dial website shop, then agent)
```
CHT_RING_SHOP=1
CHT_SHOP_NUMBER=+19705312897
CHT_FORMSPREE=https://formspree.io/f/xgogybaj
```
Do not set `CHT_RING_NUMBERS` unless extra lines are needed later. Twilio Voice URL stays on `+17207800753` → `POST https://getpeaksignal.com/api/cht-voice`.

### 720 test (no shop ring)
Leave `CHT_RING_SHOP` unset. Same Twilio Voice URL.

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
