/**
 * Colorado Hot Tub inbound — ring owners ~10s then Grok Voice.
 * Mount at /api/cht-voice. Do NOT mount over Peak /api/voice.
 * XAI_API_KEY from env only.
 *
 * Ring: CHT_RING_SHOP must be explicitly on, then Dial CHT_RING_NUMBERS only.
 * Unset CHT_RING_SHOP is off. The shop DID is not a default dial target.
 * Each owner leg is screened (press 1). A whisper Hangup is not an answer.
 * Never Dial ForwardedFrom, CalledVia, From, or the inbound Called number.
 * Hangup: Formspree shop (CHT_FORMSPREE → intended info@coloradohottubllc.com)
 * + Peak form. One summary email per CallSid. Recording is a URL in the body —
 * Formspree cannot attach MP3s. The media URL is built from Twilio when
 * TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are set.
 *
 * GET / and GET /health are read-only: no Twilio, Formspree, or call state.
 */
import { Router, type Express, type Request, type Response } from "express";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";
import WebSocket from "ws";
import { installBrotliMitigation, rejectBrotliContentEncoding, SAFE_ACCEPT_ENCODING } from "../brotli-guard";
import { isPersistableCallSid, persistChtCall } from "./cht-call-store";
import {
  DEFAULT_SHOP_E164,
  dialTwiml,
  emptyTwiml,
  hangupTwiml,
  isMachineAnswer,
  phoneReadbackHint,
  resolveRingTargets,
  ringFirstEnabled,
  screenGatherTwiml,
  speakUsNanp,
} from "./cht-phone";

installBrotliMitigation(typeof __filename === "string" ? __filename : undefined);

const HOSTNAME = (process.env.HOSTNAME || "peak-signal.replit.app").replace(/^https?:\/\//, "");
const SHOP = process.env.CHT_SHOP_NUMBER || DEFAULT_SHOP_E164;
/** Public build marker on GET /health. Safe to expose — no secrets in this string. */
const CHT_VOICE_BUILD = "cht-voice-health-1";
function ringShopEnabled(): boolean {
  return ringFirstEnabled(process.env.CHT_RING_SHOP || "", process.env.CHT_RING_NUMBERS || "");
}
/** Shop Formspree. Default xgogybaj — confirm in Formspree that it emails info@coloradohottubllc.com. */
const FORMSPREE_SHOP = process.env.CHT_FORMSPREE || "https://formspree.io/f/xgogybaj";
const FORMSPREE_PEAK = process.env.PEAK_FORMSPREE || "https://formspree.io/f/mgobgrlr";
const XAI_URL = process.env.XAI_REALTIME_URL || "wss://api.x.ai/v1/realtime?model=grok-voice-latest";
/** Spoken opening only — no recording disclosure. Intake-only lock 2026-09-16. Need question locked from live testing. Twilio recording still starts in startTwilioRecording(). */
const GREET = "Thanks for calling Colorado Hot Tub. We can't come to the phone right now — I can take a quick message for the team and they'll get back to you as soon as possible. What were you calling about today?";

type CallState = {
  name: string;
  phone: string;
  location: string;
  customer: string;
  need: string;
  summary: string;
  from: string;
  called: string;
  turns: { role: "agent" | "caller"; text: string }[];
  emailed: boolean;
  /** Set synchronously before the summary posts, so stop/status/flush cannot all pass the check. */
  summaryClaimed: boolean;
  recordingEmailed: boolean;
  /** Set synchronously before the recording-ready posts. Separate from the summary claim. */
  recordingClaimed: boolean;
  /** No realtime key, so the caller heard the spoken fallback. */
  fallback: boolean;
  /** In-flight missed-call notice. Cleared only when both posts fail. */
  missedClaimed: boolean;
  /** One polite re-ask for name, town, or reason has already been issued. */
  intakeReasked: boolean;
  /** Caller turns on the call when that re-ask was issued. */
  callerTurnsAtReask: number;
  confirmed: boolean;
  agentConnected: boolean;
  /** Set only when an owner presses 1 on the whisper. DialCallStatus is not enough. */
  humanAccepted: boolean;
  recordingUrl: string;
  recordingSid: string;
  twilioCallSid: string;
};
const calls = new Map<string, CallState>();

function state(sid: string): CallState {
  if (!calls.has(sid)) {
    calls.set(sid, {
      name: "",
      phone: "",
      location: "",
      customer: "",
      need: "",
      summary: "",
      from: "",
      called: "",
      turns: [],
      emailed: false,
      summaryClaimed: false,
      recordingEmailed: false,
      recordingClaimed: false,
      fallback: false,
      missedClaimed: false,
      intakeReasked: false,
      callerTurnsAtReask: 0,
      confirmed: false,
      agentConnected: false,
      humanAccepted: false,
      recordingUrl: "",
      recordingSid: "",
      twilioCallSid: "",
    });
  }
  return calls.get(sid)!;
}

function loadInstructions(): string {
  try {
    return readFileSync(join(__dirname, "cht-prompt.md"), "utf8");
  } catch {
    return "You are the Colorado Hot Tub message-taker (intake-only). Opening already spoken, including: What were you calling about today? Collect that need first, then name, location, confirm caller-ID phone in 3-3-4 groups with a pause between groups, existing or new customer — one question per turn. Ask the need with those exact words if not yet answered. Do not pitch, quote prices, or dump product info. Owners follow up.";
  }
}

const tools = [
  { type: "web_search" },
  {
    type: "function",
    name: "log_caller",
    description: "Save caller name, phone, location, need, and existing/new as you learn them.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        phone: { type: "string" },
        location: { type: "string" },
        need: { type: "string" },
        customer: { type: "string", description: "existing or new customer" },
      },
    },
  },
  {
    type: "function",
    name: "confirm_message",
    description:
      "Call when you are ready to end. Required before goodbye: caller name, town, and reason. If any is missing this returns reask — say that question once and wait. summary = clean 2-5 sentence recap.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        phone: { type: "string" },
        location: { type: "string", description: "town or area" },
        need: { type: "string", description: "reason for calling" },
        customer: { type: "string", description: "existing or new customer" },
        summary: { type: "string" },
      },
      required: ["summary"],
    },
  },
  {
    type: "function",
    name: "request_callback",
    description: "Caller wants Justin or Heather to call back.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        phone: { type: "string" },
        window: { type: "string" },
        reason: { type: "string" },
      },
      required: ["reason"],
    },
  },
];

