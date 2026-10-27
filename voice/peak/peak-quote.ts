/**
 * Quote mode for Peak outbound calls.
 * Same gate as booking: nothing here runs unless PEAK_OUTBOUND_ENABLED=1.
 * Booking's greeting, outcomes, and 240 second cap stay in peak-outbound.ts.
 *
 * PEAK_OUTBOUND_QUOTE_ALLOWLIST       comma-separated US E.164. Empty blocks every quote call.
 * PEAK_OUTBOUND_DNC                   comma-separated US E.164. Listed numbers are not dialed.
 * PEAK_OUTBOUND_QUOTE_TIME_LIMIT_SEC  default 420, allowed 60 through 900. Otherwise 420.
 * PEAK_OUTBOUND_APPROVAL_TTL_SEC      default 1800, allowed 60 through 86400. Otherwise 1800.
 * PEAK_OUTBOUND_CALLBACK_NUMBER       only number the agent may speak. Read at call time.
 * PEAK_OUTBOUND_MENTION_MAIN_LINE     1 to mention the main line when no callback number is set.
 *                                     No digits are spoken in that case.
 * PEAK_OUTBOUND_IDENTITY              identity id when the request omits one. Default is peak.
 * PEAK_OUTBOUND_IDENTITIES            extra identities. See peak-identity.ts.
 * PEAK_OUTBOUND_LEAVE_VOICEMAIL       1 to allow one short voicemail. Default is off.
 *
 * A quote approval shows the plan before it issues a token. The token is bound
 * to that plan and destination. Tokens are random, kept in process memory, and
 * checked here. No signing key is stored in the repo. A restart drops unused
 * tokens, which fails closed. The full token is returned once and is not logged.
 */
import crypto from "node:crypto";
import { SAFE_ACCEPT_ENCODING } from "../brotli-guard";
import { resolveIdentity, type BusinessIdentity } from "./peak-identity";
import { isUsE164 } from "./peak-phone";

export { resolveIdentity };

export const NOT_PROVIDED = "not provided";
export const LINE_WARNING_MOBILE =
  "Line type is mobile. This number is flagged as risky because calls to cell numbers can require prior express consent.";
export const LINE_WARNING_UNKNOWN = "Line type could not be determined. Treated as risky.";
export const NEVER_COMMIT =
  "Never book, pay, give card details, put down a deposit, sign up, or agree to terms.";
export const QUOTE_HELLO_CHECK = "Hello?";
export const QUOTE_SILENCE_MS = 5000;

export const QUOTE_TIME_LIMIT_DEFAULT_SEC = 420;
export const QUOTE_TIME_LIMIT_MIN_SEC = 60;
export const QUOTE_TIME_LIMIT_MAX_SEC = 900;
export const APPROVAL_TTL_DEFAULT_SEC = 1800;
export const APPROVAL_TTL_MIN_SEC = 60;
export const APPROVAL_TTL_MAX_SEC = 86_400;

export const QUOTE_FIELDS = [
  "rate",
  "crew_size",
  "minimum_hours",
  "travel_charge",
  "same_day",
  "notice",
  "insurance",
  "certificate",
  "on_call",
  "contact_name",
  "callback_preference",
  "callback_time",
] as const;

export type QuoteField = (typeof QUOTE_FIELDS)[number];
export type QuoteCapture = Record<QuoteField, string>;

export const QUOTE_LABELS: Array<[QuoteField, string]> = [
  ["rate", "Rate"],
  ["crew_size", "Crew size"],
  ["minimum_hours", "Minimum hours"],
  ["travel_charge", "Travel charge"],
  ["same_day", "Same-day availability"],
  ["notice", "Notice needed"],
  ["insurance", "Insurance"],
  ["certificate", "Certificate of insurance"],
  ["on_call", "On-call interest"],
  ["contact_name", "Person spoken to"],
  ["callback_preference", "Callback preference"],
  ["callback_time", "Callback time"],
];

export const QUOTE_PLAN_QUESTIONS = [
  "hourly or flat rate",
  "crew size",
  "minimum hours and travel charge",
  "same-day availability and notice needed",
  "insurance and certificate of insurance",
  "on-call interest",
  "person spoken to",
  "callback preference",
] as const;

export const QUOTE_OUTCOMES = [
  "quote_received",
  "partial_info",
  "call_back_requested",
  "transferred",
  "wrong_number",
  "declined",
  "voicemail",
  "no answer",
  "ivr_only",
] as const;

export type QuoteOutcome = (typeof QUOTE_OUTCOMES)[number];

const TOOL_OUTCOMES = [
  "quote_received",
  "partial_info",
  "call_back_requested",
  "transferred",
  "wrong_number",
  "declined",
  "voicemail",
  "ivr_only",
] as const;

