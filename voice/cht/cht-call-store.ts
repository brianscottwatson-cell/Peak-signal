/**
 * CHT inbound call log — shared JSON store.
 *
 * cht-voice writes; /ops/c/colorado-hot-tub-llc reads.
 * Path: process.env.CHT_CALLS_PATH || <cwd>/data/cht-calls.json
 *
 * Do not invent rows. Only persist real Twilio CallSids (CA…).
 * Autoscale disk is instance-local — a republish may wipe this file.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const CHT_CALLS_SLUG = "colorado-hot-tub-llc";
const MAX_CALLS = 100;

export type ChtCallTurn = { role: "agent" | "caller"; text: string };

export type ChtCallRecord = {
  callSid: string;
  name: string;
  phone: string;
  need: string;
  summary: string;
  recordingUrl: string;
  timestamp: string;
  updatedAt: string;
  turns: ChtCallTurn[];
};

type StoreFile = {
  version: 1;
  updatedAt: string;
  calls: ChtCallRecord[];
};

export function chtCallsPath(): string {
  return process.env.CHT_CALLS_PATH || join(process.cwd(), "data", "cht-calls.json");
}

export function isPersistableCallSid(sid: string): boolean {
  return /^CA[0-9a-f]{32}$/i.test(String(sid || "").trim());
}

function emptyStore(): StoreFile {
  return { version: 1, updatedAt: new Date().toISOString(), calls: [] };
}

function normalizeTurn(t: any): ChtCallTurn | null {
  const role = t?.role === "agent" || t?.role === "caller" ? t.role : null;
  const text = String(t?.text || "").trim();
  if (!role || !text) return null;
  return { role, text: text.slice(0, 2000) };
}

export function readChtCalls(): ChtCallRecord[] {
  const path = chtCallsPath();
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (!raw || !Array.isArray(raw.calls)) return [];
    return raw.calls
      .filter((c: any) => c && isPersistableCallSid(c.callSid))
      .map((c: any) => ({
        callSid: String(c.callSid),
        name: String(c.name || ""),
        phone: String(c.phone || ""),
        need: String(c.need || ""),
        summary: String(c.summary || ""),
        recordingUrl: String(c.recordingUrl || ""),
        timestamp: String(c.timestamp || c.updatedAt || ""),
        updatedAt: String(c.updatedAt || c.timestamp || ""),
        turns: Array.isArray(c.turns) ? c.turns.map(normalizeTurn).filter(Boolean) as ChtCallTurn[] : [],
      }));
  } catch (e: any) {
    console.error("[cht-calls] read failed", e?.message || e);
    return [];
  }
}

function writeChtCalls(calls: ChtCallRecord[]) {
  const path = chtCallsPath();
  mkdirSync(dirname(path), { recursive: true });
  const body: StoreFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    calls,
  };
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(body, null, 2), "utf8");
  renameSync(tmp, path);
}

function keep(incoming: string | undefined, prev: string): string {
  const v = incoming != null ? String(incoming).trim() : "";
  return v || prev;
}

/** Upsert one live cht-voice call. Returns null if the sid is not a real Twilio CallSid. */
export function persistChtCall(partial: {
  callSid: string;
  name?: string;
  phone?: string;
  need?: string;
  summary?: string;
  recordingUrl?: string;
  turns?: ChtCallTurn[];
}): ChtCallRecord | null {
  const callSid = String(partial.callSid || "").trim();
  if (!isPersistableCallSid(callSid)) return null;

  const now = new Date().toISOString();
  const calls = readChtCalls();
  const idx = calls.findIndex((c) => c.callSid === callSid);
  const prev = idx >= 0
    ? calls[idx]
    : {
        callSid,
        name: "",
        phone: "",
        need: "",
        summary: "",
        recordingUrl: "",
        timestamp: now,
        updatedAt: now,
        turns: [],
      };

  const incomingTurns = Array.isArray(partial.turns)
    ? partial.turns.map(normalizeTurn).filter(Boolean) as ChtCallTurn[]
    : [];

  const next: ChtCallRecord = {
    ...prev,
    name: keep(partial.name, prev.name),
    phone: keep(partial.phone, prev.phone),
    need: keep(partial.need, prev.need),
    summary: keep(partial.summary, prev.summary),
    recordingUrl: keep(partial.recordingUrl, prev.recordingUrl),
    updatedAt: now,
    turns: incomingTurns.length ? incomingTurns.slice(-40) : prev.turns,
  };

  if (idx >= 0) calls[idx] = next;
  else calls.unshift(next);

  calls.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  writeChtCalls(calls.slice(0, MAX_CALLS));
  return next;
}

export function listChtCalls(limit = 10): ChtCallRecord[] {
  const n = Math.max(1, Math.min(50, Number(limit) || 10));
  return readChtCalls().slice(0, n);
}
