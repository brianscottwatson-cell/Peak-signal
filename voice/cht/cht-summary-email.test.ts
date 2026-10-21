/**
 * Hangup summary is sent once even when stop, status, and socket flush overlap.
 * A total Formspree failure releases the claim so a later attempt can retry.
 * The recording-ready mail stays a separate send.
 *
 * Run from voice/cht: node --experimental-strip-types cht-summary-email.test.ts
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
const { chtVoiceRouter, noteChtCaller, notifyChtHangup } = await import("./cht-voice.ts");

const CALLER = "+15555550123";
type Posted = { url: string; message: string; subject: string };

const posted: Posted[] = [];
let formStatus = 200;
let gate: Promise<void> = Promise.resolve();
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("http://127.0.0.1:")) return realFetch(input, init);
  if (!url.startsWith("https://formspree.test/")) throw new Error(`unexpected fetch ${url}`);
  const payload = JSON.parse(String(init?.body || "{}")) as { message?: string; _subject?: string };
  posted.push({ url, message: String(payload.message || ""), subject: String(payload._subject || "") });
  await gate;
  return new Response("{}", { status: formStatus, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

function summaries() {
  return posted.filter((p) => p.message.includes("after-hours voice summary"));
}
function recordings() {
  return posted.filter((p) => p.message.includes("call recording ready"));
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

// Empty hangup does not claim the flag, so a later real summary can still send.
posted.length = 0;
await notifyChtHangup("CAempty", CALLER);
assert(posted.length === 0, `empty hangup posted ${posted.length}`);
noteChtCaller("CAempty", "The pump is leaking.");
await notifyChtHangup("CAempty", CALLER);
assert(summaries().length === 2, `empty-then-rich summaries ${summaries().length}`);
assert(summaries().every((p) => p.message.includes(CALLER)), "summary missing caller");

// Stop, status, and socket flush overlap. One summary (shop + peak), not three.
posted.length = 0;
let release = () => {};
gate = new Promise<void>((resolve) => {
  release = resolve;
});
noteChtCaller("CArace", "Need a new cover.");
let postsDuringClaim = -1;
const race = Promise.all([
  notifyChtHangup("CArace", CALLER),
  notifyChtHangup("CArace", CALLER),
  notifyChtHangup("CArace", CALLER),
]);
await new Promise((r) => setTimeout(r, 30));
postsDuringClaim = posted.length;
release();
gate = Promise.resolve();
await race;
assert(postsDuringClaim === 1, `in-flight posts before claim released the others: ${postsDuringClaim}`);
assert(summaries().length === 2, `race summaries ${summaries().length}`);
assert(recordings().length === 0, `race recordings ${recordings().length}`);
const beforeRetry = posted.length;
await notifyChtHangup("CArace", CALLER);
assert(posted.length === beforeRetry, "success was not latched");

// Status route uses the same claim. A second completed callback does not send again.
posted.length = 0;
noteChtCaller("CAstatus", "Filters are due.");
await post("/api/cht-voice/status", { CallSid: "CAstatus", From: CALLER, CallStatus: "completed" });
await post("/api/cht-voice/status", { CallSid: "CAstatus", From: CALLER, CallStatus: "completed" });
assert(summaries().length === 2, `status summaries ${summaries().length}`);

// Both posts failed: claim is released and a retry sends once.
posted.length = 0;
formStatus = 500;
noteChtCaller("CAfail", "Heater will not start.");
await notifyChtHangup("CAfail", CALLER);
assert(posted.length === 2, `failed attempt posts ${posted.length}`);
assert(summaries().length === 2, "failure did not post");
formStatus = 200;
await notifyChtHangup("CAfail", CALLER);
assert(summaries().length === 4, `retry summaries ${summaries().length}`);
await notifyChtHangup("CAfail", CALLER);
assert(summaries().length === 4, "retry success sent twice");

// Recording-ready mail is separate, and only once, after the summary already went out.
posted.length = 0;
noteChtCaller("CArec", "Looking at a swim spa.");
await notifyChtHangup("CArec", CALLER);
assert(summaries().length === 2, `pre-recording summaries ${summaries().length}`);
const recUrl = "https://api.example.test/recordings/RE123";
await post("/api/cht-voice/recording", {
  CallSid: "CArec",
  RecordingStatus: "completed",
  RecordingUrl: recUrl,
  RecordingSid: "RE123",
});
await post("/api/cht-voice/recording", {
  CallSid: "CArec",
  RecordingStatus: "completed",
  RecordingUrl: recUrl,
  RecordingSid: "RE123",
});
assert(summaries().length === 2, `recording callback resent the summary ${summaries().length}`);
assert(recordings().length === 2, `recording mails ${recordings().length}`);
assert(recordings().every((p) => p.message.includes(recUrl)), "recording mail missing url");
assert(recordings().every((p) => p.message.includes(CALLER)), "recording mail missing caller");

// A summary that already included the recording URL does not send the extra mail.
posted.length = 0;
noteChtCaller("CAwithurl", "Service on the existing tub.");
await post("/api/cht-voice/recording", {
  CallSid: "CAwithurl",
  RecordingStatus: "completed",
  RecordingUrl: "https://api.example.test/recordings/RE456",
  RecordingSid: "RE456",
});
assert(summaries().length === 2, `url-first summaries ${summaries().length}`);
assert(recordings().length === 0, `url-first recordings ${recordings().length}`);
assert(summaries().every((p) => p.message.includes("RE456")), "summary missing recording url");
await notifyChtHangup("CAwithurl", CALLER);
assert(posted.length === 2, "later hangup sent another mail");

await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
console.log("cht-summary-email.test.ts ok");