function apply(st: CallState, args: Record<string, any>) {
  if (args.name) st.name = String(args.name).trim();
  if (args.phone) st.phone = String(args.phone).trim();
  if (args.location) st.location = String(args.location).trim();
  if (args.customer) st.customer = String(args.customer).trim();
  if (args.need) st.need = String(args.need).trim();
  if (args.summary) st.summary = String(args.summary).trim();
  if (args.reason && !st.need) st.need = String(args.reason).trim();
}

/** Write live call fields to data/cht-calls.json for the owner dashboard. Skips non-Twilio sids. */
function persist(sid: string, st: CallState) {
  try {
    persistChtCall({
      callSid: sid,
      name: st.name,
      phone: st.phone || st.from,
      need: st.need,
      summary: st.summary,
      recordingUrl: st.recordingUrl,
      turns: st.turns,
    });
  } catch (e: any) {
    console.error("cht-voice persist failed", sid, e?.message || e);
  }
}

function callerTurnCount(st: CallState): number {
  return st.turns.filter((t) => t.role === "caller").length;
}

function handleTool(st: CallState, name: string, args: Record<string, any>): { output: string; respond: boolean } {
  if (name === "log_caller") {
    apply(st, args);
    const phone = st.phone || st.from;
    return { output: JSON.stringify({ ok: true, phone, phoneReadback: phoneReadbackHint(phone) }), respond: true };
  }
  if (name === "confirm_message") {
    apply(st, args);
    const decision = intakeCloseDecision({
      name: st.name,
      location: st.location,
      need: st.need,
      intakeReasked: st.intakeReasked,
      callerTurns: callerTurnCount(st),
      callerTurnsAtReask: st.callerTurnsAtReask,
    });
    if (!decision.allow) {
      const first = !st.intakeReasked;
      if (first) {
        st.intakeReasked = true;
        st.callerTurnsAtReask = callerTurnCount(st);
      }
      st.confirmed = false;
      return {
        output: JSON.stringify({
          ok: false,
          reask: true,
          missing: decision.missing,
          say: decision.say,
          instruction: first
            ? decision.instruction
            : "Wait for the caller. Do not ask again and do not say goodbye.",
        }),
        respond: first,
      };
    }
    st.confirmed = true;
    const phone = st.phone || st.from;
    return {
      output: JSON.stringify({
        ok: true,
        confirmed: { name: st.name, phone, location: st.location, need: st.need, customer: st.customer },
        phoneReadback: phoneReadbackHint(phone),
      }),
      respond: true,
    };
  }
  if (name === "request_callback") {
    apply(st, args);
    return { output: JSON.stringify({ ok: true, phoneReadback: phoneReadbackHint(st.phone || st.from) }), respond: true };
  }
  return { output: JSON.stringify({ error: "unknown tool" }), respond: true };
}

/** Test hook for confirm_message. */
export function runChtConfirm(callSid: string, args: Record<string, unknown>): string {
  return handleTool(state(callSid), "confirm_message", args).output;
}

function formatTurns(st: CallState): string {
  if (!st.turns.length) return "(no transcript turns)";
  return st.turns.map((t) => `[${t.role === "agent" ? "Agent" : "Caller"}]: ${t.text}`).join("\n\n");
}

function buildSummary(st: CallState, from: string): string {
  if (st.summary.trim()) return st.summary.trim();
  const parts: string[] = [];
  if (st.name) parts.push(`Name: ${st.name}.`);
  parts.push(`Phone: ${st.phone || from || "(unknown)"}.`);
  if (st.location) parts.push(`Location: ${st.location}.`);
  if (st.need) parts.push(`Looking for: ${st.need}.`);
  if (st.customer) parts.push(`Customer: ${st.customer}.`);
  return parts.join(" ") || "Call completed; details incomplete.";
}


export const CHT_SUMMARY_TITLE = "Colorado Hot Tub call summary";

