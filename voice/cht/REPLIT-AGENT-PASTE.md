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
Then set Twilio Voice URL on inbound `+17207800753`:
`POST https://getpeaksignal.com/api/cht-voice`

Ring-first Dials the website shop number on coloradohottubllc.com (`+19705312897`). Do **not** also point that shop DID at this webhook (self-dial loop). Do **not** put Heather/Justin personal cells in go-live env.

## Env flips (Autoscale secrets) — Brian go-live

Inbound on `+17207800753` → Dial website shop `+19705312897` ~10s / 3–4 rings → agent if no answer:
```
CHT_RING_SHOP=1
CHT_SHOP_NUMBER=+19705312897
CHT_FORMSPREE=https://formspree.io/f/xgogybaj
```
Leave `CHT_RING_NUMBERS` unset. It is optional later if extra lines are needed — not personal cells, not the go-live path.

`CHT_FORMSPREE` default `xgogybaj` is the **shop** form — intended destination **info@coloradohottubllc.com**. Confirm that in Formspree settings; this paste does not change the Formspree account. Hangup email includes a **recording URL** in the body (Formspree cannot attach Twilio MP3s). Peak form still gets a copy.

`CHT_RING_SHOP=0` (or unset) = 720 straight to Grok, no shop ring.

Loop rule (already in code): never Dial inbound `Called`/`To` when it equals the shop DID. If `+19705312897` were the Called number, skip Dial and connect the agent.

## Verify
```
# Go-live: 720 inbound + CHT_RING_SHOP=1 → Dial website shop
curl -sS -X POST https://getpeaksignal.com/api/cht-voice \
  -d 'CallSid=T&From=%2B15551234567&To=%2B17207800753&Called=%2B17207800753'
# Expect: <Dial timeout="10"> … <Number>+19705312897</Number> … action /api/cht-voice/agent

# Loop guard: shop DID inbound → Stream (do not Dial +19705312897)
curl -sS -X POST https://getpeaksignal.com/api/cht-voice \
  -d 'CallSid=T&From=%2B15551234567&To=%2B19705312897&Called=%2B19705312897'
# Expect: <Connect><Stream … /api/cht-voice/stream/ …>
```

720 with ring **off** (`CHT_RING_SHOP` unset): first curl goes straight to Stream.
