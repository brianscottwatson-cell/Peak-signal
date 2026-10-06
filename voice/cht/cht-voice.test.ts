/**
 * Webhook behavior: POST form params the way Twilio does, assert literal TwiML.
 * Run from voice/cht: npm test
 * or: node --experimental-strip-types cht-voice.test.ts
 *
 * HOSTNAME is read when cht-voice loads, so that module is imported after env is set.
 */
process.env.HOSTNAME = "voice-test.example";
process.env.XAI_API_KEY = "test-not-a-real-key";
delete process.env.CHT_RING_SHOP;
delete process.env.CHT_RING_NUMBERS;

import { register } from "node:module";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

await register(new URL("./esm-resolve-ts.mjs", import.meta.url));
const { default: express } = await import("express");
const { chtVoiceRouter } = await import("./cht-voice.ts");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use("/api/cht-voice", chtVoiceRouter);

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

function inbound(extra: Record<string, string> = {}): Record<string, string> {
  return {
    CallSid: extra.CallSid || "CAinbound",
    From: "+15551234567",
    To: "+17207800753",
    Called: "+17207800753",
    ...extra,
  };
}

// default env: no 970 in the Dial — straight to the Grok stream
delete process.env.CHT_RING_SHOP;
delete process.env.CHT_RING_NUMBERS;
const defaultXml = await post("/api/cht-voice", inbound({ CallSid: "CAdefault" }));
assert(!defaultXml.includes("<Dial"), defaultXml);
assert(!defaultXml.includes("+19705312897"), defaultXml);
assert(!defaultXml.includes("<Number"), defaultXml);
assert(defaultXml.includes("<Stream"), defaultXml);
assert(defaultXml.includes('url="wss://voice-test.example/api/cht-voice/stream/CAdefault"'), defaultXml);

// unset flag stays off even if the shop line is listed
process.env.CHT_RING_NUMBERS = "+19705312897";
const unsetXml = await post("/api/cht-voice", inbound({ CallSid: "CAunset" }));
assert(!unsetXml.includes("<Dial"), unsetXml);
assert(!unsetXml.includes("+19705312897"), unsetXml);
assert(unsetXml.includes("<Stream"), unsetXml);
delete process.env.CHT_RING_NUMBERS;

// explicit ring with no numbers: shop is not the fallback
process.env.CHT_RING_SHOP = "1";
process.env.CHT_RING_NUMBERS = "";
const noFallback = await post("/api/cht-voice", inbound({ CallSid: "CAnofallback" }));
assert(!noFallback.includes("<Dial"), noFallback);
assert(!noFallback.includes("+19705312897"), noFallback);
assert(noFallback.includes("<Stream"), noFallback);

// ForwardedFrom=+19705312897: do not Dial it; go to Grok
process.env.CHT_RING_SHOP = "1";
process.env.CHT_RING_NUMBERS = "+19705312897";
const fwdXml = await post(
  "/api/cht-voice",
  inbound({ CallSid: "CAfwd", ForwardedFrom: "+19705312897" }),
);
assert(!fwdXml.includes("<Dial"), fwdXml);
assert(!fwdXml.includes("+19705312897"), fwdXml);
assert(!fwdXml.includes("<Number"), fwdXml);
assert(fwdXml.includes("<Stream"), fwdXml);
assert(fwdXml.includes("/api/cht-voice/stream/CAfwd"), fwdXml);

// CalledVia is the same guard
const viaXml = await post(
  "/api/cht-voice",
  inbound({ CallSid: "CAvia", CalledVia: "+1 970-531-2897" }),
);
assert(!viaXml.includes("<Dial"), viaXml);
assert(!viaXml.includes("+19705312897"), viaXml);
assert(viaXml.includes("<Stream"), viaXml);

// other owner legs still ring, without the forwarded shop line
process.env.CHT_RING_NUMBERS = "+19705312897,+15555550111";
const mixedXml = await post(
  "/api/cht-voice",
  inbound({ CallSid: "CAmixed", ForwardedFrom: "+19705312897" }),
);
assert(mixedXml.includes("<Dial"), mixedXml);
assert(mixedXml.includes("+15555550111</Number>"), mixedXml);
assert(!mixedXml.includes("+19705312897"), mixedXml);
assert(!mixedXml.includes("<Stream"), mixedXml);