const RECORDING_SID = /^RE[0-9a-fA-F]{32}$/;
const ACCOUNT_SID = /^AC[0-9a-fA-F]{32}$/;

/** Env vars required to start a Twilio recording and build its media URL. Names only — values stay in the environment. */
export function missingTwilioRecordingVars(env: {
  TWILIO_ACCOUNT_SID?: string | undefined;
  TWILIO_AUTH_TOKEN?: string | undefined;
}): string[] {
  const missing: string[] = [];
  if (!String(env.TWILIO_ACCOUNT_SID || "").trim()) missing.push("TWILIO_ACCOUNT_SID");
  if (!String(env.TWILIO_AUTH_TOKEN || "").trim()) missing.push("TWILIO_AUTH_TOKEN");
  return missing;
}

/** Pull a Recording SID from a Twilio create or list response. The body is not truncated before parse. */
export function recordingSidFromTwilio(body: string): string {
  try {
    const parsed = JSON.parse(body) as { sid?: unknown; recordings?: { sid?: unknown }[] };
    const direct = String(parsed?.sid || "");
    if (RECORDING_SID.test(direct)) return direct;
    const list = Array.isArray(parsed?.recordings) ? parsed.recordings : [];
    for (const row of list) {
      const sid = String(row?.sid || "");
      if (RECORDING_SID.test(sid)) return sid;
    }
  } catch {
    /* ignore */
  }
  return "";
}

export function twilioRecordingMediaUrl(accountSid: string, recordingSid: string): string {
  return `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${recordingSid}.mp3`;
}

/** Recording line for the shop email. A missing var is named. A set var is never blamed. */
export function recordingStatusLine(recordingUrl: string, missingVars: readonly string[]): string {
  const url = recordingUrl.trim();
  if (url) return `Recording: ${url}`;
  if (missingVars.length === 1) return `Recording: unavailable — missing ${missingVars[0]}`;
  if (missingVars.length > 1) return `Recording: unavailable — missing ${missingVars.join(", ")}`;
  return "Recording: not ready yet (Twilio has not returned a recording URL for this call).";
}

export type IntakeField = "reason" | "name" | "town";

const INTAKE_ASK: Record<IntakeField, string> = {
  reason: "Sorry — what were you calling about today?",
  name: "Sorry, I didn't catch your name. Who am I speaking with?",
  town: "What town are you calling from?",
};

export function missingIntakeFields(st: { name: string; location: string; need: string }): IntakeField[] {
  const missing: IntakeField[] = [];
  if (!st.need.trim()) missing.push("reason");
  if (!st.name.trim()) missing.push("name");
  if (!st.location.trim()) missing.push("town");
  return missing;
}

function closingIntent(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.includes("What were you calling about today?")) return false;
  return /\b(goodbye|good-bye|bye for now|have a (good|great|nice) (day|one|evening)|we(?:'|’)ll get back|we will get back|they(?:'|’)ll get back|the team will get back|i(?:'|’)ll let you go|that(?:'|’)s everything i need)\b/i.test(t);
}

/** One spoken re-ask when the agent is closing without name, town, or reason. Null after that re-ask, or when the caller has not spoken yet. */
export function intakeNudge(input: {
  name: string;
  location: string;
  need: string;
  intakeReasked: boolean;
  callerTurns: number;
  agentText: string;
}): { say: string; missing: IntakeField[] } | null {
  if (input.intakeReasked) return null;
  if (input.callerTurns < 1) return null;
  if (!closingIntent(input.agentText)) return null;
  const missing = missingIntakeFields(input);
  if (!missing.length) return null;
  return { say: INTAKE_ASK[missing[0]], missing };
}

export function intakeCloseDecision(input: {
  name: string;
  location: string;
  need: string;
  intakeReasked: boolean;
  callerTurns: number;
  callerTurnsAtReask: number;
}): { allow: true } | { allow: false; missing: IntakeField[]; say: string; instruction: string } {
  const missing = missingIntakeFields(input);
  if (!missing.length) return { allow: true };
  if (input.intakeReasked && input.callerTurns > input.callerTurnsAtReask) return { allow: true };
  const say = INTAKE_ASK[missing[0]];
  const questions = missing.map((field) => INTAKE_ASK[field]).join(" ");
  const instruction =
    missing.length === 1
      ? "Do not end the call. Say the question once, wait for the answer, call log_caller, then call confirm_message again. If they still do not answer, confirm_message will let you close."
      : `Do not end the call. Ask each missing item once, one question per turn, in this order: ${questions} Wait for each answer and call log_caller. Then call confirm_message again. If they still do not answer, confirm_message will let you close.`;
  return { allow: false, missing, say, instruction };
}

function twilioAuthHeader(account: string, token: string): string {
  return "Basic " + Buffer.from(`${account}:${token}`).toString("base64");
}

function rememberRecording(st: CallState, accountSid: string, recordingSid: string) {
  if (!ACCOUNT_SID.test(accountSid) || !RECORDING_SID.test(recordingSid)) return;
  st.recordingSid = recordingSid;
  st.recordingUrl = twilioRecordingMediaUrl(accountSid, recordingSid);
}

