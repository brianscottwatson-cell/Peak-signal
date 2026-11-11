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
delete process.env.CHT_SKIMMER_PATH;

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

const skimmerAnon = await getMetrics(`/ops/api/clients/${slug}/skimmer`);
assert(skimmerAnon.status === 401, `skimmer anon ${skimmerAnon.status}`);

const skimmerOther = await getMetrics("/ops/api/clients/peak-signal/skimmer", cookie);
assert(skimmerOther.status === 200 && skimmerOther.body.connected === false, "other slug must not receive skimmer counts");
assert(skimmerOther.body.rows.length === 0 && skimmerOther.body.snapshot === null, "other slug snapshot is empty");

const skimmerPost = await fetch(`${base}/ops/api/clients/${slug}/skimmer`, {
  method: "POST",
  headers: { Cookie: cookie, "Content-Type": "application/json" },
  body: "{}",
});
assert(skimmerPost.status === 404, `skimmer write route must not exist, got ${skimmerPost.status}`);

const skim = await getMetrics(`/ops/api/clients/${slug}/skimmer`, cookie);
assert(skim.status === 200 && skim.body.connected === true, JSON.stringify(skim.body).slice(0, 180));
assert(skim.body.source === "Skimmer, read 2026-11-11", skim.body.source);
assert(skim.body.captured_on === "2026-11-11", skim.body.captured_on);
assert(skim.body.invoice_figures === "count", "invoice figures are counts");
assert(!JSON.stringify(skim.body).includes("$"), "skimmer response must not include dollar amounts");
const srows = skim.body.rows;
assert(srows.map((r: any) => r.month).join() === "2026-08,2026-09,2026-10,2026-11", srows.map((r: any) => r.month).join());

function parts(row: any): number {
  return ["quotes_approved", "quotes_rejected", "quotes_sent_pending"]
    .map((key) => cell(row, key).value)
    .reduce((sum: number, n: number) => sum + n, 0);
}

const sAug = srows[0];
assert(cell(sAug, "quotes_created").display === "6" && cell(sAug, "quotes_created").change === null, "august quotes have no prior month");
assert(cell(sAug, "quotes_approved").display === "2", "august approved");
assert(cell(sAug, "quotes_rejected").display === "3", "august rejected");
assert(cell(sAug, "quotes_sent_pending").display === "1", "august sent-pending");
assert(parts(sAug) === 6, "august quote parts sum to created");
assert(cell(sAug, "finished_work_orders").display === "17" && cell(sAug, "finished_work_orders").change === null, "august finished");
assert(cell(sAug, "invoices_issued").display === "48" && cell(sAug, "invoices_issued").change === null, "august invoices");

const sSep = srows[1];
assert(cell(sSep, "quotes_created").change === "+21 (+350%)", cell(sSep, "quotes_created").change);
assert(cell(sSep, "quotes_approved").change === "+12 (+600%)", cell(sSep, "quotes_approved").change);
assert(cell(sSep, "quotes_rejected").change === "+6 (+200%)", cell(sSep, "quotes_rejected").change);
assert(cell(sSep, "quotes_sent_pending").change === "+3 (+300%)", cell(sSep, "quotes_sent_pending").change);
assert(parts(sSep) === 27, "september quote parts sum to created");
assert(cell(sSep, "finished_work_orders").change === "-5 (-29.4%)", cell(sSep, "finished_work_orders").change);
assert(cell(sSep, "invoices_issued").change === "+8 (+16.7%)", cell(sSep, "invoices_issued").change);

const sOct = srows[2];
assert(cell(sOct, "quotes_created").change === "-15 (-55.6%)", cell(sOct, "quotes_created").change);
assert(cell(sOct, "quotes_approved").change === "-5 (-35.7%)", cell(sOct, "quotes_approved").change);
assert(cell(sOct, "quotes_rejected").display === "0" && cell(sOct, "quotes_rejected").change === "-9 (-100%)", cell(sOct, "quotes_rejected").change);
assert(cell(sOct, "quotes_sent_pending").change === "-1 (-25%)", cell(sOct, "quotes_sent_pending").change);
assert(parts(sOct) === 12, "october quote parts sum to created");
assert(cell(sOct, "finished_work_orders").display === "25" && cell(sOct, "finished_work_orders").change === "+13 (+108.3%)", cell(sOct, "finished_work_orders").change);
assert(cell(sOct, "invoices_issued").display === "58" && cell(sOct, "invoices_issued").change === "+2 (+3.6%)", cell(sOct, "invoices_issued").change);
assert(sOct.partial === false && sOct.change_note === "", "october is a full month");

