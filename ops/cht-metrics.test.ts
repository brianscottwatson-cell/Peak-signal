/**
 * Route and formatting behavior for the CHT Google metrics snapshot.
 * Run from ops/: npm test
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { register } from "node:module";
import express from "express";

process.env.OPS_PASSWORD = "ops-test-password";
delete process.env.CHT_METRICS_PATH;

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

await register(new URL("../voice/cht/esm-resolve-ts.mjs", import.meta.url));
const { opsRouter } = await import("./ops-router.ts");

const app = express();
app.use(express.json());
app.use("/ops", opsRouter);

const server = await new Promise<import("node:http").Server>((resolve) => {
  const s = app.listen(0, "127.0.0.1", () => resolve(s));
});
const addr = server.address();
const port = typeof addr === "object" && addr ? addr.port : 0;
const base = `http://127.0.0.1:${port}`;

async function login(): Promise<string> {
  const res = await fetch(`${base}/ops/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "ops-test-password" }),
  });
  assert(res.status === 200, `login ${res.status}`);
  const raw = res.headers.get("set-cookie") || "";
  const m = raw.match(/peak_ops=([^;]+)/);
  if (!m) throw new Error("login did not set peak_ops");
  return `peak_ops=${m[1]}`;
}

async function getMetrics(path: string, cookie?: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${path}`, {
    headers: cookie ? { Cookie: cookie, Accept: "application/json" } : { Accept: "application/json" },
  });
  const body = await res.json();
  return { status: res.status, body };
}

function cell(row: any, key: string) {
  return row.metrics[key];
}

const cookie = await login();
const slug = "colorado-hot-tub-llc";

const anon = await getMetrics(`/ops/api/clients/${slug}/metrics`);
assert(anon.status === 401, `anon status ${anon.status}`);
assert(anon.body.ok === false && anon.body.error === "unauthorized", JSON.stringify(anon.body));

const other = await getMetrics("/ops/api/clients/peak-signal/metrics", cookie);
assert(other.status === 200, `other status ${other.status}`);
assert(other.body.connected === false, "other slug must not be connected");
assert(Array.isArray(other.body.rows) && other.body.rows.length === 0, "other slug must not receive rows");

const bad = await getMetrics("/ops/api/clients/Bad_Slug/metrics", cookie);
assert(bad.status === 400, `bad slug ${bad.status}`);

const posted = await fetch(`${base}/ops/api/clients/${slug}/metrics`, {
  method: "POST",
  headers: { Cookie: cookie, "Content-Type": "application/json" },
  body: JSON.stringify({ month: "2026-12" }),
});
assert(posted.status === 404, `write route must not exist, got ${posted.status}`);

const live = await getMetrics(`/ops/api/clients/${slug}/metrics`, cookie);
assert(live.status === 200 && live.body.ok === true && live.body.connected === true, JSON.stringify(live.body).slice(0, 200));
const rows = live.body.rows;
assert(rows.map((r: any) => r.month).join() === "2026-06,2026-07,2026-08,2026-09,2026-10,2026-11", rows.map((r: any) => r.month).join());

const jun = rows[0];
assert(cell(jun, "gbp_interactions").display === "103", jun.metrics.gbp_interactions.display);
assert(cell(jun, "gbp_interactions").change === null, "first month has no prior change");
assert(cell(jun, "gbp_calls").display === "not captured", "june calls");
assert(cell(jun, "sc_impressions").display === "not captured" && cell(jun, "sc_impressions").change === null, "june impressions");
assert(jun.partial === false && jun.change_note === "", "june is a full month");
assert(jun.source === "GBP Performance read 2026-11-11", jun.source);
assert(jun.captured_on === "2026-11-11", jun.captured_on);

const jul = rows[1];
assert(cell(jul, "gbp_interactions").display === "62", "july interactions");
assert(cell(jul, "gbp_interactions").change === "-41 (-39.8%)", cell(jul, "gbp_interactions").change);
assert(cell(jul, "gbp_calls").display === "not captured" && cell(jul, "gbp_calls").change === null, "null versus null shows no change");
assert(cell(jul, "sc_clicks").display === "not captured", "july search clicks");

const aug = rows[2];
assert(cell(aug, "gbp_calls").value === 22 && cell(aug, "gbp_calls").change === null, "august calls have no july capture");
assert(cell(aug, "gbp_website_clicks").display === "41" && cell(aug, "gbp_website_clicks").change === null, "august web");
assert(cell(aug, "gbp_directions").display === "58", "august directions");
assert(cell(aug, "gbp_interactions").change === "+59 (+95.2%)", cell(aug, "gbp_interactions").change);
assert(cell(aug, "sc_clicks").display === "not captured" && cell(aug, "sc_impressions").display === "not captured", "august search not captured");
assert(aug.source === "GBP performance read 2026-10-26; Search Console export 2026-10-21", aug.source);
assert(aug.captured_on === "2026-10-26", aug.captured_on);

const sep = rows[3];
assert(sep.captured_on === "2026-10-26", "september captured_on");
assert(cell(sep, "gbp_calls").change === "-1 (-4.5%)", cell(sep, "gbp_calls").change);
assert(cell(sep, "gbp_website_clicks").change === "+6 (+14.6%)", cell(sep, "gbp_website_clicks").change);
assert(cell(sep, "gbp_directions").change === "-17 (-29.3%)", cell(sep, "gbp_directions").change);
assert(cell(sep, "gbp_interactions").change === "-12 (-9.9%)", cell(sep, "gbp_interactions").change);
assert(cell(sep, "sc_clicks").value === 65 && cell(sep, "sc_clicks").change === null, "september clicks have no august base");
assert(cell(sep, "sc_impressions").value === 1802 && cell(sep, "sc_impressions").display === "1802", "keep september impressions");
assert(cell(sep, "sc_impressions").change === null, "september impressions have no august base");

const oct = rows[4];
assert(oct.captured_on === "2026-11-11", "october captured_on");
assert(oct.source.includes("2.68K"), oct.source);
assert(cell(oct, "gbp_calls").change === "-7 (-33.3%)", cell(oct, "gbp_calls").change);
assert(cell(oct, "gbp_website_clicks").change === "+2 (+4.3%)", cell(oct, "gbp_website_clicks").change);
assert(cell(oct, "gbp_directions").change === "-1 (-2.4%)", cell(oct, "gbp_directions").change);
assert(cell(oct, "gbp_interactions").change === "-6 (-5.5%)", cell(oct, "gbp_interactions").change);
assert(cell(oct, "sc_clicks").change === "0 (0%)", cell(oct, "sc_clicks").change);
assert(cell(oct, "sc_impressions").value === 2680 && cell(oct, "sc_impressions").change === "+878 (+48.7%)", cell(oct, "sc_impressions").change);

const nov = rows[5];
assert(nov.partial === true, "november is partial");
assert(nov.partial_note === "through Nov 10", nov.partial_note);
assert(nov.change_note === "not compared", nov.change_note);
assert(nov.captured_on === "2026-11-11", "november captured_on");
assert(nov.source.includes("Nov 1-11"), nov.source);
for (const key of ["gbp_calls", "gbp_website_clicks", "gbp_directions", "gbp_interactions", "sc_clicks", "sc_impressions"]) {
  assert(cell(nov, key).change === null, `partial ${key} must not show a comparable change`);
}
assert(cell(nov, "gbp_calls").display === "6", "november calls");
assert(cell(nov, "gbp_website_clicks").display === "13", "november web");
assert(cell(nov, "gbp_directions").display === "12", "november directions");
assert(cell(nov, "gbp_interactions").display === "31", "november interactions");
assert(cell(nov, "sc_clicks").display === "24", "november search clicks");
assert(cell(nov, "sc_impressions").display === "804", "november impressions");

const serialized = JSON.stringify(live.body);
assert(!serialized.includes("$"), "metrics response must not include dollar amounts");

const dir = mkdtempSync(join(tmpdir(), "cht-metrics-"));
const fixture = join(dir, "metrics.json");
writeFileSync(
  fixture,
  JSON.stringify([
    {
      month: "2026-01",
      partial: false,
      gbp_calls: 0,
      gbp_website_clicks: 10,
      gbp_directions: null,
      gbp_interactions: 4,
      sc_clicks: null,
      sc_impressions: 100,
      source: "fixture",
      captured_on: "2026-02-01",
    },
    {
      month: "2026-02",
      partial: false,
      gbp_calls: 5,
      gbp_website_clicks: null,
      gbp_directions: 3,
      gbp_interactions: 4,
      sc_clicks: 2,
      sc_impressions: 50,
      source: "fixture",
      captured_on: "2026-03-01",
    },
    {
      month: "2026-03",
      partial: true,
      partial_note: "through the 3rd",
      gbp_calls: 8,
      gbp_website_clicks: 8,
      gbp_directions: 8,
      gbp_interactions: 8,
      sc_clicks: 8,
      sc_impressions: 8,
      source: "fixture",
      captured_on: "2026-03-04",
    },
    {
      month: "2026-04",
      partial: false,
      gbp_calls: 9,
      gbp_website_clicks: 9,
      gbp_directions: 9,
      gbp_interactions: 9,
      sc_clicks: 9,
      sc_impressions: 9,
      source: "fixture",
      captured_on: "2026-05-01",
    },
  ]),
);

process.env.CHT_METRICS_PATH = fixture;
const custom = await getMetrics(`/ops/api/clients/${slug}/metrics`, cookie);
assert(custom.status === 200, `fixture status ${custom.status}`);
const customRows = custom.body.rows;
assert(cell(customRows[1], "gbp_calls").change === "+5", `zero base shows absolute only, got ${cell(customRows[1], "gbp_calls").change}`);
assert(!String(cell(customRows[1], "gbp_calls").change).includes("%"), "zero base has no percent");
assert(cell(customRows[1], "gbp_website_clicks").display === "not captured", "current null");
assert(cell(customRows[1], "gbp_website_clicks").change === null, "null current hides the previous number's change");
assert(cell(customRows[1], "gbp_directions").display === "3" && cell(customRows[1], "gbp_directions").change === null, "null previous hides change");
assert(cell(customRows[1], "gbp_interactions").change === "0 (0%)", cell(customRows[1], "gbp_interactions").change);
assert(cell(customRows[1], "sc_impressions").change === "-50 (-50%)", cell(customRows[1], "sc_impressions").change);
assert(customRows[2].partial === true && customRows[2].change_note === "not compared", "partial row is labeled not compared");
assert(cell(customRows[2], "gbp_calls").display === "8" && cell(customRows[2], "gbp_calls").change === null, "partial suppresses change");
assert(customRows[3].partial === false, "april is complete");
assert(customRows[3].change_note === "not compared — previous month is partial", customRows[3].change_note);
assert(cell(customRows[3], "gbp_calls").change === null, "month after a partial month is not compared");

process.env.CHT_METRICS_PATH = join(dir, "missing.json");
const missing = await getMetrics(`/ops/api/clients/${slug}/metrics`, cookie);
assert(missing.status === 500 && missing.body.error === "metrics unavailable", JSON.stringify(missing.body));
assert(!JSON.stringify(missing.body).includes(dir), "error must not echo the file path");

process.env.CHT_METRICS_PATH = fixture + ".bad";
writeFileSync(process.env.CHT_METRICS_PATH, "{");
const broken = await getMetrics(`/ops/api/clients/${slug}/metrics`, cookie);
assert(broken.status === 500 && broken.body.error === "metrics unavailable", JSON.stringify(broken.body));

delete process.env.CHT_METRICS_PATH;
const restored = await getMetrics(`/ops/api/clients/${slug}/metrics`, cookie);
assert(restored.body.rows[3].metrics.sc_impressions.value === 1802, "unset override returns the committed snapshot");

server.close();
console.log("cht-metrics tests ok");
