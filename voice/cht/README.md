# CHT Grok Voice after 10s shop ring

**Spec:** brain `clients/colorado-hot-tub-llc/19-voice-grok-after-ring-2026-09-08.md`

## Twilio
- Number: `+17207800753`
- Voice URL: `POST https://getpeaksignal.com/api/cht-voice` (or peak-signal.replit.app)
- Status callback (optional): `POST .../api/cht-voice/status`

## Flow
1. Dial shop `+19705312897` timeout 10s
2. If no answer → Grok Voice stream, greet “Thanks for calling Colorado Hot Tub.”
3. Hangup → Formspree draft to shop Formspree + CC Brian (name, phone, need + transcript)

## Mount (Peak Replit api-server — do not replace Peak /api/voice)
```ts
import { chtVoiceRouter, attachChtVoiceStream } from "./cht/cht-voice";
// routes:
app.use("/api/cht-voice", chtVoiceRouter);
// after expressWs(app):
attachChtVoiceStream(app);
```
Copy `cht-voice.ts` + `cht-prompt.md` into `artifacts/api-server/src/cht/` (or `src/voice/cht/`) and copy prompt into dist beside the bundle.

Env: `XAI_API_KEY` (existing). Optional: `CHT_SHOP_NUMBER`, `CHT_FORMSPREE`.

Peak `+19706605088` / `/api/voice` untouched.
