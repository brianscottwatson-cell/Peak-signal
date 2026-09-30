/**
 * CHT phone helpers — spoken NANP readback + inbound ring targets.
 * Pure functions. cht-voice.ts is the only caller.
 *
 * xAI grok-voice realtime (Speech-to-Speech) does not document SSML <break>.
 * Standalone TTS supports [pause] / [long-pause], but S2S prompting says
 * spoken word only — no stage directions (those can be read aloud).
 * Encode the ~0.5–1.0s group pause as a full stop between digit groups.
 */

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"] as const;

export const DEFAULT_SHOP_E164 = "+19705312897";

export function digitsOnly(raw: string): string {
  return String(raw || "").replace(/\D/g, "");
}

/** Last 10 NANP digits, or empty. Accepts 10-digit or 11-digit +1. */
export function nanpTen(raw: string): string {
  const d = digitsOnly(raw);
  if (d.length === 11 && d[0] === "1") return d.slice(1);
  if (d.length === 10) return d;
  return "";
}

export function toE164Us(raw: string): string {
  const ten = nanpTen(raw);
  if (ten) return `+1${ten}`;
  const d = digitsOnly(raw);
  if (String(raw || "").trim().startsWith("+") && d.length >= 8) return `+${d}`;
  return String(raw || "").trim();
}

export function sameNanp(a: string, b: string): boolean {
  const ta = nanpTen(a);
  const tb = nanpTen(b);
  if (ta && tb) return ta === tb;
  const da = digitsOnly(a);
  const db = digitsOnly(b);
  return !!(da && db && da === db);
}

export function speakDigitRun(d: string): string {
  return [...String(d || "")]
    .map((c) => ONES[Number(c)] ?? "")
    .filter(Boolean)
    .join(" ");
}

export type SpokenNanp = {
  ten: string;
  e164: string;
  groups: [string, string, string];
  /** Digit words with a period between groups — TTS treats each as its own sentence. */
  spoken: string;
  /** Full confirm line the agent should say. */
  confirmLine: string;
};

/**
 * US +1 NANP → 3-3-4 spoken groups.
 * Example +19705312897 → "nine seven zero. Five three one. Two eight nine seven"
 */
export function speakUsNanp(raw: string): SpokenNanp | null {
  const ten = nanpTen(raw);
  if (!ten) return null;
  const groups: [string, string, string] = [
    speakDigitRun(ten.slice(0, 3)),
    speakDigitRun(ten.slice(3, 6)),
    speakDigitRun(ten.slice(6, 10)),
  ];
  const spoken = `${groups[0]}. ${capFirst(groups[1])}. ${capFirst(groups[2])}`;
  return {
    ten,
    e164: `+1${ten}`,
    groups,
    spoken,
    confirmLine: `Your number is ${groups[0]}. ${capFirst(groups[1])}. ${capFirst(groups[2])}. Is that the best number to reach you?`,
  };
}

function capFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Fallback when the number is not 10/11 US digits — still never one unbroken stream. */
export function speakUnknownPhone(raw: string): string {
  const d = digitsOnly(raw);
  if (!d) return "";
  const chunks: string[] = [];
  for (let i = 0; i < d.length; i += 3) {
    const run = d.slice(i, i + 3);
    const words = speakDigitRun(run);
    chunks.push(i === 0 ? words : capFirst(words));
  }
  return chunks.join(". ");
}

export function phoneReadbackHint(raw: string): string {
  const nanp = speakUsNanp(raw);
  if (nanp) {
    return (
      `Spoken confirm (use this exact grouping; each period is a full stop / ~0.75s pause — do not stack digits): ` +
      nanp.confirmLine
    );
  }
  const other = speakUnknownPhone(raw);
  if (other) {
    return (
      `Spoken confirm for this non-NANP number (period = pause between groups): ` +
      `Your number is ${other}. Is that the best number to reach you?`
    );
  }
  return "Caller ID unknown. If they give a US number, speak area code, then exchange, then line — three short sentences, never one digit stream.";
}

