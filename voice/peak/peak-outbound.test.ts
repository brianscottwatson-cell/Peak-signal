/**
 * Outbound Peak booking calls.
 * Run from the repo root:
 *   node --experimental-strip-types voice/peak/peak-outbound.test.ts
 *
 * Numbers in this file are reserved test ranges, not a personal cell.
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
process.env.PEAK_OUTBOUND_RECORDING_WAIT_MS = "0";
process.env.PEAK_OUTBOUND_SECRET = "test-secret-not-real";
process.env.PEAK_OUTBOUND_FROM = "+17205550199";
process.env.TWILIO_ACCOUNT_SID = "ACtest";
process.env.TWILIO_AUTH_TOKEN = "test-token";
process.env.PEAK_OUTBOUND_PER_MINUTE = "30";
process.env.PEAK_OUTBOUND_PER_DAY = "30";
delete process.env.PEAK_OUTBOUND_ENABLED;
delete process.env.PEAK_VOICE_MODE;
delete process.env.PEAK_VOICE;
delete process.env.PEAK_FORWARD_TO;
delete process.env.PEAK_FORMSPREE;

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const FROM = "+17205550199";
const TO = "+13035550100";
const SECRET = "test-secret-not-real";
const TASK = "table for 2 at 7pm Fri under Brian";
const BOOKING = {
  to_number: TO,
  business_name: "The Green Fork",
  task: TASK,
  alternates_window: "Friday 6pm to 9pm",
  callback_name: "Brian",
};

await register(new URL("../cht/esm-resolve-ts.mjs", import.meta.url));
const { default: express } = await import("express");
const { voiceAraRouter, inboundVoice } = await import("../voice-ara.ts");
const { peakVoiceMode } = await import("./peak-prompt.ts");
const outbound = await import("./peak-outbound.ts");

const {
  OUTBOUND_INBOX,
  OUTBOUND_SECRET_HEADER,
  amdSaysMachine,
  authorizeOutbound,
  buildOutboundGreeting,
  buildOutboundInstructions,
  containsPersonalData,
  isUsE164,
  looksLikeIvr,
  looksLikeMachineOrIvr,
  looksLikeVoicemail,
  outboundSessionFor,
  outboundTokenFor,
  resetOutboundForTest,
  secretsMatch,
  setOutboundNowForTest,
  applyOutboundReport,
  handleOutboundCallerLine,
} = outbound;

assert(secretsMatch("same-secret", "same-secret"), "equal secrets match");
assert(!secretsMatch("short", "much-longer-secret"), "different lengths do not throw");
assert(!authorizeOutbound("", ""), "empty secret is not authorized");
assert(!authorizeOutbound("test-secret-not-real", ""), "missing expected secret fails");
assert(authorizeOutbound(SECRET, SECRET), "matching secret is authorized");
assert(!authorizeOutbound("nope", SECRET), "wrong secret is rejected");

assert(isUsE164(TO), TO);
assert(isUsE164(FROM), FROM);
assert(!isUsE164("+442071234567"), "UK number is not US");
assert(!isUsE164("3035550100"), "bare digits are not E.164");
assert(!isUsE164("+1 303 555 0100"), "formatted numbers are not E.164");
assert(!isUsE164("+15551234567"), "exchange cannot start with 1");
assert(!isUsE164("+19115550100"), "N11 area codes are rejected");

assert(!containsPersonalData(TASK), "booking task was flagged as personal data");
assert(!containsPersonalData("Friday 6pm to 9pm"), "window was flagged");
assert(!containsPersonalData("The Green Fork"), "business name was flagged");
assert(containsPersonalData("call +13035550123 tomorrow"), "phone in task");
assert(containsPersonalData("owner@restaurant.com"), "email in task");
assert(containsPersonalData("card 4111 1111 1111 1111"), "card in task");
assert(containsPersonalData("123 Main Street at 7"), "street address in task");

assert(looksLikeVoicemail("Please leave a message after the beep."), "voicemail cue");
assert(looksLikeIvr("Press 1 for reservations."), "ivr cue");
assert(looksLikeMachineOrIvr("Your call is important to us. Main menu."), "queue cue");
assert(!looksLikeMachineOrIvr("Yes, we can do 7pm for two under Brian."), "human confirmation");
assert(amdSaysMachine("machine_start"), "machine_start");
assert(amdSaysMachine("machine_end_beep"), "machine_end_beep");
assert(amdSaysMachine("fax"), "fax");
assert(!amdSaysMachine("human") && !amdSaysMachine("unknown") && !amdSaysMachine(""), "human stays on the line");

const prompt = buildOutboundInstructions({
  callbackName: "Brian",
  businessName: "The Green Fork",
  task: TASK,
  alternatesWindow: "Friday 6pm to 9pm",
});
const greeting = buildOutboundGreeting({ callbackName: "Brian", task: TASK });
assert(greeting.includes("Brian's assistant"), greeting);
assert(greeting.includes(TASK), greeting);
assert(prompt.includes("Brian's assistant"), "prompt intro");
assert(prompt.includes("Friday 6pm to 9pm"), "prompt window");
assert(prompt.includes("read the confirmed details back"), "prompt confirm");
assert(prompt.includes("goodbye"), prompt);
assert(prompt.includes("Never share a phone number"), prompt);
assert(prompt.includes("card"), prompt);
assert(prompt.includes("address"), prompt);
assert(!prompt.includes(TO) && !prompt.includes(FROM), "prompt contains a phone number");
assert(!prompt.includes("@"), "prompt contains an email address");
assert(!prompt.includes("PEAK_VOICE_MODE"), "prompt mentions voice mode");

assert(peakVoiceMode() === "legacy", "PEAK_VOICE_MODE default changed");
const legacy = inboundVoice();
assert(legacy.peak === false, "inbound default is no longer legacy");
assert(legacy.voice === "ara", legacy.voice);

const source = readFileSync(join("voice", "peak", "peak-outbound.ts"), "utf8");
assert(!source.includes("+19706605088"), "outbound hardcodes the Peak caller id");
assert(!/\+1\d{10}/.test(source), "outbound hardcodes a phone number");
assert(!source.includes("PEAK_VOICE_MODE"), "outbound reads PEAK_VOICE_MODE");
assert(!source.includes("PEAK_CALLER_ID"), "outbound borrows the forward caller id");
assert(!/brianscottwatson/i.test(source), "outbound contains a personal email");
assert(!source.includes("retry") || source.includes("does not redial") || source.includes("not a queue"), "retry wording");
assert(!/\bwhile\s*\(true\)/.test(source), "outbound has an infinite retry loop");

type Mail = {
  url: string;
  subject: string;
  message: string;
  email: string;
  cc: string;
  interest: string;
  phone: string;
};
type TwilioHit = { url: string; body: URLSearchParams; auth: string };

const emails: Mail[] = [];
const twilioHits: TwilioHit[] = [];
let twilioCreateStatus = 201;
let twilioCreateSeq = 0;

const realFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.includes("formspree.io")) {
    const payload = JSON.parse(String(init?.body || "{}")) as Record<string, string>;
    emails.push({
      url,
      subject: String(payload._subject || ""),
      message: String(payload.message || ""),
      email: String(payload.email || ""),
      cc: String(payload._cc || ""),
      interest: String(payload.interest || ""),
      phone: String(payload.phone || ""),
    });
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  }
  if (url.includes("api.twilio.com")) {
    const headers = init?.headers;
    let auth = "";
    if (headers && !Array.isArray(headers) && !(headers instanceof Headers)) {
      auth = String((headers as Record<string, string>).Authorization || "");
    }
    const body = new URLSearchParams(String(init?.body || ""));
    twilioHits.push({ url, body, auth });
    if (url.endsWith("/Calls.json")) {
      twilioCreateSeq += 1;
      if (twilioCreateStatus !== 201) {
        return new Response(JSON.stringify({ message: "nope" }), { status: twilioCreateStatus });
      }
      return new Response(JSON.stringify({ sid: `CA${String(twilioCreateSeq).padStart(32, "0")}` }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.endsWith("/Recordings.json")) {
      return new Response(JSON.stringify({ sid: "RE123" }), { status: 201, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ status: "completed" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  return realFetch(input, init);
};

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use("/api/voice", voiceAraRouter);
const server = await new Promise<import("node:http").Server>((resolve) => {
  const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
});
const addr = server.address();
const port = typeof addr === "object" && addr ? addr.port : 0;

function callsCreated(): TwilioHit[] {
  return twilioHits.filter((hit) => hit.url.endsWith("/Calls.json"));
}

async function postJson(body: unknown, secret?: string, raw?: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret != null) headers[OUTBOUND_SECRET_HEADER] = secret;
  const res = await fetch(`http://127.0.0.1:${port}/api/voice/outbound`, {
    method: "POST",
    headers,
    body: raw ?? JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function postForm(path: string, params: Record<string, string>): Promise<{ status: number; text: string }> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  return { status: res.status, text: await res.text() };
}

async function place(body: Record<string, unknown> = BOOKING): Promise<string> {
  const res = await postJson(body, SECRET);
  assert(res.status === 200, `place ${res.status} ${JSON.stringify(res.json)}`);
  const sid = String(res.json.call_sid || "");
  assert(sid.startsWith("CA"), sid);
  assert(res.json.to_number === body.to_number, JSON.stringify(res.json));
  assert(!JSON.stringify(res.json).includes(SECRET), "response leaked the secret");
  assert(!JSON.stringify(res.json).includes(FROM), "response leaked the from number");
  return sid;
}

function tokenPath(path: string, sid: string): string {
  const token = outboundTokenFor(sid);
  assert(token.length > 20, "missing callback token");
  return `${path}?token=${encodeURIComponent(token)}`;
}

try {
  resetOutboundForTest();
  const before = callsCreated().length;

  for (const flag of [undefined, "0", "true", "yes"] as const) {
    if (flag == null) delete process.env.PEAK_OUTBOUND_ENABLED;
    else process.env.PEAK_OUTBOUND_ENABLED = flag;
    const off = await postJson(BOOKING, SECRET);
    assert(off.status === 404 || off.status === 403, `flag ${String(flag)} status ${off.status}`);
    const junk = await postJson(BOOKING, "wrong-secret", "{");
    assert(junk.status === 404 || junk.status === 403, `flag ${String(flag)} hid invalid json ${junk.status}`);
  }
  assert(callsCreated().length === before, "flag off placed a call");
  assert(emails.length === 0, "flag off emailed");

  process.env.PEAK_OUTBOUND_ENABLED = "1";
  const missing = await postJson(BOOKING);
  assert(missing.status === 401, `missing secret ${missing.status}`);
  const wrong = await postJson(BOOKING, "not-the-secret");
  assert(wrong.status === 401, `wrong secret ${wrong.status}`);
  const previous = process.env.PEAK_OUTBOUND_SECRET;
  process.env.PEAK_OUTBOUND_SECRET = "";
  const unset = await postJson(BOOKING, SECRET);
  assert(unset.status === 401, `unset secret ${unset.status}`);
  process.env.PEAK_OUTBOUND_SECRET = previous;
  assert(callsCreated().length === before, "rejected auth placed a call");

  const badBodies: Array<{ body: Record<string, unknown>; error: string }> = [
    { body: { ...BOOKING, to_number: "+442071234567" }, error: "invalid_number" },
    { body: { ...BOOKING, to_number: "3035550100" }, error: "invalid_number" },
    { body: { ...BOOKING, to_number: "+15551234567" }, error: "invalid_number" },
    { body: { ...BOOKING, to_number: "+19115550100" }, error: "invalid_number" },
    { body: { ...BOOKING, business_name: "  " }, error: "invalid_business_name" },
    { body: { ...BOOKING, task: "" }, error: "invalid_task" },
    { body: { ...BOOKING, callback_name: "Brian Watson" }, error: "invalid_callback_name" },
    { body: { ...BOOKING, callback_name: "Brian2" }, error: "invalid_callback_name" },
    { body: { ...BOOKING, alternates_window: 7 }, error: "invalid_alternates_window" },
    { body: { ...BOOKING, task: "call +13035550123 tomorrow" }, error: "personal_data" },
    { body: { ...BOOKING, business_name: "owner@restaurant.com" }, error: "personal_data" },
    { body: { ...BOOKING, alternates_window: "123 Main Street" }, error: "personal_data" },
    { body: { ...BOOKING, to_number: FROM }, error: "same_number" },
  ];
  for (const item of badBodies) {
    const res = await postJson(item.body, SECRET);
    assert(res.status === 400, `${item.error} status ${res.status} ${JSON.stringify(res.json)}`);
    assert(res.json.error === item.error, `${item.error} got ${String(res.json.error)}`);
  }
  const badJson = await postJson(BOOKING, SECRET, "{");
  assert(badJson.status === 400, `invalid json ${badJson.status}`);
  assert(callsCreated().length === before, "invalid input placed a call");

  delete process.env.PEAK_OUTBOUND_FROM;
  const noFrom = await postJson(BOOKING, SECRET);
  assert(noFrom.status === 503, `missing from ${noFrom.status}`);
  process.env.PEAK_OUTBOUND_FROM = "+442071234567";
  const badFrom = await postJson(BOOKING, SECRET);
  assert(badFrom.status === 503, `non-US from ${badFrom.status}`);
  process.env.PEAK_OUTBOUND_FROM = FROM;
  delete process.env.TWILIO_ACCOUNT_SID;
  const noSid = await postJson(BOOKING, SECRET);
  assert(noSid.status === 503, `missing twilio sid ${noSid.status}`);
  process.env.TWILIO_ACCOUNT_SID = "ACtest";
  assert(callsCreated().length === before, "misconfigured outbound placed a call");

  twilioCreateStatus = 500;
  const failed = await postJson(BOOKING, SECRET);
  assert(failed.status === 502, `twilio failure ${failed.status}`);
  assert(callsCreated().length === before + 1, `failure retried ${callsCreated().length - before}`);
  assert(emails.length === 0, "failed dial emailed");
  twilioCreateStatus = 201;
  const recovered = await place();
  assert(recovered.startsWith("CA"), recovered);
  assert(callsCreated().length === before + 2, "manual follow-up was treated as an automatic retry loop");

  const created = callsCreated().at(-1);
  assert(created, "missing create");
  assert(created.body.get("To") === TO, created.body.get("To") || "");
  assert(created.body.get("From") === FROM, created.body.get("From") || "");
  assert(created.body.get("MachineDetection") === "Enable", created.body.get("MachineDetection") || "");
  assert(created.body.get("MachineDetectionTimeout") === "30", "amd timeout");
  assert(!created.body.has("AsyncAmd"), "async amd would talk over voicemail");
  assert(created.body.get("TimeLimit") === "240", created.body.get("TimeLimit") || "");
  assert(String(created.body.get("Url")).startsWith("https://voice-test.example/api/voice/outbound/twiml?token="), created.body.get("Url") || "");
  assert(String(created.body.get("StatusCallback")).includes("/api/voice/outbound/status?token="), created.body.get("StatusCallback") || "");
  const events = created.body.getAll("StatusCallbackEvent").sort().join(",");
  assert(events === "answered,completed,initiated,ringing", events);
  const decoded = Buffer.from(created.auth.replace(/^Basic\s+/, ""), "base64").toString("utf8");
  assert(decoded === "ACtest:test-token", "twilio basic auth");
  assert(emails.length === 0, "dial emailed before the call ended");

  const session = outboundSessionFor(recovered);
  assert(session, "missing session");
  const sessionText = JSON.stringify(session);
  assert(!sessionText.includes(TO) && !sessionText.includes(FROM), sessionText);
  assert(session.voice === "ara", session.voice);
  assert(session.greeting.includes("Brian's assistant"), session.greeting);
  assert(session.tools.some((tool) => tool.name === "report_outcome"), "missing report tool");

  resetOutboundForTest();
  emails.length = 0;
  const rateBefore = callsCreated().length;
  process.env.PEAK_OUTBOUND_PER_MINUTE = "1";
  process.env.PEAK_OUTBOUND_PER_DAY = "2";
  let clock = 1_700_000_000_000;
  setOutboundNowForTest(() => clock);
  const first = await place();
  assert(first.startsWith("CA"), first);
  const limited = await postJson(BOOKING, SECRET);
  assert(limited.status === 429, `minute limit ${limited.status}`);
  assert(limited.json.limit === "minute", JSON.stringify(limited.json));
  const minute = await fetch(`http://127.0.0.1:${port}/api/voice/outbound`, {
    method: "POST",
    headers: { "Content-Type": "application/json", [OUTBOUND_SECRET_HEADER]: SECRET },
    body: JSON.stringify(BOOKING),
  });
  assert(minute.status === 429, `retry header status ${minute.status}`);
  const retry = Number(minute.headers.get("retry-after") || "0");
  assert(retry >= 1 && retry <= 60, `retry-after ${retry}`);
  assert(callsCreated().length === rateBefore + 1, "limited request dialed");

  clock += 61_000;
  const second = await place();
  assert(second !== first, "day limit reused a sid");
  clock += 61_000;
  const day = await postJson(BOOKING, SECRET);
  assert(day.status === 429, `day limit ${day.status}`);
  assert(day.json.limit === "day", JSON.stringify(day.json));
  const dayRes = await fetch(`http://127.0.0.1:${port}/api/voice/outbound`, {
    method: "POST",
    headers: { "Content-Type": "application/json", [OUTBOUND_SECRET_HEADER]: SECRET },
    body: JSON.stringify(BOOKING),
  });
  assert(dayRes.status === 429, "day status");
  assert(Number(dayRes.headers.get("retry-after") || "0") > 60, "day retry should exceed a minute");
  assert(callsCreated().length === rateBefore + 2, `day limit dialed ${callsCreated().length - rateBefore}`);

  const invalidDuringLimit = await postJson({ ...BOOKING, to_number: "+442071234567" }, SECRET);
  assert(invalidDuringLimit.status === 400, "validation should not be hidden by the limiter");
  clock += 86_400_000;
  const afterDay = await place();
  assert(afterDay.startsWith("CA"), "rolling day window did not reopen");

  setOutboundNowForTest(null);
  process.env.PEAK_OUTBOUND_PER_MINUTE = "30";
  process.env.PEAK_OUTBOUND_PER_DAY = "30";
  resetOutboundForTest();
  emails.length = 0;

  async function finish(sid: string, status: string, extra: Record<string, string> = {}) {
    return postForm(tokenPath("/api/voice/outbound/status", sid), { CallSid: sid, CallStatus: status, ...extra });
  }

  function expectMail(label: string, needle: string, details: string, recording: string) {
    assert(emails.length === 1, `${label} emails ${emails.length}`);
    const mail = emails[0];
    assert(mail.url === "https://formspree.io/f/mgobgrlr", mail.url);
    assert(mail.email === OUTBOUND_INBOX, mail.email);
    assert(mail.cc === "" || mail.cc === OUTBOUND_INBOX, mail.cc);
    assert(mail.interest === "outbound-voice", mail.interest);
    assert(mail.phone === TO, mail.phone);
    assert(mail.subject.includes(needle), mail.subject);
    assert(mail.message.includes(`Outcome: ${needle}`), mail.message);
    assert(mail.message.includes(`Confirmed: ${details}`), mail.message);
    assert(mail.message.includes(`Recording: ${recording}`), mail.message);
    assert(mail.message.includes(`Inbox: ${OUTBOUND_INBOX}`), mail.message);
    assert(mail.message.includes("CallSid: CA"), mail.message);
    assert(mail.message.includes("The Green Fork"), mail.message);
    assert(mail.message.includes(TASK), mail.message);
  }

  const booked = await place();
  const human = await postForm(tokenPath("/api/voice/outbound/twiml", booked), { CallSid: booked, AnsweredBy: "human" });
  assert(human.status === 200, human.text);
  assert(human.text.includes("<Stream"), human.text);
  assert(human.text.includes(`/api/voice/outbound/stream/${booked}`), human.text);
  assert(!human.text.includes("<Hangup"), human.text);
  const recordings = twilioHits.filter((hit) => hit.url.endsWith("/Recordings.json"));
  assert(recordings.length === 1, `recording starts ${recordings.length}`);
  assert(recordings[0].body.get("RecordingChannels") === "dual", "recording channels");
  assert(String(recordings[0].body.get("RecordingStatusCallback")).includes("/api/voice/outbound/recording?token="), "recording callback");
  assert(String(recordings[0].body.get("RecordingStatusCallbackEvent")).includes("completed"), "recording events");
  const reported = applyOutboundReport(booked, { outcome: "booked", details: "Friday 7pm, party of 2, under Brian" });
  assert(reported.ok && reported.outcome === "booked", JSON.stringify(reported));
  const early = await finish(booked, "ringing");
  assert(early.status === 200, "ringing");
  assert(emails.length === 0, "ringing emailed");
  const rec = await postForm(tokenPath("/api/voice/outbound/recording", booked), {
    CallSid: booked,
    RecordingStatus: "completed",
    RecordingUrl: "https://api.twilio.com/2010-04-01/Accounts/ACtest/Recordings/RE123",
  });
  assert(rec.status === 200, "recording callback");
  assert(emails.length === 0, "recording emailed before hangup");
  const done = await finish(booked, "completed");
  assert(done.status === 200, "completed");
  expectMail("booked", "booked", "Friday 7pm, party of 2, under Brian", "https://api.twilio.com/2010-04-01/Accounts/ACtest/Recordings/RE123.mp3");
  await finish(booked, "completed");
  await postForm(tokenPath("/api/voice/outbound/recording", booked), {
    CallSid: booked,
    RecordingStatus: "completed",
    RecordingUrl: "https://api.twilio.com/2010-04-01/Accounts/ACtest/Recordings/RE123",
  });
  assert(emails.length === 1, "booked dedupe failed");

  emails.length = 0;
  const alternate = await place();
  applyOutboundReport(alternate, { outcome: "alternate_offered", details: "Friday 8pm, party of 2, under Brian" });
  await finish(alternate, "completed");
  expectMail("alternate", "alternate offered", "Friday 8pm, party of 2, under Brian", "(none)");
  await finish(alternate, "completed");
  assert(emails.length === 1, "alternate dedupe failed");

  emails.length = 0;
  const declined = await place();
  applyOutboundReport(declined, { outcome: "declined", details: "No tables left Friday" });
  await finish(declined, "completed");
  expectMail("declined", "declined", "No tables left Friday", "(none)");
  await finish(declined, "completed");
  assert(emails.length === 1, "declined dedupe failed");

  emails.length = 0;
  const missed = await place();
  const ringing = await finish(missed, "ringing");
  assert(ringing.status === 200, "no-answer ringing");
  assert(emails.length === 0, "no-answer progress emailed");
  await finish(missed, "no-answer");
  expectMail("no answer", "no answer", "(none)", "(none)");
  assert(emails[0].message.includes("twilio no-answer"), emails[0].message);
  await finish(missed, "completed");
  assert(emails.length === 1, "no-answer dedupe failed");
  assert(emails[0].message.includes("Outcome: no answer"), emails[0].message);

  emails.length = 0;
  const machine = await place();
  const machineBefore = twilioHits.filter((hit) => hit.url.endsWith("/Recordings.json")).length;
  const machineXml = await postForm(tokenPath("/api/voice/outbound/twiml", machine), { CallSid: machine, AnsweredBy: "machine_start" });
  assert(machineXml.text.includes("<Hangup"), machineXml.text);
  assert(!machineXml.text.includes("<Stream"), machineXml.text);
  assert(twilioHits.filter((hit) => hit.url.endsWith("/Recordings.json")).length === machineBefore, "voicemail started a stream recording");
  await finish(machine, "completed", { AnsweredBy: "machine_start" });
  expectMail("voicemail", "voicemail", "(none)", "(none)");
  assert(emails[0].message.includes("Detection: answering machine"), emails[0].message);
  await finish(machine, "completed");
  assert(emails.length === 1, "voicemail dedupe failed");

  emails.length = 0;
  const fax = await place();
  const faxXml = await postForm(tokenPath("/api/voice/outbound/twiml", fax), { CallSid: fax, AnsweredBy: "fax" });
  assert(faxXml.text.includes("<Hangup"), faxXml.text);
  await finish(fax, "completed");
  expectMail("fax", "voicemail", "(none)", "(none)");
  assert(emails[0].message.includes("Detection: fax"), emails[0].message);

  emails.length = 0;
  const ivr = await place();
  const ivrTwiml = await postForm(tokenPath("/api/voice/outbound/twiml", ivr), { CallSid: ivr, AnsweredBy: "unknown" });
  assert(ivrTwiml.text.includes("<Stream"), ivrTwiml.text);
  const humanLine = await handleOutboundCallerLine(ivr, "Yes, we can do 7pm for two under Brian.");
  assert(!humanLine.hangup && humanLine.outcome === "", JSON.stringify(humanLine));
  const hangupsBefore = twilioHits.filter((hit) => hit.url.endsWith(`/${ivr}.json`)).length;
  const heard = await handleOutboundCallerLine(ivr, "Press 1 for reservations. Please leave a message after the beep.");
  assert(heard.hangup && heard.outcome === "voicemail", JSON.stringify(heard));
  const hangups = twilioHits.filter((hit) => hit.url.endsWith(`/${ivr}.json`));
  assert(hangups.length === hangupsBefore + 1, `ivr hangup count ${hangups.length}`);
  assert(hangups.at(-1)?.body.get("Status") === "completed", "ivr did not hang up");
  const again = await handleOutboundCallerLine(ivr, "Press 2 for a person.");
  assert(!again.hangup, "second ivr line placed another action");
  assert(twilioHits.filter((hit) => hit.url.endsWith(`/${ivr}.json`)).length === hangups.length, "ivr redialed or rehung");
  await finish(ivr, "completed");
  expectMail("ivr", "voicemail", "(none)", "(none)");
  assert(emails[0].message.includes("Detection: ivr") || emails[0].message.includes("Detection: voicemail greeting"), emails[0].message);
  await finish(ivr, "completed");
  assert(emails.length === 1, "ivr dedupe failed");

  const stranger = await postForm("/api/voice/outbound/status?token=not-a-real-token", { CallSid: "CAnotreal", CallStatus: "completed" });
  assert(stranger.status === 404, `open status ${stranger.status}`);
  assert(emails.length === 1, "unknown token emailed");

  const createsAtEnd = callsCreated().length;
  const inbound = await postForm("/api/voice", { CallSid: "CAinbound", From: "+15551230000", To: "+19706605088", Called: "+19706605088" });
  assert(inbound.status === 200, inbound.text);
  assert(inbound.text.includes("<Stream"), inbound.text);
  assert(inbound.text.includes("/api/voice/stream/CAinbound"), inbound.text);
  assert(!inbound.text.includes("/outbound/"), inbound.text);
  assert(!inbound.text.includes("<Dial"), inbound.text);
  assert(callsCreated().length === createsAtEnd, "inbound placed an outbound call");
  assert(peakVoiceMode() === "legacy", "inbound test changed the voice mode default");

  console.log("peak-outbound.test.ts ok");
} finally {
  setOutboundNowForTest(null);
  resetOutboundForTest();
  server.close();
  globalThis.fetch = realFetch;
}
