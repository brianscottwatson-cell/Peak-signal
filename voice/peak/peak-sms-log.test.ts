/**
 * Inbound receptionist: one booking-link SMS, and one call-log row.
 * Loopback only. Twilio, Google, Formspree, and GitHub are stubbed.
 * No real credentials and no live send.
 *
 * Run from the repo root:
 *   node --experimental-strip-types voice/peak/peak-sms-log.test.ts
 */
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { chdir } from "node:process";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
chdir(join(here, "../.."));

process.env.HOSTNAME = "voice-test.example";
process.env.XAI_API_KEY = "test-not-a-real-key";
process.env.TWILIO_ACCOUNT_SID = "ACtest";
process.env.TWILIO_AUTH_TOKEN = "test-token";
delete process.env.PEAK_VOICE_MODE;
delete process.env.PEAK_VOICE;
delete process.env.PEAK_FORWARD_TO;
delete process.env.PEAK_SMS_ENABLED;
delete process.env.PEAK_SMS_FROM;
delete process.env.PEAK_CALL_LOG_SHEET_ID;
delete process.env.PEAK_CALL_LOG_GOOGLE_CREDENTIALS;
delete process.env.GITHUB_TOKEN;
delete process.env.PEAK_OUTBOUND_ENABLED;

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const CALLER = "+15555550124";
const OTHER = "+15555550131";
const STRANGER = "+15555550148";
const FROM_OVERRIDE = "+17205550199";
const SHEET_ID = "sheetTestId";
const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const credentials = JSON.stringify({
  client_email: "log@example.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
});

await register(new URL("../cht/esm-resolve-ts.mjs", import.meta.url));
const { default: express } = await import("express");
const { voiceAraRouter, applyVoiceTool, inboundVoice, recordCallerUtterance } = await import("../voice-ara.ts");
const { PEAK_GREETING, PEAK_INSTRUCTIONS } = await import("./peak-prompt.ts");
const { PEAK_CALLER_ID } = await import("./peak-forward.ts");
const { bookingLinkSmsBody } = await import("./peak-sms.ts");
const outbound = await import("./peak-outbound.ts");

assert(PEAK_CALLER_ID === "+19706605088", PEAK_CALLER_ID);
assert(bookingLinkSmsBody() === `Peak Signal: book your 30-minute call here: https://calendly.com/hello-peaksignal/30min`, bookingLinkSmsBody());

const outboundSrc = readFileSync(join(here, "peak-outbound.ts"), "utf8");
assert(!outboundSrc.includes("Messages.json"), "outbound references the messages API");
assert(!outboundSrc.includes("peak-sms"), "outbound imports the receptionist SMS module");
assert(!outboundSrc.includes("PEAK_SMS"), "outbound reads the receptionist SMS flag");

type SmsHit = { to: string; from: string; body: string; auth: string; encoding: string };
const texts: SmsHit[] = [];
const forms: { message: string }[] = [];
const written: string[][] = [];
let sheetTries = 0;
let githubPuts = 0;
let callCreates = 0;
let formStatus = 200;
let sheetStatus = 200;
let smsStatus = 201;
let hold = Promise.resolve();
let holdSms = false;
let holdHangup = false;
let releaseHold = () => {};

