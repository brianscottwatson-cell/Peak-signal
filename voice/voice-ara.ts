/**
 * Peak Signal inbound voice — Grok Voice (Ara) via Twilio Media Streams.
 * Mount on the existing Express api-server.
 * XAI_API_KEY from env only. Never log the key.
 *
 * PEAK_VOICE_MODE=legacy (default): this assessment agent, unchanged.
 * PEAK_VOICE_MODE=agent: studio persona in ./peak/peak-prompt.ts.
 * PEAK_VOICE_MODE=forward_then_agent: ring PEAK_FORWARD_TO, then the studio persona.
 * Voice id: PEAK_VOICE (default ara).
 */
import { Router, type Express, type Request, type Response } from "express";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";
import WebSocket from "ws";
import {
  PEAK_CALENDLY,
  PEAK_GREETING,
  PEAK_INSTRUCTIONS,
  peakPersonaOn,
  peakVoiceMode,
  peakVoiceName,
} from "./peak/peak-prompt";
import {
  decideForward,
  emptyTwiml,
  forwardDialTwiml,
  forwardSummaryLine,
  hangupTwiml,
  resolveForwardTarget,
  screenGatherTwiml,
} from "./peak/peak-forward";

const BASE = process.env.PUBLIC_BASE_URL || "https://peak-signal.replit.app";
const HOSTNAME = (process.env.HOSTNAME || "peak-signal.replit.app").replace(/^https?:\/\//, "");
const FORMSPREE = "https://formspree.io/f/mgobgrlr";
const XAI_URL = process.env.XAI_REALTIME_URL || "wss://api.x.ai/v1/realtime?model=grok-voice-latest";
const GREET = "Hey, this is your business assessment for Peak Signal. I've got five short questions so we can map where the leverage is. Ready?";
const NOTICE = "This call may be recorded.";
const NAME_ASK = "First — what's your name and your business?";
const SPOKEN = NOTICE + " " + GREET + " " + NAME_ASK;

type CallState = {
  name: string;
  business: string;
  site: string;
  need: string;
  email: string;
  callbackWindow: string;
  outcome: string;
  note: string[];
  from: string;
  summary: string;
  confirmed: boolean;
  emailed: boolean;
  turns: { role: "agent" | "caller"; text: string; itemId?: string }[];
  revenueMonth: number | null;
  siteLookup: { url: string; sells: string; area: string; health: string };
  businessType: string;
  timeline: string;
  linkChannel: string;
  humanAccepted: boolean;
  forwardOutcome: "" | "answered" | "agent" | "hungup";
  forwardReason: string;
};
const calls = new Map<string, CallState>();

function state(sid: string): CallState {
  if (!calls.has(sid)) {
    calls.set(sid, {
      name: "",
      business: "",
      site: "",
      need: "",
      email: "",
      callbackWindow: "",
      outcome: "",
      note: [],
      from: "",
      summary: "",
      confirmed: false,
      emailed: false,
      turns: [],
      revenueMonth: null,
      siteLookup: { url: "", sells: "", area: "", health: "" },
      businessType: "",
      timeline: "",
      linkChannel: "",
      humanAccepted: false,
      forwardOutcome: "",
      forwardReason: "",
    });
  }
  return calls.get(sid)!;
}

function loadInstructions(): string {
  try {
    // Replit CJS has __dirname. The strip-types test is ESM and runs from the repo root.
    const dir = typeof __dirname !== "undefined" ? __dirname : join(process.cwd(), "voice");
    return readFileSync(join(dir, "ara-prompt.md"), "utf8");
  } catch {
    return "You are the Peak Signal free AI assessment line. Ask five questions in order, then wrap. No pitch. No dollar amounts. No Pax8 or Loc8.";
  }
}

/** What the media-stream session loads. Legacy keeps the assessment agent. */
export function inboundVoice(): { greeting: string; instructions: string; voice: string; peak: boolean } {
  if (!peakPersonaOn()) {
    return { greeting: SPOKEN, instructions: loadInstructions(), voice: "ara", peak: false };
  }
  return {
    greeting: PEAK_GREETING,
    instructions: PEAK_INSTRUCTIONS,
    voice: peakVoiceName(),
    peak: true,
  };
}

const tools = [
  { type: "web_search" },
  {
    type: "function",
    name: "log_qualification",
    description: "Save caller name, business, site, and need as you learn them. Call often.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        business: { type: "string" },
        site: { type: "string" },
        need: { type: "string" },
        email: { type: "string" },
        revenue_month: { type: "number", description: "Caller's stated monthly revenue or good-month number in USD. Only if they said it." },
      },
    },
  },
  {
    type: "function",
    name: "note_site_lookup",
    description: "Save live site lookup after name/business. health is current, stale, broken, or unreachable.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string" },
        sells: { type: "string" },
        area: { type: "string" },
        health: { type: "string", enum: ["current", "stale", "broken", "unreachable"] },
      },
      required: ["health"],
    },
  },
  {
    type: "function",
    name: "confirm_lead",
    description: "Call AFTER you read back name, business, site, need, and callback number and the caller confirmed. Never call with empty name and empty business. summary must be a clean 3-6 sentence recap, not raw speech-to-text.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        business: { type: "string" },
        site: { type: "string" },
        need: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        summary: { type: "string" },
        revenue_month: { type: "number", description: "Stated monthly revenue in USD, only if they said it." },
      },
      required: ["name", "need", "summary"],
    },
  },
  {
    type: "function",
    name: "book_intro",
    description: "Caller wants the 30 minute Calendly intro. Call only after confirm_lead. Optional real caller email only.",
    parameters: {
      type: "object",
      properties: { email: { type: "string" } },
    },
  },
  {
    type: "function",
    name: "send_contact",
    description: "Caller wants the contact form URL. Call only after confirm_lead.",
    parameters: { type: "object", properties: { email: { type: "string" } } },
  },
  {
    type: "function",
    name: "request_callback",
    description: "Have Brian call back. Collect a window. Call only after confirm_lead.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        window: { type: "string" },
        reason: { type: "string" },
      },
      required: ["window"],
    },
  },
];

