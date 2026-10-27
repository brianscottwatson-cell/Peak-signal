/**
 * Quote mode for Peak outbound calls.
 * Same gate as booking: nothing here runs unless PEAK_OUTBOUND_ENABLED=1.
 * Booking's greeting, outcomes, and 240 second cap stay in peak-outbound.ts.
 *
 * PEAK_OUTBOUND_QUOTE_ALLOWLIST     comma-separated US E.164. Empty blocks every quote call.
 * PEAK_OUTBOUND_DNC                 comma-separated US E.164. Listed numbers are not dialed.
 * PEAK_OUTBOUND_QUOTE_TIME_LIMIT_SEC  default 420, allowed 60 through 900. Otherwise 420.
 * PEAK_OUTBOUND_APPROVAL_TTL_SEC    default 1800, allowed 60 through 86400. Otherwise 1800.
 * PEAK_OUTBOUND_CALLBACK_NUMBER     only number the agent may speak. Read at call time.
 * PEAK_OUTBOUND_MENTION_MAIN_LINE   1 to mention the main line when no callback number is set.
 *                                   No digits are spoken in that case.
 * PEAK_OUTBOUND_IDENTITY            identity id when the request omits one.
 * PEAK_OUTBOUND_IDENTITIES          extra identities. See peak-identity.ts.
 *
 * Approval tokens are random, kept in process memory, and checked here.
 * No signing key is stored in the repo. A restart drops unused tokens, which
 * fails closed. The full token is returned once to the caller and is not logged.
 */
import crypto from "node:crypto";
import { SAFE_ACCEPT_ENCODING } from "../brotli-guard";
import { resolveIdentity } from "./peak-identity";
import { isUsE164 } from "./peak-phone";

export { resolveIdentity };

export const NOT_PROVIDED = "not provided";
export const LINE_WARNING_MOBILE =
  "Line type is mobile. This number is flagged as risky because calls to cell numbers can require prior express consent.";
export const LINE_WARNING_UNKNOWN = "Line type could not be determined. Treated as risky.";

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
];