const BLANK_VALUES = new Set(["unknown", "n/a", "na", "not provided", "not given", "unspecified"]);
const APPROVED_BY = /^[A-Za-z][A-Za-z0-9 .,'’-]{0,79}$/;
const TOKEN_RE = /^([a-f0-9]{16})\.([a-f0-9]{64})$/;
const PLAN_ID_RE = /^[a-f0-9]{16}$/;
const SAFE_LINE_TYPES = new Set(["landline", "fixedvoip", "tollfree"]);
const MAX_APPROVALS = 200;
const DUMMY_SECRET = crypto.createHash("sha256").update("peak-approval-dummy").digest("hex");

export type LineAssessment = {
  lineType: string;
  warning: string;
  risky: boolean;
};

export type CallbackPolicy = {
  number: string;
  mentionMainLine: boolean;
  spoken: string;
};

export type QuoteRequest = {
  toNumber: string;
  businessName: string;
  task: string;
  identityId: string;
  approvalToken: string;
  acceptLineWarning: boolean;
};

export type ApprovalRequest = {
  toNumber: string;
  approvedBy: string;
  businessName: string;
  task: string;
  identityId: string;
  numberSource: string;
  confirmPlan: boolean;
  planId: string;
};

export type QuotePlanInput = {
  toNumber: string;
  businessName: string;
  task: string;
  identity: BusinessIdentity;
  numberSource: string;
  capSec: number;
  leaveVoicemail: boolean;
  lineWarning: string;
};

export type ApprovalView = {
  id: string;
  to: string;
  approvedBy: string;
  lineType: string;
  warning: string;
  risky: boolean;
  planKey: string;
  numberSource: string;
};

export type PeekResult =
  | ({ ok: true } & ApprovalView)
  | {
      ok: false;
      error: "invalid_approval" | "approval_mismatch" | "approval_plan_mismatch" | "approval_used" | "approval_expired";
      id: string;
      approvedBy: string;
      lineType: string;
    };

type ApprovalRecord = ApprovalView & {
  secret: string;
  issuedAt: number;
  expiresAt: number;
  usedAt: number | null;
  planSummary: string;
};

type PlanPreview = {
  id: string;
  planKey: string;
  planText: string;
  planSummary: string;
  to: string;
  approvedBy: string;
  businessName: string;
  task: string;
  identityId: string;
  numberSource: string;
  lineType: string;
  warning: string;
  risky: boolean;
  expiresAt: number;
  consumed: boolean;
};

export type QuoteTurnState = {
  openerSent: boolean;
  helloCheckSent: boolean;
  silenceArmedAt: number | null;
};

export type QuoteTurnEvent =
  | { type: "session_ready"; nowMs: number }
  | { type: "tick"; nowMs: number }
  | { type: "speech_started"; nowMs: number }
  | { type: "speech_stopped"; nowMs: number }
  | { type: "caller_speech"; text: string; nowMs: number };

export type QuoteTurnEffect = { type: "speak"; text: string } | { type: "interrupt" };

const approvals = new Map<string, ApprovalRecord>();
const previews = new Map<string, PlanPreview>();

export const quoteTools = [
  {
    type: "function" as const,
    name: "report_quote",
    description:
      "Record the rate quote and end the call. Omit every field the other person did not explicitly say. Never guess. Never book, pay, or agree to terms.",
    parameters: {
      type: "object",
      properties: {
        outcome: { type: "string", enum: [...TOOL_OUTCOMES] },
        rate: { type: "string" },
        crew_size: { type: "string" },
        minimum_hours: { type: "string" },
        travel_charge: { type: "string" },
        same_day: { type: "string" },
        notice: { type: "string" },
        insurance: { type: "string" },
        certificate: { type: "string" },
        on_call: { type: "string" },
        contact_name: { type: "string" },
        callback_preference: { type: "string" },
        callback_time: { type: "string" },
        their_words: { type: "string" },
        promised: { type: "string" },
      },
      required: ["outcome"],
    },
  },
];

function asRecord(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

function cleanLine(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  const value = raw.trim().replace(/\s+/g, " ");
  if (!value || value.length > max) return "";
  if (/[\u0000-\u001f\u007f]/.test(value)) return "";
  return value;
}

function boundedInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const text = String(raw ?? "").trim();
  if (!text) return fallback;
  const value = Number(text);
  if (!Number.isInteger(value) || value < min || value > max) return fallback;
  return value;
}

function flagOn(raw: string | undefined): boolean {
  const value = String(raw || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function unknownLine(): LineAssessment {
  return { lineType: "unknown", warning: LINE_WARNING_UNKNOWN, risky: true };
}

function canonicalLine(value: string): string {
  const lower = value.toLowerCase();
  if (lower === "landline") return "landline";
  if (lower === "fixedvoip") return "fixedVoip";
  if (lower === "tollfree") return "tollFree";
  if (lower === "mobile") return "mobile";
  return value;
}

function heardHello(text: string): boolean {
  return /\bhello\b/i.test(text);
}

export function quoteTimeLimitSec(env: NodeJS.ProcessEnv = process.env): number {
  return boundedInt(
    env.PEAK_OUTBOUND_QUOTE_TIME_LIMIT_SEC,
    QUOTE_TIME_LIMIT_DEFAULT_SEC,
    QUOTE_TIME_LIMIT_MIN_SEC,
    QUOTE_TIME_LIMIT_MAX_SEC,
  );
}

export function quoteCapLabel(sec: number): string {
  if (sec % 60 === 0) {
    const minutes = sec / 60;
    return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  }
  return `${sec} seconds`;
}

export function approvalTtlSec(env: NodeJS.ProcessEnv = process.env): number {
  return boundedInt(env.PEAK_OUTBOUND_APPROVAL_TTL_SEC, APPROVAL_TTL_DEFAULT_SEC, APPROVAL_TTL_MIN_SEC, APPROVAL_TTL_MAX_SEC);
}

export function leaveVoicemailEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return flagOn(env.PEAK_OUTBOUND_LEAVE_VOICEMAIL);
}

export function numberList(raw: string | undefined): string[] {
  const seen = new Set<string>();
  for (const part of String(raw || "").split(/[\s,]+/)) {
    const value = part.trim();
    if (!isUsE164(value) || seen.has(value)) continue;
    seen.add(value);
  }
  return [...seen];
}

export function dncDecision(
  number: string,
  env: NodeJS.ProcessEnv = process.env,
): { ok: true } | { ok: false; error: "do_not_call" } {
  if (numberList(env.PEAK_OUTBOUND_DNC).includes(number)) return { ok: false, error: "do_not_call" };
  return { ok: true };
}

export function quoteAllowlistDecision(
  number: string,
  env: NodeJS.ProcessEnv = process.env,
): { ok: true } | { ok: false; error: "not_allowlisted" } {
  if (!numberList(env.PEAK_OUTBOUND_QUOTE_ALLOWLIST).includes(number)) return { ok: false, error: "not_allowlisted" };
  return { ok: true };
}

export function callbackPolicy(env: NodeJS.ProcessEnv = process.env): CallbackPolicy {
  const raw = String(env.PEAK_OUTBOUND_CALLBACK_NUMBER || "").trim();
  const number = isUsE164(raw) ? raw : "";
  if (number) {
    return {
      number,
      mentionMainLine: false,
      spoken: `The only callback number you may speak is ${number}. If they ask for a callback, offer that number and no other.`,
    };
  }
  if (flagOn(env.PEAK_OUTBOUND_MENTION_MAIN_LINE)) {
    return {
      number: "",
      mentionMainLine: true,
      spoken:
        "You have no callback number to offer. If they ask for one, say they can call the business main line. Do not speak any digits.",
    };
  }
  return {
    number: "",
    mentionMainLine: false,
    spoken:
      "You have no callback number to offer. If they ask for one, say you cannot give a number on this call. Do not speak any digits. Do not tell them to call a main line.",
  };
}

export function classifyLineType(raw: unknown): LineAssessment {
  if (typeof raw !== "string") return unknownLine();
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 40) return unknownLine();
  const lower = trimmed.toLowerCase();
  if (lower === "unknown" || lower === "null") return unknownLine();
  if (SAFE_LINE_TYPES.has(lower)) return { lineType: canonicalLine(trimmed), warning: "", risky: false };
  if (lower === "mobile") return { lineType: "mobile", warning: LINE_WARNING_MOBILE, risky: true };
  const lineType = canonicalLine(trimmed);
  return {
    lineType,
    warning: `Line type is ${lineType}. This number is not a confirmed landline. Treated as risky.`,
    risky: true,
  };
}

export async function lookupLineType(number: string, account: string, authToken: string): Promise<LineAssessment> {
  if (!account || !authToken) return unknownLine();
  const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(number)}?Fields=line_type_intelligence`;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${Buffer.from(`${account}:${authToken}`).toString("base64")}`,
        Accept: "application/json",
        "Accept-Encoding": SAFE_ACCEPT_ENCODING,
      },
    });
    if (!response.ok) {
      console.error("outbound lookup failed", response.status);
      return unknownLine();
    }
    const body = (await response.json()) as {
      line_type_intelligence?: { type?: unknown; error_code?: unknown } | null;
    };
    const intel = body?.line_type_intelligence;
    if (!intel || typeof intel !== "object" || intel.error_code) return unknownLine();
    return classifyLineType(intel.type);
  } catch (err) {
    console.error("outbound lookup failed", err instanceof Error ? err.message : "error");
    return unknownLine();
  }
}

