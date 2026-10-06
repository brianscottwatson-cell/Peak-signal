#!/usr/bin/env node
/**
 * Diff the public surface on a Vercel preview against live getpeaksignal.com.
 *
 * Checks each path returns 200, HTML bodies match byte for byte, the Cloudflare
 * Web Analytics token appears once on each HTML page, and GET /api/voice is
 * proxied through to the Replit Express app.
 *
 * Preview deployments may append one vercel.live feedback script. That tag is
 * removed before the compare and the beacon count. Any other difference fails.
 *
 * Does not POST. Does not submit the contact form, send SMS, or dial.
 *
 * Usage:
 *   node scripts/check-preview-parity.mjs https://<preview>.vercel.app
 *
 * Deployment Protection: set VERCEL_AUTOMATION_BYPASS_SECRET. The value is sent
 * as x-vercel-protection-bypass and is never printed.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const liveBase = (process.env.LIVE_URL || "https://getpeaksignal.com").replace(/\/$/, "");
const previewBase = (process.argv[2] || process.env.PREVIEW_URL || "").replace(/\/$/, "");
const token = "6a067e22aec645c6b9e360ce149ae7ad";
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";

const routes = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")).rewrites
  .filter((rule) => typeof rule.destination === "string" && rule.destination.startsWith("/"))
  .map((rule) => rule.source);

const htmlPages = new Set([
  "/",
  "/index.html",
  "/contact",
  "/contact.html",
  "/privacy",
  "/privacy.html",
  "/terms",
  "/terms.html",
  "/about",
  "/about.html",
  "/ai-websites-evergreen-co",
  "/ai-automation-evergreen-colorado",
  "/ai-agents-small-business-evergreen",
]);

const apiPath = "/api/voice";

function headers() {
  const h = { accept: "*/*", "user-agent": "peak-signal-parity" };
  if (bypass) h["x-vercel-protection-bypass"] = bypass;
  return h;
}

function looksProtected(status, body) {
  const text = body.toString("utf8");
  return (
    status === 401 ||
    status === 403 ||
    /Authentication Required/i.test(text) ||
    /Vercel Authentication/i.test(text) ||
    /deployment protection/i.test(text)
  );
}

async function get(base, path) {
  const res = await fetch(`${base}${path}`, { headers: headers(), redirect: "manual" });
  const body = Buffer.from(await res.arrayBuffer());
  return {
    status: res.status,
    location: res.headers.get("location") || "",
    poweredBy: res.headers.get("x-powered-by") || "",
    body,
  };
}

const previewFeedback =
  /<script\b[^>]*\bsrc=["']https:\/\/vercel\.live\/_next-live\/feedback\/feedback\.js["'][^>]*>\s*<\/script>/gi;

function withoutPreviewFeedback(buf) {
  const text = buf.toString("utf8");
  if (!previewFeedback.test(text)) return buf;
  previewFeedback.lastIndex = 0;
  return Buffer.from(text.replace(previewFeedback, ""));
}

function shortDiff(live, preview) {
  const a = live.toString("utf8").split("\n");
  const b = preview.toString("utf8").split("\n");
  const lines = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max && lines.length < 24; i++) {
    if (a[i] !== b[i]) {
      lines.push(`  live   ${i + 1}: ${a[i] ?? ""}`);
      lines.push(`  preview ${i + 1}: ${b[i] ?? ""}`);
    }
  }
  return lines.join("\n");
}

async function main() {
  if (!previewBase) {
    console.error("Usage: node scripts/check-preview-parity.mjs https://<preview>.vercel.app");
    process.exitCode = 1;
    return;
  }

  const failures = [];
  console.log(`preview ${previewBase}`);
  console.log(`live    ${liveBase}`);
  console.log(`bypass  ${bypass ? "header set" : "none"}`);

  for (const path of routes) {
    const [live, preview] = await Promise.all([get(liveBase, path), get(previewBase, path)]);
    if (looksProtected(preview.status, preview.body)) {
      console.error(
        `BLOCKED ${path} preview HTTP ${preview.status}. Deployment Protection is in front of this URL.`,
      );
      process.exitCode = 2;
      return;
    }
    const previewBody = withoutPreviewFeedback(preview.body);
    const stripped = previewBody.length !== preview.body.length;
    const same = live.body.equals(previewBody);
    const mark = live.status === 200 && preview.status === 200 && same ? "OK  " : "FAIL";
    console.log(
      `${mark} ${path} live=${live.status} ${live.body.length}b preview=${preview.status} ${previewBody.length}b${stripped ? " (feedback tag stripped)" : ""}${same ? " identical" : " DIFFER"}`,
    );
    if (preview.status !== 200) failures.push(`${path} preview returned ${preview.status} ${preview.location}`);
    if (live.status !== 200) failures.push(`${path} live returned ${live.status}`);
    if (!same) {
      failures.push(`${path} body differs`);
      console.log(shortDiff(live.body, previewBody));
    }
    if (htmlPages.has(path)) {
      const count = previewBody.toString("utf8").split(token).length - 1;
      const beacon = count === 1 ? "OK  " : "FAIL";
      console.log(`${beacon} ${path} beacon ${count}`);
      if (count !== 1) failures.push(`${path} beacon count ${count}`);
    }
  }

  const [liveApi, previewApi] = await Promise.all([get(liveBase, apiPath), get(previewBase, apiPath)]);
  if (looksProtected(previewApi.status, previewApi.body)) {
    console.error(`BLOCKED ${apiPath} preview HTTP ${previewApi.status}. Deployment Protection is in front of this URL.`);
    process.exitCode = 2;
    return;
  }
  const needle = "Cannot GET /api/voice";
  const previewText = previewApi.body.toString("utf8");
  const reached = previewText.includes(needle);
  console.log(
    `${reached ? "OK  " : "FAIL"} GET ${apiPath} live=${liveApi.status} preview=${previewApi.status} powered-by=${previewApi.poweredBy || "-"} express=${reached}`,
  );
  if (!reached) {
    failures.push(`GET ${apiPath} did not reach Replit Express (status ${previewApi.status})`);
    console.log(previewText.slice(0, 400));
  }

  if (failures.length) {
    console.error(`Parity failed (${failures.length}):`);
    for (const item of failures) console.error(`- ${item}`);
    process.exitCode = 1;
    return;
  }
  console.log(`OK: ${routes.length} public paths identical, beacon once per HTML page, GET ${apiPath} reached Replit.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