const BLANK_VALUES = new Set(["unknown", "n/a", "na", "not provided", "not given", "unspecified"]);
const APPROVED_BY = /^[A-Za-z][A-Za-z0-9 .,'’-]{0,79}$/;
const TOKEN_RE = /^([a-f0-9]{16})\.([a-f0-9]{64})$/;
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

export type ApprovalView = {
  id: string;
  to: string;
  approvedBy: string;
  lineType: string;
  warning: string;
  risky: boolean;
};

export type PeekResult =
  | ({ ok: true } & ApprovalView)
  | {
      ok: false;
      error: "invalid_approval" | "approval_mismatch" | "approval_used" | "approval_expired";
      id: string;
      approvedBy: string;
      lineType: string;
    };

type ApprovalRecord = ApprovalView & {
  secret: string;
  issuedAt: number;
  expiresAt: number;
  usedAt: number | null;
};

const approvals = new Map<string, ApprovalRecord>();

export const quoteTools = [
  {
    type: "function" as const,
    name: "report_quote",
    description:
      "Record the rate quote and end the call. Omit every field the other person did not explicitly say. Never guess.",
    parameters: {
      type: "object",
      properties: {
        outcome: { type: "string", enum: ["quoted", "declined", "voicemail"] },
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

export function quoteTimeLimitSec(env: NodeJS.ProcessEnv = process.env): number {
  return boundedInt(
    env.PEAK_OUTBOUND_QUOTE_TIME_LIMIT_SEC,
    QUOTE_TIME_LIMIT_DEFAULT_SEC,
    QUOTE_TIME_LIMIT_MIN_SEC,
    QUOTE_TIME_LIMIT_MAX_SEC,
  );
}

export function approvalTtlSec(env: NodeJS.ProcessEnv = process.env): number {
  return boundedInt(env.PEAK_OUTBOUND_APPROVAL_TTL_SEC, APPROVAL_TTL_DEFAULT_SEC, APPROVAL_TTL_MIN_SEC, APPROVAL_TTL_MAX_SEC);
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
): { ok: true; toNumber: string; approvedBy: string } | { ok: false; error: string } {
  const record = asRecord(body);
  if (!record) return { ok: false, error: "invalid_json" };
  const toNumber = typeof record.to_number === "string" ? record.to_number.trim() : "";
  if (!isUsE164(toNumber)) return { ok: false, error: "invalid_number" };
  const approvedBy = typeof record.approved_by === "string" ? record.approved_by.trim().replace(/\s+/g, " ") : "";
  if (!APPROVED_BY.test(approvedBy)) return { ok: false, error: "invalid_approved_by" };
  return { ok: true, toNumber, approvedBy };
}

export function blankQuote(): QuoteCapture {
  const quote = {} as QuoteCapture;
  for (const field of QUOTE_FIELDS) quote[field] = NOT_PROVIDED;
  return quote;
}

export function quoteFieldValue(raw: unknown): string {
  if (typeof raw !== "string") return NOT_PROVIDED;
  const value = raw.trim().replace(/\s+/g, " ");
  if (!value || value.length > 160) return NOT_PROVIDED;
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

export function normalizeQuoteOutcome(raw: unknown): "quoted" | "declined" | "voicemail" | "" {
  const record = asRecord(raw);
  const value = String(record?.outcome ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  if (value === "quoted" || value === "quote") return "quoted";
  if (value === "declined" || value === "decline") return "declined";
  if (value === "voicemail" || value === "ivr" || value === "machine") return "voicemail";
  return "";
}

export function buildQuoteGreeting(business: string, task: string): string {
  return `Hi, this is an AI assistant calling on behalf of ${business}. This call is being recorded. I'm calling to ask for rates on ${task}.`;
}

export function buildQuoteInstructions(input: {
  business: string;
  contacts: string;
  task: string;
  callbackSpoken: string;
}): string {
  const greeting = buildQuoteGreeting(input.business, input.task);
  return `## Role
You are an AI assistant calling on behalf of ${input.business}. The people you represent are ${input.contacts}. You are not a person, and you are not ${input.contacts}. Say that you are an AI assistant if asked.

## This call
You are calling to ask for rates on: ${input.task}.
This is an informational rate request. Do not pitch, do not sell, and do not market.
This is the only call. Do not offer to call them again from this line.

## Greeting
Already spoken. Do not repeat it.
${greeting}

## What to collect
Ask one thing at a time. Call report_quote once, when they have given what they will give, or immediately for voicemail or a phone menu.
Record only words they explicitly said. If you did not hear a fact, omit that field. An omitted field is stored as not provided. Never invent a rate, a crew size, a fee, a name, or any other fact.

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

## Callback
${input.callbackSpoken}

## Outcomes
- quoted — you spoke with a person and recorded what they actually said.
- declined — they will not give rates, or the call ends without a quote.
- voicemail — you hear a voicemail greeting, a beep, or a phone menu. Call report_quote with voicemail immediately. Do not leave a message. Do not press buttons. Stop talking.

## Voice
Spoken word only. No markdown, no lists, no emojis. One or two short sentences. English only.
`;
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
  detection: string;
  recordingUrl: string;
  callSid: string;
}): string {
  const lines = [
    "Peak Signal outbound quote",
    `Inbox: ${input.inbox}`,
    "Mode: quote",
    `Outcome: ${input.outcome || "no answer"}`,
    `Identity: ${input.identityBusiness}`,
    `Contacts: ${input.identityContacts}`,
    `Business: ${input.businessName}`,
    `Task: ${input.task}`,
    `Called: ${input.to}`,
    `Line type: ${input.lineType || "unknown"}`,
    `Line warning: ${input.lineWarning || "(none)"}`,
    `Callback offered: ${input.callbackNumber || "(none)"}`,
    `Main line mention: ${input.mentionMainLine ? "yes" : "no"}`,
    `Approved by: ${input.approvedBy || "(none)"}`,
    `Approval: ${input.approvalId || "(none)"}`,
  ];
  for (const [field, label] of QUOTE_LABELS) lines.push(`${label}: ${input.quote[field] || NOT_PROVIDED}`);
  lines.push(`Detection: ${input.detection || "(none)"}`, `Recording: ${input.recordingUrl || "(none)"}`, `CallSid: ${input.callSid}`);
  return lines.join("\n");
}

export function logApprovalEvent(
  kind: "issued" | "used" | "rejected",
  fields: { id: string; to: string; by: string; lineType: string; reason: string },
  nowMs: number,
): void {
  const id = /^[a-f0-9]{16}$/.test(fields.id) ? fields.id : "-";
  const by = fields.by ? fields.by : "-";
  const line = fields.lineType ? fields.lineType : "-";
  const reason = fields.reason ? fields.reason : "-";
  console.log(
    `outbound approval ${kind} id=${id} to=${fields.to} by=${by} at=${new Date(nowMs).toISOString()} line=${line} reason=${reason}`,
  );
}

function viewOf(rec: ApprovalRecord): ApprovalView {
  return {
    id: rec.id,
    to: rec.to,
    approvedBy: rec.approvedBy,
    lineType: rec.lineType,
    warning: rec.warning,
    risky: rec.risky,
  };
}

function remember(rec: ApprovalRecord): void {
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

export async function issueApproval(input: {
  toNumber: string;
  approvedBy: string;
  nowMs: number;
  env?: NodeJS.ProcessEnv;
  account: string;
  authToken: string;
}): Promise<
  | {
      ok: true;
      token: string;
      id: string;
      expiresAt: string;
      toNumber: string;
      lineType: string;
      warning: string;
      risky: boolean;
    }
  | { ok: false; error: "invalid_number" | "invalid_approved_by" | "do_not_call" | "not_allowlisted" }
> {
  const env = input.env || process.env;
  if (!isUsE164(input.toNumber)) return { ok: false, error: "invalid_number" };
  if (!APPROVED_BY.test(input.approvedBy)) return { ok: false, error: "invalid_approved_by" };
  const dnc = dncDecision(input.toNumber, env);
  if (!dnc.ok) return dnc;
  const allowed = quoteAllowlistDecision(input.toNumber, env);
  if (!allowed.ok) return allowed;
  const line = await lookupLineType(input.toNumber, input.account, input.authToken);
  const id = crypto.randomBytes(8).toString("hex");
  const secret = crypto.randomBytes(32).toString("hex");
  const ttlMs = approvalTtlSec(env) * 1000;
  const rec: ApprovalRecord = {
    id,
    secret,
    to: input.toNumber,
    approvedBy: input.approvedBy,
    issuedAt: input.nowMs,
    expiresAt: input.nowMs + ttlMs,
    usedAt: null,
    lineType: line.lineType,
    warning: line.warning,
    risky: line.risky,
  };
  remember(rec);
  logApprovalEvent(
    "issued",
    { id, to: input.toNumber, by: input.approvedBy, lineType: line.lineType, reason: "issued" },
    input.nowMs,
  );
  return {
    ok: true,
    token: `${id}.${secret}`,
    id,
    expiresAt: new Date(rec.expiresAt).toISOString(),
    toNumber: input.toNumber,
    lineType: line.lineType,
    warning: line.warning,
    risky: line.risky,
  };
}

export function peekApproval(
  token: string,
  toNumber: string,
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
  if (rec.to !== toNumber) {
    return { ok: false, error: "approval_mismatch", id: rec.id, approvedBy: rec.approvedBy, lineType: rec.lineType };
  }
  return { ok: true, ...viewOf(rec) };
}

export function consumeApproval(id: string, nowMs: number): ApprovalView | null {
  const rec = approvals.get(id);
  if (!rec || rec.usedAt != null || nowMs >= rec.expiresAt) return null;
  rec.usedAt = nowMs;
  const view = viewOf(rec);
  logApprovalEvent("used", { id: view.id, to: view.to, by: view.approvedBy, lineType: view.lineType, reason: "used" }, nowMs);
  return view;
}

export function resetApprovalsForTest(): void {
  approvals.clear();
}