const sNov = srows[3];
assert(sNov.partial === true && sNov.partial_note === "Nov 1-11", sNov.partial_note);
assert(sNov.change_note === "not compared", "november is not compared to october");
assert(parts(sNov) === 6, "november quote parts sum to created");
assert(cell(sNov, "quotes_created").display === "6" && cell(sNov, "quotes_created").change === null, "november quotes");
assert(cell(sNov, "finished_work_orders").display === "9" && cell(sNov, "finished_work_orders").change === null, "november finished");
assert(cell(sNov, "invoices_issued").display === "44" && cell(sNov, "invoices_issued").change === null, "november invoices");
for (const key of ["quotes_created", "quotes_approved", "quotes_rejected", "quotes_sent_pending", "finished_work_orders", "invoices_issued"]) {
  assert(cell(sNov, key).change === null, `partial ${key} must not be compared`);
}

const snap = skim.body.snapshot;
assert(snap.open_work_orders.display === "5", "open work orders");
assert(snap.active_customers.display === "131", "active customers");
assert(snap.customers_on_routes.display === "36", "customers on routes");
assert(snap.outstanding_invoices.display === "9" && snap.outstanding_invoices.change === null, "outstanding invoices are a count, not a change");

const skimmerFixture = join(dir, "skimmer.json");
writeFileSync(
  skimmerFixture,
  JSON.stringify({
    source: "Skimmer, read 2026-11-11",
    captured_on: "2026-11-11",
    months: [
      {
        month: "2026-01",
        partial: false,
        quotes_created: null,
        quotes_approved: 0,
        quotes_rejected: null,
        quotes_sent_pending: 1,
        finished_work_orders: null,
        invoices_issued: 0,
      },
      {
        month: "2026-02",
        partial: false,
        quotes_created: 4,
        quotes_approved: 0,
        quotes_rejected: 2,
        quotes_sent_pending: null,
        finished_work_orders: 3,
        invoices_issued: 5,
      },
    ],
    snapshot: {
      open_work_orders: null,
      active_customers: 1,
      customers_on_routes: null,
      outstanding_invoices: 0,
    },
  }),
);
process.env.CHT_SKIMMER_PATH = skimmerFixture;
const skimCustom = await getMetrics(`/ops/api/clients/${slug}/skimmer`, cookie);
assert(skimCustom.status === 200, `skimmer fixture ${skimCustom.status}`);
assert(cell(skimCustom.body.rows[0], "quotes_created").display === "not captured", "null quote count");
assert(cell(skimCustom.body.rows[1], "quotes_created").change === null, "null previous hides quote change");
assert(cell(skimCustom.body.rows[1], "quotes_sent_pending").display === "not captured", "null current sent-pending");
assert(cell(skimCustom.body.rows[1], "invoices_issued").change === "+5", `zero invoice base shows absolute only, got ${cell(skimCustom.body.rows[1], "invoices_issued").change}`);
assert(!String(cell(skimCustom.body.rows[1], "invoices_issued").change).includes("%"), "zero invoice base has no percent");
assert(skimCustom.body.snapshot.open_work_orders.display === "not captured", "null open work orders");
assert(skimCustom.body.snapshot.outstanding_invoices.display === "0", "zero outstanding invoices is a captured count");

process.env.CHT_SKIMMER_PATH = join(dir, "skimmer-missing.json");
const skimMissing = await getMetrics(`/ops/api/clients/${slug}/skimmer`, cookie);
assert(skimMissing.status === 500 && skimMissing.body.error === "skimmer unavailable", JSON.stringify(skimMissing.body));
assert(!JSON.stringify(skimMissing.body).includes(dir), "skimmer error must not echo the file path");

delete process.env.CHT_SKIMMER_PATH;
const skimRestored = await getMetrics(`/ops/api/clients/${slug}/skimmer`, cookie);
assert(skimRestored.body.rows[2].metrics.invoices_issued.value === 58, "unset override returns the committed skimmer snapshot");

server.close();
console.log("cht-metrics tests ok");