export function requestMode(body: unknown): "book" | "quote" | "invalid" {
  const record = asRecord(body);
  if (!record || record.mode == null || record.mode === "") return "book";
  if (typeof record.mode !== "string") return "invalid";
  const value = record.mode.trim().toLowerCase();
  if (!value || value === "book" || value === "booking") return "book";
  if (value === "quote") return "quote";
  return "invalid";
}

export function parseQuoteRequest(
  body: unknown,
  personal: (text: string) => boolean,
): { ok: true; value: QuoteRequest } | { ok: false; error: string } {
  const record = asRecord(body);
  if (!record) return { ok: false, error: "invalid_json" };
  const toNumber = typeof record.to_number === "string" ? record.to_number.trim() : "";
  if (!isUsE164(toNumber)) return { ok: false, error: "invalid_number" };
  const businessName = cleanLine(record.business_name, 80);
  if (!businessName) return { ok: false, error: "invalid_business_name" };
  const task = cleanLine(record.task, 240);
  if (!task) return { ok: false, error: "invalid_task" };
  let identityId = "";
  if (record.identity != null && record.identity !== "") {
    if (typeof record.identity !== "string") return { ok: false, error: "invalid_identity" };
    identityId = record.identity.trim().toLowerCase();
    if (!identityId || identityId.length > 32 || /[\u0000-\u001f\u007f]/.test(identityId)) {
      return { ok: false, error: "invalid_identity" };
    }
  }
  if (record.approval_token == null || record.approval_token === "") return { ok: false, error: "approval_required" };
  if (typeof record.approval_token !== "string") return { ok: false, error: "invalid_approval" };
  const approvalToken = record.approval_token.trim();
  if (!approvalToken) return { ok: false, error: "approval_required" };
  if (approvalToken.length > 200 || /\s/.test(approvalToken)) return { ok: false, error: "invalid_approval" };
  const spoken = [businessName, task, identityId].join("\n");
  if (personal(spoken)) return { ok: false, error: "personal_data" };
  return {
    ok: true,
    value: {
      toNumber,
      businessName,
      task,
      identityId,
      approvalToken,
      acceptLineWarning: record.accept_line_warning === true,
    },
  };
}

