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
 * CHT_RING_SHOP=0/false/off → never ring.
 * CHT_RING_SHOP=1/true/on → ring.
 * Unset: ring only when CHT_RING_NUMBERS is non-empty (production owner cells).
 */
export function ringFirstEnabled(ringShopEnv: string, ringNumbersRaw: string): boolean {
  const v = String(ringShopEnv || "").trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  return parseRingNumbers(ringNumbersRaw).length > 0;
}

/**
 * Prefer CHT_RING_NUMBERS (Heather/Justin cells). Fall back to shop only when
 * inbound Called ≠ shop (avoids self-dial loop if the public DID is the shop line).
 * Never dial the inbound Called number or the caller.
 */
export function resolveRingTargets(opts: {
  called: string;
  from: string;
  shop: string;
  ringNumbersRaw: string;
}): string[] {
  const owners = parseRingNumbers(opts.ringNumbersRaw);
  const shop = toE164Us(opts.shop || DEFAULT_SHOP_E164);
  const candidates = owners.length ? owners : [shop];
  return candidates.filter((n) => {
    if (!n) return false;
    if (sameNanp(n, opts.called) || n === String(opts.called || "").trim()) return false;
    if (sameNanp(n, opts.from)) return false;
    return true;
  });
}

export function dialTwiml(opts: {
  hostname: string;
  targets: string[];
  timeoutSec?: number;
}): string {
  const timeout = opts.timeoutSec ?? 10;
  const action = `https://${opts.hostname}/api/cht-voice/agent`;
  const numbers = opts.targets
    .map((n) => `    <Number>${escapeXml(n)}</Number>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="${timeout}" action="${action}" method="POST">
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