const peakTools = [
  {
    type: "function",
    name: "log_qualification",
    description: "Save business name, business type, need, timeline, callback number, and email as you learn them.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        business: { type: "string" },
        business_type: { type: "string" },
        need: { type: "string" },
        timeline: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
      },
    },
  },
  {
    type: "function",
    name: "send_booking_link",
    description: "Caller wants the Calendly link. email copies them on the hangup summary. text records a request for Brian at Peak Signal; this server does not send SMS. speak means you will read the link.",
    parameters: {
      type: "object",
      properties: {
        channel: { type: "string", enum: ["email", "text", "speak"] },
        email: { type: "string" },
        phone: { type: "string" },
      },
      required: ["channel"],
    },
  },
  {
    type: "function",
    name: "confirm_lead",
    description: "Call after you read back the lead and the caller confirms. summary is a clean 3-6 sentence recap.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        business: { type: "string" },
        business_type: { type: "string" },
        need: { type: "string" },
        timeline: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        summary: { type: "string" },
      },
      required: ["summary"],
    },
  },
  {
    type: "function",
    name: "request_callback",
    description: "Safety handoff, or the caller wants Brian at Peak Signal to call back.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        window: { type: "string" },
        reason: { type: "string" },
      },
      required: ["reason"],
    },
  },
];

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || "").trim());
}

function cleanSummary(st: CallState): string {
  if ((st.summary || "").trim()) return st.summary.trim();
  const parts: string[] = [];
  if (st.name) parts.push(`${st.name} called Peak Signal.`);
  if (st.business) parts.push(`They run ${st.business}.`);
  if (st.site) parts.push(`Their site is ${st.site}.`);
  if (st.need) parts.push(`They need ${st.need}.`);
  if (st.callbackWindow) parts.push(`Callback window: ${st.callbackWindow}.`);
  if (st.outcome === "booked") parts.push("They will book the 30 minute Calendly intro.");
  if (st.outcome === "form sent") parts.push("They asked for the contact form.");
  if (st.outcome === "callback") parts.push("They asked Brian to call back.");
  return parts.join(" ");
}

function shouldNotify(st: CallState): boolean {
  if (st.emailed) return false;
  const hasCaller = (st.turns || []).some((x) => x.role === "caller" && x.text.trim());
  const identity = !!(st.name || "").trim() || !!(st.business || "").trim();
  const substance = !!(st.need || "").trim() || !!(st.summary || "").trim();
  return hasCaller || (identity && substance);
}


