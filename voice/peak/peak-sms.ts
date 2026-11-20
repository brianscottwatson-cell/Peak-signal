/**
 * One booking-link SMS for the inbound receptionist.
 * Off unless PEAK_SMS_ENABLED is exactly "1".
 * From-line is PEAK_SMS_FROM when that is valid US E.164, otherwise the studio
 * line (PEAK_CALLER_ID). An invalid PEAK_SMS_FROM does not fall back.
 * Account: TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN. This file has no credentials.
 * Outbound calls do not import this module.
 */
import { SAFE_ACCEPT_ENCODING } from "../brotli-guard";
import { PEAK_CALLER_ID } from "./peak-forward";
import { isUsE164, normalizeUsE164 } from "./peak-phone";
import { PEAK_CALENDLY, peakPersonaOn, peakSmsEnabled } from "./peak-prompt";

export type SmsAttempt = {
  attempted: boolean;
  sending: boolean;
  sent: boolean;
  to: string;
};

export function bookingLinkSmsBody(): string {
  return `Peak Signal: book your 30-minute call here: ${PEAK_CALENDLY}`;
}

/** Studio line when PEAK_SMS_FROM is unset. Invalid overrides do not send. */
export function smsFromNumber(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.PEAK_SMS_FROM;
  if (raw == null || String(raw).trim() === "") return isUsE164(PEAK_CALLER_ID) ? PEAK_CALLER_ID : null;
  const value = String(raw).trim();
  return isUsE164(value) ? value : null;
}

export function resolveBookingSmsTo(input: {
  callerId: string;
  requestedPhone: string;
  confirmed: boolean;
  fromLine: string;
}): { ok: true; to: string } | { ok: false; reason: string } {
  const caller = normalizeUsE164(input.callerId);
  const fromLine = normalizeUsE164(input.fromLine);
  const rawRequested = String(input.requestedPhone || "").trim();
  const requested = rawRequested ? normalizeUsE164(rawRequested) : "";
  if (rawRequested && !requested) return { ok: false, reason: "invalid_number" };

  let to = "";
  if (requested && caller && requested === caller) to = caller;
  else if (requested && input.confirmed) to = requested;
  else if (requested) return { ok: false, reason: "unconfirmed_number" };
  else if (caller) to = caller;
  else return { ok: false, reason: "no_caller_number" };

  if (!to || (fromLine && to === fromLine)) return { ok: false, reason: "not_the_caller" };
  return { ok: true, to };
}

async function postTwilioMessage(input: {
  account: string;
  token: string;
  from: string;
  to: string;
  body: string;
}): Promise<boolean> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(input.account)}/Messages.json`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${input.account}:${input.token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept-Encoding": SAFE_ACCEPT_ENCODING,
    },
    body: new URLSearchParams({
      To: input.to,
      From: input.from,
      Body: input.body,
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    console.error("booking sms twilio", response.status, text.slice(0, 120));
    return false;
  }
  return true;
}

/**
 * At most one Messages API call per attempt object.
 * A failed or ambiguous send stays claimed so a retry cannot text twice.
 * A rejected destination does not claim the attempt.
 */
export async function sendCallerBookingSms(
  attempt: SmsAttempt,
  input: { callerId: string; requestedPhone: string; confirmed: boolean },
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ sent: boolean; reason: string }> {
  if (!peakSmsEnabled(env)) return { sent: false, reason: "disabled" };
  if (!peakPersonaOn(env)) return { sent: false, reason: "not_receptionist" };
  if (attempt.sent) return { sent: true, reason: "already_sent" };
  if (attempt.attempted || attempt.sending) return { sent: false, reason: "already_attempted" };

  const from = smsFromNumber(env);
  const account = String(env.TWILIO_ACCOUNT_SID || "").trim();
  const token = String(env.TWILIO_AUTH_TOKEN || "").trim();
  if (!from || !account || !token) return { sent: false, reason: "not_configured" };

  const target = resolveBookingSmsTo({
    callerId: input.callerId,
    requestedPhone: input.requestedPhone,
    confirmed: input.confirmed,
    fromLine: from,
  });
  if (!target.ok) return { sent: false, reason: target.reason };

  attempt.sending = true;
  attempt.attempted = true;
  try {
    const ok = await postTwilioMessage({
      account,
      token,
      from,
      to: target.to,
      body: bookingLinkSmsBody(),
    });
    if (!ok) return { sent: false, reason: "twilio_failed" };
    attempt.sent = true;
    attempt.to = target.to;
    return { sent: true, reason: "sent" };
  } catch (err) {
    console.error("booking sms failed", err instanceof Error ? err.message : "error");
    return { sent: false, reason: "twilio_failed" };
  } finally {
    attempt.sending = false;
  }
}
