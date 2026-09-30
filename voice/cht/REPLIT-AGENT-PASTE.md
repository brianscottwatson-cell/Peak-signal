# Replit Agent — mount CHT Grok Voice (Peak-Signal Autoscale only)

Do NOT change Peak `/api/voice` or Peak number 970-660-5088.
Do NOT touch CHT/MMDT marketing sites.

## Files from GitHub Peak-signal
Copy into `artifacts/api-server/src/cht/`:
- `voice/cht/cht-voice.ts` → `src/cht/cht-voice.ts`
- `voice/cht/cht-phone.ts` → `src/cht/cht-phone.ts`
- `voice/cht/cht-call-store.ts` → `src/cht/cht-call-store.ts`
- `voice/cht/cht-prompt.md` → `src/cht/cht-prompt.md`

Fetch with:
```
mkdir -p artifacts/api-server/src/cht
for f in cht-voice.ts cht-phone.ts cht-prompt.md cht-call-store.ts; do
  curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github.raw" \
    -o "artifacts/api-server/src/cht/$f" \
    "https://api.github.com/repos/brianscottwatson-cell/Peak-signal/contents/voice/cht/$f"
done
```

## Wire
In api-server entry (same place `attachVoiceStream` / voice-ara mounts):
```ts
import { chtVoiceRouter, attachChtVoiceStream } from "./cht/cht-voice";
app.use("/api/cht-voice", chtVoiceRouter);
attachChtVoiceStream(app); // after expressWs(app)
```
Ensure build copies `cht-prompt.md` next to compiled output (same pattern as ara-prompt.md).

## Publish Autoscale
Then set Twilio Voice URL on the **inbound** DID (stays `+17207800753`):
`POST https://getpeaksignal.com/api/cht-voice`

Do **not** Dial the shop DID `+19705312897`. It is not a ring target. A call forwarded from that line must go to Grok, not back to Verizon voicemail.

## Env flips (Autoscale secrets)

Calls should reach Grok. The shop line must not be rung.
```
CHT_RING_SHOP=0
```
Delete `CHT_RING_NUMBERS` if it contains `+19705312897` (or leave the secret unset). `CHT_SHOP_NUMBER` may stay `+19705312897` — spoken number only, not dialed. **Publish** after saving secrets. Do not change the Twilio Voice URL.

`CHT_RING_SHOP` unset is off. `CHT_RING_SHOP=0` is off even if `CHT_RING_NUMBERS` is set. `CHT_RING_SHOP=1` dials `CHT_RING_NUMBERS` only (owner cells), each with press-1 screening. Never put `+19705312897` in `CHT_RING_NUMBERS`.

`CHT_FORMSPREE` default `xgogybaj` is the **shop** form — intended destination **info@coloradohottubllc.com**. Confirm that in Formspree settings; this paste does not change the Formspree account. Hangup email includes a **recording URL** in the body (Formspree cannot attach Twilio MP3s). Peak form still gets a copy.

## Verify
```
# Default / ring off: straight to Grok. No Dial, no +19705312897.
curl -sS -X POST https://getpeaksignal.com/api/cht-voice \
  -d 'CallSid=T&From=%2B15551234567&To=%2B17207800753&Called=%2B17207800753'
# Expect: <Connect><Stream … /api/cht-voice/stream/ …>

# Forwarded from the shop line: still Stream, never a Dial to +19705312897.
curl -sS -X POST https://getpeaksignal.com/api/cht-voice \
  -d 'CallSid=T&From=%2B15551234567&To=%2B17207800753&Called=%2B17207800753&ForwardedFrom=%2B19705312897'
# Expect: <Connect><Stream …>  (not <Number>+19705312897</Number>)
```
