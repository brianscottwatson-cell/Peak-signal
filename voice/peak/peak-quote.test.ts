/**
 * Quote mode on the outbound route.
 * Run from the repo root:
 *   node --experimental-strip-types voice/peak/peak-quote.test.ts
 *
 * Numbers here are reserved 555-01xx test ranges, not real lines.
 * Fetch is stubbed. Nothing in this file dials Twilio or Lookup.
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
process.env.PEAK_OUTBOUND_FROM = "+17205550198";
process.env.TWILIO_ACCOUNT_SID = "ACtest";
process.env.TWILIO_AUTH_TOKEN = "test-token";
process.env.PEAK_OUTBOUND_PER_MINUTE = "30";
process.env.PEAK_OUTBOUND_PER_DAY = "30";
delete process.env.PEAK_OUTBOUND_ENABLED;
delete process.env.PEAK_VOICE_MODE;
delete process.env.PEAK_VOICE;
delete process.env.PEAK_FORWARD_TO;
delete process.env.PEAK_FORMSPREE;
delete process.env.PEAK_OUTBOUND_QUOTE_ALLOWLIST;
delete process.env.PEAK_OUTBOUND_DNC;
delete process.env.PEAK_OUTBOUND_QUOTE_TIME_LIMIT_SEC;
delete process.env.PEAK_OUTBOUND_APPROVAL_TTL_SEC;
delete process.env.PEAK_OUTBOUND_CALLBACK_NUMBER;
delete process.env.PEAK_OUTBOUND_MENTION_MAIN_LINE;
delete process.env.PEAK_OUTBOUND_IDENTITY;
delete process.env.PEAK_OUTBOUND_IDENTITIES;
delete process.env.PEAK_OUTBOUND_LEAVE_VOICEMAIL;

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const FROM = "+17205550198";
const TO = "+15555550100";
const OTHER = "+15555550101";
const DNC = "+15555550102";
const CALLBACK = "+15555550177";
const SECRET = "test-secret-not-real";
const TASK = "a two-bedroom local move next month";
const PEAK_FIRST = "Hi, this is an AI assistant calling for Brian at Peak Signal, and this call is recorded.";
const PEAK_GREETING = `${PEAK_FIRST} I'm calling to ask for rates on a two-bedroom local move next month.`;
const PEAK_PLAN_LOG_5 = `who=Brian at Peak Signal source=not provided cap=5 minutes voicemail=no commit=never opening=${PEAK_GREETING}`;
const PEAK_PLAN_LOG_7 = `who=Brian at Peak Signal source=not provided cap=7 minutes voicemail=no commit=never opening=${PEAK_GREETING}`;
const GREETING = "Hi, this is an AI assistant calling for Justin and Heather at Colorado Hot Tub, and this call is recorded. I'm calling to ask for rates on a two-bedroom local move next month.";
const DESK_GREETING = "Hi, this is an AI assistant calling for Alex Rivera at Example Desk, and this call is recorded. I'm calling to ask for rates on a two-bedroom local move next month.";
const PLAN_QUESTIONS = [
  "Questions:",
  "- hourly or flat rate",
  "- crew size",
  "- minimum hours and travel charge",
  "- same-day availability and notice needed",
  "- insurance and certificate of insurance",
  "- on-call interest",
  "- person spoken to",
  "- callback preference",
].join("\n");
function peakPlan(cap: string, warning = "(none)", to = TO, source = "not provided"): string {
  return [
    "Who: An AI assistant calling for Brian at Peak Signal.",
    `Destination: ${to}`,
    `Number source: ${source}`,
    `Line warning: ${warning}`,
    `Opening line: ${PEAK_GREETING}`,
    PLAN_QUESTIONS,
    `Limits: ${cap}. Never book, pay, give card details, put down a deposit, sign up, or agree to terms. Do not leave voicemail.`,
  ].join("\n");
}
const BOOK_GREETING = "This call may be recorded. Hi, this is Brian's assistant. I'm calling to book table for 2 at 7pm Friday.";
const ISSUED_AT = "2023-11-14T22:13:20.000Z";
const TTL_DEFAULT_AT = "2023-11-14T22:43:20.000Z";
const TTL_120_AT = "2023-11-14T22:15:20.000Z";
const MOBILE_WARNING = "Line type is mobile. This number is flagged as risky because calls to cell numbers can require prior express consent.";
const UNKNOWN_WARNING = "Line type could not be determined. Treated as risky.";
const VOIP_WARNING = "Line type is nonFixedVoip. This number is not a confirmed landline. Treated as risky.";

assert(new Date(1_700_000_000_000).toISOString() === ISSUED_AT, "clock anchor moved");
assert(new Date(1_700_001_800_000).toISOString() === TTL_DEFAULT_AT, "default ttl anchor moved");
assert(new Date(1_700_000_120_000).toISOString() === TTL_120_AT, "120s ttl anchor moved");
assert(7 * 60 === 420, "quote default is 7 minutes");

await register(new URL("../cht/esm-resolve-ts.mjs", import.meta.url));
const { default: express } = await import("express");
const { voiceAraRouter } = await import("../voice-ara.ts");
const { peakVoiceMode } = await import("./peak-prompt.ts");
const outbound = await import("./peak-outbound.ts");
const quote = await import("./peak-quote.ts");

const {
  OUTBOUND_INBOX,
  OUTBOUND_SECRET_HEADER,
  applyQuoteReport,
  handleOutboundCallerLine,
  outboundSessionFor,
  outboundTokenFor,
  resetOutboundForTest,
  setOutboundNowForTest,
} = outbound;

const {
  LINE_WARNING_MOBILE,
  LINE_WARNING_UNKNOWN,
  QUOTE_HELLO_CHECK,
  QUOTE_SILENCE_MS,
  approvalTtlSec,
  buildQuoteGreeting,
  buildQuotePlanText,
  callbackPolicy,
  captureQuote,
  classifyLineType,
  initialQuoteTurn,
  normalizeQuoteOutcome,
  numberList,
  quoteOpeningSentence,
  quoteTimeLimitSec,
  reduceQuoteTurn,
  resolveIdentity,
} = quote;

assert(typeof buildQuoteGreeting === "function", "buildQuoteGreeting import is missing");
assert(typeof quoteTimeLimitSec === "function", "quoteTimeLimitSec import is missing");
assert(typeof classifyLineType === "function", "classifyLineType import is missing");
assert(typeof captureQuote === "function", "captureQuote import is missing");
assert(typeof callbackPolicy === "function", "callbackPolicy import is missing");
assert(typeof approvalTtlSec === "function", "approvalTtlSec import is missing");
assert(typeof applyQuoteReport === "function", "applyQuoteReport import is missing");
assert(quoteOpeningSentence("Brian", "Peak Signal") === PEAK_FIRST, quoteOpeningSentence("Brian", "Peak Signal"));
assert(buildQuoteGreeting("Brian", "Peak Signal", TASK) === PEAK_GREETING, buildQuoteGreeting("Brian", "Peak Signal", TASK));
assert(buildQuoteGreeting("Justin and Heather", "Colorado Hot Tub", TASK) === GREETING, buildQuoteGreeting("Justin and Heather", "Colorado Hot Tub", TASK));
assert(QUOTE_SILENCE_MS === 5000, "silence window");
assert(QUOTE_HELLO_CHECK === "Hello?", QUOTE_HELLO_CHECK);
assert(resolveIdentity("", {} as NodeJS.ProcessEnv).ok === true, "default identity missing");
{
  const resolved = resolveIdentity("", {} as NodeJS.ProcessEnv);
  assert(resolved.ok && resolved.identity.business === "Peak Signal" && resolved.identity.contacts === "Brian", "default is Peak Signal for Brian");
  const cht = resolveIdentity("cht", {} as NodeJS.ProcessEnv);
  assert(cht.ok && cht.identity.business === "Colorado Hot Tub" && cht.identity.contacts === "Justin and Heather", "cht stays selectable");
  const configured = resolveIdentity("", { PEAK_OUTBOUND_IDENTITY: "cht" } as NodeJS.ProcessEnv);
  assert(configured.ok && configured.identity.id === "cht", "config can still select cht");
}
assert(normalizeQuoteOutcome({ outcome: "quoted" }) === "quote_received", "quoted alias");
assert(normalizeQuoteOutcome({ outcome: "closed" }) === "wrong_number", "closed is wrong_number");
assert(normalizeQuoteOutcome({ outcome: "partial info" }) === "partial_info", "partial alias");
assert(normalizeQuoteOutcome({ outcome: "ivr" }) === "ivr_only", "ivr alias");
assert(normalizeQuoteOutcome({ outcome: "recorded message" }) === "ivr_only", "recorded message alias");
assert(normalizeQuoteOutcome({ outcome: "callback" }) === "call_back_requested", "callback alias");
assert(normalizeQuoteOutcome({ outcome: "transfer" }) === "transferred", "transfer alias");
assert(normalizeQuoteOutcome({ outcome: "declined" }) === "declined", "declined");
assert(normalizeQuoteOutcome({ outcome: "voicemail" }) === "voicemail", "voicemail");
assert(normalizeQuoteOutcome({ outcome: "no answer" }) === "no answer", "no answer");
{
  const opener = PEAK_GREETING;
  let state = initialQuoteTurn();
  let step = reduceQuoteTurn(state, { type: "session_ready", nowMs: 0 }, opener);
  assert(step.effects.length === 0, "session ready spoke early");
  assert(step.state.openerSent === false, "opener marked sent before hello");
  assert(step.state.silenceArmedAt === 0, "silence was not armed");
  step = reduceQuoteTurn(step.state, { type: "tick", nowMs: 4999 }, opener);
  assert(step.effects.length === 0, "Hello? came before 5 seconds");
  step = reduceQuoteTurn(step.state, { type: "tick", nowMs: 5000 }, opener);
  assert(step.effects.length === 1 && step.effects[0].type === "speak" && step.effects[0].text === "Hello?", JSON.stringify(step.effects));
  assert(step.state.helloCheckSent === true, "hello check not latched");
  const repeat = reduceQuoteTurn(step.state, { type: "tick", nowMs: 20000 }, opener);
  assert(repeat.effects.length === 0, "Hello? was repeated");
  state = reduceQuoteTurn(initialQuoteTurn(), { type: "session_ready", nowMs: 0 }, opener).state;
  const hello = reduceQuoteTurn(state, { type: "caller_speech", text: "Hello?", nowMs: 1000 }, opener);
  assert(hello.effects.length === 1 && hello.effects[0].type === "speak" && hello.effects[0].text === opener, "opener was not the approved line");
  assert(hello.state.openerSent === true, "opener not latched");
  const again = reduceQuoteTurn(hello.state, { type: "caller_speech", text: "hello again", nowMs: 2000 }, opener);
  assert(again.effects.length === 0, "opener was repeated");
  const barge = reduceQuoteTurn(hello.state, { type: "speech_started", nowMs: 2500 }, opener);
  assert(barge.effects.length === 1 && barge.effects[0].type === "interrupt", "barge-in did not stop playback");
  assert(barge.state.openerSent === true, "barge-in reopened the greeting");
  state = reduceQuoteTurn(initialQuoteTurn(), { type: "session_ready", nowMs: 0 }, opener).state;
  const talking = reduceQuoteTurn(state, { type: "speech_started", nowMs: 1000 }, opener);
  assert(talking.effects.length === 0, "speech before hello spoke");
  assert(talking.state.silenceArmedAt === null, "silence stayed armed while they talked");
  const stopped = reduceQuoteTurn(talking.state, { type: "speech_stopped", nowMs: 2000 }, opener);
  assert(stopped.state.silenceArmedAt === 2000, "silence did not re-arm");
  const notHello = reduceQuoteTurn(stopped.state, { type: "caller_speech", text: "Hi there", nowMs: 2500 }, opener);
  assert(notHello.effects.length === 0 && notHello.state.openerSent === false, "hi was treated as hello");
}
assert(
  buildQuotePlanText({
    toNumber: TO,
    businessName: "Front Range Movers",
    task: TASK,
    identity: { id: "peak", business: "Peak Signal", contacts: "Brian" },
    numberSource: "not provided",
    capSec: 420,
    leaveVoicemail: false,
    lineWarning: "",
  }) === peakPlan("7 minutes"),
  buildQuotePlanText({
    toNumber: TO,
    businessName: "Front Range Movers",
    task: TASK,
    identity: { id: "peak", business: "Peak Signal", contacts: "Brian" },
    numberSource: "not provided",
    capSec: 420,
    leaveVoicemail: false,
    lineWarning: "",
  }),
);
assert(quoteTimeLimitSec({} as NodeJS.ProcessEnv) === 420, "default cap");
assert(quoteTimeLimitSec({ PEAK_OUTBOUND_QUOTE_TIME_LIMIT_SEC: "300" } as NodeJS.ProcessEnv) === 300, "300");
assert(quoteTimeLimitSec({ PEAK_OUTBOUND_QUOTE_TIME_LIMIT_SEC: "60" } as NodeJS.ProcessEnv) === 60, "min cap");
assert(quoteTimeLimitSec({ PEAK_OUTBOUND_QUOTE_TIME_LIMIT_SEC: "900" } as NodeJS.ProcessEnv) === 900, "max cap");
assert(quoteTimeLimitSec({ PEAK_OUTBOUND_QUOTE_TIME_LIMIT_SEC: "59" } as NodeJS.ProcessEnv) === 420, "below min falls back");
assert(quoteTimeLimitSec({ PEAK_OUTBOUND_QUOTE_TIME_LIMIT_SEC: "901" } as NodeJS.ProcessEnv) === 420, "above max falls back");
assert(quoteTimeLimitSec({ PEAK_OUTBOUND_QUOTE_TIME_LIMIT_SEC: "7" } as NodeJS.ProcessEnv) === 420, "minutes typo falls back");
assert(approvalTtlSec({} as NodeJS.ProcessEnv) === 1800, "default ttl");
assert(approvalTtlSec({ PEAK_OUTBOUND_APPROVAL_TTL_SEC: "5" } as NodeJS.ProcessEnv) === 1800, "short ttl falls back");
assert(approvalTtlSec({ PEAK_OUTBOUND_APPROVAL_TTL_SEC: "120" } as NodeJS.ProcessEnv) === 120, "120 ttl");
assert(classifyLineType(null).lineType === "unknown", "null line");
assert(classifyLineType(null).warning === UNKNOWN_WARNING, classifyLineType(null).warning);
assert(classifyLineType(null).risky === true, "null is risky");
assert(classifyLineType("mobile").warning === MOBILE_WARNING, classifyLineType("mobile").warning);
assert(classifyLineType("mobile").risky === true, "mobile is risky");
assert(classifyLineType("landline").warning === "" && classifyLineType("landline").risky === false, "landline");
assert(classifyLineType("fixedVoip").lineType === "fixedVoip" && classifyLineType("fixedVoip").risky === false, "fixed voip");
assert(classifyLineType("tollFree").risky === false, "toll free");
assert(classifyLineType("nonFixedVoip").warning === VOIP_WARNING, classifyLineType("nonFixedVoip").warning);
assert(JSON.stringify(numberList("nope,+15555550102, 555")) === JSON.stringify(["+15555550102"]), "junk numbers are not listed");
const captured = captureQuote({ rate: "180 dollars per hour", crew_size: "unknown", contact_name: "Dana" });
assert(captured.rate === "180 dollars per hour", captured.rate);
assert(captured.crew_size === "not provided", captured.crew_size);
assert(captured.contact_name === "Dana", captured.contact_name);
assert(captured.travel_charge === "not provided", captured.travel_charge);
assert(callbackPolicy({} as NodeJS.ProcessEnv).number === "", "no callback configured");
assert(callbackPolicy({} as NodeJS.ProcessEnv).spoken.includes("you cannot give a number on this call"), "safe callback sentence");
assert(callbackPolicy({ PEAK_OUTBOUND_CALLBACK_NUMBER: "not-a-number" } as NodeJS.ProcessEnv).number === "", "invalid callback is not spoken");
assert(callbackPolicy({ PEAK_OUTBOUND_CALLBACK_NUMBER: CALLBACK } as NodeJS.ProcessEnv).number === CALLBACK, "callback from env");
assert(
  callbackPolicy({ PEAK_OUTBOUND_MENTION_MAIN_LINE: "1" } as NodeJS.ProcessEnv).spoken ===
    "You have no callback number to offer. If they ask for one, say they can call the business main line. Do not speak any digits.",
  "main line sentence",
);
assert(LINE_WARNING_MOBILE === MOBILE_WARNING, "mobile warning export drifted");
assert(LINE_WARNING_UNKNOWN === UNKNOWN_WARNING, "unknown warning export drifted");
assert(peakVoiceMode() === "legacy", "PEAK_VOICE_MODE default changed");

const outboundSource = readFileSync(join("voice", "peak", "peak-outbound.ts"), "utf8");
const quoteSource = readFileSync(join("voice", "peak", "peak-quote.ts"), "utf8");
const identitySource = readFileSync(join("voice", "peak", "peak-identity.ts"), "utf8");
const phoneSource = readFileSync(join("voice", "peak", "peak-phone.ts"), "utf8");
for (const source of [outboundSource, quoteSource, identitySource, phoneSource]) {
  assert(!source.includes("PEAK_VOICE_MODE"), "quote path reads PEAK_VOICE_MODE");
  assert(!/\+1\d{10}/.test(source), "quote path hardcodes a phone number");
  assert(!source.includes("9705312897") && !source.includes("970-531-2897"), "shop number was copied into quote mode");
}
assert(!outboundSource.includes("Colorado Hot Tub"), "call path hardcodes the CHT business");
assert(!outboundSource.includes("Justin and Heather"), "call path hardcodes the CHT contacts");
assert(identitySource.includes("Colorado Hot Tub"), "CHT identity missing");
assert(identitySource.includes("Justin and Heather"), "CHT contacts missing");
assert(identitySource.includes('business: "Peak Signal"'), "Peak Signal identity missing");
assert(identitySource.includes('contacts: "Brian"'), "Brian contact missing");
assert(outboundSource.includes("reduceQuoteTurn"), "quote turn reducer is not wired");
assert(outboundSource.includes("interruptible: false"), "booking greeting is no longer uninterruptible");
assert(!quoteSource.includes("I'm calling to book"), "quote prompt books");

type Mail = { url: string; subject: string; message: string; email: string; interest: string; phone: string; name: string };
type TwilioHit = { url: string; body: URLSearchParams; auth: string };
type LookupHit = { url: string; auth: string; accept: string };

const emails: Mail[] = [];
const twilioHits: TwilioHit[] = [];
const lookupHits: LookupHit[] = [];
const logs: string[] = [];
const errors: string[] = [];
let twilioCreateStatus = 201;
let lineMode: "landline" | "mobile" | "fixedVoip" | "nonFixedVoip" | "error" | "error_code" = "landline";

const realFetch = globalThis.fetch;
const realLog = console.log;
const realError = console.error;
console.log = (...args: unknown[]) => {
  logs.push(args.map((item) => String(item)).join(" "));
  realLog(...args);
};
console.error = (...args: unknown[]) => {
  errors.push(args.map((item) => String(item)).join(" "));
  realError(...args);
};

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")) return realFetch(input, init);
  const headers = init?.headers;
  let auth = "";
  let accept = "";
  if (headers && !Array.isArray(headers) && !(headers instanceof Headers)) {
    const record = headers as Record<string, string>;
    auth = String(record.Authorization || "");
    accept = String(record["Accept-Encoding"] || "");
  }
  if (url.includes("formspree.io")) {
    const payload = JSON.parse(String(init?.body || "{}")) as Record<string, string>;
    emails.push({
      url,
      subject: String(payload._subject || ""),
      message: String(payload.message || ""),
      email: String(payload.email || ""),
      interest: String(payload.interest || ""),
      phone: String(payload.phone || ""),
      name: String(payload.name || ""),
    });
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  }
  if (url.includes("lookups.twilio.com")) {
    lookupHits.push({ url, auth, accept });
    if (lineMode === "error") return new Response("nope", { status: 503 });
    if (lineMode === "error_code") {
      return new Response(JSON.stringify({ line_type_intelligence: { type: "landline", error_code: 60600 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ line_type_intelligence: { type: lineMode, error_code: null } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (url.includes("api.twilio.com")) {
    const body = new URLSearchParams(String(init?.body || ""));
    twilioHits.push({ url, body, auth });
    if (url.endsWith("/Calls.json")) {
      if (twilioCreateStatus !== 201) return new Response(JSON.stringify({ message: "nope" }), { status: twilioCreateStatus });
      const seq = twilioHits.filter((hit) => hit.url.endsWith("/Calls.json")).length;
      return new Response(JSON.stringify({ sid: `CA${String(seq).padStart(32, "0")}` }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.endsWith("/Recordings.json")) {
      return new Response(JSON.stringify({ sid: "RE123" }), { status: 201, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ status: "completed" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  throw new Error(`unexpected network ${url}`);
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

async function postJson(path: string, body: unknown, secret?: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret != null) headers[OUTBOUND_SECRET_HEADER] = secret;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
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

function assertError(res: { status: number; json: Record<string, unknown> }, status: number, error: string) {
  assert(res.status === status, `${error} status ${res.status} ${JSON.stringify(res.json)}`);
  assert(res.json.error === error, `${error} got ${String(res.json.error)} body ${JSON.stringify(res.json)}`);
}

function assertLine(message: string, line: string) {
  assert(message.split("\n").includes(line), `missing [${line}] in\n${message}`);
}

function tokenParts(token: string): { id: string; secret: string } {
  const [id, secret] = token.split(".");
  assert(/^[a-f0-9]{16}$/.test(id), id);
  assert(/^[a-f0-9]{64}$/.test(secret || ""), "approval secret shape");
  return { id, secret };
}

let clock = 1_700_000_000_000;
setOutboundNowForTest(() => clock);

try {
  resetOutboundForTest();
  logs.length = 0;
  const quoteBody = {
    mode: "quote",
    to_number: TO,
    business_name: "Front Range Movers",
    task: TASK,
  };
  const approvalFields = {
    to_number: TO,
    approved_by: "Brian",
    business_name: "Front Range Movers",
    task: TASK,
  };
  const booking = {
    to_number: TO,
    business_name: "The Green Fork",
    task: "table for 2 at 7pm Friday",
    alternates_window: "Friday 6pm to 9pm",
    callback_name: "Brian",
  };

  for (const flag of [undefined, "0", "true", "yes"] as const) {
    if (flag == null) delete process.env.PEAK_OUTBOUND_ENABLED;
    else process.env.PEAK_OUTBOUND_ENABLED = flag;
    const off = await postJson("/api/voice/outbound", { ...quoteBody, approval_token: "missing" }, SECRET);
    assertError(off, 404, "not_found");
    const approval = await postJson("/api/voice/outbound/approvals", { to_number: TO, approved_by: "Brian" }, "wrong-secret");
    assertError(approval, 404, "not_found");
  }
  assert(callsCreated().length === 0, "flag off placed a call");
  assert(lookupHits.length === 0, "flag off looked up a number");
  assert(emails.length === 0, "flag off emailed");

  process.env.PEAK_OUTBOUND_ENABLED = "1";
  const missingSecret = await postJson("/api/voice/outbound/approvals", { to_number: TO, approved_by: "Brian" });
  assertError(missingSecret, 401, "unauthorized");
  assert(lookupHits.length === 0, "unauthorized approval looked up a number");

  const emptyList = await postJson("/api/voice/outbound/approvals", approvalFields, SECRET);
  assertError(emptyList, 403, "not_allowlisted");
  assert(callsCreated().length === 0, "empty allowlist placed a call");
  assert(lookupHits.length === 0, "blocked approval looked up a number");

  process.env.PEAK_OUTBOUND_QUOTE_ALLOWLIST = `${TO},${OTHER},${FROM}`;
  process.env.PEAK_OUTBOUND_DNC = `${DNC}, nope`;
  const dncApproval = await postJson(
    "/api/voice/outbound/approvals",
    { ...approvalFields, to_number: DNC },
    SECRET,
  );
  assertError(dncApproval, 403, "do_not_call");
  assert(lookupHits.length === 0, "do-not-call number was looked up");
  const dncQuote = await postJson("/api/voice/outbound", { ...quoteBody, to_number: DNC, approval_token: "none" }, SECRET);
  assertError(dncQuote, 403, "do_not_call");
  const dncBook = await postJson("/api/voice/outbound", { ...booking, to_number: DNC }, SECRET);
  assertError(dncBook, 403, "do_not_call");
  assert(callsCreated().length === 0, "do-not-call placed a call");
  delete process.env.PEAK_OUTBOUND_DNC;

  const badBy = await postJson("/api/voice/outbound/approvals", { to_number: TO, approved_by: "" }, SECRET);
  assertError(badBy, 400, "invalid_approved_by");
  assert(logs.some((line) => line.startsWith("outbound approval issued")) === false, "invalid approval was logged as issued");

  async function approve(
    to: string,
    by = "Brian",
    fields: { business_name?: string; task?: string; identity?: string; number_source?: string } = {},
  ): Promise<{ token: string; id: string; secret: string; json: Record<string, unknown>; plan: string; planId: string }> {
    const before = lookupHits.length;
    const body: Record<string, unknown> = {
      to_number: to,
      approved_by: by,
      business_name: fields.business_name ?? "Front Range Movers",
      task: fields.task ?? TASK,
    };
    if (fields.identity) body.identity = fields.identity;
    if (fields.number_source) body.number_source = fields.number_source;
    const preview = await postJson("/api/voice/outbound/approvals", body, SECRET);
    assert(preview.status === 200, `preview ${preview.status} ${JSON.stringify(preview.json)}`);
    assert(preview.json.approval_token == null, "preview issued a token");
    assert(typeof preview.json.plan === "string" && String(preview.json.plan).includes("Opening line:"), "plan missing");
    assert(String(preview.json.plan).includes("Who: An AI assistant calling for "), String(preview.json.plan));
    const planId = String(preview.json.plan_id || "");
    assert(/^[a-f0-9]{16}$/.test(planId), planId);
    const res = await postJson("/api/voice/outbound/approvals", { ...body, confirm_plan: true, plan_id: planId }, SECRET);
    assert(res.status === 200, `approve ${res.status} ${JSON.stringify(res.json)}`);
    const token = String(res.json.approval_token || "");
    const parts = tokenParts(token);
    assert(res.json.approval_id === parts.id, "approval id mismatch");
    assert(res.json.to_number === to, String(res.json.to_number));
    assert(res.json.plan === preview.json.plan, "confirm changed the plan");
    assert(!logs.some((line) => line.includes(token) || line.includes(parts.secret)), "approval log contains the token");
    assert(!errors.some((line) => line.includes(token) || line.includes(parts.secret)), "approval error log contains the token");
    const callback = String(process.env.PEAK_OUTBOUND_CALLBACK_NUMBER || "");
    if (/^\+1\d{10}$/.test(callback)) {
      assert(!String(preview.json.plan).includes(callback), "plan included the callback number");
      assert(!logs.some((line) => line.includes(callback)), "approval log included the callback number");
    }
    if (String(process.env.TWILIO_ACCOUNT_SID || "") && String(process.env.TWILIO_AUTH_TOKEN || "")) {
      assert(lookupHits.length === before + 1, "approval did not look up the line");
      const hit = lookupHits.at(-1);
      assert(hit?.url === `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(to)}?Fields=line_type_intelligence`, hit?.url || "");
      assert(hit?.accept === "gzip, identity", hit?.accept || "");
      assert(Buffer.from((hit?.auth || "").replace(/^Basic\s+/, ""), "base64").toString("utf8") === "ACtest:test-token", "lookup auth");
    } else {
      assert(lookupHits.length === before, "missing credentials still called lookup");
    }
    return { token, id: parts.id, secret: parts.secret, json: res.json, plan: String(preview.json.plan), planId };
  }

  lineMode = "landline";
  process.env.PEAK_OUTBOUND_QUOTE_TIME_LIMIT_SEC = "300";
  const grok = await approve(TO, "Grok Bot for Brian");
  assert(grok.plan === peakPlan("5 minutes"), grok.plan);
  assert(grok.json.line_type === "landline", String(grok.json.line_type));
  assert(grok.json.warning === "", String(grok.json.warning));
  assert(
    logs.includes(`outbound approval planned id=${grok.planId} to=${TO} by=Grok Bot for Brian at=${ISSUED_AT} line=landline reason=planned plan=${PEAK_PLAN_LOG_5}`),
    "plan was not logged",
  );
  assert(
    logs.includes(`outbound approval issued id=${grok.id} to=${TO} by=Grok Bot for Brian at=${ISSUED_AT} line=landline reason=issued plan=${PEAK_PLAN_LOG_5}`),
    logs.filter((line) => line.includes(grok.id)).join("\n"),
  );

  const noToken = await postJson("/api/voice/outbound", quoteBody, SECRET);
  assertError(noToken, 400, "approval_required");
  const blankToken = await postJson("/api/voice/outbound", { ...quoteBody, approval_token: "   " }, SECRET);
  assertError(blankToken, 400, "approval_required");
  assert(callsCreated().length === 0, "quote without a token placed a call");

  const badIdentity = await postJson("/api/voice/outbound", { ...quoteBody, identity: "nope", approval_token: grok.token }, SECRET);
  assertError(badIdentity, 400, "unknown_identity");
  const wrongPlan = await postJson("/api/voice/outbound", { ...quoteBody, task: "a piano move", approval_token: grok.token }, SECRET);
  assertError(wrongPlan, 400, "approval_plan_mismatch");
  assert(callsCreated().length === 0, "a mismatched plan placed a call");

  const mismatch = await postJson("/api/voice/outbound", { ...quoteBody, to_number: OTHER, approval_token: grok.token }, SECRET);
  assertError(mismatch, 400, "approval_mismatch");
  assert(
    logs.includes(`outbound approval rejected id=${grok.id} to=${OTHER} by=Grok Bot for Brian at=${ISSUED_AT} line=landline reason=approval_mismatch`),
    "mismatch was not logged",
  );
  assert(callsCreated().length === 0, "mismatched token placed a call");

  const same = await postJson("/api/voice/outbound", { ...quoteBody, to_number: FROM, approval_token: grok.token }, SECRET);
  assertError(same, 400, "same_number");

  const bookRes = await postJson("/api/voice/outbound", booking, SECRET);
  assert(bookRes.status === 200, `booking ${bookRes.status} ${JSON.stringify(bookRes.json)}`);
  assert(bookRes.json.mode == null, "booking response gained a quote mode");
  const bookHit = callsCreated().at(-1);
  assert(bookHit?.body.get("TimeLimit") === "240", bookHit?.body.get("TimeLimit") || "");
  assert(bookHit?.body.get("To") === TO, "booking destination");
  assert(bookHit?.body.get("From") === FROM, "booking caller id");
  const bookSid = String(bookRes.json.call_sid || "");
  const bookSession = outboundSessionFor(bookSid);
  assert(bookSession?.greeting === BOOK_GREETING, bookSession?.greeting || "");
  assert(bookSession?.tools[0]?.name === "report_outcome", "booking tool changed");
  const bookEnum = (bookSession?.tools[0]?.parameters as { properties: { outcome: { enum: string[] } } }).properties.outcome.enum;
  assert(JSON.stringify(bookEnum) === JSON.stringify(["booked", "alternate offered", "declined", "voicemail"]), JSON.stringify(bookEnum));
  assert(!bookSession?.instructions.includes("You never book, pay"), "booking picked up the quote never-commit rule");
  assert(!bookSession?.instructions.includes("say Hello? once"), "booking picked up quote silence handling");
  const bookIvr = await handleOutboundCallerLine(bookSid, "press 1 for the office");
  assert(bookIvr.hangup === true && bookIvr.outcome === "voicemail", JSON.stringify(bookIvr));

  const placed = await postJson("/api/voice/outbound", { ...quoteBody, approval_token: grok.token }, SECRET);
  assert(placed.status === 200, `place ${placed.status} ${JSON.stringify(placed.json)}`);
  assert(placed.json.mode === "quote", JSON.stringify(placed.json));
  assert(placed.json.line_type === "landline", String(placed.json.line_type));
  assert(placed.json.warning === "", String(placed.json.warning));
  assert(placed.json.to_number === TO, String(placed.json.to_number));
  assert(!JSON.stringify(placed.json).includes(grok.secret), "place response leaked the approval secret");
  assert(!JSON.stringify(placed.json).includes(grok.token), "place response returned the approval token");
  const quoteHit = callsCreated().at(-1);
  assert(quoteHit?.body.get("TimeLimit") === "300", quoteHit?.body.get("TimeLimit") || "");
  assert(quoteHit?.body.get("MachineDetection") === "Enable", "quote amd");
  assert(quoteHit?.body.get("To") === TO, "quote destination");
  assert(
    logs.includes(`outbound approval used id=${grok.id} to=${TO} by=Grok Bot for Brian at=${ISSUED_AT} line=landline reason=used plan=${PEAK_PLAN_LOG_5}`),
    "use was not logged",
  );
  const reused = await postJson("/api/voice/outbound", { ...quoteBody, approval_token: grok.token }, SECRET);
  assertError(reused, 400, "approval_used");
  assert(callsCreated().length === 2, `reused token dialed ${callsCreated().length}`);

  const sid = String(placed.json.call_sid || "");
  const session = outboundSessionFor(sid);
  assert(session?.greeting === PEAK_GREETING, session?.greeting || "");
  assert(session?.greeting.startsWith(PEAK_FIRST), session?.greeting || "");
  assert(session?.instructions.includes(PEAK_GREETING), "instructions dropped the opening");
  assert(session?.instructions.includes("calling for Brian at Peak Signal"), "instructions dropped Brian");
  assert(session?.instructions.includes("You never book, pay, give card details, put down a deposit, sign up, or agree to terms."), session?.instructions || "");
  assert(session?.instructions.includes("say someone will follow up"), "never-commit follow-up missing");
  assert(session?.instructions.includes("Repeat each price and each number back and get confirmation before you record it."), "number readback missing");
  assert(session?.instructions.includes("Before you hang up, read everything back: every figure and every detail you captured."), "full readback missing");
  assert(session?.instructions.includes("Ask one question at a time."), "one-question rule missing");
  assert(session?.instructions.includes("Wait until the other party says hello before you speak."), "hello wait missing");
  assert(session?.instructions.includes("say Hello? once, then wait."), "silence check missing");
  assert(session?.instructions.includes("Do not press keys."), "ivr keypress missing");
  assert(!session?.instructions.includes("I'm calling to book"), "quote instructions book the job");
  assert(session?.instructions.includes("Never invent"), "instructions allow invented facts");
  assert(session?.instructions.includes("you cannot give a number on this call"), session?.instructions || "");
  assert(!session?.instructions.includes(CALLBACK), "unset callback number was spoken");
  assert(!/\+1\d{10}/.test(session?.instructions || ""), "instructions contain a phone number");
  assert(session?.tools[0]?.name === "report_quote", session?.tools[0]?.name || "");
  const quoteEnum = (session?.tools[0]?.parameters as { properties: { outcome: { enum: string[] } } }).properties.outcome.enum;
  assert(
    JSON.stringify(quoteEnum) ===
      JSON.stringify([
        "quote_received",
        "partial_info",
        "call_back_requested",
        "transferred",
        "wrong_number",
        "declined",
        "voicemail",
        "ivr_only",
      ]),
    JSON.stringify(quoteEnum),
  );

  const human = await postForm(`/api/voice/outbound/twiml?token=${encodeURIComponent(outboundTokenFor(sid))}`, {
    CallSid: sid,
    AnsweredBy: "human",
  });
  assert(human.status === 200, human.text);
  assert(human.text.includes("<Stream"), human.text);
  assert(twilioHits.filter((hit) => hit.url.endsWith("/Recordings.json")).length === 1, "quote did not start a recording");
  const reported = applyQuoteReport(sid, {
    outcome: "quoted",
    rate: "180 dollars per hour",
    crew_size: "unknown",
    minimum_hours: "3 hours",
    notice: "two days",
    insurance: "general liability",
    contact_name: "Dana",
    their_words: "one eighty an hour, two people",
    promised: "send a certificate",
  });
  assert(reported.ok === true && reported.outcome === "quote_received", JSON.stringify(reported));
  const rec = await postForm(`/api/voice/outbound/recording?token=${encodeURIComponent(outboundTokenFor(sid))}`, {
    CallSid: sid,
    RecordingStatus: "completed",
    RecordingUrl: "https://api.twilio.com/2010-04-01/Accounts/ACtest/Recordings/RE123",
  });
  assert(rec.status === 200, "recording callback");
  assert(emails.length === 0, "recording emailed before hangup");
  const done = await postForm(`/api/voice/outbound/status?token=${encodeURIComponent(outboundTokenFor(sid))}`, {
    CallSid: sid,
    CallStatus: "completed",
  });
  assert(done.status === 200, "completed");
  assert(emails.length === 1, `emails ${emails.length}`);
  const mail = emails[0];
  assert(mail.url === "https://formspree.io/f/mgobgrlr", mail.url);
  assert(mail.email === OUTBOUND_INBOX, mail.email);
  assert(mail.interest === "outbound-voice", mail.interest);
  assert(mail.phone === TO, mail.phone);
  assert(mail.name === "Peak Signal AI assistant", mail.name);
  assert(mail.subject === "Peak outbound quote — Front Range Movers — quote_received", mail.subject);
  assert(!mail.message.includes(grok.secret), "summary contains the approval secret");
  assert(!mail.message.includes(grok.token), "summary contains the approval token");
  const messageLines = mail.message.split("\n");
  assert(messageLines[0] === "quote_received — 180 dollars per hour", messageLines[0]);
  assert(messageLines[1] === 'Their words: "one eighty an hour, two people"', messageLines[1]);
  assert(messageLines[2] === "Promised:", messageLines[2]);
  assert(messageLines[3] === "- send a certificate", messageLines[3]);
  assert(messageLines[4] === "Unclear / not provided:", messageLines[4]);
  assert(messageLines[5] === "- Crew size", messageLines[5]);
  assert(messageLines[6] === "- Travel charge", messageLines[6]);
  assert(messageLines[7] === "- Same-day availability", messageLines[7]);
  assert(messageLines[8] === "- Certificate of insurance", messageLines[8]);
  assert(messageLines[9] === "- On-call interest", messageLines[9]);
  assert(messageLines[10] === "- Callback preference", messageLines[10]);
  assert(messageLines[11] === "- Callback time", messageLines[11]);
  assert(messageLines[12] === "Rate: 180 dollars per hour", messageLines[12]);
  const warningAt = mail.message.indexOf("\nLine warning: (none)\n");
  const recordingAt = mail.message.indexOf("\nRecording: https://api.twilio.com/2010-04-01/Accounts/ACtest/Recordings/RE123.mp3\n");
  assert(warningAt > mail.message.indexOf("Rate: 180 dollars per hour"), "warning before the fields");
  assert(recordingAt > warningAt, "recording before the warning");
  for (const line of [
    "Peak Signal outbound quote",
    `Inbox: ${OUTBOUND_INBOX}`,
    "Mode: quote",
    "Outcome: quote_received",
    "Identity: Peak Signal",
    "Contacts: Brian",
    "Business: Front Range Movers",
    `Task: ${TASK}`,
    `Called: ${TO}`,
    "Line type: landline",
    "Line warning: (none)",
    "Callback offered: (none)",
    "Main line mention: no",
    "Approved by: Grok Bot for Brian",
    `Approval: ${grok.id}`,
    "Rate: 180 dollars per hour",
    "Crew size: not provided",
    "Minimum hours: 3 hours",
    "Travel charge: not provided",
    "Same-day availability: not provided",
    "Notice needed: two days",
    "Insurance: general liability",
    "Certificate of insurance: not provided",
    "On-call interest: not provided",
    "Person spoken to: Dana",
    "Callback preference: not provided",
    "Callback time: not provided",
    "Detection: (none)",
    "Recording: https://api.twilio.com/2010-04-01/Accounts/ACtest/Recordings/RE123.mp3",
    `CallSid: ${sid}`,
  ]) {
    assertLine(mail.message, line);
  }
  assert(!mail.message.includes("Rate: a two-bedroom"), "summary invented the rate from the task");

  emails.length = 0;
  delete process.env.PEAK_OUTBOUND_QUOTE_TIME_LIMIT_SEC;
  const fallback = await approve(TO);
  const fallbackPlace = await postJson("/api/voice/outbound", { ...quoteBody, approval_token: fallback.token }, SECRET);
  assert(fallbackPlace.status === 200, JSON.stringify(fallbackPlace.json));
  assert(callsCreated().at(-1)?.body.get("TimeLimit") === "420", callsCreated().at(-1)?.body.get("TimeLimit") || "");
  process.env.PEAK_OUTBOUND_QUOTE_TIME_LIMIT_SEC = "59";
  const low = await approve(OTHER);
  const lowPlace = await postJson(
    "/api/voice/outbound",
    { ...quoteBody, to_number: OTHER, approval_token: low.token },
    SECRET,
  );
  assert(lowPlace.status === 200, JSON.stringify(lowPlace.json));
  assert(callsCreated().at(-1)?.body.get("TimeLimit") === "420", "out of range cap was sent");
  const callbackReport = applyQuoteReport(String(lowPlace.json.call_sid), {
    outcome: "call_back_requested",
    contact_name: "Dana",
    callback_time: "Thursday at 2",
  });
  assert(callbackReport.ok === true && callbackReport.outcome === "call_back_requested", JSON.stringify(callbackReport));
  await postForm(`/api/voice/outbound/status?token=${encodeURIComponent(outboundTokenFor(String(lowPlace.json.call_sid)))}`, {
    CallSid: String(lowPlace.json.call_sid),
    CallStatus: "completed",
  });
  assert(emails.at(-1)?.message.split("\n")[0] === "call_back_requested — (no headline rate)", emails.at(-1)?.message.split("\n")[0] || "");
  assertLine(emails.at(-1)?.message || "", "Person spoken to: Dana");
  assertLine(emails.at(-1)?.message || "", "Callback time: Thursday at 2");
  delete process.env.PEAK_OUTBOUND_QUOTE_TIME_LIMIT_SEC;

  emails.length = 0;
  lineMode = "mobile";
  const mobile = await approve(TO);
  assert(mobile.json.line_type === "mobile", String(mobile.json.line_type));
  assert(mobile.json.warning === MOBILE_WARNING, String(mobile.json.warning));
  assert(
    logs.includes(`outbound approval issued id=${mobile.id} to=${TO} by=Brian at=${ISSUED_AT} line=mobile reason=issued plan=${PEAK_PLAN_LOG_7}`),
    "mobile approval was not logged",
  );
  const unwarned = await postJson("/api/voice/outbound", { ...quoteBody, approval_token: mobile.token, accept_line_warning: "true" }, SECRET);
  assertError(unwarned, 409, "line_warning_required");
  assert(unwarned.json.warning === MOBILE_WARNING, String(unwarned.json.warning));
  assert(unwarned.json.line_type === "mobile", String(unwarned.json.line_type));
  assert(callsCreated().length === 4, "unacknowledged mobile number was dialed");
  const mobilePlace = await postJson("/api/voice/outbound", { ...quoteBody, approval_token: mobile.token, accept_line_warning: true }, SECRET);
  assert(mobilePlace.status === 200, JSON.stringify(mobilePlace.json));
  assert(mobilePlace.json.warning === MOBILE_WARNING, String(mobilePlace.json.warning));
  const mobileSid = String(mobilePlace.json.call_sid);
  await postForm(`/api/voice/outbound/status?token=${encodeURIComponent(outboundTokenFor(mobileSid))}`, {
    CallSid: mobileSid,
    CallStatus: "no-answer",
  });
  assert(emails.length === 1, "mobile summary missing");
  assert(emails[0].message.split("\n")[0] === "no answer — (no headline rate)", emails[0].message.split("\n")[0]);
  assertLine(emails[0].message, "Outcome: no answer");
  assertLine(emails[0].message, "Line type: mobile");
  assertLine(emails[0].message, `Line warning: ${MOBILE_WARNING}`);
  assertLine(emails[0].message, "Rate: not provided");
  assertLine(emails[0].message, `Task: ${TASK}`);
  assert(!emails[0].message.includes(mobile.secret), "mobile summary leaked the token");

  emails.length = 0;
  lineMode = "error";
  const unknown = await approve(TO);
  assert(unknown.json.line_type === "unknown", String(unknown.json.line_type));
  assert(unknown.json.warning === UNKNOWN_WARNING, String(unknown.json.warning));
  const unknownPlace = await postJson("/api/voice/outbound", { ...quoteBody, approval_token: unknown.token, accept_line_warning: true }, SECRET);
  assert(unknownPlace.status === 200, JSON.stringify(unknownPlace.json));
  const unknownSid = String(unknownPlace.json.call_sid);
  await postForm(`/api/voice/outbound/status?token=${encodeURIComponent(outboundTokenFor(unknownSid))}`, {
    CallSid: unknownSid,
    CallStatus: "completed",
    AnsweredBy: "machine_start",
  });
  assert(emails[0].message.split("\n")[0] === "voicemail — (no headline rate)", emails[0].message.split("\n")[0]);
  assertLine(emails[0].message, "Outcome: voicemail");
  assertLine(emails[0].message, "Line type: unknown");
  assertLine(emails[0].message, `Line warning: ${UNKNOWN_WARNING}`);
  assertLine(emails[0].message, "Crew size: not provided");
  assertLine(emails[0].message, "Person spoken to: not provided");
  assert(!emails[0].message.includes(`Rate: ${TASK}`), "voicemail summary copied the task into the rate");

  emails.length = 0;
  lineMode = "error_code";
  const coded = await approve(TO);
  assert(coded.json.line_type === "unknown", String(coded.json.line_type));
  assert(coded.json.warning === UNKNOWN_WARNING, String(coded.json.warning));
  const codedPlace = await postJson("/api/voice/outbound", { ...quoteBody, approval_token: coded.token }, SECRET);
  assertError(codedPlace, 409, "line_warning_required");

  lineMode = "fixedVoip";
  const fixed = await approve(TO);
  assert(fixed.json.line_type === "fixedVoip", String(fixed.json.line_type));
  assert(fixed.json.warning === "", String(fixed.json.warning));
  const fixedPlace = await postJson("/api/voice/outbound", { ...quoteBody, approval_token: fixed.token }, SECRET);
  assert(fixedPlace.status === 200, `fixed voip ${fixedPlace.status} ${JSON.stringify(fixedPlace.json)}`);
  const ivrHeard = await handleOutboundCallerLine(String(fixedPlace.json.call_sid), "press 1 for the office");
  assert(ivrHeard.hangup === true && ivrHeard.outcome === "ivr_only", JSON.stringify(ivrHeard));

  lineMode = "nonFixedVoip";
  const voip = await approve(TO);
  assert(voip.json.warning === VOIP_WARNING, String(voip.json.warning));
  const voipBlocked = await postJson("/api/voice/outbound", { ...quoteBody, approval_token: voip.token }, SECRET);
  assertError(voipBlocked, 409, "line_warning_required");
  assert(voipBlocked.json.warning === VOIP_WARNING, String(voipBlocked.json.warning));

  lineMode = "landline";
  const account = process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_ACCOUNT_SID;
  const blind = await approve(TO);
  assert(blind.json.line_type === "unknown", String(blind.json.line_type));
  assert(blind.json.warning === UNKNOWN_WARNING, String(blind.json.warning));
  const blindPlace = await postJson("/api/voice/outbound", { ...quoteBody, approval_token: blind.token, accept_line_warning: true }, SECRET);
  assertError(blindPlace, 503, "not_configured");
  process.env.TWILIO_ACCOUNT_SID = account;
  const blindRetry = await postJson("/api/voice/outbound", { ...quoteBody, approval_token: blind.token, accept_line_warning: true }, SECRET);
  assert(blindRetry.status === 200, `token survived a config failure ${blindRetry.status} ${JSON.stringify(blindRetry.json)}`);

  process.env.PEAK_OUTBOUND_CALLBACK_NUMBER = "call-the-shop";
  const invalidCallback = await approve(OTHER);
  const invalidPlace = await postJson(
    "/api/voice/outbound",
    { ...quoteBody, to_number: OTHER, approval_token: invalidCallback.token },
    SECRET,
  );
  assert(invalidPlace.status === 200, JSON.stringify(invalidPlace.json));
  const invalidSession = outboundSessionFor(String(invalidPlace.json.call_sid));
  assert(invalidSession?.instructions.includes("you cannot give a number on this call"), invalidSession?.instructions || "");
  assert(!invalidSession?.instructions.includes("call-the-shop"), "invalid callback text was spoken");
  assert(!/\+1\d{10}/.test(invalidSession?.greeting || ""), "greeting gained a phone number");

  process.env.PEAK_OUTBOUND_CALLBACK_NUMBER = CALLBACK;
  const listed = await approve(TO);
  const listedPlace = await postJson("/api/voice/outbound", { ...quoteBody, approval_token: listed.token }, SECRET);
  assert(listedPlace.status === 200, JSON.stringify(listedPlace.json));
  const listedSession = outboundSessionFor(String(listedPlace.json.call_sid));
  assert(listedSession?.greeting === PEAK_GREETING, listedSession?.greeting || "");
  assert(!listedSession?.greeting.includes(CALLBACK), "opening spoke the callback number");
  assert(listedSession?.instructions.includes(`The only callback number you may speak is ${CALLBACK}.`), listedSession?.instructions || "");
  const listedSid = String(listedPlace.json.call_sid);
  emails.length = 0;
  await postForm(`/api/voice/outbound/status?token=${encodeURIComponent(outboundTokenFor(listedSid))}`, {
    CallSid: listedSid,
    CallStatus: "no-answer",
  });
  assertLine(emails[0].message, `Callback offered: ${CALLBACK}`);
  assertLine(emails[0].message, "Main line mention: no");

  delete process.env.PEAK_OUTBOUND_CALLBACK_NUMBER;
  process.env.PEAK_OUTBOUND_MENTION_MAIN_LINE = "1";
  const main = await approve(OTHER);
  const mainPlace = await postJson("/api/voice/outbound", { ...quoteBody, to_number: OTHER, approval_token: main.token }, SECRET);
  assert(mainPlace.status === 200, JSON.stringify(mainPlace.json));
  const mainSession = outboundSessionFor(String(mainPlace.json.call_sid));
  assert(
    mainSession?.instructions.includes("say they can call the business main line"),
    mainSession?.instructions || "",
  );
  assert(!/\+1\d{10}/.test(mainSession?.instructions || ""), "main line mention spoke a number");
  emails.length = 0;
  const mainSid = String(mainPlace.json.call_sid);
  await postForm(`/api/voice/outbound/status?token=${encodeURIComponent(outboundTokenFor(mainSid))}`, {
    CallSid: mainSid,
    CallStatus: "no-answer",
  });
  assertLine(emails[0].message, "Callback offered: (none)");
  assertLine(emails[0].message, "Main line mention: yes");
  delete process.env.PEAK_OUTBOUND_MENTION_MAIN_LINE;

  process.env.PEAK_OUTBOUND_IDENTITIES = JSON.stringify([
    { id: "cht", business: "Other Shop", contacts: "Pat" },
    { id: "desk", business: "Example Desk", contacts: "Alex Rivera" },
    { id: "leak", business: "Call +15555550123", contacts: "Alex" },
  ]);
  process.env.PEAK_OUTBOUND_IDENTITY = "desk";
  const override = await approve(TO, "Brian", { identity: "cht" });
  const overridePlace = await postJson("/api/voice/outbound", { ...quoteBody, identity: "cht", approval_token: override.token }, SECRET);
  assert(overridePlace.status === 200, JSON.stringify(overridePlace.json));
  assert(outboundSessionFor(String(overridePlace.json.call_sid))?.greeting === GREETING, "config replaced the CHT identity");
  const desk = await approve(OTHER);
  const deskPlace = await postJson(
    "/api/voice/outbound",
    { mode: "quote", to_number: OTHER, business_name: "Front Range Movers", task: TASK, approval_token: desk.token },
    SECRET,
  );
  assert(deskPlace.status === 200, JSON.stringify(deskPlace.json));
  const deskSession = outboundSessionFor(String(deskPlace.json.call_sid));
  assert(deskSession?.greeting === DESK_GREETING, deskSession?.greeting || "");
  assert(deskSession?.instructions.includes("Alex Rivera"), "custom contacts missing");
  assert(!deskSession?.instructions.includes("Justin and Heather"), "custom identity still used CHT contacts");
  const leak = await postJson(
    "/api/voice/outbound",
    { ...quoteBody, identity: "leak", approval_token: (await approve(TO)).token },
    SECRET,
  );
  assertError(leak, 400, "unknown_identity");
  delete process.env.PEAK_OUTBOUND_IDENTITY;
  delete process.env.PEAK_OUTBOUND_IDENTITIES;

  process.env.PEAK_OUTBOUND_APPROVAL_TTL_SEC = "5";
  const short = await approve(TO);
  assert(short.json.expires_at === TTL_DEFAULT_AT, String(short.json.expires_at));
  process.env.PEAK_OUTBOUND_APPROVAL_TTL_SEC = "120";
  const expiring = await approve(TO);
  assert(expiring.json.expires_at === TTL_120_AT, String(expiring.json.expires_at));
  const createsBeforeExpiry = callsCreated().length;
  clock = 1_700_000_120_000;
  const expired = await postJson("/api/voice/outbound", { ...quoteBody, approval_token: expiring.token }, SECRET);
  assertError(expired, 400, "approval_expired");
  assert(callsCreated().length === createsBeforeExpiry, "expired token placed a call");
  assert(
    logs.includes(`outbound approval rejected id=${expiring.id} to=${TO} by=Brian at=${TTL_120_AT} line=landline reason=approval_expired`),
    "expiry was not logged",
  );
  delete process.env.PEAK_OUTBOUND_APPROVAL_TTL_SEC;
  clock = 1_700_000_000_000;

  twilioCreateStatus = 500;
  const failed = await approve(TO);
  const failedPlace = await postJson("/api/voice/outbound", { ...quoteBody, approval_token: failed.token }, SECRET);
  assertError(failedPlace, 502, "call_failed");
  twilioCreateStatus = 201;
  const failedAgain = await postJson("/api/voice/outbound", { ...quoteBody, approval_token: failed.token }, SECRET);
  assertError(failedAgain, 400, "approval_used");

  resetOutboundForTest();
  process.env.PEAK_OUTBOUND_PER_MINUTE = "1";
  const limitedBooking = await postJson("/api/voice/outbound", { ...booking, to_number: OTHER }, SECRET);
  assert(limitedBooking.status === 200, `limit setup ${limitedBooking.status}`);
  const held = await approve(TO);
  const limited = await postJson("/api/voice/outbound", { ...quoteBody, approval_token: held.token }, SECRET);
  assertError(limited, 429, "rate_limit");
  clock += 61_000;
  const afterLimit = await postJson("/api/voice/outbound", { ...quoteBody, approval_token: held.token }, SECRET);
  assert(afterLimit.status === 200, `rate limit burned the token ${afterLimit.status} ${JSON.stringify(afterLimit.json)}`);
  process.env.PEAK_OUTBOUND_PER_MINUTE = "30";

  const tampered = `${held.id}.${"ab".repeat(32)}`;
  const tamper = await postJson("/api/voice/outbound", { ...quoteBody, approval_token: tampered }, SECRET);
  assertError(tamper, 400, "invalid_approval");
  assert(!logs.some((line) => line.includes(tampered) || line.includes("ab".repeat(32))), "rejected log stored a token");

  const notListed = await postJson(
    "/api/voice/outbound/approvals",
    { ...approvalFields, to_number: "+15555550109" },
    SECRET,
  );
  assertError(notListed, 403, "not_allowlisted");
  const stillBooked = await postJson("/api/voice/outbound", { ...booking, to_number: "+15555550109" }, SECRET);
  assert(stillBooked.status === 200, `allowlist blocked a booking ${stillBooked.status} ${JSON.stringify(stillBooked.json)}`);
  assert(callsCreated().at(-1)?.body.get("TimeLimit") === "240", "booking cap changed");

  assert(peakVoiceMode() === "legacy", "quote test changed the voice mode default");
  console.log("peak-quote.test.ts ok");
} finally {
  setOutboundNowForTest(null);
  resetOutboundForTest();
  server.close();
  globalThis.fetch = realFetch;
  console.log = realLog;
  console.error = realError;
}
