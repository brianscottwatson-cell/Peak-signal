/**
 * A greeting hangup with a known caller id is emailed in every voice mode,
 * once. Forward mode keeps its one-line mail. Private numbers are not leads.
 *
 * Run from the repo root:
 *   node --experimental-strip-types voice/peak/peak-caller-id.test.ts
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

const CALLER = "+15555550126";

await register(new URL("../cht/esm-resolve-ts.mjs", import.meta.url));
const { default: express } = await import("express");
const { voiceAraRouter, inboundVoice, recordCallerUtterance } = await import("../voice-ara.ts");

const posts: { message: string }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("http://127.0.0.1:")) return realFetch(input, init);
  if (url.includes("formspree.io")) {
    const payload = JSON.parse(String(init?.body || "{}")) as { message?: string };
    posts.push({ message: String(payload.message || "") });
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  }
  throw new Error(`unexpected fetch ${url}`);
}) as typeof fetch;

assert(inboundVoice().peak === false, "default voice mode is not legacy");

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

async function complete(sid: string, from: string) {
  const before = posts.length;
  await post("/api/voice/status", { CallSid: sid, From: from, CallStatus: "completed" });
  await post("/api/voice/status", { CallSid: sid, From: from, CallStatus: "completed" });
  return posts.slice(before);
}

delete process.env.PEAK_VOICE_MODE;
let sent = await complete("CAlegacy", CALLER);
assert(sent.length === 1, `legacy greeting emails ${sent.length}`);
assert(sent[0].message.includes(CALLER), sent[0].message);

sent = await complete("CAanon", "anonymous");
assert(sent.length === 0, `anonymous emails ${sent.length}`);
sent = await complete("CAempty", "");
assert(sent.length === 0, `empty from emails ${sent.length}`);

recordCallerUtterance("CAtranscript", "We need a site.");
sent = await complete("CAtranscript", CALLER);
assert(sent.length === 1, `transcript emails ${sent.length}`);
assert(sent[0].message.includes(CALLER), "transcript mail dropped the caller id");

process.env.PEAK_VOICE_MODE = "agent";
sent = await complete("CAagent", CALLER);
assert(sent.length === 1, `agent greeting emails ${sent.length}`);
assert(sent[0].message.includes(CALLER), sent[0].message);
assert(!sent[0].message.includes("caller hung up"), "agent mode used the forward line");

process.env.PEAK_VOICE_MODE = "forward_then_agent";
sent = await complete("CAforward", CALLER);
assert(sent.length === 1, `forward greeting emails ${sent.length}`);
assert(sent[0].message.includes(CALLER), sent[0].message);
assert(sent[0].message.includes("caller hung up"), sent[0].message);

delete process.env.PEAK_VOICE_MODE;
assert(inboundVoice().peak === false, "tests left the peak persona on");

await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
console.log("peak-caller-id.test.ts ok");