export function parseRingNumbers(raw: string): string[] {
  return String(raw || "")
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(toE164Us)
    .filter((n, i, arr) => n && arr.findIndex((x) => sameNanp(x, n) || x === n) === i);
}

/**
 * CHT_RING_SHOP=1/true/yes/on → ring CHT_RING_NUMBERS only.
 * CHT_RING_SHOP=0/false/no/off → never ring.
 * Unset (or any other value) → off. Do not auto-enable from CHT_RING_NUMBERS.
 * The shop DID is not a dial target here; listing it in CHT_RING_NUMBERS is
 * the only way it can be dialed, and the forward-loop filter can still drop it.
 */
export function ringFirstEnabled(ringShopEnv: string, _ringNumbersRaw?: string): boolean {
  const v = String(ringShopEnv || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function blockedLine(candidate: string, raw: string | undefined): boolean {
  const other = String(raw || "").trim();
  if (!candidate || !other) return false;
  if (sameNanp(candidate, other)) return true;
  const otherE164 = toE164Us(other);
  return candidate === other || candidate === otherE164;
}

/**
 * Ring CHT_RING_NUMBERS only. The shop line is not injected when that list is
 * empty — +19705312897 used to be the fallback and its voicemail answered.
 * Never dial ForwardedFrom, CalledVia, From, or the inbound Called/To number.
 */
export function resolveRingTargets(opts: {
  called: string;
  from: string;
  /** Ignored. Kept so older callers can still pass the shop DID; it is not dialed. */
  shop?: string;
  ringNumbersRaw: string;
  forwardedFrom?: string;
  calledVia?: string;
}): string[] {
  const blocked = [opts.called, opts.from, opts.forwardedFrom, opts.calledVia];
  return parseRingNumbers(opts.ringNumbersRaw).filter((n) => !blocked.some((b) => blockedLine(n, b)));
}

/** AMD AnsweredBy values that must never be bridged. human/unknown still get the press-1 screen. */
export function isMachineAnswer(answeredBy: string): boolean {
  const v = String(answeredBy || "").trim().toLowerCase();
  if (!v || v === "human" || v === "unknown") return false;
  return v === "fax" || v.startsWith("machine");
}

export function screenUrl(hostname: string, parentSid: string, gather: boolean): string {
  const q = new URLSearchParams();
  if (parentSid) q.set("parent", parentSid);
  if (gather) q.set("gather", "1");
  const qs = q.toString();
  return `https://${hostname}/api/cht-voice/screen${qs ? `?${qs}` : ""}`;
}

/** Empty TwiML. On the whisper leg this bridges. On the Dial action it ends the parent. */
export function emptyTwiml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
}

export function hangupTwiml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`;
}

/** Whisper played to the answered owner leg. No digit falls through to Hangup. */
export function screenGatherTwiml(opts: { hostname: string; parentSid: string }): string {
  const action = escapeXml(screenUrl(opts.hostname, opts.parentSid, true));
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" timeout="5" action="${action}" method="POST">
    <Say>Colorado Hot Tub call. Press 1 to take it.</Say>
  </Gather>
  <Hangup/>
</Response>`;
}

export function dialTwiml(opts: {
  hostname: string;
  targets: string[];
  timeoutSec?: number;
  parentSid?: string;
}): string {
  const timeout = opts.timeoutSec ?? 10;
  const action = escapeXml(`https://${opts.hostname}/api/cht-voice/agent`);
  const screen = escapeXml(screenUrl(opts.hostname, opts.parentSid || "", false));
  const numbers = opts.targets
    .map(
      (n) =>
        `    <Number url="${screen}" method="POST" machineDetection="Enable" machineDetectionTimeout="5">${escapeXml(n)}</Number>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="${timeout}" answerOnBridge="true" action="${action}" method="POST">
${numbers}
  </Dial>
</Response>`;
}

function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
