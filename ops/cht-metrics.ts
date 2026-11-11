/**
 * Colorado Hot Tub Google metrics snapshot.
 *
 * The JSON sits next to this module and is imported so the Autoscale esbuild
 * bundle (dist/index.mjs) contains the rows. build.mjs copies only ops.html
 * and cht.html into dist/ops/; it does not copy JSON. A runtime read of
 * data/cht-metrics.json would be missing after `pnpm run build`.
 *
 * CHT_METRICS_PATH overrides the bundled file for tests. Production leaves it unset.
 */
import { readFileSync } from "node:fs";
import seed from "./cht-metrics.json" with { type: "json" };

export const METRIC_KEYS = [
  "gbp_calls",
  "gbp_website_clicks",
  "gbp_directions",
  "gbp_interactions",
  "sc_clicks",
  "sc_impressions",
] as const;

export type MetricKey = (typeof METRIC_KEYS)[number];

export type MetricRow = {
  month: string;
  partial: boolean;
  partial_note: string;
  source: string;
  captured_on: string;
  metrics: Record<MetricKey, number | null>;
};

export type PresentedMetric = {
  value: number | null;
  display: string;
  change: string | null;
};

export type PresentedRow = {
  month: string;
  partial: boolean;
  partial_note: string;
  source: string;
  captured_on: string;
  change_note: string;
  metrics: Record<MetricKey, PresentedMetric>;
};

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function parseCount(value: unknown, label: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`metrics ${label} must be a number or null`);
  }
  return value;
}

function parseRow(raw: unknown, index: number): MetricRow {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`metrics row ${index} must be an object`);
  }
  const row = raw as Record<string, unknown>;
  const month = String(row.month || "");
  if (!MONTH.test(month)) throw new Error(`metrics row ${index} has a bad month`);
  if (row.partial !== undefined && typeof row.partial !== "boolean") {
    throw new Error(`metrics row ${index} partial must be boolean`);
  }
  const partial = row.partial === true;
  const partialNote = row.partial_note == null ? "" : String(row.partial_note);
  if (partial && !partialNote.trim()) {
    throw new Error(`metrics row ${index} partial month needs partial_note`);
  }
  const source = String(row.source || "").trim();
  if (!source) throw new Error(`metrics row ${index} needs a source`);
  const captured = String(row.captured_on || "");
  if (!DAY.test(captured)) throw new Error(`metrics row ${index} has a bad captured_on`);
  const metrics = {} as Record<MetricKey, number | null>;
  for (const key of METRIC_KEYS) {
    metrics[key] = parseCount(row[key], `${month} ${key}`);
  }
  return {
    month,
    partial,
    partial_note: partialNote.trim(),
    source,
    captured_on: captured,
    metrics,
  };
}

export function parseMetricRows(raw: unknown): MetricRow[] {
  if (!Array.isArray(raw)) throw new Error("metrics file must be an array");
  const rows = raw.map((row, index) => parseRow(row, index));
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.month)) throw new Error(`duplicate metrics month ${row.month}`);
    seen.add(row.month);
  }
  rows.sort((a, b) => a.month.localeCompare(b.month));
  return rows;
}

export function formatMetricValue(value: number | null): string {
  if (value === null) return "not captured";
  if (Number.isInteger(value)) return String(value);
  return String(value);
}

/** Absolute and percent versus the previous month. No percent when the base is 0. */
export function formatMetricChange(current: number, previous: number): string {
  const delta = current - previous;
  const absolute = (delta > 0 ? "+" : "") + String(delta);
  if (previous === 0) return absolute;
  const pctRaw = Math.round(((current - previous) / previous) * 1000) / 10;
  const pct = Object.is(pctRaw, -0) ? 0 : pctRaw;
  const pctText = (pct > 0 ? "+" : "") + (Number.isInteger(pct) ? String(pct) : pct.toFixed(1));
  return `${absolute} (${pctText}%)`;
}

export function presentMetricRows(rows: MetricRow[]): PresentedRow[] {
  const ordered = [...rows].sort((a, b) => a.month.localeCompare(b.month));
  return ordered.map((row, index) => {
    const prev = index > 0 ? ordered[index - 1] : undefined;
    const blocked = row.partial || prev?.partial === true;
    let changeNote = "";
    if (prev && blocked) {
      changeNote = row.partial ? "not compared" : "not compared — previous month is partial";
    }
    const metrics = {} as Record<MetricKey, PresentedMetric>;
    for (const key of METRIC_KEYS) {
      const value = row.metrics[key];
      const previous = prev ? prev.metrics[key] : null;
      const change =
        !prev || blocked || value === null || previous === null
          ? null
          : formatMetricChange(value, previous);
      metrics[key] = { value, display: formatMetricValue(value), change };
    }
    return {
      month: row.month,
      partial: row.partial,
      partial_note: row.partial_note,
      source: row.source,
      captured_on: row.captured_on,
      change_note: changeNote,
      metrics,
    };
  });
}

export function loadMetricRows(): MetricRow[] {
  const override = process.env.CHT_METRICS_PATH;
  if (override && override.trim()) {
    return parseMetricRows(JSON.parse(readFileSync(override, "utf8")));
  }
  return parseMetricRows(seed);
}
