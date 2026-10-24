/**
 * Peak Signal outbound voice — one manual Twilio call per authenticated request.
 * Mounted at POST /api/voice/outbound. Off unless PEAK_OUTBOUND_ENABLED=1.
 *
 * The From number is PEAK_OUTBOUND_FROM. Inbound voice mode is left alone.
 * This file does not redial, queue, or retry.
 *
 * PEAK_OUTBOUND_ENABLED=1
 * PEAK_OUTBOUND_SECRET              header X-Peak-Outbound-Secret
 * PEAK_OUTBOUND_FROM                US E.164 Twilio line
 * PEAK_OUTBOUND_PER_MINUTE          default 1, rolling 60 seconds
 * PEAK_OUTBOUND_PER_DAY             default 10, rolling 24 hours
 * TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN
 * XAI_API_KEY                       existing Grok realtime key
 * HOSTNAME                          public host Twilio can reach
 * PEAK_VOICE                        optional, default ara
 * PEAK_FORMSPREE                    optional, default the Peak form
 */
import express, { Router, type Express, type NextFunction, type Request, type Response } from "express";
import crypto from "node:crypto";
import { installBrotliMitigation, rejectBrotliContentEncoding, SAFE_ACCEPT_ENCODING } from "../brotli-guard";
import WebSocket from "ws";
import { emptyTwiml, hangupTwiml } from "./peak-forward";
import { peakVoiceName } from "./peak-prompt";

installBrotliMitigation(typeof __filename === "string" ? __filename : undefined);

export const OUTBOUND_SECRET_HEADER = "x-peak-outbound-secret";
export const OUTBOUND_INBOX = "hello.peaksignal@gmail.com";

const FORMSPREE_DEFAULT = "https://formspree.io/f/mgobgrlr";
const XAI_URL = process.env.XAI_REALTIME_URL || "wss://api.x.ai/v1/realtime?model=grok-voice-latest";
const OUTBOUND_TIME_LIMIT_SEC = "240";
const DEFAULT_PER_MINUTE = 1;
const DEFAULT_PER_DAY = 10;

export const OUTCOMES = ["booked", "alternate offered", "declined", "voicemail", "no answer"] as const;
export type OutboundOutcome = (typeof OUTCOMES)[number];

export type OutboundRequest = {
  toNumber: string;
  businessName: string;
  task: string;
  alternatesWindow: string;
  callbackName: string;
};

type DialHit = { at: number; id: number };

type OutboundCall = {
  token: string;
  to: string;
  from: string;
  businessName: string;
  task: string;
  alternatesWindow: string;
  callbackName: string;
  callSid: string;
  outcome: OutboundOutcome | "";
  details: string;
  detection: string;
  recordingUrl: string;
  recordingStarted: boolean;
  emailed: boolean;
  emailStarted: boolean;
  terminal: boolean;
  humanConnected: boolean;
  machine: boolean;
  hangupSent: boolean;
  callerText: string;
  hangupTimer: ReturnType<typeof setTimeout> | null;
};

type XaiEvent = {
  type?: string;
  delta?: string;
  transcript?: string;
  item?: { type?: string; name?: string; call_id?: string; arguments?: string };
  error?: { message?: string };
};

const byToken = new Map<string, OutboundCall>();
const bySid = new Map<string, OutboundCall>();
/** Timestamps of dials Twilio accepted. Not a queue. Nothing here is dialed again. */
const dialHits: DialHit[] = [];
const emailedSids = new Set<string>();
let hitSeq = 0;
let nowFn: () => number = () => Date.now();

