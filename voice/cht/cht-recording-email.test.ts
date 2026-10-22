/**
 * The summary carries a real Twilio recording URL when the account env is set.
 * A missing variable is named. A variable that is set is not.
 *
 * Run from voice/cht: node --experimental-strip-types cht-recording-email.test.ts
 */
process.env.HOSTNAME = "voice-test.example";
process.env.CHT_FORMSPREE = "https://formspree.test/f/shop";
process.env.PEAK_FORMSPREE = "https://formspree.test/f/peak";
delete process.env.CHT_RING_SHOP;
delete process.env.CHT_RING_NUMBERS;
delete process.env.XAI_API_KEY;
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.TWILIO_AUTH_TOKEN;

import { register } from "node:module";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

await register(new URL("./esm-resolve-ts.mjs", import.meta.url));
const {
  CHT_SUMMARY_TITLE,
  missingTwilioRecordingVars,
  noteChtCaller,
  notifyChtHangup,
  recordingSidFromTwilio,
  recordingStatusLine,
  twilioRecordingMediaUrl,
} = await import("./cht-voice.ts");

const ACCOUNT = `AC${"a".repeat(32)}`;
const RECORDING = `RE${"b".repeat(32)}`;
const TOKEN = "test-recording-token";

assert(CHT_SUMMARY_TITLE === "Colorado Hot Tub call summary", CHT_SUMMARY_TITLE);
assert(!/after[- ]hours/i.test(CHT_SUMMARY_TITLE), CHT_SUMMARY_TITLE);
assert(JSON.stringify(missingTwilioRecordingVars({})) === JSON.stringify(["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"]), "both");
assert(
  JSON.stringify(missingTwilioRecordingVars({ TWILIO_ACCOUNT_SID: ACCOUNT })) === JSON.stringify(["TWILIO_AUTH_TOKEN"]),
  "token only",
);
assert(
  JSON.stringify(missingTwilioRecordingVars({ TWILIO_AUTH_TOKEN: TOKEN })) === JSON.stringify(["TWILIO_ACCOUNT_SID"]),
  "sid only",
);
assert(missingTwilioRecordingVars({ TWILIO_ACCOUNT_SID: ACCOUNT, TWILIO_AUTH_TOKEN: TOKEN }).length === 0, "neither");

const media = twilioRecordingMediaUrl(ACCOUNT, RECORDING);
assert(media === `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT}/Recordings/${RECORDING}.mp3`, media);
assert(recordingStatusLine(media, ["TWILIO_ACCOUNT_SID"]) === `Recording: ${media}`, "url wins");
assert(
  recordingStatusLine("", ["TWILIO_AUTH_TOKEN"]) === "Recording: unavailable — missing TWILIO_AUTH_TOKEN",
  "one missing",
);
assert(
  recordingStatusLine("", ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"]) ===
    "Recording: unavailable — missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN",
  "both missing",
);
const notReady = recordingStatusLine("", []);
assert(notReady.includes("not ready yet"), notReady);
assert(!notReady.includes("TWILIO_ACCOUNT_SID"), notReady);
assert(!notReady.includes("processing"), notReady);

const fat = JSON.stringify({ account_sid: "x".repeat(400), sid: RECORDING });
assert(fat.length > 300, String(fat.length));
assert(recordingSidFromTwilio(fat) === RECORDING, "sid parsed past 300 chars");
assert(recordingSidFromTwilio(fat.slice(0, 300)) === "", "truncated body is not a sid");
assert(recordingSidFromTwilio(JSON.stringify({ recordings: [{ sid: RECORDING }] })) === RECORDING, "list sid");

type Posted = { message: string; subject: string };
const posted: Posted[] = [];
const twilioGets: string[] = [];
let twilioBody = "{}";
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("http://127.0.0.1:")) return realFetch(input, init);
  if (url.startsWith("https://formspree.test/")) {
    const payload = JSON.parse(String(init?.body || "{}")) as { message?: string; _subject?: string };
    posted.push({ message: String(payload.message || ""), subject: String(payload._subject || "") });
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  }
  if (url.startsWith("https://api.twilio.com/")) {
    const headers = new Headers(init?.headers);
    twilioGets.push(url);
    assert(headers.get("authorization")?.startsWith("Basic "), "recording lookup was not authenticated");
    return new Response(twilioBody, { status: 200, headers: { "Content-Type": "application/json" } });
  }
  throw new Error(`unexpected fetch ${url}`);
}) as typeof fetch;