async function startTwilioRecording(callSid: string, st: CallState) {
  const account = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const missing = missingTwilioRecordingVars({ TWILIO_ACCOUNT_SID: account, TWILIO_AUTH_TOKEN: token });
  if (missing.length || !isPersistableCallSid(callSid)) {
    console.log("cht-voice recording skip", missing.length ? missing.join(",") : "call sid");
    return;
  }
  const callback = `https://${HOSTNAME}/api/cht-voice/recording`;
  const body = new URLSearchParams({
    RecordingStatusCallback: callback,
    RecordingStatusCallbackEvent: "in-progress completed absent",
    RecordingChannels: "dual",
  });
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${account}/Calls/${encodeURIComponent(callSid)}/Recordings.json`, {
      method: "POST",
      headers: {
        Authorization: twilioAuthHeader(account, token),
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept-Encoding": SAFE_ACCEPT_ENCODING,
      },
      body,
    });
    const text = await r.text();
    const recSid = r.ok ? recordingSidFromTwilio(text) : "";
    console.log("cht-voice recording start", callSid, r.status, recSid || "no-sid");
    if (recSid) rememberRecording(st, account, recSid);
  } catch (e: any) {
    console.error("cht-voice recording start failed", e?.message || e);
  }
}

/** Fill the media URL from a Recording SID we already have, or from the call's recording list. */
async function attachRecordingUrl(st: CallState, sid: string): Promise<void> {
  if (st.recordingUrl.trim()) return;
  const account = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  if (missingTwilioRecordingVars({ TWILIO_ACCOUNT_SID: account, TWILIO_AUTH_TOKEN: token }).length) return;
  if (!ACCOUNT_SID.test(account)) return;
  if (RECORDING_SID.test(st.recordingSid)) {
    rememberRecording(st, account, st.recordingSid);
    return;
  }
  const callSid = isPersistableCallSid(sid) ? sid : isPersistableCallSid(st.twilioCallSid) ? st.twilioCallSid : "";
  if (!callSid) return;
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${account}/Calls/${callSid}/Recordings.json`, {
      headers: { Authorization: twilioAuthHeader(account, token), "Accept-Encoding": SAFE_ACCEPT_ENCODING },
    });
    const text = await r.text();
    if (!r.ok) {
      console.log("cht-voice recording lookup", callSid, r.status);
      return;
    }
    const recSid = recordingSidFromTwilio(text);
    if (recSid) rememberRecording(st, account, recSid);
  } catch (e: any) {
    console.error("cht-voice recording lookup failed", e?.message || e);
  }
}

function callerIdValue(st: CallState, from: string): string {
  return (st.from || from || "").trim();
}

function shortSummary(st: CallState, from: string): string {
  const callerId = callerIdValue(st, from);
  const phone = st.phone || callerId || "(unknown)";
  const lines = [
    `Caller ID: ${callerId || "(not on this call)"}`,
    `Name: ${st.name || "(not given)"}`,
    `Town: ${st.location || "(not given)"}`,
    `Reason: ${st.need || "(not given)"}`,
    `Phone: ${phone}`,
    `Customer: ${st.customer || "(not given)"}`,
  ];
  if (st.summary.trim()) lines.push(`Notes: ${st.summary.trim()}`);
  else {
    const callerBits = st.turns.filter((x) => x.role === "caller").map((x) => x.text).slice(0, 3);
    if (callerBits.length) lines.push(`Key caller lines: ${callerBits.join(" | ").slice(0, 400)}`);
  }
  return lines.join("\n");
}

async function postFormspree(url: string, payload: Record<string, string>, label: string): Promise<boolean> {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "Accept-Encoding": SAFE_ACCEPT_ENCODING },
      body: JSON.stringify(payload),
    });
    const text = (await r.text()).slice(0, 120);
    console.log("cht formspree", label, r.status, text);
    return r.ok;
  } catch (e: any) {
    console.error("cht formspree", label, "error", e?.message || e);
    return false;
  }
}

const PRIVATE_CALLER = new Set([
  "anonymous",
  "restricted",
  "unknown",
  "withheld",
  "unavailable",
  "private",
  "blocked",
]);

function knownCallerNumber(raw: string): string {
  const value = String(raw || "").trim();
  const token = value.toLowerCase().replace(/\s+/g, "");
  if (!token || PRIVATE_CALLER.has(token)) return "";
  const digits = token.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return "";
  return value;
}

function releaseSummaryClaim(st: CallState) {
  st.summaryClaimed = false;
  if (!st.recordingEmailed) st.recordingClaimed = false;
}

