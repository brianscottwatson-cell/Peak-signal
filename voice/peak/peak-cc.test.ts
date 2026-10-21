/**
 * The hangup summary CCs the caller only after confirm_lead.
 * book_intro, send_contact, and send_booking_link must not bypass that.
 *
 * Run from the repo root:
 *   node --experimental-strip-types voice/peak/peak-cc.test.ts
 */
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
delete process.env.GITHUB_TOKEN;

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const CALLER = "+15555550124";
const LEAD = "lead@example.com";

await register(new URL("../cht/esm-resolve-ts.mjs", import.meta.url));
const { default: express } = await import("express");
const { voiceAraRouter, applyVoiceTool, recordCallerUtterance } = await import("../voice-ara.ts");

type Payload = { _cc?: string; email?: string; _replyto?: string; message?: string };
const posts: Payload[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("http://127.0.0.1:")) return realFetch(input, init);
  if (url.includes("formspree.io")) {
    posts.push(JSON.parse(String(init?.body || "{}")) as Payload);
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  }
  throw new Error(`unexpected fetch ${url}`);
}) as typeof fetch;

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use("/api/voice", voiceAraRouter);
const server = await new Promise<import("node:http").Server>((resolve) => {
  const s = app.listen(0, "127.0.0.1", () => resolve(s));
});
const addr = server.address();
const port = typeof addr === "object" && addr ? addr.port : 0;

async function post(path: string, params: Record<string, string>) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const text = await res.text();
  assert(res.status === 200, `${path} ${res.status} ${text}`);
  return text;
}

async function hangup(sid: string) {
  const before = posts.length;
  await post("/api/voice/status", { CallSid: sid, From: CALLER, CallStatus: "completed" });
  return posts.slice(before);
}

function copied(payload: Payload): boolean {
  const cc = String(payload._cc || "");
  return cc.split(",").map((s) => s.trim()).includes(LEAD)
    || payload.email === LEAD
    || payload._replyto === LEAD;
}

const logged = "CAlogged";
await post("/api/voice", { CallSid: logged, From: CALLER, To: "+15555550100", Called: "+15555550100" });
const logResult = JSON.parse(applyVoiceTool(logged, "log_qualification", {
  name: "Ada",
  business: "Example Shop",
  need: "A new site",
  email: LEAD,
}));
assert(logResult.ok === true, JSON.stringify(logResult));
recordCallerUtterance(logged, "We need a site.");
let sent = await hangup(logged);
assert(sent.length === 1, `logged emails ${sent.length}`);
assert(!copied(sent[0]), `logged caller was copied ${JSON.stringify(sent[0])}`);
assert(String(sent[0].message || "").includes(LEAD), "shop mail dropped the address");
sent = await hangup(logged);
assert(sent.length === 0, "logged hangup sent twice");

async function unconfirmed(sid: string, tool: string, args: Record<string, unknown>) {
  await post("/api/voice", { CallSid: sid, From: CALLER, To: "+15555550100", Called: "+15555550100" });
  applyVoiceTool(sid, "log_qualification", { name: "Ada", business: "Example Shop", need: "A new site" });
  const result = JSON.parse(applyVoiceTool(sid, tool, args));
  assert(result.ok === true, `${tool} ${JSON.stringify(result)}`);
  assert(result.confirmed === undefined, `${tool} set confirmed`);
  recordCallerUtterance(sid, "Please send that.");
  const mail = await hangup(sid);
  assert(mail.length === 1, `${tool} emails ${mail.length}`);
  assert(!copied(mail[0]), `${tool} copied the caller ${JSON.stringify(mail[0])}`);
}

await unconfirmed("CAbook", "book_intro", { email: LEAD });
await unconfirmed("CAcontact", "send_contact", { email: LEAD });
await unconfirmed("CAlink", "send_booking_link", { channel: "email", email: LEAD });

const confirmed = "CAconfirm";
await post("/api/voice", { CallSid: confirmed, From: CALLER, To: "+15555550100", Called: "+15555550100" });
const confirmResult = JSON.parse(applyVoiceTool(confirmed, "confirm_lead", {
  name: "Ada",
  business: "Example Shop",
  need: "A new site",
  summary: "Ada wants a new site for Example Shop.",
  email: LEAD,
}));
assert(confirmResult.ok === true, JSON.stringify(confirmResult));
applyVoiceTool(confirmed, "book_intro", { email: LEAD });
recordCallerUtterance(confirmed, "Yes, that is right.");
sent = await hangup(confirmed);
assert(sent.length === 1, `confirm emails ${sent.length}`);
assert(copied(sent[0]), `confirmed caller was not copied ${JSON.stringify(sent[0])}`);

const rejected = "CAreject";
await post("/api/voice", { CallSid: rejected, From: CALLER, To: "+15555550100", Called: "+15555550100" });
applyVoiceTool(rejected, "log_qualification", { email: LEAD });
const rejectResult = JSON.parse(applyVoiceTool(rejected, "confirm_lead", { email: LEAD }));
assert(rejectResult.ok === false, JSON.stringify(rejectResult));
recordCallerUtterance(rejected, "Hello.");
sent = await hangup(rejected);
assert(sent.length === 1, `rejected confirm emails ${sent.length}`);
assert(!copied(sent[0]), `rejected confirm copied the caller ${JSON.stringify(sent[0])}`);

await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
console.log("peak-cc.test.ts ok");