function slugify(s: string): string {
  const x = (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return x.slice(0, 48) || "";
}

function formatTurns(st: CallState): string {
  const turns = st.turns || [];
  if (!turns.length) return "(no dual-speaker turns captured)";
  const lines: string[] = [];
  let last = "";
  for (const x of turns) {
    const line = `[${x.role === "agent" ? "Agent" : "Caller"}]: ${x.text.trim()}`;
    if (line === last) continue;
    lines.push(line);
    last = line;
  }
  return lines.join("\n\n");
}

function pushTurn(st: CallState, role: "agent" | "caller", text: string, itemId?: string) {
  const trimmed = (text || "").trim().slice(0, 2000);
  if (!trimmed) return;
  const turns = st.turns;
  for (let i = turns.length - 1; i >= 0; i--) {
    const prev = turns[i];
    if (prev.role !== role) break;
    const sameItem = !!(itemId && prev.itemId && prev.itemId === itemId);
    const extendsPrev = trimmed.startsWith(prev.text) || prev.text.startsWith(trimmed);
    if (sameItem || extendsPrev) {
      if (trimmed.length >= prev.text.length) {
        prev.text = trimmed;
        if (itemId) prev.itemId = itemId;
      }
      return;
    }
  }
  turns.push({ role, text: trimmed, itemId });
}

function roundNearest500(n: number): number {
  return Math.round(n / 500) * 500;
}

function parseMonthlyRevenue(st: CallState): number | null {
  if (st.revenueMonth && st.revenueMonth > 0) return st.revenueMonth;
  const blob = [st.summary, st.need, ...(st.turns || []).map((x) => x.text)].join(" ");
  const ctx = /(?:month|monthly|revenue|goal|take.?home|gross|sales)/i;
  if (!ctx.test(blob)) return null;
  const m = blob.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(k|thousand|m|million)?/i)
    || blob.match(/([\d,]+(?:\.\d+)?)\s*(k|thousand)\s*(?:a month|per month|\/mo|monthly)/i);
  if (!m) return null;
  let n = Number(String(m[1]).replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1900 && n <= 2100) return null;
  const unit = (m[2] || "").toLowerCase();
  if (unit === "k" || unit === "thousand") n *= 1000;
  if (unit === "m" || unit === "million") n *= 1_000_000;
  if (n < 1000 || n > 10_000_000) return null;
  return n;
}

function estimateLines(st: CallState): { pilot: string; retainer: string; valueShare: string } {
  const monthly = parseMonthlyRevenue(st);
  const workflow = st.need || "the named workflow";
  if (!monthly) {
    return {
      pilot: "needs baseline",
      retainer: "needs baseline",
      valueShare: `20% of measured lift on ${workflow} — needs baseline`,
    };
  }
  const pilot = roundNearest500(monthly / 12);
  return {
    pilot: `$${pilot.toLocaleString("en-US")} (scoped to ${workflow})`,
    retainer: `$${(pilot * 2).toLocaleString("en-US")}/mo`,
    valueShare: `20% of measured lift on ${workflow}`,
  };
}

function siteLookupLines(st: CallState): string[] {
  const s = st.siteLookup || { url: "", sells: "", area: "", health: "" };
  return [
    `## Site lookup`,
    `- **URL:** ${s.url || st.site || "(not fetched)"}`,
    `- **Sells/services:** ${s.sells || "(not fetched)"}`,
    `- **Service area:** ${s.area || "(not fetched)"}`,
    `- **Site health:** ${s.health || "unreachable"}`,
  ];
}

function buildRecap(st: CallState): string {
  const who = st.name || st.business || "there";
  const biz = st.business || who;
  const est = estimateLines(st);
  const tools = st.site || "(none named)";
  const want = st.need || cleanSummary(st) || "(not named)";
  const site = st.siteLookup || { url: "", sells: "", area: "", health: "" };
  const baseline = parseMonthlyRevenue(st);
  const baselineLine = baseline
    ? `About $${baseline.toLocaleString("en-US")} a month.`
    : "Needs baseline — no dollar or volume number on the call, so no bid yet.";
  return [
    "Peak Signal",
    "Brian at Peak Signal",
    "getpeaksignal.com  ·  970-660-5088",
    "",
    `Assessment recap for ${who}`,
    biz !== who ? `Business: ${biz}` : "",
    `Date: ${new Date().toISOString().slice(0, 10)}`,
    "",
    "What you want",
    want,
    "",
    "Tools you named",
    tools,
    "",
    "How Peak might integrate",
    site.sells
      ? `Your site (${site.url || st.site || "unlisted"}) looks ${site.health || "unchecked"}. Peak would start with the workflow you named — ${st.need || "the hours-eater"} — and wire it into the tools you already use.`
      : `Peak would start with the workflow you named — ${st.need || "the hours-eater"} — and wire it into the systems you already run. Site lookup: ${site.health || "not fetched"}.`,
    "",
    "The service you're asking for",
    st.need ? `Help with: ${st.need}.` : "A scoped map of where the leverage is, then a pilot if the baseline is clear.",
    "",
    "Baseline",
    baselineLine,
    "",
    "Draft numbers (only if a baseline exists)",
    `Pilot: ${est.pilot}`,
    `Retainer floor: ${est.retainer}`,
    `Value-share: ${est.valueShare}`,
    "",
    "— Brian at Peak Signal",
    "",
  ].filter((line) => line !== undefined).join("\n");
}

