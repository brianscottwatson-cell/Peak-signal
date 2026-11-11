/**
 * Colorado Hot Tub Skimmer counts. Invoice fields are counts, never amounts.
 *
 * Imported so the Autoscale esbuild bundle contains the snapshot. build.mjs
 * does not copy JSON into dist. CHT_SKIMMER_PATH overrides the file in tests.
 */
import { readFileSync } from "node:fs";
import seed from "./cht-skimmer.json" with { type: "json" };
import {
  formatMetricValue,
  presentCountRows,
  type CountRow,
  type PresentedCountRow,
  type PresentedMetric,
} from "./cht-metrics";

export const SKIMMER_SOURCE = "Skimmer, read 2026-11-11";

export const QUOTE_KEYS = [
  "quotes_created",
  "quotes_approved",
  "quotes_rejected",
  "quotes_sent_pending",
] as const;

export const JOB_KEYS = ["finished_work_orders"] as const;

export const INVOICE_KEYS = ["invoices_issued"] as const;

export const SKIMMER_KEYS = [...QUOTE_KEYS, ...JOB_KEYS, ...INVOICE_KEYS] as const;

export type SkimmerKey = (typeof SKIMMER_KEYS)[number];

export const SNAPSHOT_KEYS = [
  "open_work_orders",
  "active_customers",
  "customers_on_routes",
  "outstanding_invoices",
] as const;

export type SnapshotKey = (typeof SNAPSHOT_KEYS)[number];

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function parseCount(value: unknown, label: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`skimmer ${label} must be a number or null`);
  }
  return value;
}

function parseMonth(raw: unknown, index: number, source: string, capturedOn: string): CountRow<SkimmerKey> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`skimmer row ${index} must be an object`);
  }
  const row = raw as Record<string, unknown>;
  const month = String(row.month || "");
  if (!MONTH.test(month)) throw new Error(`skimmer row ${index} has a bad month`);
  if (row.partial !== undefined && typeof row.partial !== "boolean") {
    throw new Error(`skimmer row ${index} partial must be boolean`);
  }
  const partial = row.partial === true;
  const partialNote = row.partial_note == null ? "" : String(row.partial_note).trim();
  if (partial && !partialNote) throw new Error(`skimmer row ${index} partial month needs partial_note`);
  const metrics = {} as Record<SkimmerKey, number | null>;
  for (const key of SKIMMER_KEYS) {
    metrics[key] = parseCount(row[key], `${month} ${key}`);
  }
  return {
    month,
    partial,
    partial_note: partialNote,
    source,
    captured_on: capturedOn,
    metrics,
  };
}

export type SkimmerSnapshot = Record<SnapshotKey, PresentedMetric>;

export type SkimmerSnapshotFile = {
  source: string;
  captured_on: string;
  rows: PresentedCountRow<SkimmerKey>[];
  snapshot: SkimmerSnapshot;
  invoice_figures: "count";
};

function parseSnapshot(raw: unknown): SkimmerSnapshot {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("skimmer snapshot must be an object");
  }
  const row = raw as Record<string, unknown>;
  const snapshot = {} as SkimmerSnapshot;
  for (const key of SNAPSHOT_KEYS) {
    const value = parseCount(row[key], key);
    snapshot[key] = { value, display: formatMetricValue(value), change: null };
  }
  return snapshot;
}

export function parseSkimmer(raw: unknown): SkimmerSnapshotFile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("skimmer file must be an object");
  }
  const file = raw as Record<string, unknown>;
  const source = String(file.source || "").trim();
  if (!source) throw new Error("skimmer source is missing");
  const captured = String(file.captured_on || "");
  if (!DAY.test(captured)) throw new Error("skimmer captured_on is bad");
  if (!Array.isArray(file.months)) throw new Error("skimmer months must be an array");
  const months = file.months.map((row, index) => parseMonth(row, index, source, captured));
  const seen = new Set<string>();
  for (const row of months) {
    if (seen.has(row.month)) throw new Error(`duplicate skimmer month ${row.month}`);
    seen.add(row.month);
  }
  return {
    source,
    captured_on: captured,
    rows: presentCountRows(months, SKIMMER_KEYS),
    snapshot: parseSnapshot(file.snapshot),
    invoice_figures: "count",
  };
}

export function loadSkimmer(): SkimmerSnapshotFile {
  const override = process.env.CHT_SKIMMER_PATH;
  if (override && override.trim()) {
    return parseSkimmer(JSON.parse(readFileSync(override, "utf8")));
  }
  return parseSkimmer(seed);
}