function summaries() {
  return posted.filter((p) => p.message.includes(CHT_SUMMARY_TITLE));
}

const CALLER = "+15555550123";
const noneSid = `CA${"1".repeat(32)}`;
noteChtCaller(noneSid, "The pump is leaking.");
await notifyChtHangup(noneSid, CALLER);
assert(summaries().length === 2, `unset env summaries ${summaries().length}`);
assert(twilioGets.length === 0, "unset env called Twilio");
assert(
  summaries().every((p) => p.message.includes("missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN")),
  summaries()[0]?.message || "",
);
assert(summaries().every((p) => p.message.includes(`Caller ID: ${CALLER}`)), "caller id");
assert(summaries().every((p) => !p.message.includes("processing")), "old processing line");
assert(summaries().every((p) => !/set TWILIO_ACCOUNT_SID/.test(p.message)), "old set-sid line");
assert(summaries().every((p) => !/after[- ]hours/i.test(`${p.subject}\n${p.message}`)), "after hours");

posted.length = 0;
process.env.TWILIO_ACCOUNT_SID = ACCOUNT;
delete process.env.TWILIO_AUTH_TOKEN;
const tokenSid = `CA${"2".repeat(32)}`;
noteChtCaller(tokenSid, "Need a cover.");
await notifyChtHangup(tokenSid, CALLER);
assert(twilioGets.length === 0, "missing token called Twilio");
assert(summaries().every((p) => p.message.includes("missing TWILIO_AUTH_TOKEN")), summaries()[0]?.message || "");
assert(summaries().every((p) => !p.message.includes("TWILIO_ACCOUNT_SID")), "named a variable that is set");

posted.length = 0;
twilioGets.length = 0;
process.env.TWILIO_ACCOUNT_SID = ACCOUNT;
process.env.TWILIO_AUTH_TOKEN = TOKEN;
twilioBody = JSON.stringify({ recordings: [{ sid: RECORDING }] });
const foundSid = `CA${"3".repeat(32)}`;
noteChtCaller(foundSid, "Service visit.");
await notifyChtHangup(foundSid, CALLER);
assert(twilioGets.length === 1, `lookups ${twilioGets.length}`);
assert(twilioGets[0] === `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT}/Calls/${foundSid}/Recordings.json`, twilioGets[0] || "");
assert(summaries().every((p) => p.message.includes(media)), summaries()[0]?.message || "");
assert(summaries().every((p) => !p.message.includes("missing TWILIO")), "missing line with a url");
assert(summaries().every((p) => !p.message.includes(TOKEN)), "token leaked into the email");
const before = posted.length;
await notifyChtHangup(foundSid, CALLER);
assert(posted.length === before, "same CallSid emailed twice");

posted.length = 0;
twilioGets.length = 0;
twilioBody = JSON.stringify({ recordings: [] });
const waitSid = `CA${"4".repeat(32)}`;
noteChtCaller(waitSid, "Just a question.");
await notifyChtHangup(waitSid, CALLER);
assert(twilioGets.length === 1, "empty list did not look up");
assert(summaries().every((p) => p.message.includes("not ready yet")), summaries()[0]?.message || "");
assert(summaries().every((p) => !p.message.includes("missing TWILIO_ACCOUNT_SID")), "blamed a set account sid");
assert(summaries().every((p) => !p.message.includes("missing TWILIO_AUTH_TOKEN")), "blamed a set auth token");
assert(summaries().every((p) => !p.message.includes(TOKEN)), "token leaked");

console.log("cht-recording-email.test.ts ok");