function header(init: RequestInit | undefined, name: string): string {
  return new Headers(init?.headers).get(name) || "";
}

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("http://127.0.0.1:")) return realFetch(input, init);
  const method = String(init?.method || "GET").toUpperCase();
  if (url.includes("formspree.io")) {
    const payload = JSON.parse(String(init?.body || "{}")) as { message?: string };
    forms.push({ message: String(payload.message || "") });
    if (holdHangup) await hold;
    return new Response("{}", { status: formStatus, headers: { "Content-Type": "application/json" } });
  }
  if (url.includes("api.github.com")) {
    if (method === "PUT") githubPuts += 1;
    if (method === "GET") return new Response("missing", { status: 404 });
    return new Response("{}", { status: 201, headers: { "Content-Type": "application/json" } });
  }
  if (url.includes("oauth2.googleapis.com/token")) {
    const body = String(init?.body || "");
    assert(body.includes("grant_type="), "token request is not the jwt grant");
    assert(!body.includes("PRIVATE KEY"), "token request contains the private key");
    return new Response(JSON.stringify({ access_token: "ya29.test", expires_in: 3600 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (url.includes("sheets.googleapis.com")) {
    assert(url.includes(`/spreadsheets/${SHEET_ID}/values/`), url);
    assert(url.includes("valueInputOption=RAW"), url);
    assert(url.includes("insertDataOption=INSERT_ROWS"), url);
    assert(header(init, "authorization") === "Bearer ya29.test", "sheet auth");
    const payload = JSON.parse(String(init?.body || "{}")) as { values?: string[][] };
    const row = payload.values?.[0] || [];
    assert(!JSON.stringify(row).includes("PRIVATE KEY"), "sheet row contains the key");
    sheetTries += 1;
    if (holdHangup) await hold;
    if (sheetStatus >= 200 && sheetStatus < 300) written.push(row);
    return new Response("{}", { status: sheetStatus, headers: { "Content-Type": "application/json" } });
  }
  if (url.includes("api.twilio.com")) {
    if (url.endsWith("/Messages.json")) {
      const params = new URLSearchParams(String(init?.body || ""));
      assert([...params.keys()].sort().join(",") === "Body,From,To", [...params.keys()].join(","));
      texts.push({
        to: params.get("To") || "",
        from: params.get("From") || "",
        body: params.get("Body") || "",
        auth: header(init, "authorization"),
        encoding: header(init, "accept-encoding"),
      });
      if (holdSms) await hold;
      if (smsStatus !== 201) return new Response(JSON.stringify({ message: "nope" }), { status: smsStatus });
      return new Response(JSON.stringify({ sid: "SM123" }), { status: 201, headers: { "Content-Type": "application/json" } });
    }
    if (url.endsWith("/Calls.json")) {
      callCreates += 1;
      return new Response(JSON.stringify({ sid: "CA00000000000000000000000000000099" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`unexpected twilio ${method} ${url}`);
  }
  throw new Error(`unexpected fetch ${method} ${url}`);
}) as typeof fetch;

function armHold() {
  hold = new Promise<void>((resolve) => {
    releaseHold = resolve;
  });
}

function clearHold() {
  releaseHold();
  hold = Promise.resolve();
  holdSms = false;
  holdHangup = false;
}

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use("/api/voice", voiceAraRouter);
const server = await new Promise<import("node:http").Server>((resolve) => {
  const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
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

async function inbound(sid: string, from = CALLER) {
  await post("/api/voice", { CallSid: sid, From: from, To: "+15555550100", Called: "+15555550100" });
}

async function hangup(sid: string, from = CALLER) {
  await post("/api/voice/status", { CallSid: sid, From: from, CallStatus: "completed" });
}

async function tool(sid: string, name: string, args: Record<string, unknown>) {
  return JSON.parse(await applyVoiceTool(sid, name, args)) as { ok?: boolean; sms?: boolean; channel?: string };
}

function enableLog() {
  process.env.PEAK_CALL_LOG_SHEET_ID = SHEET_ID;
  process.env.PEAK_CALL_LOG_GOOGLE_CREDENTIALS = credentials;
}

function row(index: number): string[] {
  const found = written[index];
  assert(found, `missing sheet row ${index}`);
  return found;
}

delete process.env.PEAK_SMS_ENABLED;
process.env.PEAK_VOICE_MODE = "agent";
const offCopy = inboundVoice();
assert(offCopy.greeting === PEAK_GREETING, "greeting changed with SMS off");
assert(offCopy.instructions === PEAK_INSTRUCTIONS, "flag off changed the persona");
process.env.PEAK_SMS_ENABLED = "1";
const onCopy = inboundVoice();
assert(onCopy.greeting === PEAK_GREETING, "greeting changed with SMS on");
assert(onCopy.instructions.includes("returns sms true"), "flag on does not offer the text");
assert(!onCopy.instructions.includes("does not send text messages"), "flag on still says texts are off");
assert(onCopy.instructions.includes("https://calendly.com/hello-peaksignal/30min"), "missing calendly");
assert(onCopy.instructions.includes(PEAK_GREETING), "flag on dropped the greeting");
for (const banned of ["Colorado Hot Tub", "AI receptionist", "$", "Watson"]) {
  assert(!onCopy.instructions.includes(banned), `persona contains ${banned}`);
}

enableLog();
process.env.PEAK_VOICE_MODE = "agent";
process.env.PEAK_SMS_ENABLED = "1";

await inbound("CAtext");
await tool("CAtext", "log_qualification", {
  name: "Ada",
  business: "Example Shop",
  need: "A new site",
  timeline: "This month",
  email: "ada@example.com",
});
await tool("CAtext", "confirm_lead", {
  name: "Ada",
  business: "Example Shop",
  need: "A new site",
  summary: "Ada wants a new site for Example Shop.",
  email: "ada@example.com",
});
const asked = await tool("CAtext", "send_booking_link", { channel: "text", to: STRANGER });
assert(asked.sms === true, JSON.stringify(asked));
const again = await tool("CAtext", "send_booking_link", { channel: "text", phone: STRANGER, confirmed: true });
assert(again.sms === true, "second text call did not report the existing send");
assert(texts.length === 1, `texts ${texts.length}`);
assert(texts[0].to === CALLER, texts[0].to);
assert(texts[0].from === "+19706605088", texts[0].from);
assert(texts[0].body === bookingLinkSmsBody(), texts[0].body);
assert(texts[0].auth === `Basic ${Buffer.from("ACtest:test-token").toString("base64")}`, "twilio basic auth");
assert(texts[0].encoding === "gzip, identity", texts[0].encoding);
assert(texts[0].to !== STRANGER, "texted a number from an extra field");
recordCallerUtterance("CAtext", "Please text me the link.");
await hangup("CAtext");
await hangup("CAtext");
assert(forms.length === 1, `texted formspree ${forms.length}`);
assert(forms[0].message.includes("One text was sent."), forms[0].message);
assert(!forms[0].message.includes("did not send"), forms[0].message);
assert(written.length === 1, `texted rows ${written.length}`);
assert(sheetTries === 1, `texted sheet tries ${sheetTries}`);
{
  const logged = row(0);
  assert(logged[1] === "CAtext", logged[1]);
  assert(logged[2] === "Ada", logged[2]);
  assert(logged[3] === CALLER, logged[3]);
  assert(logged[4] === "ada@example.com", logged[4]);
  assert(logged[5] === "Example Shop", logged[5]);
  assert(logged[6] === "A new site", logged[6]);
  assert(logged[7] === "This month", logged[7]);
  assert(logged[8] === "yes", logged[8]);
  assert(logged[9] === "yes", logged[9]);
  assert(logged[10] === "no", logged[10]);
  assert(/^\d{4}-\d{2}-\d{2}T/.test(logged[0]), logged[0]);
}

await inbound("CAneed");
await tool("CAneed", "log_qualification", {
  name: "Ada",
  business: "Example Shop",
  need: "A new site",
  timeline: "This month",
  email: "ada@example.com",
});
await tool("CAneed", "request_callback", { window: "Thursday afternoon", reason: "needs a person" });
const beforeNeedTexts = texts.length;
recordCallerUtterance("CAneed", "Please call me Thursday.");
await hangup("CAneed");
await hangup("CAneed");
assert(texts.length === beforeNeedTexts, "callback texted without a request");
assert(forms.length === 2, `callback formspree ${forms.length}`);
assert(written.length === 2, `callback rows ${written.length}`);
{
  const logged = row(1);
  assert(logged[2] === "Ada", logged.join("|"));
  assert(logged[3] === CALLER, logged[3]);
  assert(logged[4] === "ada@example.com", logged[4]);
  assert(logged[5] === "Example Shop", logged[5]);
  assert(logged[6] === "A new site", logged[6]);
  assert(logged[7] === "This month", logged[7]);
  assert(logged[8] === "no", `booked ${logged[8]}`);
  assert(logged[9] === "no", `texted ${logged[9]}`);
  assert(logged[10] === "yes", logged[10]);
  assert(logged[11].includes("Thursday afternoon"), logged[11]);
}

process.env.PEAK_SMS_ENABLED = "0";
await inbound("CAoff");
const offSms = await tool("CAoff", "send_booking_link", { channel: "text" });
assert(offSms.sms === false, JSON.stringify(offSms));
assert(texts.length === beforeNeedTexts, "flag off sent a text");
recordCallerUtterance("CAoff", "Text me the link.");
await hangup("CAoff");
await hangup("CAoff");
assert(forms.length === 3, `flag off formspree ${forms.length}`);
assert(forms[2].message.includes("This server did not send a text."), forms[2].message);
assert(written.length === 3, `flag off rows ${written.length}`);
assert(row(2)[8] === "yes" && row(2)[9] === "no", row(2).join("|"));
assert(row(2)[10] === "yes", row(2)[11]);
assert(row(2)[11].includes("was not sent"), row(2)[11]);

process.env.PEAK_SMS_ENABLED = "true";
await inbound("CAtrue");
await tool("CAtrue", "send_booking_link", { channel: "text" });
assert(texts.length === beforeNeedTexts, "PEAK_SMS_ENABLED=true sent a text");

process.env.PEAK_SMS_ENABLED = "1";
await inbound("CAunconfirmed");
const unconfirmed = await tool("CAunconfirmed", "send_booking_link", { channel: "text", phone: OTHER });
assert(unconfirmed.sms === false, JSON.stringify(unconfirmed));
assert(texts.length === beforeNeedTexts, "unconfirmed number was texted");
const confirmed = await tool("CAunconfirmed", "send_booking_link", {
  channel: "text",
  phone: OTHER,
  confirmed: true,
  to: STRANGER,
});
assert(confirmed.sms === true, JSON.stringify(confirmed));
assert(texts.length === beforeNeedTexts + 1, `confirmed texts ${texts.length}`);
assert(texts.at(-1)?.to === OTHER, texts.at(-1)?.to || "");
assert(texts.at(-1)?.to !== CALLER, "confirmed text went to the calling number");
assert(texts.at(-1)?.to !== STRANGER, "confirmed text went to an extra field");
assert(texts.at(-1)?.from === "+19706605088", texts.at(-1)?.from || "");

process.env.PEAK_SMS_FROM = FROM_OVERRIDE;
await inbound("CAfrom");
const customFrom = await tool("CAfrom", "send_booking_link", { channel: "text" });
assert(customFrom.sms === true, JSON.stringify(customFrom));
assert(texts.at(-1)?.from === FROM_OVERRIDE, texts.at(-1)?.from || "");
assert(texts.at(-1)?.to === CALLER, texts.at(-1)?.to || "");
process.env.PEAK_SMS_FROM = "+1999";
await inbound("CAbadfrom");
const badFrom = await tool("CAbadfrom", "send_booking_link", { channel: "text" });
assert(badFrom.sms === false, "invalid from-line sent a text");
assert(texts.at(-1)?.from === FROM_OVERRIDE, "invalid from-line fell back to a send");
delete process.env.PEAK_SMS_FROM;

const savedToken = process.env.TWILIO_AUTH_TOKEN;
delete process.env.TWILIO_AUTH_TOKEN;
await inbound("CAnocreds");
const noCreds = await tool("CAnocreds", "send_booking_link", { channel: "text" });
assert(noCreds.sms === false, "missing auth token sent a text");
assert(texts.at(-1)?.from === FROM_OVERRIDE, "missing creds posted a message");
process.env.TWILIO_AUTH_TOKEN = savedToken;

smsStatus = 500;
const textsBeforeFail = texts.length;
const formsBeforeFail = forms.length;
const rowsBeforeFail = written.length;
await inbound("CAsmsfail");
const failedSms = await tool("CAsmsfail", "send_booking_link", { channel: "text" });
assert(failedSms.sms === false, JSON.stringify(failedSms));
const retrySms = await tool("CAsmsfail", "send_booking_link", { channel: "text" });
assert(retrySms.sms === false, "failed send was retried");
assert(texts.length === textsBeforeFail + 1, `failed send posts ${texts.length - textsBeforeFail}`);
recordCallerUtterance("CAsmsfail", "Text me the link.");
await hangup("CAsmsfail");
await hangup("CAsmsfail");
assert(forms.length === formsBeforeFail + 1, `sms failure double-posted ${forms.length - formsBeforeFail}`);
assert(written.length === rowsBeforeFail + 1, `sms failure skipped the log ${written.length - rowsBeforeFail}`);
assert(row(written.length - 1)[9] === "no", "failed text was recorded as sent");
smsStatus = 201;

sheetStatus = 500;
const formsBeforeLog = forms.length;
const rowsBeforeLog = written.length;
const triesBeforeLog = sheetTries;
await inbound("CAlogfail");
await tool("CAlogfail", "log_qualification", { name: "Ada", business: "Example Shop", need: "A new site" });
recordCallerUtterance("CAlogfail", "We need a site.");
await hangup("CAlogfail");
assert(forms.length === formsBeforeLog + 1, "log failure skipped formspree");
assert(written.length === rowsBeforeLog, "failed append was stored as a row");
assert(sheetTries === triesBeforeLog + 1, "log failure did not try");
await hangup("CAlogfail");
assert(forms.length === formsBeforeLog + 1, `log failure double-posted ${forms.length - formsBeforeLog}`);
assert(sheetTries === triesBeforeLog + 2, "failed log did not retry on the next hangup");
sheetStatus = 200;
await hangup("CAlogfail");
assert(forms.length === formsBeforeLog + 1, "log retry double-posted formspree");
assert(written.length === rowsBeforeLog + 1, `log retry rows ${written.length - rowsBeforeLog}`);
await hangup("CAlogfail");
assert(written.length === rowsBeforeLog + 1, "log success appended twice");
assert(sheetTries === triesBeforeLog + 3, `extra sheet try ${sheetTries - triesBeforeLog}`);

formStatus = 500;
process.env.GITHUB_TOKEN = "test-token";
const formsBeforeEmail = forms.length;
const putsBefore = githubPuts;
const rowsBeforeEmail = written.length;
await inbound("CAemailfail");
recordCallerUtterance("CAemailfail", "We need a site.");
await hangup("CAemailfail");
assert(forms.length === formsBeforeEmail + 1, "formspree failure did not post");
assert(githubPuts === putsBefore + 3, `backup puts ${githubPuts - putsBefore}`);
assert(written.length === rowsBeforeEmail + 1, "formspree failure skipped the log");
formStatus = 200;
await hangup("CAemailfail");
assert(forms.length === formsBeforeEmail + 2, "formspree failure was latched as sent");
assert(githubPuts === putsBefore + 3, "successful retry wrote the client files");
assert(written.length === rowsBeforeEmail + 1, "formspree retry appended the log again");
delete process.env.GITHUB_TOKEN;

delete process.env.PEAK_VOICE_MODE;
const textsBeforeLegacy = texts.length;
const rowsBeforeLegacy = written.length;
const formsBeforeLegacy = forms.length;
await inbound("CAlegacy");
const legacySms = await tool("CAlegacy", "send_booking_link", { channel: "text" });
assert(legacySms.sms === false, "legacy mode sent a text");
recordCallerUtterance("CAlegacy", "Hello.");
await hangup("CAlegacy");
assert(texts.length === textsBeforeLegacy, "legacy hangup sent a text");
assert(written.length === rowsBeforeLegacy, "legacy hangup wrote the receptionist log");
assert(forms.length === formsBeforeLegacy + 1, "legacy hangup skipped formspree");

process.env.PEAK_VOICE_MODE = "agent";
delete process.env.PEAK_CALL_LOG_SHEET_ID;
const triesBeforeOff = sheetTries;
await inbound("CAnolog");
recordCallerUtterance("CAnolog", "Hello.");
await hangup("CAnolog");
assert(sheetTries === triesBeforeOff, "log wrote without sheet config");
enableLog();

armHold();
holdSms = true;
await inbound("CAparallel");
const textsBeforeParallel = texts.length;
const parallel = Promise.all([
  tool("CAparallel", "send_booking_link", { channel: "text" }),
  tool("CAparallel", "send_booking_link", { channel: "text" }),
]);
const parallelDeadline = Date.now() + 1000;
while (texts.length < textsBeforeParallel + 1 && Date.now() < parallelDeadline) {
  await new Promise((r) => setTimeout(r, 10));
}
assert(texts.length === textsBeforeParallel + 1, `parallel in flight ${texts.length - textsBeforeParallel}`);
assert(texts.at(-1)?.to === CALLER, texts.at(-1)?.to || "");
clearHold();
const parallelResults = await parallel;
assert(parallelResults.filter((item) => item.sms).length === 1, JSON.stringify(parallelResults));
assert(texts.length === textsBeforeParallel + 1, `parallel texts ${texts.length - textsBeforeParallel}`);

armHold();
holdHangup = true;
const formsAtOverlap = forms.length;
const triesAtOverlap = sheetTries;
const rowsAtOverlap = written.length;
await inbound("CAoverlap");
recordCallerUtterance("CAoverlap", "Hello.");
const overlap = Promise.all([hangup("CAoverlap"), hangup("CAoverlap")]);
const overlapDeadline = Date.now() + 1000;
while ((forms.length < formsAtOverlap + 1 || sheetTries < triesAtOverlap + 1) && Date.now() < overlapDeadline) {
  await new Promise((r) => setTimeout(r, 10));
}
assert(forms.length === formsAtOverlap + 1, `overlap formspree ${forms.length - formsAtOverlap}`);
assert(sheetTries === triesAtOverlap + 1, `overlap sheet ${sheetTries - triesAtOverlap}`);
clearHold();
await overlap;
assert(forms.length === formsAtOverlap + 1, "overlap released a second formspree");
assert(sheetTries === triesAtOverlap + 1, "overlap released a second append");
assert(written.length === rowsAtOverlap + 1, `overlap rows ${written.length - rowsAtOverlap}`);
await hangup("CAoverlap");
assert(forms.length === formsAtOverlap + 1, "overlap follow-up posted formspree");
assert(sheetTries === triesAtOverlap + 1, "overlap follow-up appended");

outbound.resetOutboundForTest();
process.env.PEAK_OUTBOUND_ENABLED = "1";
process.env.PEAK_OUTBOUND_SECRET = "test-secret-not-real";
process.env.PEAK_OUTBOUND_FROM = "+17205550198";
process.env.PEAK_SMS_ENABLED = "1";
const textsBeforeOutbound = texts.length;
const outboundRes = await fetch(`http://127.0.0.1:${port}/api/voice/outbound`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    [outbound.OUTBOUND_SECRET_HEADER]: "test-secret-not-real",
  },
  body: JSON.stringify({
    to_number: "+13035550100",
    business_name: "Example Shop",
    task: "a table at 7",
    callback_name: "Brian",
  }),
});
assert(outboundRes.status === 200, `outbound ${outboundRes.status} ${await outboundRes.text()}`);
assert(callCreates === 1, `outbound creates ${callCreates}`);
assert(texts.length === textsBeforeOutbound, "outbound path sent a text");
delete process.env.PEAK_OUTBOUND_ENABLED;

await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
console.log("peak-sms-log.test.ts ok");
