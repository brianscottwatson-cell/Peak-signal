# Replit Agent — mount CHT Grok Voice (Peak-Signal Autoscale only)

Do NOT change Peak `/api/voice` or Peak number 970-660-5088.
Do NOT touch CHT/MMDT marketing sites.

## Files from GitHub Peak-signal
Copy into `artifacts/api-server/src/cht/`:
- `voice/cht/cht-voice.ts` → `src/cht/cht-voice.ts`
- `voice/cht/cht-prompt.md` → `src/cht/cht-prompt.md`

Fetch with:
```
mkdir -p artifacts/api-server/src/cht
curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github.raw" \
  -o artifacts/api-server/src/cht/cht-voice.ts \
  https://api.github.com/repos/brianscottwatson-cell/Peak-signal/contents/voice/cht/cht-voice.ts
curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github.raw" \
  -o artifacts/api-server/src/cht/cht-prompt.md \
  https://api.github.com/repos/brianscottwatson-cell/Peak-signal/contents/voice/cht/cht-prompt.md
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
Then set Twilio Voice URL on `+17207800753` to:
`POST https://getpeaksignal.com/api/cht-voice`

## Verify
```
curl -sS -X POST https://getpeaksignal.com/api/cht-voice -d 'CallSid=T&From=%2B1555&To=%2B17207800753'
```
Expect TwiML `<Dial timeout="10">` to `+19705312897` with action `/api/cht-voice/agent`.

## Shop ring (default OFF)
720 is **test only**. Do **not** dial the shop number unless Brian sets Autoscale secret `CHT_RING_SHOP=1`.
Default `POST /api/cht-voice` goes straight to Grok Voice Stream.