// screening url present on each Number
process.env.CHT_RING_SHOP = "1";
process.env.CHT_RING_NUMBERS = "+15555550101,+15555550102";
const screenXml = await post("/api/cht-voice", inbound({ CallSid: "CAscreen" }));
const numbers = screenXml.match(/<Number\b[\s\S]*?<\/Number>/g) || [];
assert(numbers.length === 2, screenXml);
for (const n of numbers) {
  assert(n.includes('url="https://voice-test.example/api/cht-voice/screen?parent=CAscreen"'), n);
  assert(n.includes('method="POST"'), n);
  assert(n.includes('machineDetection="Enable"'), n);
  assert(n.includes('machineDetectionTimeout="5"'), n);
}
assert(screenXml.includes('answerOnBridge="true"'), screenXml);
assert(screenXml.includes('action="https://voice-test.example/api/cht-voice/agent"'), screenXml);
assert(screenXml.includes("+15555550101</Number>"), screenXml);
assert(screenXml.includes("+15555550102</Number>"), screenXml);
assert(!screenXml.includes("+19705312897"), screenXml);

// whisper: prompt, digit 1 bridges, no digit or wrong digit hangs up
const promptXml = await post("/api/cht-voice/screen?parent=CAprompt", { AnsweredBy: "human" });
assert(promptXml.includes('numDigits="1"'), promptXml);
assert(promptXml.includes('timeout="5"'), promptXml);
assert(promptXml.includes("Colorado Hot Tub call. Press 1 to take it."), promptXml);
assert(promptXml.includes("gather=1"), promptXml);
assert(promptXml.includes("<Hangup/>"), promptXml);

const bridgeXml = await post("/api/cht-voice/screen?parent=CApress1&gather=1", {
  Digits: "1",
  ParentCallSid: "CApress1",
});
assert(bridgeXml === `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, bridgeXml);
assert(!bridgeXml.includes("<Hangup"), bridgeXml);

const noDigitXml = await post("/api/cht-voice/screen?parent=CAnodigit&gather=1", {});
assert(noDigitXml.includes("<Hangup/>"), noDigitXml);
assert(!noDigitXml.includes("<Gather"), noDigitXml);
assert(!noDigitXml.includes("<Say"), noDigitXml);

const wrongXml = await post("/api/cht-voice/screen?parent=CAwrong&gather=1", { Digits: "9" });
assert(wrongXml.includes("<Hangup/>"), wrongXml);

const machineXml = await post("/api/cht-voice/screen?parent=CAmachine", { AnsweredBy: "machine_start" });
assert(machineXml.includes("<Hangup/>"), machineXml);
assert(!machineXml.includes("<Gather"), machineXml);

// action handler: an unaccepted leg falls through to the Grok stream, even if DialCallStatus is completed
const fallXml = await post("/api/cht-voice/agent", {
  CallSid: "CAunaccepted",
  DialCallStatus: "completed",
  From: "+15551234567",
  To: "+17207800753",
  Called: "+17207800753",
});
assert(fallXml.includes("<Stream"), fallXml);
assert(fallXml.includes('url="wss://voice-test.example/api/cht-voice/stream/CAunaccepted"'), fallXml);
assert(!fallXml.includes("<Hangup"), fallXml);
assert(!fallXml.includes("<Dial"), fallXml);

// digit 1 marks the parent accepted, so the same completed status does not start Grok
const acceptedSid = "CAaccepted";
await post(`/api/cht-voice/screen?parent=${acceptedSid}&gather=1`, { Digits: "1" });
const acceptedXml = await post("/api/cht-voice/agent", {
  CallSid: acceptedSid,
  DialCallStatus: "completed",
  From: "+15551234567",
  To: "+17207800753",
});
assert(acceptedXml === `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, acceptedXml);
assert(!acceptedXml.includes("<Stream"), acceptedXml);

// GET health is read-only JSON. It reports ring-first and does not echo secrets or create a call.
const { existsSync } = await import("node:fs");
const { join } = await import("node:path");
const { tmpdir } = await import("node:os");
const callsPath = join(tmpdir(), `cht-health-${process.pid}.json`);
process.env.CHT_CALLS_PATH = callsPath;
process.env.CHT_FORMSPREE = "https://formspree.io/f/healthleakshop";
process.env.PEAK_FORMSPREE = "https://formspree.io/f/healthleakpeak";
process.env.XAI_API_KEY = "xai-health-leak-key";
process.env.TWILIO_ACCOUNT_SID = "AChealthleak";
process.env.TWILIO_AUTH_TOKEN = "twilio-health-leak-token";
process.env.CHT_SHOP_NUMBER = "+19998887777";
const ringSecret = "+15557654321";
process.env.CHT_RING_NUMBERS = ringSecret;

