/**
 * PEAK_VOICE_AGENT behavior.
 * Off: existing assessment greeting + ara-prompt, same Stream TwiML.
 * On: Peak persona. No client name, no "AI receptionist", no "$", no "Watson".
 *
 * Run from the repo root:
 *   node --experimental-strip-types voice/peak/peak-voice.test.ts
 *
 * HOSTNAME is read when voice-ara loads. PEAK_VOICE_AGENT is read per call.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { chdir } from "node:process";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
chdir(join(here, "../.."));

process.env.HOSTNAME = "voice-test.example";
process.env.XAI_API_KEY = "test-not-a-real-key";
delete process.env.PEAK_VOICE_AGENT;
delete process.env.PEAK_VOICE;

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const EXISTING_GREETING =
  "This call may be recorded. Hey, this is your business assessment for Peak Signal. I've got five short questions so we can map where the leverage is. Ready? First — what's your name and your business?";

await register(new URL("../cht/esm-resolve-ts.mjs", import.meta.url));
const { default: express } = await import("express");
const { voiceAraRouter, inboundVoice } = await import("../voice-ara.ts");
const { PEAK_GREETING, PEAK_INSTRUCTIONS } = await import("./peak-prompt.ts");

const araPrompt = readFileSync(join(here, "../ara-prompt.md"), "utf8");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use("/api/voice", voiceAraRouter);

const server = await new Promise<import("node:http").Server>((resolve) => {
  const s = app.listen(0, "127.0.0.1", () => resolve(s));
});
const addr = server.address();
const port = typeof addr === "object" && addr ? addr.port : 0;

async function post(params: Record<string, string>): Promise<string> {
  const res = await fetch(`http://127.0.0.1:${port}/api/voice`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const text = await res.text();
  assert(res.status === 200, `status ${res.status} ${text}`);
  assert(res.headers.get("content-type")?.includes("text/xml"), text);
  return text;
}

function streamTwiml(sid: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://voice-test.example/api/voice/stream/${sid}" track="inbound_track" />
  </Connect>
</Response>`;
}

delete process.env.PEAK_VOICE_AGENT;
const off = inboundVoice();
assert(off.greeting === EXISTING_GREETING, off.greeting);
assert(off.instructions === araPrompt, "off instructions are not ara-prompt.md");
assert(off.voice === "ara", off.voice);
assert(off.peak === false, "off should not be the peak persona");

const offXml = await post({ CallSid: "CAoff", From: "+10000000000", To: "+19706605088" });
assert(offXml === streamTwiml("CAoff"), offXml);

process.env.PEAK_VOICE_AGENT = "0";
const zero = inboundVoice();
assert(zero.greeting === EXISTING_GREETING, zero.greeting);
assert(zero.instructions === araPrompt, "0 should keep ara-prompt.md");

process.env.PEAK_VOICE_AGENT = "1";
delete process.env.PEAK_VOICE;
const on = inboundVoice();
assert(on.greeting === PEAK_GREETING, on.greeting);
assert(on.instructions === PEAK_INSTRUCTIONS, "on instructions are not peak-prompt");
assert(on.voice === "ara", on.voice);
assert(on.peak === true, "on should be the peak persona");
assert(on.greeting !== EXISTING_GREETING, "peak greeting matches the assessment greeting");

const spoken = `${on.greeting}\n${on.instructions}`;
for (const banned of ["Colorado Hot Tub", "AI receptionist", "$", "Watson"]) {
  assert(!spoken.includes(banned), `peak persona contains ${banned}`);
}
assert(spoken.includes("Brian at Peak Signal"), "missing Brian at Peak Signal");
assert(spoken.includes("https://getpeaksignal.com"), "missing site");
assert(spoken.includes("https://calendly.com/hello-peaksignal/30min"), "missing calendly");
assert(spoken.includes("hello.peaksignal@gmail.com"), "missing summary inbox");

process.env.PEAK_VOICE = "ara";
assert(inboundVoice().voice === "ara", "PEAK_VOICE=ara");

const onXml = await post({ CallSid: "CAon", From: "+10000000000", To: "+19706605088" });
assert(onXml === streamTwiml("CAon"), onXml);
assert(!onXml.includes("cht-voice"), onXml);
assert(!onXml.includes("<Dial"), onXml);

server.close();
console.log("peak-voice.test.ts ok");