function isEchoOf(caller: string, agent: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const c = norm(caller);
  const a = norm(agent);
  if (!c || c.length < 12 || !a) return false;
  if (a.includes(c) || (c.length >= 20 && c.includes(a.slice(0, Math.min(80, a.length))))) return true;
  const cw = Array.from(new Set(c.split(" ").filter((w) => w.length > 3)));
  if (cw.length < 3) return false;
  const aw = new Set(a.split(" ").filter((w) => w.length > 3));
  const hit = cw.filter((w) => aw.has(w)).length;
  return hit / cw.length >= 0.7;
}

function lastAgentQuestion(st: CallState): string {
  const turns = [...(st.turns || [])].reverse();
  const q = turns.find((x) => x.role === "agent" && x.text.includes("?"));
  const raw = q?.text || NAME_ASK;
  const parts = raw.split("?").map((s) => s.trim()).filter(Boolean);
  const last = parts[parts.length - 1];
  return last ? last + "?" : NAME_ASK;
}

function buildTranscript(st: CallState, fromNumber: string): string {
  const who = st.name || st.business || "Unknown caller";
  return [
    `# Call Transcript — ${who}`,
    `**Date:** ${new Date().toISOString().slice(0, 10)}`,
    `**Agent:** Peak Signal Voice Intake Assessment Agent`,
    `**Number:** ${fromNumber || st.from || ""}`,
    "",
    "## Full conversation",
    formatTurns(st),
    "",
    "## Recap (derived from transcript)",
    cleanSummary(st) || "(no recap)",
    "",
    ...siteLookupLines(st),
    "",
    "---",
    "*Dual-speaker transcript from the live voice stream. No audio file stored. No credentials.*",
    "",
  ].join("\n");
}

function buildScorecard(st: CallState): string {
  const who = st.name || st.business || "Unknown caller";
  const est = estimateLines(st);
  return [
    "# Peak Signal — Intake Scorecard",
    `**Client:** ${who}`,
    `**Date:** ${new Date().toISOString().slice(0, 10)}`,
    "**Call length:** unknown",
    "",
    "## Leverage Map",
    `- **Primary workflow to mechanize first:** ${st.need || "needs baseline"}`,
    `- **Data to pull next:** ${st.siteLookup?.url || st.site || "needs baseline"}`,
    `- **Single metric for value-share:** ${st.need || "needs baseline"}`,
    "",
    "## Auto-drafted Estimate",
    `- **Pilot (flat fee):** ${est.pilot}`,
    `- **Retainer floor:** ${est.retainer}`,
    `- **Value-share:** ${est.valueShare}`,
    "",
    "## Notes from the five answers",
    `1. ${st.business || "(not given)"}`,
    `2. ${st.need || "(not given)"}`,
    `3. ${st.summary || "(not given)"}`,
    `4. ${st.site || st.siteLookup?.sells || "(not given)"}`,
    `5. ${st.need || st.summary || "(not given)"}`,
    "",
    ...siteLookupLines(st),
    "",
    "— Peak Signal",
    "",
  ].join("\n");
}

