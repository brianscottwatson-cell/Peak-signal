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
Then set Twilio Voice URL:

**Test DID** `+17207800753` **and/or shop public** `+19705312897`:
`POST https://getpeaksignal.com/api/cht-voice`

If the shop public number is the one customers dial, point **that** number here. Do not also Dial that same number (loop).

## Env flips (Autoscale secrets) — Brian go-live

Production shop phone (ring Heather/Justin ~10s / 3–4 rings, then agent):
```
CHT_RING_SHOP=1
CHT_RING_NUMBERS=+1XXXXXXXXXX,+1YYYYYYYYYY
CHT_SHOP_NUMBER=+19705312897
CHT_FORMSPREE=https://formspree.io/f/xgogybaj
```
Put Heather’s and Justin’s cells in `CHT_RING_NUMBERS` (comma-separated E.164).  
`CHT_FORMSPREE` default `xgogybaj` is the **shop** form — intended destination **info@coloradohottubllc.com**. Confirm that in Formspree settings; this paste does not change the Formspree account. Hangup email includes a **recording URL** in the body (Formspree cannot attach Twilio MP3s). Peak form still gets a copy.

`CHT_RING_SHOP=0` forces agent-only (even if ring numbers are set).  
Unset `CHT_RING_SHOP` + empty `CHT_RING_NUMBERS` = 720 test, straight to Grok.

Loop rule (already in code): never Dial inbound `Called`/`To`. If public DID is `+19705312897` and `CHT_RING_NUMBERS` is empty, shop fallback is skipped and the agent answers.

## Verify
```
# 720 test + ring on, no owner cells → Dial shop (Called ≠ shop)
curl -sS -X POST https://getpeaksignal.com/api/cht-voice \
  -d 'CallSid=T&From=%2B15551234567&To=%2B17207800753&Called=%2B17207800753'
# Expect: <Dial timeout="10"> … <Number>+19705312897</Number> … action /api/cht-voice/agent

# Shop public DID + no owner cells → skip Dial (loop guard) → Stream
curl -sS -X POST https://getpeaksignal.com/api/cht-voice \
  -d 'CallSid=T&From=%2B15551234567&To=%2B19705312897&Called=%2B19705312897'
# Expect: <Connect><Stream … /api/cht-voice/stream/ …>  (not a Dial to +19705312897)
```

720 with ring **off** (secrets unset): same first curl goes straight to Stream.
