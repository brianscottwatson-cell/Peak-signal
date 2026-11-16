/**
 * US NANP checks shared by booking and quote calls.
 * Area code and exchange cannot start with 0 or 1. N11 codes are rejected.
 * This file has no phone numbers in it.
 */

const US_E164 = /^\+1[2-9]\d{2}[2-9]\d{6}$/;

export function isUsE164(raw: string): boolean {
  const value = String(raw || "").trim();
  if (!US_E164.test(value)) return false;
  const area = value.slice(2, 5);
  const exchange = value.slice(5, 8);
  if (area.endsWith("11") || exchange.endsWith("11")) return false;
  return true;
}

/** Accepts +1 E.164, 10 digits, or 11 digits starting with 1. Anything else is empty. */
export function normalizeUsE164(raw: string): string {
  const trimmed = String(raw || "").trim();
  if (isUsE164(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  const candidate = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith("1") ? `+${digits}` : "";
  return candidate && isUsE164(candidate) ? candidate : "";
}