async function getJson(path: string): Promise<{ status: number; type: string; cache: string; body: any; text: string }> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return {
    status: res.status,
    type: res.headers.get("content-type") || "",
    cache: res.headers.get("cache-control") || "",
    body,
    text,
  };
}

function assertHealth(path: string, body: any, text: string, status: number, type: string, cache: string, ringShop: boolean) {
  assert(status === 200, `${path} status ${status} ${text}`);
  assert(type.includes("application/json"), `${path} type ${type}`);
  assert(cache.includes("no-store"), `${path} cache ${cache}`);
  assert(body && typeof body === "object", text);
  assert(JSON.stringify(Object.keys(body).sort()) === JSON.stringify(["ok", "ringShop", "screenRoute", "service", "version"]), text);
  assert(body.ok === true, text);
  assert(body.service === "cht-voice", text);
  assert(body.ringShop === ringShop, text);
  assert(body.screenRoute === true, text);
  assert(typeof body.version === "string" && body.version.length > 0, text);
  assert(!text.includes("<Response"), text);
  assert(!text.includes(ringSecret), text);
  assert(!text.includes("15557654321"), text);
  assert(!text.includes("xai-health-leak-key"), text);
  assert(!text.includes("test-not-a-real-key"), text);
  assert(!text.includes("twilio-health-leak-token"), text);
  assert(!text.includes("AChealthleak"), text);
  assert(!text.includes("healthleakshop"), text);
  assert(!text.includes("healthleakpeak"), text);
  assert(!text.includes("xgogybaj"), text);
  assert(!text.includes("mgobgrlr"), text);
  assert(!text.includes("formspree"), text);
  assert(!text.includes("+19998887777"), text);
  assert(!text.includes("9705312897"), text);
  assert(!text.includes("voice-test.example"), text);
}

const origFetch = globalThis.fetch;
let outbound = 0;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith(`http://127.0.0.1:${port}`)) return origFetch(input, init);
  outbound += 1;
  throw new Error(`health made an outbound call ${url}`);
}) as typeof fetch;

process.env.CHT_RING_SHOP = "0";
let health: Awaited<ReturnType<typeof getJson>>;
let root: Awaited<ReturnType<typeof getJson>>;
try {
  health = await getJson("/api/cht-voice/health");
  root = await getJson("/api/cht-voice");
  assert(outbound === 0, `outbound calls ${outbound}`);
} finally {
  globalThis.fetch = origFetch;
}
assertHealth("/api/cht-voice/health", health.body, health.text, health.status, health.type, health.cache, false);
assertHealth("/api/cht-voice", root.body, root.text, root.status, root.type, root.cache, false);
assert(JSON.stringify(health.body) === JSON.stringify(root.body), root.text);
assert(!existsSync(callsPath), "GET health wrote a call log");

const offXml = await post("/api/cht-voice", inbound({ CallSid: "CAhealthoff" }));
assert(!offXml.includes("<Dial"), offXml);
assert(!offXml.includes(ringSecret), offXml);
assert(offXml.includes("<Stream"), offXml);
assert(!existsSync(callsPath), "ring-off POST wrote a call log");

process.env.CHT_RING_SHOP = "1";
const onHealth = await getJson("/api/cht-voice/health?ring=%2B15557654321");
assertHealth("/api/cht-voice/health", onHealth.body, onHealth.text, onHealth.status, onHealth.type, onHealth.cache, true);
const onXml = await post("/api/cht-voice", inbound({ CallSid: "CAhealthon" }));
assert(onXml.includes("<Dial"), onXml);
assert(onXml.includes(`${ringSecret}</Number>`), onXml);
assert(!onHealth.text.includes(ringSecret), onHealth.text);

delete process.env.CHT_RING_SHOP;
const unsetHealth = await getJson("/api/cht-voice/health");
assert(unsetHealth.body.ringShop === false, unsetHealth.text);

const screenGet = await fetch(`http://127.0.0.1:${port}/api/cht-voice/screen`);
const agentGet = await fetch(`http://127.0.0.1:${port}/api/cht-voice/agent`);
assert(screenGet.status === 404, `GET /screen ${screenGet.status}`);
assert(agentGet.status === 404, `GET /agent ${agentGet.status}`);
assert(!existsSync(callsPath), "GET health wrote a call log");

await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
console.log("cht-voice.test.ts ok");