/** One short notice when the realtime agent is unavailable. Not the rich summary. */
async function emailMissedCall(st: CallState, from: string, sid: string) {
  if (st.emailed || st.missedClaimed || st.summaryClaimed) return;
  const phone = knownCallerNumber(st.phone || from || st.from || "");
  if (!phone) return;
  st.missedClaimed = true;
  const body = [
    "Colorado Hot Tub — missed call",
    "(Draft for shop. Do not treat as sent-as-Heather.)",
    "",
    `CallSid: ${sid}`,
    `Caller ID: ${phone}`,
    "The voice agent was unavailable. This is the caller id only.",
  ].join("\n");
  const subject = `CHT missed call — ${phone}`;
  const peakPayload: Record<string, string> = {
    _subject: subject,
    message: body,
    phone,
    name: "CHT inbound voice",
    interest: "cht-voice",
    _cc: "brianscottwatson@gmail.com",
  };
  const shopPayload: Record<string, string> = {
    _subject: subject,
    message: body,
    phone,
    name: "CHT inbound voice",
    _cc: "brianscottwatson@gmail.com",
  };
  let peakOk = false;
  let shopOk = false;
  try {
    peakOk = await postFormspree(FORMSPREE_PEAK, peakPayload, "peak-mgobgrlr");
    shopOk = await postFormspree(FORMSPREE_SHOP, shopPayload, "shop-xgogybaj");
  } catch (e: any) {
    peakOk = false;
    shopOk = false;
    console.error("cht-voice missed-call failed", sid, e?.message || e);
  }
  if (peakOk || shopOk) {
    st.emailed = true;
    console.log("cht-voice missed-call emailed", sid);
  } else {
    st.missedClaimed = false;
    console.error("cht-voice missed-call both Formspree failed", sid);
  }
}

async function emailShop(st: CallState, from: string, sid: string, opts?: { recordingOnly?: boolean }) {
  const recordingOnly = !!(opts && opts.recordingOnly);
  if (recordingOnly) {
    if (st.recordingEmailed || st.recordingClaimed || !st.recordingUrl) return;
  } else if (st.emailed || st.summaryClaimed || st.missedClaimed) {
    return;
  }
  const phone = st.phone || from || st.from || "";
  const agented = st.agentConnected || st.turns.some((t) => t.role === "agent");
  const rich = !!(st.name || st.need || st.summary || st.turns.some((t) => t.role === "caller"));
  if (!recordingOnly && !rich && !(agented && phone)) {
    console.log("cht-voice skip empty hangup", sid, "from", phone, "agent", agented, "turns", st.turns.length);
    return;
  }
  // Claim before any await. Stop, status, and socket flush all call this.
  // The claim is the CallSid: `calls` holds one CallState per sid.
  if (recordingOnly) {
    st.recordingClaimed = true;
  } else {
    st.summaryClaimed = true;
    if (st.recordingUrl) st.recordingClaimed = true;
  }
  if (!st.recordingUrl) await attachRecordingUrl(st, sid);
  if (!recordingOnly && st.recordingUrl) st.recordingClaimed = true;
  // Recording is a URL in the message. Formspree cannot attach Twilio MP3 binaries.
  const missingRecording = missingTwilioRecordingVars(process.env);
  const recLine = recordingStatusLine(st.recordingUrl, missingRecording);
  const callerId = callerIdValue(st, from);
  const body = recordingOnly
    ? [
        "Colorado Hot Tub — call recording ready",
        "(Draft for shop. Do not treat as sent-as-Heather.)",
        "",
        `CallSid: ${sid}`,
        `Caller ID: ${callerId || "(not on this call)"}`,
        `Client name: ${st.name || "(not given)"}`,
        `Client phone: ${phone || "(unknown)"}`,
        recLine,
      ].join("\n")
    : [
        CHT_SUMMARY_TITLE,
        "(Draft for shop. Do not treat as sent-as-Heather.)",
        "",
        `CallSid: ${sid}`,
        shortSummary(st, from),
        "",
        recLine,
        "",
        "(Full transcript kept in server logs only — not emailed.)",
      ].join("\n");
  const who = st.name || phone || "inbound";
  const subject = recordingOnly
    ? `Colorado Hot Tub call recording — ${who}`
    : `${CHT_SUMMARY_TITLE} — ${who}`;
  const peakPayload: Record<string, string> = {
    _subject: subject,
    message: body,
    phone,
    name: st.name || "CHT inbound voice",
    interest: "cht-voice",
    _cc: "brianscottwatson@gmail.com",
  };
  const shopPayload: Record<string, string> = {
    _subject: subject,
    message: body,
    phone,
    name: st.name || "CHT inbound voice",
    _cc: "brianscottwatson@gmail.com",
  };
  let peakOk = false;
  let shopOk = false;
  try {
    peakOk = await postFormspree(FORMSPREE_PEAK, peakPayload, "peak-mgobgrlr");
    // Shop form (CHT_FORMSPREE) is the shop inbox — intended info@coloradohottubllc.com.
    // Confirm that destination in Formspree; this code does not change Formspree routing.
    shopOk = await postFormspree(FORMSPREE_SHOP, shopPayload, "shop-xgogybaj");
  } catch (e: any) {
    peakOk = false;
    shopOk = false;
    console.error("cht-voice email failed", sid, e?.message || e);
  }
  if (peakOk || shopOk) {
    if (recordingOnly) st.recordingEmailed = true;
    else {
      st.emailed = true;
      if (st.recordingUrl) st.recordingEmailed = true;
    }
    console.log("cht-voice emailed", sid, "peak", peakOk, "shop", shopOk, "recordingOnly", recordingOnly);
  } else {
    if (recordingOnly) st.recordingClaimed = false;
    else releaseSummaryClaim(st);
    console.error("cht-voice email both Formspree failed", sid);
  }
}