async function ghPut(repo: string, path: string, content: string, message: string) {
  const token = process.env.GITHUB_TOKEN || "";
  if (!token) {
    console.log("GITHUB_TOKEN missing — skip GitHub write-back for", path);
    return false;
  }
  const url = `https://api.github.com/repos/brianscottwatson-cell/${repo}/contents/${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "peak-signal-voice",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  let sha = "";
  try {
    const get = await fetch(url, { headers });
    if (get.ok) {
      const j: any = await get.json();
      sha = j.sha || "";
    } else if (get.status !== 404) {
      console.error("github get failed", path, get.status, (await get.text()).slice(0, 200));
    }
  } catch (e: any) {
    console.error("github get failed", path, e?.message || e);
  }
  const body: Record<string, string> = {
    message,
    content: Buffer.from(content, "utf8").toString("base64"),
    branch: "main",
  };
  if (sha) body.sha = sha;
  try {
    const put = await fetch(url, { method: "PUT", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!put.ok) {
      console.error("github put failed", path, put.status, (await put.text()).slice(0, 200));
      return false;
    }
    console.log("github put ok", path);
    return true;
  } catch (e: any) {
    console.error("github put failed", path, e?.message || e);
    return false;
  }
}

async function fileAssessment(st: CallState, fromNumber: string, sid: string) {
  const notify = shouldNotify(st);
  console.log("hangup", sid, "notify", notify, "token", !!process.env.GITHUB_TOKEN, "turns", (st.turns || []).length, "name", st.name, "business", st.business);
  await emailBrian(st, fromNumber);
  if (peakPersonaOn()) {
    console.log("hangup skip github — peak voice agent", sid);
    return;
  }
  if (!notify) {
    console.log("hangup skip github — empty or already sent", sid);
    return;
  }
  let slug = slugify(st.business) || slugify(st.name) || `call-${String(sid).slice(-8).toLowerCase()}`;
  if (slug === "peak-signal-self-test-2026-08-29") {
    slug = `call-${String(sid).slice(-8).toLowerCase()}`;
  }
  const transcript = buildTranscript(st, fromNumber);
  const scorecard = buildScorecard(st);
  const recap = buildRecap(st);
  const msg = `Peak Signal intake write-back for ${slug}`;
  const tOk = await ghPut("brain", `clients/${slug}/transcript.md`, transcript, msg);
  const sOk = await ghPut("brain", `clients/${slug}/scorecard.md`, scorecard, msg);
  const rOk = await ghPut("brain", `clients/${slug}/recap.md`, recap, msg);
  console.log("hangup github", slug, "transcript", tOk, "scorecard", sOk, "recap", rOk);
}

function peakCallSummary(st: CallState, from: string): string {
  const lines: string[] = [];
  if (st.forwardOutcome) {
    lines.push(forwardSummaryLine({ from: from || st.from, email: st.forwardOutcome, reason: st.forwardReason }));
    lines.push("");
  }
  lines.push(
    "Peak Signal call summary",
    "Brian at Peak Signal",
    "getpeaksignal.com",
    "",
    `Name: ${st.name || "(not given)"}`,
    `Business: ${st.business || "(not given)"}`,
    `Business type: ${st.businessType || "(not given)"}`,
    `Need: ${st.need || "(not given)"}`,
    `Timeline: ${st.timeline || "(not given)"}`,
    `Callback: ${from || st.from || "(unknown)"}`,
    `Email: ${isEmail(st.email) ? st.email.trim() : "(not given)"}`,
    `Booking: ${st.linkChannel || "(not requested)"}`,
  );
  if (st.linkChannel) {
    lines.push(`Calendly: ${PEAK_CALENDLY}`);
    if (st.linkChannel === "text") lines.push("They asked for the link by text. This server did not send a text.");
    if (st.linkChannel === "email") lines.push("They asked for the link by email. It is in this message.");
  }
  if ((st.summary || "").trim()) lines.push("", st.summary.trim());
  lines.push("", formatTurns(st));
  return lines.join("\n");
}

async function postPeakForm(payload: Record<string, string>): Promise<void> {
  await fetch(FORMSPREE, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/** One-line forward outcome. Sets emailed so the agent summary is not also sent. */
async function sendForwardLine(st: CallState, fromNumber: string): Promise<void> {
  if (st.emailed || !st.forwardOutcome) return;
  st.emailed = true;
  const from = fromNumber || st.from || "";
  const line = forwardSummaryLine({ from, email: st.forwardOutcome, reason: st.forwardReason });
  try {
    await postPeakForm({
      _subject: `Peak Signal call — ${from || "inbound"}`,
      message: line,
      phone: from,
      interest: "inbound-voice",
      _cc: "brianscottwatson@gmail.com",
      name: "Brian at Peak Signal",
    });
  } catch (e: any) {
    console.error("formspree failed", e?.message || e);
    st.emailed = false;
  }
}

async function emailBrian(st: CallState, fromNumber: string) {
  if (!shouldNotify(st)) {
    console.log("formspree skip: empty hangup or already sent");
    return;
  }
  st.emailed = true;
  const from = fromNumber || st.from || "";
  const leadEmail = isEmail(st.email) ? st.email.trim() : "";
  const leadName = (st.name || "").trim();
  const outcome = st.outcome || "qualified";
  const peakOn = peakPersonaOn();
  const body = peakOn
    ? peakCallSummary(st, from)
    : [
    buildRecap(st),
    "",
    "----- internal -----",
    `From-line: Brian at Peak Signal`,
    `Name: ${leadName || "(not given)"}`,
    `Number: ${from || "(unknown)"}`,
    `Outcome: ${outcome}`,
    `Email: ${leadEmail || "(not given — recap not promised)"}`,
    "",
    "===== TRANSCRIPT (final utterances only) =====",
    formatTurns(st),
    "",
    "===== SCORECARD =====",
    buildScorecard(st),
  ].join("\n");
  const ccs = ["brianscottwatson@gmail.com"];
  if (leadEmail) ccs.push(leadEmail);
  const payload: Record<string, string> = {
    _subject: peakOn
      ? `Peak Signal call — ${leadName || st.business || "inbound"}`
      : `Peak Signal Assessment — ${leadName || st.business || "inbound"}`,
    message: body,
    phone: from,
    interest: "inbound-voice",
    _cc: ccs.join(","),
    name: "Brian at Peak Signal",
  };
  if (leadEmail) {
    payload.email = leadEmail;
    payload._replyto = leadEmail;
  }
  try {
    await postPeakForm(payload);
  } catch (e: any) {
    console.error("formspree failed", e?.message || e);
    st.emailed = false;
  }
}

function applyLead(st: CallState, args: Record<string, any>) {
  if (args.name) st.name = String(args.name).trim();
  if (args.business) st.business = String(args.business).trim();
  if (args.site) st.site = String(args.site).trim();
  if (args.need) st.need = String(args.need).trim();
  if (args.email && isEmail(String(args.email))) st.email = String(args.email).trim();
  if (args.phone && String(args.phone).trim()) st.from = String(args.phone).trim();
  if (args.summary) st.summary = String(args.summary).trim();
  if (args.window) st.callbackWindow = String(args.window).trim();
  if (args.business_type || args.businessType) st.businessType = String(args.business_type || args.businessType).trim();
  if (args.timeline) st.timeline = String(args.timeline).trim();
  const rm = args.revenue_month ?? args.revenueMonth;
  if (rm != null && Number.isFinite(Number(rm)) && Number(rm) > 0) st.revenueMonth = Number(rm);
}

function handleTool(st: CallState, name: string, args: Record<string, any>): string {
  if (name === "log_qualification") {
    applyLead(st, args);
    return JSON.stringify({ ok: true });
  }
  if (name === "note_site_lookup") {
    st.siteLookup = {
      url: String(args.url || "").trim(),
      sells: String(args.sells || "").trim(),
      area: String(args.area || "").trim(),
      health: String(args.health || "").trim() || "unreachable",
    };
    if (st.siteLookup.url && !st.site) st.site = st.siteLookup.url;
    return JSON.stringify({ ok: true });
  }
  if (name === "confirm_lead") {
    applyLead(st, args);
    const identity = !!(st.name || st.business);
    const substance = !!(st.need || st.summary);
    if (!identity || !substance) {
      return JSON.stringify({ ok: false, error: "need name or business, plus need, before confirm" });
    }
    st.confirmed = true;
    return JSON.stringify({
      ok: true,
      confirmed: {
        name: st.name,
        business: st.business,
        site: st.site,
        need: st.need,
        phone: st.from,
        email: st.email || "",
      },
    });
  }
  if (name === "book_intro") {
    applyLead(st, args);
    st.outcome = "booked";
    return JSON.stringify({
      ok: true,
      calendly: "https://calendly.com/hello-peaksignal/30min",
      timezone: "America/Denver",
    });
  }
  if (name === "send_contact") {
    applyLead(st, args);
    st.outcome = "form sent";
    return JSON.stringify({ ok: true, contact: "https://peak-signal.replit.app/contact" });
  }
  if (name === "request_callback") {
    applyLead(st, args);
    if (args.reason && !st.need) st.need = String(args.reason).slice(0, 180);
    st.outcome = "callback";
    return JSON.stringify({ ok: true });
  }
  if (name === "send_booking_link") {
    applyLead(st, args);
    const channel = String(args.channel || "speak").trim().toLowerCase();
    st.linkChannel = channel === "email" || channel === "text" || channel === "speak" ? channel : "speak";
    st.outcome = st.linkChannel === "email" ? "calendly email" : st.linkChannel === "text" ? "calendly text" : "calendly spoken";
    return JSON.stringify({
      ok: true,
      calendly: PEAK_CALENDLY,
      channel: st.linkChannel,
      sms: false,
    });
  }
  return JSON.stringify({ error: "unknown tool" });
}

const POLLY_FALLBACK = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${SPOKEN}</Say></Response>`;

function queryParam(req: Request, name: string): string {
  const raw = req.query?.[name];
  if (Array.isArray(raw)) return String(raw[0] || "");
  return String(raw || "");
}

function streamTwiml(sid: string): string {
  const streamUrl = `wss://${HOSTNAME}/api/voice/stream/${encodeURIComponent(sid)}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}" track="inbound_track" />
  </Connect>
</Response>`;
}

function sendAgentOrPolly(res: Response, sid: string) {
  if (!process.env.XAI_API_KEY) {
    console.error("XAI_API_KEY missing — Polly fallback");
    const copy = inboundVoice();
    const xml = copy.greeting === SPOKEN
      ? POLLY_FALLBACK
      : `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${copy.greeting}</Say></Response>`;
    res.type("text/xml").send(xml);
    return;
  }
  res.type("text/xml").send(streamTwiml(sid));
}

/** Test hook: a caller line makes the hangup summary count as a real agent call. */
export function recordCallerUtterance(callSid: string, text: string) {
  pushTurn(state(callSid), "caller", text);
}

export const voiceAraRouter = Router();

voiceAraRouter.post("/", (req: Request, res: Response) => {
  const sid = String(req.body?.CallSid || crypto.randomBytes(8).toString("hex"));
  const st = state(sid);
  st.from = String(req.body?.From || "");
  const called = String(req.body?.Called || req.body?.To || "");

  if (peakVoiceMode() === "forward_then_agent") {
    const target = resolveForwardTarget({
      raw: process.env.PEAK_FORWARD_TO || "",
      called,
      from: st.from,
      forwardedFrom: String(req.body?.ForwardedFrom || ""),
      calledVia: String(req.body?.CalledVia || ""),
    });
    if (target) {
      res.type("text/xml").send(forwardDialTwiml({
        hostname: HOSTNAME,
        parentSid: sid,
        from: st.from,
        target,
      }));
      return;
    }
  }

  sendAgentOrPolly(res, sid);
});

/** Whisper on the forwarded leg. Digit 1 bridges. Anything else hangs up that leg only. */
voiceAraRouter.post("/screen", (req: Request, res: Response) => {
  const parent = queryParam(req, "parent") || String(req.body?.ParentCallSid || "");
  const from = queryParam(req, "from") || (parent ? state(parent).from : "");
  if (queryParam(req, "gather") === "1") {
    const digits = String(req.body?.Digits ?? "");
    if (digits === "1") {
      if (parent) state(parent).humanAccepted = true;
      res.type("text/xml").send(emptyTwiml());
      return;
    }
    res.type("text/xml").send(hangupTwiml());
    return;
  }
  res.type("text/xml").send(screenGatherTwiml({ hostname: HOSTNAME, parentSid: parent, from }));
});

/**
 * Dial action. Press 1 + completed hangs up the parent (Brian took the call).
 * no-answer, busy, failed, canceled, and an unaccepted completed (whisper hangup)
 * return the Peak agent stream.
 */
voiceAraRouter.post("/after-dial", async (req: Request, res: Response) => {
  const sid = String(req.body?.CallSid || "unknown");
  const st = state(sid);
  if (req.body?.From) st.from = String(req.body.From);
  const decision = decideForward({
    dialStatus: String(req.body?.DialCallStatus || ""),
    accepted: st.humanAccepted,
  });
  st.forwardOutcome = decision.email;
  st.forwardReason = decision.reason;
  if (decision.email === "answered" || decision.email === "hungup") {
    await sendForwardLine(st, st.from);
  }
  if (decision.twiml === "hangup") {
    res.type("text/xml").send(hangupTwiml());
    return;
  }
  sendAgentOrPolly(res, sid);
});

voiceAraRouter.post("/status", async (req: Request, res: Response) => {
  const sid = String(req.body?.CallSid || "unknown");
  const st = state(sid);
  const status = String(req.body?.CallStatus || "");
  if (req.body?.From) st.from = String(req.body.From);
  if (status === "completed") {
    await fileAssessment(st, st.from || String(req.body?.From || ""), sid);
    if (peakVoiceMode() === "forward_then_agent" && !st.emailed) {
      if (!st.forwardOutcome) st.forwardOutcome = "hungup";
      await sendForwardLine(st, st.from || String(req.body?.From || ""));
    }
  }
  res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
});

/** Attach Twilio Media Stream websocket. Requires express-ws on the app. */
export function attachVoiceStream(app: Express) {
  const anyApp = app as Express & { ws?: Function };
  if (typeof anyApp.ws !== "function") {
    console.error("express-ws not attached; Grok Voice stream disabled");
    return;
  }

  anyApp.ws("/api/voice/stream/:callId", (ws: WebSocket, req: Request) => {
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
    const voiceCopy = inboundVoice();
    let lastAgentText = voiceCopy.greeting;
    let echoResets = 0;
    const xaiWs = new WebSocket(XAI_URL, {
      headers: { Authorization: `Bearer ${key}` },
    });

    ws.on("message", (raw: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.event === "start") {
          streamSid = msg.start?.streamSid || "";
          if (msg.start?.customParameters?.from) st.from = String(msg.start.customParameters.from);
        } else if (msg.event === "media" && (msg.media?.track === "inbound" || !msg.media?.track)) {
          if (!sessionReady || xaiWs.readyState !== WebSocket.OPEN) return;
          if (agentSpeaking || Date.now() < muteUntil) return;
          xaiWs.send(JSON.stringify({ type: "input_audio_buffer.append", audio: msg.media.payload }));
        } else if (msg.event === "stop") {
          xaiWs.close();
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
            instructions: voiceCopy.instructions,
            voice: voiceCopy.voice,
            audio: {
              input: {
                format: { type: "audio/pcmu" },
                transcription: { model: "grok-transcribe", language_hint: "en" },
              },
              output: { format: { type: "audio/pcmu" } },
            },
            turn_detection: { type: "server_vad" },
            tools: voiceCopy.peak ? peakTools : tools,
          },
        }),
      );
    });

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
        st.turns.push({ role: "agent", text: voiceCopy.greeting });
        xaiWs.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "force_message",
              role: "assistant",
              interruptible: false,
              content: [{ type: "output_text", text: voiceCopy.greeting }],
            },
          }),
        );
      } else if (message.type === "input_audio_buffer.speech_started" && streamSid) {
        if (agentSpeaking || Date.now() < muteUntil) return;
        ws.send(JSON.stringify({ event: "clear", streamSid }));
      } else if (message.type === "conversation.item.input_audio_transcription.completed" && message.transcript) {
        const text = String(message.transcript).trim();
        const itemId = String(message.item_id || message.item?.id || "");
        if (!text) return;
        if (isEchoOf(text, lastAgentText)) {
          try { xaiWs.send(JSON.stringify({ type: "input_audio_buffer.clear" })); } catch { /* ignore */ }
          echoResets += 1;
          console.log("echo dropped", callId, echoResets, text.slice(0, 80));
          return;
        }
        pushTurn(st, "caller", text, itemId || undefined);
      } else if (message.type === "response.output_audio_transcript.delta" && message.delta) {
        agentBuf += String(message.delta);
      } else if (message.type === "response.output_audio_transcript.done" && (message.transcript || agentBuf)) {
        const text = String(message.transcript || agentBuf).trim();
        agentBuf = "";
        if (text && text !== voiceCopy.greeting) {
          pushTurn(st, "agent", text);
          lastAgentText = text;
        }
      } else if (message.type === "response.done") {
        agentSpeaking = false;
        muteUntil = Math.max(muteUntil, Date.now() + 400);
        if (agentBuf.trim()) {
          const text = agentBuf.trim();
          agentBuf = "";
          if (text && text !== voiceCopy.greeting) {
            pushTurn(st, "agent", text);
            lastAgentText = text;
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
        xaiWs.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: { type: "function_call_output", call_id: callIdFn, output: result },
          }),
        );
        xaiWs.send(JSON.stringify({ type: "response.create" }));
      } else if (message.type === "error") {
        console.error("[voice-ara]", callId, message.error?.message || message);
      }
    });

    ws.on("close", () => xaiWs.close());
    xaiWs.on("close", () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    });
  });
}

export default voiceAraRouter;