export function parseApprovalRequest(
  body: unknown,
  personal: (text: string) => boolean,
): { ok: true; value: ApprovalRequest } | { ok: false; error: string } {
  const record = asRecord(body);
  if (!record) return { ok: false, error: "invalid_json" };
  const toNumber = typeof record.to_number === "string" ? record.to_number.trim() : "";
  if (!isUsE164(toNumber)) return { ok: false, error: "invalid_number" };
  const approvedBy = typeof record.approved_by === "string" ? record.approved_by.trim().replace(/\s+/g, " ") : "";
  if (!APPROVED_BY.test(approvedBy)) return { ok: false, error: "invalid_approved_by" };
  const businessName = cleanLine(record.business_name, 80);
  if (!businessName) return { ok: false, error: "invalid_business_name" };
  const task = cleanLine(record.task, 240);
  if (!task) return { ok: false, error: "invalid_task" };
  let identityId = "";
  if (record.identity != null && record.identity !== "") {
    if (typeof record.identity !== "string") return { ok: false, error: "invalid_identity" };
    identityId = record.identity.trim().toLowerCase();
    if (!identityId || identityId.length > 32 || /[\u0000-\u001f\u007f]/.test(identityId)) {
      return { ok: false, error: "invalid_identity" };
    }
  }
  let numberSource = NOT_PROVIDED;
  if (record.number_source != null && record.number_source !== "") {
    if (typeof record.number_source !== "string") return { ok: false, error: "invalid_number_source" };
    const cleaned = cleanLine(record.number_source, 80);
    if (!cleaned) return { ok: false, error: "invalid_number_source" };
    if (personal(cleaned)) return { ok: false, error: "personal_data" };
    numberSource = cleaned;
  }
  const spoken = [businessName, task, identityId, numberSource === NOT_PROVIDED ? "" : numberSource].join("\n");
  if (personal(spoken)) return { ok: false, error: "personal_data" };
  const confirmPlan = record.confirm_plan === true;
  let planId = "";
  if (confirmPlan) {
    if (typeof record.plan_id !== "string" || !PLAN_ID_RE.test(record.plan_id.trim())) {
      return { ok: false, error: "plan_required" };
    }
    planId = record.plan_id.trim();
  }
  return {
    ok: true,
    value: { toNumber, approvedBy, businessName, task, identityId, numberSource, confirmPlan, planId },
  };
}

export function blankQuote(): QuoteCapture {
  const quote = {} as QuoteCapture;
  for (const field of QUOTE_FIELDS) quote[field] = NOT_PROVIDED;
  return quote;
}

export function quoteFieldValue(raw: unknown, max = 160): string {
  if (typeof raw !== "string") return NOT_PROVIDED;
  const value = raw.trim().replace(/\s+/g, " ");
  if (!value || value.length > max) return NOT_PROVIDED;
  if (/[\u0000-\u001f\u007f]/.test(value)) return NOT_PROVIDED;
  if (BLANK_VALUES.has(value.toLowerCase())) return NOT_PROVIDED;
  return value;
}

export function captureQuote(raw: unknown, redact: (text: string) => string = (text) => text): QuoteCapture {
  const record = asRecord(raw);
  const quote = blankQuote();
  if (!record) return quote;
  for (const field of QUOTE_FIELDS) {
    const cleaned = quoteFieldValue(record[field]);
    if (cleaned === NOT_PROVIDED) continue;
    const redacted = redact(cleaned).trim();
    quote[field] = redacted || NOT_PROVIDED;
  }
  return quote;
}

export function captureQuoteNotes(
  raw: unknown,
  redact: (text: string) => string = (text) => text,
): { theirWords: string; promised: string } {
  const record = asRecord(raw);
  const their = quoteFieldValue(record?.their_words, 500);
  const promised = quoteFieldValue(record?.promised, 500);
  return {
    theirWords: their === NOT_PROVIDED ? NOT_PROVIDED : redact(their).trim() || NOT_PROVIDED,
    promised: promised === NOT_PROVIDED ? NOT_PROVIDED : redact(promised).trim() || NOT_PROVIDED,
  };
}

