/**
 * Forward-then-agent TwiML for POST /api/voice.
 * Screen is always on in this mode. The dial target comes from PEAK_FORWARD_TO.
 * Never put a personal cell number in this file.
 */

/** Public Peak Signal Twilio number. Shown on the forwarded leg via callerId. */
export const PEAK_CALLER_ID = "+19706605088";

export type ForwardEmail = "answered" | "agent" | "hungup";

export type ForwardDecision = {
  twiml: "hangup" | "agent";
  email: ForwardEmail;
  reason: string;
};

export function isE164(raw: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(String(raw || "").trim());
}

function digits(raw: string): string {
  return String(raw || "").replace(/\D/g, "");
}

function sameNumber(a: string, b: string): boolean {
  const da = digits(a);
  const db = digits(b);
  if (!da || !db) return false;
  if (da === db) return true;
  const na = da.length === 11 && da.startsWith("1") ? da.slice(1) : da;
  const nb = db.length === 11 && db.startsWith("1") ? db.slice(1) : db;
  return na.length === 10 && na === nb;
}

/**
 * Valid E.164 that is not the inbound caller, the number that was called,
 * or a forward/via loop. Otherwise null — the caller goes straight to the agent.
 */
export function resolveForwardTarget(opts: {
  raw: string;
  called?: string;
  from?: string;
  forwardedFrom?: string;
  calledVia?: string;
}): string | null {
  const raw = String(opts.raw || "").trim();
  if (!isE164(raw)) return null;
  const blocked = [opts.called, opts.from, opts.forwardedFrom, opts.calledVia];
  if (blocked.some((b) => b && sameNumber(raw, b))) return null;
  return raw;
}

const PRIVATE_TOKENS = new Set([
  "anonymous",
  "restricted",
  "unknown",
  "withheld",
  "unavailable",
  "private",
  "blocked",
]);

/** Digit-by-digit caller id for the whisper, or a private-number phrase. */
export function spokenCaller(fromRaw: string): string {
  const raw = String(fromRaw || "").trim();
  const token = raw.toLowerCase().replace(/\s+/g, "");
  if (!raw || PRIVATE_TOKENS.has(token)) return "a private number";
  const d = digits(raw);
  if (d.length < 8 || d.length > 15) return "a private number";
  return d.split("").join(" ");
}

export function whisperPhrase(fromRaw: string): string {
  return `Peak Signal call from ${spokenCaller(fromRaw)}. Press 1 to take it.`;
}

export function denverStamp(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(now);
  return `${parts} MT`;
}

export function forwardSummaryLine(opts: {
  from: string;
  email: ForwardEmail;
  reason?: string;
  now?: Date;
}): string {
  const who = String(opts.from || "").trim() || "unknown caller";
  let what = "caller hung up";
  if (opts.email === "answered") what = "answered by Brian";
  else if (opts.email === "agent") what = `sent to agent (${opts.reason || "failed"})`;
  return `Peak Signal: ${who} at ${denverStamp(opts.now)} — ${what}`;
}

/**
 * Press 1 is the only acceptance. A whisper Hangup can still arrive as
 * DialCallStatus=completed (CHT saw this; the docs define completed as
 * answered and connected). Unaccepted completed is a decline, not an answer.
 */
export function decideForward(opts: { dialStatus: string; accepted: boolean }): ForwardDecision {
  const status = String(opts.dialStatus || "").trim().toLowerCase();
  if (status === "completed" && opts.accepted) {
    return { twiml: "hangup", email: "answered", reason: "" };
  }
  if (status === "canceled") {
    return { twiml: "agent", email: "hungup", reason: "" };
  }
  if (status === "no-answer" || status === "busy" || status === "failed") {
    return { twiml: "agent", email: "agent", reason: status };
  }
  if (status === "completed") {
    return { twiml: "agent", email: "agent", reason: "declined" };
  }
  return { twiml: "agent", email: "agent", reason: "failed" };
}

function xml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function screenUrl(hostname: string, parentSid: string, from: string, gather: boolean): string {
  const q = new URLSearchParams();
  if (parentSid) q.set("parent", parentSid);
  if (from) q.set("from", from);
  if (gather) q.set("gather", "1");
  const qs = q.toString();
  return `https://${hostname}/api/voice/screen${qs ? `?${qs}` : ""}`;
}

export function emptyTwiml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
}

export function hangupTwiml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`;
}

export function screenGatherTwiml(opts: { hostname: string; parentSid: string; from: string }): string {
  const action = xml(screenUrl(opts.hostname, opts.parentSid, opts.from, true));
  const phrase = xml(whisperPhrase(opts.from));
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" timeout="6" action="${action}" method="POST">
    <Say>${phrase}</Say>
  </Gather>
  <Hangup/>
</Response>`;
}

export function forwardDialTwiml(opts: { hostname: string; parentSid: string; from: string; target: string }): string {
  const action = xml(`https://${opts.hostname}/api/voice/after-dial`);
  const screen = xml(screenUrl(opts.hostname, opts.parentSid, opts.from, false));
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="20" callerId="${PEAK_CALLER_ID}" answerOnBridge="true" action="${action}" method="POST">
    <Number url="${screen}" method="POST">${xml(opts.target)}</Number>
  </Dial>
</Response>`;
}
