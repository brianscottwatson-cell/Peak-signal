/**
 * One structured row per inbound receptionist call.
 * Off unless both PEAK_CALL_LOG_SHEET_ID and PEAK_CALL_LOG_GOOGLE_CREDENTIALS are set.
 * Credentials are Google service-account JSON (client_email and private_key only).
 * A failed append does not throw.
 *
 * The GitHub client-file backup is not this log. That path writes assessment
 * files by business slug and, for the receptionist, runs only when Formspree
 * did not succeed. A sheet row is one record per call and stays off until
 * its own config is present.
 */
import crypto from "node:crypto";
import { SAFE_ACCEPT_ENCODING } from "../brotli-guard";
import { normalizeUsE164 } from "./peak-phone";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const CALL_LOG_COLUMNS = [
  "at",
  "call_sid",
  "name",
  "phone",
  "email",
  "business",
  "need",
  "timeline",
  "booked",
  "link_texted",
  "follow_up",
  "follow_up_what",
] as const;

export type ReceptionSummary = {
  at: string;
  callSid: string;
  name: string;
  phone: string;
  email: string;
  business: string;
  need: string;
  timeline: string;
  booked: "yes" | "no";
  linkTexted: "yes" | "no";
  followUp: "yes" | "no";
  followUpWhat: string;
};

type ServiceAccount = {
  sheetId: string;
  clientEmail: string;
  privateKey: string;
};

type CachedToken = { cacheKey: string; token: string; expMs: number };

let cached: CachedToken | null = null;

export function resetCallLogForTest(): void {
  cached = null;
}

function cell(value: string, max = 400): string {
  return String(value || "").replace(/[\r\n]+/g, " ").trim().slice(0, max);
}

export function readCallLogConfig(env: NodeJS.ProcessEnv = process.env): ServiceAccount | null {
  const sheetId = String(env.PEAK_CALL_LOG_SHEET_ID || "").trim();
  const raw = String(env.PEAK_CALL_LOG_GOOGLE_CREDENTIALS || "").trim();
  if (!sheetId || !raw || !/^[\w-]+$/.test(sheetId)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  const clientEmail = String(record.client_email || "").trim();
  const privateKey = String(record.private_key || "");
  if (!clientEmail.includes("@") || /\s/.test(clientEmail) || !privateKey.includes("PRIVATE KEY")) return null;
  try {
    crypto.createPrivateKey(privateKey);
  } catch {
    console.error("call log config invalid");
    return null;
  }
  return { sheetId, clientEmail, privateKey };
}

export function callLogConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return readCallLogConfig(env) !== null;
}

export function summarizeReception(
  input: {
    callSid: string;
    name: string;
    callerId: string;
    email: string;
    business: string;
    need: string;
    timeline: string;
    outcome: string;
    linkChannel: string;
    linkTexted: boolean;
    textedTo: string;
    callbackWindow: string;
  },
  now = new Date(),
): ReceptionSummary {
  const booked = input.outcome === "booked"
    || input.linkChannel === "email"
    || input.linkChannel === "text"
    || input.linkChannel === "speak";
  const linkTexted = input.linkTexted === true;
  const phone = normalizeUsE164(input.callerId) || (linkTexted ? normalizeUsE164(input.textedTo) : "");
  const email = EMAIL.test(String(input.email || "").trim()) ? String(input.email).trim() : "";
  let followUp: "yes" | "no" = "no";
  let followUpWhat = "";
  const window = String(input.callbackWindow || "").trim();
  const need = String(input.need || "").trim();
  if (input.outcome === "callback" || window) {
    followUp = "yes";
    followUpWhat = window || need || "Caller asked for a callback.";
  } else if (input.linkChannel === "text" && !linkTexted) {
    followUp = "yes";
    followUpWhat = "They asked for the booking link by text. It was not sent.";
  } else if (!booked && (need || String(input.name || "").trim() || String(input.business || "").trim())) {
    followUp = "yes";
    followUpWhat = need || "They did not book.";
  }
  return {
    at: now.toISOString(),
    callSid: cell(input.callSid, 64),
    name: cell(input.name),
    phone,
    email: cell(email, 200),
    business: cell(input.business),
    need: cell(input.need),
    timeline: cell(input.timeline),
    booked: booked ? "yes" : "no",
    linkTexted: linkTexted ? "yes" : "no",
    followUp,
    followUpWhat: cell(followUpWhat),
  };
}

export function summaryToRow(summary: ReceptionSummary): string[] {
  return [
    summary.at,
    summary.callSid,
    summary.name,
    summary.phone,
    summary.email,
    summary.business,
    summary.need,
    summary.timeline,
    summary.booked,
    summary.linkTexted,
    summary.followUp,
    summary.followUpWhat,
  ];
}

function b64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function signJwt(email: string, privateKeyPem: string, nowSec: number): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss: email,
    scope: SHEETS_SCOPE,
    aud: TOKEN_URL,
    iat: nowSec,
    exp: nowSec + 3600,
  }));
  const unsigned = `${header}.${payload}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).end().sign(privateKeyPem);
  return `${unsigned}.${b64url(signature)}`;
}

async function getAccessToken(account: ServiceAccount): Promise<string | null> {
  const now = Date.now();
  if (cached && cached.cacheKey === account.clientEmail && cached.expMs > now + 60_000) return cached.token;
  let assertion = "";
  try {
    assertion = signJwt(account.clientEmail, account.privateKey, Math.floor(now / 1000));
  } catch (err) {
    console.error("call log jwt failed", err instanceof Error ? err.message : "error");
    return null;
  }
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept-Encoding": SAFE_ACCEPT_ENCODING,
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    console.error("call log token", response.status, text.slice(0, 120));
    cached = null;
    return null;
  }
  try {
    const parsed = JSON.parse(text) as { access_token?: string; expires_in?: number };
    const token = String(parsed.access_token || "");
    if (!token) return null;
    const expiresIn = Number(parsed.expires_in);
    const ttlMs = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn * 1000 : 3_600_000;
    cached = { cacheKey: account.clientEmail, token, expMs: now + ttlMs };
    return token;
  } catch {
    return null;
  }
}

/** Appends one row. False on any failure. Never throws. */
export async function appendReceptionSummary(
  summary: ReceptionSummary,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const account = readCallLogConfig(env);
  if (!account) return false;
  try {
    const token = await getAccessToken(account);
    if (!token) return false;
    const range = "A1:L1";
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(account.sheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept-Encoding": SAFE_ACCEPT_ENCODING,
      },
      body: JSON.stringify({
        range,
        majorDimension: "ROWS",
        values: [summaryToRow(summary)],
      }),
    });
    const text = await response.text();
    if (!response.ok) {
      if (response.status === 401) cached = null;
      console.error("call log append", response.status, text.slice(0, 120));
      return false;
    }
    return true;
  } catch (err) {
    console.error("call log failed", err instanceof Error ? err.message : "error");
    return false;
  }
}