export function normalizeQuoteOutcome(raw: unknown): QuoteOutcome | "" {
  const record = asRecord(raw);
  const value = String(record?.outcome ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  if (value === "quote received" || value === "quoted" || value === "quote") return "quote_received";
  if (value === "partial info" || value === "partial") return "partial_info";
  if (value === "call back requested" || value === "callback requested" || value === "callback") return "call_back_requested";
  if (value === "transferred" || value === "transfer") return "transferred";
  if (value === "wrong number" || value === "closed" || value === "closed business") return "wrong_number";
  if (value === "declined" || value === "decline") return "declined";
  if (value === "voicemail" || value === "voice mail" || value === "machine") return "voicemail";
  if (value === "ivr only" || value === "ivr" || value === "recorded message" || value === "menu") return "ivr_only";
  if (value === "no answer" || value === "noanswer") return "no answer";
  return "";
}

export function quoteOpeningSentence(contacts: string, business: string): string {
  return `Hi, this is an AI assistant calling for ${contacts} at ${business}, and this call is recorded.`;
}

export function buildQuoteGreeting(contacts: string, business: string, task: string): string {
  return `${quoteOpeningSentence(contacts, business)} I'm calling to ask for rates on ${task}.`;
}

export function quotePlanKey(input: QuotePlanInput): string {
  return [
    input.toNumber,
    input.identity.id,
    input.identity.business,
    input.identity.contacts,
    input.businessName,
    input.task,
    buildQuoteGreeting(input.identity.contacts, input.identity.business, input.task),
    String(input.capSec),
    input.leaveVoicemail ? "1" : "0",
    input.numberSource,
  ].join("\n");
}

export function buildQuotePlanText(input: QuotePlanInput): string {
  const voicemail = input.leaveVoicemail ? "You may leave one short voicemail." : "Do not leave voicemail.";
  const questions = QUOTE_PLAN_QUESTIONS.map((item) => `- ${item}`).join("\n");
  return [
    `Who: An AI assistant calling for ${input.identity.contacts} at ${input.identity.business}.`,
    `Destination: ${input.toNumber}`,
    `Number source: ${input.numberSource}`,
    `Line warning: ${input.lineWarning || "(none)"}`,
    `Opening line: ${buildQuoteGreeting(input.identity.contacts, input.identity.business, input.task)}`,
    "Questions:",
    questions,
    `Limits: ${quoteCapLabel(input.capSec)}. ${NEVER_COMMIT} ${voicemail}`,
  ].join("\n");
}

export function planLogSummary(input: QuotePlanInput): string {
  const voicemail = input.leaveVoicemail ? "yes" : "no";
  return [
    `who=${input.identity.contacts} at ${input.identity.business}`,
    `source=${input.numberSource}`,
    `cap=${quoteCapLabel(input.capSec)}`,
    `voicemail=${voicemail}`,
    "commit=never",
    `opening=${buildQuoteGreeting(input.identity.contacts, input.identity.business, input.task)}`,
  ].join(" ");
}

export function buildQuoteInstructions(input: {
  business: string;
  contacts: string;
  task: string;
  callbackSpoken: string;
  leaveVoicemail: boolean;
}): string {
  const greeting = buildQuoteGreeting(input.contacts, input.business, input.task);
  const voicemail = input.leaveVoicemail
    ? "voicemail — you reached a voicemail box. You may leave one short message, then call report_quote with voicemail. Do not press buttons."
    : "voicemail — you hear a voicemail greeting or a beep. Call report_quote with voicemail immediately. Do not leave a message. Do not press buttons. Stop talking.";
  return `## Role
You are an AI assistant calling for ${input.contacts} at ${input.business}. You are not a person, and you are not ${input.contacts}. Say that you are an AI assistant if asked.

## This call
You are calling to ask for rates on: ${input.task}.
This is an informational rate request. Do not pitch, do not sell, and do not market.
This is the only call. Do not offer to call them again from this line.

## Never commit
You never book, pay, give card details, put down a deposit, sign up, or agree to terms. If they ask you to do any of those, say someone will follow up. Do not say yes.

## Turn taking
Wait until the other party says hello before you speak. The opening line is spoken once after that hello. Do not say it again.
If they interrupt, stop speaking.
Ask one question at a time.
If there is about 5 seconds of silence, say Hello? once, then wait. Do not say Hello? again.

## Greeting
Spoken once, only after they say hello. Do not repeat it.
${greeting}

## Numbers
Repeat each price and each number back and get confirmation before you record it.
Before you hang up, read everything back: every figure and every detail you captured. Then call report_quote.

## What to collect
Ask one thing at a time. Call report_quote once, when they have given what they will give, or immediately for voicemail, a recorded message, or a phone menu.
Record only words they explicitly said. If you did not hear a fact, omit that field. An omitted field is stored as not provided. Never invent a rate, a crew size, a fee, a name, or any other fact.
Put their own words in their_words. Put what they said they would do in promised, separated by semicolons. For a callback, record contact_name and callback_time when they give them.

Fields:
- rate — hourly or flat rate, in their words
- crew_size — how many people
- minimum_hours — minimum hours
- travel_charge — travel or trip charge
- same_day — whether they can do same-day work
- notice — how much notice they need
- insurance — whether they carry insurance
- certificate — whether they can send a certificate of insurance
- on_call — whether they are interested in a standing on-call arrangement
- contact_name — the name of the person you spoke with
- callback_preference — how they want to be reached
- callback_time — when they asked to be called back

## Callback
${input.callbackSpoken}

## Outcomes
- quote_received — you spoke with a person and recorded a rate they actually said.
- partial_info — you spoke with a person and recorded some of what they said, without a usable rate.
- call_back_requested — they asked for a callback. Record the name and time if they gave them.
- transferred — they transferred the call.
- wrong_number — wrong number, or the business is closed.
- declined — they will not give rates.
- ${voicemail}
- ivr_only — a phone menu or a recorded message that is not a person. Call report_quote with ivr_only. Do not press keys. Do not navigate the menu. Stop talking.

## Voice
Spoken word only. No markdown, no lists, no emojis. One or two short sentences. English only.
`;
}

function promisedLines(raw: string): string[] {
  if (!raw || raw === NOT_PROVIDED) return [];
  return raw
    .split(/\s*;\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `- ${part}`);
}

export function buildQuoteEmail(input: {
  inbox: string;
  outcome: string;
  identityBusiness: string;
  identityContacts: string;
  businessName: string;
  task: string;
  to: string;
  lineType: string;
  lineWarning: string;
  callbackNumber: string;
  mentionMainLine: boolean;
  approvedBy: string;
  approvalId: string;
  quote: QuoteCapture;
  theirWords: string;
  promised: string;
  detection: string;
  recordingUrl: string;
  callSid: string;
}): string {
  const outcome = input.outcome || "no answer";
  const headline = input.quote.rate && input.quote.rate !== NOT_PROVIDED ? input.quote.rate : "(no headline rate)";
  const words =
    input.theirWords && input.theirWords !== NOT_PROVIDED ? `"${input.theirWords}"` : "(none)";
  const promised = promisedLines(input.promised);
  const unclear = QUOTE_LABELS.filter(([field]) => (input.quote[field] || NOT_PROVIDED) === NOT_PROVIDED).map(
    ([, label]) => `- ${label}`,
  );
  const lines = [
    `${outcome} — ${headline}`,
    `Their words: ${words}`,
    "Promised:",
    ...(promised.length ? promised : ["- (none)"]),
    "Unclear / not provided:",
    ...(unclear.length ? unclear : ["- (none)"]),
  ];
  for (const [field, label] of QUOTE_LABELS) lines.push(`${label}: ${input.quote[field] || NOT_PROVIDED}`);
  lines.push(`Line warning: ${input.lineWarning || "(none)"}`, `Recording: ${input.recordingUrl || "(none)"}`);
  lines.push(
    "Peak Signal outbound quote",
    `Inbox: ${input.inbox}`,
    "Mode: quote",
    `Outcome: ${outcome}`,
    `Identity: ${input.identityBusiness}`,
    `Contacts: ${input.identityContacts}`,
    `Business: ${input.businessName}`,
    `Task: ${input.task}`,
    `Called: ${input.to}`,
    `Line type: ${input.lineType || "unknown"}`,
    `Callback offered: ${input.callbackNumber || "(none)"}`,
    `Main line mention: ${input.mentionMainLine ? "yes" : "no"}`,
    `Approved by: ${input.approvedBy || "(none)"}`,
    `Approval: ${input.approvalId || "(none)"}`,
    `Detection: ${input.detection || "(none)"}`,
    `CallSid: ${input.callSid}`,
  );
  return lines.join("\n");
}

export function logApprovalEvent(
  kind: "planned" | "issued" | "used" | "rejected",
  fields: { id: string; to: string; by: string; lineType: string; reason: string; plan?: string },
  nowMs: number,
): void {
  const id = /^[a-f0-9]{16}$/.test(fields.id) ? fields.id : "-";
  const by = fields.by ? fields.by : "-";
  const line = fields.lineType ? fields.lineType : "-";
  const reason = fields.reason ? fields.reason : "-";
  const plan = fields.plan ? fields.plan.replace(/[\r\n]+/g, " | ").slice(0, 2000) : "";
  const suffix = plan ? ` plan=${plan}` : "";
  console.log(
    `outbound approval ${kind} id=${id} to=${fields.to} by=${by} at=${new Date(nowMs).toISOString()} line=${line} reason=${reason}${suffix}`,
  );
}

export function initialQuoteTurn(): QuoteTurnState {
  return { openerSent: false, helloCheckSent: false, silenceArmedAt: null };
}

export function reduceQuoteTurn(
  state: QuoteTurnState,
  event: QuoteTurnEvent,
  opener: string,
): { state: QuoteTurnState; effects: QuoteTurnEffect[] } {
  if (event.type === "session_ready") {
    if (state.openerSent || state.helloCheckSent) return { state, effects: [] };
    return { state: { ...state, silenceArmedAt: event.nowMs }, effects: [] };
  }
  if (event.type === "tick") {
    if (state.openerSent || state.helloCheckSent || state.silenceArmedAt == null) return { state, effects: [] };
    if (event.nowMs - state.silenceArmedAt < QUOTE_SILENCE_MS) return { state, effects: [] };
    return {
      state: { ...state, helloCheckSent: true, silenceArmedAt: null },
      effects: [{ type: "speak", text: QUOTE_HELLO_CHECK }],
    };
  }
  if (event.type === "speech_started") {
    const effects: QuoteTurnEffect[] = state.openerSent ? [{ type: "interrupt" }] : [];
    return { state: { ...state, silenceArmedAt: null }, effects };
  }
  if (event.type === "speech_stopped") {
    if (state.openerSent || state.helloCheckSent) return { state: { ...state, silenceArmedAt: null }, effects: [] };
    return { state: { ...state, silenceArmedAt: event.nowMs }, effects: [] };
  }
  const text = event.text.trim();
  if (!text) return { state, effects: [] };
  const quiet = { ...state, silenceArmedAt: null };
  if (!state.openerSent && heardHello(text)) {
    return { state: { ...quiet, openerSent: true }, effects: [{ type: "speak", text: opener }] };
  }
  return { state: quiet, effects: [] };
}

function viewOf(rec: ApprovalRecord): ApprovalView {
  return {
    id: rec.id,
    to: rec.to,
    approvedBy: rec.approvedBy,
    lineType: rec.lineType,
    warning: rec.warning,
    risky: rec.risky,
    planKey: rec.planKey,
    numberSource: rec.numberSource,
  };
}

function rememberApproval(rec: ApprovalRecord): void {
  while (approvals.size >= MAX_APPROVALS) {
    let drop = "";
    for (const [id, item] of approvals) {
      if (item.usedAt != null) {
        drop = id;
        break;
      }
    }
    if (!drop) drop = approvals.keys().next().value || "";
    if (!drop) break;
    approvals.delete(drop);
  }
  approvals.set(rec.id, rec);
}

function rememberPreview(rec: PlanPreview): void {
  while (previews.size >= MAX_APPROVALS) {
    let drop = "";
    for (const [id, item] of previews) {
      if (item.consumed) {
        drop = id;
        break;
      }
    }
    if (!drop) drop = previews.keys().next().value || "";
    if (!drop) break;
    previews.delete(drop);
  }
  previews.set(rec.id, rec);
}

function planInput(
  value: ApprovalRequest,
  identity: BusinessIdentity,
  line: LineAssessment,
  env: NodeJS.ProcessEnv,
): QuotePlanInput {
  return {
    toNumber: value.toNumber,
    businessName: value.businessName,
    task: value.task,
    identity,
    numberSource: value.numberSource,
    capSec: quoteTimeLimitSec(env),
    leaveVoicemail: leaveVoicemailEnabled(env),
    lineWarning: line.warning,
  };
}

export async function previewApproval(input: {
  value: ApprovalRequest;
  nowMs: number;
  env?: NodeJS.ProcessEnv;
  account: string;
  authToken: string;
}): Promise<
  | {
      ok: true;
      planId: string;
      plan: string;
      expiresAt: string;
      toNumber: string;
      lineType: string;
      warning: string;
      risky: boolean;
    }
  | { ok: false; error: "unknown_identity" | "do_not_call" | "not_allowlisted" }
> {
  const env = input.env || process.env;
  const identity = resolveIdentity(input.value.identityId, env);
  if (!identity.ok) return identity;
  const dnc = dncDecision(input.value.toNumber, env);
  if (!dnc.ok) return dnc;
  const allowed = quoteAllowlistDecision(input.value.toNumber, env);
  if (!allowed.ok) return allowed;
  const line = await lookupLineType(input.value.toNumber, input.account, input.authToken);
  const built = planInput(input.value, identity.identity, line, env);
  const id = crypto.randomBytes(8).toString("hex");
  const ttlMs = approvalTtlSec(env) * 1000;
  const rec: PlanPreview = {
    id,
    planKey: quotePlanKey(built),
    planText: buildQuotePlanText(built),
    planSummary: planLogSummary(built),
    to: input.value.toNumber,
    approvedBy: input.value.approvedBy,
    businessName: input.value.businessName,
    task: input.value.task,
    identityId: identity.identity.id,
    numberSource: input.value.numberSource,
    lineType: line.lineType,
    warning: line.warning,
    risky: line.risky,
    expiresAt: input.nowMs + ttlMs,
    consumed: false,
  };
  rememberPreview(rec);
  logApprovalEvent(
    "planned",
    {
      id,
      to: input.value.toNumber,
      by: input.value.approvedBy,
      lineType: line.lineType,
      reason: "planned",
      plan: rec.planSummary,
    },
    input.nowMs,
  );
  return {
    ok: true,
    planId: id,
    plan: rec.planText,
    expiresAt: new Date(rec.expiresAt).toISOString(),
    toNumber: input.value.toNumber,
    lineType: line.lineType,
    warning: line.warning,
    risky: line.risky,
  };
}

export function confirmApproval(input: {
  value: ApprovalRequest;
  nowMs: number;
  env?: NodeJS.ProcessEnv;
}): 
  | {
      ok: true;
      token: string;
      id: string;
      expiresAt: string;
      toNumber: string;
      lineType: string;
      warning: string;
      risky: boolean;
      plan: string;
    }
  | {
      ok: false;
      error: "unknown_identity" | "plan_required" | "invalid_plan" | "plan_used" | "plan_expired" | "approval_plan_mismatch";
    } {
  const env = input.env || process.env;
  if (!input.value.confirmPlan || !input.value.planId) return { ok: false, error: "plan_required" };
  const identity = resolveIdentity(input.value.identityId, env);
  if (!identity.ok) return identity;
  const preview = previews.get(input.value.planId);
  if (!preview) return { ok: false, error: "invalid_plan" };
  if (preview.consumed) return { ok: false, error: "plan_used" };
  if (input.nowMs >= preview.expiresAt) return { ok: false, error: "plan_expired" };
  const built = planInput(input.value, identity.identity, { lineType: preview.lineType, warning: preview.warning, risky: preview.risky }, env);
  if (quotePlanKey(built) !== preview.planKey || preview.to !== input.value.toNumber) {
    return { ok: false, error: "approval_plan_mismatch" };
  }
  preview.consumed = true;
  const id = crypto.randomBytes(8).toString("hex");
  const secret = crypto.randomBytes(32).toString("hex");
  const ttlMs = approvalTtlSec(env) * 1000;
  const rec: ApprovalRecord = {
    id,
    secret,
    to: preview.to,
    approvedBy: input.value.approvedBy,
    issuedAt: input.nowMs,
    expiresAt: input.nowMs + ttlMs,
    usedAt: null,
    lineType: preview.lineType,
    warning: preview.warning,
    risky: preview.risky,
    planKey: preview.planKey,
    numberSource: preview.numberSource,
    planSummary: preview.planSummary,
  };
  rememberApproval(rec);
  logApprovalEvent(
    "issued",
    {
      id,
      to: rec.to,
      by: rec.approvedBy,
      lineType: rec.lineType,
      reason: "issued",
      plan: rec.planSummary,
    },
    input.nowMs,
  );
  return {
    ok: true,
    token: `${id}.${secret}`,
    id,
    expiresAt: new Date(rec.expiresAt).toISOString(),
    toNumber: rec.to,
    lineType: rec.lineType,
    warning: rec.warning,
    risky: rec.risky,
    plan: preview.planText,
  };
}

export function peekApproval(
  token: string,
  expected: {
    toNumber: string;
    businessName: string;
    task: string;
    identity: BusinessIdentity;
    capSec: number;
    leaveVoicemail: boolean;
  },
  nowMs: number,
  sameSecret: (provided: string, expected: string) => boolean,
): PeekResult {
  const match = TOKEN_RE.exec(String(token || "").trim());
  if (!match) return { ok: false, error: "invalid_approval", id: "", approvedBy: "", lineType: "" };
  const id = match[1];
  const secret = match[2];
  const rec = approvals.get(id);
  const matches = sameSecret(secret, rec ? rec.secret : DUMMY_SECRET);
  if (!rec || !matches) return { ok: false, error: "invalid_approval", id, approvedBy: "", lineType: "" };
  if (rec.usedAt != null) {
    return { ok: false, error: "approval_used", id: rec.id, approvedBy: rec.approvedBy, lineType: rec.lineType };
  }
  if (nowMs >= rec.expiresAt) {
    return { ok: false, error: "approval_expired", id: rec.id, approvedBy: rec.approvedBy, lineType: rec.lineType };
  }
  if (rec.to !== expected.toNumber) {
    return { ok: false, error: "approval_mismatch", id: rec.id, approvedBy: rec.approvedBy, lineType: rec.lineType };
  }
  const key = quotePlanKey({
    toNumber: expected.toNumber,
    businessName: expected.businessName,
    task: expected.task,
    identity: expected.identity,
    numberSource: rec.numberSource,
    capSec: expected.capSec,
    leaveVoicemail: expected.leaveVoicemail,
    lineWarning: rec.warning,
  });
  if (key !== rec.planKey) {
    return { ok: false, error: "approval_plan_mismatch", id: rec.id, approvedBy: rec.approvedBy, lineType: rec.lineType };
  }
  return { ok: true, ...viewOf(rec) };
}

export function consumeApproval(id: string, nowMs: number): ApprovalView | null {
  const rec = approvals.get(id);
  if (!rec || rec.usedAt != null || nowMs >= rec.expiresAt) return null;
  rec.usedAt = nowMs;
  const view = viewOf(rec);
  logApprovalEvent(
    "used",
    { id: view.id, to: view.to, by: view.approvedBy, lineType: view.lineType, reason: "used", plan: rec.planSummary },
    nowMs,
  );
  return view;
}

export function resetApprovalsForTest(): void {
  approvals.clear();
  previews.clear();
}