const FIRST_NAME = /^[A-Za-z][A-Za-z'’-]{0,39}$/;
const US_E164 = /^\+1[2-9]\d{2}[2-9]\d{6}$/;
const TERMINAL_STATUSES = new Set(["completed", "no-answer", "busy", "failed", "canceled"]);

const VOICEMAIL_CUES = [
  "leave a message",
  "leave your message",
  "after the beep",
  "after the tone",
  "voicemail",
  "voice mail",
  "voice mailbox",
  "mailbox is full",
  "record your message",
  "not available to take your call",
  "can't take your call",
  "cannot take your call",
  "the person you are calling",
];

const IVR_CUES = [
  "press 1",
  "press one",
  "press 2",
  "press two",
  "press 3",
  "press three",
  "press 0",
  "press zero",
  "main menu",
  "for english",
  "for spanish",
  "automated attendant",
  "phone tree",
  "if you know your party",
  "your call is important",
];

const outboundTools = [
  {
    type: "function",
    name: "report_outcome",
    description: "Record the booking result and end the call. Call once, after the details are confirmed, or immediately for voicemail or a phone menu.",
    parameters: {
      type: "object",
      properties: {
        outcome: { type: "string", enum: ["booked", "alternate offered", "declined", "voicemail"] },
        details: { type: "string", description: "Confirmed day, time, party size, and name. Empty for voicemail or a decline with nothing confirmed." },
      },
      required: ["outcome"],
    },
  },
];

function personalPatterns(): RegExp[] {
  return [
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    /\b(?:\d[ -]?){13,19}\b/,
    /(?:\+?\d[\d().-]{6,}\d|\+?\d(?:[\s.-]*\d){9,})/,
    /\b\d{1,6}\s+[A-Za-z0-9.'-]+\s+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|way|place|pl|circle|cir)\b/i,
  ];
}

function redactPatterns(): RegExp[] {
  return personalPatterns().map((pattern) => new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`));
}

export function outboundEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return String(env.PEAK_OUTBOUND_ENABLED || "").trim() === "1";
}

/** SHA-256 both sides so timingSafeEqual always compares equal-length digests. */
export function secretsMatch(provided: string, expected: string): boolean {
  const left = crypto.createHash("sha256").update(String(provided), "utf8").digest();
  const right = crypto.createHash("sha256").update(String(expected), "utf8").digest();
  return crypto.timingSafeEqual(left, right);
}

export function authorizeOutbound(providedRaw: string, expectedRaw: string): boolean {
  const expected = String(expectedRaw ?? "");
  const provided = String(providedRaw ?? "");
  const capped = provided.length > 512 ? `${provided.slice(0, 512)}#too-long` : provided;
  const match = secretsMatch(capped, expected);
  if (!expected) return false;
  return match;
}

/** US NANP E.164. Area code and exchange cannot start with 0 or 1. N11 codes are rejected. */
export function isUsE164(raw: string): boolean {
  const value = String(raw || "").trim();
  if (!US_E164.test(value)) return false;
  const area = value.slice(2, 5);
  const exchange = value.slice(5, 8);
  if (area.endsWith("11") || exchange.endsWith("11")) return false;
  return true;
}

export function containsPersonalData(text: string): boolean {
  const value = String(text || "");
  return personalPatterns().some((pattern) => pattern.test(value));
}

export function redactPersonalData(text: string): string {
  let value = String(text || "");
  for (const pattern of redactPatterns()) value = value.replace(pattern, "[redacted]");
  return value.trim().slice(0, 500);
}

export function looksLikeVoicemail(text: string): boolean {
  const value = String(text || "").toLowerCase();
  return VOICEMAIL_CUES.some((cue) => value.includes(cue));
}

export function looksLikeIvr(text: string): boolean {
  const value = String(text || "").toLowerCase();
  return IVR_CUES.some((cue) => value.includes(cue));
}

export function looksLikeMachineOrIvr(text: string): boolean {
  return looksLikeVoicemail(text) || looksLikeIvr(text);
}

export function amdSaysMachine(answeredBy: string): boolean {
  const value = String(answeredBy || "").trim().toLowerCase();
  if (!value || value === "human" || value === "unknown") return false;
  return value.startsWith("machine") || value === "fax";
}

export function machineDetail(answeredBy: string): string {
  const value = String(answeredBy || "").trim().toLowerCase();
  if (value === "fax") return "fax";
  if (value.startsWith("machine")) return "answering machine";
  return "machine";
}

export function recordingMediaUrl(raw: string): string {
  const url = String(raw || "").trim();
  if (!url) return "";
  if (/\.(mp3|wav)(?:\?|$)/i.test(url)) return url;
  return `${url}.mp3`;
}

export function normalizeOutcome(raw: unknown): OutboundOutcome | "" {
  const value = String(raw ?? "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (value === "booked") return "booked";
  if (value === "alternate offered" || value === "alternate") return "alternate offered";
  if (value === "declined" || value === "decline") return "declined";
  if (value === "voicemail" || value === "ivr" || value === "machine") return "voicemail";
  if (value === "no answer" || value === "noanswer") return "no answer";
  return "";
}

function cleanLine(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  const value = raw.trim().replace(/\s+/g, " ");
  if (!value || value.length > max) return "";
  if (/[\u0000-\u001f\u007f]/.test(value)) return "";
  return value;
}

function asRecord(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

export function parseOutboundRequest(body: unknown): { ok: true; value: OutboundRequest } | { ok: false; error: string } {
  const record = asRecord(body);
  if (!record) return { ok: false, error: "invalid_json" };
  const toNumber = typeof record.to_number === "string" ? record.to_number.trim() : "";
  if (!isUsE164(toNumber)) return { ok: false, error: "invalid_number" };
  const businessName = cleanLine(record.business_name, 80);
  if (!businessName) return { ok: false, error: "invalid_business_name" };
  const task = cleanLine(record.task, 240);
  if (!task) return { ok: false, error: "invalid_task" };
  let alternatesWindow = "";
  if (record.alternates_window != null && record.alternates_window !== "") {
    alternatesWindow = cleanLine(record.alternates_window, 160);
    if (!alternatesWindow) return { ok: false, error: "invalid_alternates_window" };
  }
  const callbackName = typeof record.callback_name === "string" ? record.callback_name.trim() : "";
  if (!FIRST_NAME.test(callbackName)) return { ok: false, error: "invalid_callback_name" };
  const spoken = [businessName, task, alternatesWindow, callbackName].join("\n");
  if (containsPersonalData(spoken)) return { ok: false, error: "personal_data" };
  return { ok: true, value: { toNumber, businessName, task, alternatesWindow, callbackName } };
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(String(raw ?? "").trim());
  if (!Number.isInteger(value) || value < 1 || value > 1000) return fallback;
  return value;
}

export function outboundLimits(env: NodeJS.ProcessEnv = process.env): { perMinute: number; perDay: number } {
  return {
    perMinute: positiveInt(env.PEAK_OUTBOUND_PER_MINUTE, DEFAULT_PER_MINUTE),
    perDay: positiveInt(env.PEAK_OUTBOUND_PER_DAY, DEFAULT_PER_DAY),
  };
}

export type RateDecision =
  | { ok: true; id: number }
  | { ok: false; limit: "minute" | "day"; retryAfterSec: number };

export function tryReserveOutboundSlot(nowMs: number, perMinute: number, perDay: number): RateDecision {
  const dayAgo = nowMs - 86_400_000;
  for (let i = dialHits.length - 1; i >= 0; i--) {
    if (dialHits[i].at <= dayAgo) dialHits.splice(i, 1);
  }
  const minuteAgo = nowMs - 60_000;
  const inMinute = dialHits.filter((hit) => hit.at > minuteAgo);
  if (inMinute.length >= perMinute) {
    const oldest = Math.min(...inMinute.map((hit) => hit.at));
    return { ok: false, limit: "minute", retryAfterSec: Math.max(1, Math.ceil((oldest + 60_000 - nowMs) / 1000)) };
  }
  if (dialHits.length >= perDay) {
    const oldest = Math.min(...dialHits.map((hit) => hit.at));
    return { ok: false, limit: "day", retryAfterSec: Math.max(1, Math.ceil((oldest + 86_400_000 - nowMs) / 1000)) };
  }
  const id = ++hitSeq;
  dialHits.push({ at: nowMs, id });
  return { ok: true, id };
}

function releaseSlot(id: number): void {
  const index = dialHits.findIndex((hit) => hit.id === id);
  if (index >= 0) dialHits.splice(index, 1);
}

function publicHost(): string {
  const raw = String(process.env.HOSTNAME || "peak-signal.replit.app").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^[A-Za-z0-9.:-]+$/.test(raw)) return "peak-signal.replit.app";
  return raw;
}

function formspreeUrl(): string {
  return String(process.env.PEAK_FORMSPREE || "").trim() || FORMSPREE_DEFAULT;
}

function recordingWaitMs(): number {
  const raw = process.env.PEAK_OUTBOUND_RECORDING_WAIT_MS;
  if (raw == null || String(raw).trim() === "") return 15_000;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return 15_000;
  return Math.min(value, 20_000);
}

function hangupGraceMs(): number {
  const raw = process.env.PEAK_OUTBOUND_HANGUP_GRACE_MS;
  if (raw == null || String(raw).trim() === "") return 12_000;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return 12_000;
  return Math.min(value, 30_000);
}

function twilioConfig(): { account: string; token: string; from: string } | null {
  const account = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const from = String(process.env.PEAK_OUTBOUND_FROM || "").trim();
  const key = String(process.env.XAI_API_KEY || "").trim();
  if (!account || !token || !key || !isUsE164(from)) return null;
  return { account, token, from };
}

function basicAuth(account: string, token: string): string {
  return `Basic ${Buffer.from(`${account}:${token}`).toString("base64")}`;
}

export function buildOutboundGreeting(call: { callbackName: string; task: string }): string {
  return `This call may be recorded. Hi, this is ${call.callbackName}'s assistant. I'm calling to book ${call.task}.`;
}

export function buildOutboundInstructions(call: {
  callbackName: string;
  businessName: string;
  task: string;
  alternatesWindow: string;
}): string {
  const windowLine = call.alternatesWindow
    ? `If that time is unavailable, you may offer or accept a different time only inside this window: ${call.alternatesWindow}. Do not offer anything outside it.`
    : "If that time is unavailable, do not invent a different day or time. Ask once if the requested booking can work. If it cannot, thank them and end the call.";
  return `## Role
You are ${call.callbackName}'s assistant. First name only. You are not ${call.callbackName}. Never use a last name.

## This call
You are calling ${call.businessName} to book: ${call.task}.
The name on the booking is ${call.callbackName}.
This is the only call. Do not offer to call them again from this line.

## Greeting
Already spoken. Do not repeat it.
${buildOutboundGreeting(call)}

## What to do
Ask for that booking. ${windowLine}
When they agree, read the confirmed details back: the day and time, the party size if they gave one, and the name ${call.callbackName}. Then call report_outcome.
Say one short polite goodbye and stop talking.

## Outcomes
- booked — they confirmed the booking you asked for.
- alternate offered — they confirmed a different time inside the allowed window.
- declined — they cannot help, or the call ends without a confirmation.
- voicemail — you hear a voicemail greeting, a beep, or a phone menu. Call report_outcome with voicemail immediately. Do not leave a message. Do not press buttons. Stop talking.

## Privacy
Never share a phone number, card number, email, street address, or any other personal data. You do not have any, and you must not invent any.
If they ask for a callback number, a card, or an address, say you do not have that on this call and ${call.callbackName} will follow up. Then continue or end politely.

## Voice
Spoken word only. No markdown, no lists, no emojis. One or two short sentences. English only.
`;
}

export function outboundSessionFor(callSid: string): { instructions: string; voice: string; greeting: string; tools: typeof outboundTools } | null {
  const call = bySid.get(callSid);
  if (!call) return null;
  return {
    instructions: buildOutboundInstructions(call),
    voice: peakVoiceName(),
    greeting: buildOutboundGreeting(call),
    tools: outboundTools,
  };
}

function bindSid(call: OutboundCall, sid: string): void {
  const next = String(sid || "").trim();
  if (!next) return;
  if (call.callSid && call.callSid !== next) bySid.delete(call.callSid);
  call.callSid = next;
  bySid.set(next, call);
}

function forgetCall(call: OutboundCall): void {
  byToken.delete(call.token);
  if (call.callSid) bySid.delete(call.callSid);
  if (call.hangupTimer) clearTimeout(call.hangupTimer);
}

function setOutcome(call: OutboundCall, outcome: OutboundOutcome, details?: string, detection?: string): boolean {
  if (call.outcome) return false;
  call.outcome = outcome;
  if (details) call.details = redactPersonalData(details).slice(0, 500);
  if (detection && !call.detection) call.detection = detection;
  return true;
}

export function applyOutboundReport(
  callSid: string,
  raw: { outcome?: unknown; details?: unknown },
): { ok: boolean; outcome: OutboundOutcome | ""; error?: string } {
  const call = bySid.get(callSid);
  if (!call) return { ok: false, outcome: "", error: "unknown_call" };
  const outcome = normalizeOutcome(raw.outcome);
  if (!outcome || outcome === "no answer") return { ok: false, outcome: call.outcome, error: "invalid_outcome" };
  const details = typeof raw.details === "string" ? redactPersonalData(raw.details) : "";
  if (outcome === "voicemail") call.machine = true;
  setOutcome(call, outcome, details, outcome === "voicemail" ? call.detection || "voicemail" : "");
  return { ok: true, outcome: call.outcome };
}

export async function handleOutboundCallerLine(
  callSid: string,
  text: string,
): Promise<{ hangup: boolean; outcome: OutboundOutcome | "" }> {
  const call = bySid.get(callSid);
  if (!call) return { hangup: false, outcome: "" };
  const line = String(text || "").trim().slice(0, 500);
  if (line) call.callerText = `${call.callerText} ${line}`.trim().slice(0, 2000);
  if (call.outcome) return { hangup: false, outcome: call.outcome };
  const heard = looksLikeMachineOrIvr(line) || looksLikeMachineOrIvr(call.callerText);
  if (!heard) return { hangup: false, outcome: "" };
  const ivr = looksLikeIvr(line) || looksLikeIvr(call.callerText);
  call.machine = true;
  setOutcome(call, "voicemail", "", ivr ? "ivr" : "voicemail greeting");
  await hangupOutboundCall(call);
  return { hangup: true, outcome: "voicemail" };
}

export function buildOutboundEmail(call: OutboundCall): string {
  return [
    "Peak Signal outbound call",
    `Inbox: ${OUTBOUND_INBOX}`,
    `Outcome: ${call.outcome || "no answer"}`,
    `Business: ${call.businessName}`,
    `Task: ${call.task}`,
    `Alternates: ${call.alternatesWindow || "(none)"}`,
    `Name: ${call.callbackName}`,
    `Called: ${call.to}`,
    `Confirmed: ${call.details || "(none)"}`,
    `Detection: ${call.detection || "(none)"}`,
    `Recording: ${call.recordingUrl || "(none)"}`,
    `CallSid: ${call.callSid}`,
  ].join("\n");
}

async function sendOutcomeEmail(call: OutboundCall): Promise<void> {
  if (!call.callSid || call.emailed || emailedSids.has(call.callSid)) return;
  call.emailed = true;
  const outcome = call.outcome || "no answer";
  // Same Peak form as inbound voice. That form notifies hello.peaksignal@gmail.com.
  const payload: Record<string, string> = {
    _subject: `Peak outbound — ${call.businessName} — ${outcome}`,
    message: buildOutboundEmail(call),
    email: OUTBOUND_INBOX,
    name: `${call.callbackName}'s assistant`,
    phone: call.to,
    interest: "outbound-voice",
  };
  try {
    const response = await fetch(formspreeUrl(), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "Accept-Encoding": SAFE_ACCEPT_ENCODING },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      call.emailed = false;
      call.emailStarted = false;
      console.error("outbound formspree", call.callSid, response.status);
      return;
    }
    emailedSids.add(call.callSid);
    console.log("outbound emailed", call.callSid, outcome);
  } catch (err) {
    call.emailed = false;
    call.emailStarted = false;
    console.error("outbound formspree failed", call.callSid, err instanceof Error ? err.message : "error");
  }
}

async function emailIfReady(call: OutboundCall): Promise<void> {
  if (!call.terminal || call.emailed || call.emailStarted || emailedSids.has(call.callSid)) return;
  const expectRecording = call.humanConnected && !call.machine && !call.recordingUrl;
  const wait = recordingWaitMs();
  if (expectRecording && wait > 0) {
    const deadline = Date.now() + wait;
    while (!call.recordingUrl && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  if (call.emailed || call.emailStarted || emailedSids.has(call.callSid)) return;
  call.emailStarted = true;
  await sendOutcomeEmail(call);
}

function classifyEmpty(call: OutboundCall, callStatus: string): void {
  if (call.outcome) return;
  if (call.machine) {
    setOutcome(call, "voicemail", "", call.detection || "answering machine");
    return;
  }
  const status = callStatus.toLowerCase();
  if (status === "completed" && call.humanConnected) {
    setOutcome(call, "declined", "(no confirmation)");
    return;
  }
  setOutcome(call, "no answer");
  if (!call.detection) call.detection = `twilio ${status || "incomplete"}`;
}

async function onTerminal(call: OutboundCall, callStatus: string, answeredBy: string): Promise<void> {
  const status = String(callStatus || "").trim().toLowerCase();
  if (!TERMINAL_STATUSES.has(status)) return;
  if (amdSaysMachine(answeredBy)) {
    call.machine = true;
    setOutcome(call, "voicemail", "", machineDetail(answeredBy));
  }
  classifyEmpty(call, status);
  call.terminal = true;
  await emailIfReady(call);
}

async function startOutboundRecording(call: OutboundCall): Promise<void> {
  if (call.recordingStarted || !call.callSid) return;
  const config = twilioConfig();
  if (!config) return;
  call.recordingStarted = true;
  const callback = `https://${publicHost()}/api/voice/outbound/recording?token=${encodeURIComponent(call.token)}`;
  const body = new URLSearchParams({
    RecordingStatusCallback: callback,
    RecordingStatusCallbackEvent: "in-progress completed absent",
    RecordingChannels: "dual",
  });
  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.account)}/Calls/${encodeURIComponent(call.callSid)}/Recordings.json`,
      {
        method: "POST",
        headers: {
          Authorization: basicAuth(config.account, config.token),
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept-Encoding": SAFE_ACCEPT_ENCODING,
        },
        body,
      },
    );
    console.log("outbound recording start", call.callSid, response.status);
    if (!response.ok) call.recordingStarted = false;
  } catch (err) {
    call.recordingStarted = false;
    console.error("outbound recording start failed", err instanceof Error ? err.message : "error");
  }
}

async function hangupOutboundCall(call: OutboundCall): Promise<void> {
  if (call.hangupSent || !call.callSid) return;
  call.hangupSent = true;
  if (call.hangupTimer) {
    clearTimeout(call.hangupTimer);
    call.hangupTimer = null;
  }
  const config = twilioConfig();
  if (!config) return;
  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.account)}/Calls/${encodeURIComponent(call.callSid)}.json`,
      {
        method: "POST",
        headers: {
          Authorization: basicAuth(config.account, config.token),
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept-Encoding": SAFE_ACCEPT_ENCODING,
        },
        body: new URLSearchParams({ Status: "completed" }),
      },
    );
    console.log("outbound hangup", call.callSid, response.status);
  } catch (err) {
    console.error("outbound hangup failed", err instanceof Error ? err.message : "error");
  }
}

function scheduleHangup(call: OutboundCall): void {
  if (call.hangupSent || call.hangupTimer) return;
  const timer = setTimeout(() => {
    void hangupOutboundCall(call);
  }, hangupGraceMs());
  if (typeof timer.unref === "function") timer.unref();
  call.hangupTimer = timer;
}

function streamTwiml(callSid: string): string {
  const streamUrl = `wss://${publicHost()}/api/voice/outbound/stream/${encodeURIComponent(callSid)}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}" track="inbound_track" />
  </Connect>
</Response>`;
}

function queryToken(req: Request): string {
  const raw = req.query?.token;
  if (Array.isArray(raw)) return String(raw[0] || "");
  return String(raw || "");
}

function callFromRequest(req: Request): OutboundCall | null {
  const token = queryToken(req);
  if (!token) return null;
  return byToken.get(token) || null;
}

function formField(req: Request, name: string): string {
  const body = asRecord(req.body);
  if (!body) return "";
  const value = body[name];
  if (Array.isArray(value)) return String(value[0] ?? "");
  return value == null ? "" : String(value);
}

async function dialTwilio(call: OutboundCall, account: string, token: string): Promise<{ ok: true; sid: string } | { ok: false; status: number }> {
  const host = publicHost();
  const tokenQ = encodeURIComponent(call.token);
  const body = new URLSearchParams({
    To: call.to,
    From: call.from,
    Url: `https://${host}/api/voice/outbound/twiml?token=${tokenQ}`,
    Method: "POST",
    MachineDetection: "Enable",
    MachineDetectionTimeout: "30",
    StatusCallback: `https://${host}/api/voice/outbound/status?token=${tokenQ}`,
    StatusCallbackMethod: "POST",
    TimeLimit: OUTBOUND_TIME_LIMIT_SEC,
  });
  body.append("StatusCallbackEvent", "initiated");
  body.append("StatusCallbackEvent", "ringing");
  body.append("StatusCallbackEvent", "answered");
  body.append("StatusCallbackEvent", "completed");
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(account)}/Calls.json`, {
    method: "POST",
    headers: {
      Authorization: basicAuth(account, token),
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept-Encoding": SAFE_ACCEPT_ENCODING,
    },
    body,
  });
  const text = await response.text();
  let sid = "";
  try {
    const parsed = JSON.parse(text) as { sid?: string };
    sid = String(parsed.sid || "");
  } catch {
    sid = "";
  }
  if (!response.ok || !sid) return { ok: false, status: response.status };
  return { ok: true, sid };
}

async function createOutboundCall(req: Request, res: Response): Promise<void> {
  if (!outboundEnabled()) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const header = String(req.get(OUTBOUND_SECRET_HEADER) || "");
  if (!authorizeOutbound(header, String(process.env.PEAK_OUTBOUND_SECRET || ""))) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const contentType = String(req.headers["content-type"] || "");
  if (!contentType.includes("application/json")) {
    res.status(400).json({ error: "invalid_json" });
    return;
  }
  const parsed = parseOutboundRequest(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const config = twilioConfig();
  if (!config) {
    res.status(503).json({ error: "not_configured" });
    return;
  }
  if (parsed.value.toNumber === config.from) {
    res.status(400).json({ error: "same_number" });
    return;
  }
  const limits = outboundLimits();
  const slot = tryReserveOutboundSlot(nowFn(), limits.perMinute, limits.perDay);
  if (!slot.ok) {
    res.setHeader("Retry-After", String(slot.retryAfterSec));
    res.status(429).json({ error: "rate_limit", limit: slot.limit });
    return;
  }
  const call: OutboundCall = {
    token: crypto.randomBytes(32).toString("hex"),
    to: parsed.value.toNumber,
    from: config.from,
    businessName: parsed.value.businessName,
    task: parsed.value.task,
    alternatesWindow: parsed.value.alternatesWindow,
    callbackName: parsed.value.callbackName,
    callSid: "",
    outcome: "",
    details: "",
    detection: "",
    recordingUrl: "",
    recordingStarted: false,
    emailed: false,
    emailStarted: false,
    terminal: false,
    humanConnected: false,
    machine: false,
    hangupSent: false,
    callerText: "",
    hangupTimer: null,
  };
  byToken.set(call.token, call);
  try {
    const dialed = await dialTwilio(call, config.account, config.token);
    if (!dialed.ok) {
      releaseSlot(slot.id);
      forgetCall(call);
      console.error("outbound dial failed", dialed.status);
      res.status(502).json({ error: "call_failed" });
      return;
    }
    bindSid(call, dialed.sid);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ ok: true, call_sid: dialed.sid, to_number: call.to });
  } catch (err) {
    releaseSlot(slot.id);
    forgetCall(call);
    console.error("outbound dial error", err instanceof Error ? err.message : "error");
    if (!res.headersSent) res.status(502).json({ error: "call_failed" });
  }
}

function readJson(req: Request, res: Response, next: NextFunction): void {
  express.json({ limit: "32kb" })(req, res, (err?: unknown) => {
    if (err) {
      res.status(400).json({ error: "invalid_json" });
      return;
    }
    next();
  });
}

function sendEmpty(res: Response, status = 200): void {
  if (res.headersSent) return;
  res.status(status).type("text/xml").send(emptyTwiml());
}

function enabledJson(req: Request, res: Response, next: NextFunction): void {
  if (!outboundEnabled()) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  readJson(req, res, next);
}

export const peakOutboundRouter = Router();
peakOutboundRouter.use(rejectBrotliContentEncoding);
peakOutboundRouter.use(express.urlencoded({ extended: false }));

peakOutboundRouter.post("/", enabledJson, (req: Request, res: Response) => {
  void createOutboundCall(req, res).catch((err) => {
    console.error("outbound create failed", err instanceof Error ? err.message : "error");
    if (!res.headersSent) res.status(500).json({ error: "error" });
  });
});

/** Twilio fetch after AMD. Machine and fax hang up. Human and unknown stream to Grok. */
peakOutboundRouter.post("/twiml", (req: Request, res: Response) => {
  void (async () => {
    const call = callFromRequest(req);
    if (!call) {
      res.status(404).type("text/xml").send(hangupTwiml());
      return;
    }
    bindSid(call, formField(req, "CallSid"));
    const answeredBy = formField(req, "AnsweredBy");
    if (amdSaysMachine(answeredBy)) {
      call.machine = true;
      setOutcome(call, "voicemail", "", machineDetail(answeredBy));
      res.type("text/xml").send(hangupTwiml());
      return;
    }
    if (!call.callSid) {
      res.type("text/xml").send(hangupTwiml());
      return;
    }
    call.humanConnected = true;
    await startOutboundRecording(call);
    if (!res.headersSent) res.type("text/xml").send(streamTwiml(call.callSid));
  })().catch((err) => {
    console.error("outbound twiml failed", err instanceof Error ? err.message : "error");
    if (!res.headersSent) res.type("text/xml").send(hangupTwiml());
  });
});

peakOutboundRouter.post("/status", (req: Request, res: Response) => {
  const call = callFromRequest(req);
  if (!call) {
    sendEmpty(res, 404);
    return;
  }
  bindSid(call, formField(req, "CallSid"));
  const pending = onTerminal(call, formField(req, "CallStatus"), formField(req, "AnsweredBy"));
  if (recordingWaitMs() === 0) {
    void pending.then(
      () => sendEmpty(res),
      () => sendEmpty(res),
    );
    return;
  }
  sendEmpty(res);
  void pending.catch((err) => {
    console.error("outbound status failed", err instanceof Error ? err.message : "error");
  });
});

/** Same recording callback shape as the existing Twilio Recordings flow. One email per CallSid. */
peakOutboundRouter.post("/recording", (req: Request, res: Response) => {
  const call = callFromRequest(req);
  if (!call) {
    sendEmpty(res, 404);
    return;
  }
  bindSid(call, formField(req, "CallSid"));
  const status = formField(req, "RecordingStatus").toLowerCase();
  const url = formField(req, "RecordingUrl");
  if (status === "completed" && url) call.recordingUrl = recordingMediaUrl(url);
  const pending = call.terminal ? emailIfReady(call) : Promise.resolve();
  if (recordingWaitMs() === 0) {
    void pending.then(
      () => sendEmpty(res),
      () => sendEmpty(res),
    );
    return;
  }
  sendEmpty(res);
  void pending.catch((err) => {
    console.error("outbound recording callback failed", err instanceof Error ? err.message : "error");
  });
});

export function attachPeakOutboundStream(app: Express): void {
  const anyApp = app as Express & { ws?: Function };
  if (typeof anyApp.ws !== "function") return;

  anyApp.ws("/api/voice/outbound/stream/:callId", (ws: WebSocket, req: Request) => {
    const callId = String(req.params.callId || "");
    const call = bySid.get(callId);
    const key = String(process.env.XAI_API_KEY || "");
    if (!call || !key) {
      ws.close();
      return;
    }

    let streamSid = "";
    let sessionReady = false;
    let stopped = false;
    let agentSpeaking = false;
    let muteUntil = 0;
    const session = outboundSessionFor(callId);
    if (!session) {
      ws.close();
      return;
    }
    const xaiWs = new WebSocket(XAI_URL, {
      headers: { Authorization: `Bearer ${key}` },
    });

    const stopForMachine = () => {
      stopped = true;
      try { xaiWs.close(); } catch { /* ignore */ }
      try { ws.close(); } catch { /* ignore */ }
    };

    ws.on("message", (raw: WebSocket.RawData) => {
      if (stopped) return;
      let msg: { event?: string; start?: { streamSid?: string; callSid?: string }; media?: { track?: string; payload?: string } };
      try {
        msg = JSON.parse(raw.toString()) as typeof msg;
      } catch {
        return;
      }
      if (msg.event === "start") {
        streamSid = msg.start?.streamSid || "";
        const sid = String(msg.start?.callSid || callId);
        bindSid(call, sid);
        void startOutboundRecording(call);
      } else if (msg.event === "media" && (msg.media?.track === "inbound" || !msg.media?.track)) {
        if (!sessionReady || xaiWs.readyState !== WebSocket.OPEN) return;
        if (agentSpeaking || Date.now() < muteUntil) return;
        xaiWs.send(JSON.stringify({ type: "input_audio_buffer.append", audio: msg.media?.payload || "" }));
      } else if (msg.event === "stop") {
        try { xaiWs.close(); } catch { /* ignore */ }
      }
    });

    xaiWs.on("open", () => {
      xaiWs.send(JSON.stringify({
        type: "session.update",
        session: {
          instructions: session.instructions,
          voice: session.voice,
          audio: {
            input: { format: { type: "audio/pcmu" }, transcription: { model: "grok-transcribe", language_hint: "en" } },
            output: { format: { type: "audio/pcmu" } },
          },
          turn_detection: { type: "server_vad" },
          tools: session.tools,
        },
      }));
    });

    xaiWs.on("message", (data: WebSocket.RawData) => {
      if (stopped) return;
      let message: XaiEvent;
      try {
        message = JSON.parse(data.toString()) as XaiEvent;
      } catch {
        return;
      }
      if (message.type === "response.output_audio.delta" && message.delta && streamSid) {
        agentSpeaking = true;
        try {
          const bytes = Buffer.from(String(message.delta), "base64").length;
          muteUntil = Math.max(muteUntil, Date.now() + Math.ceil(bytes / 8) + 400);
        } catch {
          muteUntil = Math.max(muteUntil, Date.now() + 800);
        }
        ws.send(JSON.stringify({ event: "media", streamSid, media: { payload: message.delta } }));
      } else if (message.type === "session.updated") {
        sessionReady = true;
        xaiWs.send(JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "force_message",
            role: "assistant",
            interruptible: false,
            content: [{ type: "output_text", text: session.greeting }],
          },
        }));
      } else if (message.type === "input_audio_buffer.speech_started" && streamSid) {
        if (agentSpeaking || Date.now() < muteUntil) return;
        ws.send(JSON.stringify({ event: "clear", streamSid }));
      } else if (message.type === "conversation.item.input_audio_transcription.completed" && message.transcript) {
        const text = String(message.transcript).trim();
        if (!text) return;
        void handleOutboundCallerLine(call.callSid || callId, text).then((heard) => {
          if (heard.hangup) stopForMachine();
        });
      } else if (message.type === "response.done") {
        agentSpeaking = false;
        muteUntil = Math.max(muteUntil, Date.now() + 400);
      } else if (message.type === "response.output_item.done" && message.item?.type === "function_call") {
        const name = message.item?.name || "";
        const toolCallId = message.item?.call_id || "";
        let args: { outcome?: unknown; details?: unknown } = {};
        try {
          args = JSON.parse(message.item?.arguments || "{}") as { outcome?: unknown; details?: unknown };
        } catch {
          args = {};
        }
        if (name !== "report_outcome") {
          xaiWs.send(JSON.stringify({
            type: "conversation.item.create",
            item: { type: "function_call_output", call_id: toolCallId, output: JSON.stringify({ error: "unknown tool" }) },
          }));
          xaiWs.send(JSON.stringify({ type: "response.create" }));
          return;
        }
        const result = applyOutboundReport(call.callSid || callId, args);
        xaiWs.send(JSON.stringify({
          type: "conversation.item.create",
          item: { type: "function_call_output", call_id: toolCallId, output: JSON.stringify({ ok: result.ok, outcome: result.outcome }) },
        }));
        if (result.outcome === "voicemail") {
          void hangupOutboundCall(call).then(() => stopForMachine());
          return;
        }
        if (result.ok) {
          xaiWs.send(JSON.stringify({ type: "response.create" }));
          scheduleHangup(call);
        } else {
          xaiWs.send(JSON.stringify({ type: "response.create" }));
        }
      } else if (message.type === "error") {
        console.error("[outbound-voice]", callId, message.error?.message || "error");
      }
    });

    ws.on("close", () => {
      try { xaiWs.close(); } catch { /* ignore */ }
    });
    xaiWs.on("close", () => {
      try { ws.close(); } catch { /* ignore */ }
    });
    xaiWs.on("error", () => {
      try { ws.close(); } catch { /* ignore */ }
    });
  });
}

export function outboundTokenFor(callSid: string): string {
  return bySid.get(callSid)?.token || "";
}

export function setOutboundNowForTest(fn: (() => number) | null): void {
  nowFn = fn || (() => Date.now());
}

export function resetOutboundForTest(): void {
  for (const call of byToken.values()) {
    if (call.hangupTimer) clearTimeout(call.hangupTimer);
  }
  byToken.clear();
  bySid.clear();
  dialHits.length = 0;
  emailedSids.clear();
  hitSeq = 0;
}
