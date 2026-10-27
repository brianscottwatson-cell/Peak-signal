/**
 * Business identities for outbound quote calls.
 * The call path looks up an id. It does not assume Colorado Hot Tub.
 * Phone numbers do not belong on an identity. The callback number is env-only.
 *
 * PEAK_OUTBOUND_IDENTITY          id used when the request omits identity
 * PEAK_OUTBOUND_IDENTITIES        JSON array of extra identities:
 *                                 [{"id":"shop","business":"Example Desk","contacts":"Alex"}]
 * Built-in ids cannot be replaced from that JSON.
 */

export type BusinessIdentity = {
  id: string;
  business: string;
  contacts: string;
};

export const CHT_IDENTITY: BusinessIdentity = {
  id: "cht",
  business: "Colorado Hot Tub",
  contacts: "Justin and Heather",
};

const BUILTIN: Record<string, BusinessIdentity> = {
  cht: CHT_IDENTITY,
};

const ID_RE = /^[a-z][a-z0-9_-]{0,31}$/;

function hasPersonal(text: string): boolean {
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) return true;
  if (/(?:\+?\d[\d().\-\s]{6,}\d)/.test(text)) return true;
  return false;
}

function cleanIdentityLine(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  const value = raw.trim().replace(/\s+/g, " ");
  if (!value || value.length > max) return "";
  if (/[\u0000-\u001f\u007f]/.test(value)) return "";
  if (hasPersonal(value)) return "";
  return value;
}

export function loadExtraIdentities(env: NodeJS.ProcessEnv = process.env): Record<string, BusinessIdentity> {
  const raw = String(env.PEAK_OUTBOUND_IDENTITIES || "").trim();
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!Array.isArray(parsed)) return {};
  const out: Record<string, BusinessIdentity> = {};
  for (const item of parsed) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim().toLowerCase() : "";
    if (!ID_RE.test(id) || BUILTIN[id] || out[id]) continue;
    const business = cleanIdentityLine(record.business, 80);
    const contacts = cleanIdentityLine(record.contacts, 80);
    if (!business || !contacts) continue;
    out[id] = { id, business, contacts };
  }
  return out;
}

export function resolveIdentity(
  explicit: string,
  env: NodeJS.ProcessEnv = process.env,
): { ok: true; identity: BusinessIdentity } | { ok: false; error: "identity_required" | "unknown_identity" } {
  const id = String(explicit || env.PEAK_OUTBOUND_IDENTITY || "").trim().toLowerCase();
  if (!id) return { ok: false, error: "identity_required" };
  if (!ID_RE.test(id)) return { ok: false, error: "unknown_identity" };
  const builtin = BUILTIN[id];
  if (builtin) return { ok: true, identity: builtin };
  const extra = loadExtraIdentities(env)[id];
  if (!extra) return { ok: false, error: "unknown_identity" };
  return { ok: true, identity: extra };
}
