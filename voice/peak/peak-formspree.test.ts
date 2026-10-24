/**
 * A non-2xx Formspree response is not "sent".
 * The GitHub backup runs unless that post truly succeeded.
 * Peak voice stays off unless PEAK_VOICE_MODE is set for a case.
 *
 * Run from the repo root:
 *   node --experimental-strip-types voice/peak/peak-formspree.test.ts
 */
import { dirname, join } from "node:path";
import { chdir } from "node:process";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
chdir(join(here, "../.."));

process.env.HOSTNAME = "voice-test.example";
process.env.XAI_API_KEY = "test-not-a-real-key";
process.env.GITHUB_TOKEN = "test-token";
delete process.env.PEAK_VOICE_MODE;
delete process.env.PEAK_VOICE;
delete process.env.PEAK_FORWARD_TO;

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const CALLER = "+15555550125";

await register(new URL("../cht/esm-resolve-ts.mjs", import.meta.url));
const { default: express } = await import("express");
const { voiceAraRouter, recordCallerUtterance } = await import("../voice-ara.ts");

let formStatus = 200;
let gate: Promise<void> = Promise.resolve();
const formPosts: string[] = [];
const githubPuts: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("http://127.0.0.1:")) return realFetch(input, init);
  const method = String(init?.method || "GET").toUpperCase();
  if (url.includes("formspree.io")) {
    formPosts.push(url);
    await gate;
    return new Response("no", { status: formStatus, headers: { "Content-Type": "application/json" } });
  }
  if (url.includes("api.github.com")) {
    if (method === "PUT") githubPuts.push(url);
    if (method === "GET") return new Response("missing", { status: 404 });
    return new Response("{}", { status: 201, headers: { "Content-Type": "application/json" } });
  }
  throw new Error(`unexpected fetch ${method} ${url}`);
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
  await post("/api/voice/status", { CallSid: sid, From: CALLER, CallStatus: "completed" });
}

delete process.env.PEAK_VOICE_MODE;
formStatus = 500;
recordCallerUtterance("CAfail", "We need a site for the shop.");
await hangup("CAfail");
assert(formPosts.length === 1, `fail posts ${formPosts.length}`);
assert(githubPuts.length === 3, `fail backup puts ${githubPuts.length}`);
await hangup("CAfail");
assert(formPosts.length === 2, `fail did not retry ${formPosts.length}`);
assert(githubPuts.length === 6, `retry skipped backup ${githubPuts.length}`);
formStatus = 201;
await hangup("CAfail");
assert(formPosts.length === 3, `201 was treated as failure ${formPosts.length}`);
assert(githubPuts.length === 9, `legacy success skipped github ${githubPuts.length}`);
await hangup("CAfail");
assert(formPosts.length === 3, "success was not latched");
assert(githubPuts.length === 9, "latched success wrote github again");

formStatus = 200;
const formsBefore = formPosts.length;
const putsBefore = githubPuts.length;
recordCallerUtterance("CApeakok", "We need a site for the shop.");
process.env.PEAK_VOICE_MODE = "agent";
await hangup("CApeakok");
assert(formPosts.length === formsBefore + 1, "peak success did not email");
assert(githubPuts.length === putsBefore, `peak success still backed up ${githubPuts.length - putsBefore}`);
await hangup("CApeakok");
assert(formPosts.length === formsBefore + 1, "peak success emailed twice");

formStatus = 502;
recordCallerUtterance("CApeakfail", "We need a site for the shop.");
await hangup("CApeakfail");
assert(formPosts.length === formsBefore + 2, "peak failure did not post");
assert(githubPuts.length === putsBefore + 3, `peak failure skipped backup ${githubPuts.length - putsBefore}`);
await hangup("CApeakfail");
assert(formPosts.length === formsBefore + 3, "peak failure was latched as sent");

delete process.env.PEAK_VOICE_MODE;
process.env.PEAK_VOICE_MODE = "forward_then_agent";
process.env.PEAK_FORWARD_TO = "+15555550100";
formStatus = 500;
const forwardForms = formPosts.length;
await post("/api/voice/screen?parent=CAfwd&gather=1", { Digits: "1" });
await post("/api/voice/after-dial", { CallSid: "CAfwd", From: CALLER, DialCallStatus: "completed" });
assert(formPosts.length === forwardForms + 1, "forward failure did not post");
formStatus = 200;
await post("/api/voice/status", { CallSid: "CAfwd", From: CALLER, CallStatus: "completed" });
assert(formPosts.length === forwardForms + 2, "forward failure was not retried");
await post("/api/voice/status", { CallSid: "CAfwd", From: CALLER, CallStatus: "completed" });
assert(formPosts.length === forwardForms + 2, "forward success sent twice");

delete process.env.PEAK_VOICE_MODE;
formStatus = 200;
let release = () => {};
gate = new Promise<void>((resolve) => {
  release = resolve;
});
recordCallerUtterance("CAonce", "We need a site for the shop.");
const overlapped = Promise.all([hangup("CAonce"), hangup("CAonce")]);
await new Promise((r) => setTimeout(r, 30));
const during = formPosts.length;
release();
gate = Promise.resolve();
await overlapped;
assert(during === forwardForms + 3, `in-flight posts ${during - forwardForms}`);
const oncePosts = formPosts.length - (forwardForms + 2);
assert(oncePosts === 1, `overlapping hangups posted ${oncePosts}`);

await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
console.log("peak-formspree.test.ts ok");