/** Test hook. Stop, status, and socket flush all end in emailShop. */
export function noteChtCaller(callSid: string, text: string) {
  state(callSid).turns.push({ role: "caller", text: String(text || "").slice(0, 2000) });
}

/** Test hook for the hangup summary path. */
export async function notifyChtHangup(callSid: string, from: string) {
  const st = state(callSid);
  const caller = String(from || st.from || "");
  if (caller) {
    st.from = caller;
    if (!st.phone) st.phone = caller;
  }
  await emailShop(st, caller, callSid);
}

export const chtVoiceRouter = Router();
chtVoiceRouter.use(rejectBrotliContentEncoding);

/** Grok Voice stream TwiML (after ring timeout, or when ring is off / unsafe). */
function streamTwiml(sid: string): string {
  const streamUrl = `wss://${HOSTNAME}/api/cht-voice/stream/${encodeURIComponent(sid)}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}" track="inbound_track" />
  </Connect>
</Response>`;
}

function sayFallback(): string {
  const shop = speakUsNanp(SHOP);
  const spoken = shop ? `${shop.groups[0]}. ${shop.groups[1]}. ${shop.groups[2]}` : "nine seven zero. Five three one. Two eight nine seven";
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Thank you for calling Colorado Hot Tub. Please call us at ${spoken}.</Say></Response>`;
}

function seedInbound(req: Request, sid: string): CallState {
  const st = state(sid);
  if (req.body?.From) {
    st.from = String(req.body.From);
    if (!st.phone) st.phone = st.from;
  }
  const called = String(req.body?.Called || req.body?.To || "");
  if (called) st.called = called;
  persist(sid, st);
  return st;
}

function queryParam(req: Request, name: string): string {
  const raw = req.query?.[name];
  if (Array.isArray(raw)) return String(raw[0] || "");
  return String(raw || "");
}

/**
 * Read-only deploy check for QA. No Twilio, Formspree, recording, or call state.
 * ringShop is the same flag the inbound POST uses. Nothing else from env is returned.
 */
function sendHealth(_req: Request, res: Response): void {
  res.set("Cache-Control", "no-store");
  res.status(200).json({
    ok: true,
    service: "cht-voice",
    ringShop: ringShopEnabled(),
    screenRoute: true,
    version: CHT_VOICE_BUILD,
  });
}

chtVoiceRouter.get("/health", sendHealth);
chtVoiceRouter.get("/", sendHealth);

/** Inbound: ring owners ~10s when explicitly enabled, else Grok. Never Dial the shop by default. */
chtVoiceRouter.post("/", async (req: Request, res: Response) => {
  const sid = String(req.body?.CallSid || crypto.randomBytes(8).toString("hex"));
  const st = seedInbound(req, sid);

  if (ringShopEnabled()) {
    const targets = resolveRingTargets({
      called: st.called || String(req.body?.Called || req.body?.To || ""),
      from: st.from || String(req.body?.From || ""),
      ringNumbersRaw: process.env.CHT_RING_NUMBERS || "",
      forwardedFrom: String(req.body?.ForwardedFrom || ""),
      calledVia: String(req.body?.CalledVia || ""),
    });
    if (targets.length) {
      console.log("cht-voice ring-first", sid, "targets", targets.join(","), "called", st.called);
      res.type("text/xml").send(dialTwiml({ hostname: HOSTNAME, targets, timeoutSec: 10, parentSid: sid }));
      return;
    }
    console.log("cht-voice skip ring — no safe targets (loop guard)", sid, "called", st.called, "shop", SHOP);
  }

  if (!process.env.XAI_API_KEY) {
    console.error("cht-voice: XAI_API_KEY missing");
    st.fallback = true;
    await emailMissedCall(st, st.from || String(req.body?.From || ""), sid);
    res.type("text/xml").send(sayFallback());
    return;
  }
  res.type("text/xml").send(streamTwiml(sid));
});

/**
 * Whisper on each Dial <Number>. Gather action (?gather=1) runs on the owner leg.
 * Digit 1 records acceptance on the parent CallSid and returns empty TwiML (bridge).
 * No digit, a wrong digit, or AMD machine/fax hangs up that leg so voicemail cannot bridge.
 */
chtVoiceRouter.post("/screen", (req: Request, res: Response) => {
  const parent = queryParam(req, "parent") || String(req.body?.ParentCallSid || "");
  if (queryParam(req, "gather") === "1") {
    const digits = String(req.body?.Digits ?? "");
    if (digits === "1") {
      if (parent) state(parent).humanAccepted = true;
      const also = String(req.body?.ParentCallSid || "");
      if (also && also !== parent) state(also).humanAccepted = true;
      console.log("cht-voice screen accept", parent || also);
      res.type("text/xml").send(emptyTwiml());
      return;
    }
    console.log("cht-voice screen reject", parent, "digits", digits || "(none)");
    res.type("text/xml").send(hangupTwiml());
    return;
  }
  if (isMachineAnswer(String(req.body?.AnsweredBy || ""))) {
    console.log("cht-voice screen machine", parent, String(req.body?.AnsweredBy || ""));
    res.type("text/xml").send(hangupTwiml());
    return;
  }
  res.type("text/xml").send(screenGatherTwiml({ hostname: HOSTNAME, parentSid: parent }));
});

/** After Dial: connect Grok unless an owner actually pressed 1. completed ≠ accepted. */
chtVoiceRouter.post("/agent", async (req: Request, res: Response) => {
  const sid = String(req.body?.CallSid || "unknown");
  const st = seedInbound(req, sid);
  const dialStatus = String(req.body?.DialCallStatus || "");

  // Whisper <Hangup/> can still report DialCallStatus=completed. Only digit 1 counts.
  if (st.humanAccepted) {
    console.log("cht-voice agent skip — human accepted", sid, "status", dialStatus);
    res.type("text/xml").send(emptyTwiml());
    return;
  }
  console.log("cht-voice agent after unaccepted dial", sid, "status", dialStatus || "(none)");

  if (!process.env.XAI_API_KEY) {
    console.error("cht-voice: XAI_API_KEY missing");
    st.fallback = true;
    await emailMissedCall(st, st.from || String(req.body?.From || ""), sid);
    res.type("text/xml").send(sayFallback());
    return;
  }
  res.type("text/xml").send(streamTwiml(sid));
});

chtVoiceRouter.post("/status", async (req: Request, res: Response) => {
  const sid = String(req.body?.CallSid || "unknown");
  const st = seedInbound(req, sid);
  if (String(req.body?.CallStatus || "") === "completed") {
    const from = st.from || String(req.body?.From || "");
    if (st.fallback) await emailMissedCall(st, from, sid);
    else await emailShop(st, from, sid);
    persist(sid, st);
  }
  res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
});

/** Twilio Recording status callback — attach URL and email if hangup already fired without it. */
chtVoiceRouter.post("/recording", async (req: Request, res: Response) => {
  const sid = String(req.body?.CallSid || "unknown");
  const st = state(sid);
  const status = String(req.body?.RecordingStatus || "");
  const url = String(req.body?.RecordingUrl || "").trim();
  const recSid = String(req.body?.RecordingSid || "").trim();
  console.log("cht-voice recording callback", sid, status, url ? "has-url" : "no-url");
  if (recSid) st.recordingSid = recSid;
  if (url && status === "completed") {
    // Twilio media is at RecordingUrl + .mp3 (or play in console)
    st.recordingUrl = url.endsWith(".mp3") || url.endsWith(".wav") ? url : `${url}.mp3`;
    persist(sid, st);
    const summaryBusy = st.emailed || st.summaryClaimed;
    if (summaryBusy && !st.recordingEmailed && !st.recordingClaimed) {
      await emailShop(st, st.from || "", sid, { recordingOnly: true });
    } else if (!st.emailed && !st.summaryClaimed) {
      await emailShop(st, st.from || "", sid);
    }
  }
  res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
});

export function attachChtVoiceStream(app: Express) {
  const anyApp = app as Express & { ws?: Function };
  if (typeof anyApp.ws !== "function") {
    console.error("express-ws not attached; CHT Grok stream disabled");
    return;
  }

  anyApp.ws("/api/cht-voice/stream/:callId", (ws: WebSocket, req: Request) => {
    const callId = String(req.params.callId || "unknown");
    const st = state(callId);
    const key = process.env.XAI_API_KEY || "";
    if (!key) {
      ws.close();
      return;
    }

    let streamSid = "";
    let sessionReady = false;
    let agentBuf = "";
    let agentSpeaking = false;
    let muteUntil = 0;
    const xaiWs = new WebSocket(XAI_URL, {
      headers: { Authorization: `Bearer ${key}` },
    });

    ws.on("message", (raw: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.event === "start") {
          streamSid = msg.start?.streamSid || "";
          st.agentConnected = true;
          const twSid = String(msg.start?.callSid || callId || "");
          if (twSid) st.twilioCallSid = twSid;
          void startTwilioRecording(twSid || callId, st);
          persist(twSid || callId, st);
        } else if (msg.event === "media" && (msg.media?.track === "inbound" || !msg.media?.track)) {
          if (!sessionReady || xaiWs.readyState !== WebSocket.OPEN) return;
          // Mute inbound only while agent audio is in flight (+ short echo hangover).
          // Do not extend muteUntil past playback — that would drop the start of their answer.
          if (agentSpeaking || Date.now() < muteUntil) return;
          xaiWs.send(JSON.stringify({ type: "input_audio_buffer.append", audio: msg.media.payload }));
        } else if (msg.event === "stop") {
          void (async () => {
            st.agentConnected = true;
            persist(callId, st);
            await emailShop(st, st.from || "", callId);
            try {
              xaiWs.close();
            } catch {
              /* ignore */
            }
          })();
        }
      } catch {
        /* ignore */
      }
    });

    xaiWs.on("open", () => {
      xaiWs.send(
        JSON.stringify({
          type: "session.update",
          session: {
            instructions:
              loadInstructions() +
              "\n\n## This call\nCaller ID (Twilio From), already captured — do not ask for it up front: " +
              (st.phone || st.from || "(unknown)") +
              ".\n" +
              phoneReadbackHint(st.phone || st.from) +
              "\nOne question at a time — wait for their full answer. After need, name, and location, confirm the caller-ID number using the spoken grouping above. If they give a different number, speak that new number the same way (area code. exchange. line) before asking if it is best." +
              "\nBefore you end the call you must have their name, town, and reason. If any is missing, re-ask politely once — one question, then wait. If confirm_message returns reask, say that question and do not say goodbye yet. The shop summary always includes this caller ID.",
            voice: "ara",
            audio: {
              input: {
                format: { type: "audio/pcmu" },
                transcription: { model: "grok-transcribe", language_hint: "en" },
              },
              output: { format: { type: "audio/pcmu" } },
            },
            // xAI Speech-to-Speech session.update documents server_vad plus optional
            // threshold / silence_duration_ms / prefix_padding_ms / idle_timeout_ms
            // (https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech).
            // Bare { type: "server_vad" } inherits a short default silence (commonly
            // ~200ms in xAI/OpenAI-compatible stacks) and ends the turn on mid-name
            // pauses, so the agent talks over the caller. Longer silence waits for a
            // full answer.
            turn_detection: {
              type: "server_vad",
              threshold: 0.55,
              prefix_padding_ms: 400,
              silence_duration_ms: 1000,
            },
            tools,
          },
        }),
      );
    });

    const speakIntakeReask = (agentText: string) => {
      const nudge = intakeNudge({
        name: st.name,
        location: st.location,
        need: st.need,
        intakeReasked: st.intakeReasked,
        callerTurns: callerTurnCount(st),
        agentText,
      });
      if (!nudge || xaiWs.readyState !== WebSocket.OPEN) return;
      st.intakeReasked = true;
      st.callerTurnsAtReask = callerTurnCount(st);
      st.turns.push({ role: "agent", text: nudge.say.slice(0, 2000) });
      xaiWs.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "force_message",
            role: "assistant",
            interruptible: false,
            content: [{ type: "output_text", text: nudge.say }],
          },
        }),
      );
    };

    xaiWs.on("message", (data: WebSocket.RawData) => {
      let message: any;
      try {
        message = JSON.parse(data.toString());
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
        st.turns.push({ role: "agent", text: GREET });
        xaiWs.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "force_message",
              role: "assistant",
              interruptible: false,
              content: [{ type: "output_text", text: GREET }],
            },
          }),
        );
      } else if (message.type === "input_audio_buffer.speech_started" && streamSid) {
        // inbound_track echo: do not barge-in (Twilio clear) while we are still
        // playing or in the echo hangover — false speech_started would cut the
        // agent mid-sentence. After hangover, clear leftover playback only.
        if (agentSpeaking || Date.now() < muteUntil) return;
        ws.send(JSON.stringify({ event: "clear", streamSid }));
      } else if (message.type === "conversation.item.input_audio_transcription.completed" && message.transcript) {
        const text = String(message.transcript).trim();
        if (text) st.turns.push({ role: "caller", text: text.slice(0, 2000) });
      } else if (message.type === "response.output_audio_transcript.delta" && message.delta) {
        agentBuf += String(message.delta);
      } else if (message.type === "response.output_audio_transcript.done" && (message.transcript || agentBuf)) {
        const text = String(message.transcript || agentBuf).trim();
        agentBuf = "";
        if (text && text !== GREET) {
          st.turns.push({ role: "agent", text: text.slice(0, 2000) });
          speakIntakeReask(text);
        }
      } else if (message.type === "response.done") {
        agentSpeaking = false;
        // Short echo hangover only (~400ms). Longer mute would ignore the start of their answer.
        muteUntil = Math.max(muteUntil, Date.now() + 400);
        if (agentBuf.trim()) {
          const text = agentBuf.trim();
          agentBuf = "";
          if (text && text !== GREET) {
            st.turns.push({ role: "agent", text: text.slice(0, 2000) });
            speakIntakeReask(text);
          }
        }
      } else if (message.type === "response.output_item.done" && message.item?.type === "function_call") {
        const fn = message.item.name;
        const callIdFn = message.item.call_id;
        let args: Record<string, any> = {};
        try {
          args = JSON.parse(message.item.arguments || "{}");
        } catch {
          /* ignore */
        }
        const result = handleTool(st, fn, args);
        persist(callId, st);
        xaiWs.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: { type: "function_call_output", call_id: callIdFn, output: result.output },
          }),
        );
        if (result.respond) xaiWs.send(JSON.stringify({ type: "response.create" }));
      } else if (message.type === "error") {
        console.error("[cht-voice]", callId, message.error?.message || message);
      }
    });

    let hangupSent = false;
    const flushHangup = async () => {
      if (hangupSent) return;
      hangupSent = true;
      st.agentConnected = true;
      try {
        // Give Twilio a moment to POST recording-complete if it is fast
        for (let i = 0; i < 6 && !st.recordingUrl; i++) {
          await new Promise((r) => setTimeout(r, 500));
        }
        persist(callId, st);
        await emailShop(st, st.from || "", callId);
      } catch (e: any) {
        console.error("cht-voice hangup email on stream close failed", callId, e?.message || e);
      }
    };

    ws.on("close", () => {
      void flushHangup();
      try {
        xaiWs.close();
      } catch {
        /* ignore */
      }
    });
    xaiWs.on("close", () => {
      void flushHangup();
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    });
  });
}

export default chtVoiceRouter;
