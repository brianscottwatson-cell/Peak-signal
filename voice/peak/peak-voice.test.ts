/**
 * PEAK_VOICE_MODE behavior.
 * legacy: today's assessment greeting and Stream TwiML.
 * agent: Peak persona stream.
 * forward_then_agent: Dial, press-1 whisper, then the Peak stream.
 *
 * Run from the repo root:
 *   node --experimental-strip-types voice/peak/peak-voice.test.ts
 *
 * HOSTNAME is read when voice-ara loads. PEAK_VOICE_MODE is read per call.
 * The dial target in this file is a reserved test number, not a real cell.
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
delete process.env.PEAK_VOICE_MODE;
delete process.env.PEAK_VOICE;
delete process.env.PEAK_FORWARD_TO;

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const EXISTING_GREETING =
  "This call may be recorded. Hey, this is your business assessment for Peak Signal. I've got five short questions so we can map where the leverage is. Ready? First — what's your name and your business?";

const CALLER = "+15551234567";
const FORWARD_TO = "+15555550100";
const PEAK_NUMBER = "+19706605088";

await register(new URL("../cht/esm-resolve-ts.mjs", import.meta.url));
const { default: express } = await import("express");
const { voiceAraRouter, inboundVoice, recordCallerUtterance } = await import("../voice-ara.ts");
const { PEAK_GREETING, PEAK_INSTRUCTIONS } = await import("./peak-prompt.ts");

const araPrompt = readFileSync(join(here, "../ara-prompt.md"), "utf8");

const realFetch = globalThis.fetch;
const emails: { message: string }[] = [];
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.includes("formspree.io")) {
    const payload = JSON.parse(String(init?.body || "{}")) as { message?: string };
    emails.push({ message: String(payload.message || "") });
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  }
  return realFetch(input, init);
};

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use("/api/voice", voiceAraRouter);

const server = await new Promise<import("node:http").Server>((resolve) => {
  const s = app.listen(0, "127.0.0.1", () => resolve(s));
});
const addr = server.address();
const port = typeof addr === "object" && addr ? addr.port : 0;

async function post(path: string, params: Record<string, string>): Promise<string> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const text = await res.text();
  assert(res.status === 200, `${path} status ${res.status} ${text}`);
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

function inbound(sid: string, extra: Record<string, string> = {}): Record<string, string> {
  return { CallSid: sid, From: CALLER, To: PEAK_NUMBER, Called: PEAK_NUMBER, ...extra };
}

delete process.env.PEAK_VOICE_MODE;
const off = inboundVoice();
assert(off.greeting === EXISTING_GREETING, off.greeting);
assert(off.instructions === araPrompt, "legacy instructions are not ara-prompt.md");
assert(off.voice === "ara", off.voice);
assert(off.peak === false, "legacy should not be the peak persona");

const legacyXml = await post("/api/voice", inbound("CAlegacy"));
assert(legacyXml === streamTwiml("CAlegacy"), legacyXml);

process.env.PEAK_VOICE_MODE = "nope";
assert(inboundVoice().greeting === EXISTING_GREETING, "invalid mode stays legacy");
const invalidXml = await post("/api/voice", inbound("CAinvalid"));
assert(invalidXml === streamTwiml("CAinvalid"), invalidXml);

process.env.PEAK_VOICE_MODE = "agent";
delete process.env.PEAK_VOICE;
const on = inboundVoice();
assert(on.greeting === PEAK_GREETING, on.greeting);
assert(on.instructions === PEAK_INSTRUCTIONS, "agent instructions are not peak-prompt");
assert(on.voice === "ara", on.voice);
assert(on.peak === true, "agent should be the peak persona");
const spoken = `${on.greeting}\n${on.instructions}`;
for (const banned of ["Colorado Hot Tub", "AI receptionist", "$", "Watson"]) {
  assert(!spoken.includes(banned), `peak persona contains ${banned}`);
}
assert(spoken.includes("Brian at Peak Signal"), "missing Brian at Peak Signal");
assert(spoken.includes("https://getpeaksignal.com"), "missing site");
assert(spoken.includes("https://calendly.com/hello-peaksignal/30min"), "missing calendly");

const agentXml = await post("/api/voice", inbound("CAagent"));
assert(agentXml === streamTwiml("CAagent"), agentXml);
assert(!agentXml.includes("<Dial"), agentXml);

process.env.PEAK_VOICE_MODE = "forward_then_agent";
delete process.env.PEAK_FORWARD_TO;
const unsetXml = await post("/api/voice", inbound("CAunset"));
assert(unsetXml === streamTwiml("CAunset"), unsetXml);

process.env.PEAK_FORWARD_TO = "555-0100";
const garbageXml = await post("/api/voice", inbound("CAgarbage"));
assert(garbageXml === streamTwiml("CAgarbage"), garbageXml);
assert(!garbageXml.includes("<Dial"), garbageXml);

process.env.PEAK_FORWARD_TO = PEAK_NUMBER;
const loopXml = await post("/api/voice", inbound("CAloop"));
assert(loopXml === streamTwiml("CAloop"), loopXml);

process.env.PEAK_FORWARD_TO = FORWARD_TO;
const dialXml = await post("/api/voice", inbound("CAdial"));
assert(dialXml.includes('timeout="20"'), dialXml);
assert(dialXml.includes(`callerId="${PEAK_NUMBER}"`), dialXml);
assert(dialXml.includes('action="https://voice-test.example/api/voice/after-dial"'), dialXml);
assert(dialXml.includes(`>${FORWARD_TO}</Number>`), dialXml);
assert(dialXml.includes("answerOnBridge=\"true\""), dialXml);
assert(dialXml.includes("/api/voice/screen?"), dialXml);
assert(dialXml.includes("parent=CAdial"), dialXml);
assert(!dialXml.includes("<Stream"), dialXml);

const screenXml = await post(
  `/api/voice/screen?parent=CAdial&from=${encodeURIComponent(CALLER)}`,
  {},
);
assert(screenXml.includes("<Gather"), screenXml);
assert(screenXml.includes('numDigits="1"'), screenXml);
assert(screenXml.includes('timeout="6"'), screenXml);
assert(screenXml.includes("1 5 5 5 1 2 3 4 5 6 7"), screenXml);
assert(screenXml.includes("Press 1 to take it."), screenXml);
assert(!screenXml.includes(FORWARD_TO), screenXml);
assert(screenXml.includes("<Hangup/>"), screenXml);

const privateXml = await post("/api/voice/screen?parent=CAprivate&from=anonymous", {});
assert(privateXml.includes("a private number"), privateXml);
assert(privateXml.includes("<Gather"), privateXml);
assert(!privateXml.includes("1 5 5 5"), privateXml);

const bridgeXml = await post("/api/voice/screen?parent=CAdial&gather=1", { Digits: "1" });
assert(!bridgeXml.includes("<Hangup"), bridgeXml);
assert(!bridgeXml.includes("<Gather"), bridgeXml);

const wrongXml = await post("/api/voice/screen?parent=CAwrong&gather=1", { Digits: "9" });
assert(wrongXml.includes("<Hangup/>"), wrongXml);
const emptyDigitXml = await post("/api/voice/screen?parent=CAempty&gather=1", { Digits: "" });
assert(emptyDigitXml.includes("<Hangup/>"), emptyDigitXml);

// answered by Brian: press 1, then completed. One email. Status does not send another.
emails.length = 0;
await post("/api/voice/screen?parent=CAanswered&gather=1", { Digits: "1" });
const answeredXml = await post("/api/voice/after-dial", {
  CallSid: "CAanswered",
  From: CALLER,
  DialCallStatus: "completed",
});
assert(answeredXml.includes("<Hangup/>"), answeredXml);
assert(!answeredXml.includes("<Stream"), answeredXml);
assert(emails.length === 1, `answered emails ${emails.length}`);
assert(emails[0].message.includes(CALLER), emails[0].message);
assert(emails[0].message.includes("answered by Brian"), emails[0].message);
assert(emails[0].message.includes("MT"), emails[0].message);
await post("/api/voice/status", { CallSid: "CAanswered", From: CALLER, CallStatus: "completed" });
assert(emails.length === 1, `answered double-sent ${emails.length}`);

async function fallThrough(sid: string, dialStatus: string, needle: string, withCallerLine = false) {
  const before = emails.length;
  const xml = await post("/api/voice/after-dial", {
    CallSid: sid,
    From: CALLER,
    DialCallStatus: dialStatus,
  });
  assert(xml === streamTwiml(sid), xml);
  if (withCallerLine) {
    assert(emails.length === before, `${dialStatus} emailed before the agent summary`);
    recordCallerUtterance(sid, "We need a site for the shop.");
    await post("/api/voice/status", { CallSid: sid, From: CALLER, CallStatus: "completed" });
  } else {
    await post("/api/voice/status", { CallSid: sid, From: CALLER, CallStatus: "completed" });
  }
  assert(emails.length === before + 1, `${dialStatus} email count ${emails.length - before}`);
  const message = emails[emails.length - 1].message;
  assert(message.includes(CALLER), message);
  assert(message.includes(needle), message);
  assert(message.includes("MT"), message);
  await post("/api/voice/status", { CallSid: sid, From: CALLER, CallStatus: "completed" });
  assert(emails.length === before + 1, `${dialStatus} double-sent`);
}

await fallThrough("CAnoanswer", "no-answer", "sent to agent (no-answer)");
await fallThrough("CAbusy", "busy", "sent to agent (busy)");
await fallThrough("CAfailed", "failed", "sent to agent (failed)");
await fallThrough("CAdeclined", "completed", "sent to agent (declined)", true);

emails.length = 0;
const cancelXml = await post("/api/voice/after-dial", {
  CallSid: "CAcancel",
  From: CALLER,
  DialCallStatus: "canceled",
});
assert(cancelXml === streamTwiml("CAcancel"), cancelXml);
assert(emails.length === 1, `canceled emails ${emails.length}`);
assert(emails[0].message.includes("caller hung up"), emails[0].message);
assert(emails[0].message.includes(CALLER), emails[0].message);
await post("/api/voice/status", { CallSid: "CAcancel", From: CALLER, CallStatus: "completed" });
assert(emails.length === 1, "canceled double-sent");

emails.length = 0;
await post("/api/voice/status", { CallSid: "CAearly", From: CALLER, CallStatus: "completed" });
assert(emails.length === 1, `early hangup emails ${emails.length}`);
assert(emails[0].message.includes("caller hung up"), emails[0].message);

server.close();
console.log("peak-voice.test.ts ok");
