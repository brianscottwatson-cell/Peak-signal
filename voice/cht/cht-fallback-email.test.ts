/**
 * With no realtime key, the fallback path emails the caller id once.
 * A later status callback does not send a second notice.
 *
 * Run from voice/cht: node --experimental-strip-types cht-fallback-email.test.ts
 */
process.env.HOSTNAME = "voice-test.example";
process.env.CHT_FORMSPREE = "https://formspree.test/f/shop";
process.env.PEAK_FORMSPREE = "https://formspree.test/f/peak";
delete process.env.CHT_RING_SHOP;
delete process.env.CHT_RING_NUMBERS;
delete process.env.XAI_API_KEY;

import { register } from "node:module";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

await register(new URL("./esm-resolve-ts.mjs", import.meta.url));
const { default: express } = await import("express");
const { chtVoiceRouter } = await import("./cht-voice.ts");

const CALLER = "+15555550127";
const posted: { message: string }[] = [];
let formStatus = 200;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("http://127.0.0.1:")) return realFetch(input, init);
  if (!url.startsWith("https://formspree.test/")) throw new Error(`unexpected fetch ${url}`);
  const payload = JSON.parse(String(init?.body || "{}")) as { message?: string };
  posted.push({ message: String(payload.message || "") });
  return new Response("{}", { status: formStatus, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

function missed() {
  return posted.filter((p) => p.message.includes("missed call"));
}

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
  return text;
}

function inbound(sid: string, from: string): Record<string, string> {
  return { CallSid: sid, From: from, To: "+15555550199", Called: "+15555550199" };
}

delete process.env.XAI_API_KEY;
const xml = await post("/api/cht-voice", inbound("CAmiss", CALLER));
assert(xml.includes("<Say>"), xml);
assert(!xml.includes("<Stream"), xml);
assert(missed().length === 2, `fallback notices ${missed().length}`);
assert(missed().every((p) => p.message.includes(CALLER)), "notice missing caller id");
await post("/api/cht-voice/status", { CallSid: "CAmiss", From: CALLER, CallStatus: "completed" });
assert(missed().length === 2, "status sent a second notice");
const again = await post("/api/cht-voice", inbound("CAmiss", CALLER));
assert(again.includes("<Say>"), again);
assert(missed().length === 2, "repeat fallback sent again");

posted.length = 0;
const anon = await post("/api/cht-voice", inbound("CAanon", "anonymous"));
assert(anon.includes("<Say>"), anon);
assert(missed().length === 0, `anonymous notices ${missed().length}`);

posted.length = 0;
process.env.XAI_API_KEY = "test-not-a-real-key";
const live = await post("/api/cht-voice", inbound("CAlive", CALLER));
assert(live.includes("<Stream"), live);
assert(missed().length === 0, `keyed inbound notices ${missed().length}`);
delete process.env.XAI_API_KEY;

posted.length = 0;
process.env.CHT_RING_SHOP = "1";
process.env.CHT_RING_NUMBERS = "+15555550111";
const dial = await post("/api/cht-voice", inbound("CAring", CALLER));
assert(dial.includes("<Dial"), dial);
assert(missed().length === 0, "ring path emailed before the agent fallback");
const agent = await post("/api/cht-voice/agent", {
  CallSid: "CAring",
  From: CALLER,
  To: "+15555550199",
  Called: "+15555550199",
  DialCallStatus: "no-answer",
});
assert(agent.includes("<Say>"), agent);
assert(!agent.includes("<Stream"), agent);
assert(missed().length === 2, `agent fallback notices ${missed().length}`);
assert(missed().every((p) => p.message.includes(CALLER)), "agent fallback missing caller id");
await post("/api/cht-voice/status", { CallSid: "CAring", From: CALLER, CallStatus: "completed" });
assert(missed().length === 2, "agent fallback status sent twice");

posted.length = 0;
delete process.env.CHT_RING_SHOP;
delete process.env.CHT_RING_NUMBERS;
formStatus = 500;
const failed = await post("/api/cht-voice", inbound("CAfail", CALLER));
assert(failed.includes("<Say>"), failed);
assert(missed().length === 2, `failed attempt ${missed().length}`);
formStatus = 200;
await post("/api/cht-voice/status", { CallSid: "CAfail", From: CALLER, CallStatus: "completed" });
assert(missed().length === 4, `status did not retry ${missed().length}`);
await post("/api/cht-voice/status", { CallSid: "CAfail", From: CALLER, CallStatus: "completed" });
assert(missed().length === 4, "retry was sent twice");

await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
console.log("cht-fallback-email.test.ts ok");
